// ============================================================================
// globals.js - 全域變數、狀態儲存與安全狀態機 (5檔相容版)
// ============================================================================

if (typeof THREE === 'undefined') throw new Error("Three.js is not loaded.");

const MAX_HP = CONFIG.aircrafts['mig21'].maxHp;
const MAX_HEAT = CONFIG.rules.maxHeat;
const MAX_AP = CONFIG.rules.maxAp;

const GUN_DAMAGE = CONFIG.weapons['gun'].damage;
const GUN_RANGE = CONFIG.weapons['gun'].range;
const GUN_ANGLE = CONFIG.weapons['gun'].angle;
const BULLET_SPEED = 4.0; 
const DYNAMIC_GUN_RANGE = 400; 

const MISSILE_DAMAGE = CONFIG.weapons['fox2'].damage;
const MISSILE_SCALE = CONFIG.weapons['fox2'].model.scale;
const MISSILE_ROT_X = CONFIG.weapons['fox2'].model.rotX;
const MISSILE_ROT_Y = CONFIG.weapons['fox2'].model.rotY;
const MISSILE_ROT_Z = CONFIG.weapons['fox2'].model.rotZ;
const MISSILE_MAX_AP = CONFIG.weapons['fox2'].maxAp;
const SEEKER_RANGE = CONFIG.weapons['fox2'].seekerRange;
const SEEKER_ANGLE = CONFIG.weapons['fox2'].seekerAngle;
const SEEKER_MIN_HEAT = CONFIG.weapons['fox2'].seekerMinHeat;

const MISSILE_SPEED = CONFIG.weapons['fox2'].speed;
const MISSILE_TURN_RATE = CONFIG.weapons['fox2'].turnRate;
const MISSILE_DRAG = CONFIG.weapons['fox2'].drag;

let battleLog = []; 
let globalFlares = []; 
let globalBullets = []; 
let missileMeshBase = null; 

let initialPositions = {
    red: { pos: new THREE.Vector3(10, 25, -30), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)) },
    blue: { pos: new THREE.Vector3(10, 25, 70), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)) }
};

// 🌟 初始化結構：預設開局為常規軍規推力 120AP 與 4 檔油門
let teams = {
    red: { id: 'red', type: 'mig21', colorMain: '#ff0055', wrapper: null, hp: MAX_HP, isDestroyed: false, ap: 120, speed: 120, heat: 0, flameout: false, throttle: 4, chain: [], stalled: false, gLimiterOn: true, weapon: 'gun', wpnQueued: false, flareAmmo: CONFIG.weapons['flare'].maxAmmo, flaresArmed: false, ready: false, pendingPitch: 0, pendingYaw: 0, pendingRoll: 0, pathPoints: [], pathQuats: [], flightCurve: null, pylons: null, activeMissiles: [] },
    blue: { id: 'blue', type: 'mig21', colorMain: '#00bcd4', wrapper: null, hp: MAX_HP, isDestroyed: false, ap: 120, speed: 120, heat: 0, flameout: false, throttle: 4, chain: [], stalled: false, gLimiterOn: true, weapon: 'gun', wpnQueued: false, flareAmmo: CONFIG.weapons['flare'].maxAmmo, flaresArmed: false, ready: false, pendingPitch: 0, pendingYaw: 0, pendingRoll: 0, pathPoints: [], pathQuats: [], flightCurve: null, pylons: null, activeMissiles: [] }
};

let tAct = 'red'; 
let P = teams[tAct]; 
let currentTurn = 1; 
let isAnimating = false; 
let animProgress = 0; 
let pastTrajectories = []; 
let trajectoryMeshes = { red: null, blue: null };

window.mslVisOffset = new THREE.Vector3(0.0, 0.0, 0.0);

