require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Підключення до бази
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ База підключена'))
    .catch(err => console.error('❌ Помилка бази:', err));

// Схема користувача (додано поле isBanned)
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true, required: true },
    username: { type: String, default: 'Гравець' },
    balance: { type: Number, default: 0 },
    energy: { type: Number, default: 1000 },
    damageLevel: { type: Number, default: 1 },
    capacityLevel: { type: Number, default: 1 },
    recoveryLevel: { type: Number, default: 1 },
    referrals: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false }, // Поле для бану
    lastSync: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// ВХІД ТА РЕФЕРАЛИ
app.post('/api/init', async (req, res) => {
    try {
        const { telegramId, username, refId } = req.body;
        let user = await User.findOne({ telegramId });
        
        // Якщо гравець у бані - не пускаємо
        if (user && user.isBanned) {
            return res.status(403).json({ error: "Акаунт заблоковано" });
        }

        if (!user) {
            user = new User({ telegramId, username: username || 'Гравець' });
            await user.save();
            console.log(`🆕 Створено користувача: ${telegramId}`);

            if (refId && refId !== telegramId && refId !== "null") {
                const inviter = await User.findOne({ telegramId: refId });
                // Даємо реферала, тільки якщо запрошувач теж не в бані
                if (inviter && !inviter.isBanned) {
                    inviter.referrals += 1;
                    await inviter.save();
                    console.log(`👥 Реферал зарахований для ${refId}`);
                }
            }
        }
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ЗБЕРЕЖЕННЯ ДАНИХ ТАПІВ
app.post('/api/sync', async (req, res) => {
    try {
        const { telegramId, balance, energy, levels } = req.body;
        
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "Гравця не знайдено" });
        if (user.isBanned) return res.status(403).json({ error: "Акаунт заблоковано" });

        await User.findOneAndUpdate({ telegramId }, { 
            balance, energy, 
            damageLevel: levels.damage, capacityLevel: levels.capacity, recoveryLevel: levels.recovery,
            lastSync: Date.now() 
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ВИВІД ГРАВЦІВ В АДМІНКУ
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find().sort({ lastSync: -1 });
        res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ⚡ ГОЛОВНИЙ БЛОК ДЛЯ РОБОТИ КНОПОК ⚡
app.post('/api/admin/action', async (req, res) => {
    try {
        const { telegramId, action, value, adminKey } = req.body;
        
        // Перевірка пароля, щоб ніхто чужий не міг слати запити
        if (adminKey !== "0001k") {
            return res.status(401).json({ error: "Невірний пароль адміністратора" });
        }

        const user = await User.findOne({ telegramId });
        if (!user && action !== 'delete') return res.status(404).json({ error: "Гравця не знайдено" });

        // Логіка кнопок
        if (action === 'add_balance') {
            user.balance += Number(value);
            await user.save();
        } else if (action === 'sub_balance') {
            user.balance = Math.max(0, user.balance - Number(value)); // Забороняємо мінус
            await user.save();
        } else if (action === 'ban') {
            user.isBanned = true;
            await user.save();
        } else if (action === 'unban') {
            user.isBanned = false;
            await user.save();
        } else if (action === 'delete') {
            await User.deleteOne({ telegramId });
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Сервер на порту ${PORT}`));
