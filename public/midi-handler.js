import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';
import Soundfont from 'soundfont-player';

/**
 * MIDI Handler with SoundFont Integration
 * Optimized for speed and mock analysis for generic visualizers
 */
export class MidiHandler {
    constructor() {
        this.midi = null;
        this.instruments = {}; // Stores soundfont instruments
        this.synths = {};      // Stores Tone.js synths
        this.notes = [];
        this.channels = {};
        this.isPlaying = false;
        this.startTime = 0;
        this.pauseTime = 0;
        this.tempo = 120;
        this.scheduledEvents = [];
        this.masterVolume = 0.8;
        this.audioContext = null;

        // Effects chain
        this.reverb = null;
        this.limiter = null;
        this.chorus = null;
        this.compressor = null;
        this.eq = null;
        this.filter = null; // High-cut to soften harsh strings
    }

    async init(audioContext) {
        if (audioContext) {
            await Tone.setContext(audioContext);
            this.audioContext = audioContext;
        } else {
            await Tone.start();
            this.audioContext = Tone.context.rawContext;
        }

        // Setup Master Effects Chain for "Premium" Sound
        this.limiter = new Tone.Limiter(-1).toDestination();
        this.compressor = new Tone.Compressor(-20, 4).connect(this.limiter);

        // Warmer EQ for "Wooden" String feel
        this.eq = new Tone.EQ3({
            low: 2,
            mid: -1,
            high: -4
        }).connect(this.compressor);

        // Soften the "digital" edge of high strings
        this.filter = new Tone.Filter(8000, "lowpass").connect(this.eq);

        // Lush "Concert Hall" Reverb
        this.reverb = new Tone.Reverb({
            decay: 4.0, // Longer for orchestral feel
            preDelay: 0.15,
            wet: 0.35 // Higher wetness for strings
        }).connect(this.filter);

        this.chorus = new Tone.Chorus(3, 2.5, 0.5).connect(this.reverb);
        this.chorus.wet.value = 0.08;

        Tone.Destination.volume.value = Tone.gainToDb(this.masterVolume);
        console.log('Premium Audio Engine Initialized');
    }

    async loadMidiFile(file) {
        try {
            this.stop();
            this.instruments = {};
            this.synths = {};

            const arrayBuffer = await file.arrayBuffer();
            this.midi = new Midi(arrayBuffer);

            if (this.midi.header.tempos.length > 0) {
                this.tempo = this.midi.header.tempos[0].bpm;
            }

            this.processNotes();
            this.loadInstruments(); // Background loading

            return this.midi;
        } catch (error) {
            console.error("Error loading MIDI:", error);
            throw error;
        }
    }

    processNotes() {
        this.notes = [];
        this.channels = {};
        for (const track of this.midi.tracks) {
            if (track.notes.length === 0) continue;
            const channel = track.channel;
            for (const note of track.notes) {
                const noteObj = {
                    note: note.midi,
                    name: note.name,
                    velocity: note.velocity,
                    startTime: note.time,
                    endTime: note.time + note.duration,
                    duration: note.duration,
                    channel: channel
                };
                this.notes.push(noteObj);
                if (!this.channels[channel]) this.channels[channel] = [];
                this.channels[channel].push(noteObj);
            }
        }
        this.notes.sort((a, b) => a.startTime - b.startTime);
    }

