import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';

/**
 * MidiEngine - Isolated Audio Engine
 * Handles strictly audio playback, sampling, and Tone.js state.
 */
export class MidiEngine {
    constructor() {
        this.midi = null;
        this.samplers = {};
        this.notes = [];
        this.channels = {};
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

        // Effects placeholder (to be initialized after context setup)
        this.output = null;
        this.limiter = null;
        this.reverb = null;
        this.eq = null;
    }

    async init(sharedContext) {
        if (this.isInitialized) return;

        console.log('🚀 MidiEngine: Initializing Audio context...');
        if (sharedContext) {
            await Tone.setContext(sharedContext);
            this.context = sharedContext;
        } else {
            await Tone.start();
            this.context = Tone.context;
        }

        // Initialize effects chain within the established context
        this.output = new Tone.Gain(1.0);
        this.limiter = new Tone.Limiter(-1).toDestination();
        this.reverb = new Tone.Reverb({ decay: 2.5, wet: 0.25 }).connect(this.limiter);
        this.eq = new Tone.EQ3({ low: 2, mid: 0, high: -2 }).connect(this.reverb);
        this.output.connect(this.eq);

        await this.reverb.ready;
        this.isInitialized = true;
        console.log('✅ MidiEngine: Audio Engine Ready. (Build: 20260202_1730)');
    }

    async loadMidi(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            this.midi = new Midi(arrayBuffer);
            this.processNotes();
            await this.loadInstruments();
            return this.midi;
        } catch (e) {
            console.error('❌ MidiEngine: Load Error:', e);
            throw e;
        }
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
    }

    async loadInstruments() {
        // Fetch manifest and load samplers (similar logic but isolated)
        const response = await fetch('./samples/manifest.json');
        const manifest = await response.json();

        const promises = [];
        this.midi.tracks.forEach((track, index) => {
            if (track.notes.length === 0 || track.channel === 9) return;

            const prg = track.instrument ? track.instrument.number : 0;
            let lib = this.getLibraryName(prg, manifest);

            const samples = {};
            manifest[lib].forEach(f => {
                const note = f.replace('.mp3', '').replace('Ds', 'D#').replace('Fs', 'F#').replace('As', 'A#').replace('Gs', 'G#').replace('Cs', 'C#');
                samples[note] = f;
            });

            const sampler = new Tone.Sampler({
                urls: samples,
                baseUrl: `./samples/${lib}/`,
                onload: () => console.log(`🎹 MidiEngine: [${lib}] loaded.`),
                onerror: (e) => console.error(`❌ MidiEngine: [${lib}] failed:`, e)
            }).connect(this.output);

            this.samplers[index] = sampler;
            promises.push(new Promise(r => {
                const check = () => sampler.loaded ? r() : setTimeout(check, 100);
                setTimeout(() => { if (!sampler.loaded) r(); }, 8000); // 8s timeout
                check();
            }));
        });
        await Promise.all(promises);
    }

    getLibraryName(prg, manifest) {
        let lib = this.GM_TO_SAMPLE[prg] || 'piano';
        return (manifest[lib] && manifest[lib].length > 0) ? lib : 'piano';
    }

    async play(fromTime = 0) {
        await Tone.start();
        if (Tone.context.state !== 'running') await Tone.context.resume();

        this.stop();
        this.isPlaying = true;

        const now = Tone.now();
        this.midi.tracks.forEach((track, index) => {
            track.notes.forEach(note => {
                if (note.time < fromTime) return;
                const sampler = this.samplers[index];
                if (sampler && sampler.loaded) {
                    sampler.triggerAttackRelease(note.name, note.duration, now + note.time - fromTime, note.velocity * this.masterVolume);
                }
            });
        });

        Tone.Transport.seconds = fromTime;
        Tone.Transport.start();
    }

    pause() {
        this.isPlaying = false;
        Tone.Transport.pause();
        Object.values(this.samplers).forEach(s => s.releaseAll());
    }

    stop() {
        this.isPlaying = false;
        Tone.Transport.stop();
        Tone.Transport.cancel();
        Object.values(this.samplers).forEach(s => s.releaseAll());
    }

    setVolume(v) {
        this.masterVolume = v;
        this.output.gain.rampTo(v, 0.1);
    }

    getCurrentTime() {
        return Tone.Transport.seconds;
    }
}
