/**
 * Particle System Visualizer
 * Dynamic particles with orbit/explode/swarm modes
 */
import { Visualizer } from './visualizer-base.js';

export class ParticleSystem extends Visualizer {
    constructor(canvas, ctx) {
        super(canvas);
        this.particles = [];
        this.maxParticles = 1500;
        this.mode = 'orbit';
        this.explosionForce = 0;
        this.baseHue = 0;
        for (let i = 0; i < 400; i++) this.particles.push(this.createParticle());
    }

    createParticle() {
        return {
            x: this.width / 2, y: this.height / 2,
            vx: 0, vy: 0,
            hue: Math.random() * 360,
            size: 2 + Math.random() * 3,
            orbitRadius: 50 + Math.random() * 200,
            orbitSpeed: 0.5 + Math.random() * 1.5,
            orbitAngle: Math.random() * Math.PI * 2
        };
    }

    update(analysis, dt) {
        super.update(analysis, dt);
        this.baseHue = (analysis.spectralCentroid / 5) % 360;

        if (analysis.isBeat && analysis.totalEnergy > 100) {
            this.explosionForce = 600;
            if (Math.random() < 0.3) {
                this.mode = ['orbit', 'explode', 'swarm'][Math.floor(Math.random() * 3)];
            }
        }
        this.explosionForce *= 0.9;

        // Spawn new particles on beat
        if (analysis.isBeat) {
            const count = Math.floor(analysis.totalEnergy / 5 + 10);
            for (let i = 0; i < count && this.particles.length < this.maxParticles; i++) {
                const p = this.createParticle();
                const angle = Math.random() * Math.PI * 2;
                const speed = 100 + Math.random() * 300;
                p.vx = Math.cos(angle) * speed;
                p.vy = Math.sin(angle) * speed;
                p.hue = (this.baseHue + Math.random() * 60 - 30) % 360;
                this.particles.push(p);
            }
        }

        const cx = this.width / 2, cy = this.height / 2, bass = analysis.bassNorm;

        for (const p of this.particles) {
            const dx = cx - p.x, dy = cy - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy) + 1;
            let ax = 0, ay = 0;

            if (this.mode === 'orbit') {
                p.orbitAngle += p.orbitSpeed * dt * (1 + bass * 2);
                const tx = cx + Math.cos(p.orbitAngle) * p.orbitRadius * (1 + bass);
                const ty = cy + Math.sin(p.orbitAngle) * p.orbitRadius * (1 + bass);
                ax = (tx - p.x) * 5;
                ay = (ty - p.y) * 5;
            } else if (this.mode === 'explode') {
                const force = this.explosionForce / (dist * 0.1 + 1);
                ax = -(dx / dist) * force + dx * 0.5;
                ay = -(dy / dist) * force + dy * 0.5;
            } else {
                const tx = cx + Math.sin(this.time * 2) * 200;
                const ty = cy + Math.cos(this.time * 3) * 150;
                ax = (tx - p.x) * 3;
                ay = (ty - p.y) * 3;
            }

            p.vx = (p.vx + ax * dt) * 0.98;
            p.vy = (p.vy + ay * dt) * 0.98;
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            // Wrap around
            if (p.x < -50) p.x = this.width + 50;
            if (p.x > this.width + 50) p.x = -50;
            if (p.y < -50) p.y = this.height + 50;
            if (p.y > this.height + 50) p.y = -50;

            p.hue = (this.baseHue + Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 0.3) % 360;
        }

        if (this.particles.length > this.maxParticles) {
            this.particles = this.particles.slice(-this.maxParticles);
        }
    }

    render() {
        for (const p of this.particles) {
            const [r, g, b] = this.hslToRgb(p.hue, 0.8, 0.6);
            this.ctx.fillStyle = this.rgbString(r, g, b, 0.9);
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    getName() { return `Particle System (${this.mode})`; }
}


