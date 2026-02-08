/**
 * The Calligrapher Visualizer
 * Flowing organic calligraphy with dramatic curves and loops
 * Continuous scrolling when pen crosses screen center
 * Golden Rules: Normalization, Clamping, Automatic Decay
 */
import { Visualizer } from './visualizer-base.js';

export class TheCalligrapher extends Visualizer {
    constructor(canvas) {
        super(canvas);

        // Pen state - the actual drawing cursor
        this.penX = 0;
        this.penY = 0;
        this.penVelX = 0;
        this.penVelY = 0;
        this.targetY = 0;

        // Movement settings
        this.baseSpeed = 100; // Horizontal movement
        this.yResponsiveness = 0.08;
        this.curviness = 0.4;
        this.loopChance = 0.12;

        // Stroke settings
        this.minLineWidth = 2;
        this.maxLineWidth = 14;
        this.currentWidth = 4;
        this.targetWidth = 4;

        // Trail history for smooth bezier curves
        this.trailPoints = [];
        this.maxTrailPoints = 80;

        // Continuous scroll settings
        this.scrolling = false;
        this.scrollSpeed = 0; // Current scroll speed
        this.targetScrollSpeed = 0;
        this.maxScrollSpeed = 120; // Max scroll speed to match pen speed

        // Loop/flourish state
        this.isLooping = false;
        this.loopProgress = 0;
        this.loopCenterX = 0;
        this.loopCenterY = 0;
        this.loopRadius = 0;
        this.loopDirection = 1;

        // Color based on dominant channel
        this.currentHue = 220;
        this.targetHue = 220;

        // Ink settings
        this.inkFlow = 1;
        this.isPenDown = false;

        // Off-screen buffer for accumulated drawing
        this.offCanvas = null;
        this.offCtx = null;

        // Previous pen state for drawing
        this.prevPenX = 0;
        this.prevPenY = 0;
        this.prevWidth = 4;

        // Activity tracking
        this.activityLevel = 0;
        this.lastNoteTime = 0;

        this.resize(canvas.width, canvas.height);
    }

    resize(w, h) {
        super.resize(w, h);

        if (!this.offCanvas || this.offCanvas.width !== w || this.offCanvas.height !== h) {
            this.offCanvas = document.createElement('canvas');
            this.offCanvas.width = w;
            this.offCanvas.height = h;
            this.offCtx = this.offCanvas.getContext('2d');
            this.clearBuffer();
        }

        this.penY = h / 2;
        this.targetY = h / 2;
    }

    clearBuffer() {
        if (this.offCtx) {
            this.offCtx.fillStyle = '#0a0b12';
            this.offCtx.fillRect(0, 0, this.offCanvas.width, this.offCanvas.height);
        }
        this.penX = 80;
        this.trailPoints = [];
        this.scrolling = false;
        this.scrollSpeed = 0;
    }

