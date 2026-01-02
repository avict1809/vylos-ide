import { AudioProcessor } from './audio-processor';

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const HOST = 'generativelanguage.googleapis.com';
const URI = `wss://${HOST}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

let ws: WebSocket | null = null;
let audioProcessor: AudioProcessor | null = null;

export async function startVoiceSession(onMessage: (text: string) => void) {
    if (!API_KEY) {
        console.error("API Key missing");
        return;
    }

    try {
        ws = new WebSocket(URI);

        ws.onopen = () => {
            console.log("Connected to Gemini Live");
            // Send initial config if needed (model, voice settings)
            ws?.send(JSON.stringify({
                setup: {
                    model: "models/gemini-2.0-flash-exp",
                    generationConfig: { responseModalities: ["AUDIO"] }
                }
            }));

            // Start Audio
            audioProcessor = new AudioProcessor((base64Audio) => {
                ws?.send(JSON.stringify({
                    realtimeInput: {
                        mediaChunks: [{
                            mimeType: "audio/pcm", // Or appropriate format
                            data: base64Audio
                        }]
                    }
                }));
            });
            audioProcessor.start();
        };

        ws.onmessage = async (event) => {
            // Handle audio response blob or text
            if (event.data instanceof Blob) {
                // Play audio
                const audioUrl = URL.createObjectURL(event.data);
                const audio = new Audio(audioUrl);
                audio.play();
            } else {
                const msg = JSON.parse(event.data);
                if (msg.serverContent?.modelTurn?.parts) {
                    // Handle text parts or audio parts in JSON
                }
            }
        };

        ws.onerror = (e) => console.error("WebSocket Error:", e);
        ws.onclose = () => console.log("Voice Session Ended");

    } catch (e) {
        console.error("Failed to start voice session", e);
    }
}

export function stopVoiceSession() {
    audioProcessor?.stop();
    ws?.close();
    ws = null;
    audioProcessor = null;
}
