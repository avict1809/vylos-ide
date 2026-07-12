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

let ws: WebSocket | null = null;
let audioProcessor: AudioProcessor | null = null;
let pcmPlayer: PCMPlayer | null = null;

/**
 * Handles playing raw PCM audio chunks with proper scheduling to avoid pops/clicks.
 */
class PCMPlayer {
    private audioContext: AudioContext;
    private nextStartTime: number = 0;

    constructor() {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
            sampleRate: RESPONSE_SAMPLE_RATE,
        });
    }

    async playChunk(base64Data: string) {
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

        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
    }

    reset() {
        // Reset the schedule so new audio plays immediately
        this.nextStartTime = this.audioContext.currentTime;
    }

    stop() {
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

    pcmPlayer = new PCMPlayer();

    const startMic = () => {
        audioProcessor = new AudioProcessor((base64Audio) => {
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    realtime_input: {
                        media_chunks: [{
                            mime_type: 'audio/pcm;rate=16000',
                            data: base64Audio
                        }]
                    }
                }));
            }
        });
        audioProcessor.start();
    };

    const handleToolCall = async (toolCall: any) => {
        const functionCalls: any[] = toolCall.functionCalls || toolCall.function_calls || [];
        const responses = [];

        for (const fc of functionCalls) {
            onEvent({ type: 'tool-start', name: fc.name, args: fc.args || {} });
            let result: object;
            try {
                result = await executeTool(fc.name, fc.args || {});
            } catch (e) {
                result = { error: e instanceof Error ? e.message : 'Tool execution failed' };
            }
            onEvent({ type: 'tool-done', name: fc.name });
            responses.push({ id: fc.id, name: fc.name, response: { result } });
        }

        if (ws?.readyState === WebSocket.OPEN && responses.length > 0) {
            ws.send(JSON.stringify({ tool_response: { function_responses: responses } }));
        }
    };

    try {
        ws = new WebSocket(URI);

        ws.onopen = () => {
            const sendSetup = () => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        setup: {
                            model: MODEL,
                            generation_config: {
                                response_modalities: ['AUDIO'],
                                speech_config: {
                                    voice_config: {
                                        prebuilt_voice_config: {
                                            voice_name: voiceName
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
            // Handle both text (JSON) and binary (Blob) messages
            let msg;
            if (event.data instanceof Blob) {
                const text = await event.data.text();
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
                onEvent({ type: 'connected' });
                return;
            }

            const toolCall = msg.toolCall || msg.tool_call;
            if (toolCall) {
                handleToolCall(toolCall);
                return;
            }

            const serverContent = msg.serverContent || msg.server_content;
            if (!serverContent) return;

            // Captions for what the tutor is saying
            const outTranscript = serverContent.outputTranscription || serverContent.output_transcription;
            if (outTranscript?.text) {
                onEvent({ type: 'tutor-transcript', text: outTranscript.text });
            }
            const inTranscript = serverContent.inputTranscription || serverContent.input_transcription;
            if (inTranscript?.text) {
                onEvent({ type: 'user-transcript', text: inTranscript.text });
            }

            const modelTurn = serverContent.modelTurn || serverContent.model_turn;
            if (modelTurn?.parts) {
                for (const part of modelTurn.parts) {
                    if (part.text) {
                        onEvent({ type: 'tutor-transcript', text: part.text });
                    }
                    const audioData = part.inlineData?.data || part.inline_data?.data;
                    if (audioData) {
                        pcmPlayer?.playChunk(audioData);
                    }
                }
            }

            // Server-side interruption: user started talking over the tutor
            if (serverContent.interrupted) {
                pcmPlayer?.reset();
                onEvent({ type: 'interrupted' });
            }

            if (serverContent.turnComplete || serverContent.turn_complete) {
                onEvent({ type: 'turn-complete' });
            }
        };

        ws.onerror = () => {
            onEvent({ type: 'error', message: 'Voice connection error. Check your internet and API key.' });
        };

        ws.onclose = (e) => {
            const reason = e.code === 1006
                ? 'Connection closed unexpectedly (check API key / network).'
                : e.reason || undefined;
            stopVoiceSession();
            onEvent({ type: 'closed', reason });
        };

    } catch (e) {
        onEvent({ type: 'error', message: e instanceof Error ? e.message : 'Failed to start voice session' });
    }
}

export function stopVoiceSession() {
    audioProcessor?.stop();
    pcmPlayer?.stop();
    if (ws) {
        // Prevent the close handler from re-entering stopVoiceSession
        ws.onclose = null;
        if (ws.readyState !== WebSocket.CLOSED) {
            ws.close();
        }
    }
    ws = null;
    audioProcessor = null;
    pcmPlayer = null;
}
