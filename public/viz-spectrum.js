/**
 * Spectrum Analyzer Visualizer
 * Displays frequency bars with peaks
 */
import { Visualizer } from './visualizer-base.js';

export class SpectrumAnalyzer extends Visualizer {
    constructor(canvas, ctx) {
        super(canvas);
        this.numBars = 64;
        this.barHeights = new Array(this.numBars).fill(0);
        this.peakHeights = new Array(this.numBars).fill(0);
        this.peakVelocities = new Array(this.numBars).fill(0);
        this.glowIntensity = 0;
    }

    update(analysis, dt) {
        super.update(analysis, dt);
        const bars = analysis.bars || new Array(this.numBars).fill(0);

        for (let i = 0; i < this.numBars; i++) {
            const targetHeight = (bars[i] || 0) * this.height * 0.7;
            this.barHeights[i] = this.lerp(this.barHeights[i], targetHeight, 0.15);

            if (this.barHeights[i] > this.peakHeights[i]) {
                this.peakHeights[i] = this.barHeights[i];
                this.peakVelocities[i] = 0;
            } else {
                this.peakVelocities[i] += 1500 * dt;
                this.peakHeights[i] = Math.max(0, this.peakHeights[i] - this.peakVelocities[i] * dt);
            }
        }

        if (analysis.isBeat) this.glowIntensity = 1;
        this.glowIntensity *= 0.92;
    }

    getBarColor(index, height) {
        const t = index / this.numBars;
        let hue = t < 0.33 ? 340 + t * 30 : t < 0.66 ? 180 + (t - 0.33) * 60 : 270 + (t - 0.66) * 30;
        return this.hslToRgb(hue, 0.8, 0.5 + (height / this.height) * 0.2);
    }

    render() {
        const ctx = this.ctx;
        const barWidth = (this.width - 40) / this.numBars;
        const gap = Math.max(2, barWidth * 0.15);
        const w = barWidth - gap;
        const baseY = this.height - 80;

        for (let i = 0; i < this.numBars; i++) {
            const x = 20 + i * barWidth;
            const h = this.barHeights[i];

            if (h > 2) {
                const [r, g, b] = this.getBarColor(i, h);

                if (this.glowIntensity > 0.1) {
                    ctx.shadowColor = this.rgbString(r, g, b, this.glowIntensity * this.glowMultiplier);
                    ctx.shadowBlur = 20;
                }

                const grad = ctx.createLinearGradient(x, baseY - h, x, baseY);
                grad.addColorStop(0, this.rgbString(r + 40, g + 40, b + 40));
                grad.addColorStop(1, this.rgbString(r, g, b));
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.roundRect ? ctx.roundRect(x, baseY - h, w, h, 3) : ctx.rect(x, baseY - h, w, h);
                ctx.fill();
                ctx.shadowBlur = 0;

                if (this.peakHeights[i] > 5) {
                    ctx.fillStyle = 'rgba(255,255,255,0.9)';
                    ctx.fillRect(x, baseY - this.peakHeights[i], w, 3);
                }
            }
        }
    }

    getName() { return 'Spectrum Analyzer'; }
}


