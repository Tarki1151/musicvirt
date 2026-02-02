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
    }

    // High Quality Sample Mapping
    static GM_TO_SAMPLE = {
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

    static NOTES = ['A0', 'C1', 'Ds1', 'Fs1', 'A1', 'C2', 'Ds2', 'Fs2', 'A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6', 'Ds6', 'Fs6', 'A6', 'C7', 'Ds7', 'Fs7', 'A7'];

    static GM_MAP = {
        0: 'acoustic_grand_piano', 1: 'bright_acoustic_piano', 2: 'electric_grand_piano', 3: 'honkytonk_piano',
        24: 'acoustic_guitar_nylon', 25: 'acoustic_guitar_steel', 26: 'electric_guitar_jazz',
        32: 'acoustic_bass', 33: 'electric_bass_finger', 40: 'violin', 42: 'cello', 43: 'contrabass',
        48: 'string_ensemble_1', 56: 'trumpet', 60: 'french_horn', 68: 'oboe', 70: 'bassoon', 71: 'clarinet', 73: 'flute'
    };

    async init(sharedContext) {
        console.log('🎵 Audio: Initializing Engine...');
        if (this.reverb) {
            console.log('ℹ️ Audio: Engine already initialized.');
            return;
        }

        if (sharedContext) {
            console.log('🔗 Audio: Connecting to shared context:', sharedContext.state);
            await Tone.setContext(sharedContext);
            this.audioContext = sharedContext;
        } else {
            console.log('🚀 Audio: Starting new Tone context...');
            await Tone.start();
            this.audioContext = Tone.context.rawContext;
        }
        console.log('📊 Audio: Context State:', Tone.context.state);

        // Initialize output node within the Correct Context
        this.output = new Tone.Gain(1.2);

        // Setup Mastering Chain within the active context
        this.limiter = new Tone.Limiter(-1).toDestination();
        this.compressor = new Tone.Compressor({ threshold: -18, ratio: 4 }).connect(this.limiter);
        this.eq = new Tone.EQ3({ low: 3, mid: 0, high: -3 }).connect(this.compressor);
        this.filter = new Tone.Filter(12000, "lowpass").connect(this.eq);

        this.reverb = new Tone.Reverb({ decay: 4, wet: 0.35 }).connect(this.filter);
        await this.reverb.ready;

        this.chorus = new Tone.Chorus(4, 2.5, 0.5).connect(this.reverb);
        this.chorus.wet.value = 0.1;

        // Route our permanent output through the new effects chain
        this.output.connect(this.chorus);
        console.log('🛣️ Audio: Signal chain connected (Output -> Chorus -> Reverb -> Filter -> EQ -> Compressor -> Limiter -> Destination)');

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
        const promises = [];
        this.midi.tracks.forEach((track, index) => {
            if (track.notes.length === 0 || track.channel === 9) return;

            const prg = track.instrument ? track.instrument.number : 0;
            const instName = track.instrument ? track.instrument.name : 'Unknown';
            let lib = MidiHandler.GM_TO_SAMPLE[prg] || 'piano';

            // Check manifest for availability, fallback to piano if missing
            if (!this.sampleManifest || !this.sampleManifest[lib] || this.sampleManifest[lib].length === 0) {
                console.warn(`⚠️ Track ${index}: [${lib.toUpperCase()}] samples not found. Falling back to PIANO.`);
                lib = 'piano';
            }

            console.log(`🎹 Track ${index}: "${instName}" (Prog: ${prg}) -> Mapping to Library: [${lib.toUpperCase()}]`);

            const samples = {};
            const availableFiles = this.sampleManifest ? this.sampleManifest[lib] : [];

            if (availableFiles.length === 0) {
                console.error(`❌ Track ${index}: No samples available for [${lib.toUpperCase()}]. Track will be silent.`);
                return;
            }

            // Map filenames to Tone.js scientific notation
            availableFiles.forEach(fileName => {
                const noteName = fileName.replace('.mp3', '')
                    .replace('Ds', 'D#')
                    .replace('Fs', 'F#')
                    .replace('As', 'A#')
                    .replace('Gs', 'G#')
                    .replace('Cs', 'C#');
                samples[noteName] = fileName;
            });

            console.log(`📥 Track ${index}: Loading ${Object.keys(samples).length} samples for [${lib.toUpperCase()}]`);

            const sampler = new Tone.Sampler({
                urls: samples,
                baseUrl: `./samples/${lib}/`,
                attack: 0.1,
                release: 1.2,
                curve: "exponential",
                onload: () => {
                    console.log(`✅ Track ${index}: [${lib.toUpperCase()}] ready.`);
                },
                onerror: (err) => {
                    console.error(`❌ Track ${index}: Failed to decode [${lib.toUpperCase()}].`, err);
                }
            });

            // Connect if initialized, otherwise wait
            if (this.output) sampler.connect(this.output);

            this.samplers[index] = sampler;
            // Native way to wait for a Sampler to be ready
            promises.push(new Promise(resolve => {
                const checkLoaded = () => {
                    if (sampler.loaded) resolve();
                    else setTimeout(checkLoaded, 50);
                };
                checkLoaded();
            }));
        });

        // Progressive loading: Wait for first few to start, others load in background
        await Promise.all(promises.slice(0, 3));
    }

    async play(startTime = 0) {
        console.log('▶️ Playback: Starting at', startTime.toFixed(2), 's');
        this.stop();
        if (!this.midi) {
            console.warn('⚠️ Playback: No MIDI file loaded.');
            return;
        }

        await Tone.start();
        console.log('🔊 Audio: Context State After Play:', Tone.context.state);

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
        const totalEnergy = Math.min(1, bass + mid + high);

        // Calculate spectral centroid for MIDI (average pitch)
        let weightedSum = 0, weightTotal = 0;
        activeNotes.forEach(n => {
            weightedSum += n.note * n.velocity;
            weightTotal += n.velocity;
        });
        const spectralCentroid = weightTotal > 0 ? (weightedSum / weightTotal) : 60;

        return {
            spectrum,
            waveform: new Uint8Array(128).fill(128),
            bars,
            bass: Math.min(1, bass),
            mid: Math.min(1, mid),
            high: Math.min(1, high),
            bassNorm: Math.min(1, bass),
            midNorm: Math.min(1, mid),
            highNorm: Math.min(1, high),
            totalEnergy: totalEnergy * 255,
            spectralCentroid: spectralCentroid,
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
