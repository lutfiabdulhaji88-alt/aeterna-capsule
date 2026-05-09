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

// Gunakan kunci rahasia yang konsisten dengan frontend
const SECRET_KEY = process.env.ENCRYPTION_KEY || "KUNCI_RAHASIA_AETERNA_91_YEARS";

// --- INISIALISASI FIREBASE ---
let db;

try {
    const rawData = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (rawData) {
        // Membersihkan karakter aneh dan parsing JSON
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
        console.error("⚠️ WARNING: FIREBASE_SERVICE_ACCOUNT tidak ditemukan di .env!");
    }
} catch (error) {
    console.error("❌ FIREBASE INIT ERROR:", error.message);
}

// --- KONFIGURASI EMAIL (NAMECHEAP) ---
const transporter = nodemailer.createTransport({
    host: 'mail.privateemail.com',
    port: 465,
    secure: true,
    auth: {
        user: 'hello@arcaaeterna.com',
        pass: process.env.EMAIL_PASS
    },
    tls: { rejectUnauthorized: false }
});

// --- API: SIMPAN KAPSUL ---
app.post('/api/capsules', async (req, res) => {
    try {
        if (!db) throw new Error("Database tidak terhubung.");
        const { title, message, targetEmail, unlockDate, userId } = req.body;
        
        const newCapsule = {
            title: title || "Tanpa Judul",
            message: message, // Tersimpan dalam bentuk terenkripsi AES dari frontend
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

// --- API: AMBIL DATA ---
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

// --- SISTEM OTOMATIS: DEKRIPSI & KIRIM ---
cron.schedule('* * * * *', async () => {
    if (!db) return;
    
    console.log("⏳ AETERNA: Memeriksa Vault...");
    const sekarang = new Date().toISOString();
    
    try {
        const snapshot = await db.collection('capsules')
            .where('unlockDate', '<=', sekarang)
            .where('isSent', '==', false)
            .get();

        if (snapshot.empty) return;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            
            let originalMessage = "";
            try {
                const bytes = CryptoJS.AES.decrypt(data.message, SECRET_KEY);
                originalMessage = bytes.toString(CryptoJS.enc.Utf8);
                if (!originalMessage) throw new Error();
            } catch (decErr) {
                originalMessage = "[Pesan Terenkripsi Jangka Panjang]";
            }

            const mailOptions = {
                from: '"AETERNA VAULT" <hello@arcaaeterna.com>',
                to: data.targetEmail,
                subject: `[AETERNA] Masa Lalu Menghubungi: ${data.title}`,
                html: `<div style="background:#0a001a; color:white; padding:30px; border:2px solid #bc13fe; font-family:sans-serif;">
                    <h1 style="color:#bc13fe; text-shadow: 0 0 10px #bc13fe;">ARCA AETERNA</h1>
                    <p>Pesan rahasia Anda telah terbuka dari masa lalu:</p>
                    <div style="background:rgba(255,255,255,0.05); padding:20px; border-radius:10px; border: 1px solid #bc13fe;">
                        <h3 style="color:#bc13fe;">${data.title}</h3>
                        <p style="line-height:1.6; font-size:16px;">"${originalMessage}"</p>
                    </div>
                    <p style="font-size:10px; color:#666; margin-top:20px;">Secured by Aeterna Zero-Knowledge Encryption Protocol.</p>
                </div>`
            };

            await transporter.sendMail(mailOptions);
            await db.collection('capsules').doc(doc.id).update({ isSent: true });
            console.log(`🚀 Pesan "${data.title}" terkirim ke ${data.targetEmail}`);
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