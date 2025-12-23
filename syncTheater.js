require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');

puppeteer.use(StealthPlugin());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Fungsi untuk mengambil URL publik dari Supabase Storage
 * berdasarkan nama event yang di-scrape.
 */
function getStorageImageUrl(eventName) {
    const bucketName = 'Thumbnail_Theater';
    
    // Sesuaikan nama file dengan nama event + ekstensi .jpg
    // Pastikan nama file di storage persis sama dengan nama event di web
    const fileName = `${eventName}.jpg`;
    
    const { data } = supabase
        .storage
        .from(bucketName)
        .getPublicUrl(fileName);

    return data.publicUrl;
}

async function runAutomation() {
    console.log('--- MEMULAI PROSES OTOMATISASI ---');
    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

    try {
        console.log('📅 Step 1: Mengambil daftar jadwal dari kalender...');
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
                                tanggal: "" 
                            });
                        }
                    });
                }
            });
            return results;
        });

        console.log(`✅ Berhasil menemukan ${theaterShows.length} jadwal.`);

        console.log('\n🚀 Step 2: Mengambil Detail (Tanggal & Lineup Member)...');
        for (let i = 0; i < theaterShows.length; i++) {
            process.stdout.write(`⏳ [${i + 1}/${theaterShows.length}] ${theaterShows[i].event}... `);
            try {
                await page.goto(theaterShows[i].url, { waitUntil: 'domcontentloaded' });
                
                const detailData = await page.evaluate(() => {
                    const bodyText = document.body.innerText;
                    const dateMatch = bodyText.match(/(\w+),\s+(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{4})/);
                    
                    let finalDate = "";
                    if (dateMatch) {
                        const [full, hari, tgl, bln, thn] = dateMatch;
                        const namaBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
                        finalDate = `${hari}, ${parseInt(tgl)} ${namaBulan[parseInt(bln)-1]} ${thn}`;
                    }

                    // Ambil Lineup Member berdasarkan link detail member
                    const anchors = Array.from(document.querySelectorAll('a[href*="/member/detail/"]'));
                    const names = [...new Set(anchors.map(a => a.innerText.trim()).filter(n => n.length > 0))];

                    return { tanggal: finalDate, lineup: names };
                });

                theaterShows[i].tanggal = detailData.tanggal || "Tanggal tidak ditemukan";
                theaterShows[i].members = detailData.lineup;
                console.log(`✅`);
            } catch (err) {
                console.log(`❌ Error: ${err.message}`);
            }
        }

        console.log('\n☁️ Step 3: Sinkronisasi ke Supabase...');
        for (const item of theaterShows) {
            // Ambil URL gambar dari bucket berdasarkan nama event
            const storageImageUrl = getStorageImageUrl(item.event);

            // Cek apakah data sudah ada berdasarkan URL agar ID tidak boros/nambah terus
            const { data: existingData } = await supabase
                .from('jadwal_theater')
                .select('url')
                .eq('url', item.url)
                .maybeSingle();

            if (!existingData) {
                console.log(`➕ Menambahkan data baru: ${item.event}`);
                await supabase.from('jadwal_theater').insert({ 
                    tanggal: item.tanggal, 
                    jam: item.jam,
                    event: item.event, 
                    url: item.url, 
                    image: storageImageUrl, // Link otomatis ke Storage
                    members: item.members 
                });
            } else {
                console.log(`⏭️ Jadwal sudah ada, mengupdate gambar/lineup: ${item.event}`);
                await supabase.from('jadwal_theater')
                    .update({ 
                        image: storageImageUrl,
                        members: item.members,
                        tanggal: item.tanggal,
                        jam: item.jam
                    })
                    .eq('url', item.url);
            }
        }
        console.log('\n✨ SELESAI! Silakan cek Supabase Anda.');

    } catch (error) {
        console.error('❌ Error Fatal:', error.message);
    } finally {
        await browser.close();
    }
}

runAutomation();