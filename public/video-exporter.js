import * as Tone from 'tone';

/**
 * VideoExporter
 * Captures Canvas and Tone.js shared audio into a high-quality video.
 */
export class VideoExporter {
    constructor(canvas, app) {
        this.canvas = canvas;
        this.app = app;
        this.recorder = null;
        this.chunks = [];
        this.isRecording = false;
        this.stream = null;
        this.startTime = 0;
        this.originalWidth = canvas.width;
        this.originalHeight = canvas.height;
    }

    async startRecording(options = { ratio: '16:9', quality: '1080p' }) {
        if (this.isRecording) return;

        // 1. Set State EARLY to prevent app.onResize() from resetting size
        this.isRecording = true;

        console.log('📹 Export: Starting recording session...');

        // 1. Set Resolution
        this.originalWidth = window.innerWidth;
        this.originalHeight = window.innerHeight;

        let targetW = 1920;
        let targetH = 1080;

        if (options.ratio === '9:16') {
            targetW = options.quality === '2k' ? 1440 : 1080;
            targetH = options.quality === '2k' ? 2560 : 1920;
        } else {
            targetW = options.quality === '2k' ? 2560 : 1920;
            targetH = options.quality === '2k' ? 1440 : 1080;
        }

        // Apply resolution to canvas
        this.canvas.width = targetW;
        this.canvas.height = targetH;

        // Force visualizers to adapt to new size
        this.app.visualizers.forEach(v => v.resize(targetW, targetH));

        // 2. Prepare Streams
        const canvasStream = this.canvas.captureStream(60);

        // Capture Audio - Use the main app's context to avoid "Overload resolution failed" (cross-context)
        const audioContext = this.app.analyzer.audioContext;
        if (!audioContext) {
            console.error('❌ Export Error: AudioContext not found.');
            this.isRecording = false;
            return;
        }

        const dest = audioContext.createMediaStreamDestination();

        // Connect Tone.js (MIDI) - Ensure we use the raw destination connection
        try {
            Tone.Destination.connect(dest);
        } catch (e) {
            console.warn('⚠️ Export: Could not connect Tone.js to recorder:', e);
        }

        // Connect Standard Audio (Analyzer) if active
        if (this.app.analyzer && this.app.analyzer.gainNode) {
            try {
                this.app.analyzer.gainNode.connect(dest);
            } catch (e) {
                console.warn('⚠️ Export: Could not connect Analyzer to recorder:', e);
            }
        }

        const audioTrack = dest.stream.getAudioTracks()[0];

        if (audioTrack) {
            canvasStream.addTrack(audioTrack);
        }

        this.stream = canvasStream;
        this.chunks = [];

        // 3. Initialize Recorder
        // Try to find a supported high-quality codec
        const mimeTypes = [
            'video/mp4;codecs=avc1',
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ];

        let selectedMime = '';
        for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                selectedMime = type;
                break;
            }
        }

        this.recorder = new MediaRecorder(canvasStream, {
            mimeType: selectedMime,
            videoBitsPerSecond: options.quality === '2k' ? 12000000 : 8000000 // 8-12 Mbps
        });

        this.recorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.chunks.push(e.data);
        };

        this.recorder.onstop = () => {
            this.saveVideo(selectedMime.split(';')[0].split('/')[1]);
            // Restore original size
            this.canvas.width = this.originalWidth;
            this.canvas.height = this.originalHeight;
            this.app.onResize();
        };

        this.recorder.start(100); // Capture in 100ms slices for stability
        this.startTime = Date.now();
        console.log('✅ Export: Recording started at', targetW, 'x', targetH);
    }

    stopRecording() {
        if (!this.isRecording) return;
        this.recorder.stop();
        this.isRecording = false;
        console.log('📹 Export: Recording stopped.');
    }

    saveVideo(extension) {
        // Fallback extension if generic
        const ext = extension === 'webm' ? 'webm' : 'mp4';
        const blob = new Blob(this.chunks, { type: this.recorder.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `Visualizer-Export-${timestamp}.${ext}`;
        a.click();
        window.URL.revokeObjectURL(url);
        console.log(`✅ Export: Video saved as ${a.download}`);
    }

    getRecordingTime() {
        if (!this.isRecording) return '00:00';
        const ms = Date.now() - this.startTime;
        const sec = Math.floor(ms / 1000) % 60;
        const min = Math.floor(ms / 60000);
        return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }
}
