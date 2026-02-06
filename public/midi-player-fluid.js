/**
 * FluidSynth MIDI Player
 * Uses js-synthesizer (FluidSynth WebAssembly) for professional quality MIDI playback
 * Features: 256 polyphony, real SF2 soundfonts, no metallic artifacts
 */

import { Synthesizer, waitForReady } from 'js-synthesizer';

// Soundfont path
const SOUNDFONT_PATH = './soundfonts/FluidR3_GM.sf2';

class FluidMidiPlayer {
    constructor() {
        this.synth = null;
        this.audioContext = null;
        this.audioNode = null;
        this.midi = null;
        this.isPlaying = false;
        this.isPaused = false;
        this.currentTime = 0;
        this.duration = 0;
        this.masterVolume = 1.0;
        this.startTimestamp = 0;
        this.pauseOffset = 0;
        this.animationFrame = null;
        this.scheduledEvents = [];
        this.notes = [];
        this.onNoteCallback = null;
        this.mainOutput = null;
    }

    async init() {
        console.log('🎵 FluidSynth Player: Initializing...');

        // Create audio context
        this.audioContext = new AudioContext({
            latencyHint: 'playback',
            sampleRate: 44100
        });

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        // Create main output gain for volume control and recording
        this.mainOutput = this.audioContext.createGain();
        this.mainOutput.gain.value = this.masterVolume;
        this.mainOutput.connect(this.audioContext.destination);

        // Initialize FluidSynth WASM
        await waitForReady();
        console.log('✅ FluidSynth WASM loaded');

        // Create synthesizer
        this.synth = new Synthesizer();
        this.synth.init(this.audioContext.sampleRate);

        // Set synthesizer settings
        this.synth.setGain(0.5); // Moderate gain to prevent clipping

        // Create audio worklet node for real-time audio
        await this.synth.createAudioNode(this.audioContext);
        this.audioNode = this.synth.node;

        if (this.audioNode) {
            this.audioNode.connect(this.mainOutput);
            console.log('✅ Audio node connected');
        }

        // Load soundfont
        console.log('📦 Loading SoundFont...');
        const sfResponse = await fetch(SOUNDFONT_PATH);
        const sfBuffer = await sfResponse.arrayBuffer();
        this.sfontId = await this.synth.loadSFont(sfBuffer);
        console.log('✅ SoundFont loaded: FluidR3_GM.sf2');

        console.log(`📊 AudioContext: ${this.audioContext.sampleRate}Hz, ${this.audioContext.state}`);
        console.log('🎛️ FluidSynth: High polyphony, professional quality');
        console.log('✅ FluidSynth Player: Ready');

        return this.audioContext;
    }

    async loadMidi(file) {
        console.log('📂 Loading MIDI:', file.name);

        const arrayBuffer = await file.arrayBuffer();

        // Parse MIDI using @tonejs/midi
        const { Midi } = await import('https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/+esm');
        this.midi = new Midi(arrayBuffer);

        this.duration = this.midi.duration;
        this.currentTime = 0;
        this.pauseOffset = 0;

        // Process notes for visualization
        this._processNotes();

        console.log(`✅ MIDI loaded: ${this.notes.length} notes, ${this.duration.toFixed(2)}s`);
        console.log(`🎹 Tracks: ${this.midi.tracks.length}`);

        return {
            duration: this.duration,
            noteCount: this.notes.length,
            midi: this.midi
        };
    }

    _processNotes() {
        this.notes = [];
        for (const track of this.midi.tracks) {
            for (const note of track.notes) {
                this.notes.push({
                    note: note.midi,
                    name: note.name,
                    velocity: note.velocity,
                    startTime: note.time,
                    endTime: note.time + note.duration,
                    duration: note.duration,
                    channel: track.channel || 0
                });
            }
        }
        this.notes.sort((a, b) => a.startTime - b.startTime);
    }

    async play(startTime = 0) {
        if (!this.midi) {
            console.warn('⚠️ No MIDI loaded');
            return;
        }

        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        this.stop(); // Clear previous playback

        this.isPlaying = true;
        this.isPaused = false;
        this.startTimestamp = performance.now() - (startTime * 1000);
        this.pauseOffset = startTime;

        // Schedule all notes
        this._scheduleNotes(startTime);

        console.log(`▶️ Playing from ${startTime.toFixed(2)}s`);

        // Start time tracking
        this._startTimeTracking();
    }

