const express = require('express');
const fetch = require('node-fetch');
const { parseStringPromise } = require('xml2js');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

const ARCHIVE_FILE = './master_archive.json';

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
    try { 
        const data = JSON.parse(fs.readFileSync(ARCHIVE_FILE)); 
        Object.assign(store, data);
    } catch (e) { console.error("Archive Load Error"); }
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

async function syncAllBoards() {
    console.log("🕵️ Background Scout patrolling...");
    let foundNew = false;
    for (const type of Object.keys(BOARDS)) {
        try {
            const res = await fetch(`https://www.pinterest.com/${BOARDS[type]}.rss`);
            const xml = await res.text();
            const result = await parseStringPromise(xml);
            const items = result.rss.channel[0].item;
            
            for (const item of items) {
                const imgMatch = item.description[0].match(/src="(.*?)"/);
                if (imgMatch && imgMatch[1]) {
                    const url = imgMatch[1];
                    if (!store[type].includes(url)) { 
                        store[type].push(url); 
                        foundNew = true; 
                    }
                }
            }
        } catch (e) {}
    }
    if (foundNew) fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(store));
}

setInterval(syncAllBoards, 15 * 60 * 1000);
syncAllBoards();

app.get('/pinterest/scout/:type', async (req, res) => {
    const type = req.params.type.toLowerCase();
    const seen = req.query.seen ? req.query.seen.split(',') : [];
    if (!BOARDS[type]) return res.json({ success: false, error: "Board not found" });

    const candidates = store[type];
    const output = [];
    
    for (let i = candidates.length - 1; i >= 0; i--) {
        if (output.length >= 15) break;
        if (seen.includes(candidates[i])) continue;
        
        const original = await verifyOriginal(candidates[i]);
        if (original) output.push(original);
    }

    // 🏆 THE GREAT RESET: If we found NOTHING new for the phone, tell it to reset its history!
    if (output.length === 0 && candidates.length > 0) {
        return res.json({ 
            success: true, 
            pins: [], 
            action: "RESET_HISTORY", 
            message: "Board exhausted. Starting over from the beginning!" 
        });
    }

    res.json({ success: true, pins: output });
});

app.get('/stats', (req, res) => {
    const stats = {};
    Object.keys(store).forEach(k => stats[k] = store[k].length);
    res.json({ success: true, total_pins: stats });
});

app.get('/', (req, res) => res.send(`⚓ Master Detective Ready.`));
app.listen(PORT, () => console.log(`⚓ Server on port ${PORT}`));
