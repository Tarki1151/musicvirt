/**
 * Calligraphy Orchestra Visualizer
 * Multiple calligrapher pens - one per MIDI channel
 * ALL PENS SYNCHRONIZED on X axis - move together
 * DYNAMIC DISTRIBUTION: Active channels share the available space
 * When only 1 channel is active, it behaves like single Calligrapher
 */
import { Visualizer } from './visualizer-base.js';

class CalligraphyPen {
    constructor(channelId, totalChannels, width, height) {
        this.channelId = channelId;
        this.totalChannels = totalChannels;

        // Layer depth (0 = front/top, higher = further back/below)
        this.layerIndex = channelId;

        // Scale decreases by 10% per layer (0.9^index)
        this.scale = Math.pow(0.9, this.layerIndex);

        // Opacity: 10% less per layer
        this.opacity = 1 - (this.layerIndex * 0.10);
        this.opacity = Math.max(0.35, this.opacity);

        // Pen Y state
        this.penY = 0;
        this.penVelY = 0;
        this.targetY = 0;

        // Zone (will be dynamically set)
        this.zoneTop = 0;
        this.zoneBottom = 0;
        this.zoneCenter = 0;

        // Movement - match single Calligrapher
        this.yResponsiveness = 0.08;
        this.curviness = 0.4;

        // Stroke - match single Calligrapher base values, then scale
        this.baseMinLineWidth = 2;
        this.baseMaxLineWidth = 14;
        this.minLineWidth = this.baseMinLineWidth * this.scale;
        this.maxLineWidth = this.baseMaxLineWidth * this.scale;
        this.currentWidth = 4 * this.scale;
        this.targetWidth = 4 * this.scale;

        // Trail - match single Calligrapher
        this.trailPoints = [];
        this.maxTrailPoints = 80;

        // Loop state
        this.isLooping = false;
        this.loopProgress = 0;
        this.loopOffsetX = 0;
        this.loopCenterY = 0;
        this.loopRadius = 0;
        this.loopDirection = 1;
        this.loopChance = 0.12;

        // Color
        this.hue = (channelId * 40 + 180) % 360;
        this.currentHue = this.hue;

        // Activity
        this.isPenDown = false;
        this.activityLevel = 0;
        this.lastNoteTime = 0;

        this.resize(width, height, totalChannels, channelId);
    }

    // Dynamic resize based on active channel count and position
    resize(width, height, activeCount = 8, activeIndex = -1) {
        this.width = width;
        this.height = height;

        // Margins for UI
        const topMargin = 70;
        const bottomMargin = 130;
        const availableHeight = height - topMargin - bottomMargin;

        // If this pen is not in the active list, use default positioning
        if (activeIndex < 0) {
            activeIndex = this.channelId;
            activeCount = this.totalChannels;
        }

        // Scale based on how many channels are active
        // 1 channel = full scale, 8 channels = normal layered scale
        if (activeCount === 1) {
            // Single channel mode - behave like single Calligrapher
            this.scale = 1;
            this.minLineWidth = this.baseMinLineWidth;
            this.maxLineWidth = this.baseMaxLineWidth;

            // Use full available height
            this.zoneTop = topMargin + 60;
            this.zoneBottom = height - bottomMargin - 60;
        } else {
            // Multiple channels - scale by layer
            this.scale = Math.pow(0.9, activeIndex);
            this.minLineWidth = this.baseMinLineWidth * this.scale;
            this.maxLineWidth = this.baseMaxLineWidth * this.scale;

            // Each active channel gets an equal vertical slice
            const sliceHeight = availableHeight / activeCount;
            const centerY = topMargin + sliceHeight * activeIndex + sliceHeight / 2;

            // Zone height based on scale
            const baseZoneHeight = sliceHeight * 0.9;
            const zoneHeight = baseZoneHeight * this.scale;

            this.zoneTop = centerY - zoneHeight / 2;
            this.zoneBottom = centerY + zoneHeight / 2;
        }

        this.zoneCenter = (this.zoneTop + this.zoneBottom) / 2;

        // Reset pen to center if not active
        if (!this.isPenDown) {
            this.penY = this.zoneCenter;
            this.targetY = this.zoneCenter;
        }
    }

