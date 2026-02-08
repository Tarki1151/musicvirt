/**
 * The Circuit Visualizer
 * Data center topology with L-shaped energy paths
 * Golden Rules: Normalization, Clamping, Automatic Decay
 */
import { Visualizer } from './visualizer-base.js';

export class TheCircuit extends Visualizer {
    constructor(canvas) {
        super(canvas);

        // Core switch (center point)
        this.coreX = 0;
        this.coreY = 0;
        this.coreRadius = 30;
        this.corePulse = 0;

        // Active lines with TTL
        this.lines = [];
        this.maxLines = 24; // Clamped maximum concurrent lines

        // Pulse particles on lines
        this.pulses = [];
        this.maxPulses = 100;

        // Channel color palette (16 MIDI channels - distinct for visual separation)
        this.channelColors = [
            { h: 200, s: 0.90, l: 0.55 }, // Electric Blue
            { h: 280, s: 0.80, l: 0.55 }, // Purple
            { h: 340, s: 0.85, l: 0.55 }, // Pink
            { h: 160, s: 0.75, l: 0.50 }, // Teal
            { h: 30, s: 0.90, l: 0.55 },  // Orange
            { h: 55, s: 0.85, l: 0.50 },  // Gold
            { h: 120, s: 0.70, l: 0.45 }, // Green
            { h: 180, s: 0.80, l: 0.50 }, // Cyan
            { h: 0, s: 0.85, l: 0.55 },   // Red
            { h: 220, s: 0.85, l: 0.60 }, // Royal Blue
            { h: 90, s: 0.70, l: 0.50 },  // Lime
            { h: 260, s: 0.75, l: 0.55 }, // Violet
            { h: 15, s: 0.90, l: 0.50 },  // Coral
            { h: 140, s: 0.65, l: 0.45 }, // Sea Green
            { h: 315, s: 0.80, l: 0.55 }, // Magenta
            { h: 195, s: 0.85, l: 0.55 }  // Sky Blue
        ];

        // Grid layout for endpoints
        this.endpointZones = [];
        this.initEndpointZones();

        // Animation settings
        this.lineDecayRate = 0.4; // Lines fade over ~2.5 seconds
        this.pulseSpeed = { min: 150, max: 400 }; // Clamped speed range

        // Beat tracking
        this.lastBeatTime = 0;
        this.beatIntensity = 0;

        // Active channels to avoid duplicate lines
        this.activeChannels = new Set();

        this.resize(canvas.width, canvas.height);
    }

    initEndpointZones() {
        // Create zones around the perimeter for L-shaped paths
        // 8 zones: top, top-right, right, bottom-right, bottom, bottom-left, left, top-left
        this.endpointZones = [];
        for (let i = 0; i < 8; i++) {
            this.endpointZones.push({
                angle: (i / 8) * Math.PI * 2 - Math.PI / 2,
                lastUsed: 0
            });
        }
    }

    resize(w, h) {
        super.resize(w, h);
        this.coreX = w / 2;
        this.coreY = h / 2;
        this.coreRadius = Math.min(w, h) * 0.03;
    }

    // Normalize pitch to viewport edge distance
    pitchToDistance(pitch) {
        const minRadius = Math.min(this.width, this.height) * 0.15;
        const maxRadius = Math.min(this.width, this.height) * 0.45;
        return minRadius + (pitch / 127) * (maxRadius - minRadius);
    }

    // Clamp velocity to pulse speed
    velocityToSpeed(velocity) {
        const speed = this.pulseSpeed.min + velocity * (this.pulseSpeed.max - this.pulseSpeed.min);
        return Math.max(this.pulseSpeed.min, Math.min(this.pulseSpeed.max, speed));
    }

