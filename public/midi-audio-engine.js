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
        this.samplers = {}; // Cached by library name
        this.trackSamplers = {}; // Map track index to sampler
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

    async init(sharedContext, destinationNode) {
        if (this.isInitialized) return;

        console.log('🚀 MidiEngine: Initializing Audio context... (Build: 20260202_1750)');
        if (sharedContext) {
            await Tone.setContext(sharedContext);
            this.context = sharedContext;
        } else {
            await Tone.start();
            this.context = Tone.context;
        }

        // Initialize master output
        this.output = new Tone.Gain(this.masterVolume);

        if (destinationNode) {
            this.output.connect(destinationNode);
            console.log('🔊 MidiEngine: Audio connected to External Analyzer.');
        } else {
            this.output.toDestination();
            console.log('🔊 MidiEngine: Audio connected directly to Destination.');
        }

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
        console.log('📦 MidiEngine: Loading instrument samples...');
        const response = await fetch('./samples/manifest.json');
        const manifest = await response.json();

        const libsToLoad = new Set();
        this.midi.tracks.forEach(track => {
            if (track.notes.length > 0 && track.channel !== 9) {
                const prg = track.instrument ? track.instrument.number : 0;
                libsToLoad.add(this.getLibraryName(prg, manifest));
            }
        });

        console.log(`📦 MidiEngine: Distinct libraries to load: ${Array.from(libsToLoad).join(', ')}`);

        // Load distinct samplers
        const loadPromises = [];
        for (const lib of libsToLoad) {
            if (this.samplers[lib]) continue;

            const samples = {};
            manifest[lib].forEach(f => {
                const note = f.replace('.mp3', '').replace('Ds', 'D#').replace('Fs', 'F#').replace('As', 'A#').replace('Gs', 'G#').replace('Cs', 'C#');
                samples[note] = f;
            });

            const sampler = new Tone.Sampler({
                urls: samples,
                baseUrl: `./samples/${lib}/`,
                onload: () => console.log(`🎹 MidiEngine: Library [${lib}] fully loaded.`),
                onerror: (e) => console.error(`❌ MidiEngine: Library [${lib}] failed to load:`, e)
            }).connect(this.output);

            this.samplers[lib] = sampler;
            loadPromises.push(new Promise(r => {
                const check = () => sampler.loaded ? r() : setTimeout(check, 100);
                setTimeout(() => {
                    if (!sampler.loaded) console.warn(`⚠️ MidiEngine: Library [${lib}] timeout after 10s`);
                    r();
                }, 10000);
                check();
            }));
        }

        await Promise.all(loadPromises);

        // Map tracks to their cached samplers
        this.midi.tracks.forEach((track, index) => {
            const prg = track.instrument ? track.instrument.number : 0;
            const lib = this.getLibraryName(prg, manifest);
            this.trackSamplers[index] = this.samplers[lib];
        });

        console.log('✅ MidiEngine: All instruments ready.');
    }

    getLibraryName(prg, manifest) {
        let lib = this.GM_TO_SAMPLE[prg] || 'piano';
        return (manifest[lib] && manifest[lib].length > 0) ? lib : 'piano';
    }

    scheduleNotes() {
        console.log(`📅 MidiEngine: Scheduling notes for ${this.midi.tracks.filter(t => t.notes.length > 0).length} tracks...`);
        this.parts.forEach(p => p.dispose());
        this.parts = [];

        this.midi.tracks.forEach((track, index) => {
            const sampler = this.trackSamplers[index];
            if (track.notes.length === 0 || !sampler) return;

            const part = new Tone.Part((time, note) => {
                if (sampler.loaded) {
                    sampler.triggerAttackRelease(note.name, note.duration, time, note.velocity);
                }
            }, track.notes.map(n => ({ time: n.time, name: n.name, duration: n.duration, velocity: n.velocity })));

            part.start(0);
            this.parts.push(part);
        });
        console.log(`✅ MidiEngine: Scheduled ${this.parts.length} parts.`);
    }

    async play(fromTime = 0) {
        console.log(`🔊 MidiEngine: Attempting playback from ${fromTime.toFixed(2)}s. State: ${Tone.context.state}`);

        // Satisfy browser autoplay policies
        await Tone.start();
        if (this.context && this.context.resume) {
            await this.context.resume();
        }

        if (Tone.context.state !== 'running') {
            console.warn('⚠️ MidiEngine: AudioContext is still suspended! Click play button again.');
            // Only proceed if context is running or we'll get Tone.js warnings
            if (fromTime === 0) return; // Don't try to auto-play if suspended
        }

        this.isPlaying = true;
        Tone.Transport.seconds = fromTime;
        Tone.Transport.start();

        console.log(`▶️ MidiEngine: Playback started. Transport Time: ${Tone.Transport.seconds.toFixed(2)}`);
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
