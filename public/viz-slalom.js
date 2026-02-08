/**
 * MIDI Slalom Visualizer
 * Top-down skiing with pre-generated terrain features
 * Golden Rules: Normalization, Clamping, Automatic Decay
 */
import { Visualizer } from './visualizer-base.js';

export class MidiSlalom extends Visualizer {
    constructor(canvas) {
        super(canvas);

        // Skier properties
        this.skier = {
            x: 0,
            targetX: 0,
            y: 0,
            baseY: 0,
            velocityX: 0,
            velocityY: 0,
            airborne: false,
            altitude: 0,
            rotation: 0,
            state: 'center',
            opacity: 1,
            hitCooldown: 0
        };

        // Terrain features (spawn ahead, scroll towards skier)
        this.terrainFeatures = []; // {y, type: 'bump'|'dip', height, width}
        this.lastTerrainSpawn = 0;
        this.terrainSpeed = 280;

        // Current ground level at skier position
        this.groundLevel = 0;
        this.groundLevelSmooth = 0;

        // Movement settings
        this.lerpSpeed = 0.06;
        this.safeZonePadding = 100;
        this.gravity = 1200;
        this.launchMultiplier = 1.8;

        // Gates with zigzag pattern
        this.gates = [];
        this.gateSpeed = 280;
        this.minGateWidth = 80;
        this.maxGateWidth = 180;
        this.poleRadius = 6;
        this.poleHeight = 50;
        this.zigzagAmplitude = 100;
        this.gateIndex = 0;
        this.lastGateSpawn = 0;

        // Visual effects
        this.screenShake = { x: 0, y: 0, intensity: 0 };
        this.snowParticles = [];
        this.maxSnowParticles = 180;
        this.sprayParticles = [];
        this.maxSprayParticles = 40;

        // Ski trail
        this.trail = [];
        this.maxTrailPoints = 100;

        // Background parallax
        this.bgOffset1 = 0;
        this.bgOffset2 = 0;
        this.bgOffset3 = 0;

        // Score
        this.gatesPassed = 0;
        this.gatesHit = 0;
        this.airTime = 0;
        this.maxAirTime = 0;

        this.initSnowParticles();
        this.resize(canvas.width, canvas.height);
    }

    resize(w, h) {
        super.resize(w, h);
        this.skier.x = w / 2;
        this.skier.targetX = w / 2;
        this.skier.baseY = h * 0.72;
        this.skier.y = this.skier.baseY;
    }

    initSnowParticles() {
        this.snowParticles = [];
        for (let i = 0; i < this.maxSnowParticles; i++) {
            this.snowParticles.push(this.createSnowParticle());
        }
    }

    createSnowParticle() {
        return {
            x: Math.random() * (this.width || 1920),
            y: Math.random() * (this.height || 1080),
            size: 1 + Math.random() * 2.5,
            speed: 80 + Math.random() * 160,
            opacity: 0.2 + Math.random() * 0.4,
            drift: (Math.random() - 0.5) * 30
        };
    }

    pitchToX(pitch) {
        const normalized = pitch / 127;
        const usableWidth = this.width - this.safeZonePadding * 2;
        return this.safeZonePadding + normalized * usableWidth;
    }

    lerp(a, b, t) {
        return a + (b - a) * t;
    }

    update(analysis, dt) {
        super.update(analysis, dt);

        // Update background parallax
        const scrollMult = this.skier.airborne ? 0.6 : 1;
        this.bgOffset1 = (this.bgOffset1 + dt * 30 * scrollMult) % 60;
        this.bgOffset2 = (this.bgOffset2 + dt * 70 * scrollMult) % 30;
        this.bgOffset3 = (this.bgOffset3 + dt * 140 * scrollMult) % 15;

        // Process MIDI data
        this.processNotes(analysis, dt);

        // Update terrain features
        this.updateTerrain(dt);

        // Calculate ground level at skier position
        this.calculateGroundLevel();

        // Update skier
        this.updateSkier(dt);

        // Update gates
        this.updateGates(dt);

        // Check collisions (only when on ground)
        if (!this.skier.airborne) {
            this.checkCollisions();
        }

        // Update particles
        this.updateParticles(dt);

        // Update screen shake
        this.updateScreenShake(dt);

        // Update trail
        this.updateTrail(dt);
    }

