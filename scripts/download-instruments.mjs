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
const MIDI_DIR = path.join(WORKSPACE_ROOT, 'midi');

// High Quality Soundfont Sources via raw GitHub
// MusyngKite: 1.75 GB uncompressed - HIGHEST QUALITY
// FluidR3_GM: 148 MB uncompressed - Good quality
// FatBoy: 320 MB uncompressed - High quality
const SOUNDFONT_SOURCES = [
    'https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/MusyngKite',     // Primary - HIGHEST quality (1.75GB source)
    'https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FatBoy',         // Secondary - High quality (320MB source)
    'https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM'      // Tertiary - Good quality (148MB source)
];

// General MIDI Program Number -> Soundfont Instrument Name Mapping
// FluidR3_GM uses snake_case names
const GM_TO_SOUNDFONT = {
    // Piano (0-7)
    0: 'acoustic_grand_piano',
    1: 'bright_acoustic_piano',
    2: 'electric_grand_piano',
    3: 'honkytonk_piano',
    4: 'electric_piano_1',
    5: 'electric_piano_2',
    6: 'harpsichord',
    7: 'clavinet',

    // Chromatic Percussion (8-15)
    8: 'celesta',
    9: 'glockenspiel',
    10: 'music_box',
    11: 'vibraphone',
    12: 'marimba',
    13: 'xylophone',
    14: 'tubular_bells',
    15: 'dulcimer',

    // Organ (16-23)
    16: 'drawbar_organ',
    17: 'percussive_organ',
    18: 'rock_organ',
    19: 'church_organ',
    20: 'reed_organ',
    21: 'accordion',
    22: 'harmonica',
    23: 'tango_accordion',

    // Guitar (24-31)
    24: 'acoustic_guitar_nylon',
    25: 'acoustic_guitar_steel',
    26: 'electric_guitar_jazz',
    27: 'electric_guitar_clean',
    28: 'electric_guitar_muted',
    29: 'overdriven_guitar',
    30: 'distortion_guitar',
    31: 'guitar_harmonics',

    // Bass (32-39)
    32: 'acoustic_bass',
    33: 'electric_bass_finger',
    34: 'electric_bass_pick',
    35: 'fretless_bass',
    36: 'slap_bass_1',
    37: 'slap_bass_2',
    38: 'synth_bass_1',
    39: 'synth_bass_2',

    // Strings (40-47)
    40: 'violin',
    41: 'viola',
    42: 'cello',
    43: 'contrabass',
    44: 'tremolo_strings',
    45: 'pizzicato_strings',
    46: 'orchestral_harp',
    47: 'timpani',

    // Ensemble (48-55)
    48: 'string_ensemble_1',
    49: 'string_ensemble_2',
    50: 'synth_strings_1',
    51: 'synth_strings_2',
    52: 'choir_aahs',
    53: 'voice_oohs',
    54: 'synth_choir',
    55: 'orchestra_hit',

    // Brass (56-63)
    56: 'trumpet',
    57: 'trombone',
    58: 'tuba',
    59: 'muted_trumpet',
    60: 'french_horn',
    61: 'brass_section',
    62: 'synth_brass_1',
    63: 'synth_brass_2',

    // Reed (64-71)
    64: 'soprano_sax',
    65: 'alto_sax',
    66: 'tenor_sax',
    67: 'baritone_sax',
    68: 'oboe',
    69: 'english_horn',
    70: 'bassoon',
    71: 'clarinet',

    // Pipe (72-79)
    72: 'piccolo',
    73: 'flute',
    74: 'recorder',
    75: 'pan_flute',
    76: 'blown_bottle',
    77: 'shakuhachi',
    78: 'whistle',
    79: 'ocarina',

    // Synth Lead (80-87)
    80: 'lead_1_square',
    81: 'lead_2_sawtooth',
    82: 'lead_3_calliope',
    83: 'lead_4_chiff',
    84: 'lead_5_charang',
    85: 'lead_6_voice',
    86: 'lead_7_fifths',
    87: 'lead_8_bass__lead',

    // Synth Pad (88-95)
    88: 'pad_1_new_age',
    89: 'pad_2_warm',
    90: 'pad_3_polysynth',
    91: 'pad_4_choir',
    92: 'pad_5_bowed',
    93: 'pad_6_metallic',
    94: 'pad_7_halo',
    95: 'pad_8_sweep',

    // Synth Effects (96-103)
    96: 'fx_1_rain',
    97: 'fx_2_soundtrack',
    98: 'fx_3_crystal',
    99: 'fx_4_atmosphere',
    100: 'fx_5_brightness',
    101: 'fx_6_goblins',
    102: 'fx_7_echoes',
    103: 'fx_8_scifi',

    // Ethnic (104-111)
    104: 'sitar',
    105: 'banjo',
    106: 'shamisen',
    107: 'koto',
    108: 'kalimba',
    109: 'bagpipe',
    110: 'fiddle',
    111: 'shanai',

    // Percussive (112-119)
    112: 'tinkle_bell',
    113: 'agogo',
    114: 'steel_drums',
    115: 'woodblock',
    116: 'taiko_drum',
    117: 'melodic_tom',
    118: 'synth_drum',
    119: 'reverse_cymbal',

    // Sound Effects (120-127)
    120: 'guitar_fret_noise',
    121: 'breath_noise',
    122: 'seashore',
    123: 'bird_tweet',
    124: 'telephone_ring',
    125: 'helicopter',
    126: 'applause',
    127: 'gunshot'
};

