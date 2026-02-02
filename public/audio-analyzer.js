/**
 * Audio Analyzer Module
 * Web Audio API based real-time audio analysis
 */
export class AudioAnalyzer {
    constructor(fftSize = 2048) {
        this.fftSize = fftSize;
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.gainNode = null;
        this.connectedElements = new WeakSet();
        this.frequencyData = null;
        this.timeData = null;
        this.bassRange = { start: 0, end: 10 };
        this.midRange = { start: 10, end: 100 };
        this.highRange = { start: 100, end: 512 };
        this.energyHistory = [];
        this.historySize = 43;
        this.sensitivity = 1.5;
        this.lastBeatTime = 0;
        this.beatCooldown = 100;
        this.smoothedBass = 0;
        this.smoothedMid = 0;
        this.smoothedHigh = 0;
        this.smoothingFactor = 0.3;
    }

    async init() {
        console.log('📊 Analyzer: Initializing...');
        if (this.audioContext) {
            console.log('📊 Analyzer: AudioContext already exists. State:', this.audioContext.state);
            if (this.audioContext.state === 'suspended') {
                console.log('📊 Analyzer: Resuming suspended context...');
                await this.audioContext.resume();
            }
            return;
        }
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('📊 Analyzer: New AudioContext created. State:', this.audioContext.state);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = this.fftSize;
        this.analyser.smoothingTimeConstant = 0.85;
        this.analyser.minDecibels = -90;
        this.analyser.maxDecibels = -10;
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 1.0;
        this.analyser.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);
        const bufferLength = this.analyser.frequencyBinCount;
        this.frequencyData = new Uint8Array(bufferLength);
        this.timeData = new Uint8Array(bufferLength);
        console.log('Audio Analyzer initialized');
    }

    async loadAudio(file) {
        console.log('📂 Analyzer: Loading audio file:', file.name);
        if (!this.audioContext) await this.init();
        const url = URL.createObjectURL(file);
        const audio = new Audio();
        audio.src = url;
        audio.crossOrigin = "anonymous";
        this.connectedAudio = audio; // Track for play/pause
        console.log('🔗 Analyzer: Connecting audio element to analyzer...');
        this.connectAudioElement(audio);
        return audio;
    }

    async play() {
        if (!this.connectedAudio) {
            console.warn('⚠️ Analyzer: No audio element connected to play.');
            return;
        }
        console.log('▶️ Analyzer: Playback starting...');
        if (this.audioContext.state === 'suspended') {
            console.log('📊 Analyzer: Resuming suspended context before play...');
            await this.audioContext.resume();
        }
        this.connectedAudio.play();
    }

    pause() {
        if (this.connectedAudio) {
            console.log('⏸️ Analyzer: Playback paused.');
            this.connectedAudio.pause();
        }
    }

    connectAudioElement(audioElement) {
        if (!this.audioContext) return false;
        if (this.connectedElements.has(audioElement)) return true;
        try {
            this.source = this.audioContext.createMediaElementSource(audioElement);
            this.source.connect(this.analyser);
            this.connectedElements.add(audioElement);
            return true;
        } catch (error) {
            if (error.name === 'InvalidStateError') {
                this.connectedElements.add(audioElement);
                return true;
            }
            console.error('Error connecting audio element:', error);
            return false;
        }
    }

    async resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    setVolume(value) {
        if (this.gainNode) this.gainNode.gain.value = Math.max(0, Math.min(1, value));
    }

    setSensitivity(value) {
        this.sensitivity = Math.max(0.5, Math.min(3, value));
    }

    analyze() {
        if (!this.analyser || !this.frequencyData) return this.getEmptyAnalysis();
        this.analyser.getByteFrequencyData(this.frequencyData);
        this.analyser.getByteTimeDomainData(this.timeData);

        const bass = this.getBandEnergy(this.bassRange);
        const mid = this.getBandEnergy(this.midRange);
        const high = this.getBandEnergy(this.highRange);

        this.smoothedBass = this.lerp(this.smoothedBass, bass, this.smoothingFactor);
        this.smoothedMid = this.lerp(this.smoothedMid, mid, this.smoothingFactor);
        this.smoothedHigh = this.lerp(this.smoothedHigh, high, this.smoothingFactor);

        const totalEnergy = (bass * 2 + mid + high * 0.5) / 3.5;
        const isBeat = this.detectBeat(totalEnergy);
        const bars = this.getFrequencyBars(64);
        const waveform = this.getWaveform();

        return {
            frequencyData: this.frequencyData,
            timeData: this.timeData,
            bass: this.smoothedBass,
            mid: this.smoothedMid,
            high: this.smoothedHigh,
            totalEnergy,
            isBeat,
            bassNorm: this.smoothedBass / 255,
            midNorm: this.smoothedMid / 255,
            highNorm: this.smoothedHigh / 255,
            spectralCentroid: this.calculateSpectralCentroid(),
            bars,
            waveform,
            isMidi: false
        };
    }

    getBandEnergy(range) {
        if (!this.frequencyData) return 0;
        let sum = 0;
        const start = Math.min(range.start, this.frequencyData.length);
        const end = Math.min(range.end, this.frequencyData.length);
        for (let i = start; i < end; i++) sum += this.frequencyData[i];
        return end > start ? sum / (end - start) : 0;
    }

    detectBeat(energy) {
        this.energyHistory.push(energy);
        if (this.energyHistory.length > this.historySize) this.energyHistory.shift();
        if (this.energyHistory.length < 5) return false;
        const avgEnergy = this.energyHistory.reduce((a, b) => a + b) / this.energyHistory.length;
        const now = performance.now();
        if (avgEnergy > 0) {
            const ratio = energy / avgEnergy;
            if (ratio > this.sensitivity && (now - this.lastBeatTime) > this.beatCooldown) {
                this.lastBeatTime = now;
                return true;
            }
        }
        return false;
    }

    calculateSpectralCentroid() {
        if (!this.frequencyData) return 0;
        let weightedSum = 0, sum = 0;
        for (let i = 0; i < this.frequencyData.length; i++) {
            weightedSum += i * this.frequencyData[i];
            sum += this.frequencyData[i];
        }
        return sum > 0 ? weightedSum / sum : 0;
    }

    getFrequencyBars(numBars = 64) {
        if (!this.frequencyData) return new Array(numBars).fill(0);
        const bars = [];
        const dataLength = this.frequencyData.length;
        for (let i = 0; i < numBars; i++) {
            const startPercent = Math.pow(i / numBars, 1.5);
            const endPercent = Math.pow((i + 1) / numBars, 1.5);
            const start = Math.floor(startPercent * dataLength * 0.5);
            const end = Math.floor(endPercent * dataLength * 0.5);
            let sum = 0, count = 0;
            for (let j = start; j < end && j < dataLength; j++) { sum += this.frequencyData[j]; count++; }
            bars.push(count > 0 ? sum / count / 255 : 0);
        }
        return bars;
    }

    getWaveform() {
        if (!this.timeData) return new Array(256).fill(0);
        const waveform = [];
        const step = Math.floor(this.timeData.length / 256);
        for (let i = 0; i < 256; i++) {
            const idx = i * step;
            waveform.push(idx < this.timeData.length ? (this.timeData[idx] - 128) / 128 : 0);
        }
        return waveform;
    }

    lerp(a, b, t) { return a + (b - a) * t; }

    getEmptyAnalysis() {
        return {
            frequencyData: new Uint8Array(this.fftSize / 2),
            timeData: new Uint8Array(this.fftSize / 2),
            bass: 0, mid: 0, high: 0, totalEnergy: 0, isBeat: false,
            bassNorm: 0, midNorm: 0, highNorm: 0, spectralCentroid: 0,
            bars: new Array(64).fill(0), waveform: new Array(256).fill(0)
        };
    }
}


