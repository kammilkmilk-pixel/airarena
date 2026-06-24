// ============================================================================
// globals.js - 全域變數、狀態儲存與參數橋樑
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

let teams = {
    red: { id: 'red', type: 'mig21', colorMain: '#ff0055', wrapper: null, hp: MAX_HP, isDestroyed: false, ap: CONFIG.aircrafts['mig21'].baseAp, heat: 0, throttle: 2, chain: [], stalled: false, gLimiterOn: true, weapon: 'gun', wpnQueued: false, flareAmmo: CONFIG.weapons['flare'].maxAmmo, flaresArmed: false, ready: false, pendingPitch: 0, pendingYaw: 0, pendingRoll: 0, pathPoints: [], pathQuats: [], flightCurve: null, pylons: null, activeMissiles: [] },
    blue: { id: 'blue', type: 'mig21', colorMain: '#00bcd4', wrapper: null, hp: MAX_HP, isDestroyed: false, ap: CONFIG.aircrafts['mig21'].baseAp, heat: 0, throttle: 2, chain: [], stalled: false, gLimiterOn: true, weapon: 'gun', wpnQueued: false, flareAmmo: CONFIG.weapons['flare'].maxAmmo, flaresArmed: false, ready: false, pendingPitch: 0, pendingYaw: 0, pendingRoll: 0, pathPoints: [], pathQuats: [], flightCurve: null, pylons: null, activeMissiles: [] }
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
// 👇 狀態機控制器 (State Machine) - 動態熱力與氣動動能終端趨向模型
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
    
    updateHeat: function(teamId, delta) {
        let t = teams[teamId];
        let maxH = typeof MAX_HEAT !== 'undefined' ? MAX_HEAT : 100;
        t.heat = Math.max(0, Math.min(maxH, (t.heat || 0) + delta));
    },

    // 🌟 核心修正：拋棄街機式強行對半折抵，改用「熱力學空氣阻力與極速趨向模型」！
    updateAP: function(teamId, rawAp, thrustBonus) {
        let t = teams[teamId];
        let stallAP = CONFIG.rules.stallSpeedAP || 45; 
        let minH = CONFIG.rules.minFlightHeight || 0.5; 
        
        // 1. 取得當前節流閥對應的「目標巡航動能 (Terminal Cruise AP)」
        // 怠速(1) 趨近 80AP，常規軍規(2) 趨近 130AP，後燃器開火(3) 趨近 200AP
        let throttle = t.throttle || 2;
        let targetAP = throttle === 1 ? 80 : (throttle === 2 ? 130 : 200);
        
        // 2. 物理插值：
        // 若經過機動轉彎後 rawAp 低於巡航目標，發動機推力將協助你「提速恢復 40%」；
        // 若經過高速俯衝 rawAp 高於巡航目標，空氣阻力會對超速動能進行「衰減扣除 25%」。
        let finalAp = rawAp;
        if (rawAp < targetAP) {
            let recoveryRate = 0.40; 
            finalAp = rawAp + (targetAP - rawAp) * recoveryRate;
        } else {
            let decayRate = 0.25; 
            finalAp = rawAp - (rawAp - targetAP) * decayRate;
        }
        
        t.ap = Math.floor(Math.max(0, finalAp));
        t.stalled = (t.ap < stallAP || t.wrapper.position.y < minH);
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