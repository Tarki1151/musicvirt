import { Visualizer } from './visualizer-base.js';

/**
 * Road Runner 3: Musical Staff Visualizer
 * Instead of dots, real musical symbols flow across a staff.
 */
export class RoadRunner3 extends Visualizer {
    constructor(canvas) {
        super(canvas);

        this.trackColors = [
            [255, 100, 100],  // Red
            [100, 255, 100],  // Green
            [100, 150, 255],  // Blue
            [255, 200, 50],   // Gold
            [255, 80, 255],   // Pink
            [80, 255, 255],   // Cyan
        ];

        this.tracks = [];
        this.scrollSpeed = 120;
        this.playheadX = 0.4; // Slightly left of center
        this.staffSpacing = 120;
        this.noteSize = 24;

        // Symbols
        this.symbols = {
            quarter: '\u2669',
            eighth: '\u266A',
            beamed: '\u266B',
            sixteenth: '\u266C',
            treble: '\u{1D11E}',
            bass: '\u{1D122}',
            flat: '\u266D',
            sharp: '\u266F',
            natural: '\u266E'
        };

        this.isMidiMode = false;
        this.showMidiWarning = false;
        this.showTrails = true; // Comet tail toggle

        this.initTracks(2);
    }

    initTracks(count) {
        this.tracks = [];
        for (let i = 0; i < count; i++) {
            this.tracks.push({
                color: this.trackColors[i % this.trackColors.length],
                baseY: 0,
                nodes: [],
                name: `Track ${i + 1}`,
                channelId: i,
                clef: i === 0 ? 'treble' : 'bass'
            });
        }
        this.updateTrackPositions();
    }

    updateTrackPositions() {
        if (this.tracks.length === 0) return;

        // Dynamic spacing based on track count
        const margin = 100;
        const usableHeight = this.height - margin;
        this.staffSpacing = Math.min(120, usableHeight / (this.tracks.length || 1));

        // Adjust note size if spacing is tight
        this.noteSize = Math.max(14, Math.min(24, this.staffSpacing * 0.2));

        const totalHeight = (this.tracks.length - 1) * this.staffSpacing;
        const startY = (this.height - totalHeight) / 2;

        for (let i = 0; i < this.tracks.length; i++) {
            this.tracks[i].baseY = startY + (i * this.staffSpacing);
        }
    }

    resize(w, h) {
        super.resize(w, h);
        this.updateTrackPositions();
    }

    update(analysis, dt) {
        super.update(analysis, dt);
        this.isMidiMode = analysis.isMidi;
        this.showMidiWarning = !analysis.isMidi;
        if (this.showMidiWarning) return;

        const currentTime = (this.analysis && this.analysis.currentTime) || 0;
        const midiHandler = window.app && window.app.midiHandler;

        // Sync Tracks with MIDI Channel Data
        if (analysis.channelData && analysis.channelData.length > 0) {
            const channelCount = analysis.channelData.length; // No more limit
            if (this.tracks.length !== channelCount) {
                this.initTracks(channelCount);
            }

            this.tracks.forEach((track, i) => {
                const chId = analysis.channelData[i].channelId;
                track.channelId = chId;

                // Sync Name
                if (midiHandler.midi) {
                    const trackMeta = midiHandler.midi.tracks.find(t => t.channel === chId);
                    if (trackMeta && trackMeta.instrument) {
                        track.name = (midiHandler.constructor.GM_MAP[trackMeta.instrument.number] || trackMeta.instrument.name).replace(/_/g, ' ').toUpperCase();
                    }
                }

                // Get notes for a wider window (6s ahead, 4s back)
                const lookAhead = 6.0;
                const lookBack = 4.0;
                const activeNotes = (midiHandler.channels[chId] || [])
                    .filter(n => n.startTime > currentTime - lookBack && n.startTime < currentTime + lookAhead);

                track.nodes = activeNotes.map(n => ({
                    time: n.startTime,
                    pitch: n.note,
                    name: n.name,
                    velocity: n.velocity,
                    duration: n.duration,
                    active: currentTime >= n.startTime && currentTime < n.startTime + n.duration
                }));
            });
        }
    }

