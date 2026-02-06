/**
 * MIDI Player Manager - Unified Interface
 * 
 * This is a facade/adapter that provides a unified API for all MIDI players.
 * app.js only interacts with this manager, never directly with individual players.
 * 
 * To switch players, just change the ACTIVE_PLAYER constant.
 */

// Available player types
export const PlayerType = {
    WAF: 'waf',           // WebAudioFont (simple, CDN-based)
    SPESSA: 'spessa',     // SpessaSynth (High Quality, SoundFont2)
    MIDI_HANDLER: 'midi'  // Original Tone.js handler (fallback)
};

// ===== CHANGE THIS TO SWITCH PLAYERS =====
const ACTIVE_PLAYER = PlayerType.SPESSA;
// ==========================================

class MidiPlayerManager {
    constructor() {
        this.player = null;
        this.playerType = ACTIVE_PLAYER;
        this.isInitialized = false;

        // Unified state
        this.audioContext = null;
        this.mainOutput = null;
        this.midi = null;
        this.duration = 0;
        this.currentTime = 0;
        this.isPlaying = false;
        this.isPaused = false;
        this.onNoteCallback = null;
    }

    async init() {
        if (this.isInitialized) return this.audioContext;

        console.log(`🎵 MidiPlayerManager: Initializing ${this.playerType} player...`);

        switch (this.playerType) {
            case PlayerType.WAF:
                const { WebAudioFontPlayer } = await import('./midi-player-waf.js');
                this.player = new WebAudioFontPlayer();
                break;
            case PlayerType.SPESSA:
                const { SpessaMidiPlayer } = await import('./midi-player-spessa.js');
                this.player = new SpessaMidiPlayer();
                break;
            case PlayerType.MIDI_HANDLER:
            default:
                const { MidiHandler } = await import('./midi-handler.js');
                this.player = new MidiHandler();
                break;
        }

        await this.player.init();

        // Get unified references
        this.audioContext = this.player.audioContext || this.player.getAudioContext?.();
        this.mainOutput = this.player.mainOutput;

        this.isInitialized = true;
        console.log(`✅ MidiPlayerManager: ${this.playerType} ready`);

        return this.audioContext;
    }

    async loadMidi(file) {
        if (!this.isInitialized) {
            await this.init();
        }

        try {
            const result = await this.player.loadMidi(file);

            this.midi = result.midi || this.player.midi;
            this.duration = result.duration || this.player.duration || this.midi?.duration || 0;

            return {
                midi: this.midi,
                duration: this.duration,
                noteCount: result.noteCount || this.player.notes?.length || 0
            };
        } catch (error) {
            console.error('❌ MidiPlayerManager Error:', error);
            alert(error.message); // Alert user immediately
            throw error; // Rethrow to stop playback in app.js
        }
    }

    async play(startTime = 0) {
        if (!this.player) return;
        await this.player.play(startTime);
        this.isPlaying = true;
        this.isPaused = false;
    }

    pause() {
        if (!this.player) return;
        if (this.player.pause) {
            this.player.pause();
        }
        this.isPlaying = false;
        this.isPaused = true;
    }

    resume() {
        if (!this.player) return;
        if (this.player.resume) {
            this.player.resume();
        } else {
            this.player.play(this.getCurrentTime());
        }
        this.isPlaying = true;
        this.isPaused = false;
    }

    stop() {
        if (!this.player) return;
        this.player.stop();
        this.isPlaying = false;
        this.isPaused = false;
    }

    seek(time) {
        if (!this.player) return;
        if (this.player.seek) {
            this.player.seek(time);
        } else {
            // Fallback for players without seek
            this.player.stop();
            this.player.play(time);
        }
    }

    setVolume(value) {
        if (!this.player) return;
        if (this.player.setVolume) {
            this.player.setVolume(value);
        }
    }

    getCurrentTime() {
        if (!this.player) return 0;
        if (this.player.getCurrentTime) {
            return this.player.getCurrentTime();
        }
        return this.player.currentTime || 0;
    }

    getDuration() {
        if (!this.player) return 0;
        if (this.player.getDuration) {
            return this.player.getDuration();
        }
        return this.duration || this.player.duration || this.midi?.duration || 0;
    }

    getIsPlaying() {
        if (!this.player) return false;
        if (this.player.getIsPlaying) {
            return this.player.getIsPlaying();
        }
        return this.player.isPlaying || this.isPlaying;
    }

    getMidi() {
        return this.midi || this.player?.midi;
    }

    getAudioContext() {
        return this.audioContext || this.player?.audioContext;
    }

    getMainOutput() {
        return this.mainOutput || this.player?.mainOutput;
    }

    onNote(callback) {
        this.onNoteCallback = callback;
        if (this.player && this.player.onNote) {
            this.player.onNote(callback);
        }
    }

    // For visualization - get processed notes
    getNotes() {
        if (this.player && this.player.getNotes) {
            return this.player.getNotes();
        }
        return this.player?.notes || [];
    }

    // Get player type info
    getPlayerInfo() {
        return {
            type: this.playerType,
            name: this._getPlayerName(),
            initialized: this.isInitialized
        };
    }

    _getPlayerName() {
        switch (this.playerType) {
            case PlayerType.WAF: return 'WebAudioFont';
            case PlayerType.MIDI_HANDLER: return 'Tone.js MidiHandler';
            default: return 'Unknown';
        }
    }
}

// Singleton instance
const midiPlayerManager = new MidiPlayerManager();

export { MidiPlayerManager, midiPlayerManager };