// Local folder name mapping (for backward compatibility with existing samples)
const SOUNDFONT_TO_LOCAL = {
    'acoustic_grand_piano': 'piano',
    'violin': 'violin',
    'viola': 'violin',
    'cello': 'cello',
    'contrabass': 'contrabass',
    'orchestral_harp': 'harp',
    'flute': 'flute',
    'oboe': 'oboe',
    'clarinet': 'clarinet',
    'bassoon': 'bassoon',
    'trumpet': 'trumpet',
    'trombone': 'trombone',
    'tuba': 'tuba',
    'french_horn': 'french-horn',
    'acoustic_guitar_nylon': 'guitar-nylon',
    'acoustic_guitar_steel': 'guitar-acoustic',
    'electric_guitar_jazz': 'guitar-electric',
    'electric_guitar_clean': 'guitar-electric',
    'acoustic_bass': 'bass-electric',
    'electric_bass_finger': 'bass-electric',
    'electric_bass_pick': 'bass-electric',
    'xylophone': 'xylophone'
};

// MIDI note number to note name conversion (MIDI.js format)
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function midiNoteToName(midiNote) {
    const octave = Math.floor(midiNote / 12) - 1;
    const noteName = NOTE_NAMES[midiNote % 12];
    return `${noteName}${octave}`;
}

/**
 * Download a file from URL to destination with redirect support
 */
async function downloadFile(url, dest) {
    if (fs.existsSync(dest)) return { success: true, skipped: true };
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    return new Promise((resolve) => {
        const request = (targetUrl) => {
            https.get(targetUrl, (res) => {
                if (res.statusCode === 200) {
                    const file = fs.createWriteStream(dest);
                    res.pipe(file);
                    file.on('finish', () => { file.close(); resolve({ success: true, skipped: false }); });
                    file.on('error', () => { fs.unlink(dest, () => { }); resolve({ success: false, skipped: false }); });
                } else if (res.statusCode === 301 || res.statusCode === 302) {
                    request(res.headers.location);
                } else {
                    resolve({ success: false, skipped: false });
                }
            }).on('error', () => resolve({ success: false, skipped: false }));
        };
        request(url);
    });
}

/**
 * Scan MIDI files and extract required instruments with their notes
 */
function scanMidiFiles() {
    console.log('📁 Scanning MIDI files in:', MIDI_DIR);

    if (!fs.existsSync(MIDI_DIR)) {
        console.log('❌ MIDI directory not found!');
        return new Map();
    }

    // Map: { soundfontName, localFolder } -> Set of note names
    const requiredNotes = new Map();

    const midiFiles = fs.readdirSync(MIDI_DIR).filter(f =>
        f.toLowerCase().endsWith('.mid') || f.toLowerCase().endsWith('.midi')
    );

    console.log(`📄 Found ${midiFiles.length} MIDI files\n`);

    for (const file of midiFiles) {
        try {
            const filePath = path.join(MIDI_DIR, file);
            const midiData = fs.readFileSync(filePath);
            const midi = new Midi(midiData);

            for (const track of midi.tracks) {
                const programNumber = track.instrument?.number ?? 0;
                const soundfontName = GM_TO_SOUNDFONT[programNumber];

                if (soundfontName) {
                    const localFolder = SOUNDFONT_TO_LOCAL[soundfontName] || soundfontName;
                    const key = `${soundfontName}|${localFolder}`;

                    if (!requiredNotes.has(key)) {
                        requiredNotes.set(key, {
                            soundfontName,
                            localFolder,
                            notes: new Set()
                        });
                    }

                    // Extract all note numbers from this track
                    for (const note of track.notes) {
                        const noteName = midiNoteToName(note.midi);
                        requiredNotes.get(key).notes.add(noteName);
                    }
                }
            }
        } catch (e) {
            console.log(`  ⚠️ ${file} - Parse hatası: ${e.message}`);
        }
    }

    return requiredNotes;
}

/**
 * Check which samples already exist for an instrument
 */
function getExistingSamples(localFolder) {
    const samplesPath = path.join(SAMPLES_DIR, localFolder);
    if (!fs.existsSync(samplesPath)) return new Set();

    const files = fs.readdirSync(samplesPath).filter(f => f.endsWith('.mp3'));
    return new Set(files.map(f => f.replace('.mp3', '')));
}

/**
 * Download a specific note sample from MIDI.js Soundfonts
 * Uses MusyngKite (highest quality) as primary source
 * Tries multiple sources until one succeeds
 */