    _scheduleNotes(fromTime = 0) {
        this.scheduledEvents.forEach(id => clearTimeout(id));
        this.scheduledEvents = [];

        this.midi.tracks.forEach((track, trackIndex) => {
            const channel = track.channel !== undefined ? track.channel : trackIndex % 16;

            // Set instrument for this channel
            if (track.instrument && track.instrument.number !== undefined) {
                const program = track.instrument.number;
                this.synth.programChange(channel, program);
            }

            track.notes.forEach(note => {
                if (note.time < fromTime) return;

                const noteOnDelay = (note.time - fromTime) * 1000;
                const noteOffDelay = (note.time + note.duration - fromTime) * 1000;

                // Note On
                const noteOnId = setTimeout(() => {
                    if (!this.isPlaying) return;
                    const velocity = Math.round(note.velocity * 127);
                    this.synth.noteOn(channel, note.midi, velocity);

                    // Callback for visualization
                    if (this.onNoteCallback) {
                        this.onNoteCallback({
                            pitch: note.midi,
                            velocity: note.velocity,
                            startTime: note.time,
                            endTime: note.time + note.duration,
                            channel: channel
                        });
                    }
                }, noteOnDelay);

                // Note Off
                const noteOffId = setTimeout(() => {
                    if (!this.isPlaying) return;
                    this.synth.noteOff(channel, note.midi);
                }, noteOffDelay);

                this.scheduledEvents.push(noteOnId, noteOffId);
            });
        });

        console.log(`📅 Scheduled ${this.scheduledEvents.length / 2} notes`);
    }

    _startTimeTracking() {
        const updateTime = () => {
            if (!this.isPlaying) return;

            const elapsed = (performance.now() - this.startTimestamp) / 1000;
            this.currentTime = Math.min(elapsed, this.duration);

            if (this.currentTime >= this.duration) {
                this.isPlaying = false;
                this._allNotesOff();
                console.log('🏁 Playback finished');
                return;
            }

            this.animationFrame = requestAnimationFrame(updateTime);
        };

        updateTime();
    }

    _allNotesOff() {
        // Turn off all notes on all channels
        for (let ch = 0; ch < 16; ch++) {
            this.synth.allNotesOff(ch);
        }
    }

    pause() {
        if (!this.isPlaying) return;

        this._allNotesOff();
        this.scheduledEvents.forEach(id => clearTimeout(id));
        this.scheduledEvents = [];

        this.isPaused = true;
        this.isPlaying = false;
        this.pauseOffset = this.currentTime;

        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }

        console.log(`⏸️ Paused at ${this.currentTime.toFixed(2)}s`);
    }

    resume() {
        if (!this.isPaused) return;
        this.play(this.pauseOffset);
    }

    stop() {
        this._allNotesOff();
        this.scheduledEvents.forEach(id => clearTimeout(id));
        this.scheduledEvents = [];

        this.isPlaying = false;
        this.isPaused = false;
        this.currentTime = 0;
        this.pauseOffset = 0;

        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
    }

    seek(time) {
        const wasPlaying = this.isPlaying;
        this.stop();
        this.pauseOffset = time;
        this.currentTime = time;

        if (wasPlaying) {
            this.play(time);
        }
    }

    setVolume(value) {
        this.masterVolume = value;
        if (this.mainOutput) {
            this.mainOutput.gain.setValueAtTime(value, this.audioContext.currentTime);
        }
        // Also update synth gain
        if (this.synth) {
            this.synth.setGain(value * 0.5);
        }
    }

    getCurrentTime() {
        return this.currentTime;
    }

    getDuration() {
        return this.duration;
    }

    getIsPlaying() {
        return this.isPlaying;
    }

    getMidi() {
        return this.midi;
    }

    onNote(callback) {
        this.onNoteCallback = callback;
    }

    getAudioContext() {
        return this.audioContext;
    }

    // For visualization - returns processed notes
    getNotes() {
        return this.notes;
    }
}

window.FluidMidiPlayer = FluidMidiPlayer;
export { FluidMidiPlayer };
