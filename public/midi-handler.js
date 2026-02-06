import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';

/**
 * Professional MIDI Handler using Multi-Sample Mapping
 * Equivalent quality to Piano Book / Decent Sampler within a browser environment.
 */
export class MidiHandler {
    constructor() {
        this.midi = null;
        this.samplers = {}; // Stores Tone.Sampler instances
        this.notes = [];
        this.channels = {};
        this.isPlaying = false;
        this.sampleManifest = null; // Stores available samples from manifest.json
        this.startTime = 0;
        this.pauseTime = 0;
        this.tempo = 120;
        this.scheduledEvents = [];
        this.masterVolume = 0.8;
        this.audioContext = null;

        // Effects chain (initialized in init)
        this.reverb = null;
        this.limiter = null;
        this.chorus = null;
        this.eq = null;
        this.filter = null;
        this.compressor = null;
        this.output = null;

        // Performance settings
        this.performanceMode = true; // Enable lightweight mode for complex MIDI
        this.maxPolyphony = 64; // Limit simultaneous voices
    }

    // High Quality Sample Mapping - Extended for full GM support
    static GM_TO_SAMPLE = {
        // Pianos (0-7)
        0: 'piano', 1: 'piano', 2: 'piano', 3: 'piano', 4: 'piano', 5: 'piano', 6: 'harpsichord', 7: 'piano',
        // Chromatic Percussion (8-15)
        8: 'celesta', 9: 'glockenspiel', 10: 'piano', 11: 'xylophone', 12: 'xylophone', 13: 'xylophone', 14: 'piano', 15: 'piano',
        // Organ (16-23)
        16: 'church_organ', 17: 'percussive_organ', 18: 'piano', 19: 'church_organ', 20: 'piano', 21: 'piano', 22: 'piano', 23: 'piano',
        // Guitar (24-31)
        24: 'guitar-nylon', 25: 'guitar-acoustic', 26: 'guitar-electric', 27: 'guitar-electric', 28: 'guitar-electric', 29: 'guitar-electric', 30: 'guitar-electric', 31: 'guitar-electric',
        // Bass (32-39)
        32: 'bass-electric', 33: 'bass-electric', 34: 'bass-electric', 35: 'bass-electric', 36: 'bass-electric', 37: 'bass-electric', 38: 'bass-electric', 39: 'bass-electric',
        // Strings (40-47)
        40: 'violin', 41: 'violin', 42: 'cello', 43: 'contrabass', 44: 'tremolo_strings', 45: 'pizzicato_strings', 46: 'harp', 47: 'timpani',
        // String Ensembles (48-55)
        48: 'string_ensemble_1', 49: 'string_ensemble_2', 50: 'synth_strings_1', 51: 'synth_strings_2', 52: 'choir_aahs', 53: 'choir_aahs', 54: 'choir_aahs', 55: 'piano',
        // Brass (56-63)
        56: 'trumpet', 57: 'trombone', 58: 'tuba', 59: 'trumpet', 60: 'french-horn', 61: 'brass_section', 62: 'synth_brass_2', 63: 'synth_brass_2',
        // Reed (64-71)
        64: 'oboe', 65: 'oboe', 66: 'oboe', 67: 'oboe', 68: 'oboe', 69: 'oboe', 70: 'bassoon', 71: 'clarinet',
        // Pipe (72-79)
        72: 'piccolo', 73: 'flute', 74: 'recorder', 75: 'flute', 76: 'flute', 77: 'flute', 78: 'ocarina', 79: 'ocarina',
        // Synth Lead (80-87)
        80: 'lead_1_square', 81: 'lead_2_sawtooth', 82: 'piano', 83: 'piano', 84: 'piano', 85: 'piano', 86: 'piano', 87: 'piano',
        // Synth Pad (88-95)
        88: 'piano', 89: 'piano', 90: 'piano', 91: 'piano', 92: 'piano', 93: 'piano', 94: 'piano', 95: 'piano',
        // Synth FX (96-103)
        96: 'fx_1_rain', 97: 'piano', 98: 'fx_3_crystal', 99: 'piano', 100: 'piano', 101: 'piano', 102: 'piano', 103: 'piano',
        // Ethnic (104-111)
        104: 'sitar', 105: 'piano', 106: 'piano', 107: 'piano', 108: 'piano', 109: 'piano', 110: 'violin', 111: 'piano',
        // Percussive (112-119)
        112: 'glockenspiel', 113: 'piano', 114: 'xylophone', 115: 'piano', 116: 'timpani', 117: 'timpani', 118: 'piano', 119: 'piano'
    };

