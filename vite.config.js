import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import https from 'https';

// Middleware to auto-download missing soundfonts
const soundfontDownloader = () => ({
    name: 'soundfont-downloader',
    configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
            // Match pattern: /soundfonts/FluidR3_GM/instrument-mp3.js
            if (req.url.includes('/soundfonts/FluidR3_GM/') && req.url.endsWith('.js')) {
                const publicPath = path.resolve(__dirname, 'public');
                const filePath = path.join(publicPath, req.url.split('?')[0]);
                const dirPath = path.dirname(filePath);

                if (!fs.existsSync(filePath)) {
                    console.log(`\x1b[33m[Soundfont] Local file missing: ${req.url}\x1b[0m`);

                    if (!fs.existsSync(dirPath)) {
                        fs.mkdirSync(dirPath, { recursive: true });
                    }

                    const remoteUrl = `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/${path.basename(filePath)}`;
                    console.log(`\x1b[36m[Soundfont] Downloading from remote: ${remoteUrl}\x1b[0m`);

                    const file = fs.createWriteStream(filePath);
                    https.get(remoteUrl, (response) => {
                        if (response.statusCode === 200) {
                            response.pipe(file);
                            file.on('finish', () => {
                                file.close();
                                console.log(`\x1b[32m[Soundfont] Successfully cached: ${path.basename(filePath)}\x1b[0m`);
                                next();
                            });
                        } else {
                            file.close();
                            fs.unlinkSync(filePath); // Delete empty file
                            console.error(`\x1b[31m[Soundfont] Failed to download: ${response.statusCode}\x1b[0m`);
                            next();
                        }
                    }).on('error', (err) => {
                        fs.unlinkSync(filePath);
                        console.error(`\x1b[31m[Soundfont] Error: ${err.message}\x1b[0m`);
                        next();
                    });
                    return;
                }
            }
            next();
        });
    }
});

export default defineConfig({
    root: 'public',
    server: {
        port: 3000,
        open: true,
        hmr: true,
    },
    plugins: [soundfontDownloader()],
    build: {
        outDir: '../dist',
        emptyOutDir: true,
    }
});