    update(analysis, dt) {
        super.update(analysis, dt);

        // Gather note information
        let totalEnergy = 0;
        let weightedPitch = 0;
        let totalWeight = 0;
        let dominantChannel = 0;
        let maxChannelEnergy = 0;
        let noteCount = 0;

        if (analysis.channelData) {
            for (const ch of analysis.channelData) {
                if (ch.energy > 0.05) {
                    noteCount += ch.noteCount;
                    totalEnergy += ch.energy;

                    const estimatedPitch = 40 + (ch.channelId * 5) % 60;
                    weightedPitch += estimatedPitch * ch.energy;
                    totalWeight += ch.energy;

                    if (ch.energy > maxChannelEnergy) {
                        maxChannelEnergy = ch.energy;
                        dominantChannel = ch.channelId;
                    }
                }
            }
        }

        // Fallback to spectrum
        if (totalWeight === 0) {
            const spectrum = analysis.spectrum || [];
            for (let i = 0; i < spectrum.length; i++) {
                const val = spectrum[i] || 0;
                if (val > 30) {
                    const pitch = 30 + (i / spectrum.length) * 70;
                    weightedPitch += pitch * val;
                    totalWeight += val;
                    totalEnergy += val / 255;
                    noteCount++;
                }
            }
        }

        // Determine target Y from pitch
        if (totalWeight > 0) {
            const avgPitch = weightedPitch / totalWeight;
            const normalizedPitch = (avgPitch - 30) / 70;
            this.targetY = this.height * 0.12 + (1 - normalizedPitch) * this.height * 0.76;

            this.targetHue = (dominantChannel * 35 + 180) % 360;
            this.targetWidth = this.minLineWidth + (totalEnergy / noteCount) * (this.maxLineWidth - this.minLineWidth);
            this.targetWidth = Math.max(this.minLineWidth, Math.min(this.maxLineWidth, this.targetWidth));

            this.isPenDown = true;
            this.lastNoteTime = this.time;
            this.activityLevel = Math.min(1, this.activityLevel + dt * 3);

            if (analysis.isBeat && Math.random() < this.loopChance && !this.isLooping) {
                this.startLoop();
            }
        } else {
            this.targetY = this.lerp(this.targetY, this.height / 2, dt * 0.5);
            this.activityLevel = Math.max(0, this.activityLevel - dt * 2);

            if (this.time - this.lastNoteTime > 0.3) {
                this.isPenDown = false;
            }
        }

        // Update pen physics
        this.updatePenMovement(dt);

        // Check if we should start scrolling (pen crossed center)
        this.updateScrolling(dt);

        // Apply continuous scrolling
        if (this.scrolling && this.scrollSpeed > 0) {
            this.applyScroll(dt);
        }

        // Draw to buffer if pen is down
        if (this.isPenDown || this.isLooping) {
            this.drawStroke(dt);
        }

        // Store previous state
        this.prevPenX = this.penX;
        this.prevPenY = this.penY;
        this.prevWidth = this.currentWidth;
    }

    startLoop() {
        this.isLooping = true;
        this.loopProgress = 0;
        this.loopCenterX = this.penX + 15;
        this.loopCenterY = this.penY;
        this.loopRadius = 12 + Math.random() * 20;
        this.loopDirection = Math.random() > 0.5 ? 1 : -1;
    }

    updatePenMovement(dt) {
        this.currentHue = this.lerp(this.currentHue, this.targetHue, dt * 2);
        this.currentWidth = this.lerp(this.currentWidth, this.targetWidth, dt * 5);

        if (this.isLooping) {
            this.loopProgress += dt * 3.5;

            const angle = this.loopProgress * Math.PI * 2 * this.loopDirection;
            this.penX = this.loopCenterX + Math.cos(angle) * this.loopRadius * (1 + this.loopProgress * 0.25);
            this.penY = this.loopCenterY + Math.sin(angle) * this.loopRadius;

            this.loopCenterX += dt * this.baseSpeed * 0.4;

            if (this.loopProgress >= 1) {
                this.isLooping = false;
            }
        } else {
            // Horizontal: steady forward
            const horizontalSpeed = this.baseSpeed * (0.8 + this.activityLevel * 0.4);
            this.penX += horizontalSpeed * dt;

            // Vertical: follow target with physics
            const yDiff = this.targetY - this.penY;
            this.penVelY += yDiff * this.yResponsiveness * 60 * dt;
            this.penVelY += Math.sin(this.time * 3) * this.curviness * 45 * this.activityLevel * dt;
            this.penVelY *= 0.91;
            this.penY += this.penVelY;

            // Clamp to screen
            const margin = 60;
            if (this.penY < margin) {
                this.penY = margin;
                this.penVelY = Math.abs(this.penVelY) * 0.5;
            }
            if (this.penY > this.height - margin) {
                this.penY = this.height - margin;
                this.penVelY = -Math.abs(this.penVelY) * 0.5;
            }
        }
    }

    updateScrolling(dt) {
        const centerX = this.width * 0.5;

        // Start scrolling when pen crosses center
        if (this.penX > centerX && !this.scrolling) {
            this.scrolling = true;
        }

        if (this.scrolling) {
            // CRITICAL: Clamp pen to center - it should NEVER go past center
            if (this.penX > centerX) {
                // Calculate how much we need to scroll to bring pen back to center
                const excess = this.penX - centerX;
                this.targetScrollSpeed = this.baseSpeed * (0.8 + this.activityLevel * 0.4) + excess * 3;

                // Hard clamp - pen must not exceed 55% of screen width
                const maxX = this.width * 0.55;
                if (this.penX > maxX) {
                    this.penX = maxX;
                }
            } else {
                this.targetScrollSpeed = this.baseSpeed * (0.8 + this.activityLevel * 0.4);
            }
        } else {
            this.targetScrollSpeed = 0;
        }

        // Faster scroll speed transition for responsive scrolling
        this.scrollSpeed = this.lerp(this.scrollSpeed, this.targetScrollSpeed, dt * 8);
    }

