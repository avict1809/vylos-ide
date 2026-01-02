export class AudioProcessor {
    private mediaRecorder: MediaRecorder | null = null;
    private audioContext: AudioContext | null = null;
    private onAudioData: (data: string) => void;

    constructor(onAudioData: (data: string) => void) {
        this.onAudioData = onAudioData;
    }

    async start() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioContext = new AudioContext({ sampleRate: 16000 });

            const source = this.audioContext.createMediaStreamSource(stream);
            // Further processing to PCM 16kHz mono would go here using AudioWorklet or ScriptProcessor
            // For simplicity in this plan, accessing MediaRecorder
            this.mediaRecorder = new MediaRecorder(stream);
            this.mediaRecorder.ondataavailable = async (e) => {
                if (e.data.size > 0) {
                    const buffer = await e.data.arrayBuffer();
                    const base64 = this.arrayBufferToBase64(buffer);
                    this.onAudioData(base64);
                }
            };
            this.mediaRecorder.start(100); // 100ms chunks
        } catch (e) {
            console.error("Microphone access denied", e);
        }
    }

    stop() {
        this.mediaRecorder?.stop();
        this.audioContext?.close();
    }

    private arrayBufferToBase64(buffer: ArrayBuffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }
}