    render() {
        const ctx = this.ctx;
        if (!ctx) return;

        // Show Warning if not MIDI
        if (this.showMidiWarning) {
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.font = '30px Inter';
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.fillText("⚠️ MIDI File Required for Musical Mode", this.canvas.width / 2, this.canvas.height / 2);
            return;
        }

        const width = this.canvas.width;
        const playheadX = width * this.playheadX;
        const pixelsPerSecond = 200;

        const currentTime = (this.analysis && this.analysis.currentTime) || 0;

        // Background
        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(0, 0, width, this.height);

        this.tracks.forEach((track, trackIdx) => {
            const baseY = track.baseY;
            const [r, g, b] = track.color;
            const colorStr = this.rgbString(r, g, b, 1);

            // Draw Staff (5 Lines)
            const lineSpacing = Math.max(4, this.staffSpacing * 0.08);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            for (let i = -2; i <= 2; i++) {
                const y = baseY + (i * lineSpacing);
                ctx.beginPath();
                ctx.moveTo(80, y); // Start after clef
                ctx.lineTo(width, y);
                ctx.stroke();
            }

            // Clef Symbol
            ctx.fillStyle = colorStr;
            ctx.font = `${this.noteSize * 1.8}px "Serif"`;
            ctx.textAlign = 'center';
            ctx.fillText(track.clef === 'treble' ? '\u{1D11E}' : '\u{1D122}', 40, baseY + (this.noteSize * 0.4));

            // Track Label
            ctx.font = `bold ${Math.max(9, this.noteSize * 0.5)}px Inter`;
            ctx.textAlign = 'left';
            ctx.fillText(track.name, 80, baseY - (lineSpacing * 2.5));

            // Draw Notes
            track.nodes.forEach(note => {
                const age = note.time - currentTime;
                const x = playheadX + (age * pixelsPerSecond);

                if (x < -100 || x > width + 100) return;

                // Vertical position on staff (C4 is roughly at baseY)
                // In musical notation, C4 is 60.
                // Every MIDI value is a half step.
                // We'll simplify: map 60 to baseY.
                // One octave is 12 semitones, 7 white keys.
                // We want 1 step in staff = 1 white key.
                const pitchMap = {
                    0: 0, 1: 0.5, 2: 1, 3: 1.5, 4: 2, 5: 3, 6: 3.5, 7: 4, 8: 4.5, 9: 5, 10: 5.5, 11: 6
                }; // Simple white-key mapping relative to C

                const octave = Math.floor(note.pitch / 12) - 5; // Relative to octave 5
                const semi = note.pitch % 12;
                const verticalUnits = (octave * 7) + pitchMap[semi];
                const y = baseY - (verticalUnits * lineSpacing / 2);

                // Symbol Choice
                let symbol = this.symbols.quarter;
                if (note.duration < 0.2) symbol = this.symbols.sixteenth;
                else if (note.duration < 0.4) symbol = this.symbols.eighth;

                // Magnifying Glass Effect: Scale notes as they approach playhead
                const dist = Math.abs(age);
                const magnifyingRange = 0.4; // seconds
                const zoomFactor = 1.2; // How much it grows
                const scale = 1.0 + Math.exp(-(dist * dist) / (magnifyingRange * magnifyingRange)) * zoomFactor;
                const currentNoteSize = this.noteSize * scale;

                // Draw Trail (Comet Tail) if note is active or being played
                if (this.showTrails && (note.active || (age < 0 && age > -note.duration))) {
                    const tailLength = Math.min(note.duration * pixelsPerSecond, (currentTime - note.time) * pixelsPerSecond);
                    if (tailLength > 0) {
                        const gradient = ctx.createLinearGradient(x, y, x + tailLength, y);
                        gradient.addColorStop(0, colorStr);
                        gradient.addColorStop(1, 'transparent');

                        ctx.beginPath();
                        ctx.strokeStyle = gradient;
                        ctx.lineWidth = currentNoteSize * 0.4;
                        ctx.lineCap = 'round';
                        ctx.moveTo(x, y);
                        ctx.lineTo(x + tailLength, y);
                        ctx.stroke();
                    }
                }

                ctx.save();
                ctx.translate(x, y);

                // Glow and Style for active notes
                if (note.active) {
                    ctx.shadowBlur = 20 * scale;
                    ctx.shadowColor = colorStr;
                    ctx.fillStyle = '#fff';
                    ctx.font = `${currentNoteSize * 1.2}px "Serif"`;
                } else {
                    // Slower fade out for better visibility window
                    ctx.globalAlpha = Math.max(0.1, 1 - (dist / 5.0));
                    ctx.fillStyle = colorStr;
                    ctx.font = `${currentNoteSize}px "Serif"`;
                }

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(symbol, 0, 0);

                // Sharp/Flat marker if needed
                if ([1, 3, 6, 8, 10].includes(semi)) {
                    ctx.font = `${currentNoteSize * 0.6}px "Serif"`;
                    ctx.fillText('\u266F', -(currentNoteSize * 0.5), 0); // Sharp
                }

                ctx.restore();
            });
        });

        // Vertical Playhead Line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, this.height);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    getName() {
        return 'Musical Runner';
    }
}