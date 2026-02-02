import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';

/**
 * MidiEngine - Isolated Audio Engine (Improved Version)
 * Handles strictly audio playback, sampling, and Tone.js state.
 * Uses Tone.Part for reliable scheduling and synchronization.
 */
export class MidiEngine {
    constructor() {
        this.midi = null;
        this.samplers = {};
        this.parts = [];
        this.isPlaying = false;
        this.masterVolume = 0.8;
        this.context = null;
        this.isInitialized = false;

        // Metadata constants
        this.GM_MAP = {
            0: 'acoustic_grand_piano', 1: 'bright_acoustic_piano', 2: 'electric_grand_piano', 3: 'honkytonk_piano',
            24: 'acoustic_guitar_nylon', 25: 'acoustic_guitar_steel', 26: 'electric_guitar_jazz',
            32: 'acoustic_bass', 33: 'electric_bass_finger', 40: 'violin', 41: 'violin', 42: 'cello', 43: 'contrabass',
            48: 'string_ensemble_1', 56: 'trumpet', 57: 'trombone', 58: 'tuba', 60: 'french_horn', 61: 'trumpet',
            68: 'oboe', 70: 'bassoon', 71: 'clarinet', 73: 'flute', 104: 'harp', 114: 'xylophone'
        };

        this.GM_TO_SAMPLE = {
            0: 'piano', 1: 'piano', 2: 'piano', 3: 'piano', 4: 'piano', 5: 'piano', 6: 'piano', 7: 'piano',
            8: 'piano', 11: 'xylophone', 12: 'xylophone', 13: 'xylophone',
            24: 'guitar-nylon', 25: 'guitar-acoustic', 26: 'guitar-electric', 27: 'guitar-electric',
            32: 'bass-electric', 33: 'bass-electric', 34: 'bass-electric',
            40: 'violin', 41: 'violin', 42: 'cello', 43: 'contrabass',
            48: 'violin', 49: 'cello', 50: 'cello', 51: 'cello',
            56: 'trumpet', 57: 'trombone', 58: 'tuba', 60: 'french-horn', 61: 'trumpet',
            68: 'oboe', 70: 'bassoon', 71: 'clarinet', 73: 'flute',
            104: 'harp', 114: 'xylophone'
        };

        // Effects placeholders
        this.output = null;
    }

    async init(sharedContext) {
        if (this.isInitialized) return;

        console.log('🚀 MidiEngine: Initializing Audio context... (Build: 20260202_1750)');
        if (sharedContext) {
            await Tone.setContext(sharedContext);
            this.context = sharedContext;
        } else {
            await Tone.start();
            this.context = Tone.context;
        }

        // Initialize master output directly to destination for maximum reliability
        this.output = new Tone.Gain(this.masterVolume).toDestination();
        console.log('🔊 MidiEngine: Master output initialized at volume:', this.masterVolume);

        this.isInitialized = true;
        console.log('✅ MidiEngine: Audio Engine Ready.');
    }

    async loadMidi(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            this.midi = new Midi(arrayBuffer);

            // Clear existing parts
            this.parts.forEach(part => part.dispose());
            this.parts = [];

            await this.loadInstruments();
            this.scheduleNotes();

            return this.midi;
        } catch (e) {
            console.error('❌ MidiEngine: Load Error:', e);
            throw e;
        }
    }

    async loadInstruments() {
        const response = await fetch('./samples/manifest.json');
        const manifest = await response.json();

        const promises = [];
        this.midi.tracks.forEach((track, index) => {
            if (track.notes.length === 0 || track.channel === 9) return;

            const prg = track.instrument ? track.instrument.number : 0;
            let lib = this.getLibraryName(prg, manifest);

            // Skip if no samples available for this lib
            if (!manifest[lib] || manifest[lib].length === 0) {
                console.warn(`⚠️ MidiEngine: Library [${lib}] is empty. Falling back to piano.`);
                lib = 'piano';
            }

            const samples = {};
            manifest[lib].forEach(f => {
                const note = f.replace('.mp3', '').replace('Ds', 'D#').replace('Fs', 'F#').replace('As', 'A#').replace('Gs', 'G#').replace('Cs', 'C#');
                samples[note] = f;
            });

            const sampler = new Tone.Sampler({
                urls: samples,
                baseUrl: `./samples/${lib}/`,
                onload: () => console.log(`🎹 MidiEngine: [${lib}] loaded for Track ${index}. Total Samplers: ${Object.keys(this.samplers).length}`),
                onerror: (e) => console.error(`❌ MidiEngine: [${lib}] failed:`, e)
            }).connect(this.output); // Connect directly to output for now

            this.samplers[index] = sampler;
            promises.push(new Promise(r => {
                const check = () => sampler.loaded ? r() : setTimeout(check, 100);
                setTimeout(() => r(), 5000); // 5s timeout
                check();
            }));
        });
        await Promise.all(promises);
    }

    getLibraryName(prg, manifest) {
        let lib = this.GM_TO_SAMPLE[prg] || 'piano';
        return (manifest[lib] && manifest[lib].length > 0) ? lib : 'piano';
    }

    scheduleNotes() {
        console.log(`📅 MidiEngine: Scheduling notes for ${this.midi.tracks.filter(t => t.notes.length > 0).length} tracks...`);
        this.midi.tracks.forEach((track, index) => {
            if (track.notes.length === 0 || !this.samplers[index]) return;

            const part = new Tone.Part((time, note) => {
                const sampler = this.samplers[index];
                if (sampler && sampler.loaded) {
                    sampler.triggerAttackRelease(note.name, note.duration, time, note.velocity);
                }
            }, track.notes.map(n => ({ time: n.time, name: n.name, duration: n.duration, velocity: n.velocity })));

            part.start(0);
            this.parts.push(part);
        });
        console.log(`✅ MidiEngine: Scheduled ${this.parts.length} parts.`);
    }

    async play(fromTime = 0) {
        await Tone.start();
        if (this.context && this.context.state !== 'running') await this.context.resume();

        console.log(`🔊 MidiEngine: Starting playback from ${fromTime.toFixed(2)}s`);

        Tone.Transport.seconds = fromTime;
        Tone.Transport.start();
        this.isPlaying = true;
    }

    pause() {
        this.isPlaying = false;
        Tone.Transport.pause();
        Object.values(this.samplers).forEach(s => s.releaseAll());
    }

    stop() {
        this.isPlaying = false;
        Tone.Transport.stop();
        Tone.Transport.seconds = 0;
        Object.values(this.samplers).forEach(s => s.releaseAll());
    }

    setVolume(v) {
        this.masterVolume = Math.max(0, Math.min(1, v));
        if (this.output) {
            this.output.gain.rampTo(this.masterVolume, 0.1);
            console.log(`🔊 MidiEngine: Master Volume set to ${this.masterVolume.toFixed(2)}`);
        }
    }

    getCurrentTime() {
        return Tone.Transport.seconds;
    }
}
