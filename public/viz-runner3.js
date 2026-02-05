import { Visualizer } from './visualizer-base.js';

/**
 * Road Runner 3: Musical Staff Visualizer
 * Instead of dots, real musical symbols flow across a staff.
 */
export class RoadRunner3 extends Visualizer {
    constructor(canvas) {
        super(canvas);
        console.log('🎼 Runner3: Loaded Version 20260202_2015');

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

        // Symbols - Using curly braces for higher Unicode planes
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

        // Piano range for color mapping
        this.minNote = 21; // A0
        this.maxNote = 108; // C8

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

        const margin = 100;
        const usableHeight = this.height - margin;
        this.staffSpacing = Math.min(120, usableHeight / (this.tracks.length || 1));

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
        // Essential: Store analysis and update internal time via base class
        super.update(analysis, dt);

        this.isMidiMode = !!analysis.isMidi;
        this.showMidiWarning = !this.isMidiMode;
        if (this.showMidiWarning) return;

        // Use the CENTRAL timing source (prevents static notes)
        const currentTime = (this.analysis && typeof this.analysis.currentTime === 'number') ? this.analysis.currentTime : 0;
        const midiHandler = window.app && window.app.midiHandler;

        if (!midiHandler || !midiHandler.midi) return;

        // Sync Tracks with MIDI Channel Data
        if (analysis.channelData && analysis.channelData.length > 0) {
            const channelCount = analysis.channelData.length;
            if (this.tracks.length !== channelCount) {
                this.initTracks(channelCount);
            }

            this.tracks.forEach((track, i) => {
                const chId = analysis.channelData[i].channelId;
                track.channelId = chId;

                // Safe Instrument Naming
                if (midiHandler.midi) {
                    const trackMeta = midiHandler.midi.tracks.find(t => t.channel === chId);
                    if (trackMeta && trackMeta.instrument) {
                        const gmMap = midiHandler.constructor.GM_MAP || {};
                        const instName = gmMap[trackMeta.instrument.number] || trackMeta.instrument.name || `CH ${chId}`;
                        track.name = instName.replace(/_/g, ' ').toUpperCase();
                    }
                }

                // Get notes for the timeline window
                const lookAhead = 6.0;
                const lookBack = 4.0;
                const channelNotes = (midiHandler.channels && midiHandler.channels[chId]) || [];
                const visibleNotes = channelNotes.filter(n => n.startTime > currentTime - lookBack && n.startTime < currentTime + lookAhead);

                track.nodes = visibleNotes.map(n => ({
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

    /**
     * Smart color system:
     * - Single instrument: Each note gets a different rainbow color
     * - Multiple instruments: Each instrument has its own hue, notes vary in shade
     */
    getNoteColor(channelIndex, noteNumber, alpha = 1) {
        const isSingleInstrument = this.tracks.length <= 1;

        if (isSingleInstrument && noteNumber !== null) {
            // Single instrument mode: Rainbow colors based on note
            const normalizedNote = (noteNumber - this.minNote) / (this.maxNote - this.minNote);
            const hue = normalizedNote * 300; // 0-300 degrees for rainbow
            return `hsla(${hue}, 85%, 60%, ${alpha})`;
        } else {
            // Multiple instruments mode: Each channel gets base hue, notes vary shade
            const baseHue = (channelIndex * 137.5) % 360; // Golden angle

            if (noteNumber !== null) {
                const normalizedNote = (noteNumber - this.minNote) / (this.maxNote - this.minNote);
                const lightness = 40 + (normalizedNote * 30); // 40% to 70%
                const saturation = 70 + (normalizedNote * 15); // 70% to 85%
                return `hsla(${baseHue}, ${saturation}%, ${lightness}%, ${alpha})`;
            }

            return `hsla(${baseHue}, 80%, 60%, ${alpha})`;
        }
    }

    /**
     * Get base color for a track (for clefs, labels, etc.)
     */
    getTrackBaseColor(channelIndex) {
        const isSingleInstrument = this.tracks.length <= 1;

        if (isSingleInstrument) {
            return 'hsl(280, 80%, 65%)'; // Purple for single track
        } else {
            const baseHue = (channelIndex * 137.5) % 360;
            return `hsl(${baseHue}, 80%, 60%)`;
        }
    }

    render() {
        const ctx = this.ctx;
        if (!ctx) return;

        if (this.showMidiWarning) {
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(0, 0, this.width, this.height);
            ctx.font = '30px sans-serif';
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.fillText("⚠️ MIDI File Required for Musical Mode", this.width / 2, this.height / 2);
            return;
        }

        const width = this.width;
        const playheadX = width * this.playheadX;
        const pixelsPerSecond = 300; // Increased for better scrolling speed

        // Use the CENTRAL timing source (synchronized with update)
        const currentTime = (this.analysis && this.analysis.currentTime) || 0;

        // Debug log help
        if (window.app && window.app.frameCount % 180 === 0) {
            console.log(`🎼 Runner3 Sync: Time=${currentTime.toFixed(2)}s, Tracks=${this.tracks.length}`);
        }

        // Background
        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(0, 0, width, this.height);

        this.tracks.forEach((track, trackIndex) => {
            const baseY = track.baseY;
            const trackBaseColor = this.getTrackBaseColor(trackIndex);

            // Draw Staff Lines
            const lineSpacing = Math.max(4, this.staffSpacing * 0.08);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            for (let i = -2; i <= 2; i++) {
                const y = baseY + (i * lineSpacing);
                ctx.beginPath();
                ctx.moveTo(80, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }

            // Clef Symbol
            ctx.fillStyle = trackBaseColor;
            ctx.font = `${this.noteSize * 1.8}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(track.clef === 'treble' ? this.symbols.treble : this.symbols.bass, 40, baseY);

            // Track Label
            ctx.font = `bold ${Math.max(9, this.noteSize * 0.5)}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.fillText(track.name, 80, baseY - (lineSpacing * 3));

            // Draw Notes
            track.nodes.forEach(note => {
                const noteColor = this.getNoteColor(trackIndex, note.pitch);
                const age = note.time - currentTime; // Crucial: age decreases as time increases
                const x = playheadX + (age * pixelsPerSecond);

                if (x < -100 || x > width + 100) return;

                // Vertical Mapping
                const pitchMap = { 0: 0, 1: 0.5, 2: 1, 3: 1.5, 4: 2, 5: 3, 6: 3.5, 7: 4, 8: 4.5, 9: 5, 10: 5.5, 11: 6 };
                const octave = Math.floor(note.pitch / 12) - 5;
                const semi = note.pitch % 12;
                const verticalUnits = (octave * 7) + pitchMap[semi];
                const y = baseY - (verticalUnits * lineSpacing / 2);

                let symbol = this.symbols.quarter;
                if (note.duration < 0.2) symbol = this.symbols.sixteenth;
                else if (note.duration < 0.4) symbol = this.symbols.eighth;

                const dist = Math.abs(age);
                const magnifyingRange = 0.4;
                const zoomFactor = 1.2;
                const scale = 1.0 + Math.exp(-(dist * dist) / (magnifyingRange * magnifyingRange)) * zoomFactor;
                const currentNoteSize = this.noteSize * scale;

                // Trail Effect
                if (this.showTrails && (note.active || (age < 0 && age > -note.duration))) {
                    const tailLength = Math.min(note.duration * pixelsPerSecond, (currentTime - note.time) * pixelsPerSecond);
                    if (tailLength > 0) {
                        const gradient = ctx.createLinearGradient(x, y, x + tailLength, y);
                        gradient.addColorStop(0, noteColor);
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

                if (note.active) {
                    ctx.shadowBlur = 20 * scale;
                    ctx.shadowColor = noteColor;
                    ctx.fillStyle = '#fff';
                    ctx.font = `${currentNoteSize * 1.2}px serif`;
                } else {
                    ctx.globalAlpha = Math.max(0.1, 1 - (dist / 5.0));
                    ctx.fillStyle = noteColor;
                    ctx.font = `${currentNoteSize}px serif`;
                }

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(symbol, 0, 0);

                // Accidentals
                if ([1, 3, 6, 8, 10].includes(semi)) {
                    ctx.font = `${currentNoteSize * 0.6}px serif`;
                    ctx.fillText(this.symbols.sharp, -(currentNoteSize * 0.5), 0);
                }

                ctx.restore();
            });
        });

        // Playhead
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