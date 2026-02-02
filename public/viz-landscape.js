/**
 * 3D Landscape Visualizer
 * Terrain mesh that responds to audio
 */
import { Visualizer } from './visualizer-base.js';

export class Landscape extends Visualizer {
    constructor(canvas, ctx) {
        super(canvas);
        this.gridWidth = 32;
        this.gridDepth = 24;
        this.heights = Array(this.gridDepth).fill().map(() => Array(this.gridWidth).fill(0));
        this.targetHeights = Array(this.gridDepth).fill().map(() => Array(this.gridWidth).fill(0));
        this.cameraHeight = 150;
        this.horizonY = 0.35;
        this.fovScale = 800;
        this.waveTime = 0;
    }

    update(analysis, dt) {
        super.update(analysis, dt);
        this.waveTime += dt;

        // Shift heights back
        for (let z = this.gridDepth - 1; z > 0; z--) {
            this.targetHeights[z] = [...this.targetHeights[z - 1]];
        }

        const bars = analysis.bars || [];
        const heightScale = 100 + analysis.bassNorm * 100;

        for (let x = 0; x < this.gridWidth; x++) {
            const barIndex = Math.floor((x / this.gridWidth) * bars.length * 0.5);
            const wave = Math.sin(this.waveTime * 2 + x * 0.3) * 15;
            this.targetHeights[0][x] = (bars[barIndex] || 0) * heightScale + wave;
        }

        // Smooth interpolation
        for (let z = 0; z < this.gridDepth; z++) {
            for (let x = 0; x < this.gridWidth; x++) {
                this.heights[z][x] = this.lerp(this.heights[z][x], this.targetHeights[z][x], 0.3);
            }
        }

        if (analysis.isBeat) {
            for (let z = 0; z < this.gridDepth; z++) {
                for (let x = 0; x < this.gridWidth; x++) {
                    this.heights[z][x] *= 1.2;
                }
            }
        }
    }

    projectPoint(x, z, y) {
        const zOffset = Math.max(0.1, z + 5);
        const scale = this.fovScale / zOffset;
        return {
            x: this.width / 2 + x * scale,
            y: this.height * this.horizonY + (this.cameraHeight - y) * scale * 0.5
        };
    }

    getTerrainColor(height, z) {
        const t = Math.min(1, height / 200);
        const r = Math.floor(20 + 235 * t);
        const g = 100;
        const b = Math.floor(150 + 50 * t);
        const fade = 0.3 + 0.7 * (1 - z / this.gridDepth);
        return this.rgbString(Math.floor(r * fade), Math.floor(g * fade), Math.floor(b * fade));
    }

    render() {
        const ctx = this.ctx;
        const cellWidth = 40;

        // Draw sky gradient
        const skyGrad = ctx.createLinearGradient(0, 0, 0, this.height * this.horizonY);
        skyGrad.addColorStop(0, '#0a0f1a');
        skyGrad.addColorStop(1, '#1a2840');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, this.width, this.height * this.horizonY);

        // Draw terrain
        for (let z = this.gridDepth - 1; z > 0; z--) {
            for (let x = 0; x < this.gridWidth - 1; x++) {
                const h00 = this.heights[z][x], h10 = this.heights[z][x + 1];
                const h01 = this.heights[z - 1][x], h11 = this.heights[z - 1][x + 1];
                const xOffset = (x - this.gridWidth / 2) * cellWidth;
                const zPos = z * cellWidth * 0.8;

                const p00 = this.projectPoint(xOffset, zPos, h00);
                const p10 = this.projectPoint(xOffset + cellWidth, zPos, h10);
                const p01 = this.projectPoint(xOffset, zPos - cellWidth * 0.8, h01);
                const p11 = this.projectPoint(xOffset + cellWidth, zPos - cellWidth * 0.8, h11);

                const avgHeight = (h00 + h10 + h01 + h11) / 4;

                if (p00.x > -100 && p10.x < this.width + 100) {
                    ctx.fillStyle = this.getTerrainColor(avgHeight, z);
                    ctx.beginPath();
                    ctx.moveTo(p00.x, p00.y);
                    ctx.lineTo(p10.x, p10.y);
                    ctx.lineTo(p11.x, p11.y);
                    ctx.lineTo(p01.x, p01.y);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = this.rgbString(100, 200, 255, 0.3);
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }
        }
    }

    getName() { return '3D Landscape'; }
}