// ============================================================================
// 👇 狀態機控制器 (State Machine) - 5 檔散熱與過熱保護
// ============================================================================
window.StateMachine = {
    applyDamage: function(teamId, amount) {
        let t = teams[teamId];
        if (t.isDestroyed) return false;
        t.hp = Math.max(0, t.hp - amount);
        if (t.hp <= 0) {
            t.hp = 0;
            t.isDestroyed = true;
            console.log(`💀 [系統結算] ${teamId.toUpperCase()} 小隊戰機已墜毀！`);
        }
        return t.isDestroyed;
    },
    
    // 🌟 5 檔專屬引擎溫度與熄火保護管控 (Flameout System)
    updateHeat: function(teamId, delta) {
        let t = teams[teamId];
        let maxH = typeof MAX_HEAT !== 'undefined' ? MAX_HEAT : 100;
        let throttle = t.throttle || 4;

        if (t.flameout === undefined) t.flameout = false;

        if (t.flameout) {
            // 熄火狀態：引擎強制關機冷卻，溫度急速下降
            t.heat = Math.max(0, (t.heat || 0) - 15);
            if (t.heat < 40) {
                t.flameout = false; // 溫度降至安全線，引擎重新點火
                console.log(`❄️ [系統提示] ${teamId.toUpperCase()} 引擎冷卻完成，重新點火！`);
            }
        } else {
            if (delta !== undefined) {
                // 100% 相容舊版或外部手動 delta
                t.heat = Math.max(0, Math.min(maxH, (t.heat || 0) + delta));
            } else {
                // 5 檔自動熱力學演算法
                if (throttle === 5) t.heat = (t.heat || 0) + 22;      // 5 檔 AB 廢熱極速累積
                else if (throttle === 4) t.heat = Math.max(0, (t.heat || 0) - 2); // 4 檔 MIL 常規
                else if (throttle === 3) t.heat = Math.max(0, (t.heat || 0) - 6); // 3 檔 ECO 微量冷卻
                else if (throttle === 2) t.heat = Math.max(0, (t.heat || 0) - 12); // 2 檔 IDL 快速冷卻
                else if (throttle === 1) t.heat = Math.max(0, (t.heat || 0) - 18); // 1 檔 BRK 狂暴冷卻
            }

            // 觸發熄火保護
            if (t.heat >= maxH) {
                t.flameout = true;
                t.throttle = 2; // 節流閥強拉至怠速 (2檔)
                console.log(`🔥 [警報] ${teamId.toUpperCase()} 引擎過熱 (FLAMEOUT)！強制關機保護！`);
            }
        }
    },

    // 🌟 100% 動力學空速同步與失速判定
    updateAP: function(teamId, rawSpeed, thrustBonus) {
        let t = teams[teamId];
        let stallAP = CONFIG.rules.stallSpeedAP || 45; 
        let minH = CONFIG.rules.minFlightHeight || 0.5; 
        
        // 🛠️ 核心修復：將引擎推力轉換為 AP 恢復量！否則戰機只有阻力會無限掉速
        let actualThrust = thrustBonus || 35; // 防呆預設值
        let newAP = rawSpeed + (actualThrust * 0.25); 
        newAP = Math.min(MAX_AP, newAP); // 確保不超過 300 上限

        // 儲存空速與 AP 指針數據，完美實現跨回合慣性繼承
        t.speed = newAP;
        t.ap = Math.floor(newAP);
        
        t.stalled = (t.ap < stallAP || t.wrapper.position.y < minH);
        if (t.stalled) {
            console.log(`⚠ [警報] ${teamId.toUpperCase()} 戰機空速不足 (${t.ap}m/s)，進入氣動失速！`);
        }
    },

    resetTurnStatus: function(teamId) {
        let t = teams[teamId];
        t.ready = false; 
        t.wpnQueued = false; 
        t.queuedAction = 'none';
        
        if (t.pylons) {
            t.pylons.forEach(p => {
                p.hasBoomedThisTurn = false; 
                if (p.flyingMesh) { scene.remove(p.flyingMesh); p.flyingMesh = null; }
                if (p.boomMesh) { scene.remove(p.boomMesh); if (p.boomMesh.geometry) p.boomMesh.geometry.dispose(); if (p.boomMesh.material) p.boomMesh.material.dispose(); p.boomMesh = null; }
                if (p.state === 'powering') p.state = 'armed'; 
                if (p.mesh) p.mesh.visible = (p.state !== 'empty');
            });
        }
    }
};