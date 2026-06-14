// ============================================================================
// 🗄️ config.js - 遊戲核心數據庫 (Data-Driven Design)
// 這裡就像遊戲的「大腦記憶區」，所有的數值設定都在這裡。
// 你可以隨意調整這裡的數字來達到想要的「遊戲平衡」，完全不會弄壞物理引擎！
// ============================================================================

const CONFIG = {
    // ------------------------------------------------------------------------
    // 1. 遊戲全域規則 (Global Rules)
    // ------------------------------------------------------------------------
    rules: {
        maxSteps: 3,         // 一回合最多可規劃的航段數 (戰術深度)
        maxHeat: 100,        // 戰機最高熱量上限 (超過會鎖死發射)
        maxAp: 300,          // 戰機動能 (AP) 儲存上限
    },

   // ------------------------------------------------------------------------
    // 2. 機體資料庫 (Aircraft Database)
    // ------------------------------------------------------------------------
    aircrafts: {
        'mig21': {
            id: 'mig21',
            name: 'MiG-21 Fishbed',
            maxHp: 100,
            baseAp: 150,
            maxYaw: Math.PI / 4,    // 45 度偏航限制
            maxPitch: Math.PI / 3,  // 60 度俯仰限制
            maxRoll: Math.PI / 4,   // 45 度滾轉限制
            turnRate: Math.PI / 4,    
            pitchRate: Math.PI / 3,   
            
            throttleStats: {
                1: { thrust: 15, heat: -25, turnLimit: 1.0, speedProfile: [1.0, 0.5, 0.1], gunAngleMult: 1.8, gunRangeMult: 0.8 },  
                2: { thrust: 35, heat: -10, turnLimit: 0.7, speedProfile: [1.5, 1.5, 1.5], gunAngleMult: 1.0, gunRangeMult: 1.0 },  
                3: { thrust: 75, heat: 38,  turnLimit: 0.4, speedProfile: [2.0, 3.0, 5.0], gunAngleMult: 0.4, gunRangeMult: 1.3 }   
            },
            visuals: {
                ribbonWidth: 0.12, engineOffsetY: -0.08, noseOffsetZ: 0.65, tailOffsetZ: -0.6
            },
            
            // 🌟 【新增：動態派龍架 / 掛載點系統】
            // 座標 (x, y, z) 相對於飛機模型中心。x 為左右，y 為高低，z 為前後。
            pylons: [
                { id: 1, position: [-0.1, 0.37, -0.2], weapon: 'fox2' }, // 左翼內側
                { id: 2, position: [-0.25, 0.37, -0.2], weapon: 'fox2' }, // 左翼外側
                { id: 3, position: [ 0.25, 0.37, -0.2], weapon: 'fox2' }, // 右翼外側
                { id: 4, position: [ 0.1, 0.37, -0.2], weapon: 'fox2' }  // 右翼內側
            ]
        }
    },

    // ------------------------------------------------------------------------
    // 3. 武器裝備資料庫 (Weapons & Countermeasures)
    // ------------------------------------------------------------------------
    weapons: {
        'gun': {
            id: 'gun',
            name: '機砲',
            damage: 35,            // 掃中一次的扣血量
            range: 35,             // 雷達磁吸攔截有效射程
            angle: Math.PI / 12,   // 磁吸漏斗角 (15度，容錯率)
        },
        'fox2': {
            id: 'fox2',
            name: 'FOX-2 (紅外線飛彈)',
            damage: 75,            // 命中傷害
            speed: 0.6,            // 每幀飛行速度
            maxAp: 400,            // 飛彈推進器燃料 (AP耗盡就會墜毀)
            turnRate: 0.1,        // 尋標器轉向率 (PN導航的敏銳度)
            drag: 2.5,             // 飛行阻力消耗 (影響射程)
            seekerRange: 60,       // 導引頭極限探測距離
            seekerAngle: Math.PI / 12, // 導引頭極限視角 (15度)
            seekerMinHeat: 10,     // 脫鎖熱量下限 (熱量低於此值會瞎掉)
            fuseRange: 3.5,        // 近炸引信觸發半徑 (防穿模)
            minArmingRange: 25,    // 🛑 最短武裝射程：小於 25 米，引信不工作（直線直飛，撞牆不爆）
            maxFlightRange: 65,    // 🛑 最遠自毀射程：從發射點起算，飛行總距離超過 65 米立刻在空中自毀！
            
            // 3D 模型掛載位置與姿態設定
            model: {
                scale: 0.3,        // 模型大小
                offsetX: -0.5,     // 左右掛架位移 (負值在左翼)
                offsetY: -0.10,    // 高低位移
                offsetZ: 0.0,      // 前後位移
                rotX: Math.PI / 2, // 模型傾角導正
                rotY: 0,
                rotZ: 0
            }
        },
        'flare': {
            id: 'flare',
            name: '熱焰彈',
            maxAmmo: 3,            // 攜帶數量
            // 【跨回合熱焰彈物理狀態】
            // 模擬誘餌彈從拋射到燃燒殆盡的過程
            stages: [
                { age: 0, heat: 500 }, { age: 0, heat: 500 }, // 回合 1：極高溫亮黃火球 (絕對干擾)
                { age: 1, heat: 150 }, // 回合 2：降溫成橙色大火球 (部分干擾)
                { age: 2, heat: 0   }  // 回合 3：變成啡色煙霧，完全失效
            ]
        }
    }
};