    processNotes(analysis, dt) {
        let avgPitch = null;
        let totalEnergy = 0;
        let noteCount = 0;
        let hasBeat = analysis.isBeat;
        let maxEnergy = 0;

        if (analysis.channelData) {
            for (const ch of analysis.channelData) {
                if (ch.energy > 0.08) {
                    const estimatedPitch = (ch.channelId * 10 + 40) % 128;
                    avgPitch = avgPitch === null ? estimatedPitch : (avgPitch + estimatedPitch) / 2;
                    totalEnergy += ch.energy;
                    maxEnergy = Math.max(maxEnergy, ch.energy);
                    noteCount += ch.noteCount;
                    if (ch.isBeat) hasBeat = true;
                }
            }
        }

        // Fallback to spectrum
        if (avgPitch === null) {
            const spectrum = analysis.spectrum || [];
            let weightedPitch = 0;
            let totalWeight = 0;

            for (let i = 0; i < spectrum.length; i++) {
                const val = spectrum[i] || 0;
                if (val > 40) {
                    const pitch = (i / spectrum.length) * 127;
                    weightedPitch += pitch * val;
                    totalWeight += val;
                    totalEnergy += val / 255;
                    maxEnergy = Math.max(maxEnergy, val / 255);
                    noteCount++;
                }
            }

            if (totalWeight > 0) {
                avgPitch = weightedPitch / totalWeight;
            }
        }

        // Skier X position (subtle, mostly centered)
        if (avgPitch !== null) {
            const centerBias = 0.6;
            const targetX = this.pitchToX(avgPitch);
            this.skier.targetX = this.lerp(this.width / 2, targetX, 1 - centerBias);
        }

        // Spawn terrain features on high energy beats
        if (hasBeat && maxEnergy > 0.4 && this.time - this.lastTerrainSpawn > 0.4) {
            this.spawnTerrainFeature(maxEnergy);
            this.lastTerrainSpawn = this.time;
        }

        // Spawn gates on beats
        if (hasBeat && this.time - this.lastGateSpawn > 0.2) {
            const gateWidth = this.velocityToGateWidth(totalEnergy / Math.max(1, noteCount));
            this.spawnGate(gateWidth);
            this.lastGateSpawn = this.time;
        }
    }

    spawnTerrainFeature(energy) {
        // Decide bump or dip based on energy pattern
        const type = energy > 0.7 ? 'bump' : 'dip';
        const height = 30 + energy * 50; // 30-80 units
        const width = 80 + Math.random() * 60; // 80-140 units

        this.terrainFeatures.push({
            y: -100, // Spawn above screen
            type: type,
            height: height,
            width: width,
            centerX: this.width / 2 + (Math.random() - 0.5) * 200
        });
    }

    velocityToGateWidth(velocity) {
        const normalized = Math.max(0, Math.min(1, velocity));
        return this.maxGateWidth - normalized * (this.maxGateWidth - this.minGateWidth);
    }

    spawnGate(width) {
        this.gateIndex++;
        const zigzagOffset = Math.sin(this.gateIndex * 0.7) * this.zigzagAmplitude;
        const x = this.width / 2 + zigzagOffset;

        // Check for gate congestion
        const recentGate = this.gates.find(g => g.y < 80);
        if (recentGate) return;

        this.gates.push({
            x: x,
            y: -this.poleHeight - 20,
            width: width,
            passed: false,
            hit: false,
            side: this.gateIndex % 2 === 0 ? 'left' : 'right'
        });
    }

