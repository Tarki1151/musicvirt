/**
 * SpessaSynth MIDI Player
 * Professional quality MIDI playback using SpessaSynth
 * Features: Real SF2 support, high polyphony, no artifacts
 */

import { WorkletSynthesizer, Sequencer } from 'spessasynth_lib';

// Default SoundFont - we'll use the bundled GeneralUser GS or external
const SOUNDFONT_URL = './soundfonts/FluidR3_GM.sf2';

class SpessaMidiPlayer {
    constructor() {
        this.synth = null;
        this.audioContext = null;
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
        this.soundfontBuffer = null;
    }

    async init() {
        console.log('🎵 SpessaSynth Player: Initializing...');

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

        // Load SoundFont
        console.log('📦 Loading SoundFont...');
        const sfResponse = await fetch(SOUNDFONT_URL);
        this.soundfontBuffer = await sfResponse.arrayBuffer();
        console.log('✅ SoundFont loaded: FluidR3_GM.sf2');

        // Load AudioWorklet Processor (Critical for WorkletSynthesizer)
        try {
            console.log('📦 Loading AudioWorklet Processor...');
            await this.audioContext.audioWorklet.addModule('/spessasynth_processor.js');
        } catch (e) {
            console.error('❌ Failed to load AudioWorklet:', e);
            throw new Error('AudioWorklet yüklenemedi. Tarayıcınız desteklemiyor olabilir.');
        }

        // Initialize SpessaSynth WorkletSynthesizer
        // Start with empty buffer and add explicitly
        this.synth = new WorkletSynthesizer(
            this.audioContext,
            new ArrayBuffer(0)
        );

        // Wait for synth to be ready
        if (this.synth.isReady) {
            await this.synth.isReady;
        }

        // Explicitly add SoundBank
        console.log('📦 Transferring SoundFont to Worklet...');
        await this.synth.soundBankManager.addSoundBank(this.soundfontBuffer, 'main');
        console.log('✅ SoundFont ready in Worklet');

        // Wait for synth to be ready (if isReady is a promise)
        // Note: isReady might be undefined in strict comparison if not yet set
        if (this.synth.isReady) {
            await this.synth.isReady;
        }

        // Connect synth output to our gain node
        this.synth.connect(this.mainOutput);

        console.log(`📊 AudioContext: ${this.audioContext.sampleRate}Hz, ${this.audioContext.state}`);
        console.log('🎛️ SpessaSynth: Professional SF2 synthesis');
        console.log('✅ SpessaSynth Player: Ready');

        return this.audioContext;
    }

    async loadMidi(file) {
        console.log('📂 Loading MIDI:', file.name);

        const arrayBuffer = await file.arrayBuffer();

        // Parse MIDI using @tonejs/midi for visualization data
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

        // Schedule all notes with SpessaSynth
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
        if (this.synth) {
            this.synth.stopAll();
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

window.SpessaMidiPlayer = SpessaMidiPlayer;
export { SpessaMidiPlayer };
