/**
 * MidiHandler - Pure Data Analyzer
 * Responsible for parsing MIDI data and providing real-time analysis
 * for visualizers WITHOUT handling any audio playback.
 */
export class MidiHandler {
    constructor() {
        this.midi = null;
        this.notes = [];
        this.channels = {};
        this.isInitialized = false;
    }

    // Safety fallback for cached visualizers
    getCurrentTime() {
        return window.app && window.app.midiEngine ? window.app.midiEngine.getCurrentTime() : 0;
    }

    async init(sharedContext) {
        this.isInitialized = true;
        console.log('📊 MidiHandler: Data analyzer ready. (Build: 20260202_1730)');
    }

    async loadMidiFile(file) {
        // We'll import Midi dynamically to avoid loading it twice if needed
        const { Midi } = await import('@tonejs/midi');
        const arrayBuffer = await file.arrayBuffer();
        this.midi = new Midi(arrayBuffer);
        this.processNotes();
        return this.midi;
    }

    processNotes() {
        this.notes = [];
        this.channels = {};
        this.midi.tracks.forEach(track => {
            if (track.notes.length === 0) return;
            const channel = track.channel;
            if (!this.channels[channel]) this.channels[channel] = [];

            track.notes.forEach(note => {
                const n = {
                    note: note.midi,
                    name: note.name,
                    velocity: note.velocity,
                    startTime: note.time,
                    endTime: note.time + note.duration,
                    duration: note.duration,
                    channel: channel
                };
                this.notes.push(n);
                this.channels[channel].push(n);
            });
        });
        this.notes.sort((a, b) => a.startTime - b.startTime);
        console.log(`📊 MidiHandler: Processed ${this.notes.length} notes for analysis.`);
    }

    getAnalysis(currentTime) {
        if (!this.midi) return this.getEmptyAnalysis();

        const activeNotes = this.notes.filter(n => currentTime >= n.startTime && currentTime <= n.endTime);
        const totalNotes = this.notes.length;

        // Basic spectrum simulation based on active notes
        const spectrum = new Uint8Array(128).fill(0);
        let bass = 0, mid = 0, high = 0;

        activeNotes.forEach(n => {
            const freqIndex = Math.floor(n.note);
            if (freqIndex < 128) spectrum[freqIndex] = Math.max(spectrum[freqIndex], n.velocity * 255);

            if (n.note < 48) bass += n.velocity;
            else if (n.note < 72) mid += n.velocity;
            else high += n.velocity;
        });

        // Simulating bars (32 bars)
        const bars = [];
        for (let i = 0; i < 32; i++) {
            let max = 0;
            const start = i * 4;
            for (let j = 0; j < 4; j++) {
                if (spectrum[start + j]) max = Math.max(max, spectrum[start + j]);
            }
            bars.push(max / 255);
        }

        const energy = Math.min(1, bass + mid + high);

        // Weighted pitch calculation for centroid
        let weightedSum = 0, weightTotal = 0;
        activeNotes.forEach(n => {
            weightedSum += n.note * n.velocity;
            weightTotal += n.velocity;
        });
        const spectralCentroid = weightTotal > 0 ? (weightedSum / weightTotal) : 60;

        return {
            spectrum,
            waveform: new Uint8Array(128).fill(128), // Waveform not easily simulated from static MIDI data
            bars,
            bass: Math.min(1, bass),
            mid: Math.min(1, mid),
            high: Math.min(1, high),
            bassNorm: Math.min(1, bass),
            midNorm: Math.min(1, mid),
            highNorm: Math.min(1, high),
            totalEnergy: energy * 255,
            spectralCentroid: spectralCentroid,
            isBeat: activeNotes.some(n => Math.abs(n.startTime - currentTime) < 0.02),
            channelData: this.getChannelAnalysis(currentTime),
            isMidi: true
        };
    }

    getChannelIds() {
        return Object.keys(this.channels).map(Number).sort((a, b) => a - b);
    }

    getChannelAnalysis(currentTime) {
        return this.getChannelIds().map(chId => {
            const notes = this.channels[chId].filter(n => currentTime >= n.startTime && currentTime <= n.endTime);
            const energy = notes.reduce((sum, n) => sum + n.velocity, 0);
            return {
                channelId: chId,
                energy: Math.min(1, energy),
                noteCount: notes.length,
                isBeat: notes.some(n => Math.abs(n.startTime - currentTime) < 0.02)
            };
        });
    }

    getEmptyAnalysis() {
        return {
            spectrum: new Uint8Array(128).fill(0),
            waveform: new Uint8Array(128).fill(128),
            bars: new Array(32).fill(0),
            bass: 0, mid: 0, high: 0, totalEnergy: 0,
            isMidi: true, channelData: []
        };
    }
}
