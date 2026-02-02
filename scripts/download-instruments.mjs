import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import pkg from '@tonejs/midi';
const { Midi } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.join(__dirname, '..');
const PUBLIC_PATH = path.join(WORKSPACE_ROOT, 'public');
const SAMPLES_DIR = path.join(PUBLIC_PATH, 'samples');
const BASE_URL = 'https://nbrosowsky.github.io/tonejs-instruments/samples';

const GM_TO_SAMPLE = {
    0: 'piano', 1: 'piano', 2: 'piano', 3: 'piano', 4: 'piano', 5: 'piano', 6: 'piano', 7: 'piano',
    24: 'guitar-nylon', 25: 'guitar-acoustic', 26: 'guitar-electric', 27: 'guitar-electric',
    32: 'bass-electric', 33: 'bass-electric', 34: 'bass-electric',
    40: 'violin', 41: 'violin', 42: 'cello', 43: 'contrabass',
    48: 'violin', 49: 'cello', 50: 'cello', 51: 'cello',
    56: 'trumpet', 57: 'trombone', 58: 'tuba', 60: 'french-horn', 61: 'trumpet',
    68: 'oboe', 70: 'bassoon', 71: 'clarinet', 73: 'flute',
    104: 'harp', 114: 'xylophone'
};

const NOTES = ['A0', 'C1', 'D1', 'Ds1', 'E1', 'F1', 'Fs1', 'G1', 'As1', 'A1', 'C2', 'Ds2', 'Fs2', 'As2', 'A2', 'C3', 'Ds3', 'Fs3', 'As3', 'A3', 'C4', 'Ds4', 'Fs4', 'As4', 'A4', 'C5', 'Ds5', 'Fs5', 'As5', 'A5', 'C6', 'Ds6', 'Fs6', 'As6', 'A6', 'C7', 'Ds7', 'Fs7', 'As7', 'A7'];

// Try both Ds and D# styles
const ALTERNATIVES = {
    'Ds': 'D%23',
    'Fs': 'F%23',
    'As': 'A%23',
    'Gs': 'G%23',
    'Cs': 'C%23'
};

async function downloadFile(url, dest) {
    if (fs.existsSync(dest)) return true;
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    return new Promise((resolve) => {
        https.get(url, (res) => {
            if (res.statusCode === 200) {
                const file = fs.createWriteStream(dest);
                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(true); });
            } else {
                resolve(false);
            }
        }).on('error', () => resolve(false));
    });
}

async function scanAndDownload() {
    console.log("🚀 Starting Smarter Sample Downloader...");

    const neededLibraries = new Set(Object.values(GM_TO_SAMPLE));
    console.log(`Checking ${neededLibraries.size} instrument libraries...`);

    for (const lib of neededLibraries) {
        let count = 0;
        process.stdout.write(`\nLibrary: ${lib.toUpperCase()} `);

        for (const note of NOTES) {
            const fileName = `${note}.mp3`;
            const dest = path.join(SAMPLES_DIR, lib, fileName);

            // Try primary (Ds style)
            let success = await downloadFile(`${BASE_URL}/${lib}/${fileName}`, dest);

            // Try alternative (# style) if failed and it's a sharp note
            if (!success) {
                for (const [key, alt] of Object.entries(ALTERNATIVES)) {
                    if (note.includes(key)) {
                        const altFileName = fileName.replace(key, alt);
                        success = await downloadFile(`${BASE_URL}/${lib}/${altFileName}`, dest);
                        if (success) break;
                    }
                }
            }

            if (success) {
                process.stdout.write(`.`);
                count++;
            }
        }
        process.stdout.write(` (${count} samples)`);
    }

    // Generate Manifest
    console.log("\n\n📄 Generating samples/manifest.json...");
    const manifest = {};
    fs.readdirSync(SAMPLES_DIR).forEach(dir => {
        const fullPath = path.join(SAMPLES_DIR, dir);
        if (fs.statSync(fullPath).isDirectory()) {
            manifest[dir] = fs.readdirSync(fullPath).filter(f => f.endsWith(".mp3"));
        }
    });
    fs.writeFileSync(path.join(SAMPLES_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

    console.log("\n✅ Orchestral Library Update Complete!");
}

scanAndDownload();
