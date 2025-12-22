const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function scrapeJadwalFinal() {
    const url = 'https://jkt48.com/calendar/list?lang=id'; 
    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: ['--no-sandbox'] 
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

    try {
        console.log('Membuka kalender JKT48...');
        await page.goto(url, { waitUntil: 'networkidle2' });

        const theaterShows = await page.evaluate(() => {
            const results = [];
            // Mengambil semua elemen baris tabel (tr)
            const allRows = document.querySelectorAll('tr');

            allRows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    const tanggal = cells[0].innerText.trim().replace(/\n/g, ' ');
                    
                    // Mencari semua link di dalam sel konten yang memiliki pola waktu (00:00)
                    const links = cells[1].querySelectorAll('a');
                    links.forEach(link => {
                        const txt = link.innerText.trim();
                        // Berdasarkan gambar Anda, formatnya: "19:00 KIRA KIRA GIRLS"
                        if (txt.includes(':')) {
                            results.push({
                                tanggal: tanggal,
                                event: txt,
                                url: link.href
                            });
                        }
                    });
                }
            });
            return results;
        });

        if (theaterShows.length > 0) {
            console.log('\n🎭 JADWAL DITEMUKAN:');
            console.table(theaterShows);
            fs.writeFileSync('jadwal_theater.json', JSON.stringify(theaterShows, null, 2));
            console.log('✅ Berhasil disimpan ke jadwal_theater.json');
        } else {
            console.log('❌ Masih tidak ditemukan. Coba cek apakah bulan di web sudah benar.');
        }

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await browser.close();
    }
}

scrapeJadwalFinal();