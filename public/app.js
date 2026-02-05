import { AudioAnalyzer } from './audio-analyzer.js';
import { MidiHandler } from './midi-handler.js';
import { HQMidiPlayer } from './midi-player-hq.js';
import { Visualizers } from './visualizers.js';
import { VideoExporter } from './video-exporter.js';

/**
 * Main Application Module
 */
class AudioVisualizerApp {
    constructor() {
        this.canvas = document.getElementById('visualizer');
        this.ctx = this.canvas.getContext('2d');
        this.analyzer = new AudioAnalyzer(2048);
        this.midiHandler = new MidiHandler();
        this.hqMidiPlayer = new HQMidiPlayer(); // High quality MIDI player
        this.useHQPlayer = true; // Toggle between old and new player
        this.visualizers = [];
        this.currentModeIndex = 0;
        this.isPlaying = false;
        this.isMidiMode = false;
        this.videoExporter = new VideoExporter(this.canvas, this);

        // Element Selectors - Updated to match index.html
        this.elements = {
            playBtn: document.getElementById('playBtn'),
            fileInput: document.getElementById('audioFile'),
            modeBtns: document.querySelectorAll('.mode-btn'),
            trackName: document.getElementById('trackName'),
            toast: document.getElementById('toast'),
            progress: document.getElementById('progress'),
            trackTime: document.getElementById('trackTime'),
            controls: document.getElementById('controls'),
            dropZone: document.getElementById('dropZone'),
            settingsPanel: document.getElementById('settingsPanel'),
            settingsToggle: document.getElementById('settingsToggle'),
            closeSettings: document.getElementById('closeSettings'),
            fpsCounter: document.getElementById('fps')
        };

        this.lastTime = 0;
        this.frameCount = 0;
        this.fpsUpdateTime = 0;
    }

    async init() {
        window.onerror = (msg) => this.showToast(`Hata: ${msg}`);
        try {
            this.onResize();
            window.addEventListener('resize', () => this.onResize());
            this.initVisualizers();

            this.setupEventListeners();
            this.setupSettingsListeners();
            this.setupExportListeners();

            // Audio will be initialized on first user gesture
            requestAnimationFrame((t) => this.animate(t));
            console.log('App Initialized');
        } catch (e) {
            console.error('Init error:', e);
            this.showToast('Başlatma Hatası');
        }
    }

