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
        this.instruments = {};
        this.notes = [];
        this.channels = {};
        this.isPlaying = false;
        this.startTime = 0;
        this.pauseTime = 0;
        this.tempo = 120;
        this.scheduledEvents = [];
        this.masterVolume = 0.8;
        this.audioContext = null;
        this.drumSynths = null;
    }

    async init(audioContext) {
        if (audioContext) {
            await Tone.setContext(audioContext);
            this.audioContext = audioContext;
        } else {
            await Tone.start();
            this.audioContext = Tone.context.rawContext;
        }
        Tone.Destination.volume.value = Tone.gainToDb(this.masterVolume);
    }

    async loadMidiFile(file) {
        try {
            this.stop();
            this.instruments = {};

            const arrayBuffer = await file.arrayBuffer();
            this.midi = new Midi(arrayBuffer);

            if (this.midi.header.tempos.length > 0) {
                this.tempo = this.midi.header.tempos[0].bpm;
            }

            this.processNotes();

            // Start loading instruments in background but DONT WAIT
            this.loadInstruments();

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

    async loadInstruments() {
        if (!Soundfont) return;

        // The Vite middleware (in vite.config.js) will auto-download missing files
        // and save them to /public/soundfonts/FluidR3_GM/ on the first request.
        const options = { soundfont: 'FluidR3_GM', from: './soundfonts/FluidR3_GM/' };

        this.midi.tracks.forEach((track, index) => {
            if (track.notes.length === 0 || track.channel === 9) return;
            let cleanName = this.cleanInstrumentName(track.instrument.name);

            Soundfont.instrument(this.audioContext, cleanName, options)
                .then(inst => {
                    console.log(`Loaded ${cleanName}`);
                    this.instruments[index] = inst;
                })
                .catch(() => {
                    console.warn(`Failed to load ${cleanName}, using synth fallback.`);
                    this.instruments[index] = 'fallback_synth';
                });
        });
    }

    cleanInstrumentName(name) {
        if (!name) return 'acoustic_grand_piano';
        let clean = name.toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, '').replace(/_+/g, '_');
        const fixes = { 'synthbrass_1': 'synth_brass_1', 'synthbrass_2': 'synth_brass_2' };
        if (fixes[clean]) return fixes[clean];
        if (clean.startsWith('synth') && !clean.startsWith('synth_')) clean = clean.replace('synth', 'synth_');
        return clean;
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

        // Increase polyphony to 128 to handle complex MIDI
        const drumSynth = new Tone.PolySynth(Tone.MembraneSynth, {
            maxPolyphony: 64
        }).toDestination();

        const hatSynth = new Tone.PolySynth(Tone.MetalSynth, {
            maxPolyphony: 32
        }).toDestination();

        const fallbackSynth = new Tone.PolySynth(Tone.Synth, {
            maxPolyphony: 128,
            oscillator: { type: 'triangle' }
        }).toDestination();

        this.drumSynths = { drum: drumSynth, hat: hatSynth, fallback: fallbackSynth };

        this.midi.tracks.forEach((track, index) => {
            const instrument = this.instruments[index] || 'fallback_synth';
            track.notes.forEach(note => {
                if (note.time < fromTime) return;
                const time = note.time - fromTime;
                const eventId = Tone.Transport.schedule((t) => {
                    // Check instrument status AT THE MOMENT of playing
                    const currentInstrument = this.instruments[index];

                    if (track.channel === 9) {
                        if (this.drumSynths) {
                            if (note.midi === 35 || note.midi === 36) this.drumSynths.drum.triggerAttackRelease("C1", "16n", t, note.velocity);
                            else if (note.midi >= 42 && note.midi <= 46) this.drumSynths.hat.triggerAttackRelease("32n", t, note.velocity * 0.5);
                        }
                    } else if (!currentInstrument || currentInstrument === 'fallback_synth') {
                        // Still loading or failed? Use fallback
                        if (this.drumSynths) this.drumSynths.fallback.triggerAttackRelease(note.name, note.duration, t, note.velocity * 0.4);
                    } else {
                        // Real instrument loaded!
                        try {
                            currentInstrument.play(note.midi, t, {
                                duration: note.duration,
                                gain: note.velocity * this.masterVolume * 2
                            });
                        } catch (e) {
                            if (this.drumSynths) this.drumSynths.fallback.triggerAttackRelease(note.name, note.duration, t, note.velocity * 0.4);
                        }
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
            this.drumSynths.drum.dispose();
            this.drumSynths.hat.dispose();
            this.drumSynths.fallback.dispose();
            this.drumSynths = null;
        }
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
            bassNorm: Math.min(1, bass),
            midNorm: Math.min(1, mid),
            highNorm: Math.min(1, high),
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