    update(channelData, isBeat, time, dt) {
        if (!channelData || channelData.energy < 0.05) {
            this.activityLevel = Math.max(0, this.activityLevel - dt * 2.5);
            if (time - this.lastNoteTime > 0.5) {
                this.isPenDown = false;
            }
            this.targetY = this.lerp(this.targetY, this.zoneCenter, dt * 0.5);
        } else {
            this.isPenDown = true;
            this.lastNoteTime = time;
            this.activityLevel = Math.min(1, this.activityLevel + dt * 5);

            // Calculate target Y from pitch estimation
            const pitchEstimate = 40 + (channelData.channelId * 8) % 50;
            const normalized = (pitchEstimate - 30) / 60;
            const zoneMargin = 40 * this.scale;
            this.targetY = this.zoneTop + zoneMargin + (1 - normalized) * (this.zoneBottom - this.zoneTop - zoneMargin * 2);

            // Width from energy
            this.targetWidth = this.minLineWidth + channelData.energy * (this.maxLineWidth - this.minLineWidth);

            // Loop chance - same as single Calligrapher
            if (isBeat && Math.random() < this.loopChance && !this.isLooping) {
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
        this.loopRadius = (15 + Math.random() * 25) * this.scale;
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

            // Match single Calligrapher physics
            const yDiff = this.targetY - this.penY;
            this.penVelY += yDiff * this.yResponsiveness * 60 * dt;
            this.penVelY += Math.sin(time * 3 + this.channelId) * this.curviness * 45 * this.activityLevel * dt;
            this.penVelY *= 0.91;
            this.penY += this.penVelY;

            // Clamp to zone
            const margin = 20 * this.scale;
            if (this.penY < this.zoneTop + margin) {
                this.penY = this.zoneTop + margin;
                this.penVelY = Math.abs(this.penVelY) * 0.5;
            }
            if (this.penY > this.zoneBottom - margin) {
                this.penY = this.zoneBottom - margin;
                this.penVelY = -Math.abs(this.penVelY) * 0.5;
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

        // SHARED X POSITION
        this.sharedX = 80;
        this.baseSpeed = 150; // Faster flow
        this.activityLevel = 0;

        // Create pens for each channel
        this.pens = [];
        for (let i = 0; i < this.maxPens; i++) {
            this.pens.push(new CalligraphyPen(i, this.maxPens, canvas.width, canvas.height));
        }

        // Track active channels for dynamic distribution
        this.activeChannels = [];

        // Off-screen buffer
        this.offCanvas = null;
        this.offCtx = null;

        // Scrolling - same thresholds as single Calligrapher
        this.scrolling = false;
        this.scrollSpeed = 0;
        this.targetScrollSpeed = 0;
        this.maxScrollSpeed = 120;

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

        this.updatePenZones();
    }

    updatePenZones() {
        // Get list of active pens
        const activeCount = Math.max(1, this.activeChannels.length);

        for (let i = 0; i < this.pens.length; i++) {
            const pen = this.pens[i];
            const activeIndex = this.activeChannels.indexOf(i);

            if (activeIndex >= 0) {
                // This pen is active - give it a proper zone
                pen.resize(this.width, this.height, activeCount, activeIndex);
            } else {
                // Not active - use default positioning
                pen.resize(this.width, this.height, this.maxPens, i);
            }
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
        this.activeChannels = [];
    }

    update(analysis, dt) {
        super.update(analysis, dt);

        const channelMap = new Map();
        const newActiveChannels = [];

        if (analysis.channelData) {
            for (const ch of analysis.channelData) {
                channelMap.set(ch.channelId, ch);
                if (ch.energy > 0.05) {
                    newActiveChannels.push(ch.channelId);
                }
            }
        }

        // Update active channels list and resize zones if changed
        const activeChanged = newActiveChannels.length !== this.activeChannels.length ||
            !newActiveChannels.every((ch, i) => ch === this.activeChannels[i]);

        if (activeChanged) {
            this.activeChannels = newActiveChannels.sort((a, b) => a - b);
            this.updatePenZones();
        }

        // Activity level
        if (this.activeChannels.length > 0) {
            this.activityLevel = Math.min(1, this.activityLevel + dt * 4);
        } else {
            this.activityLevel = Math.max(0, this.activityLevel - dt * 2);
        }

        // Move SHARED X position - same speed as single Calligrapher
        const horizontalSpeed = this.baseSpeed * (0.7 + this.activityLevel * 0.5);
        this.sharedX += horizontalSpeed * dt;

        // Update each pen
        for (let i = 0; i < this.pens.length; i++) {
            const pen = this.pens[i];
            const channelData = channelMap.get(i);

            pen.update(channelData, analysis.isBeat, this.time, dt);
            pen.addPoint(this.sharedX, this.time);
        }

        // Scrolling - same logic as single Calligrapher
        this.updateScrolling(dt);

        if (this.scrolling && this.scrollSpeed > 0.1) {
            this.applyScroll(dt);
        }

        this.drawStrokes();
    }

    updateScrolling(dt) {
        // Scroll starts when pen reaches right 1/3 of screen (66%)
        const scrollThreshold = this.width * 0.66;

        if (this.sharedX > scrollThreshold && !this.scrolling) {
            this.scrolling = true;
        }

        if (this.scrolling) {
            if (this.sharedX > scrollThreshold) {
                const excess = this.sharedX - scrollThreshold;
                this.targetScrollSpeed = this.baseSpeed * (0.8 + this.activityLevel * 0.4) + excess * 3;

                // Hard clamp at 70% - pen stays in right 1/3 area
                const maxX = this.width * 0.70;
                if (this.sharedX > maxX) {
                    this.sharedX = maxX;
                }
            } else {
                this.targetScrollSpeed = this.baseSpeed * (0.8 + this.activityLevel * 0.4);
            }
        } else {
            this.targetScrollSpeed = 0;
        }

        this.scrollSpeed = this.lerp(this.scrollSpeed, this.targetScrollSpeed, dt * 8);
    }

    applyScroll(dt) {
        const scrollAmount = this.scrollSpeed * dt;
        if (scrollAmount < 0.1) return;

        const ctx = this.offCtx;

        const imageData = ctx.getImageData(
            Math.floor(scrollAmount), 0,
            this.offCanvas.width - Math.floor(scrollAmount),
            this.offCanvas.height
        );

        ctx.fillStyle = '#080910';
        ctx.fillRect(0, 0, this.offCanvas.width, this.offCanvas.height);
        ctx.putImageData(imageData, 0, 0);

        this.sharedX -= scrollAmount;

        for (const pen of this.pens) {
            pen.applyScroll(scrollAmount);
        }
    }

    drawStrokes() {
        const ctx = this.offCtx;

        // Draw from back to front (higher layer = back)
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

        // Draw pen indicators for active pens
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

        // Channel legend (only show if multiple active)
        if (this.activeChannels.length > 1) {
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'right';
            let legendY = 80;
            for (const chId of this.activeChannels) {
                const pen = this.pens[chId];
                const [r, g, b] = this.hslToRgb(pen.currentHue, 0.6, 0.5);
                ctx.fillStyle = this.rgbString(r, g, b, 0.9 * pen.opacity);
                ctx.fillText(`CH${chId + 1}`, this.width - 12, legendY);
                legendY += 14;
            }
        }
    }

    getName() { return 'Calligraphy Orchestra'; }
}