    updateTerrain(dt) {
        const speed = this.terrainSpeed * this.speedMultiplier;

        // Move terrain features down
        this.terrainFeatures = this.terrainFeatures.filter(feature => {
            feature.y += speed * dt;
            return feature.y < this.height + 200;
        });
    }

    calculateGroundLevel() {
        // Find terrain feature at skier's Y position
        let groundOffset = 0;

        for (const feature of this.terrainFeatures) {
            const featureTop = feature.y;
            const featureBottom = feature.y + feature.width;

            // Check if skier is over this feature
            if (this.skier.baseY > featureTop - 20 && this.skier.baseY < featureBottom + 20) {
                // Calculate position within feature (0 to 1)
                const progress = (this.skier.baseY - featureTop) / feature.width;

                // Smooth hill/dip shape using sine curve
                const shape = Math.sin(progress * Math.PI);

                if (feature.type === 'bump') {
                    // Bump goes up (negative Y)
                    groundOffset = Math.min(groundOffset, -feature.height * shape);
                } else {
                    // Dip goes down (positive Y)
                    groundOffset = Math.max(groundOffset, feature.height * shape * 0.5);
                }
            }
        }

        this.groundLevel = groundOffset;
        // Smooth transition
        this.groundLevelSmooth = this.lerp(this.groundLevelSmooth, this.groundLevel, 0.15);
    }

    updateSkier(dt) {
        const prevX = this.skier.x;

        // Smooth X movement
        this.skier.x = this.lerp(this.skier.x, this.skier.targetX, this.lerpSpeed);
        this.skier.velocityX = (this.skier.x - prevX) / dt;

        if (this.skier.airborne) {
            // Airborne physics
            this.airTime += dt;
            this.maxAirTime = Math.max(this.maxAirTime, this.airTime);

            this.skier.velocityY += this.gravity * dt;
            this.skier.altitude += this.skier.velocityY * dt;

            // Rotation while in air
            this.skier.rotation = Math.sin(this.airTime * 4) * 0.12;

            // Check for landing
            const expectedGround = this.skier.baseY + this.groundLevelSmooth;
            if (this.skier.y >= expectedGround && this.skier.velocityY > 0) {
                // Land!
                this.skier.airborne = false;
                this.skier.y = expectedGround;
                this.skier.altitude = 0;
                this.skier.rotation = 0;
                this.skier.velocityY = 0;
                this.airTime = 0;

                // Landing effects
                this.screenShake.intensity = 6;
                for (let i = 0; i < 12; i++) {
                    this.sprayParticles.push({
                        x: this.skier.x + (Math.random() - 0.5) * 30,
                        y: this.skier.y + 20,
                        vx: (Math.random() - 0.5) * 180,
                        vy: -60 - Math.random() * 100,
                        size: 2 + Math.random() * 4,
                        life: 1,
                        maxLife: 0.35
                    });
                }
            }
        } else {
            // On ground - follow terrain
            const targetY = this.skier.baseY + this.groundLevelSmooth;
            const prevY = this.skier.y;
            this.skier.y = this.lerp(this.skier.y, targetY, 0.2);

            // Check if we hit a bump (ground rising quickly)
            const groundVelocity = (this.skier.y - prevY) / dt;

            // Launch off bump!
            if (this.groundLevel < -20 && groundVelocity < -50) {
                this.skier.airborne = true;
                this.skier.velocityY = groundVelocity * this.launchMultiplier;
                this.skier.altitude = 0;
                this.airTime = 0;

                // Takeoff spray
                for (let i = 0; i < 15; i++) {
                    this.sprayParticles.push({
                        x: this.skier.x + (Math.random() - 0.5) * 25,
                        y: this.skier.y + 22,
                        vx: (Math.random() - 0.5) * 200,
                        vy: -100 - Math.random() * 120,
                        size: 3 + Math.random() * 5,
                        life: 1,
                        maxLife: 0.4
                    });
                }
            }
        }

        // Determine skier state
        const velocityThreshold = 60;
        if (this.skier.velocityX > velocityThreshold) {
            this.skier.state = 'right';
            if (!this.skier.airborne && Math.random() < 0.3) this.spawnSprayParticle(-1);
        } else if (this.skier.velocityX < -velocityThreshold) {
            this.skier.state = 'left';
            if (!this.skier.airborne && Math.random() < 0.3) this.spawnSprayParticle(1);
        } else {
            this.skier.state = 'center';
        }

        // Hit recovery
        if (this.skier.hitCooldown > 0) {
            this.skier.hitCooldown -= dt;
            this.skier.opacity = 0.5 + Math.sin(this.time * 20) * 0.3;
        } else {
            this.skier.opacity = 1;
        }

        // Clamp to safe zone
        this.skier.x = Math.max(
            this.safeZonePadding,
            Math.min(this.width - this.safeZonePadding, this.skier.x)
        );
    }