    initVisualizers() {
        console.log('🖼️ App: Initializing visualizers...');
        const V = Visualizers;
        if (!V) {
            console.error('❌ App: Visualizers registry not found!');
            this.showToast('Başlatma Hatası: Visualizers missing');
            return;
        }

        try {
            this.visualizers = [
                new V.SpectrumAnalyzer(this.canvas),
                new V.WaveformVisualizer(this.canvas),
                new V.ParticleSystem(this.canvas),
                new V.GeometricPatterns(this.canvas),
                new V.Landscape3D(this.canvas),
                new V.RoadRunner(this.canvas),
                new V.Runner2(this.canvas),
                new V.RoadRunner3(this.canvas)
            ];
            console.log(`✅ App: ${this.visualizers.length} visualizers ready.`);
        } catch (e) {
            console.error('❌ App: Failed to create visualizers:', e);
            this.showToast('Görselleştiriciler hazırlanamadı');
        }
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
                if (this.hqMidiPlayer) this.hqMidiPlayer.setVolume(vol);
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

        // Settings Toggle
        if (this.elements.settingsToggle) {
            this.elements.settingsToggle.addEventListener('click', () => {
                this.elements.settingsPanel.classList.toggle('open');
            });
        }

        if (this.elements.closeSettings) {
            this.elements.closeSettings.addEventListener('click', () => {
                this.elements.settingsPanel.classList.remove('open');
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

        // Restart Button
        const restartBtn = document.getElementById('restartBtn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                if (this.isMidiMode) {
                    if (this.useHQPlayer) {
                        this.hqMidiPlayer.stop();
                        this.hqMidiPlayer.play(0);
                    } else {
                        this.midiHandler.stop();
                        this.midiHandler.play(0);
                    }
                } else {
                    if (this.analyzer.seek) this.analyzer.seek(0);
                }
                this.isPlaying = true;
                this.updatePlayBtnState();
                this.showToast('Baştan başlatıldı');
            });
        }

        // Next Track Button
        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                // Get list of files from the file input
                const files = this.elements.fileInput?.files;
                if (files && files.length > 1) {
                    // Find current and play next
                    const currentName = this.elements.trackName?.innerText;
                    let nextIndex = 0;
                    for (let i = 0; i < files.length; i++) {
                        if (files[i].name.replace(/\.[^/.]+$/, "") === currentName) {
                            nextIndex = (i + 1) % files.length;
                            break;
                        }
                    }
                    this.processFile(files[nextIndex]);
                } else {
                    this.showToast('Sırada başka parça yok');
                }
            });
        }

        // Progress Bar Seek
        if (this.elements.progress) {
            this.elements.progress.addEventListener('input', (e) => {
                const percent = parseFloat(e.target.value) / 100;
                let duration = 0;

                if (this.isMidiMode) {
                    duration = this.useHQPlayer ? this.hqMidiPlayer.getDuration() : this.midiHandler.midi?.duration || 0;
                    const seekTime = percent * duration;

                    if (this.useHQPlayer) {
                        this.hqMidiPlayer.seek(seekTime);
                    } else {
                        this.midiHandler.stop();
                        this.midiHandler.play(seekTime);
                    }
                } else {
                    if (this.analyzer.duration && this.analyzer.seek) {
                        this.analyzer.seek(percent * this.analyzer.duration);
                    }
                }
            });
        }
    }

    setupSettingsListeners() {
        // Sensitivity
        const sensRange = document.getElementById('sensitivityRange');
        const sensVal = document.getElementById('sensitivityValue');
        if (sensRange) {
            sensRange.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.visualizers.forEach(v => v.sensitivityMultiplier = val);
                if (sensVal) sensVal.innerText = val.toFixed(1);
            });
        }

        // Glow
        const glowRange = document.getElementById('glowRange');
        const glowVal = document.getElementById('glowValue');
        if (glowRange) {
            glowRange.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.visualizers.forEach(v => v.glowMultiplier = val);
                if (glowVal) glowVal.innerText = val.toFixed(1);
            });
        }

        // Speed
        const speedRange = document.getElementById('speedRange');
        const speedVal = document.getElementById('speedValue');
        if (speedRange) {
            speedRange.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.visualizers.forEach(v => v.speedMultiplier = val);
                if (speedVal) speedVal.innerText = val.toFixed(1);
            });
        }

        // Particles
        const partRange = document.getElementById('particlesRange');
        const partVal = document.getElementById('particlesValue');
        if (partRange) {
            partRange.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                this.visualizers.forEach(v => {
                    if (v.constructor.name === 'ParticleSystem') {
                        v.maxParticles = val;
                        if (v.initParticles) v.initParticles();
                    }
                });
                if (partVal) partVal.innerText = val;
            });
        }

        // Trails Toggle (Comet Tail)
        const trailsToggle = document.getElementById('trailsToggle');
        if (trailsToggle) {
            trailsToggle.addEventListener('change', (e) => {
                const val = e.target.checked;
                this.visualizers.forEach(v => {
                    if (v.constructor.name === 'RoadRunner3') {
                        v.showTrails = val;
                    }
                });
            });
        }

        // Adjustment Buttons (+ / -)
        document.querySelectorAll('.adj-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.target;
                const dir = parseInt(btn.dataset.dir);
                let input;
                if (target === 'sensitivity') input = document.getElementById('sensitivityRange');
                else if (target === 'glow') input = document.getElementById('glowRange');
                else if (target === 'speed') input = document.getElementById('speedRange');
                else if (target === 'particles') input = document.getElementById('particlesRange');

                if (input) {
                    const step = parseFloat(input.step) || 1;
                    input.value = parseFloat(input.value) + (step * dir);
                    input.dispatchEvent(new Event('input'));
                }
            });
        });

        // Color Themes
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const primary = btn.dataset.primary;
                const secondary = btn.dataset.secondary;

                // Update CSS variables
                document.documentElement.style.setProperty('--accent-primary', primary);
                document.documentElement.style.setProperty('--accent-secondary', secondary);

                // Update active state
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update visualizers
                this.visualizers.forEach(v => {
                    v.colorTheme = { primary, secondary };
                });
            });
        });
    }

    setupExportListeners() {
        const startBtn = document.getElementById('startExportBtn');
        const status = document.getElementById('exportStatus');
        const ratioSelect = document.getElementById('exportRatio');
        const qualitySelect = document.getElementById('exportQuality');

        if (startBtn) {
            startBtn.addEventListener('click', async () => {
                if (!this.videoExporter.isRecording) {
                    const options = {
                        ratio: ratioSelect?.value || '16:9',
                        quality: qualitySelect?.value || 'high'
                    };
                    try {
                        await this.videoExporter.startRecording(options);
                        startBtn.innerHTML = '<span class="btn-icon">⏹️</span> Kaydı Durdur';
                        startBtn.classList.add('recording');
                        status.style.display = 'flex';
                    } catch (e) {
                        console.error('Export failed:', e);
                        this.showToast('Kayıt Başlatılamadı');
                    }
                } else {
                    this.videoExporter.stopRecording();
                    startBtn.innerHTML = '<span class="btn-icon">⏺️</span> Kaydı Başlat';
                    startBtn.classList.remove('recording');
                    status.style.display = 'none';
                    this.showToast('Video Kaydedildi');
                }
            });
        }
    }

    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) this.processFile(file);
    }

    async processFile(file) {
        console.log('🚀 App: Processing file:', file.name);
        this.showToast('Yükleniyor...');

        // Track Name
        if (this.elements.trackName) {
            this.elements.trackName.innerText = file.name.replace(/\.[^/.]+$/, "");
        }

        // Hide drop zone, show controls
        if (this.elements.dropZone) this.elements.dropZone.style.display = 'none';
        if (this.elements.controls) this.elements.controls.style.display = 'flex';

        if (file.name.toLowerCase().endsWith('.mid') || file.name.toLowerCase().endsWith('.midi')) {
            console.log('🎹 App: MIDI format detected.');
            this.isMidiMode = true;

            if (this.useHQPlayer) {
                // Use new HQ MIDI Player (Magenta.js)
                console.log('🎵 Using HQ MIDI Player (SGM+ SoundFont)...');
                await this.hqMidiPlayer.init();
                const result = await this.hqMidiPlayer.loadMidi(file);

                // Store midi data for visualization and process notes
                this.midiHandler.midi = result.midi;
                this.midiHandler.processNotes(); // Process notes for getAnalysis()

                if (this.elements.trackTime) {
                    this.elements.trackTime.innerText = `0:00 / ${this.formatTime(result.duration)}`;
                }
                console.log('✅ App: HQ MIDI ready.');
            } else {
                // Fallback to old player
                await this.analyzer.init();
                await this.midiHandler.init(this.analyzer.audioContext);
                const midi = await this.midiHandler.loadMidiFile(file);
                if (this.elements.trackTime) {
                    this.elements.trackTime.innerText = `0:00 / ${this.formatTime(midi.duration)}`;
                }
                console.log('✅ App: MIDI processing complete.');
            }
            this.startPlayback();
        } else {
            console.log('🎵 App: Standard audio format detected.');
            this.isMidiMode = false;
            await this.analyzer.init();
            await this.analyzer.loadAudio(file);
            console.log('✅ App: Audio loading complete.');
            this.startPlayback();
        }
    }

    startPlayback() {
        if (this.isMidiMode) {
            if (this.useHQPlayer) {
                this.hqMidiPlayer.play();
            } else {
                this.midiHandler.play();
            }
        } else {
            if (this.analyzer.play) this.analyzer.play();
        }
        this.isPlaying = true;
        this.updatePlayBtnState();
        this.showToast('Oynatılıyor');
    }

    togglePlayback() {
        if (this.isPlaying) {
            if (this.isMidiMode) {
                this.useHQPlayer ? this.hqMidiPlayer.pause() : this.midiHandler.pause();
            } else {
                if (this.analyzer.pause) this.analyzer.pause();
            }
        } else {
            if (this.isMidiMode) {
                this.useHQPlayer ? this.hqMidiPlayer.resume() : this.midiHandler.play(this.midiHandler.pauseTime);
            } else {
                if (this.analyzer.play) this.analyzer.play();
            }
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
        this.currentModeIndex = index;
        this.elements.modeBtns.forEach((btn, i) => btn.classList.toggle('active', i === index));
        this.showToast(`Görsel: ${this.visualizers[index].getName()}`);
    }

    onResize() {
        if (this.videoExporter && this.videoExporter.isRecording) {
            this.visualizers.forEach(v => v.resize(this.canvas.width, this.canvas.height));
            return;
        }
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.visualizers.forEach(v => v.resize(this.canvas.width, this.canvas.height));
    }

    animate(time) {
        if (!this.lastTime) this.lastTime = time;
        const dt = (time - this.lastTime) / 1000 || 0.008;
        this.lastTime = time;

        if (this.videoExporter && this.videoExporter.isRecording) {
            const recordTimeEl = document.getElementById('recordTime');
            if (recordTimeEl) recordTimeEl.innerText = this.videoExporter.getRecordingTime();
        }

        this.frameCount++;
        if (time > this.fpsUpdateTime + 1000) {
            const currentFps = Math.round((this.frameCount * 1000) / (time - this.fpsUpdateTime));
            if (this.elements.fpsCounter) this.elements.fpsCounter.innerText = `${currentFps} FPS`;
            this.frameCount = 0;
            this.fpsUpdateTime = time;
        }

        let currentTime = 0;
        let duration = 0;
        if (this.isMidiMode) {
            currentTime = this.useHQPlayer ? this.hqMidiPlayer.getCurrentTime() : this.midiHandler.getCurrentTime();
            duration = this.useHQPlayer ? this.hqMidiPlayer.getDuration() : (this.midiHandler.midi?.duration || 0);
        }
        const analysis = this.isMidiMode ? this.midiHandler.getAnalysis(currentTime) : this.analyzer.analyze();
        analysis.currentTime = currentTime;

        // Update progress bar and time display
        if (this.isMidiMode && this.isPlaying && duration > 0) {
            // Update progress bar
            if (this.elements.progress) {
                this.elements.progress.value = (currentTime / duration) * 100;
            }
            // Update time display
            if (this.elements.trackTime) {
                this.elements.trackTime.innerText = `${this.formatTime(currentTime)} / ${this.formatTime(duration)}`;
            }
        }

        if (this.frameCount % 180 === 0 && this.isMidiMode) {
            console.log(`⏱️ App Clock [MIDI]: ${currentTime.toFixed(3)}s`);
        }

        // Central Background Clearing
        this.ctx.fillStyle = '#10111a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.visualizers[this.currentModeIndex]) {
            try {
                this.visualizers[this.currentModeIndex].update(analysis, dt);
                this.visualizers[this.currentModeIndex].render();
            } catch (e) {
                if (this.frameCount % 60 === 0) console.error(`❌ App: Visualizer Error [${this.currentModeIndex}]:`, e);
            }
        }

        // Test Draw (confirm canvas is working)
        if (this.isPlaying) {
            this.ctx.fillStyle = analysis.isBeat ? '#fff' : 'rgba(255,255,255,0.2)';
            this.ctx.fillRect(10, 10, 2, 2);
        }

        requestAnimationFrame((t) => this.animate(t));
    }

    showToast(message) {
        if (!this.elements.toast) return;
        this.elements.toast.innerText = message;
        this.elements.toast.classList.add('show');
        setTimeout(() => this.elements.toast.classList.remove('show'), 2000);
    }

    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
}

window.app = new AudioVisualizerApp();
window.app.init();
