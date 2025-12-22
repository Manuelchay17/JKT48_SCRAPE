const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');

puppeteer.use(StealthPlugin());

async function getYoutubeLink() {
    const url = 'https://agent48.site/'; // Buka halaman utama agar Anda bisa pilih video
    const sessionPath = path.join(__dirname, 'browser_session');

    const browser = await puppeteer.launch({ 
        headless: false, 
        userDataDir: sessionPath,
        args: ['--no-sandbox', '--window-size=1280,720'] 
    });
    
    const page = await browser.newPage();
    
    // Listener ini akan terus standby. Kapanpun Anda klik video & link YT muncul, dia akan catat.
    page.on('request', request => {
        const reqUrl = request.url();
        if (reqUrl.includes('youtube.com/embed/')) {
            console.log('\n=========================================');
            console.log('🎯 LINK YT BERHASIL DITANGKAP!');
            console.log('URL:', reqUrl.split('?')[0]);
            console.log('=========================================\n');
            console.log('Silakan pilih video lain atau tekan Ctrl+C di terminal untuk berhenti.');
        }
    });

    try {
        console.log('Membuka browser...');
        await page.goto(url, { waitUntil: 'load' });

        console.log('\n📢 INSTRUKSI:');
        console.log('1. Jendela browser sudah terbuka.');
        console.log('2. Silakan KLIK video mana saja yang ingin Anda scrape di dalam browser.');
        console.log('3. Tunggu sampai video terputar.');
        console.log('4. Link YouTube akan muncul otomatis di terminal ini.');
        
        // KUNCI: Jangan gunakan timeout. Biarkan browser terbuka selamanya 
        // sampai Anda sendiri yang menutup terminal (Ctrl+C).
        await new Promise(() => {}); 

    } catch (error) {
        if (error.message.includes('Target closed')) {
            console.log('Browser ditutup oleh pengguna.');
        } else {
            console.error('Terjadi kesalahan:', error.message);
        }
    }
}

getYoutubeLink();