    updateGates(dt) {
        const speed = this.gateSpeed * this.speedMultiplier;

        this.gates = this.gates.filter(gate => {
            gate.y += speed * dt;
            return gate.y < this.height + 100;
        });
    }

    checkCollisions() {
        const hitbox = {
            x: this.skier.x - 12,
            y: this.skier.y - 15,
            width: 24,
            height: 35
        };

        for (const gate of this.gates) {
            if (gate.passed || gate.hit) continue;

            if (gate.y > this.skier.y - 35 && gate.y < this.skier.y + 35) {
                const gateLeft = gate.x - gate.width / 2;
                const gateRight = gate.x + gate.width / 2;

                const leftPole = { x: gateLeft - 10, y: gate.y, width: 20, height: this.poleHeight };
                const rightPole = { x: gateRight - 10, y: gate.y, width: 20, height: this.poleHeight };

                if (this.aabbCollision(hitbox, leftPole) || this.aabbCollision(hitbox, rightPole)) {
                    this.onCollision(gate);
                } else if (this.skier.x > gateLeft && this.skier.x < gateRight) {
                    gate.passed = true;
                    this.gatesPassed++;
                }
            }
        }
    }

    aabbCollision(a, b) {
        return a.x < b.x + b.width && a.x + a.width > b.x &&
            a.y < b.y + b.height && a.y + a.height > b.y;
    }

    onCollision(gate) {
        gate.hit = true;
        this.gatesHit++;
        this.screenShake.intensity = 15;
        this.skier.hitCooldown = 1;

        for (let i = 0; i < 12; i++) {
            this.sprayParticles.push({
                x: this.skier.x,
                y: this.skier.y,
                vx: (Math.random() - 0.5) * 180,
                vy: -80 - Math.random() * 80,
                size: 3 + Math.random() * 4,
                life: 1,
                maxLife: 0.35
            });
        }
    }

    spawnSprayParticle(direction) {
        if (this.sprayParticles.length >= this.maxSprayParticles) return;

        this.sprayParticles.push({
            x: this.skier.x + direction * 10,
            y: this.skier.y + 18,
            vx: direction * (30 + Math.random() * 50),
            vy: -20 - Math.random() * 40,
            size: 2 + Math.random() * 2,
            life: 1,
            maxLife: 0.2
        });
    }

    updateParticles(dt) {
        for (const p of this.snowParticles) {
            p.y += p.speed * dt;
            p.x += p.drift * dt;
            if (p.y > this.height + 10) { p.y = -10; p.x = Math.random() * this.width; }
            if (p.x < -10) p.x = this.width + 10;
            if (p.x > this.width + 10) p.x = -10;
        }

        this.sprayParticles = this.sprayParticles.filter(p => {
            p.life -= dt / p.maxLife;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 350 * dt;
            return p.life > 0;
        });
    }

    updateScreenShake(dt) {
        if (this.screenShake.intensity > 0) {
            this.screenShake.x = (Math.random() - 0.5) * this.screenShake.intensity;
            this.screenShake.y = (Math.random() - 0.5) * this.screenShake.intensity;
            this.screenShake.intensity *= 0.88;
            if (this.screenShake.intensity < 0.3) {
                this.screenShake.intensity = 0;
                this.screenShake.x = 0;
                this.screenShake.y = 0;
            }
        }
    }

