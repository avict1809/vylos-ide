export class AudioProcessor {
    private audioContext: AudioContext | null = null;
    private stream: MediaStream | null = null;
    private processor: ScriptProcessorNode | null = null;
    private onAudioData: (data: string) => void;

    constructor(onAudioData: (data: string) => void) {
        this.onAudioData = onAudioData;
    }

    async start() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioContext = new AudioContext({ sampleRate: 16000 });

            const source = this.audioContext.createMediaStreamSource(this.stream);
            // ScriptProcessorNode is used for downsampling and PCM conversion
            // 4096 buffer size is a good balance for latency and stability
            this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

            source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

            this.processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                // Convert Float32Array to Int16Array (PCM 16-bit)
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    // Clamp and scale to 16-bit integer range
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                // Convert to Base64
                const base64 = this.arrayBufferToBase64(pcmData.buffer);
                this.onAudioData(base64);
            };

        } catch (e) {
            console.error("Microphone access denied or error", e);
        }
    }

    stop() {
        this.processor?.disconnect();
        this.stream?.getTracks().forEach(track => track.stop());
        this.audioContext?.close();

        this.processor = null;
        this.stream = null;
        this.audioContext = null;
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
