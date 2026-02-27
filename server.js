require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Підключення до бази даних MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ База підключена'))
    .catch(err => console.error('❌ Помилка підключення до бази:', err));

// Схема користувача
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

// 1. ІНІЦІАЛІЗАЦІЯ ГРАВЦЯ ТА РЕФЕРАЛЬНА СИСТЕМА
app.post('/api/init', async (req, res) => {
    try {
        const { telegramId, username, refId } = req.body;
        let user = await User.findOne({ telegramId });
        
        if (!user) {
            // Створюємо нового гравця, якщо його немає в базі
            user = new User({ 
                telegramId, 
                username: username || 'Гравець',
                balance: 0,
                energy: 1000
            });
            await user.save();
            console.log(`🆕 Новий гравець: ${username} (${telegramId})`);

            // ЛОГІКА РЕФЕРАЛА: якщо є refId і це не сам гравець
            if (refId && refId !== telegramId) {
                const updatedInviter = await User.findOneAndUpdate(
                    { telegramId: refId }, 
                    { $inc: { referrals: 1 } }, // Додаємо +1 реферала тому, хто запросив
                    { new: true }
                );
                if (updatedInviter) {
                    console.log(`👥 Реферал зараховано для ID: ${refId}. Тепер у нього: ${updatedInviter.referrals}`);
                }
            }
        }
        res.json(user);
    } catch (e) {
        console.error('Помилка при ініціалізації:', e);
        res.status(500).json({ error: e.message });
    }
});

// 2. СИНХРОНІЗАЦІЯ ДАНИХ (АВТОЗБЕРЕЖЕННЯ)
app.post('/api/sync', async (req, res) => {
    try {
        const { telegramId, balance, energy, levels } = req.body;
        
        // Оновлюємо баланс, енергію та всі рівні покращень
        await User.findOneAndUpdate({ telegramId }, { 
            balance, 
            energy, 
            damageLevel: levels.damage, 
            capacityLevel: levels.capacity, 
            recoveryLevel: levels.recovery, // Додано збереження рівня відновлення
            lastSync: Date.now() 
        });
        
        res.json({ success: true });
    } catch (e) {
        console.error('Помилка синхронізації:', e);
        res.status(500).json({ error: e.message });
    }
});

// 3. АДМІН-ПАНЕЛЬ (СПИСОК КОРИСТУВАЧІВ)
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find().sort({ lastSync: -1 });
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущено на порту ${PORT}`);
});
