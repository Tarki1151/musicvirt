/**
 * The Molecular Graph Visualizer
 * Physics-based node system with harmonic bonds
 * Golden Rules: Normalization, Clamping, Automatic Decay
 */
import { Visualizer } from './visualizer-base.js';

export class TheMolecularGraph extends Visualizer {
    constructor(canvas) {
        super(canvas);

        // Physics settings
        this.friction = 0.88; // High friction for stability (0.8-0.9)
        this.centralGravity = 0.02; // Soft pull towards center
        this.repulsionForce = 800; // Force between nodes
        this.springForce = 0.03; // Bond strength
        this.springLength = 100; // Ideal bond length

        // Nodes (atoms)
        this.nodes = new Map(); // noteId -> node
        this.maxNodes = 64;

        // Harmonic intervals for bonds (in semitones)
        this.harmonicIntervals = [3, 4, 5, 7, 12]; // Minor 3rd, Major 3rd, Perfect 4th, Perfect 5th, Octave

        // Channel color palette
        this.channelColors = [
            { h: 200, s: 0.90, l: 0.60 }, // Electric Blue
            { h: 280, s: 0.80, l: 0.60 }, // Purple
            { h: 340, s: 0.85, l: 0.60 }, // Pink
            { h: 160, s: 0.75, l: 0.55 }, // Teal
            { h: 30, s: 0.90, l: 0.60 },  // Orange
            { h: 55, s: 0.85, l: 0.55 },  // Gold
            { h: 120, s: 0.70, l: 0.50 }, // Green
            { h: 180, s: 0.80, l: 0.55 }, // Cyan
            { h: 0, s: 0.85, l: 0.60 },   // Red
            { h: 220, s: 0.85, l: 0.65 }, // Royal Blue
            { h: 90, s: 0.70, l: 0.55 },  // Lime
            { h: 260, s: 0.75, l: 0.60 }, // Violet
            { h: 15, s: 0.90, l: 0.55 },  // Coral
            { h: 140, s: 0.65, l: 0.50 }, // Sea Green
            { h: 315, s: 0.80, l: 0.60 }, // Magenta
            { h: 195, s: 0.85, l: 0.60 }  // Sky Blue
        ];

        // Visual settings
        this.nodeBaseRadius = 8;
        this.nodeMaxRadius = 25;
        this.glowIntensity = 0;

        // Active notes tracking
        this.activeNoteIds = new Set();

        this.resize(canvas.width, canvas.height);
    }

    resize(w, h) {
        super.resize(w, h);
        this.centerX = w / 2;
        this.centerY = h / 2;
        this.boundaryMargin = 50;
    }

    getNoteId(pitch, channel) {
        return `${channel}_${pitch}`;
    }

    update(analysis, dt) {
        super.update(analysis, dt);

        // Beat effect
        if (analysis.isBeat) {
            this.glowIntensity = 1;
        }
        this.glowIntensity *= 0.94;

        // Track currently active notes
        const currentActive = new Set();

        // Process MIDI data
        if (analysis.channelData) {
            for (const ch of analysis.channelData) {
                if (ch.energy > 0.05) {
                    // Simulate notes based on channel activity
                    const basePitch = (ch.channelId * 12 + 36) % 128;
                    const numNotes = Math.min(4, Math.ceil(ch.noteCount));

                    for (let i = 0; i < numNotes; i++) {
                        const pitch = (basePitch + i * 4) % 128;
                        const noteId = this.getNoteId(pitch, ch.channelId);
                        currentActive.add(noteId);

                        if (!this.nodes.has(noteId)) {
                            this.createNode(noteId, pitch, ch.channelId, ch.energy);
                        } else {
                            const node = this.nodes.get(noteId);
                            node.active = true;
                            node.energy = ch.energy;
                            node.lastActive = this.time;
                        }
                    }
                }
            }
        }

        // Fallback: use spectrum
        if (!analysis.channelData || analysis.channelData.length === 0) {
            const spectrum = analysis.spectrum || [];
            for (let i = 0; i < spectrum.length; i += 8) {
                if (spectrum[i] > 80) {
                    const pitch = Math.floor((i / spectrum.length) * 88) + 21;
                    const noteId = this.getNoteId(pitch, 0);
                    currentActive.add(noteId);

                    if (!this.nodes.has(noteId)) {
                        this.createNode(noteId, pitch, 0, spectrum[i] / 255);
                    } else {
                        const node = this.nodes.get(noteId);
                        node.active = true;
                        node.energy = spectrum[i] / 255;
                        node.lastActive = this.time;
                    }
                }
            }
        }

        // Mark inactive nodes
        for (const [id, node] of this.nodes) {
            if (!currentActive.has(id)) {
                node.active = false;
            }
        }

        this.activeNoteIds = currentActive;

        // Physics simulation
        this.updatePhysics(dt);

        // Cleanup old nodes (TTL)
        this.cleanupNodes();
    }

