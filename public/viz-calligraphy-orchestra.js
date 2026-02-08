/**
 * Calligraphy Orchestra Visualizer
 * Multiple calligrapher pens - one per MIDI channel
 * ALL PENS SYNCHRONIZED on X axis - move together
 * All layers fit on screen (can overlap)
 * 5% transparency added per layer (top = 100% opaque)
 */
import { Visualizer } from './visualizer-base.js';

class CalligraphyPen {
    constructor(channelId, totalChannels, width, height) {
        this.channelId = channelId;
        this.totalChannels = totalChannels;

        // Layer depth (0 = front/top, higher = further back/below)
        this.layerIndex = channelId;

        // Scale decreases by 10% per layer (0.9^index)
        // Layer 0: 100%, Layer 1: 90%, Layer 2: 81%, etc.
        this.scale = Math.pow(0.9, this.layerIndex);

        // Opacity: 5% less per layer
        // Layer 0: 100%, Layer 1: 95%, Layer 2: 90%, Layer 3: 85%, etc.
        this.opacity = 1 - (this.layerIndex * 0.05);
        this.opacity = Math.max(0.45, this.opacity);

        // Pen Y state (X is controlled by parent)
        this.penY = 0;
        this.penVelY = 0;
        this.targetY = 0;

        // Movement
        this.yResponsiveness = 0.08;
        this.curviness = 0.4;

        // Stroke - scaled
        this.minLineWidth = 2 * this.scale;
        this.maxLineWidth = 14 * this.scale;
        this.currentWidth = 4 * this.scale;
        this.targetWidth = 4 * this.scale;

        // Trail
        this.trailPoints = [];
        this.maxTrailPoints = 70;

        // Loop state
        this.isLooping = false;
        this.loopProgress = 0;
        this.loopOffsetX = 0;
        this.loopCenterY = 0;
        this.loopRadius = 0;
        this.loopDirection = 1;

        // Color - each channel has unique hue
        this.hue = (channelId * 40 + 180) % 360;
        this.currentHue = this.hue;

        // Activity
        this.isPenDown = false;
        this.activityLevel = 0;
        this.lastNoteTime = 0;

        this.resize(width, height);
    }

    resize(width, height) {
        this.width = width;
        this.height = height;

        // Base zone height is 1/3 of screen for layer 0
        // Each layer is 10% smaller
        const baseZoneHeight = height * 0.28;
        const zoneHeight = baseZoneHeight * this.scale;

        // Account for actual UI elements
        const topMargin = 70;       // Top bar with mode selector
        const bottomMargin = 130;   // Bottom player controls
        const availableHeight = height - topMargin - bottomMargin;

        // Each layer gets an equal vertical slice of the available space
        const sliceHeight = availableHeight / this.totalChannels;

        // Center Y position for this layer - evenly distributed
        const centerY = topMargin + sliceHeight * this.layerIndex + sliceHeight / 2;

        this.zoneTop = centerY - zoneHeight / 2;
        this.zoneBottom = centerY + zoneHeight / 2;
        this.zoneCenter = centerY;

        this.penY = this.zoneCenter;
        this.targetY = this.zoneCenter;
    }



    update(channelData, isBeat, time, dt) {
        if (!channelData || channelData.energy < 0.05) {
            this.activityLevel = Math.max(0, this.activityLevel - dt * 2.5);
            if (time - this.lastNoteTime > 0.5) {
                this.isPenDown = false;
            }
            this.targetY = this.lerp(this.targetY, this.zoneCenter, dt * 0.4);
        } else {
            this.isPenDown = true;
            this.lastNoteTime = time;
            this.activityLevel = Math.min(1, this.activityLevel + dt * 5);

            // Calculate target Y from pitch estimation
            const pitchEstimate = 40 + (channelData.channelId * 8) % 50;
            const normalized = (pitchEstimate - 30) / 60;
            const zoneMargin = 12 * this.scale;
            this.targetY = this.zoneTop + zoneMargin + (1 - normalized) * (this.zoneBottom - this.zoneTop - zoneMargin * 2);

            // Width from energy
            this.targetWidth = this.minLineWidth + channelData.energy * (this.maxLineWidth - this.minLineWidth);

            // Loop chance
            if (isBeat && Math.random() < 0.1 && !this.isLooping) {
                this.startLoop();
            }
        }

        this.updateMovement(dt, time);
    }

