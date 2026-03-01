// FILE 2: index.js (The Brain)
const express = require('express');
const fetch = require('node-fetch');
const { parseStringPromise } = require('xml2js');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

// 🏰 THE MASTER ARCHIVE
const ARCHIVE_FILE = './master_archive.json';

// --- YOUR SOVEREIGN BOARDS ---
const BOARDS = {
    "day": "ccadlas/day",
    "night": "ccadlas/night",
    "safe_night": "ccadlas/nightt",
    "safe_snowy": "ccadlas/snowy",
    "safe_cloudy": "ccadlas/cloudy",
    "safe_foggy": "ccadlas/foggy",
    "safe_rainy": "ccadlas/rainy",
    "safe_stormy": "ccadlas/stormy",
    "safe_golden": "ccadlas/golden",
    "safe_sunny": "ccadlas/sunny"
};

let store = {};
Object.keys(BOARDS).forEach(k => store[k] = []);
if (fs.existsSync(ARCHIVE_FILE)) {
    try { store = JSON.parse(fs.readFileSync(ARCHIVE_FILE)); } catch (e) {}
}

async function verifyOriginal(pinUrl) {
    let original = pinUrl.replace('/236x/', '/originals/').replace('/736x/', '/originals/');
    try {
        const response = await fetch(original, { method: 'HEAD' });
        if (response.ok) return original;
        const pngVer = original.replace('.jpg', '.png');
        const pngRes = await fetch(pngVer, { method: 'HEAD' });
        if (pngRes.ok) return pngVer;
    } catch (e) {}
    return null; 
}

async function syncBoard(type) {
    const boardId = BOARDS[type];
    if (!boardId) return;
    try {
        const res = await fetch(`https://www.pinterest.com/${boardId}.rss`);
        const xml = await res.text();
        const result = await parseStringPromise(xml);
        const items = result.rss.channel[0].item;
        let newCount = 0;
        for (const item of items) {
            const imgMatch = item.description[0].match(/src="(.*?)"/);
            if (imgMatch && imgMatch[1]) {
                const url = imgMatch[1];
                if (!store[type].includes(url)) { store[type].push(url); newCount++; }
            }
        }
        if (newCount > 0) fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(store));
    } catch (e) { console.error(`Sync error: ${type}`); }
}

app.get('/pinterest/scout/:type', async (req, res) => {
    const type = req.params.type.toLowerCase();
    const seen = req.query.seen ? req.query.seen.split(',') : [];
    if (!BOARDS[type]) return res.json({ success: false, error: "Board not found" });

    await syncBoard(type);
    const candidates = store[type];
    const output = [];
    for (let i = candidates.length - 1; i >= 0; i--) {
        if (output.length >= 15) break;
        if (seen.includes(candidates[i])) continue;
        const original = await verifyOriginal(candidates[i]);
        if (original) output.push(original);
    }
    res.json({ success: true, pins: output });
});

app.get('/', (req, res) => res.send(`⚓ Command Center Active. Managing ${Object.keys(BOARDS).length} boards.`));
app.listen(PORT, () => console.log(`⚓ Master Detective on port ${PORT}`));
