 database.js - отдельный файл для работы с базой данных
(function() {
     Ключи для localStorage
    const STORAGE_KEYS = {
        USERS 'trust_tap_users',
        REFERRALS 'trust_tap_referrals',
        STATS 'trust_tap_stats'
    };

     Класс для работы с базой данных
    window.DB = {
         Получить всех пользователей
        getAllUsers function() {
            try {
                const data = localStorage.getItem(STORAGE_KEYS.USERS);
                return data  JSON.parse(data)  {};
            } catch (e) {
                console.error('DB Error reading users', e);
                return {};
            }
        },

         Сохранить всех пользователей
        saveAllUsers function(users) {
            try {
                localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
                this.updateStats();
                return true;
            } catch (e) {
                console.error('DB Error saving users', e);
                return false;
            }
        },

         Получить пользователя по ID
        getUser function(userId) {
            const users = this.getAllUsers();
            return users[userId]  null;
        },

         Сохранить пользователя
        saveUser function(userData) {
            const users = this.getAllUsers();
            const isNew = !users[userData.userId];
            
            users[userData.userId] = {
                ...userData,
                lastActive Date.now()
            };
            
            this.saveAllUsers(users);
            
             Если это новый пользователь и есть реферер
            if (isNew && userData.referrer && userData.referrer !== userData.userId) {
                this.processReferral(userData.userId, userData.referrer);
            }
            
            return { success true, isNew isNew };
        },

         Обработать реферала
        processReferral function(newUserId, referrerId) {
            console.log('🔄 Processing referral', newUserId, '-', referrerId);
            
            const users = this.getAllUsers();
            
             Проверяем существование реферера
            if (!users[referrerId]) {
                console.log('❌ Referrer not found', referrerId);
                return false;
            }
            
             Увеличиваем счетчик рефералов
            users[referrerId].referrals = (users[referrerId].referrals  0) + 1;
            
             Сохраняем информацию о реферале в отдельную таблицу
            this.saveReferral(referrerId, newUserId);
            
             Обновляем данные
            this.saveAllUsers(users);
            
            console.log('✅ Referral processed! Now', referrerId, 'has', users[referrerId].referrals, 'referrals');
            return true;
        },

         Сохранить информацию о реферальной связи
        saveReferral function(referrerId, referralId) {
            try {
                const referrals = this.getAllReferrals();
                if (!referrals[referrerId]) {
                    referrals[referrerId] = [];
                }
                if (!referrals[referrerId].includes(referralId)) {
                    referrals[referrerId].push(referralId);
                }
                localStorage.setItem(STORAGE_KEYS.REFERRALS, JSON.stringify(referrals));
            } catch (e) {
                console.error('DB Error saving referral', e);
            }
        },

         Получить всех рефералов
        getAllReferrals function() {
            try {
                const data = localStorage.getItem(STORAGE_KEYS.REFERRALS);
                return data  JSON.parse(data)  {};
            } catch (e) {
                console.error('DB Error reading referrals', e);
                return {};
            }
        },

         Получить рефералов пользователя
        getUserReferrals function(userId) {
            const referrals = this.getAllReferrals();
            return referrals[userId]  [];
        },

         Обновить статистику
        updateStats function() {
            const users = this.getAllUsers();
            const now = Date.now();
            const dayAgo = now - 24  60  60  1000;
            
            let totalBalance = 0;
            let totalTaps = 0;
            let totalReferrals = 0;
            let activeToday = 0;
            
            Object.values(users).forEach(user = {
                totalBalance += user.balance  0;
                totalTaps += user.totalTaps  0;
                totalReferrals += user.referrals  0;
                if (user.lastActive  dayAgo) activeToday++;
            });
            
            const stats = {
                totalUsers Object.keys(users).length,
                activeToday activeToday,
                totalBalance totalBalance,
                totalTaps totalTaps,
                totalReferrals totalReferrals,
                lastUpdate now
            };
            
            localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats));
            return stats;
        },

         Получить статистику
        getStats function() {
            try {
                const data = localStorage.getItem(STORAGE_KEYS.STATS);
                return data  JSON.parse(data)  this.updateStats();
            } catch (e) {
                console.error('DB Error reading stats', e);
                return {
                    totalUsers 0,
                    activeToday 0,
                    totalBalance 0,
                    totalTaps 0,
                    totalReferrals 0
                };
            }
        },

         Очистить все данные (для тестирования)
        clearAll function() {
            if (confirm('⚠️ Это удалит ВСЕ данные! Продолжить')) {
                localStorage.removeItem(STORAGE_KEYS.USERS);
                localStorage.removeItem(STORAGE_KEYS.REFERRALS);
                localStorage.removeItem(STORAGE_KEYS.STATS);
                console.log('✅ All data cleared');
                return true;
            }
            return false;
        },

         Экспорт данных
        exportData function() {
            const data = {
                users this.getAllUsers(),
                referrals this.getAllReferrals(),
                stats this.getStats(),
                exportDate new Date().toISOString()
            };
            return JSON.stringify(data, null, 2);
        },

         Импорт данных
        importData function(jsonData) {
            try {
                const data = JSON.parse(jsonData);
                if (data.users) localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(data.users));
                if (data.referrals) localStorage.setItem(STORAGE_KEYS.REFERRALS, JSON.stringify(data.referrals));
                this.updateStats();
                return true;
            } catch (e) {
                console.error('DB Error importing data', e);
                return false;
            }
        }
    };

     Инициализация базы данных
    console.log('✅ Database module loaded');
})();