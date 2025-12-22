require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');

puppeteer.use(StealthPlugin());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runAutomation() {
    console.log('--- MEMULAI PROSES OTOMATISASI ---');
    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

    try {
        console.log('📅 Step 1: Mengambil jadwal dari kalender...');
        await page.goto('https://jkt48.com/calendar/list?lang=id', { waitUntil: 'networkidle2' });

        const theaterShows = await page.evaluate(() => {
            const results = [];
            document.querySelectorAll('tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    const tanggal = cells[0].innerText.trim().replace(/\n/g, ' ');
                    row.querySelectorAll('a').forEach(link => {
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
            console.log('⚠️ Tidak ada jadwal ditemukan. Cek selector!');
            return;
        }
        console.log(`✅ Berhasil menemukan ${theaterShows.length} jadwal.`);

        console.log('\n🚀 Step 2: Mengambil lineup member...');
        for (let i = 0; i < theaterShows.length; i++) {
            process.stdout.write(`⏳ [${i + 1}/${theaterShows.length}] ${theaterShows[i].event}... `);
            try {
                await page.goto(theaterShows[i].url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                const lineup = await page.evaluate(() => {
                    const anchors = Array.from(document.querySelectorAll('a[href*="/member/detail/"]'));
                    const names = anchors.map(a => a.innerText.trim()).filter(n => n.length > 0);
                    return [...new Set(names)];
                });
                theaterShows[i].members = lineup;
                console.log(`✅ (${lineup.length} Member)`);
            } catch (err) {
                console.log(`❌ Gagal: ${err.message}`);
            }
        }

        console.log('\n☁️ Step 3: Sinkronisasi ke Supabase...');
        for (const item of theaterShows) {
            const { error } = await supabase.from('jadwal_theater').upsert({ 
                tanggal: item.tanggal, 
                event: item.event, 
                url: item.url, 
                members: item.members 
            }, { onConflict: 'url' });
            if (error) console.error('❌ Error Supabase:', error.message);
        }
        console.log('\n✨ SEMUA PROSES BERHASIL!');
    } catch (error) {
        console.error('❌ Error Fatal:', error.message);
    } finally {
        await browser.close();
    }
}
runAutomation();