    createNode(noteId, pitch, channel, energy) {
        if (this.nodes.size >= this.maxNodes) {
            // Remove oldest inactive node
            let oldest = null;
            let oldestTime = Infinity;
            for (const [id, node] of this.nodes) {
                if (!node.active && node.lastActive < oldestTime) {
                    oldest = id;
                    oldestTime = node.lastActive;
                }
            }
            if (oldest) this.nodes.delete(oldest);
            else return; // All nodes active, can't add new
        }

        // Spawn near center with some randomness
        const angle = Math.random() * Math.PI * 2;
        const dist = 50 + Math.random() * 100;

        this.nodes.set(noteId, {
            x: this.centerX + Math.cos(angle) * dist,
            y: this.centerY + Math.sin(angle) * dist,
            vx: 0,
            vy: 0,
            pitch: pitch,
            channel: channel,
            energy: energy,
            active: true,
            lastActive: this.time,
            birthTime: this.time
        });
    }

    updatePhysics(dt) {
        const nodes = Array.from(this.nodes.values());
        const dtCapped = Math.min(dt, 0.033); // Cap at ~30fps for stability

        // Calculate forces
        for (const node of nodes) {
            let fx = 0, fy = 0;

            // Central gravity (soft boundary)
            const dx = this.centerX - node.x;
            const dy = this.centerY - node.y;
            const distToCenter = Math.sqrt(dx * dx + dy * dy);
            fx += dx * this.centralGravity;
            fy += dy * this.centralGravity;

            // Repulsion from other nodes
            for (const other of nodes) {
                if (other === node) continue;

                const ox = node.x - other.x;
                const oy = node.y - other.y;
                const dist = Math.sqrt(ox * ox + oy * oy) + 1;

                const repulsion = this.repulsionForce / (dist * dist);
                fx += (ox / dist) * repulsion;
                fy += (oy / dist) * repulsion;

                // Spring force for harmonic bonds
                const interval = Math.abs(node.pitch - other.pitch) % 12;
                if (this.harmonicIntervals.includes(interval)) {
                    const delta = dist - this.springLength;
                    const spring = -delta * this.springForce;
                    fx += (ox / dist) * spring;
                    fy += (oy / dist) * spring;
                }
            }

            // Apply forces
            node.vx += fx * dtCapped;
            node.vy += fy * dtCapped;

            // Apply friction
            node.vx *= this.friction;
            node.vy *= this.friction;

            // Update position
            node.x += node.vx;
            node.y += node.vy;

            // Hard boundary enforcement
            const margin = this.boundaryMargin;
            if (node.x < margin) {
                node.x = margin;
                node.vx = Math.abs(node.vx) * 0.5;
            }
            if (node.x > this.width - margin) {
                node.x = this.width - margin;
                node.vx = -Math.abs(node.vx) * 0.5;
            }
            if (node.y < margin) {
                node.y = margin;
                node.vy = Math.abs(node.vy) * 0.5;
            }
            if (node.y > this.height - margin) {
                node.y = this.height - margin;
                node.vy = -Math.abs(node.vy) * 0.5;
            }
        }
    }

    cleanupNodes() {
        const maxAge = 6; // TTL in seconds
        const nodesToDelete = [];

        for (const [id, node] of this.nodes) {
            if (!node.active && (this.time - node.lastActive) > maxAge) {
                nodesToDelete.push(id);
            }
        }

        for (const id of nodesToDelete) {
            this.nodes.delete(id);
        }
    }

    render() {
        const ctx = this.ctx;
        const nodes = Array.from(this.nodes.values());

        // Draw bonds first
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i];
                const b = nodes[j];

                const interval = Math.abs(a.pitch - b.pitch) % 12;
                if (this.harmonicIntervals.includes(interval)) {
                    const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
                    if (dist < this.springLength * 2) {
                        const alpha = Math.max(0.1, 1 - dist / (this.springLength * 2));
                        const bothActive = a.active && b.active;

                        ctx.strokeStyle = bothActive
                            ? `rgba(150, 200, 255, ${alpha * 0.6})`
                            : `rgba(100, 120, 150, ${alpha * 0.3})`;
                        ctx.lineWidth = bothActive ? 2 : 1;

                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.stroke();
                    }
                }
            }
        }

        // Draw nodes
        for (const node of nodes) {
            this.drawNode(ctx, node);
        }
    }

    drawNode(ctx, node) {
        const color = this.channelColors[node.channel % 16];
        const [r, g, b] = this.hslToRgb(color.h, color.s, color.l);

        // Size based on activity
        const targetRadius = node.active
            ? this.nodeBaseRadius + node.energy * (this.nodeMaxRadius - this.nodeBaseRadius)
            : this.nodeBaseRadius * 0.6;

        // Fade based on inactivity
        const fadeTime = this.time - node.lastActive;
        const alpha = node.active ? 1 : Math.max(0.2, 1 - fadeTime * 0.3);

        const radius = targetRadius;

        // Glow for active nodes
        if (node.active && this.glowIntensity > 0.1) {
            ctx.shadowColor = this.rgbString(r, g, b, 0.8);
            ctx.shadowBlur = 20 * this.glowMultiplier * node.energy;
        }

        // Outer ring
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius);
        gradient.addColorStop(0, this.rgbString(r + 50, g + 50, b + 50, alpha));
        gradient.addColorStop(0.7, this.rgbString(r, g, b, alpha * 0.8));
        gradient.addColorStop(1, this.rgbString(r * 0.7, g * 0.7, b * 0.7, alpha * 0.3));

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Inner highlight
        if (node.active) {
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
            ctx.beginPath();
            ctx.arc(node.x - radius * 0.25, node.y - radius * 0.25, radius * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.shadowBlur = 0;
    }

    getName() { return 'Molecular Graph'; }
}
