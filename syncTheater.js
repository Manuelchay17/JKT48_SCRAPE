require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runAutomation() {
    // --- TAHAP 1: AMBIL DETAIL MEMBER ---
    if (!fs.existsSync('jadwal_theater.json')) {
        console.error('❌ File jadwal_theater.json tidak ditemukan!');
        return;
    }
    
    const shows = JSON.parse(fs.readFileSync('jadwal_theater.json'));
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Penting untuk GitHub Actions
    });
    const page = await browser.newPage();

    console.log(`🚀 Memulai scraping member untuk ${shows.length} show...`);

    for (let i = 0; i < shows.length; i++) {
        process.stdout.write(`⏳ [${i + 1}/${shows.length}] Lineup: ${shows[i].event}... `);
        try {
            await page.goto(shows[i].url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const members = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('a[href*="/member/detail/"]'));
                const names = anchors.map(a => a.innerText.trim()).filter(n => n.length > 0);
                return [...new Set(names)];
            });
            shows[i].members = members;
            console.log(`✅ (${members.length} Member)`);
        } catch (err) {
            console.log(`❌ Gagal: ${err.message}`);
            shows[i].members = [];
        }
    }
    await browser.close();

    // --- TAHAP 2: UPLOAD KE SUPABASE ---
    console.log(`\n☁️ Sinkronisasi ${shows.length} jadwal ke Supabase...`);
    for (const item of shows) {
        const { error } = await supabase
            .from('jadwal_theater')
            .upsert({ 
                tanggal: item.tanggal, 
                event: item.event, 
                url: item.url, 
                members: item.members 
            }, { onConflict: 'url' }); 

        if (error) {
            console.error(`❌ Gagal update "${item.event}":`, error.message);
        } else {
            console.log(`✅ Terupdate: ${item.event}`);
        }
    }
    console.log('\n✨ SEMUA PROSES REAL-TIME SELESAI!');
}

runAutomation();