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
const MIDI_DIR = PUBLIC_PATH;
const SF_DIR = path.join(PUBLIC_PATH, 'soundfonts', 'MusyngKite');
const BASE_URL = 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite';

// General MIDI Instrument Mapping (0-127) - Must match MidiHandler.js
const GM_MAP = {
    0: 'acoustic_grand_piano', 1: 'bright_acoustic_piano', 2: 'electric_grand_piano', 3: 'honkytonk_piano',
    4: 'electric_piano_1', 5: 'electric_piano_2', 6: 'harpsichord', 7: 'clavi', 8: 'celesta',
    9: 'glockenspiel', 10: 'music_box', 11: 'vibraphone', 12: 'marimba', 13: 'xylophone',
    14: 'tubular_bells', 15: 'dulcimer', 16: 'drawbar_organ', 17: 'percussive_organ', 18: 'rock_organ',
    19: 'church_organ', 20: 'reed_organ', 21: 'accordion', 22: 'harmonica', 23: 'tango_accordion',
    24: 'acoustic_guitar_nylon', 25: 'acoustic_guitar_steel', 26: 'electric_guitar_jazz',
    27: 'electric_guitar_clean', 28: 'electric_guitar_muted', 29: 'overdriven_guitar',
    30: 'distortion_guitar', 31: 'guitar_harmonics', 32: 'acoustic_bass', 33: 'electric_bass_finger',
    34: 'electric_bass_pick', 35: 'fretless_bass', 36: 'slap_bass_1', 37: 'slap_bass_2',
    38: 'synth_bass_1', 39: 'synth_bass_2', 40: 'violin', 41: 'viola', 42: 'cello', 43: 'contrabass',
    44: 'tremolo_strings', 45: 'pizzicato_strings', 46: 'orchestral_harp', 47: 'timpani',
    48: 'string_ensemble_1', 49: 'string_ensemble_2', 50: 'synth_strings_1', 51: 'synth_strings_2',
    52: 'choir_aahs', 53: 'voice_oohs', 54: 'synth_voice', 55: 'orchestra_hit', 56: 'trumpet',
    57: 'trombone', 58: 'tuba', 59: 'muted_trumpet', 60: 'french_horn', 61: 'brass_section',
    62: 'synth_brass_1', 63: 'synth_brass_2', 64: 'soprano_sax', 65: 'alto_sax', 66: 'tenor_sax',
    67: 'baritone_sax', 68: 'oboe', 69: 'english_horn', 70: 'bassoon', 71: 'clarinet',
    72: 'piccolo', 73: 'flute', 74: 'recorder', 75: 'pan_flute', 76: 'blown_bottle', 77: 'shakuhachi',
    78: 'whistle', 79: 'ocarina', 80: 'lead_1_square', 81: 'lead_2_sawtooth', 82: 'lead_3_calliope',
    83: 'lead_4_chiff', 84: 'lead_5_charang', 85: 'lead_6_voice', 86: 'lead_7_fifths',
    87: 'lead_8_bass_lead', 88: 'pad_1_new_age', 89: 'pad_2_warm', 90: 'pad_3_polysynth',
    91: 'pad_4_choir', 92: 'pad_5_bowed', 93: 'pad_6_metallic', 94: 'pad_7_halo', 95: 'pad_8_sweep',
    96: 'fx_1_rain', 97: 'fx_2_soundtrack', 98: 'fx_3_crystal', 99: 'fx_4_atmosphere',
    100: 'fx_5_brightness', 101: 'fx_6_goblins', 102: 'fx_7_echoes', 103: 'fx_8_sci-fi',
    104: 'sitar', 105: 'banjo', 106: 'shamisen', 107: 'koto', 108: 'kalimba', 109: 'bagpipe',
    110: 'fiddle', 111: 'shanai', 112: 'tinkle_bell', 113: 'agogo', 114: 'steel_drums',
    115: 'woodblock', 116: 'taiko_drum', 117: 'melodic_tom', 118: 'synth_drum', 119: 'reverse_cymbal',
    120: 'guitar_fret_noise', 121: 'breath_noise', 122: 'seashore', 123: 'bird_tweet',
    124: 'telephone_ring', 125: 'helicopter', 126: 'applause', 127: 'gunshot'
};

async function downloadFile(url, dest) {
    if (fs.existsSync(dest)) {
        return;
    }

    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    console.log(`Downloading: ${path.basename(dest)}...`);

    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            } else {
                file.close();
                if (fs.existsSync(dest)) fs.unlinkSync(dest);
                reject(new Error(`Status: ${response.statusCode}`));
            }
        }).on('error', (err) => {
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            reject(err);
        });
    });
}

async function scanAndDownload() {
    console.log(`Scanning MIDI files for GM standard instruments...`);
    const files = fs.readdirSync(MIDI_DIR).filter(f => f.endsWith('.mid') || f.endsWith('.midi'));
    const instrumentsFound = new Set();
    instrumentsFound.add(0); // Always include piano

    for (const file of files) {
        try {
            const data = fs.readFileSync(path.join(MIDI_DIR, file));
            const midi = new Midi(data);
            midi.tracks.forEach(track => {
                if (track.notes.length > 0 && track.channel !== 9) {
                    const prgNum = track.instrument ? track.instrument.number : 0;
                    instrumentsFound.add(prgNum);
                }
            });
        } catch (e) {
            console.error(`Error scanning ${file}:`, e.message);
        }
    }

    const prgNumbers = Array.from(instrumentsFound).sort((a, b) => a - b);
    console.log(`Detected GM Program Numbers:`, prgNumbers);

    for (const prg of prgNumbers) {
        const gmName = GM_MAP[prg];
        if (!gmName) {
            console.warn(`? No name mapping for program ${prg}`);
            continue;
        }

        const fileName = `${gmName}-mp3.js`;
        const url = `${BASE_URL}/${fileName}`;
        const dest = path.join(SF_DIR, fileName);

        try {
            await downloadFile(url, dest);
            console.log(`✓ Cached: ${gmName} (Program ${prg})`);
        } catch (e) {
            console.error(`✗ Failed ${gmName}: ${e.message}`);
        }
    }

    console.log("\nDownload complete! All MIDI instruments are now standardized.");
}

scanAndDownload();
