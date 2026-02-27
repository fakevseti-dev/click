require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ База підключена'))
    .catch(err => console.error('❌ Помилка бази:', err));

const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true, required: true },
    username: { type: String, default: 'Игрок' },
    balance: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 }, 
    totalSpent: { type: Number, default: 0 },  
    energy: { type: Number, default: 1000 },
    damageLevel: { type: Number, default: 1 },
    capacityLevel: { type: Number, default: 1 },
    recoveryLevel: { type: Number, default: 1 },
    referrals: { type: Number, default: 0 },
    rank: { type: Number, default: 1 }, 
    invitedBy: { type: String, default: null },
    earnedForInviter: { type: Number, default: 0 },
    pendingEnergyBonus: { type: Number, default: 0 },
    sessionId: { type: String, default: null },
    lastSync: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

function validateInitData(initData) {
    if (!process.env.BOT_TOKEN) return true; 
    if (!initData) return false;

    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        urlParams.delete('hash');
        urlParams.sort();
        
        let dataCheckString = '';
        for (const [key, value] of urlParams.entries()) {
            dataCheckString += `${key}=${value}\n`;
        }
        dataCheckString = dataCheckString.slice(0, -1);
        
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        
        return calculatedHash === hash;
    } catch (e) {
        return false;
    }
}

// ІНІЦІАЛІЗАЦІЯ ТА ВИДАЧА БОНУСУ ОДРАЗУ
app.post('/api/init', async (req, res) => {
    try {
        const { telegramId, username, refId, initData } = req.body;
        
        if (!validateInitData(initData)) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        const sessionId = crypto.randomUUID(); 
        let user = await User.findOne({ telegramId });
        
        if (!user) {
            user = new User({ telegramId, username: username || 'Игрок', sessionId });
            if (refId && refId !== telegramId && refId !== "null") {
                const inviter = await User.findOne({ telegramId: refId });
                if (inviter) {
                    inviter.referrals += 1;
                    inviter.pendingEnergyBonus += 500; // СРАЗУ ВЫДАЕМ +500 ЭНЕРГИИ ДРУГУ
                    await inviter.save();
                    user.invitedBy = refId;
                }
            }
        } else {
            user.sessionId = sessionId; 
            if (user.totalEarned === 0 && user.balance > 0) {
                user.totalEarned = user.balance; 
            }
        }
        await user.save();
        res.json(user);
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

// СИНХРОНІЗАЦІЯ
app.post('/api/sync', async (req, res) => {
    try {
        const { telegramId, clientTotalEarned, clientSpent, clientEnergy, levels, rank, initData, sessionId } = req.body;
        
        if (!validateInitData(initData)) return res.status(403).json({ error: "Unauthorized" });

        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "User not found" });

        if (user.sessionId !== sessionId) {
            return res.status(409).json({ error: "conflict", message: "Игра открыта на другом устройстве" });
        }

        const farmed = Math.max(0, clientTotalEarned - user.totalEarned);
        const spentDiff = Math.max(0, clientSpent - user.totalSpent);

        let safeFarmed = farmed;
        if (safeFarmed > 50) safeFarmed = 50; 

        if (safeFarmed > 0 && user.invitedBy) {
            const bonus = safeFarmed * 0.10;
            await User.findOneAndUpdate(
                { telegramId: user.invitedBy },
                { $inc: { balance: bonus } }
            );
            user.earnedForInviter += bonus;
        }

        user.totalEarned = user.totalEarned + safeFarmed;
        user.totalSpent = Math.max(user.totalSpent, clientSpent);
        user.balance = user.balance + safeFarmed - spentDiff;
        
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