require('dotenv').config(); // Mengambil data dari .env
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Memanggil variabel dari .env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadData() {
    try {
        // 1. Cek apakah file JSON hasil scrape tersedia
        if (!fs.existsSync('jadwal_theater_lengkap.json')) {
            console.error('❌ File jadwal_theater_lengkap.json tidak ditemukan!');
            return;
        }

        const data = JSON.parse(fs.readFileSync('jadwal_theater_lengkap.json'));
        console.log(`🚀 Memulai sinkronisasi ${data.length} jadwal ke Supabase...`);

        // 2. Loop data dan masukkan ke database
        for (const item of data) {
            const { error } = await supabase
                .from('jadwal_theater')
                .upsert({ 
                    tanggal: item.tanggal, 
                    event: item.event, 
                    url: item.url, 
                    members: item.members 
                }, { onConflict: 'url' }); 

            if (error) {
                console.error(`❌ Gagal sinkron "${item.event}":`, error.message);
            } else {
                console.log(`✅ Terupdate: ${item.event}`);
            }
        }

        console.log('\n✨ SINKRONISASI DATABASE BERHASIL!');

    } catch (err) {
        console.error('Err:', err.message);
    }
}

uploadData();