    applyScroll(dt) {
        const scrollAmount = this.scrollSpeed * dt;

        if (scrollAmount < 0.1) return;

        const ctx = this.offCtx;

        // Shift the entire canvas left
        const imageData = ctx.getImageData(
            scrollAmount, 0,
            this.offCanvas.width - scrollAmount,
            this.offCanvas.height
        );

        // Clear and redraw shifted
        ctx.fillStyle = '#0a0b12';
        ctx.fillRect(0, 0, this.offCanvas.width, this.offCanvas.height);
        ctx.putImageData(imageData, 0, 0);

        // Update all positions
        this.penX -= scrollAmount;
        this.prevPenX -= scrollAmount;
        this.loopCenterX -= scrollAmount;

        for (const pt of this.trailPoints) {
            pt.x -= scrollAmount;
        }

        // Remove points that are off-screen
        this.trailPoints = this.trailPoints.filter(pt => pt.x > -50);
    }

    drawStroke(dt) {
        this.trailPoints.push({
            x: this.penX,
            y: this.penY,
            width: this.currentWidth,
            hue: this.currentHue,
            time: this.time
        });

        while (this.trailPoints.length > this.maxTrailPoints) {
            this.trailPoints.shift();
        }

        if (this.trailPoints.length < 3) return;

        const ctx = this.offCtx;
        const pts = this.trailPoints;
        const len = pts.length;

        const p0 = pts[len - 3];
        const p1 = pts[len - 2];
        const p2 = pts[len - 1];

        const [r, g, b] = this.hslToRgb(p1.hue, 0.65, 0.40);

        // Main stroke
        ctx.strokeStyle = this.rgbString(r, g, b, 0.9);
        ctx.lineWidth = p1.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
        ctx.stroke();

        // Ink bleed effect
        ctx.strokeStyle = this.rgbString(r * 0.8, g * 0.8, b * 0.8, 0.12);
        ctx.lineWidth = p1.width * 1.9;
        ctx.stroke();

        // Highlight on thick parts
        if (p1.width > this.minLineWidth * 1.5) {
            ctx.strokeStyle = this.rgbString(
                Math.min(255, r + 60),
                Math.min(255, g + 60),
                Math.min(255, b + 60),
                0.25
            );
            ctx.lineWidth = p1.width * 0.3;
            ctx.stroke();
        }
    }

    render() {
        const ctx = this.ctx;

        // Draw the off-screen buffer
        ctx.drawImage(this.offCanvas, 0, 0);

        // Draw subtle guide lines
        ctx.strokeStyle = 'rgba(80, 100, 140, 0.05)';
        ctx.lineWidth = 1;
        for (let y = this.height * 0.15; y < this.height * 0.9; y += this.height * 0.15) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
            ctx.stroke();
        }

        // Draw pen position indicator
        if (this.isPenDown) {
            const [r, g, b] = this.hslToRgb(this.currentHue, 0.7, 0.55);

            // Pen tip glow
            const gradient = ctx.createRadialGradient(
                this.penX, this.penY, 0,
                this.penX, this.penY, 35
            );
            gradient.addColorStop(0, this.rgbString(r, g, b, 0.5));
            gradient.addColorStop(0.5, this.rgbString(r, g, b, 0.15));
            gradient.addColorStop(1, this.rgbString(r, g, b, 0));

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(this.penX, this.penY, 35, 0, Math.PI * 2);
            ctx.fill();

            // Pen tip
            ctx.fillStyle = this.rgbString(r, g, b, 0.95);
            ctx.beginPath();
            ctx.arc(this.penX, this.penY, this.currentWidth / 2 + 1, 0, Math.PI * 2);
            ctx.fill();
        }

        // Center line indicator (faint)
        if (this.scrolling) {
            ctx.strokeStyle = 'rgba(100, 130, 180, 0.08)';
            ctx.setLineDash([5, 10]);
            ctx.beginPath();
            ctx.moveTo(this.width / 2, 0);
            ctx.lineTo(this.width / 2, this.height);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    getName() { return 'Calligrapher'; }
}
