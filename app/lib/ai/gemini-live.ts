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
            ws?.send(JSON.stringify({
                setup: {
                    model: "models/gemini-2.0-flash-exp",
                    generation_config: {
                        response_modalities: ["AUDIO"],
                        speech_config: {
                            voice_config: {
                                prebuilt_voice_config: {
                                    voice_name: "Aoide" // A pleasant tutor voice
                                }
                            }
                        }
                    }
                }
            }));

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

        ws.onmessage = async (event) => {
            const msg = JSON.parse(event.data);

            // Handle audio parts from Gemini
            if (msg.serverContent?.modelTurn?.parts) {
                for (const part of msg.serverContent.modelTurn.parts) {
                    if (part.inlineData?.mimeType === 'audio/pcm;rate=24000') {
                        // Play PCM audio (would need a more robust buffer player in real app, but this is the hook)
                        // For now, let's assume the AudioProcessor or a separate player handles it.
                    }
                    if (part.text) {
                        onMessage(part.text);
                    }
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
