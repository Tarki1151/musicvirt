import { Visualizer } from './visualizer-base.js';

/**
 * Road Runner Visualizer
 * Visualizes ALL MIDI channels (up to 16)
 * Has setting to limit visible channels while still playing all
 */
export class RoadRunner extends Visualizer {
    constructor(canvas) {
        super(canvas);

        // Extended color palette for up to 16 channels
        this.trackColors = [
            [200, 180, 100],  // 0:  Gold
            [80, 200, 200],   // 1:  Cyan
            [180, 120, 180],  // 2:  Purple
            [200, 120, 120],  // 3:  Coral
            [100, 200, 100],  // 4:  Green
            [200, 150, 80],   // 5:  Orange
            [120, 150, 220],  // 6:  Blue
            [220, 100, 150],  // 7:  Pink
            [150, 200, 180],  // 8:  Teal
            [220, 180, 150],  // 9:  Peach
            [160, 140, 200],  // 10: Lavender
            [180, 220, 100],  // 11: Lime
            [140, 180, 200],  // 12: Sky
            [220, 140, 180],  // 13: Rose
            [180, 200, 140],  // 14: Sage
            [200, 160, 200],  // 15: Mauve
        ];

        this.tracks = [];
        this.scrollSpeed = 100;
        this.playheadX = 0.5;           // CENTER
        this.baseAmplitude = 40;
        this.nodeSize = 7;
        this.nodeSpacing = 35;
        this.explosions = [];
        this.trackOffset = 0;
        this.isMidiMode = false;
        this.transport = null;

        // Channel visibility settings
        this.maxVisibleChannels = 64;   // Raised limit for large MIDI files
        this.totalChannels = 0;         // Total available channels

        this.initTracks(3);
    }

    // ... Methods (Same as before but wrapped in module)

    initTracks(count) {
        this.tracks = [];

        for (let i = 0; i < count; i++) {
            this.tracks.push({
                color: this.trackColors[i % this.trackColors.length],
                baseY: 0,
                nodes: [],
                name: `CH${i + 1}`,
                channelId: i,
                energy: 0,
                lastDir: 1,
                targetNodes: []
            });
        }
        this.totalChannels = count;
        this.updateTrackPositions();
    }

    resize(w, h) {
        super.resize(w, h);
        this.updateTrackPositions();
    }

    updateTrackPositions() {
        const offset = (this.trackOffset || 0) * this.height * 0.04;
        const visibleCount = this.tracks.length; // Show all by default

        if (visibleCount === 0) return;

        // Calculate spacing for visible tracks
        const usableHeight = this.height * 0.8;
        const startY = this.height * 0.1;
        const spacing = usableHeight / (visibleCount + 1);

        for (let i = 0; i < this.tracks.length; i++) {
            this.tracks[i].baseY = startY + spacing * (i + 1) + offset;
            this.tracks[i].visible = true;
        }
    }

    setTrackOffset(offset) {
        this.trackOffset = offset;
        this.updateTrackPositions();
    }

    setMaxVisibleChannels(count) {
        this.maxVisibleChannels = Math.max(1, count);
        this.updateTrackPositions();
    }

    getMaxVisibleChannels() { return this.maxVisibleChannels; }
    getTotalChannels() { return this.totalChannels; }

    update(analysis, dt) {
        if (!this.canvas) return;

        // Analysis based update
        this.showMidiWarning = false;

        // Get Rhythmic Info if available
        if (window.app && window.app.midiHandler && window.app.midiHandler.getTransportInfo) {
            this.transport = window.app.midiHandler.getTransportInfo();
        }

        // Initialize tracks if needed
        let channelCount = 0;
        if (analysis.channelData) {
            channelCount = analysis.channelData.length;
            if (channelCount !== this.totalChannels) {
                this.initTracks(channelCount);
            }

            // Sync metadata (Names, etc)
            for (let i = 0; i < this.tracks.length; i++) {
                const chId = analysis.channelData[i].channelId;
                this.tracks[i].channelId = chId;

                // Get Instrument Name from Handler
                if (window.app.midiHandler && window.app.midiHandler.midi) {
                    const trackMeta = window.app.midiHandler.midi.tracks.find(t => t.channel === chId);
                    if (trackMeta && trackMeta.instrument) {
                        const prgNum = trackMeta.instrument.number;
                        const cleanName = window.app.midiHandler.constructor.GM_MAP[prgNum] || trackMeta.instrument.name;
                        // Format: "Violin", "Acoustic Grand Piano"
                        this.tracks[i].name = cleanName.replace(/_/g, ' ').toUpperCase();
                    } else {
                        this.tracks[i].name = `CH${chId + 1}`;
                    }
                }
            }
        }

        const energies = analysis.channelData ? analysis.channelData.map(c => c.energy || 0) : [];
        const currentTime = window.app.midiHandler ? window.app.midiHandler.getCurrentTime() : 0;

        // Update tracks
        this.tracks.forEach((track, i) => {
            // Get notes for this track
            const chId = track.channelId;
            let notes = [];

            if (window.app.midiHandler && window.app.midiHandler.channels[chId]) {
                // Look ahead 2 seconds, look back 2.5s (to ensure they reach the left edge)
                notes = window.app.midiHandler.channels[chId].filter(n =>
                    n.startTime > currentTime - 2.5 && n.startTime < currentTime + 2.0
                );
            }

            // Sync nodes with notes
            track.targetNodes = notes.map(n => ({
                id: n.startTime + '_' + n.note,
                x: 0,
                y: 0,
                time: n.startTime,
                duration: n.duration,
                velocity: n.velocity,
                active: currentTime >= n.startTime && currentTime < n.endTime,
                played: currentTime >= n.endTime
            }));

            track.energy = energies[i] || 0;
            track.nodes = track.targetNodes;
        });
    }

