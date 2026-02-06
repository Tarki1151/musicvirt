/**
 * High Quality MIDI Player
 * Uses Magenta.js SoundFontPlayer for professional quality audio
 * SGM+ SoundFont - Studio quality General MIDI sounds
 */

// SoundFont URLs - High quality options
const SOUNDFONTS = {
    sgm_plus: 'https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus',
    salamander: 'https://storage.googleapis.com/magentadata/js/soundfonts/salamander'
};

class HQMidiPlayer {
    constructor() {
        this.player = null;
        this.midi = null;
        this.noteSequence = null;
        this.isPlaying = false;
        this.isPaused = false;
        this.currentTime = 0;
        this.duration = 0;
        this.masterVolume = 1.0;
        this.audioContext = null;
        this.onNoteCallback = null;
        this.animationFrame = null;
        this.startTimestamp = 0;
        this.pauseOffset = 0;

        // Load Magenta core library
        this._loadMagenta();
    }

    async _loadMagenta() {
        if (window.core) {
            console.log('✅ Magenta.js already loaded');
            return;
        }

        console.log('📦 Loading Tone.js + Magenta.js...');

        // Load Tone.js first (required by Magenta)
        if (!window.Tone) {
            await new Promise((resolve, reject) => {
                const toneScript = document.createElement('script');
                toneScript.src = 'https://cdn.jsdelivr.net/npm/tone@14.7.58';
                toneScript.onload = () => {
                    console.log('✅ Tone.js loaded');
                    resolve();
                };
                toneScript.onerror = reject;
                document.head.appendChild(toneScript);
            });
        }

        // Then load Magenta.js
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@magenta/music@1.23.1/es6/core.js';
            script.onload = () => {
                console.log('✅ Magenta.js loaded successfully');
                resolve();
            };
            script.onerror = (err) => {
                console.error('❌ Failed to load Magenta.js', err);
                reject(err);
            };
            document.head.appendChild(script);
        });
    }

    async init() {
        console.log('🎵 HQ MIDI Player: Initializing...');

        // Wait for Magenta to load
        await this._loadMagenta();

        // Initialize audio using Tone.js context
        await Tone.start();
        this.audioContext = Tone.context.rawContext;

        // Resume if suspended
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        // Simple output - no effects chain
        this.mainOutput = new Tone.Gain(0.8).toDestination();

        console.log(`📊 AudioContext: ${this.audioContext.sampleRate}Hz, ${this.audioContext.state}`);

        // Initialize SoundFont player with SGM+ (high quality)
        // Pass undefined for output to let Magenta handle routing
        this.player = new core.SoundFontPlayer(SOUNDFONTS.sgm_plus);

        // Set callback for note events
        this.player.callbackObject = {
            run: (note) => this._onNote(note),
            stop: () => { }
        };

        console.log('✅ HQ MIDI Player: Ready with SGM+ SoundFont');
        return this.audioContext;
    }

    async loadMidi(file) {
        console.log('📂 Loading MIDI:', file.name);

        const arrayBuffer = await file.arrayBuffer();

        // Parse MIDI using Magenta
        this.noteSequence = await core.urlToNoteSequence(URL.createObjectURL(new Blob([arrayBuffer])));

        // Store raw MIDI data for visualization
        const { Midi } = await import('https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/+esm');
        this.midi = new Midi(arrayBuffer);

        this.duration = this.noteSequence.totalTime;
        this.currentTime = 0;
        this.pauseOffset = 0;

        console.log(`✅ MIDI loaded: ${this.noteSequence.notes.length} notes, ${this.duration.toFixed(2)}s`);
        console.log(`🎹 Instruments: ${[...new Set(this.noteSequence.notes.map(n => n.program))].length} unique`);

        return {
            duration: this.duration,
            noteCount: this.noteSequence.notes.length,
            midi: this.midi
        };
    }

    _onNote(note) {
        // Callback for each note - used for visualization
        if (this.onNoteCallback) {
            this.onNoteCallback({
                pitch: note.pitch,
                velocity: note.velocity,
                startTime: note.startTime,
                endTime: note.endTime,
                program: note.program || 0
            });
        }
    }

    async play(startTime = 0) {
        if (!this.noteSequence) {
            console.warn('⚠️ No MIDI loaded');
            return;
        }

        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        // Load instruments (if not already loaded)
        console.log('🎻 Loading SoundFont instruments...');
        await this.player.loadSamples(this.noteSequence);
        console.log('✅ All instruments loaded');

        // Start playback
        this.isPlaying = true;
        this.isPaused = false;
        this.startTimestamp = performance.now() - (startTime * 1000);
        this.pauseOffset = startTime;

        // Create a sliced sequence if starting from specific time
        let sequenceToPlay = this.noteSequence;
        if (startTime > 0) {
            sequenceToPlay = this._sliceSequence(this.noteSequence, startTime);
        }

        console.log(`▶️ Playing from ${startTime.toFixed(2)}s`);

        // Start the player
        this.player.start(sequenceToPlay).then(() => {
            console.log('🏁 Playback finished');
            this.isPlaying = false;
        });

        // Start time tracking
        this._startTimeTracking();
    }

    _sliceSequence(seq, fromTime) {
        // Create a new sequence starting from the specified time
        const newSeq = {
            ...seq,
            notes: seq.notes
                .filter(n => n.endTime > fromTime)
                .map(n => ({
                    ...n,
                    startTime: Math.max(0, n.startTime - fromTime),
                    endTime: n.endTime - fromTime
                })),
            totalTime: seq.totalTime - fromTime
        };
        return newSeq;
    }

    _startTimeTracking() {
        const updateTime = () => {
            if (!this.isPlaying) return;

            const elapsed = (performance.now() - this.startTimestamp) / 1000;
            this.currentTime = Math.min(elapsed, this.duration);

            if (this.currentTime >= this.duration) {
                this.isPlaying = false;
                return;
            }

            this.animationFrame = requestAnimationFrame(updateTime);
        };

        updateTime();
    }

    pause() {
        if (!this.isPlaying) return;

        this.player.stop();
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
        this.player?.stop();
        this.isPlaying = false;
        this.isPaused = false;
        this.currentTime = 0;
        this.pauseOffset = 0;

        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }

        console.log('⏹️ Stopped');
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
        // Control volume via main output gain
        if (this.mainOutput && this.mainOutput.gain) {
            // Tone.Gain uses .gain.value or .gain.rampTo
            this.mainOutput.gain.rampTo(value, 0.1);
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

    // Set callback for note events (for visualization)
    onNote(callback) {
        this.onNoteCallback = callback;
    }

    getAudioContext() {
        return this.audioContext;
    }
}

// Export for use
window.HQMidiPlayer = HQMidiPlayer;
export { HQMidiPlayer };
