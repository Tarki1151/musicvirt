/**
 * Base Visualizer Class
 * All visualizers inherit from this class
 */
export class Visualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        this.time = 0;
        this.glowMultiplier = 1;
        this.speedMultiplier = 1;
        this.colorTheme = { primary: '#6366f1', secondary: '#ec4899' };
    }

    resize(w, h) {
        this.width = w;
        this.height = h;
    }

    update(analysis, dt) {
        this.analysis = analysis;
        this.time += dt * this.speedMultiplier;
    }

    render() { }

    getName() { return 'Base'; }

    // Utility: HSL to RGB conversion
    hslToRgb(h, s, l) {
        h = ((h % 360) + 360) % 360 / 360;
        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const k = (n + h * 12) % 12;
            return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        };
        return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
    }

    // Utility: RGB to string
    rgbString(r, g, b, a = 1) {
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    // Utility: Linear interpolation
    lerp(a, b, t) {
        return a + (b - a) * t;
    }
}
