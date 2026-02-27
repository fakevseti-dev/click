require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ База підключена'))
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

// ГОЛОВНА ЛОГІКА РЕФЕРАЛІВ
app.post('/api/init', async (req, res) => {
    try {
        const { telegramId, username, refId } = req.body;
        let user = await User.findOne({ telegramId });
        
        if (!user) {
            // Новий користувач
            user = new User({ telegramId, username: username || 'Гравець' });
            await user.save();
            console.log(`🆕 Створено користувача: ${telegramId}`);

            // Зараховуємо реферала, якщо є refId і це не сам гравець
            if (refId && refId !== telegramId && refId !== "null") {
                const inviter = await User.findOne({ telegramId: refId });
                if (inviter) {
                    inviter.referrals += 1;
                    // Можна додати бонус запрошувачу: inviter.balance += 5;
                    await inviter.save();
                    console.log(`👥 Реферал +1 для ${refId} від ${telegramId}`);
                } else {
                    console.log(`⚠️ Запрошувача з ID ${refId} не знайдено`);
                }
            }
        }
        res.json(user);
    } catch (e) { 
        console.error("Помилка ініціалізації:", e);
        res.status(500).json({ error: e.message }); 
    }
});

app.post('/api/sync', async (req, res) => {
    try {
        const { telegramId, balance, energy, levels } = req.body;
        await User.findOneAndUpdate({ telegramId }, { 
            balance, energy, 
            damageLevel: levels.damage, 
            capacityLevel: levels.capacity, 
            recoveryLevel: levels.recovery,
            lastSync: Date.now() 
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find().sort({ lastSync: -1 });
        res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Сервер на порту ${PORT}`));