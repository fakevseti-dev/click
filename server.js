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

// Схема з новими полями totalEarned та totalSpent
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true, required: true },
    username: { type: String, default: 'Гравець' },
    balance: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 }, // Скільки всього зароблено за весь час (для рангів)
    totalSpent: { type: Number, default: 0 },  // Скільки витрачено на покращення
    energy: { type: Number, default: 1000 },
    damageLevel: { type: Number, default: 1 },
    capacityLevel: { type: Number, default: 1 },
    recoveryLevel: { type: Number, default: 1 },
    referrals: { type: Number, default: 0 },
    rank: { type: Number, default: 1 }, 
    invitedBy: { type: String, default: null },
    earnedForInviter: { type: Number, default: 0 },
    pendingEnergyBonus: { type: Number, default: 0 },
    lastSync: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// ІНІЦІАЛІЗАЦІЯ КОРИСТУВАЧА
app.post('/api/init', async (req, res) => {
    try {
        const { telegramId, username, refId } = req.body;
        let user = await User.findOne({ telegramId });
        
        if (!user) {
            user = new User({ telegramId, username: username || 'Гравець' });
            if (refId && refId !== telegramId && refId !== "null") {
                const inviter = await User.findOne({ telegramId: refId });
                if (inviter) {
                    inviter.referrals += 1;
                    inviter.pendingEnergyBonus += 500;
                    await inviter.save();
                    user.invitedBy = refId;
                }
            }
            await user.save();
        } else {
            // Міграція для старих гравців (щоб їхній ранг не скинувся)
            if (user.totalEarned === 0 && user.balance > 0) {
                user.totalEarned = user.balance;
                await user.save();
            }
        }
        res.json(user);
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

// СИНХРОНІЗАЦІЯ
app.post('/api/sync', async (req, res) => {
    try {
        const { telegramId, clientTotalEarned, clientSpent, clientEnergy, levels, rank } = req.body;
        const user = await User.findOne({ telegramId });
        
        if (!user) return res.status(404).json({ error: "User not found" });

        // Рахуємо ТІЛЬКИ чистий приріст (тапи/завдання), ігноруючи витрати в магазині
        const farmed = Math.max(0, clientTotalEarned - user.totalEarned);
        const spentDiff = Math.max(0, clientSpent - user.totalSpent);

        // Даємо 10% запрошувачу тільки з чистого приросту
        if (farmed > 0 && user.invitedBy) {
            const bonus = farmed * 0.10;
            await User.findOneAndUpdate(
                { telegramId: user.invitedBy },
                { $inc: { balance: bonus } }
            );
            user.earnedForInviter += bonus;
        }

        user.totalEarned = Math.max(user.totalEarned, clientTotalEarned);
        user.totalSpent = Math.max(user.totalSpent, clientSpent);
        
        // Формуємо новий баланс з урахуванням заробітку та витрат
        user.balance = user.balance + farmed - spentDiff;
        
        let newEnergy = clientEnergy;
        if (user.pendingEnergyBonus > 0) {
            const capacityMultipliers = [1.0, 1.3, 1.6, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
            const maxEnergy = Math.floor(1000 * capacityMultipliers[levels.capacity - 1]);
            newEnergy = Math.min(maxEnergy, clientEnergy + user.pendingEnergyBonus);
            user.pendingEnergyBonus = 0;
        }

        user.energy = newEnergy;
        user.damageLevel = levels.damage;
        user.capacityLevel = levels.capacity;
        user.recoveryLevel = levels.recovery;
        user.rank = Math.max(user.rank || 1, rank || 1);
        user.lastSync = Date.now();
        
        await user.save();

        res.json({ 
            success: true, 
            balance: user.balance,
            totalEarned: user.totalEarned,
            totalSpent: user.totalSpent,
            energy: user.energy,
            referrals: user.referrals
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// СПИСОК РЕФЕРАЛІВ
app.get('/api/referralsList/:telegramId', async (req, res) => {
    try {
        const refs = await User.find({ invitedBy: req.params.telegramId }).select('username earnedForInviter');
        res.json(refs);
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