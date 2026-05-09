require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const CryptoJS = require('crypto-js');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Key untuk Dekripsi (Harus sama dengan yang di Frontend)
const SECRET_KEY = process.env.ENCRYPTION_KEY || "KUNCI_RAHASIA_AETERNA_91_YEARS";

// --- INISIALISASI FIREBASE ---
let db;
try {
    const rawData = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (rawData) {
        const cleanData = rawData.replace(/[\x00-\x1F\x7F-\x9F]/g, ""); 
        const serviceAccount = JSON.parse(cleanData);
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log("✅ DATABASE AETERNA: CONNECTED");
        }
        db = admin.firestore();
    } else {
        console.error("⚠️ WARNING: FIREBASE_SERVICE_ACCOUNT tidak ditemukan!");
    }
} catch (error) {
    console.error("❌ FIREBASE INIT ERROR:", error.message);
}

// --- KONFIGURASI EMAIL (NAMECHEAP PRIVATE EMAIL) ---
const transporter = nodemailer.createTransport({
    host: 'mail.privateemail.com',
    port: 465, // Port SSL untuk Namecheap
    secure: true, 
    auth: {
        user: 'hello@arcaaeterna.com',
        pass: process.env.EMAIL_PASS // Masukkan password email Namecheap di .env
    },
    tls: {
        rejectUnauthorized: false // Menghindari error sertifikat pada VPS/Railway
    }
});

// Verifikasi Koneksi Email saat Start
transporter.verify((error, success) => {
    if (error) {
        console.log("❌ EMAIL SERVER ERROR:", error.message);
    } else {
        console.log("✅ EMAIL SERVER: READY (hello@arcaaeterna.com)");
    }
});

// --- API: SIMPAN KAPSUL ---
app.post('/api/capsules', async (req, res) => {
    try {
        if (!db) throw new Error("Database tidak terhubung.");
        const { title, message, targetEmail, unlockDate, userId } = req.body;
        
        const newCapsule = {
            title: title || "Tanpa Judul",
            message: message, // Terenkripsi AES dari frontend
            targetEmail: targetEmail,
            unlockDate: new Date(unlockDate).toISOString(),
            userId: userId || "anonymous",
            isSent: false,
            createdAt: new Date().toISOString()
        };
        
        const docRef = await db.collection('capsules').add(newCapsule);
        res.status(201).json({ id: docRef.id, message: "Kapsul Berhasil Disegel!" });
    } catch (e) {
        console.error("API POST ERROR:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// --- API: AMBIL RIWAYAT ---
app.get('/api/capsules/:userId', async (req, res) => {
    try {
        if (!db) throw new Error("Database tidak terhubung.");
        const { userId } = req.params;
        
        const snapshot = await db.collection('capsules')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .get();
            
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(data);
    } catch (e) {
        console.error("API GET ERROR:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// --- SISTEM OTOMATIS: CHECKER & SENDER ---
cron.schedule('* * * * *', async () => {
    if (!db) return;
    
    const sekarang = new Date().toISOString();
    console.log(`⏳ [${new Date().toLocaleTimeString()}] Memeriksa Vault...`);
    
    try {
        const snapshot = await db.collection('capsules')
            .where('unlockDate', '<=', sekarang)
            .where('isSent', '==', false)
            .get();

        if (snapshot.empty) return;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            
            // Dekripsi Pesan sebelum dikirim
            let originalMessage = "";
            try {
                const bytes = CryptoJS.AES.decrypt(data.message, SECRET_KEY);
                originalMessage = bytes.toString(CryptoJS.enc.Utf8);
                if (!originalMessage) throw new Error();
            } catch (decErr) {
                originalMessage = "[Pesan Terenkripsi Aman]";
            }

            const mailOptions = {
                from: '"ARCA AETERNA" <hello@arcaaeterna.com>',
                to: data.targetEmail,
                subject: `[AETERNA] Pesan Masa Lalu: ${data.title}`,
                html: `
                <div style="background:#0a001a; color:#ffffff; padding:40px; border:2px solid #bc13fe; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align:center;">
                    <h1 style="color:#bc13fe; letter-spacing: 5px; text-shadow: 0 0 15px #bc13fe;">ARCA AETERNA</h1>
                    <p style="font-size:18px; color:#cfcfcf;">Sebuah kapsul waktu telah terbuka untuk Anda.</p>
                    <hr style="border:0; border-top:1px solid #bc13fe; margin:30px 0;">
                    <div style="background:rgba(188, 19, 254, 0.1); padding:25px; border-radius:15px; border: 1px dashed #bc13fe; text-align:left;">
                        <h2 style="color:#bc13fe; margin-top:0;">${data.title}</h2>
                        <p style="line-height:1.8; font-size:16px; color:#ffffff;">"${originalMessage}"</p>
                    </div>
                    <p style="font-size:12px; color:#666; margin-top:30px;">Dikirim melalui Protokol Arca Aeterna - Zero Knowledge Archive.</p>
                    <a href="https://arcaaeterna.com" style="color:#bc13fe; text-decoration:none; font-weight:bold;">Visit Vault</a>
                </div>`
            };

            await transporter.sendMail(mailOptions);
            await db.collection('capsules').doc(doc.id).update({ isSent: true });
            console.log(`🚀 SUKSES: "${data.title}" terkirim ke ${data.targetEmail}`);
        }
    } catch (err) {
        console.error("❌ CRON ERROR:", err.message);
    }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 AETERNA LIVE PADA PORT ${PORT}`);
});