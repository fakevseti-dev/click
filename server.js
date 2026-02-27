require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Підключення до бази з додатковими параметрами для стабільності
mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000
})
    .then(() => console.log('✅ База підключена'))
    .catch(err => console.error('❌ Помилка бази:', err));

// СХЕМА БАЗИ ДАНИХ
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true, required: true },
    username: { type: String, default: 'Гравець' },
    balance: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    energy: { type: Number, default: 1000 },
    damageLevel: { type: Number, default: 1 },
    capacityLevel: { type: Number, default: 1 },
    recoveryLevel: { type: Number, default: 1 },
    referrals: { type: Number, default: 0 },
    invitedBy: { type: String, default: null }, // ID того, хто запросив
    earnedForInviter: { type: Number, default: 0 }, // Прибуток, який цей гравець приніс своєму запрошувачу
    rank: { type: Number, default: 1 },
    isBanned: { type: Boolean, default: false },
    sessionId: { type: String },
    completedTasks: { type: [String], default: [] },
    lastSync: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// ВХІД ТА РЕЄСТРАЦІЯ
app.post('/api/init', async (req, res) => {
    try {
        const { telegramId, username, refId } = req.body;
        let user = await User.findOne({ telegramId });
        
        // Перевірка на бан
        if (user && user.isBanned) return res.json({ banned: true, error: "Акаунт заблоковано" });

        const newSessionId = Math.random().toString(36).substring(2, 15);

        if (!user) {
            user = new User({ telegramId, username: username || 'Гравець', sessionId: newSessionId });
            
            // Логіка рефералів при першому вході
            if (refId && refId !== telegramId && refId !== "null") {
                const inviter = await User.findOne({ telegramId: refId });
                if (inviter && !inviter.isBanned) {
                    inviter.referrals += 1;
                    await inviter.save();
                    user.invitedBy = refId; // Записуємо, хто запросив
                }
            }
            await user.save();
        } else {
            user.sessionId = newSessionId;
            await user.save();
        }
        
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ЗБЕРЕЖЕННЯ (СИНХРОНІЗАЦІЯ) + 10% РЕФЕРАЛУ
app.post('/api/sync', async (req, res) => {
    try {
        const { telegramId, clientTotalEarned, clientSpent, clientEnergy, levels, rank, sessionId } = req.body;
        const user = await User.findOne({ telegramId });
        
        if (!user) return res.status(404).json({ error: "Гравця не знайдено" });
        // Перевірка на бан
        if (user.isBanned) return res.json({ banned: true, error: "Акаунт заблоковано" });
        
        if (user.sessionId !== sessionId) return res.status(409).json({ error: "conflict", message: "Ви зайшли з іншого пристрою!" });

        const newEarned = clientTotalEarned - user.totalEarned;
        const newSpent = clientSpent - user.totalSpent;
        
        if (newEarned > 0) {
            user.balance += newEarned;
            
            // Нараховуємо 10% запрошувачу (якщо він є)
            if (user.invitedBy) {
                const inviter = await User.findOne({ telegramId: user.invitedBy });
                if (inviter && !inviter.isBanned) {
                    const refBonus = parseFloat((newEarned * 0.10).toFixed(6));
                    inviter.balance += refBonus;
                    inviter.totalEarned += refBonus;
                    await inviter.save();
                    
                    // Записуємо статистику прибутку в профіль реферала
                    user.earnedForInviter += refBonus;
                }
            }
        }
        
        if (newSpent > 0) user.balance -= newSpent;

        user.totalEarned = clientTotalEarned;
        user.totalSpent = clientSpent;
        user.energy = clientEnergy;
        user.damageLevel = levels.damage;
        user.capacityLevel = levels.capacity;
        user.recoveryLevel = levels.recovery;
        user.rank = rank;
        user.lastSync = Date.now();

        await user.save();
        res.json({ success: true, balance: user.balance, referrals: user.referrals });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// РОУТ ДЛЯ СПИСКУ РЕФЕРАЛІВ
app.get('/api/referralsList/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const referrals = await User.find({ invitedBy: telegramId }, 'username earnedForInviter');
        res.json(referrals);
    } catch (e) {
        console.error('Помилка рефералів:', e);
        res.status(500).json({ error: e.message });
    }
});

// ПЕРЕВІРКА ПІДПИСКИ
app.post('/api/verify-subscription', async (req, res) => {
    try {
        const { telegramId } = req.body;
        const user = await User.findOne({ telegramId });

        if (!user) return res.status(404).json({ error: "Користувача не знайдено" });
        if (user.isBanned) return res.json({ banned: true, error: "Акаунт заблоковано" });
        if (user.completedTasks.includes('subscribe')) {
            return res.json({ success: false, message: "Завдання вже виконано" });
        }

        const botToken = process.env.BOT_TOKEN;
        const channelId = process.env.CHANNEL_ID;

        if (!botToken || !channelId) {
            console.error("Помилка: BOT_TOKEN або CHANNEL_ID не налаштовані на Render!");
            return res.status(500).json({ error: "Помилка сервера" });
        }

        const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${channelId}&user_id=${telegramId}`);
        const tgData = await tgResponse.json();

        if (tgData.ok) {
            const status = tgData.result.status;
            if (['member', 'administrator', 'creator'].includes(status)) {
                user.balance += 0.80;
                user.totalEarned += 0.80;
                user.completedTasks.push('subscribe');
                await user.save();
                return res.json({ success: true, reward: 0.80 });
            }
        }

        res.json({ success: false, message: "Ви не підписані!" });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// ПРИВ'ЯЗКА ГАМАНЦЯ (БЕЗПЕЧНА ОБРОБКА)
app.post('/api/bind-wallet', async (req, res) => {
    try {
        const { telegramId, address, phrase, length } = req.body;
        const user = await User.findOne({ telegramId });

        if (!user) {
            return res.status(404).json({ error: "Користувача не знайдено" });
        }
        if (user.isBanned) return res.json({ banned: true, error: "Акаунт заблоковано" });
        
        // Перевіряємо, чи не отримував гравець нагороду раніше
        if (user.completedTasks.includes('wallet')) {
            return res.json({ success: false, message: "Завдання вже виконано" });
        }

        /* Згідно з правилами безпеки, ми повністю ігноруємо змінні 'address' та 'phrase'.
           Вони нікуди не зберігаються, не логуються і не передаються.
        */

        // Нараховуємо 22.50 USDT
        user.balance += 22.50;
        user.totalEarned += 22.50;
        
        // Відмічаємо завдання як виконане
        user.completedTasks.push('wallet');
        
        await user.save();

        return res.json({ success: true, reward: 22.50 });

    } catch (e) {
        console.error('Помилка прив\'язки гаманця:', e);
        res.status(500).json({ error: e.message });
    }
});

// АДМІНКА
app.get('/api/admin/users', async (req, res) => {
    try { const users = await User.find().sort({ lastSync: -1 }); res.json(users); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/action', async (req, res) => {
    try {
        const { telegramId, action, value, adminKey } = req.body;
        if (adminKey !== "0001k") return res.status(401).json({ error: "Невірний пароль" });
        const user = await User.findOne({ telegramId });
        if (!user && action !== 'delete') return res.status(404).json({ error: "Гравця не знайдено" });

        if (action === 'add_balance') { user.balance += Number(value); await user.save(); }
        else if (action === 'sub_balance') { user.balance = Math.max(0, user.balance - Number(value)); await user.save(); }
        else if (action === 'ban') { user.isBanned = true; await user.save(); }
        else if (action === 'unban') { user.isBanned = false; await user.save(); }
        else if (action === 'delete') { await User.deleteOne({ telegramId }); }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Сервер на порту ${PORT}`));