    update(analysis, dt) {
        super.update(analysis, dt);

        // Core pulse on beat
        if (analysis.isBeat) {
            this.corePulse = 1;
            this.beatIntensity = analysis.totalEnergy / 255;
            this.lastBeatTime = this.time;
        }
        this.corePulse *= 0.92;
        this.beatIntensity *= 0.95;

        // Process channel data for new lines
        if (analysis.channelData) {
            for (const ch of analysis.channelData) {
                if (ch.isBeat && ch.energy > 0.15) {
                    this.spawnLine(ch.channelId, ch.energy);
                }
            }
        }

        // Fallback: use spectrum if no channel data
        if (!analysis.channelData || analysis.channelData.length === 0) {
            const spectrum = analysis.spectrum || [];
            const bins = 8;
            for (let i = 0; i < bins; i++) {
                const start = Math.floor((i / bins) * spectrum.length);
                const end = Math.floor(((i + 1) / bins) * spectrum.length);
                let max = 0;
                for (let j = start; j < end; j++) {
                    max = Math.max(max, spectrum[j] || 0);
                }
                if (max > 150) {
                    this.spawnLine(i, max / 255);
                }
            }
        }

        // Update and decay lines (TTL)
        this.lines = this.lines.filter(line => {
            line.opacity -= this.lineDecayRate * dt;
            line.age += dt;

            // Spawn pulses on active lines
            if (line.opacity > 0.5 && Math.random() < 0.1 * line.velocity) {
                this.spawnPulse(line);
            }

            if (line.opacity <= 0) {
                this.activeChannels.delete(line.channelKey);
                return false;
            }
            return true;
        });

        // Update pulses
        this.pulses = this.pulses.filter(pulse => {
            pulse.progress += (pulse.speed / pulse.totalLength) * dt;
            return pulse.progress < 1;
        });

        // Limit pulses
        while (this.pulses.length > this.maxPulses) {
            this.pulses.shift();
        }
    }