async function downloadNoteSample(soundfontName, localFolder, noteName) {
    const fileName = `${noteName}.mp3`;
    const dest = path.join(SAMPLES_DIR, localFolder, fileName);

    // Already exists?
    if (fs.existsSync(dest)) {
        return { success: true, skipped: true };
    }

    // Try each source until one succeeds
    for (const baseUrl of SOUNDFONT_SOURCES) {
        const url = `${baseUrl}/${soundfontName}-mp3/${noteName}.mp3`;
        const result = await downloadFile(url, dest);

        if (result.success) {
            return result;
        }
    }

    // All sources failed
    return { success: false, skipped: false };
}

/**
 * Generate manifest.json for all downloaded samples
 */
function generateManifest() {
    console.log('\n📄 manifest.json güncelleniyor...');

    const manifest = {};

    if (!fs.existsSync(SAMPLES_DIR)) {
        console.log('❌ Samples dizini bulunamadı!');
        return;
    }

    const dirs = fs.readdirSync(SAMPLES_DIR).filter(d => {
        const fullPath = path.join(SAMPLES_DIR, d);
        return fs.statSync(fullPath).isDirectory();
    });

    for (const dir of dirs) {
        const samplesPath = path.join(SAMPLES_DIR, dir);
        manifest[dir] = fs.readdirSync(samplesPath)
            .filter(f => f.endsWith('.mp3'))
            .sort();
    }

    fs.writeFileSync(
        path.join(SAMPLES_DIR, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
    );

    console.log('✅ manifest.json güncellendi');
}

/**
 * Main execution
 */
async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  🎹 High Quality MIDI Sample Downloader');
    console.log('  📦 Primary: MusyngKite (1.75GB - HIGHEST Quality)');
    console.log('  📦 Fallback: FatBoy (320MB) → FluidR3_GM (148MB)');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Step 1: Scan MIDI files and get required notes per instrument
    const requiredNotes = scanMidiFiles();

    if (requiredNotes.size === 0) {
        console.log('\n❌ MIDI dosyalarında enstrüman bulunamadı!');
        return;
    }

    // Step 2: Analyze what we need vs what we have
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  📊 Analiz Sonuçları');
    console.log('═══════════════════════════════════════════════════════════\n');

    const downloadPlan = [];
    let totalRequired = 0;
    let totalExisting = 0;
    let totalMissing = 0;

    for (const [key, data] of requiredNotes) {
        const { soundfontName, localFolder, notes } = data;
        const existingSamples = getExistingSamples(localFolder);
        const missingNotes = [...notes].filter(n => !existingSamples.has(n));

        totalRequired += notes.size;
        totalExisting += (notes.size - missingNotes.length);
        totalMissing += missingNotes.length;

        const status = missingNotes.length === 0 ? '✅' : '📥';
        console.log(`${status} ${localFolder.toUpperCase().padEnd(22)} | Gerekli: ${notes.size.toString().padStart(3)} | Mevcut: ${(notes.size - missingNotes.length).toString().padStart(3)} | Eksik: ${missingNotes.length.toString().padStart(3)}`);

        if (missingNotes.length > 0) {
            downloadPlan.push({ soundfontName, localFolder, missingNotes });
            // Show first few missing notes as preview
            const preview = missingNotes.slice(0, 5).join(', ');
            const more = missingNotes.length > 5 ? `, +${missingNotes.length - 5} more` : '';
            console.log(`   └─ Eksik notalar: ${preview}${more}`);
        }
    }

    console.log('\n───────────────────────────────────────────────────────────');
    console.log(`   TOPLAM | Gerekli: ${totalRequired} | Mevcut: ${totalExisting} | Eksik: ${totalMissing}`);
    console.log('───────────────────────────────────────────────────────────');

    // Step 3: Download missing samples
    if (downloadPlan.length === 0) {
        console.log('\n✅ Tüm gerekli sample\'lar zaten mevcut! İndirme yapılmadı.\n');
    } else {
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('  📥 Eksik Sample\'lar İndiriliyor (FluidR3_GM)');
        console.log('═══════════════════════════════════════════════════════════\n');

        let downloadedCount = 0;
        let failedCount = 0;

        for (const { soundfontName, localFolder, missingNotes } of downloadPlan) {
            process.stdout.write(`  📥 ${localFolder.toUpperCase().padEnd(22)} `);

            let instDownloaded = 0;
            let instFailed = 0;

            for (const noteName of missingNotes) {
                const result = await downloadNoteSample(soundfontName, localFolder, noteName);

                if (result.success && !result.skipped) {
                    process.stdout.write('.');
                    instDownloaded++;
                    downloadedCount++;
                } else if (result.skipped) {
                    // Already exists, don't count as failure
                } else if (!result.success) {
                    process.stdout.write('x');
                    instFailed++;
                    failedCount++;
                }
            }

            console.log(` ✅ ${instDownloaded} indirildi${instFailed > 0 ? `, ${instFailed} başarısız` : ''}`);
        }

        console.log(`\n📊 Sonuç: ${downloadedCount} sample indirildi, ${failedCount} başarısız.`);
    }

    // Step 4: Generate manifest
    generateManifest();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✅ İşlem Tamamlandı!');
    console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
