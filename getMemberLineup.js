require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

puppeteer.use(StealthPlugin());

// Inisialisasi Supabase
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runAutomation() {
    const url = 'https://jkt48.com/calendar/list?lang=id'; 
    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

    try {
        // --- LANGKAH 1: SCRAPE JADWAL DARI KALENDER ---
        console.log('📅 Membuka kalender JKT48...');
        await page.goto(url, { waitUntil: 'networkidle2' });

        const theaterShows = await page.evaluate(() => {
            const results = [];
            const allRows = document.querySelectorAll('tr');

            allRows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    const tanggal = cells[0].innerText.trim().replace(/\n/g, ' ');
                    const links = cells[1].querySelectorAll('a');
                    links.forEach(link => {
                        const txt = link.innerText.trim();
                        if (txt.includes(':')) {
                            results.push({
                                tanggal: tanggal,
                                event: txt,
                                url: link.href,
                                members: []
                            });
                        }
                    });
                }
            });
            return results;
        });

        if (theaterShows.length === 0) {
            console.log('❌ Jadwal tidak ditemukan di kalender.');
            return;
        }

        console.log(`✅ Berhasil mengambil ${theaterShows.length} jadwal dari kalender.`);

        // --- LANGKAH 2: SCRAPE LINEUP MEMBER ---
        console.log('\n🚀 Memulai scraping member untuk setiap show...');
        for (let i = 0; i < theaterShows.length; i++) {
            process.stdout.write(`⏳ [${i + 1}/${theaterShows.length}] Lineup: ${theaterShows[i].event}... `);
            
            try {
                await page.goto(theaterShows[i].url, { waitUntil: 'domcontentloaded', timeout: 30000 });

                const members = await page.evaluate(() => {
                    const anchors = Array.from(document.querySelectorAll('a[href*="/member/detail/"]'));
                    const names = anchors.map(a => a.innerText.trim()).filter(n => n.length > 0);
                    return [...new Set(names)];
                });

                theaterShows[i].members = members;
                console.log(`✅ (${members.length} Member)`);
            } catch (err) {
                console.log(`❌ Gagal: ${err.message}`);
                theaterShows[i].members = [];
            }
        }

        // --- LANGKAH 3: UPLOAD KE SUPABASE ---
        console.log('\n☁️  Mengunggah data ke Supabase...');
        for (const item of theaterShows) {
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
                console.log(`✅ Sinkron: ${item.event}`);
            }
        }

        console.log('\n✨ SEMUA PROSES BERHASIL DISATUKAN!');

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await browser.close();
    }
}

runAutomation();