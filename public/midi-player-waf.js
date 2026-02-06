/**
 * WebAudioFont MIDI Player
 * Simple but high quality MIDI playback using WebAudioFont
 * Features: Full GM support, good polyphony, no complex setup
 */

// WebAudioFont will be loaded from CDN
const WEBAUDIOFONT_CDN = 'https://surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js';

class WebAudioFontPlayer {
    constructor() {
        this.player = null;
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
        this.instruments = {};
        this.instrumentsLoaded = false;
    }

    async init() {
        console.log('🎵 WebAudioFont Player: Initializing...');

        // Load WebAudioFont library
        if (!window.WebAudioFontPlayer) {
            await this._loadScript(WEBAUDIOFONT_CDN);
        }

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

        // Initialize WebAudioFont player
        this.player = new WebAudioFontPlayer();

        console.log(`📊 AudioContext: ${this.audioContext.sampleRate}Hz, ${this.audioContext.state}`);
        console.log('✅ WebAudioFont Player: Ready');

        return this.audioContext;
    }

    _loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async _loadInstrument(program, isDrum = false) {
        const key = isDrum ? `drum_${program}` : `inst_${program}`;
        if (this.instruments[key]) return this.instruments[key];

        // Use FluidR3 GM soundfont from WebAudioFont CDN
        const fontName = isDrum
            ? `_drum_${program}_${this._getDrumName(program)}`
            : `_tone_${this._pad(program)}_${this._getInstrumentName(program)}`;

        const url = `https://surikov.github.io/webaudiofontdata/sound/${fontName}_sf2_file.js`;

        try {
            await this._loadScript(url);
            const varName = fontName.replace(/-/g, '_');
            if (window[varName]) {
                this.player.adjustPreset(this.audioContext, window[varName]);
                this.instruments[key] = window[varName];
                return window[varName];
            } else {
                throw new Error(`Variable ${varName} not found after loading script`);
            }
        } catch (e) {
            console.error(`❌ Fatal Error: Could not load instrument ${program} (${isDrum ? 'Drum' : 'Tone'}) from ${url}`);
            throw new Error(`Kritik Hata: Enstrüman yüklenemedi: ${program} - ${this._getInstrumentName(program)}. Dosya bulunamadı veya ağ hatası.`);
        }
        return null;
    }

    _pad(n) {
        return String(n).padStart(3, '0');
    }

    _getInstrumentName(program) {
        const names = [
            'Acoustic_Grand_Piano', 'Bright_Acoustic_Piano', 'Electric_Grand_Piano', 'Honky_tonk_Piano',
            'Electric_Piano_1', 'Electric_Piano_2', 'Harpsichord', 'Clavinet',
            'Celesta', 'Glockenspiel', 'Music_Box', 'Vibraphone',
            'Marimba', 'Xylophone', 'Tubular_Bells', 'Dulcimer',
            'Drawbar_Organ', 'Percussive_Organ', 'Rock_Organ', 'Church_Organ',
            'Reed_Organ', 'Accordion', 'Harmonica', 'Tango_Accordion',
            'Acoustic_Guitar_nylon', 'Acoustic_Guitar_steel', 'Electric_Guitar_jazz', 'Electric_Guitar_clean',
            'Electric_Guitar_muted', 'Overdriven_Guitar', 'Distortion_Guitar', 'Guitar_harmonics',
            'Acoustic_Bass', 'Electric_Bass_finger', 'Electric_Bass_pick', 'Fretless_Bass',
            'Slap_Bass_1', 'Slap_Bass_2', 'Synth_Bass_1', 'Synth_Bass_2',
            'Violin', 'Viola', 'Cello', 'Contrabass',
            'Tremolo_Strings', 'Pizzicato_Strings', 'Orchestral_Harp', 'Timpani',
            'String_Ensemble_1', 'String_Ensemble_2', 'Synth_Strings_1', 'Synth_Strings_2',
            'Choir_Aahs', 'Voice_Oohs', 'Synth_Voice', 'Orchestra_Hit',
            'Trumpet', 'Trombone', 'Tuba', 'Muted_Trumpet',
            'French_Horn', 'Brass_Section', 'Synth_Brass_1', 'Synth_Brass_2',
            'Soprano_Sax', 'Alto_Sax', 'Tenor_Sax', 'Baritone_Sax',
            'Oboe', 'English_Horn', 'Bassoon', 'Clarinet',
            'Piccolo', 'Flute', 'Recorder', 'Pan_Flute',
            'Blown_Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
            'Lead_1_square', 'Lead_2_sawtooth', 'Lead_3_calliope', 'Lead_4_chiff',
            'Lead_5_charang', 'Lead_6_voice', 'Lead_7_fifths', 'Lead_8_bass_lead',
            'Pad_1_new_age', 'Pad_2_warm', 'Pad_3_polysynth', 'Pad_4_choir',
            'Pad_5_bowed', 'Pad_6_metallic', 'Pad_7_halo', 'Pad_8_sweep',
            'FX_1_rain', 'FX_2_soundtrack', 'FX_3_crystal', 'FX_4_atmosphere',
            'FX_5_brightness', 'FX_6_goblins', 'FX_7_echoes', 'FX_8_sci_fi',
            'Sitar', 'Banjo', 'Shamisen', 'Koto',
            'Kalimba', 'Bag_pipe', 'Fiddle', 'Shanai',
            'Tinkle_Bell', 'Agogo', 'Steel_Drums', 'Woodblock',
            'Taiko_Drum', 'Melodic_Tom', 'Synth_Drum', 'Reverse_Cymbal',
            'Guitar_Fret_Noise', 'Breath_Noise', 'Seashore', 'Bird_Tweet',
            'Telephone_Ring', 'Helicopter', 'Applause', 'Gunshot'
        ];
        return names[program] || 'Acoustic_Grand_Piano';
    }

