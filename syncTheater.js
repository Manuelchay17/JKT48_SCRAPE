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
        console.log('📅 Step 1: Mengambil jadwal dasar dari kalender...');
        await page.goto('https://jkt48.com/calendar/list?lang=id', { waitUntil: 'networkidle2' });

        const theaterShows = await page.evaluate(() => {
            const results = [];
            document.querySelectorAll('tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    row.querySelectorAll('a').forEach(link => {
                        const txt = link.innerText.trim();
                        if (txt.includes(':')) {
                            const waktuMatch = txt.match(/^(\d{2}:\d{2})/);
                            results.push({
                                jam: waktuMatch ? waktuMatch[1] : "",
                                event: txt.replace(/^\d{2}:\d{2}/, '').trim(),
                                url: link.href,
                                tanggal: "" // Akan diisi di Step 2 agar lebih akurat
                            });
                        }
                    });
                }
            });
            return results;
        });

        console.log(`✅ Berhasil menemukan ${theaterShows.length} jadwal.`);

        console.log('\n🚀 Step 2: Mengambil Detail Akurat (Tanggal, Image, Lineup)...');
        for (let i = 0; i < theaterShows.length; i++) {
            process.stdout.write(`⏳ [${i + 1}/${theaterShows.length}] ${theaterShows[i].event}... `);
            try {
                await page.goto(theaterShows[i].url, { waitUntil: 'domcontentloaded' });
                
                const detailData = await page.evaluate(() => {
                    // 1. Parsing Tanggal dari halaman detail (Cari teks yang mengandung format tgl)
                    // Mencari di elemen yang biasanya berisi "Show Date"
                    const bodyText = document.body.innerText;
                    const dateMatch = bodyText.match(/(\w+),\s+(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{4})/);
                    
                    let finalDate = "";
                    if (dateMatch) {
                        const [full, hari, tgl, bln, thn] = dateMatch;
                        const namaBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
                        // Mengubah format 4.12.2025 menjadi "Kamis, 4 Desember 2025"
                        finalDate = `${hari}, ${parseInt(tgl)} ${namaBulan[parseInt(bln)-1]} ${thn}`;
                    }

                    // 2. Ambil Image Poster
                    const img = document.querySelector('.entry-theater img, .entry-schedule__detail img, .entry-schedule__image img');
                    
                    // 3. Ambil Lineup Member
                    const anchors = Array.from(document.querySelectorAll('a[href*="/member/detail/"]'));
                    const names = [...new Set(anchors.map(a => a.innerText.trim()).filter(n => n.length > 0))];

                    return { tanggal: finalDate, image: img ? img.src : "", lineup: names };
                });

                theaterShows[i].tanggal = detailData.tanggal || "Tanggal tidak ditemukan";
                theaterShows[i].image = detailData.image;
                theaterShows[i].members = detailData.lineup;
                console.log(`✅`);
            } catch (err) {
                console.log(`❌ Error: ${err.message}`);
            }
        }

        console.log('\n☁️ Step 3: Sinkronisasi ke Supabase...');
        for (const item of theaterShows) {
            // Kita gunakan URL sebagai kunci unik agar tidak double
            await supabase.from('jadwal_theater').upsert({ 
                tanggal: item.tanggal, 
                jam: item.jam,
                event: item.event, 
                url: item.url, 
                image: item.image,
                members: item.members 
            }, { onConflict: 'url' });
        }
        console.log('\n✨ SELESAI! Silakan cek Supabase Anda.');

    } catch (error) {
        console.error('❌ Error Fatal:', error.message);
    } finally {
        await browser.close();
    }
}
runAutomation();