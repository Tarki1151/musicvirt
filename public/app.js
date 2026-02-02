import { AudioAnalyzer } from './audio-analyzer.js';
import { MidiHandler } from './midi-handler.js';
import { Visualizers } from './visualizers.js';

/**
 * Main Application Module
 */
class AudioVisualizerApp {
    constructor() {
        this.canvas = document.getElementById('visualizer');
        this.ctx = this.canvas.getContext('2d');
        this.analyzer = new AudioAnalyzer(2048);
        this.midiHandler = new MidiHandler();
        this.visualizers = [];
        this.currentModeIndex = 0;
        this.isPlaying = false;
        this.isMidiMode = false;

        // Element Selectors - Updated to match index.html
        this.elements = {
            playBtn: document.getElementById('playBtn'),
            fileInput: document.getElementById('audioFile'),
            modeBtns: document.querySelectorAll('.mode-btn'),
            toast: document.getElementById('toast'),
            progress: document.getElementById('progress'),
            trackTime: document.getElementById('trackTime'),
            controls: document.getElementById('controls'),
            dropZone: document.getElementById('dropZone')
        };

        this.lastTime = 0;
    }

    async init() {
        window.onerror = (msg) => this.showToast(`Hata: ${msg}`);
        try {
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());
            this.initVisualizers();
            this.setupEventListeners();
            await this.midiHandler.init(this.analyzer.audioContext);
            requestAnimationFrame((t) => this.animate(t));
            console.log('App Initialized');
        } catch (e) {
            console.error('Init error:', e);
            this.showToast('Başlatma Hatası');
        }
    }

    initVisualizers() {
        const V = Visualizers;
        this.visualizers = [
            new V.SpectrumAnalyzer(this.canvas),
            new V.WaveformVisualizer(this.canvas),
            new V.ParticleSystem(this.canvas),
            new V.GeometricPatterns(this.canvas),
            new V.Landscape3D(this.canvas),
            new V.RoadRunner(this.canvas),
            new V.Runner2(this.canvas)
        ];
    }

    setupEventListeners() {
        if (this.elements.playBtn) {
            this.elements.playBtn.addEventListener('click', () => this.togglePlayback());
        }

        if (this.elements.fileInput) {
            this.elements.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }

        this.elements.modeBtns.forEach((btn, index) => {
            btn.addEventListener('click', () => {
                this.switchMode(index);
                console.log('Switched to mode:', index);
            });
        });

        // Volume
        const volSlider = document.getElementById('volume');
        if (volSlider) {
            volSlider.addEventListener('input', (e) => {
                const vol = parseFloat(e.target.value);
                this.analyzer.setVolume(vol);
                if (this.midiHandler) this.midiHandler.setVolume(vol);
            });
        }

        // Fullscreen
        const fsBtn = document.getElementById('fullscreenBtn');
        if (fsBtn) {
            fsBtn.addEventListener('click', () => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen();
                } else {
                    document.exitFullscreen();
                }
            });
        }

        // Drop Zone support
        const dz = this.elements.dropZone;
        if (dz) {
            dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
            dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
            dz.addEventListener('drop', (e) => {
                e.preventDefault();
                dz.classList.remove('dragover');
                const file = e.dataTransfer.files[0];
                if (file) this.processFile(file);
            });
        }
    }

    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) this.processFile(file);
    }

    async processFile(file) {
        this.showToast('Yükleniyor...');

        // Hide drop zone, show controls
        if (this.elements.dropZone) this.elements.dropZone.style.display = 'none';
        if (this.elements.controls) this.elements.controls.style.display = 'flex';

        if (file.name.toLowerCase().endsWith('.mid') || file.name.toLowerCase().endsWith('.midi')) {
            this.isMidiMode = true;
            const midi = await this.midiHandler.loadMidiFile(file);
            if (this.elements.trackTime) {
                this.elements.trackTime.innerText = `0:00 / ${this.formatTime(midi.duration)}`;
            }
            this.startPlayback();
        } else {
            this.isMidiMode = false;
            await this.analyzer.loadAudio(file);
            this.startPlayback();
        }
    }

    startPlayback() {
        if (this.isMidiMode) {
            this.midiHandler.play();
        } else {
            this.analyzer.play();
        }
        this.isPlaying = true;
        this.updatePlayBtnState();
        this.showToast('Oynatılıyor');
    }

    togglePlayback() {
        if (this.isPlaying) {
            this.isMidiMode ? this.midiHandler.pause() : this.analyzer.pause();
        } else {
            this.isMidiMode ? this.midiHandler.play(this.midiHandler.pauseTime) : this.analyzer.play();
        }
        this.isPlaying = !this.isPlaying;
        this.updatePlayBtnState();
    }

    updatePlayBtnState() {
        if (!this.elements.playBtn) return;
        const playIcon = this.elements.playBtn.querySelector('.play-icon');
        const pauseIcon = this.elements.playBtn.querySelector('.pause-icon');
        if (this.isPlaying) {
            if (playIcon) playIcon.style.display = 'none';
            if (pauseIcon) pauseIcon.style.display = 'block';
        } else {
            if (playIcon) playIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
        }
    }

    switchMode(index) {
        if (index < 0 || index >= this.visualizers.length) return;

        console.log(`Switching to mode: ${index} (${this.visualizers[index].getName()})`);
        this.currentModeIndex = index;

        // Update UI
        this.elements.modeBtns.forEach((btn, i) => {
            if (i === index) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        this.showToast(`Görsel: ${this.visualizers[index].getName()}`);
    }

    resizeCanvas() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.visualizers.forEach(v => {
            if (v && v.resize) v.resize(this.canvas.width, this.canvas.height);
        });
    }

    animate(time) {
        if (!this.lastTime) this.lastTime = time;
        const dt = (time - this.lastTime) / 1000 || 0.016;
        this.lastTime = time;

        let analysis;
        if (this.isMidiMode && this.isPlaying) {
            const mTime = this.midiHandler.getCurrentTime();
            analysis = this.midiHandler.getAnalysis(mTime);

            // Update Progress
            const duration = this.midiHandler.midi ? this.midiHandler.midi.duration : 1;
            const progress = (mTime / duration) * 100;
            if (this.elements.progress) this.elements.progress.value = progress;
            if (this.elements.trackTime) {
                this.elements.trackTime.innerText = `${this.formatTime(mTime)} / ${this.formatTime(duration)}`;
            }
        } else {
            analysis = this.analyzer.analyze();
        }

        // Background Clear
        this.ctx.fillStyle = 'rgba(10, 11, 15, 0.4)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const viz = this.visualizers[this.currentModeIndex];
        if (viz) {
            viz.update(analysis, dt);
            viz.render();
        }

        requestAnimationFrame((t) => this.animate(t));
    }

    formatTime(sec) {
        if (!sec || isNaN(sec)) return "0:00";
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    showToast(msg) {
        if (!this.elements.toast) return;
        this.elements.toast.innerText = msg;
        this.elements.toast.classList.add('show');
        setTimeout(() => this.elements.toast.classList.remove('show'), 2000);
    }
}

// Start the app
window.app = new AudioVisualizerApp();
window.app.init();