    updateTrail(dt) {
        if (!this.skier.airborne) {
            this.trail.push({
                x: this.skier.x,
                y: this.skier.y + 18,
                time: this.time
            });
        }
        while (this.trail.length > this.maxTrailPoints) this.trail.shift();
    }

    render() {
        const ctx = this.ctx;

        ctx.save();
        ctx.translate(this.screenShake.x, this.screenShake.y);

        this.drawBackground(ctx);
        this.drawTerrainFeatures(ctx);
        this.drawTrail(ctx);
        this.drawGates(ctx);
        this.drawSprayParticles(ctx);
        this.drawSkier(ctx);
        this.drawSnow(ctx);
        this.drawUI(ctx);

        ctx.restore();
    }

    drawBackground(ctx) {
        const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
        gradient.addColorStop(0, '#1e293b');
        gradient.addColorStop(0.4, '#1a2332');
        gradient.addColorStop(1, '#0f172a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.width, this.height);

        // Distant mountains
        ctx.fillStyle = 'rgba(30, 41, 59, 0.4)';
        ctx.beginPath();
        ctx.moveTo(0, this.height * 0.25);
        for (let x = 0; x < this.width; x += 80) {
            const h = Math.sin(x * 0.008 + 1) * 40 + Math.sin(x * 0.015) * 25;
            ctx.lineTo(x, this.height * 0.2 + h);
        }
        ctx.lineTo(this.width, this.height);
        ctx.lineTo(0, this.height);
        ctx.closePath();
        ctx.fill();

        // Snow lines
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.04)';
        ctx.lineWidth = 1.5;
        for (let y = -60 + this.bgOffset1; y < this.height + 60; y += 60) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y + 8);
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)';
        for (let y = -30 + this.bgOffset2; y < this.height + 30; y += 30) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y + 4);
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
        for (let y = -15 + this.bgOffset3; y < this.height + 15; y += 15) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y + 2);
            ctx.stroke();
        }
    }

    drawTerrainFeatures(ctx) {
        for (const feature of this.terrainFeatures) {
            const centerX = feature.centerX;
            const topY = feature.y;
            const w = feature.width;
            const h = feature.height;

            if (feature.type === 'bump') {
                // Draw bump/hill
                const gradient = ctx.createRadialGradient(centerX, topY + w / 2, 10, centerX, topY + w / 2, w);
                gradient.addColorStop(0, 'rgba(200, 220, 245, 0.25)');
                gradient.addColorStop(0.5, 'rgba(180, 200, 230, 0.15)');
                gradient.addColorStop(1, 'rgba(160, 180, 210, 0)');

                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.ellipse(centerX, topY + w / 2, w * 0.8, h, 0, 0, Math.PI * 2);
                ctx.fill();

                // Highlight on top
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(centerX, topY + w * 0.3, w * 0.4, Math.PI * 0.8, Math.PI * 0.2);
                ctx.stroke();

                // Jump ramp indicator
                ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
                ctx.beginPath();
                ctx.moveTo(centerX - 30, topY + w * 0.6);
                ctx.lineTo(centerX, topY + w * 0.3);
                ctx.lineTo(centerX + 30, topY + w * 0.6);
                ctx.closePath();
                ctx.fill();
            } else {
                // Draw dip/valley
                const gradient = ctx.createRadialGradient(centerX, topY + w / 2, 10, centerX, topY + w / 2, w);
                gradient.addColorStop(0, 'rgba(30, 50, 80, 0.3)');
                gradient.addColorStop(0.5, 'rgba(40, 60, 90, 0.15)');
                gradient.addColorStop(1, 'rgba(50, 70, 100, 0)');

                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.ellipse(centerX, topY + w / 2, w * 0.7, h * 0.5, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    drawTrail(ctx) {
        if (this.trail.length < 2) return;

        for (let i = 1; i < this.trail.length; i++) {
            const p0 = this.trail[i - 1];
            const p1 = this.trail[i];
            const age = this.time - p0.time;
            const alpha = Math.max(0, 1 - age / 2) * 0.45;
            if (alpha <= 0) continue;

            ctx.strokeStyle = `rgba(180, 200, 230, ${alpha})`;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';

            ctx.beginPath();
            ctx.moveTo(p0.x - 7, p0.y);
            ctx.lineTo(p1.x - 7, p1.y);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(p0.x + 7, p0.y);
            ctx.lineTo(p1.x + 7, p1.y);
            ctx.stroke();
        }
    }

    drawGates(ctx) {
        for (const gate of this.gates) {
            const leftX = gate.x - gate.width / 2;
            const rightX = gate.x + gate.width / 2;
            const isHit = gate.hit;

            // Banner
            if (!isHit) {
                ctx.fillStyle = 'rgba(220, 38, 38, 0.12)';
                ctx.fillRect(leftX + 8, gate.y + 6, gate.width - 16, 6);
            }

            this.drawPole(ctx, leftX, gate.y, isHit, 'left');
            this.drawPole(ctx, rightX, gate.y, isHit, 'right');
        }
    }

    drawPole(ctx, x, y, isHit, side) {
        const r = this.poleRadius;
        const h = this.poleHeight;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath();
        ctx.ellipse(x + 3, y + h + 2, r + 1, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pole gradient
        const poleGrad = ctx.createLinearGradient(x - r, y, x + r, y);
        poleGrad.addColorStop(0, isHit ? '#6b2121' : '#991b1b');
        poleGrad.addColorStop(0.4, isHit ? '#8b3131' : '#dc2626');
        poleGrad.addColorStop(0.7, isHit ? '#9b4141' : '#ef4444');
        poleGrad.addColorStop(1, isHit ? '#6b2121' : '#991b1b');

        ctx.fillStyle = poleGrad;
        ctx.beginPath();
        ctx.roundRect(x - r, y, r * 2, h, 3);
        ctx.fill();

        // White stripes
        ctx.fillStyle = isHit ? '#9ca3af' : '#ffffff';
        ctx.beginPath();
        ctx.roundRect(x - r, y + h * 0.2, r * 2, h * 0.2, 1);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(x - r, y + h * 0.6, r * 2, h * 0.2, 1);
        ctx.fill();

        // Top cap
        ctx.fillStyle = '#1f2937';
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();

        // Flag
        const flagDir = side === 'left' ? 1 : -1;
        const wave = Math.sin(this.time * 6 + x * 0.1) * 3;

        const flagGrad = ctx.createLinearGradient(x, y, x + flagDir * 22, y);
        if (isHit) {
            flagGrad.addColorStop(0, '#4b5563');
            flagGrad.addColorStop(1, '#374151');
        } else {
            flagGrad.addColorStop(0, '#fbbf24');
            flagGrad.addColorStop(0.5, '#f59e0b');
            flagGrad.addColorStop(1, '#d97706');
        }

        ctx.fillStyle = flagGrad;
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.quadraticCurveTo(x + flagDir * 12, y - 8 + wave * 0.5, x + flagDir * 22, y - 6 + wave);
        ctx.quadraticCurveTo(x + flagDir * 18, y + 3 + wave * 0.5, x + flagDir * 22, y + 8 + wave * 0.3);
        ctx.quadraticCurveTo(x + flagDir * 10, y + 5, x, y + 8);
        ctx.closePath();
        ctx.fill();

        // Flag highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.beginPath();
        ctx.moveTo(x, y - 2);
        ctx.quadraticCurveTo(x + flagDir * 8, y - 4 + wave * 0.3, x + flagDir * 14, y - 2 + wave * 0.5);
        ctx.lineTo(x + flagDir * 10, y + 3);
        ctx.lineTo(x, y + 4);
        ctx.closePath();
        ctx.fill();
    }

    drawSkier(ctx) {
        const x = this.skier.x;
        const y = this.skier.y;

        ctx.globalAlpha = this.skier.opacity;

        const maxLean = 0.3;
        const leanAngle = Math.max(-maxLean, Math.min(maxLean, this.skier.velocityX / 600));

        // Shadow - clamp altitude to reasonable range
        const clampedAltitude = Math.max(-200, Math.min(0, this.skier.altitude));
        const shadowScale = Math.max(0.5, this.skier.airborne ? 1.2 + (-clampedAltitude / 300) * 0.3 : 1);
        const shadowY = this.skier.baseY + this.groundLevelSmooth + 22;
        ctx.fillStyle = `rgba(0, 0, 0, ${this.skier.airborne ? 0.12 : 0.22})`;
        ctx.beginPath();
        ctx.ellipse(x + 2, shadowY, Math.max(1, 13 * shadowScale), Math.max(1, 5 * shadowScale), 0.1, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(leanAngle + this.skier.rotation);

        if (this.skier.airborne) {
            const scale = Math.max(0.8, Math.min(1.15, 1 + (-clampedAltitude / 600) * 0.12));
            ctx.scale(scale, scale);
        }

        // SKIS
        const skiLen = 55, skiW = 5, skiSpace = 14;
        const skiGrad = ctx.createLinearGradient(-skiSpace / 2 - skiW, 0, -skiSpace / 2 + skiW, 0);
        skiGrad.addColorStop(0, '#1f2937');
        skiGrad.addColorStop(0.5, '#4b5563');
        skiGrad.addColorStop(1, '#1f2937');

        [-1, 1].forEach(side => {
            ctx.fillStyle = skiGrad;
            ctx.beginPath();
            ctx.moveTo(side * skiSpace / 2, -skiLen / 2);
            ctx.quadraticCurveTo(side * skiSpace / 2, -skiLen / 2 - 6, side * skiSpace / 2, -skiLen / 2);
            ctx.lineTo(side * skiSpace / 2 + skiW / 2, -skiLen / 2 + 6);
            ctx.lineTo(side * skiSpace / 2 + skiW / 2, skiLen / 2 - 4);
            ctx.quadraticCurveTo(side * skiSpace / 2, skiLen / 2 + 2, side * skiSpace / 2 - skiW / 2, skiLen / 2 - 4);
            ctx.lineTo(side * skiSpace / 2 - skiW / 2, -skiLen / 2 + 6);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(side * skiSpace / 2, -skiLen / 2 + 8);
            ctx.lineTo(side * skiSpace / 2, skiLen / 2 - 8);
            ctx.stroke();
        });

        // BOOTS
        ctx.fillStyle = '#111827';
        ctx.beginPath();
        ctx.roundRect(-skiSpace / 2 - 5, 1, 10, 12, 2);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(skiSpace / 2 - 5, 1, 10, 12, 2);
        ctx.fill();

        // LEGS
        const pantGrad = ctx.createLinearGradient(-8, 0, 8, 0);
        pantGrad.addColorStop(0, '#1e3a5f');
        pantGrad.addColorStop(0.5, '#2563eb');
        pantGrad.addColorStop(1, '#1e3a5f');
        ctx.fillStyle = pantGrad;
        ctx.beginPath();
        ctx.ellipse(-5, 5, 5, 10, -0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(5, 5, 5, 10, 0.08, 0, Math.PI * 2);
        ctx.fill();

        // TORSO
        const jacketGrad = ctx.createRadialGradient(0, -7, 0, 0, -7, 18);
        jacketGrad.addColorStop(0, '#3b82f6');
        jacketGrad.addColorStop(0.7, '#2563eb');
        jacketGrad.addColorStop(1, '#1d4ed8');
        ctx.fillStyle = jacketGrad;
        ctx.beginPath();
        ctx.ellipse(0, -5, 14, 18, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1e40af';
        ctx.beginPath();
        ctx.ellipse(0, -5, 14, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.lineTo(0, 6);
        ctx.stroke();

        // ARMS + POLES
        const armAng = leanAngle * 0.5;

        [-1, 1].forEach(side => {
            ctx.save();
            ctx.translate(side * 13, -3);
            ctx.rotate(side * 0.3 - armAng * side);

            const armGrad = ctx.createLinearGradient(-3, 0, 3, 0);
            armGrad.addColorStop(0, '#1d4ed8');
            armGrad.addColorStop(0.5, '#3b82f6');
            armGrad.addColorStop(1, '#1d4ed8');
            ctx.fillStyle = armGrad;
            ctx.beginPath();
            ctx.roundRect(-3, 0, 6, 18, 2);
            ctx.fill();

            ctx.fillStyle = '#1f2937';
            ctx.beginPath();
            ctx.ellipse(0, 19, 4, 3, 0, 0, Math.PI * 2);
            ctx.fill();

            const poleGrad = ctx.createLinearGradient(-1.5, 0, 1.5, 0);
            poleGrad.addColorStop(0, '#4b5563');
            poleGrad.addColorStop(0.5, '#9ca3af');
            poleGrad.addColorStop(1, '#4b5563');
            ctx.strokeStyle = poleGrad;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(0, 17);
            ctx.lineTo(0, 48);
            ctx.stroke();

            ctx.strokeStyle = '#374151';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 44, 5, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = '#111827';
            ctx.beginPath();
            ctx.roundRect(-2.5, 14, 5, 6, 1);
            ctx.fill();

            ctx.restore();
        });

        // HEAD
        const helmetGrad = ctx.createRadialGradient(-2, -24, 0, 0, -22, 11);
        helmetGrad.addColorStop(0, '#f87171');
        helmetGrad.addColorStop(0.5, '#ef4444');
        helmetGrad.addColorStop(1, '#b91c1c');
        ctx.fillStyle = helmetGrad;
        ctx.beginPath();
        ctx.ellipse(0, -23, 10, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.ellipse(0, -20, 8, 3.5, 0, 0, Math.PI);
        ctx.fill();

        ctx.fillStyle = 'rgba(147, 197, 253, 0.35)';
        ctx.beginPath();
        ctx.ellipse(-2.5, -20, 3.5, 1.8, -0.15, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.ellipse(-3, -27, 4, 3, -0.35, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('7', 0, -5);

        ctx.restore();
        ctx.globalAlpha = 1;
    }

    drawSprayParticles(ctx) {
        for (const p of this.sprayParticles) {
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * p.life);
            grad.addColorStop(0, `rgba(245, 250, 255, ${p.life * 0.85})`);
            grad.addColorStop(1, `rgba(220, 235, 250, ${p.life * 0.2})`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (0.5 + p.life * 0.5), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawSnow(ctx) {
        for (const p of this.snowParticles) {
            ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawUI(ctx) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx.beginPath();
        ctx.roundRect(15, 15, 120, 70, 8);
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('🚩 Gates', 25, 35);
        ctx.fillStyle = '#22c55e';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(`${this.gatesPassed}`, 95, 35);

        if (this.gatesHit > 0) {
            ctx.fillStyle = '#f8fafc';
            ctx.font = 'bold 13px Arial';
            ctx.fillText('💥 Hits', 25, 55);
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(`${this.gatesHit}`, 95, 55);
        }

        if (this.maxAirTime > 0.3) {
            ctx.fillStyle = '#f8fafc';
            ctx.font = 'bold 13px Arial';
            ctx.fillText('✈️ Air', 25, 75);
            ctx.fillStyle = '#60a5fa';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(`${this.maxAirTime.toFixed(1)}s`, 80, 75);
        }

        if (this.skier.airborne) {
            ctx.fillStyle = 'rgba(96, 165, 250, 0.9)';
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('✈️ AIRBORNE!', this.width / 2, 45);
        }
    }

    getName() { return 'MIDI Slalom'; }
}
