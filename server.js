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

// Схема пользователя с новыми полями для рефералов
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true, required: true },
    username: { type: String, default: 'Гравець' },
    balance: { type: Number, default: 0 },
    energy: { type: Number, default: 1000 },
    damageLevel: { type: Number, default: 1 },
    capacityLevel: { type: Number, default: 1 },
    recoveryLevel: { type: Number, default: 1 },
    referrals: { type: Number, default: 0 },
    invitedBy: { type: String, default: null }, // ID того, кто пригласил
    earnedForInviter: { type: Number, default: 0 }, // Сколько USDT этот игрок принес пригласившему
    pendingEnergyBonus: { type: Number, default: 0 }, // Ожидаемый бонус энергии
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
            
            // Якщо є реферал і це не сам гравець
            if (refId && refId !== telegramId && refId !== "null") {
                const inviter = await User.findOne({ telegramId: refId });
                if (inviter) {
                    inviter.referrals += 1;
                    inviter.pendingEnergyBonus += 500; // Нараховуємо 500 енергії запрошувачу
                    await inviter.save();
                    
                    user.invitedBy = refId; // Зберігаємо, чий це реферал
                    console.log(`👥 Реферал +1 для ${refId} від ${telegramId}`);
                }
            }
            await user.save();
            console.log(`🆕 Створено користувача: ${telegramId}`);
        }
        res.json(user);
    } catch (e) { 
        console.error("Помилка ініціалізації:", e);
        res.status(500).json({ error: e.message }); 
    }
});

// СИНХРОНІЗАЦІЯ ТА 10% ДОХОДУ
app.post('/api/sync', async (req, res) => {
    try {
        const { telegramId, clientBalance, clientEnergy, levels } = req.body;
        const user = await User.findOne({ telegramId });
        
        if (!user) return res.status(404).json({ error: "User not found" });

        // Рахуємо, скільки гравець натапав/заробив з минулої синхронізації
        const farmedBalance = Math.max(0, clientBalance - user.balance);

        // Якщо заробив і є запрошувач - даємо йому 10% пасивного доходу
        if (farmedBalance > 0 && user.invitedBy) {
            const bonus = farmedBalance * 0.10; // 10%
            await User.findOneAndUpdate(
                { telegramId: user.invitedBy },
                { $inc: { balance: bonus } }
            );
            user.earnedForInviter += bonus; // Зберігаємо статистику прибутку
        }

        // Оновлюємо баланс (якщо йому самому накапало від його рефералів, баланс не зіб'ється)
        const newBalance = user.balance + farmedBalance;
        
        // Оновлюємо енергію з урахуванням бонусу за нових рефералів
        let newEnergy = clientEnergy;
        if (user.pendingEnergyBonus > 0) {
            const capacityMultipliers = [1.0, 1.3, 1.6, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
            const maxEnergy = Math.floor(1000 * capacityMultipliers[levels.capacity - 1]);
            // Не даємо вийти за ліміт
            newEnergy = Math.min(maxEnergy, clientEnergy + user.pendingEnergyBonus);
            user.pendingEnergyBonus = 0; // Бонус видано
        }

        user.balance = newBalance;
        user.energy = newEnergy;
        user.damageLevel = levels.damage;
        user.capacityLevel = levels.capacity;
        user.recoveryLevel = levels.recovery;
        user.lastSync = Date.now();
        
        await user.save();

        res.json({ 
            success: true, 
            balance: newBalance,
            energy: newEnergy,
            referrals: user.referrals
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ОТРИМАННЯ СПИСКУ РЕФЕРАЛІВ
app.get('/api/referralsList/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const refs = await User.find({ invitedBy: telegramId }).select('username earnedForInviter');
        res.json(refs);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find().sort({ lastSync: -1 });
        res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Сервер на порту ${PORT}`));