    _getDrumName(program) {
        return 'Standard';
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

        // Preload instruments
        console.log('📦 Loading instruments...');
        const programs = new Set();
        for (const track of this.midi.tracks) {
            if (track.instrument) {
                programs.add(track.instrument.number || 0);
            }
        }

        for (const program of programs) {
            await this._loadInstrument(program);
        }
        console.log(`✅ Loaded ${programs.size} instruments`);

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
                    channel: track.channel || 0,
                    program: track.instrument?.number || 0
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

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        this.stop();

        this.isPlaying = true;
        this.isPaused = false;
        this.startTimestamp = performance.now() - (startTime * 1000);
        this.pauseOffset = startTime;

        this._scheduleNotes(startTime);

        console.log(`▶️ Playing from ${startTime.toFixed(2)}s`);

        this._startTimeTracking();
    }

    _scheduleNotes(fromTime = 0) {
        this.scheduledEvents.forEach(id => clearTimeout(id));
        this.scheduledEvents = [];

        for (const note of this.notes) {
            if (note.startTime < fromTime) continue;

            const delay = (note.startTime - fromTime) * 1000;

            const eventId = setTimeout(() => {
                if (!this.isPlaying) return;

                const key = `inst_${note.program}`;
                const instrument = this.instruments[key];

                if (instrument && this.player) {
                    const velocity = note.velocity * this.masterVolume;
                    this.player.queueWaveTable(
                        this.audioContext,
                        this.mainOutput,
                        instrument,
                        this.audioContext.currentTime,
                        note.note,
                        note.duration,
                        velocity
                    );
                }

                if (this.onNoteCallback) {
                    this.onNoteCallback({
                        pitch: note.note,
                        velocity: note.velocity,
                        startTime: note.startTime,
                        endTime: note.endTime,
                        channel: note.channel
                    });
                }
            }, delay);

            this.scheduledEvents.push(eventId);
        }

        console.log(`📅 Scheduled ${this.scheduledEvents.length} notes`);
    }

    _startTimeTracking() {
        const updateTime = () => {
            if (!this.isPlaying) return;

            const elapsed = (performance.now() - this.startTimestamp) / 1000;
            this.currentTime = Math.min(elapsed, this.duration);

            if (this.currentTime >= this.duration) {
                this.isPlaying = false;
                console.log('🏁 Playback finished');
                return;
            }

            this.animationFrame = requestAnimationFrame(updateTime);
        };

        updateTime();
    }

    pause() {
        if (!this.isPlaying) return;

        // Clear scheduled notes
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
        // Clear scheduled notes
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

    getNotes() {
        return this.notes;
    }
}

window.WebAudioFontPlayer = WebAudioFontPlayer;
export { WebAudioFontPlayer };
