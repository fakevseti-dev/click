require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Підключаємось до нашої безкоштовної бази в Atlas!
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Успішно підключено до MongoDB Atlas!'))
  .catch(err => console.error('❌ Помилка підключення до бази:', err));

const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    username: String,
    balance: { type: Number, default: 0 },
    energy: { type: Number, default: 1000 },
    damageLevel: { type: Number, default: 1 },
    capacityLevel: { type: Number, default: 1 },
    recoveryLevel: { type: Number, default: 1 },
    referrals: { type: Number, default: 0 },
    referredBy: { type: String, default: null },
    lastSync: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

app.post('/api/init', async (req, res) => {
    const { telegramId, username, refId } = req.body;
    if (!telegramId) return res.status(400).json({ error: "Немає Telegram ID" });

    let user = await User.findOne({ telegramId });
    if (!user) {
        user = new User({ telegramId, username });
        if (refId && refId !== telegramId) {
            const referrer = await User.findOne({ telegramId: refId });
            if (referrer) {
                referrer.referrals += 1;
                referrer.balance += 50; 
                await referrer.save();
                user.referredBy = refId;
            }
        }
        await user.save();
    }
    res.json(user);
});

app.post('/api/sync', async (req, res) => {
    const { telegramId, balance, energy, levels } = req.body;
    const user = await User.findOneAndUpdate(
        { telegramId },
        { 
            balance, energy, 
            damageLevel: levels.damage, capacityLevel: levels.capacity, recoveryLevel: levels.recovery,
            lastSync: Date.now() 
        },
        { new: true }
    );
    res.json({ success: true, user });
});

app.get('/api/admin/users', async (req, res) => {
    const users = await User.find().sort({ lastSync: -1 });
    res.json(users);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Сервер працює на порту ${PORT}`));