    render() {
        if (!this.ctx) return;

        // Show Warning if not MIDI
        if (this.showMidiWarning) {
            this.ctx.fillStyle = 'rgba(0,0,0,0.8)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.font = '30px Inter';
            this.ctx.fillStyle = '#fff';
            this.ctx.textAlign = 'center';
            this.ctx.fillText("⚠️ MIDI File Required for Runner Mode", this.canvas.width / 2, this.canvas.height / 2);
            return;
        }

        const width = this.canvas.width;
        const playheadX = width * 0.5;
        const timeWindow = 2.0;
        const pixelsPerSecond = (width * 0.5) / timeWindow;

        // Draw Rhythmic Grid
        if (this.transport && window.app.midiHandler) {
            this.drawGrid(playheadX, pixelsPerSecond, window.app.midiHandler.getCurrentTime());
        }

        // Playhead Line
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 1;
        this.ctx.moveTo(playheadX, 0);
        this.ctx.lineTo(playheadX, this.canvas.height);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        this.ctx.textAlign = 'right';
        this.ctx.font = '12px Inter';
        this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
        this.ctx.fillText(`${this.tracks.length} CHANNELS`, width - 20, 30);

        // Render Tracks
        this.tracks.forEach(track => {
            if (!track.visible) return;

            const y = track.baseY;
            const [r, g, b] = track.color;
            const colorStr = this.rgbString(r, g, b, 1);

            // Draw baseline
            this.ctx.beginPath();
            this.ctx.strokeStyle = `rgba(255, 255, 255, 0.08)`;
            this.ctx.lineWidth = 1;
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();

            // Track Label
            this.ctx.fillStyle = colorStr;
            this.ctx.font = 'bold 11px Inter';
            this.ctx.textAlign = 'left';
            this.ctx.globalAlpha = 0.8;
            this.ctx.fillText(track.name, 15, y - 8);
            this.ctx.globalAlpha = 1;

            // Draw Connection Line
            if (track.nodes.length > 1) {
                this.ctx.beginPath();
                this.ctx.strokeStyle = colorStr;
                this.ctx.lineWidth = 1.5;
                this.ctx.lineJoin = 'round';
                let started = false;

                track.nodes.forEach(node => {
                    const relativeTime = node.time - window.app.midiHandler.getCurrentTime();
                    const x = playheadX + (relativeTime * pixelsPerSecond);

                    if (x > -100 && x < width + 100) {
                        if (!started) {
                            this.ctx.moveTo(x, y);
                            started = true;
                        } else {
                            this.ctx.lineTo(x, y);
                        }
                    }
                });
                this.ctx.globalAlpha = 0.2;
                this.ctx.stroke();
                this.ctx.globalAlpha = 1.0;
            }

            // Draw Nodes
            track.nodes.forEach(node => {
                const relativeTime = node.time - window.app.midiHandler.getCurrentTime();
                const x = playheadX + (relativeTime * pixelsPerSecond);

                // Culling: Ensure nodes reach the very left edge (x=0)
                if (x < -20 || x > width + 20) return;

                // Dynamic size based on velocity (0 to 1)
                const baseSize = node.active ? 10 : 6;
                const size = baseSize + (node.velocity * 12);

                this.ctx.beginPath();
                this.ctx.arc(x, y, size, 0, Math.PI * 2);

                if (node.active) {
                    this.ctx.fillStyle = '#fff';
                    this.ctx.fill();
                    this.ctx.shadowBlur = 20;
                    this.ctx.shadowColor = colorStr;
                    this.ctx.stroke();
                    this.ctx.shadowBlur = 0;
                } else if (node.played) {
                    this.ctx.strokeStyle = colorStr;
                    this.ctx.lineWidth = 2;
                    this.ctx.globalAlpha = 0.4;
                    this.ctx.stroke();
                    this.ctx.globalAlpha = 1.0;
                } else {
                    this.ctx.fillStyle = colorStr;
                    this.ctx.fill();
                }
            });
        });
    }

    drawGrid(playheadX, pixelsPerSecond, currentTime) {
        // Draw 1/4 note beat lines
        const beatInterval = 60 / (window.app.midiHandler.tempo || 120);

        const viewStartTime = currentTime - (playheadX / pixelsPerSecond);
        const viewEndTime = currentTime + ((this.canvas.width - playheadX) / pixelsPerSecond);

        const firstBeat = Math.ceil(viewStartTime / beatInterval) * beatInterval;

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;

        for (let t = firstBeat; t < viewEndTime; t += beatInterval) {
            const relativeTime = t - currentTime;
            const x = playheadX + (relativeTime * pixelsPerSecond);

            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
    }

    getName() {
        return this.isMidiMode ? `Road Runner (${this.totalChannels} CH)` : 'Road Runner';
    }
}