    startLoop() {
        this.isLooping = true;
        this.loopProgress = 0;
        this.loopOffsetX = 0;
        this.loopCenterY = this.penY;
        this.loopRadius = (8 + Math.random() * 15) * this.scale;
        this.loopDirection = Math.random() > 0.5 ? 1 : -1;
    }

    updateMovement(dt, time) {
        this.currentWidth = this.lerp(this.currentWidth, this.targetWidth, dt * 5);

        if (this.isLooping) {
            this.loopProgress += dt * 3.5;
            const angle = this.loopProgress * Math.PI * 2 * this.loopDirection;

            this.loopOffsetX = Math.cos(angle) * this.loopRadius * (1 + this.loopProgress * 0.2);
            this.penY = this.loopCenterY + Math.sin(angle) * this.loopRadius;

            if (this.loopProgress >= 1) {
                this.isLooping = false;
                this.loopOffsetX = 0;
            }
        } else {
            this.loopOffsetX = 0;

            const yDiff = this.targetY - this.penY;
            this.penVelY += yDiff * this.yResponsiveness * 55 * dt;
            this.penVelY += Math.sin(time * 2.8 + this.channelId) * this.curviness * 35 * this.activityLevel * dt;
            this.penVelY *= 0.9;
            this.penY += this.penVelY;

            // Clamp to zone
            const margin = 6 * this.scale;
            if (this.penY < this.zoneTop + margin) {
                this.penY = this.zoneTop + margin;
                this.penVelY = Math.abs(this.penVelY) * 0.4;
            }
            if (this.penY > this.zoneBottom - margin) {
                this.penY = this.zoneBottom - margin;
                this.penVelY = -Math.abs(this.penVelY) * 0.4;
            }
        }
    }

    getPenX(mainX) {
        return mainX + this.loopOffsetX;
    }

    addPoint(mainX, time) {
        if (!this.isPenDown && !this.isLooping) return;

        this.trailPoints.push({
            x: this.getPenX(mainX),
            y: this.penY,
            width: this.currentWidth,
            hue: this.currentHue,
            time: time
        });

        while (this.trailPoints.length > this.maxTrailPoints) {
            this.trailPoints.shift();
        }
    }

    applyScroll(amount) {
        for (const pt of this.trailPoints) {
            pt.x -= amount;
        }
        this.trailPoints = this.trailPoints.filter(pt => pt.x > -100);
    }

    lerp(a, b, t) {
        return a + (b - a) * t;
    }
}

export class CalligraphyOrchestra extends Visualizer {
    constructor(canvas) {
        super(canvas);

        this.maxPens = 8;

        // SHARED X POSITION for all pens
        this.sharedX = 80;
        this.baseSpeed = 95;
        this.activityLevel = 0;

        // Create pens for each channel
        this.pens = [];
        for (let i = 0; i < this.maxPens; i++) {
            this.pens.push(new CalligraphyPen(i, this.maxPens, canvas.width, canvas.height));
        }

        // Off-screen buffer
        this.offCanvas = null;
        this.offCtx = null;

        // Scrolling
        this.scrolling = false;
        this.scrollSpeed = 0;

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

        for (const pen of this.pens) {
            pen.resize(w, h);
        }
    }

    clearBuffer() {
        if (this.offCtx) {
            this.offCtx.fillStyle = '#080910';
            this.offCtx.fillRect(0, 0, this.offCanvas.width, this.offCanvas.height);
        }
        this.sharedX = 80;
        this.scrolling = false;
        this.scrollSpeed = 0;
    }

    update(analysis, dt) {
        super.update(analysis, dt);

        const channelMap = new Map();
        let anyActive = false;

        if (analysis.channelData) {
            for (const ch of analysis.channelData) {
                channelMap.set(ch.channelId, ch);
                if (ch.energy > 0.05) anyActive = true;
            }
        }

        if (anyActive) {
            this.activityLevel = Math.min(1, this.activityLevel + dt * 4);
        } else {
            this.activityLevel = Math.max(0, this.activityLevel - dt * 2);
        }

        // Move SHARED X position
        const horizontalSpeed = this.baseSpeed * (0.7 + this.activityLevel * 0.5);
        this.sharedX += horizontalSpeed * dt;

        // Update each pen
        for (let i = 0; i < this.pens.length; i++) {
            const pen = this.pens[i];
            const channelData = channelMap.get(i);

            pen.update(channelData, analysis.isBeat, this.time, dt);
            pen.addPoint(this.sharedX, this.time);
        }

        this.updateScrolling(dt);

        if (this.scrolling && this.scrollSpeed > 0.1) {
            const scrollAmount = this.scrollSpeed * dt;
            this.applyScroll(scrollAmount);
        }

        this.drawStrokes();
    }

