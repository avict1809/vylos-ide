import { AudioProcessor } from './audio-processor';

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const HOST = 'generativelanguage.googleapis.com';
const URI = `wss://${HOST}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
// NOTE: the -12-2025 preview build is broken for this app's configuration:
// it accepts the session, then kills it mid-response with 1007
// "The audio content type (CONTENT_TYPE_AUDIO) is not supported for this
// model configuration" once real mic audio streams during a model turn.
// The -09-2025 build handles the identical session correctly (verified 2026-07-12).
const MODEL = 'models/gemini-2.5-flash-native-audio-preview-09-2025';

// Constants for Gemini's audio format
const RESPONSE_SAMPLE_RATE = 24000;

export type TutorEvent =
    | { type: 'connected' }
    | { type: 'closed'; reason?: string }
    | { type: 'error'; message: string }
    | { type: 'tutor-transcript'; text: string }
    | { type: 'user-transcript'; text: string }
    | { type: 'tool-start'; name: string; args: Record<string, any> }
    | { type: 'tool-done'; name: string }
    | { type: 'turn-complete' }
    | { type: 'interrupted' };

export interface VoiceSessionOptions {
    voiceName: string;
    systemInstruction: string;
    toolDeclarations: object[];
    executeTool: (name: string, args: Record<string, any>) => Promise<object>;
    onEvent: (event: TutorEvent) => void;
}

/**
 * One live connection to Gemini. Everything that can outlive a session —
 * socket callbacks, mic chunks, in-flight tool calls, queued audio — is tagged
 * with the session it belongs to, so a torn-down session can never speak or
 * act through its replacement.
 */
interface LiveSession {
    id: number;
    voiceName: string;
    ws: WebSocket | null;
    audioProcessor: AudioProcessor | null;
    player: PCMPlayer | null;
    /**
     * Bumped on every interruption. Audio and tool results carrying an older
     * generation belong to the reply the learner just talked over, and are
     * dropped instead of being mixed into the new one.
     */
    generation: number;
    closed: boolean;
}

let current: LiveSession | null = null;
let nextSessionId = 1;

/** True only while `session` is the session the app is actually listening to. */
function isCurrent(session: LiveSession): boolean {
    return current === session && !session.closed;
}

/**
 * Handles playing raw PCM audio chunks with proper scheduling to avoid pops/clicks.
 */
class PCMPlayer {
    private audioContext: AudioContext;
    private nextStartTime: number = 0;
    // Chunks are scheduled ahead of real time, so an interruption has to be able
    // to reach back and cancel the ones that have not been heard yet.
    private scheduled = new Set<AudioBufferSourceNode>();

    constructor() {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
            sampleRate: RESPONSE_SAMPLE_RATE,
        });
    }

    playChunk(base64Data: string) {
        if (this.audioContext.state === 'closed') return;

        // 1. Convert Base64 to ArrayBuffer
        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // 2. Convert 16-bit PCM (Little Endian) to Float32 for Web Audio API
        // Ensure the buffer is aligned for Int16Array (even length)
        const buffer = bytes.buffer;
        const int16Array = new Int16Array(buffer, 0, Math.floor(buffer.byteLength / 2));
        if (int16Array.length === 0) return;
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }

        // 3. Create Audio Buffer and schedule playback
        const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, RESPONSE_SAMPLE_RATE);
        audioBuffer.getChannelData(0).set(float32Array);

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        // Synchronize chunks so they play seamlessly back-to-back
        const currentTime = this.audioContext.currentTime;
        if (this.nextStartTime < currentTime) {
            this.nextStartTime = currentTime;
        }

        this.scheduled.add(source);
        source.onended = () => {
            source.disconnect();
            this.scheduled.delete(source);
        };

        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
    }

    /**
     * Silences the reply in progress: stops every chunk that is still playing or
     * queued and clears the schedule so the next reply starts immediately.
     * Without this the interrupted answer keeps talking over the new one.
     */
    flush() {
        for (const source of this.scheduled) {
            source.onended = null;
            try {
                source.stop();
            } catch {
                // Already stopped or never started — nothing to cancel.
            }
            source.disconnect();
        }
        this.scheduled.clear();
        this.nextStartTime = this.audioContext.state === 'closed' ? 0 : this.audioContext.currentTime;
    }

    stop() {
        this.flush();
        if (this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
    }
}

export async function startVoiceSession(options: VoiceSessionOptions) {
    const { voiceName, systemInstruction, toolDeclarations, executeTool, onEvent } = options;

    if (!API_KEY) {
        onEvent({ type: 'error', message: 'Gemini API key missing. Add NEXT_PUBLIC_GEMINI_API_KEY to .env.' });
        return;
    }

    // Tear down any previous session first
    stopVoiceSession();

    const session: LiveSession = {
        id: nextSessionId++,
        voiceName,
        ws: null,
        audioProcessor: null,
        player: new PCMPlayer(),
        generation: 0,
        closed: false,
    };
    current = session;

    // A superseded session must stay silent: its late events would otherwise
    // reset the status of the session that replaced it.
    const emit = (event: TutorEvent) => {
        if (isCurrent(session)) onEvent(event);
    };

    const startMic = async () => {
        const processor = new AudioProcessor((base64Audio) => {
            // Only the live session may hold the microphone open
            if (!isCurrent(session)) return;
            if (session.ws?.readyState === WebSocket.OPEN) {
                session.ws.send(JSON.stringify({
                    realtime_input: {
                        media_chunks: [{
                            mime_type: 'audio/pcm;rate=16000',
                            data: base64Audio
                        }]
                    }
                }));
            }
        });
        session.audioProcessor = processor;
        await processor.start();
        // getUserMedia can resolve after the learner already ended the session
        if (!isCurrent(session)) processor.stop();
    };

    const handleToolCall = async (toolCall: any, generation: number) => {
        const functionCalls: any[] = toolCall.functionCalls || toolCall.function_calls || [];
        const socket = session.ws;
        const responses = [];

        for (const fc of functionCalls) {
            // The learner interrupted (or ended the session) mid-tool-call: the
            // server already cancelled this turn, so stop acting on its behalf.
            if (!isCurrent(session) || session.generation !== generation) return;

            emit({ type: 'tool-start', name: fc.name, args: fc.args || {} });
            let result: object;
            try {
                result = await executeTool(fc.name, fc.args || {});
            } catch (e) {
                result = { error: e instanceof Error ? e.message : 'Tool execution failed' };
            }
            emit({ type: 'tool-done', name: fc.name });
            responses.push({ id: fc.id, name: fc.name, response: { result } });
        }

        // Answering a cancelled turn — or answering into a socket that has since
        // been replaced — makes the model produce a second, unrelated reply.
        if (!isCurrent(session) || session.generation !== generation || session.ws !== socket) return;
        if (socket?.readyState === WebSocket.OPEN && responses.length > 0) {
            socket.send(JSON.stringify({ tool_response: { function_responses: responses } }));
        }
    };

    try {
        const ws = new WebSocket(URI);
        session.ws = ws;

        ws.onopen = () => {
            const sendSetup = () => {
                if (!isCurrent(session) || session.ws !== ws) return;
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        setup: {
                            model: MODEL,
                            generation_config: {
                                response_modalities: ['AUDIO'],
                                speech_config: {
                                    voice_config: {
                                        prebuilt_voice_config: {
                                            voice_name: session.voiceName
                                        }
                                    }
                                }
                            },
                            system_instruction: {
                                parts: [{ text: systemInstruction }]
                            },
                            tools: [{ function_declarations: toolDeclarations }],
                            // Transcribe the tutor's speech (for captions) and the learner's
                            output_audio_transcription: {},
                            input_audio_transcription: {},
                        }
                    }));
                } else {
                    setTimeout(sendSetup, 100);
                }
            };
            sendSetup();
        };

        ws.onmessage = async (event) => {
            if (!isCurrent(session)) return;
            // Captured before the parse so we can tell whether this message was
            // already on the wire when the learner interrupted.
            const generation = session.generation;

            // Handle both text (JSON) and binary (Blob) messages
            let msg;
            if (event.data instanceof Blob) {
                const text = await event.data.text();
                if (!isCurrent(session)) return;
                try {
                    msg = JSON.parse(text);
                } catch (e) {
                    return; // Non-JSON blob; ignore
                }
            } else {
                msg = JSON.parse(event.data);
            }

            if (msg.setupComplete || msg.setup_complete) {
                startMic();
                emit({ type: 'connected' });
                return;
            }

            const toolCall = msg.toolCall || msg.tool_call;
            if (toolCall) {
                handleToolCall(toolCall, generation);
                return;
            }

            const serverContent = msg.serverContent || msg.server_content;
            if (!serverContent) return;

            // Server-side interruption: the learner started talking over the tutor.
            // Handled before anything else in this message so the cut-off reply is
            // silenced immediately and nothing after it is attributed to the new turn.
            if (serverContent.interrupted) {
                session.generation++;
                session.player?.flush();
                emit({ type: 'interrupted' });
                return;
            }

            // Everything below belongs to the reply that was just interrupted
            if (session.generation !== generation) return;

            // Captions for what the tutor is saying
            const outTranscript = serverContent.outputTranscription || serverContent.output_transcription;
            if (outTranscript?.text) {
                emit({ type: 'tutor-transcript', text: outTranscript.text });
            }
            const inTranscript = serverContent.inputTranscription || serverContent.input_transcription;
            if (inTranscript?.text) {
                emit({ type: 'user-transcript', text: inTranscript.text });
            }

            const modelTurn = serverContent.modelTurn || serverContent.model_turn;
            if (modelTurn?.parts) {
                for (const part of modelTurn.parts) {
                    if (part.text) {
                        emit({ type: 'tutor-transcript', text: part.text });
                    }
                    const audioData = part.inlineData?.data || part.inline_data?.data;
                    if (audioData) {
                        session.player?.playChunk(audioData);
                    }
                }
            }

            if (serverContent.turnComplete || serverContent.turn_complete) {
                emit({ type: 'turn-complete' });
            }
        };

        ws.onerror = () => {
            emit({ type: 'error', message: 'Voice connection error. Check your internet and API key.' });
        };

        ws.onclose = (e) => {
            if (!isCurrent(session)) return;
            const reason = e.code === 1006
                ? 'Connection closed unexpectedly (check API key / network).'
                : e.reason || undefined;
            stopVoiceSession();
            onEvent({ type: 'closed', reason });
        };

    } catch (e) {
        emit({ type: 'error', message: e instanceof Error ? e.message : 'Failed to start voice session' });
        stopVoiceSession();
    }
}

export function stopVoiceSession() {
    const session = current;
    current = null;
    if (!session || session.closed) return;

    session.closed = true;
    session.audioProcessor?.stop();
    session.player?.stop();

    const ws = session.ws;
    if (ws) {
        // Detach every handler: a closing socket still delivers messages that are
        // already in flight, and those would otherwise play through the next session.
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
            ws.close();
        }
    }

    session.ws = null;
    session.audioProcessor = null;
    session.player = null;
}