    // General MIDI Instrument Mapping (0-127)
    static GM_MAP = {
        0: 'acoustic_grand_piano', 1: 'bright_acoustic_piano', 2: 'electric_grand_piano', 3: 'honkytonk_piano',
        4: 'electric_piano_1', 5: 'electric_piano_2', 6: 'harpsichord', 7: 'clavi', 8: 'celesta',
        9: 'glockenspiel', 10: 'music_box', 11: 'vibraphone', 12: 'marimba', 13: 'xylophone',
        14: 'tubular_bells', 15: 'dulcimer', 16: 'drawbar_organ', 17: 'percussive_organ', 18: 'rock_organ',
        19: 'church_organ', 20: 'reed_organ', 21: 'accordion', 22: 'harmonica', 23: 'tango_accordion',
        24: 'acoustic_guitar_nylon', 25: 'acoustic_guitar_steel', 26: 'electric_guitar_jazz',
        27: 'electric_guitar_clean', 28: 'electric_guitar_muted', 29: 'overdriven_guitar',
        30: 'distortion_guitar', 31: 'guitar_harmonics', 32: 'acoustic_bass', 33: 'electric_bass_finger',
        34: 'electric_bass_pick', 35: 'fretless_bass', 36: 'slap_bass_1', 37: 'slap_bass_2',
        38: 'synth_bass_1', 39: 'synth_bass_2', 40: 'violin', 41: 'viola', 42: 'cello', 43: 'contrabass',
        44: 'tremolo_strings', 45: 'pizzicato_strings', 46: 'orchestral_harp', 47: 'timpani',
        48: 'string_ensemble_1', 49: 'string_ensemble_2', 50: 'synth_strings_1', 51: 'synth_strings_2',
        52: 'choir_aahs', 53: 'voice_oohs', 54: 'synth_voice', 55: 'orchestra_hit', 56: 'trumpet',
        57: 'trombone', 58: 'tuba', 59: 'muted_trumpet', 60: 'french_horn', 61: 'brass_section',
        62: 'synth_brass_1', 63: 'synth_brass_2', 64: 'soprano_sax', 65: 'alto_sax', 66: 'tenor_sax',
        67: 'baritone_sax', 68: 'oboe', 69: 'english_horn', 70: 'bassoon', 71: 'clarinet',
        72: 'piccolo', 73: 'flute', 74: 'recorder', 75: 'pan_flute', 76: 'blown_bottle', 77: 'shakuhachi',
        78: 'whistle', 79: 'ocarina', 80: 'lead_1_square', 81: 'lead_2_sawtooth', 82: 'lead_3_calliope',
        83: 'lead_4_chiff', 84: 'lead_5_charang', 85: 'lead_6_voice', 86: 'lead_7_fifths',
        87: 'lead_8_bass_lead', 88: 'pad_1_new_age', 89: 'pad_2_warm', 90: 'pad_3_polysynth',
        91: 'pad_4_choir', 92: 'pad_5_bowed', 93: 'pad_6_metallic', 94: 'pad_7_halo', 95: 'pad_8_sweep',
        96: 'fx_1_rain', 97: 'fx_2_soundtrack', 98: 'fx_3_crystal', 99: 'fx_4_atmosphere',
        100: 'fx_5_brightness', 101: 'fx_6_goblins', 102: 'fx_7_echoes', 103: 'fx_8_sci-fi',
        104: 'sitar', 105: 'banjo', 106: 'shamisen', 107: 'koto', 108: 'kalimba', 109: 'bagpipe',
        110: 'fiddle', 111: 'shanai', 112: 'tinkle_bell', 113: 'agogo', 114: 'steel_drums',
        115: 'woodblock', 116: 'taiko_drum', 117: 'melodic_tom', 118: 'synth_drum', 119: 'reverse_cymbal',
        120: 'guitar_fret_noise', 121: 'breath_noise', 122: 'seashore', 123: 'bird_tweet',
        124: 'telephone_ring', 125: 'helicopter', 126: 'applause', 127: 'gunshot'
    };

    async loadInstruments() {
        if (!Soundfont) return;

        const options = {
            soundfont: 'MusyngKite',
            from: './soundfonts/MusyngKite/',
            gain: 2
        };

        this.midi.tracks.forEach((track, index) => {
            if (track.notes.length === 0 || track.channel === 9) return;

            // Use GM Program Number for robust instrument identification
            const prgNum = track.instrument ? track.instrument.number : 0;
            const gmName = MidiHandler.GM_MAP[prgNum] || 'acoustic_grand_piano';

            console.log(`Track ${index} [Ch ${track.channel}] mapping Program ${prgNum} to ${gmName}`);

            Soundfont.instrument(this.audioContext, gmName, options)
                .then(inst => {
                    console.log(`✓ Loaded: ${gmName}`);
                    inst.connect(this.chorus);
                    this.instruments[index] = inst;
                })
                .catch(() => {
                    console.warn(`! Fallback for ${gmName}`);
                    this.createFallbackSynth(index, gmName);
                });
        });
    }