    updateScrolling(dt) {
        const centerX = this.width * 0.5;

        if (this.sharedX > centerX && !this.scrolling) {
            this.scrolling = true;
        }

        if (this.scrolling) {
            const targetSpeed = this.baseSpeed * (0.7 + this.activityLevel * 0.5);
            this.scrollSpeed = this.lerp(this.scrollSpeed, targetSpeed, dt * 5);
        }
    }

    applyScroll(amount) {
        const ctx = this.offCtx;

        const imageData = ctx.getImageData(
            Math.floor(amount), 0,
            this.offCanvas.width - Math.floor(amount),
            this.offCanvas.height
        );

        ctx.fillStyle = '#080910';
        ctx.fillRect(0, 0, this.offCanvas.width, this.offCanvas.height);
        ctx.putImageData(imageData, 0, 0);

        this.sharedX -= amount;

        for (const pen of this.pens) {
            pen.applyScroll(amount);
        }
    }

    drawStrokes() {
        const ctx = this.offCtx;

        // Draw from back to front (higher layer = back, draw first)
        for (let i = this.pens.length - 1; i >= 0; i--) {
            const pen = this.pens[i];

            if (pen.trailPoints.length < 3) continue;

            const pts = pen.trailPoints;
            const len = pts.length;

            const p0 = pts[len - 3];
            const p1 = pts[len - 2];
            const p2 = pts[len - 1];

            const [r, g, b] = this.hslToRgb(p1.hue, 0.6, 0.4);
            const alpha = pen.opacity;

            // Main stroke
            ctx.strokeStyle = this.rgbString(r, g, b, 0.9 * alpha);
            ctx.lineWidth = p1.width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
            ctx.stroke();

            // Ink bleed
            ctx.strokeStyle = this.rgbString(r * 0.7, g * 0.7, b * 0.7, 0.12 * alpha);
            ctx.lineWidth = p1.width * 1.7;
            ctx.stroke();

            // Highlight
            if (p1.width > pen.minLineWidth * 1.4) {
                ctx.strokeStyle = this.rgbString(
                    Math.min(255, r + 55),
                    Math.min(255, g + 55),
                    Math.min(255, b + 55),
                    0.22 * alpha
                );
                ctx.lineWidth = p1.width * 0.28;
                ctx.stroke();
            }
        }
    }

    render() {
        const ctx = this.ctx;

        ctx.fillStyle = '#080910';
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.drawImage(this.offCanvas, 0, 0);

        // Draw pen indicators
        for (let i = 0; i < this.pens.length; i++) {
            const pen = this.pens[i];
            if (!pen.isPenDown && !pen.isLooping) continue;

            const penX = pen.getPenX(this.sharedX);
            const [r, g, b] = this.hslToRgb(pen.currentHue, 0.7, 0.55);
            const alpha = pen.opacity * 0.9;

            // Glow
            const glowSize = 25 * pen.scale;
            const gradient = ctx.createRadialGradient(
                penX, pen.penY, 0,
                penX, pen.penY, glowSize
            );
            gradient.addColorStop(0, this.rgbString(r, g, b, 0.6 * alpha));
            gradient.addColorStop(0.5, this.rgbString(r, g, b, 0.15 * alpha));
            gradient.addColorStop(1, this.rgbString(r, g, b, 0));

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(penX, pen.penY, glowSize, 0, Math.PI * 2);
            ctx.fill();

            // Tip
            ctx.fillStyle = this.rgbString(r, g, b, 0.95 * alpha);
            ctx.beginPath();
            ctx.arc(penX, pen.penY, pen.currentWidth / 2 + 1, 0, Math.PI * 2);
            ctx.fill();
        }

        // Channel legend (top right)
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'right';
        let legendY = 18;
        for (const pen of this.pens) {
            if (pen.isPenDown || pen.isLooping) {
                const [r, g, b] = this.hslToRgb(pen.currentHue, 0.6, 0.5);
                ctx.fillStyle = this.rgbString(r, g, b, 0.9 * pen.opacity);
                ctx.fillText(`CH${pen.channelId + 1}`, this.width - 12, legendY);
                legendY += 14;
            }
        }
    }

    getName() { return 'Calligraphy Orchestra'; }
}