    spawnLine(channelId, velocity) {
        // Check if we already have a line for this channel recently
        const channelKey = `ch_${channelId}`;
        if (this.activeChannels.has(channelKey)) return;

        // Enforce max lines limit
        if (this.lines.length >= this.maxLines) {
            // Fade out oldest line immediately
            const oldest = this.lines[0];
            oldest.opacity = Math.min(oldest.opacity, 0.2);
        }

        // Choose endpoint zone based on channel
        const zoneIndex = channelId % this.endpointZones.length;
        const zone = this.endpointZones[zoneIndex];

        // Add some randomness to angle within zone
        const angleVariation = (Math.PI / 8) * (Math.random() - 0.5);
        const angle = zone.angle + angleVariation;

        // Calculate endpoint based on velocity (normalized to viewport)
        const distance = this.pitchToDistance(Math.floor(velocity * 127));

        // L-shaped path: first go horizontal/vertical, then turn
        const turnPoint = 0.3 + Math.random() * 0.4; // 30-70% along the path

        // Determine path direction (prefer axial movement for circuit look)
        const isHorizontalFirst = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle));

        let midX, midY, endX, endY;

        if (isHorizontalFirst) {
            midX = this.coreX + Math.cos(angle) * distance * turnPoint;
            midY = this.coreY;
            endX = midX;
            endY = this.coreY + Math.sin(angle) * distance;
        } else {
            midX = this.coreX;
            midY = this.coreY + Math.sin(angle) * distance * turnPoint;
            endX = this.coreX + Math.cos(angle) * distance;
            endY = midY;
        }

        // Calculate total path length for pulse animation
        const seg1Len = Math.hypot(midX - this.coreX, midY - this.coreY);
        const seg2Len = Math.hypot(endX - midX, endY - midY);
        const totalLength = seg1Len + seg2Len;

        const color = this.channelColors[channelId % 16];

        const line = {
            startX: this.coreX,
            startY: this.coreY,
            midX, midY,
            endX, endY,
            seg1Len,
            seg2Len,
            totalLength,
            color,
            velocity,
            opacity: 1,
            age: 0,
            channelId,
            channelKey
        };

        this.lines.push(line);
        this.activeChannels.add(channelKey);
        zone.lastUsed = this.time;

        // Spawn initial pulse
        this.spawnPulse(line);
    }

    spawnPulse(line) {
        if (this.pulses.length >= this.maxPulses) return;

        this.pulses.push({
            line,
            progress: 0,
            speed: this.velocityToSpeed(line.velocity) * this.speedMultiplier,
            totalLength: line.totalLength,
            size: 4 + line.velocity * 4
        });
    }

    // Get position along L-shaped path (0-1 progress)
    getPathPosition(line, progress) {
        const progressLength = progress * line.totalLength;

        if (progressLength <= line.seg1Len) {
            // On first segment
            const t = progressLength / line.seg1Len;
            return {
                x: this.lerp(line.startX, line.midX, t),
                y: this.lerp(line.startY, line.midY, t)
            };
        } else {
            // On second segment
            const remainingLength = progressLength - line.seg1Len;
            const t = remainingLength / line.seg2Len;
            return {
                x: this.lerp(line.midX, line.endX, t),
                y: this.lerp(line.midY, line.endY, t)
            };
        }
    }

    render() {
        const ctx = this.ctx;

        // Draw core switch
        this.drawCore(ctx);

        // Draw all lines
        for (const line of this.lines) {
            this.drawLine(ctx, line);
        }

        // Draw pulses on top
        for (const pulse of this.pulses) {
            this.drawPulse(ctx, pulse);
        }

        // Draw endpoint nodes
        for (const line of this.lines) {
            if (line.opacity > 0.3) {
                this.drawEndpoint(ctx, line);
            }
        }
    }

    drawCore(ctx) {
        const pulseRadius = this.coreRadius * (1 + this.corePulse * 0.5);

        // Outer glow
        const gradient = ctx.createRadialGradient(
            this.coreX, this.coreY, 0,
            this.coreX, this.coreY, pulseRadius * 2
        );
        gradient.addColorStop(0, `rgba(100, 180, 255, ${0.3 + this.corePulse * 0.4})`);
        gradient.addColorStop(0.5, `rgba(100, 180, 255, ${0.1 + this.corePulse * 0.2})`);
        gradient.addColorStop(1, 'rgba(100, 180, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.coreX, this.coreY, pulseRadius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Core node
        ctx.fillStyle = `rgba(150, 200, 255, ${0.9 + this.corePulse * 0.1})`;
        ctx.beginPath();
        ctx.arc(this.coreX, this.coreY, pulseRadius, 0, Math.PI * 2);
        ctx.fill();

        // Inner highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(this.coreX - pulseRadius * 0.2, this.coreY - pulseRadius * 0.2, pulseRadius * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }

    drawLine(ctx, line) {
        const [r, g, b] = this.hslToRgb(line.color.h, line.color.s, line.color.l);
        const alpha = line.opacity * 0.7;

        // Glow effect
        if (line.opacity > 0.5 && this.glowMultiplier > 0) {
            ctx.shadowColor = this.rgbString(r, g, b, 0.5);
            ctx.shadowBlur = 10 * this.glowMultiplier;
        }

        ctx.strokeStyle = this.rgbString(r, g, b, alpha);
        ctx.lineWidth = 2 + line.velocity * 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw L-shaped path
        ctx.beginPath();
        ctx.moveTo(line.startX, line.startY);
        ctx.lineTo(line.midX, line.midY);
        ctx.lineTo(line.endX, line.endY);
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Draw corner node
        ctx.fillStyle = this.rgbString(r, g, b, alpha);
        ctx.beginPath();
        ctx.arc(line.midX, line.midY, 3 + line.velocity * 2, 0, Math.PI * 2);
        ctx.fill();
    }

    drawPulse(ctx, pulse) {
        const pos = this.getPathPosition(pulse.line, pulse.progress);
        const [r, g, b] = this.hslToRgb(pulse.line.color.h, pulse.line.color.s, pulse.line.color.l + 0.2);

        // Pulse glow
        const pulseAlpha = 1 - pulse.progress * 0.5;

        ctx.shadowColor = this.rgbString(r, g, b, 0.8);
        ctx.shadowBlur = 15 * this.glowMultiplier;

        ctx.fillStyle = this.rgbString(255, 255, 255, pulseAlpha);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pulse.size, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        ctx.fillStyle = this.rgbString(r, g, b, pulseAlpha);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pulse.size * 0.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
    }

    drawEndpoint(ctx, line) {
        const [r, g, b] = this.hslToRgb(line.color.h, line.color.s, line.color.l);
        const alpha = line.opacity;
        const size = 8 + line.velocity * 8;

        // Outer glow
        const gradient = ctx.createRadialGradient(
            line.endX, line.endY, 0,
            line.endX, line.endY, size * 1.5
        );
        gradient.addColorStop(0, this.rgbString(r, g, b, alpha * 0.5));
        gradient.addColorStop(1, this.rgbString(r, g, b, 0));

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(line.endX, line.endY, size * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Endpoint node (square for circuit look)
        ctx.fillStyle = this.rgbString(r, g, b, alpha);
        ctx.fillRect(line.endX - size / 2, line.endY - size / 2, size, size);

        // Inner highlight
        ctx.fillStyle = this.rgbString(255, 255, 255, alpha * 0.5);
        ctx.fillRect(line.endX - size / 4, line.endY - size / 4, size / 2, size / 2);
    }

    getName() { return 'The Circuit'; }
}