    createFallbackSynth(index, name) {
        let synth;
        if (name.includes('piano') || name.includes('harpsichord')) {
            synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.02, release: 1 } });
        } else if (name.includes('strings') || name.includes('pad') || name.includes('ensemble') || name.includes('choir')) {
            synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.5, release: 2 } });
        } else if (name.includes('lead') || name.includes('brass') || name.includes('trumpet')) {
            synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.05, release: 0.5 } });
        } else {
            synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' } });
        }

        synth.connect(this.reverb);
        this.synths[index] = synth;
    }

    play(startTime = 0) {
        this.stop();
        if (!this.midi) return;
        this.isPlaying = true;
        this.pauseTime = startTime;
        this.startTime = Tone.now() - startTime;
        this.scheduleAllNotes(startTime);
        Tone.Transport.start();
    }

    pause() {
        if (!this.isPlaying) return;
        this.pauseTime = this.getCurrentTime();
        this.stop();
    }

    setVolume(value) {
        this.masterVolume = value;
        Tone.Destination.volume.value = Tone.gainToDb(value);
    }

    scheduleAllNotes(fromTime = 0) {
        this.scheduledEvents.forEach(id => Tone.Transport.clear(id));
        this.scheduledEvents = [];

        const kick = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 10, oscillator: { type: "sine" }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 } }).connect(this.compressor);
        const snare = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.2, sustain: 0 } }).connect(this.compressor);
        const hihat = new Tone.MetalSynth({ frequency: 200, envelope: { attack: 0.001, decay: 0.1, sustain: 0 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5 }).connect(this.compressor);

        this.drumSynths = { kick, snare, hihat, fallback: new Tone.PolySynth(Tone.Synth).connect(this.reverb) };

        this.midi.tracks.forEach((track, index) => {
            track.notes.forEach(note => {
                if (note.time < fromTime) return;
                const time = note.time - fromTime;

                const eventId = Tone.Transport.schedule((t) => {
                    const inst = this.instruments[index];
                    const synth = this.synths[index];

                    if (track.channel === 9) {
                        if (note.midi === 35 || note.midi === 36) this.drumSynths.kick.triggerAttackRelease("C1", "16n", t, note.velocity);
                        else if (note.midi === 38 || note.midi === 40) this.drumSynths.snare.triggerAttackRelease("16n", t, note.velocity);
                        else if (note.midi >= 42 && note.midi <= 46) this.drumSynths.hihat.triggerAttackRelease("32n", t, note.velocity * 0.5);
                        else this.drumSynths.fallback.triggerAttackRelease(note.name, "32n", t, note.velocity * 0.3);
                    } else if (inst) {
                        try {
                            inst.play(note.midi, t, { duration: note.duration, gain: note.velocity * this.masterVolume * 2.5 });
                        } catch (e) {
                            if (synth) synth.triggerAttackRelease(note.name, note.duration, t, note.velocity * 0.5);
                        }
                    } else if (synth) {
                        synth.triggerAttackRelease(note.name, note.duration, t, note.velocity * 0.5);
                    }
                }, time);
                this.scheduledEvents.push(eventId);
            });
        });
    }

    stop() {
        this.isPlaying = false;
        Tone.Transport.stop();
        Tone.Transport.cancel();
        this.scheduledEvents = [];
        Object.values(this.instruments).forEach(inst => { if (inst && inst.stop) inst.stop(); });
        if (this.drumSynths) {
            Object.values(this.drumSynths).forEach(s => s.dispose());
            this.drumSynths = null;
        }
        Object.values(this.synths).forEach(s => s.releaseAll());
    }

    getCurrentTime() {
        if (!this.isPlaying) return this.pauseTime;
        return Tone.now() - this.startTime;
    }

    getAnalysis(currentTime) {
        const activeNotes = this.notes.filter(n => currentTime >= n.startTime && currentTime <= n.endTime);
        let bass = 0, mid = 0, high = 0;
        const spectrum = new Uint8Array(128).fill(0);

        activeNotes.forEach(n => {
            if (n.note < 48) bass += n.velocity;
            else if (n.note < 72) mid += n.velocity;
            else high += n.velocity;
            const bin = Math.floor(((n.note - 21) / 87) * 128);
            if (bin >= 0 && bin < 128) spectrum[bin] = Math.max(spectrum[bin], n.velocity * 255);
        });

        const bars = [];
        for (let i = 0; i < 32; i++) {
            let max = 0;
            const start = Math.floor(i * 128 / 32);
            for (let j = 0; j < 4; j++) max = Math.max(max, spectrum[start + j]);
            bars.push(max / 255);
        }

        return {
            spectrum,
            waveform: new Uint8Array(128).fill(128),
            bars,
            bass: Math.min(1, bass),
            mid: Math.min(1, mid),
            high: Math.min(1, high),
            totalEnergy: Math.min(1, bass + mid + high) * 255,
            isBeat: activeNotes.some(n => Math.abs(n.startTime - currentTime) < 0.02),
            channelData: this.getChannelAnalysis(currentTime),
            isMidi: true
        };
    }

    getChannelIds() { return Object.keys(this.channels).map(Number).sort((a, b) => a - b); }

    getChannelAnalysis(currentTime) {
        const channelIds = this.getChannelIds();
        return channelIds.map(chId => {
            const notes = this.channels[chId].filter(n => currentTime >= n.startTime && currentTime <= n.endTime);
            const energy = notes.reduce((sum, n) => sum + n.velocity, 0);
            return { channelId: chId, energy: Math.min(1, energy), noteCount: notes.length, isBeat: notes.some(n => Math.abs(n.startTime - currentTime) < 0.02) };
        });
    }

    getTransportInfo() {
        if (!this.isPlaying) return { bar: 0, beat: 0, sixteenth: 0, beatProgress: 0 };
        const pos = Tone.Transport.position.split(':');
        return { bar: parseInt(pos[0]), beat: parseInt(pos[1]), sixteenth: parseFloat(pos[2]), beatProgress: (parseFloat(pos[2]) / 4) };
    }
}

