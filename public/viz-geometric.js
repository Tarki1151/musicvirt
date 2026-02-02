/**
 * Geometric Patterns Visualizer
 * Rotating polygons with morphing effects
 */
import { Visualizer } from './visualizer-base.js';

export class GeometricPatterns extends Visualizer {
    constructor(canvas, ctx) {
        super(canvas);
        this.rotation = 0;
        this.scale = 1;
        this.numSides = 6;
        this.numLayers = 8;
        this.pulse = 0;
        this.hueShift = 0;
        this.morphFactor = 0;
    }

    update(analysis, dt) {
        super.update(analysis, dt);
        this.rotation += dt * (0.5 + analysis.midNorm * 3);
        this.pulse = analysis.bassNorm;
        this.scale = 1 + analysis.bassNorm * 0.3;

        if (analysis.isBeat) {
            this.morphFactor = 1;
            if (Math.random() < 0.2) {
                this.numSides = [3, 4, 5, 6, 8, 12][Math.floor(Math.random() * 6)];
            }
        }
        this.morphFactor *= 0.95;
        this.hueShift = analysis.spectralCentroid / 20;
    }

    drawPolygon(cx, cy, radius, sides, rotation, color, lineWidth = 2) {
        const ctx = this.ctx;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();

        for (let i = 0; i <= sides; i++) {
            const angle = rotation + (Math.PI * 2 * i / sides);
            const x = cx + Math.cos(angle) * radius;
            const y = cy + Math.sin(angle) * radius;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
    }

    render() {
        const ctx = this.ctx;
        const cx = this.width / 2;
        const cy = this.height / 2;
        const baseRadius = Math.min(this.width, this.height) * 0.35;

        for (let layer = 0; layer < this.numLayers; layer++) {
            const layerT = layer / this.numLayers;
            let radius = baseRadius * this.scale * (0.2 + layerT * 0.8);
            radius += Math.sin(this.time * 2 + layer * 0.5) * 10 * this.pulse;

            let rot = this.rotation + layer * 0.1;
            if (layer % 2 === 0) rot = -rot;

            const hue = (this.hueShift + layer * 30) % 360;
            const [r, g, b] = this.hslToRgb(hue, 0.8, 0.4 + layerT * 0.3);
            this.drawPolygon(cx, cy, radius, this.numSides, rot, this.rgbString(r, g, b, 0.9), 2);
        }
    }

    getName() { return 'Geometric Patterns'; }
}


