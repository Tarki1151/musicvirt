/**
 * Waveform Visualizer
 * Displays audio waveform with particles
 */
import { Visualizer } from './visualizer-base.js';

export class WaveformVisualizer extends Visualizer {
    constructor(canvas, ctx) {
        super(canvas);
        this.particles = [];
        this.maxParticles = 300;
        this.waveOffset = 0;
        this.pulseAmount = 0;
    }

    update(analysis, dt) {
        super.update(analysis, dt);
        this.waveOffset += dt * 2;
        this.pulseAmount = analysis.bassNorm * 0.5;

        if (analysis.isBeat) this.spawnParticles(analysis);

        this.particles = this.particles.filter(p => {
            p.life -= dt / p.maxLife;
            if (p.life <= 0) return false;
            p.vy += 200 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.size *= 0.98;
            return true;
        });
    }

    spawnParticles(analysis) {
        const cy = this.height / 2;
        const count = Math.floor(10 + analysis.totalEnergy / 10);

        for (let i = 0; i < count && this.particles.length < this.maxParticles; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 50 + analysis.totalEnergy * 2;
            this.particles.push({
                x: Math.random() * this.width,
                y: cy + (Math.random() - 0.5) * 100,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 50,
                life: 1,
                maxLife: 0.5 + Math.random(),
                size: 2 + Math.random() * 4,
                hue: analysis.bassNorm > analysis.highNorm ? 340 : 200
            });
        }
    }

    render() {
        const ctx = this.ctx;
        const cy = this.height / 2;
        const waveform = this.analysis?.waveform || [];

        if (waveform.length > 0) {
            const amp = this.height * 0.3 * (1 + this.pulseAmount);
            ctx.strokeStyle = 'rgba(150, 220, 255, 0.9)';
            ctx.lineWidth = 3;
            ctx.beginPath();

            for (let i = 0; i < waveform.length; i++) {
                const x = (i / waveform.length) * this.width;
                const wave = Math.sin(this.waveOffset + i * 0.02) * 10;
                const y = cy + waveform[i] * amp + wave;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        for (const p of this.particles) {
            const [r, g, b] = this.hslToRgb(p.hue, 0.8, 0.6);
            ctx.fillStyle = this.rgbString(r, g, b, p.life);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    getName() { return 'Waveform Visualizer'; }
}


