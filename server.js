require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Підключення до MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ База MongoDB підключена!'))
  .catch(err => console.error('❌ Помилка бази:', err));

const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true, required: true },
    username: { type: String, default: 'Гравець' },
    balance: { type: Number, default: 0 },
    energy: { type: Number, default: 1000 },
    damageLevel: { type: Number, default: 1 },
    capacityLevel: { type: Number, default: 1 },
    recoveryLevel: { type: Number, default: 1 },
    referrals: { type: Number, default: 0 },
    lastSync: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// Ініціалізація гравця
app.post('/api/init', async (req, res) => {
    try {
        const { telegramId, username } = req.body;
        if (!telegramId) return res.status(400).json({ error: "No ID" });

        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, username, balance: 0, energy: 1000 });
            await user.save();
        }
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Синхронізація (Збереження)
app.post('/api/sync', async (req, res) => {
    try {
        const { telegramId, balance, energy, levels } = req.body;
        const user = await User.findOneAndUpdate(
            { telegramId },
            { 
                balance, energy, 
                damageLevel: levels.damage, 
                capacityLevel: levels.capacity, 
                recoveryLevel: levels.recovery,
                lastSync: Date.now() 
            },
            { new: true }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Дані для адмінки
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find().sort({ lastSync: -1 });
        res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Сервер на порту ${PORT}`));