    static NOTES = ['A0', 'C1', 'Ds1', 'Fs1', 'A1', 'C2', 'Ds2', 'Fs2', 'A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6', 'Ds6', 'Fs6', 'A6', 'C7', 'Ds7', 'Fs7', 'A7'];

    static GM_MAP = {
        0: 'acoustic_grand_piano', 1: 'bright_acoustic_piano', 2: 'electric_grand_piano', 3: 'honkytonk_piano',
        24: 'acoustic_guitar_nylon', 25: 'acoustic_guitar_steel', 26: 'electric_guitar_jazz',
        32: 'acoustic_bass', 33: 'electric_bass_finger', 40: 'violin', 42: 'cello', 43: 'contrabass',
        48: 'string_ensemble_1', 56: 'trumpet', 60: 'french_horn', 68: 'oboe', 70: 'bassoon', 71: 'clarinet', 73: 'flute'
    };

    async init(sharedContext) {
        console.log('🎵 Audio: Initializing High-Quality Engine...');
        if (this.reverb) {
            console.log('ℹ️ Audio: Engine already initialized.');
            return;
        }

        if (sharedContext) {
            console.log('🔗 Audio: Connecting to shared context:', sharedContext.state);
            await Tone.setContext(sharedContext);
            this.audioContext = sharedContext;
        } else {
            // Create optimized audio context for smooth multi-channel playback
            console.log('🚀 Audio: Creating optimized audio context...');

            // Use larger buffer for stability with complex MIDI
            const context = new AudioContext({
                latencyHint: 'playback',  // Optimize for smooth playback over low latency
                sampleRate: 44100
            });

            await Tone.setContext(context);
            this.audioContext = context;
            await Tone.start();

            console.log(`📊 Audio: Context created - Sample Rate: ${context.sampleRate}Hz, Base Latency: ${(context.baseLatency * 1000).toFixed(1)}ms`);
        }
        console.log('📊 Audio: Context State:', Tone.context.state);

        // Increase Tone.js lookahead for better scheduling precision
        Tone.context.lookAhead = 0.1; // 100ms lookahead for smooth playback

        // Initialize output with proper gain staging
        this.output = new Tone.Gain(0.8); // Slight headroom to prevent clipping

        // HIGH QUALITY Mastering Chain
        this.limiter = new Tone.Limiter(-0.5).toDestination();
        this.compressor = new Tone.Compressor({
            threshold: -15,
            ratio: 4,
            attack: 0.003,
            release: 0.25,
            knee: 6
        }).connect(this.limiter);

        this.eq = new Tone.EQ3({ low: 2, mid: 0, high: -2 }).connect(this.compressor);

        this.filter = new Tone.Filter({
            frequency: 18000,
            type: "lowpass",
            rolloff: -12
        }).connect(this.eq);

        this.reverb = new Tone.Reverb({
            decay: 3,
            wet: 0.25,
            preDelay: 0.01
        }).connect(this.filter);
        await this.reverb.ready;

        this.chorus = new Tone.Chorus({
            frequency: 1.5,
            delayTime: 3.5,
            depth: 0.3,
            wet: 0.15
        }).connect(this.reverb);
        await this.chorus.start();

        // Route output through full effects chain
        this.output.connect(this.chorus);
        console.log('🎛️ Audio: Full HQ effects chain: Output → Chorus → Reverb → Filter → EQ → Compressor → Limiter → Destination');

        // Re-connect any already loaded samplers
        const samplerCount = Object.keys(this.samplers).length;
        if (samplerCount > 0) {
            console.log(`🔄 Audio: Reconnecting ${samplerCount} existing samplers to new output.`);
            Object.values(this.samplers).forEach(s => {
                try { s.connect(this.output); } catch (e) { console.error('❌ Audio: Reconnect failed:', e); }
            });
        }

        Tone.Destination.volume.value = Tone.gainToDb(this.masterVolume);

        // Fetch sample manifest
        try {
            const response = await fetch('./samples/manifest.json');
            this.sampleManifest = await response.json();
            console.log('📜 Audio: Sample manifest loaded.');
        } catch (e) {
            console.error('❌ Audio: Failed to load manifest.json', e);
        }

        console.log('✅ Audio: Engine Ready. Master Volume:', this.masterVolume);
    }

