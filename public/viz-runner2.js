import { Visualizer } from './visualizer-base.js';

/**
 * Runner 2: Piano Roll Visualization
 * A Synthesia-style vertical piano visualizer
 * Notes fall from top to bottom onto an 88-key piano keyboard
 */
export class Runner2 extends Visualizer {
    constructor(canvas) {
        super(canvas);
        console.log('🎼 Runner2: Loaded Version 20260202_2015');
        this.name = "Piano Roll";
        this.keys = [];
        this.fallingNotes = [];
        this.noteSpeed = 250; // Pixels per second
        this.keyboardHeight = 280; // Shifted up significantly to clear UI

        // Define full piano range (A0 to C8)
        this.minNote = 21; // A0
        this.maxNote = 108; // C8

        this.initKeys();
    }

    resize(width, height) {
        super.resize(width, height);
        this.updateKeyLayout();
    }

    initKeys() {
        this.keys = [];
        const whiteKeys = [];

        for (let i = this.minNote; i <= this.maxNote; i++) {
            const noteInOctave = i % 12;
            const isBlack = [1, 3, 6, 8, 10].includes(noteInOctave);

            const key = {
                note: i,
                isBlack: isBlack,
                active: false,
                color: isBlack ? '#000' : '#fff',
                activeColor: null,
                x: 0, y: 0, w: 0, h: 0
            };

            this.keys.push(key);
            if (!isBlack) whiteKeys.push(key);
        }

        this.whiteKeyCount = whiteKeys.length;
        this.updateKeyLayout();
    }

    updateKeyLayout() {
        if (!this.keys.length) return;

        const keyWidth = this.width / this.whiteKeyCount;
        const blackKeyWidth = keyWidth * 0.7;
        const keyDrawHeight = 120; // Fixed key height
        const blackKeyHeight = keyDrawHeight * 0.65;

        let x = 0;
        // Position white keys
        this.keys.forEach(key => {
            if (!key.isBlack) {
                key.x = x;
                key.width = keyWidth;
                key.height = keyDrawHeight;
                key.y = this.height - this.keyboardHeight;
                x += keyWidth;
            }
        });

        // Position black keys
        this.keys.forEach((key, index) => {
            if (key.isBlack) {
                const prevKey = this.keys[index - 1]; // white key
                if (prevKey) {
                    key.x = prevKey.x + (prevKey.width * 0.65);
                    key.width = blackKeyWidth;
                    key.height = blackKeyHeight;
                    key.y = this.height - this.keyboardHeight;
                }
            }
        });
    }

    update(analysis, dt) {
        super.update(analysis, dt);
        if (!this.canvas) return;
        this.showMidiWarning = !analysis.isMidi;

        const handler = window.app && window.app.midiHandler;
        if (!handler || !handler.midi) {
            this.fallingNotes = [];
            return;
        }

        const currentTime = (this.analysis && this.analysis.currentTime) || 0;
        this.fallingNotes = [];

        // Reset Keys
        this.keys.forEach(k => k.active = false);

        // Process notes
        if (handler.notes) {
            handler.notes.forEach(note => {
                // Active state
                if (currentTime >= note.startTime && currentTime < note.endTime) {
                    const key = this.keys.find(k => k.note === note.note);
                    if (key) {
                        key.active = true;
                        key.activeColor = this.getChannelColor(note.channel);
                    }
                }

                // Falling visualization
                const timeToHit = note.startTime - currentTime;
                if (timeToHit < 4.0 && note.endTime > currentTime) {
                    const key = this.keys.find(k => k.note === note.note);
                    if (key) {
                        const hitY = this.height - this.keyboardHeight;
                        const noteBottomY = hitY - (timeToHit * this.noteSpeed);
                        const noteHeight = note.duration * this.noteSpeed;

                        this.fallingNotes.push({
                            x: key.x,
                            y: noteBottomY - noteHeight,
                            w: key.width,
                            h: noteHeight,
                            color: this.getChannelColor(note.channel),
                            isBlack: key.isBlack,
                            active: currentTime >= note.startTime
                        });
                    }
                }
            });
        }
    }

    getChannelColor(channel) {
        const hue = (channel * 137.5) % 360;
        return `hsl(${hue}, 80%, 60%)`;
    }

    render() {
        const ctx = this.ctx;
        if (!ctx) return;

        // Background
        ctx.fillStyle = '#050508';
        ctx.fillRect(0, 0, this.width, this.height);

        // Lanes
        ctx.globalAlpha = 0.1;
        ctx.strokeStyle = '#222';
        this.keys.forEach(key => {
            if (!key.isBlack) {
                ctx.strokeRect(key.x, 0, key.width, this.height - this.keyboardHeight);
            }
        });
        ctx.globalAlpha = 1.0;

        // Falling Notes
        this.fallingNotes.sort((a, b) => (a.isBlack ? 1 : 0) - (b.isBlack ? 1 : 0));
        this.fallingNotes.forEach(note => {
            const hitLine = this.height - this.keyboardHeight;
            let displayY = note.y;
            let displayH = note.h;

            // Clip
            if (displayY + displayH > hitLine) {
                displayH = hitLine - displayY;
            }
            if (displayH <= 0 || displayY > hitLine) return;

            ctx.fillStyle = note.color;
            const w = note.w * 0.85;
            const x = note.x + (note.w - w) / 2;

            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x, displayY, w, displayH, 4);
            else ctx.rect(x, displayY, w, displayH);
            ctx.fill();

            if (note.active) {
                ctx.shadowBlur = 20;
                ctx.shadowColor = note.color;
                ctx.fillStyle = '#fff';
                ctx.fillRect(x, hitLine - 4, w, 4);
                ctx.shadowBlur = 0;
            }
        });

        // Keyboard
        this.keys.forEach(key => { if (!key.isBlack) this.drawKey(ctx, key); });
        this.keys.forEach(key => { if (key.isBlack) this.drawKey(ctx, key); });

        if (this.showMidiWarning) {
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.font = '16px Inter';
            ctx.textAlign = 'center';
            ctx.fillText("MIDI data required for full piano roll", this.width / 2, 50);
        }
    }

    drawKey(ctx, key) {
        const { x, y, width: w, height: h, active, isBlack, activeColor, note } = key;
        ctx.beginPath();

        if (active) {
            ctx.fillStyle = activeColor;
            ctx.shadowBlur = 15;
            ctx.shadowColor = activeColor;
        } else {
            if (isBlack) {
                ctx.fillStyle = '#111';
            } else {
                ctx.fillStyle = '#eee';
            }
            ctx.shadowBlur = 0;
        }

        if (ctx.roundRect) ctx.roundRect(x, y, w, h, [0, 0, 4, 4]);
        else ctx.rect(x, y, w, h);

        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw Note Labels
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const noteName = names[note % 12];
        const octave = Math.floor(note / 12) - 1;
        const fullLabel = noteName + octave;

        ctx.textAlign = 'center';
        const fontSize = Math.max(6, Math.min(10, w * 0.4));
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;

        if (isBlack) {
            ctx.fillStyle = active ? '#fff' : 'rgba(255,255,255,0.4)';
            ctx.fillText(fullLabel, x + w / 2, y + h * 0.7);
        } else {
            ctx.fillStyle = active ? '#fff' : 'rgba(0,0,0,0.5)';
            ctx.fillText(fullLabel, x + w / 2, y + h - 10);
        }
    }

    getName() { return 'Piano Roll'; }
}
