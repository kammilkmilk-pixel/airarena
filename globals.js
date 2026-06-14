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

// 🌟 參數權限正式移交：從 config.js 動態讀取設定，不再寫死！
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