import { AudioProcessor } from './audio-processor';

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const HOST = 'generativelanguage.googleapis.com';
const URI = `wss://${HOST}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

// Constants for Gemini's audio format
const RESPONSE_SAMPLE_RATE = 24000;

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
            console.log(`PCMPlayer: nextStartTime adjusted to current time: ${this.nextStartTime.toFixed(3)}s`);
        }

        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
        console.log(`PCMPlayer: Scheduled chunk (duration: ${audioBuffer.duration.toFixed(3)}s) to start at ${this.nextStartTime.toFixed(3)}s.`);
    }

    reset() {
        console.log("PCMPlayer: Resetting audio playback schedule due to interruption.");
        // Reset the schedule so new audio plays immediately
        this.nextStartTime = this.audioContext.currentTime;
    }

    stop() {
        if (this.audioContext.state !== 'closed') {
            console.log("PCMPlayer: Closing AudioContext.");
            this.audioContext.close();
        }
    }
}

export async function startVoiceSession(onMessage: (text: string) => void) {
    if (!API_KEY) {
        console.error("API Key missing");
        return;
    }

    // Initialize the player
    pcmPlayer = new PCMPlayer();

    const startMic = () => {
        audioProcessor = new AudioProcessor((base64Audio) => {
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    realtime_input: {
                        media_chunks: [{
                            mime_type: "audio/pcm;rate=16000",
                            data: base64Audio
                        }]
                    }
                }));
            }
        });
        audioProcessor.start();
    };

    try {
        ws = new WebSocket(URI);

        ws.onopen = () => {
            console.log("WebSocket opened, checking state...");

            // Guard: Wait until the state is explicitly OPEN (1)
            const sendSetup = () => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    console.log("Connection verified OPEN. Sending setup...");
                    ws.send(JSON.stringify({
                        setup: {
                            model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
                            generation_config: {
                                response_modalities: ["AUDIO"],
                                speech_config: {
                                    voice_config: {
                                        prebuilt_voice_config: {
                                            voice_name: "Zephyr"
                                        }
                                    }
                                }
                            }
                        }
                    }));
                } else {
                    console.warn("Socket not ready yet, retrying in 100ms...");
                    setTimeout(sendSetup, 100);
                }
            };

            sendSetup();
        };

        ws.onmessage = async (event) => {
            // Handle both text (JSON) and binary (Blob) messages
            let msg;

            if (event.data instanceof Blob) {
                // Convert Blob to text for JSON parsing
                const text = await event.data.text();
                try {
                    msg = JSON.parse(text);
                } catch (e) {
                    console.warn("Received non-JSON Blob, treating as binary audio data");
                    // If it's not JSON, it might be raw audio - skip for now
                    return;
                }
            } else {
                msg = JSON.parse(event.data);
            }

            console.log("Gemini Live Message:", msg);

            if (msg.setupComplete) {
                console.log("Gemini Live Setup Complete!");
                startMic();
            }

            const serverContent = msg.serverContent || msg.server_content;
            if (serverContent?.modelTurn?.parts || serverContent?.model_turn?.parts) {
                const parts = serverContent.modelTurn?.parts || serverContent.model_turn.parts;
                for (const part of parts) {
                    // 1. Handle Transcripts
                    if (part.text) {
                        console.log("Gemini Transcript:", part.text);
                        onMessage(part.text);
                    }
                    // 2. Handle Audio Playback
                    const audioData = part.inlineData?.data || part.inline_data?.data;
                    if (audioData) {
                        pcmPlayer?.playChunk(audioData);
                    }
                }
            }

            // Handle Server-side interruptions (Stops playback if you start talking)
            if (serverContent?.interrupted) {
                console.log("Interrupted by user");
                pcmPlayer?.reset();
            }
        };

        ws.onerror = (e) => {
            console.error("WebSocket Error:", e);
            console.error("WebSocket State:", ws?.readyState);
            console.error("API Key Present:", !!API_KEY);
            console.error("Connection URI:", URI.replace(API_KEY || '', 'API_KEY_HIDDEN'));
        };

        ws.onclose = (e) => {
            console.log(`Voice Session Ended. Code: ${e.code}, Reason: ${e.reason}`);
            if (e.code === 1006) {
                console.error("Connection closed abnormally. This usually indicates:");
                console.error("1. Invalid API key");
                console.error("2. Network/firewall blocking WebSocket");
                console.error("3. API endpoint unavailable");
            }
            stopVoiceSession();
        };

    } catch (e) {
        console.error("Failed to start voice session", e);
    }
}

export function stopVoiceSession() {
    audioProcessor?.stop();
    pcmPlayer?.stop();
    if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.close();
    }
    ws = null;
    audioProcessor = null;
    pcmPlayer = null;
}