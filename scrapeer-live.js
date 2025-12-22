const ytdl = require('@distube/ytdl-core');

/**
 * Fungsi untuk mengambil detail video YouTube
 * @param {string} videoId - ID video dari URL YouTube
 */
async function scrapeYouTubeData(videoId) {
    try {
        console.log(`[LOG] Memulai scraping untuk ID: ${videoId}...`);

        // Mengambil informasi lengkap dari YouTube InnerTube API secara otomatis
        // Library ini menangani API Key dan token internal secara otomatis
        const info = await ytdl.getInfo(videoId);

        // Memilih format video terbaik (biasanya mp4 yang ada audio+video)
        const format = ytdl.chooseFormat(info.formats, { 
            quality: 'highestvideo', 
            filter: 'audioandvideo' 
        });

        const dataResult = {
            title: info.videoDetails.title,
            author: info.videoDetails.author.name,
            viewCount: info.videoDetails.viewCount,
            description: info.videoDetails.description,
            thumbnail: info.videoDetails.thumbnails.pop().url, // Ambil resolusi tertinggi
            videoUrl: format.url, // Link mentah untuk tag <video> atau player
            isLive: info.videoDetails.isLiveContent
        };

        console.log("\n=== DATA BERHASIL DIAMBIL ===");
        console.log("Judul     :", dataResult.title);
        console.log("Channel   :", dataResult.author);
        console.log("Penonton  :", dataResult.viewCount);
        console.log("Link Video:", dataResult.videoUrl.substring(0, 50) + "...");
        console.log("==============================\n");

        return dataResult;

    } catch (error) {
        if (error.message.includes('403')) {
            console.error("[ERROR] Terkena blokir (403 Forbidden). Coba ganti koneksi atau gunakan Proxy/Cookie.");
        } else if (error.message.includes('400')) {
            console.error("[ERROR] Bad Request (400). YouTube mendeteksi bot atau parameter tidak valid.");
        } else {
            console.error("[ERROR] Terjadi kesalahan:", error.message);
        }
    }
}

// Jalankan fungsi dengan ID video dari URL yang kamu berikan tadi
const videoId = 'nQL5xSi5wp4';
scrapeYouTubeData(videoId);