const mongoose = require('mongoose');

const CapsuleSchema = new mongoose.Schema({
    title: String,
    message: String,
    unlockDate: Date,
    password: String
});

// Baris ini sangat penting, jangan sampai salah tulis!
module.exports = mongoose.model('Capsule', CapsuleSchema);