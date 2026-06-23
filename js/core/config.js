// ============================================================================
// 🗄️ config.js - 遊戲核心數據庫 (Data-Driven Design)
// ============================================================================

const CONFIG = {
    rules: {
        maxSteps: 3,         
        maxHeat: 100,        
        maxAp: 300,
        // 🌟 新增：抽離出來的物理與系統常數
        stepsPerTurn: 100,       // 每回合推演的總影格數 (時間解析度)
        gravity: 9.8,            // 遊戲世界的重力常數
        missileLaunchDelay: 12,  // 飛彈連續齊射的間隔幀數 (防相撞)
        stallSpeedAP: 45,        // 觸發失速的最低 AP 門檻
        minFlightHeight: 0.5     // 強制判定墜機/失速的最低高度 (m)
    },

    aircrafts: {
        'mig21': {
            id: 'mig21',
            name: 'MiG-21 Fishbed',
            maxHp: 100,
            baseAp: 150,
            maxYaw: Math.PI / 4,    
            maxPitch: Math.PI / 3,  
            maxRoll: Math.PI / 4,   
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
            
            guns: [
                { id: 1, position: [-0.05, -0.12, 0.45] }, 
                { id: 2, position: [ 0.05, -0.12, 0.45] }  
            ],
            
            pylons: [
                { id: 1, position: [-0.1, 0.37, -0.2], weapon: 'fox2' }, 
                { id: 2, position: [-0.25, 0.37, -0.2], weapon: 'fox2' }, 
                { id: 3, position: [ 0.25, 0.37, -0.2], weapon: 'fox2' }, 
                { id: 4, position: [ 0.1, 0.37, -0.2], weapon: 'fox2' }  
            ]
        }
    },

    weapons: {
        'gun': {
            id: 'gun',
            name: '機砲',
            damage: 35,            
            range: 35,             
            angle: Math.PI / 12,   
        },
        'fox2': {
            id: 'fox2',
            name: 'FOX-2 (紅外線飛彈)',
            damage: 75,            
            speed: 0.6,            
            maxAp: 400,            
            turnRate: 0.1,        
            drag: 2.5,             
            seekerRange: 60,       
            seekerAngle: Math.PI / 12, 
            seekerMinHeat: 10,     
            fuseRange: 3.5,        
            minArmingRange: 25,    
            maxFlightRange: 65,    
            
            model: {
                scale: 0.3,        
                offsetX: -0.5,     
                offsetY: -0.10,    
                offsetZ: 0.0,      
                rotX: Math.PI / 2, 
                rotY: 0,
                rotZ: 0
            }
        },
        'flare': {
            id: 'flare',
            name: '熱焰彈',
            maxAmmo: 3,            
            stages: [
                { age: 0, heat: 500 }, { age: 0, heat: 500 }, 
                { age: 1, heat: 150 }, 
                { age: 2, heat: 0   }  
            ]
        }
    },

    'visuals': {
        sparks: {
            count: 150,          
            size: 6.0,           
            streakProb: 1.40,    
            drag: 0.52,          
            gravity: 0.002       
        },
        smoke: {
            size: 6.0,           
            baseOpacity: 0.8,    
            fadeRate: 0.015,     
            color: 0x444444      
        },
        flipbookFps: 15,         
        
        // 🟢 特效上限已全面解放
        poolLimits: {
            explosion: 10,       
            flash: 20,           
            puff: 80              
        }
    }
};