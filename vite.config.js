import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware to auto-download missing soundfonts
const soundfontDownloader = () => ({
    name: 'soundfont-downloader',
    configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
            // Match pattern: /soundfonts/[Library]/instrument-mp3.js
            const url = req.url.split('?')[0];
            if (url.includes('/soundfonts/') && url.endsWith('.js')) {
                const publicPath = path.resolve(__dirname, 'public');
                const filePath = path.join(publicPath, url);
                const dirPath = path.dirname(filePath);

                if (!fs.existsSync(filePath)) {
                    console.log(`\x1b[33m[Soundfont] Request: ${url}\x1b[0m`);

                    if (!fs.existsSync(dirPath)) {
                        fs.mkdirSync(dirPath, { recursive: true });
                    }

                    // Extract library and filename
                    // Example URL: /soundfonts/MusyngKite/acoustic_grand_piano-mp3.js
                    const parts = url.split('/');
                    if (parts.length >= 3) {
                        const library = parts[parts.length - 2];
                        const fileName = path.basename(filePath);

                        const remoteUrl = `https://gleitz.github.io/midi-js-soundfonts/${library}/${fileName}`;
                        console.log(`\x1b[36m[Soundfont] Downloading: ${remoteUrl}\x1b[0m`);

                        const file = fs.createWriteStream(filePath);
                        https.get(remoteUrl, (response) => {
                            if (response.statusCode === 200) {
                                response.pipe(file);
                                file.on('finish', () => {
                                    file.close();
                                    console.log(`\x1b[32m[Soundfont] Cached: ${fileName}\x1b[0m`);
                                    next();
                                });
                            } else {
                                file.close();
                                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                                console.error(`\x1b[31m[Soundfont] Error 404: ${remoteUrl}\x1b[0m`);
                                next();
                            }
                        }).on('error', (err) => {
                            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                            console.error(`\x1b[31m[Soundfont] Downloader Error: ${err.message}\x1b[0m`);
                            next();
                        });
                        return;
                    }
                }
            }
            next();
        });
    }
});

export default defineConfig({
    root: 'public',
    server: {
        port: 3036,
        open: true,
        hmr: true,
    },
    plugins: [soundfontDownloader()],
    build: {
        outDir: '../dist',
        emptyOutDir: true,
    }
});