    async loadMidiFile(file) {
        console.log('📂 MIDI: Loading file:', file.name);
        try {
            this.stop();
            this.samplers = {};
            const arrayBuffer = await file.arrayBuffer();
            this.midi = new Midi(arrayBuffer);
            console.log(`📄 MIDI: Parsed successfully. Tracks: ${this.midi.tracks.length}, Duration: ${this.midi.duration.toFixed(2)}s`);

            if (this.midi.header.tempos.length > 0) {
                this.tempo = this.midi.header.tempos[0].bpm;
                console.log('⏱️ MIDI: Tempo detected:', this.tempo, 'BPM');
            }

            this.processNotes();
            await this.loadInstruments();
            return this.midi;
        } catch (error) {
            console.error("❌ MIDI: Error loading file:", error);
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
        console.log(`📝 MIDI: Processed ${this.notes.length} total notes.`);
    }

    async loadInstruments() {
        console.log('🎻 Audio: Detecting instruments...');

        // OPTIMIZATION: Share samplers between tracks using the same instrument library
        // This dramatically reduces CPU load for multi-track MIDI files
        const sharedSamplers = {}; // lib -> Sampler instance
        const trackToLib = {}; // trackIndex -> lib name
        const promises = [];

        // First pass: Identify unique instruments needed
        const uniqueLibs = new Set();
        this.midi.tracks.forEach((track, index) => {
            if (track.notes.length === 0 || track.channel === 9) return;

            const prg = track.instrument ? track.instrument.number : 0;
            let lib = MidiHandler.GM_TO_SAMPLE[prg] || 'piano';

            // Check manifest for availability, fallback to piano if missing
            if (!this.sampleManifest || !this.sampleManifest[lib] || this.sampleManifest[lib].length === 0) {
                lib = 'piano';
            }

            trackToLib[index] = lib;
            uniqueLibs.add(lib);
        });

        console.log(`⚡ Audio: ${uniqueLibs.size} unique instruments for ${Object.keys(trackToLib).length} tracks (sampler sharing enabled)`);

        // Second pass: Create one sampler per unique instrument
        for (const lib of uniqueLibs) {
            const availableFiles = this.sampleManifest ? this.sampleManifest[lib] : [];

            if (availableFiles.length === 0) {
                console.error(`❌ No samples for [${lib.toUpperCase()}]`);
                continue;
            }

            // Build sample map (supports both .ogg and .mp3 formats)
            const samples = {};
            availableFiles.forEach(fileName => {
                // Support both OGG and MP3 formats
                let noteName = fileName.replace('.ogg', '').replace('.mp3', '');
                noteName = noteName
                    .replace(/Ds(\d)/g, 'D#$1')
                    .replace(/Fs(\d)/g, 'F#$1')
                    .replace(/As(\d)/g, 'A#$1')
                    .replace(/Gs(\d)/g, 'G#$1')
                    .replace(/Cs(\d)/g, 'C#$1');
                samples[noteName] = fileName;
            });

            console.log(`📥 Loading [${lib.toUpperCase()}] with ${Object.keys(samples).length} samples`);

            const sampler = new Tone.Sampler({
                urls: samples,
                baseUrl: `./samples/${lib}/`,
                attack: 0.005,   // Very fast attack for precise timing
                release: 1.5,   // Natural release for full instrument decay
                curve: "exponential",  // Natural volume curve
                volume: -6,     // Headroom to prevent clipping with multiple instruments
                onload: () => {
                    console.log(`✅ [${lib.toUpperCase()}] ready`);
                },
                onerror: (err) => {
                    console.error(`❌ Failed to load [${lib.toUpperCase()}]:`, err);
                }
            });

            if (this.output) sampler.connect(this.output);
            sharedSamplers[lib] = sampler;

            promises.push(new Promise(resolve => {
                const checkLoaded = () => {
                    if (sampler.loaded) resolve();
                    else setTimeout(checkLoaded, 50);
                };
                checkLoaded();
            }));
        }

        // Third pass: Map each track to its shared sampler
        Object.entries(trackToLib).forEach(([trackIndex, lib]) => {
            if (sharedSamplers[lib]) {
                this.samplers[trackIndex] = sharedSamplers[lib];
            }
        });

        // Wait for ALL shared samplers to load
        if (promises.length > 0) {
            console.log(`⏳ Audio: Loading ${promises.length} shared samplers...`);
            await Promise.all(promises);
            console.log(`✅ Audio: All samplers ready!`);
        }
    }

    async play(startTime = 0) {
        console.log('▶️ Playback: Starting at', startTime.toFixed(2), 's');
        this.stop();
        if (!this.midi) {
            console.warn('⚠️ Playback: No MIDI file loaded.');
            return;
        }

        // Ensure audio context is running
        await Tone.start();
        if (Tone.context.state !== 'running') {
            console.warn('⚠️ AudioContext not running, attempting resume...');
            await Tone.context.resume();
        }
        console.log('🔊 Audio: Context State:', Tone.context.state);

        this.isPlaying = true;
        this.pauseTime = startTime;
        this.startTime = Tone.now() - startTime;

        // Reset Transport completely
        Tone.Transport.stop();
        Tone.Transport.cancel();
        Tone.Transport.position = 0;
        Tone.Transport.seconds = 0;

        // Schedule all notes
        this.scheduleAllNotes(startTime);

        // Start Transport - this is critical!
        Tone.Transport.start();
        console.log('🚀 Transport started, position:', Tone.Transport.position);

        // Keepalive: Prevent browser from suspending audio context
        this._keepAliveInterval = setInterval(() => {
            if (this.isPlaying && Tone.context.state === 'suspended') {
                console.warn('⚠️ AudioContext suspended, resuming...');
                Tone.context.resume();
            }
        }, 1000);
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

        // HQ Drum Synthesis
        const kick = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 10, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 } }).connect(this.output);
        const hihat = new Tone.MetalSynth({ frequency: 200, envelope: { attack: 0.001, decay: 0.1, sustain: 0 }, resonance: 4000 }).connect(this.output);
        this.drumSynths = { kick, hihat };

        this.midi.tracks.forEach((track, index) => {
            track.notes.forEach(note => {
                if (note.time < fromTime) return;
                const time = note.time - fromTime;

                const eventId = Tone.Transport.schedule((t) => {
                    const sampler = this.samplers[index];
                    if (track.channel === 9) {
                        this.drumSynths.kick.triggerAttackRelease("C1", "16n", t, note.velocity);
                    } else if (sampler && sampler.loaded) {
                        // Diagnostic log for first few notes
                        if (note.time < fromTime + 0.1) {
                            console.log(`🎶 Trigger: Track ${index} playing ${note.name} (Vel: ${note.velocity.toFixed(2)})`);
                        }
                        sampler.triggerAttackRelease(note.name, note.duration, t, note.velocity * this.masterVolume * 2.0);
                    } else if (sampler && !sampler.loaded) {
                        console.warn(`⏳ Note missed: Sampler for Track ${index} not yet loaded.`);
                    }
                }, time);
                this.scheduledEvents.push(eventId);
            });
        });
    }

    stop() {
        this.isPlaying = false;

        // Clear keepalive interval
        if (this._keepAliveInterval) {
            clearInterval(this._keepAliveInterval);
            this._keepAliveInterval = null;
        }

        Tone.Transport.stop();
        Tone.Transport.cancel();
        this.scheduledEvents = [];
        if (this.drumSynths) {
            Object.values(this.drumSynths).forEach(s => s.dispose());
            this.drumSynths = null;
        }
        Object.values(this.samplers).forEach(s => s.releaseAll ? s.releaseAll() : null);
    }

    getCurrentTime() {
        if (!this.isPlaying) return this.pauseTime;
        return Tone.now() - this.startTime;
    }

    getAnalysis(currentTime) {
        // Reuse buffers to avoid GC pressure
        if (!this._anaSpectrum) this._anaSpectrum = new Uint8Array(128);
        if (!this._anaWaveform) this._anaWaveform = new Uint8Array(128).fill(128);
        if (!this._anaBars) this._anaBars = new Array(32);

        this._anaSpectrum.fill(0);

        // OPTIMIZATION: Only look at notes around current time instead of filtering ALL notes
        // For now, using a slightly more efficient search or just optimizing the loop
        let bass = 0, mid = 0, high = 0;
        let weightedSum = 0, weightTotal = 0;
        let isBeat = false;

        // Iterate through notes - potentially costly if file is huge, but better than .filter().forEach()
        const noteCount = this.notes.length;
        for (let i = 0; i < noteCount; i++) {
            const n = this.notes[i];

            // Skip notes that haven't started or already ended
            if (n.startTime > currentTime || n.endTime < currentTime) {
                // Peek ahead: if notes are sorted by startTime (they should be), 
                // we can potentially break early if n.startTime > currentTime + dynamic_window
                continue;
            }

            // Process active note
            if (n.note < 48) bass += n.velocity;
            else if (n.note < 72) mid += n.velocity;
            else high += n.velocity;

            weightedSum += n.note * n.velocity;
            weightTotal += n.velocity;

            const bin = Math.floor(((n.note - 21) / 87) * 128);
            if (bin >= 0 && bin < 128) {
                this._anaSpectrum[bin] = Math.max(this._anaSpectrum[bin], n.velocity * 255);
            }

            if (Math.abs(n.startTime - currentTime) < 0.02) isBeat = true;
        }

        for (let i = 0; i < 32; i++) {
            let max = 0;
            const start = Math.floor(i * 128 / 32);
            for (let j = 0; j < 4; j++) {
                if (this._anaSpectrum[start + j] > max) max = this._anaSpectrum[start + j];
            }
            this._anaBars[i] = max / 255;
        }

        const totalEnergy = Math.min(1, bass + mid + high);
        const spectralCentroid = weightTotal > 0 ? (weightedSum / weightTotal) : 60;

        return {
            spectrum: this._anaSpectrum,
            waveform: this._anaWaveform,
            bars: this._anaBars,
            bass: Math.min(1, bass),
            mid: Math.min(1, mid),
            high: Math.min(1, high),
            bassNorm: Math.min(1, bass),
            midNorm: Math.min(1, mid),
            highNorm: Math.min(1, high),
            totalEnergy: totalEnergy * 255,
            spectralCentroid: spectralCentroid,
            isBeat: isBeat,
            channelData: this.getChannelAnalysis ? this.getChannelAnalysis(currentTime) : [],
            isMidi: true
        };
    }

    getChannelIds() { return Object.keys(this.channels).map(Number).sort((a, b) => a - b); }

    getChannelAnalysis(currentTime) {
        const channelIds = this.getChannelIds();
        return channelIds.map(chId => {
            const channelNotes = this.channels[chId];
            let energy = 0;
            let noteCount = 0;
            let isBeat = false;
            const len = channelNotes.length;
            for (let i = 0; i < len; i++) {
                const n = channelNotes[i];
                if (currentTime >= n.startTime && currentTime <= n.endTime) {
                    energy += n.velocity;
                    noteCount++;
                    if (Math.abs(n.startTime - currentTime) < 0.02) isBeat = true;
                }
            }
            return { channelId: chId, energy: Math.min(1, energy), noteCount, isBeat };
        });
    }

    getTransportInfo() {
        if (!this.isPlaying) return { bar: 0, beat: 0, sixteenth: 0, beatProgress: 0 };
        const pos = Tone.Transport.position.split(':');
        return { bar: parseInt(pos[0]), beat: parseInt(pos[1]), sixteenth: parseFloat(pos[2]), beatProgress: (parseFloat(pos[2]) / 4) };
    }
}
