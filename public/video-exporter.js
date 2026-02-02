import * as Tone from 'tone';

/**
 * VideoExporter
 * Captures Canvas and Tone.js shared audio into a high-quality video.
 * Optimized for robustness against context mismatches and 1-second truncation.
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

        this.isRecording = true;
        console.log('📹 Export: Starting recording session...');

        // 1. Prepare Resolution
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

        // Apply resolution
        this.canvas.width = targetW;
        this.canvas.height = targetH;
        this.app.visualizers.forEach(v => v.resize(targetW, targetH));

        // Let the canvas "settle" for 100ms before capturing the stream
        // This prevents the "codec description change" warning in Chrome
        await new Promise(r => setTimeout(r, 100));

        // 2. Prepare Streams
        // Use 30fps for stability (especially on Mac/Chrome at high resolutions)
        const canvasStream = this.canvas.captureStream(30);

        // Standardize Audio Context
        const audioContext = this.app.analyzer.audioContext || Tone.context.rawContext;
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        // Create recording destination
        const dest = audioContext.createMediaStreamDestination();

        // Connect Tone.js (MIDI)
        try {
            Tone.getDestination().connect(dest);
            console.log('🔗 Export: Hooked Tone.js Output');
        } catch (e) {
            console.warn('⚠️ Export: Tone.js hook failed:', e);
        }

        // Connect Analyzer (Standard Audio)
        if (this.app.analyzer && this.app.analyzer.gainNode) {
            try {
                this.app.analyzer.gainNode.connect(dest);
                console.log('🔗 Export: Hooked Standard Audio');
            } catch (e) {
                console.warn('⚠️ Export: Analyzer hook failed:', e);
            }
        }

        const audioTracks = dest.stream.getAudioTracks();
        audioTracks.forEach(t => t.enabled = true);

        // 3. Construct Unified Stream
        this.stream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...audioTracks
        ]);

        this.chunks = [];

        // 4. Codec Selection (Aggressive avc3 prioritization to avoid avc1 warnings)
        const mimeTypes = [
            'video/mp4;codecs="avc3.42E01E, mp4a.40.2"', // H.264 High Profile (AVC3)
            'video/mp4;codecs="avc3.4D401E, mp4a.40.2"', // H.264 Main Profile (AVC3)
            'video/mp4;codecs=avc3',
            'video/mp4;codecs=avc1,mp4a.40.2',
            'video/mp4',
            'video/webm;codecs=vp9,opus',
            'video/webm'
        ];

        let selectedMime = '';
        for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                selectedMime = type;
                break;
            }
        }
        console.log('🎬 Export: Final Chosen Format ->', selectedMime);

        // 5. Initialize Recorder
        this.recorder = new MediaRecorder(this.stream, {
            mimeType: selectedMime,
            videoBitsPerSecond: options.quality === '2k' ? 12000000 : 8000000,
            audioBitsPerSecond: 192000
        });

        this.recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                this.chunks.push(e.data);
                if (this.chunks.length % 5 === 0) {
                    console.log(`📹 Export: Recording... (Chunks: ${this.chunks.length})`);
                }
            }
        };

        this.recorder.onerror = (e) => {
            console.error('❌ Export Recorder Error:', e.error);
        };

        this.recorder.onstop = () => {
            console.log(`📹 Export: Finalizing ${this.chunks.length} chunks...`);
            this.saveVideo(selectedMime.split(';')[0].split('/')[1]);
            this.canvas.width = this.originalWidth;
            this.canvas.height = this.originalHeight;
            this.app.onResize();
        };

        // Warm-up delay to ensure stream is stable
        setTimeout(() => {
            if (this.recorder.state === 'inactive') {
                this.recorder.start(1000);
                this.startTime = Date.now();
                console.log('✅ Export: Recording ACTIVE');
            }
        }, 1000);
    }

    stopRecording() {
        if (!this.isRecording) return;
        this.recorder.stop();
        this.isRecording = false;
        console.log('📹 Export: Recording stopped.');
    }

    saveVideo(extension) {
        const ext = extension === 'webm' ? 'webm' : 'mp4';
        const blob = new Blob(this.chunks, { type: this.recorder.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `Visualizer-Export-${timestamp}.${ext}`;
        a.click();
        window.URL.revokeObjectURL(url);
        console.log(`✅ Export: File saved: ${a.download}`);
    }

    getRecordingTime() {
        if (!this.isRecording) return '00:00';
        const ms = Date.now() - this.startTime;
        const sec = Math.floor(ms / 1000) % 60;
        const min = Math.floor(ms / 60000);
        return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }
}
