// ============================================================================
// globals.js - 遊戲狀態初始化與 StateMachine (Phase 1: 掛載至 GameContext)
// ============================================================================

if (typeof THREE === 'undefined') throw new Error("Three.js is not loaded.");
if (typeof GameContext === 'undefined') throw new Error("GameContext is not loaded.");

const state = GameContext.state;

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

GameContext.constants = {
    MAX_HP, MAX_HEAT, MAX_AP,
    GUN_DAMAGE, GUN_RANGE, GUN_ANGLE, BULLET_SPEED, DYNAMIC_GUN_RANGE,
    MISSILE_DAMAGE, MISSILE_SCALE, MISSILE_ROT_X, MISSILE_ROT_Y, MISSILE_ROT_Z,
    MISSILE_MAX_AP, SEEKER_RANGE, SEEKER_ANGLE, SEEKER_MIN_HEAT,
    MISSILE_SPEED, MISSILE_TURN_RATE, MISSILE_DRAG
};

state.mslVisOffset = new THREE.Vector3(0.0, 0.0, 0.0);
state.initialPositions = {
    red: { pos: new THREE.Vector3(10, 25, -30), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)) },
    blue: { pos: new THREE.Vector3(10, 25, 70), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)) }
};

state.teams = {
    red: { id: 'red', type: 'mig21', colorMain: '#ff0055', wrapper: null, hp: MAX_HP, isDestroyed: false, ap: 120, speed: 120, heat: 0, flameout: false, throttle: 4, chain: [], stalled: false, gLimiterOn: true, weapon: 'gun', wpnQueued: false, flareAmmo: CONFIG.weapons['flare'].maxAmmo, flaresArmed: false, ready: false, pendingPitch: 0, pendingYaw: 0, pendingRoll: 0, pathPoints: [], pathQuats: [], flightCurve: null, pylons: null, activeMissiles: [] },
    blue: { id: 'blue', type: 'mig21', colorMain: '#00bcd4', wrapper: null, hp: MAX_HP, isDestroyed: false, ap: 120, speed: 120, heat: 0, flameout: false, throttle: 4, chain: [], stalled: false, gLimiterOn: true, weapon: 'gun', wpnQueued: false, flareAmmo: CONFIG.weapons['flare'].maxAmmo, flaresArmed: false, ready: false, pendingPitch: 0, pendingYaw: 0, pendingRoll: 0, pathPoints: [], pathQuats: [], flightCurve: null, pylons: null, activeMissiles: [] }
};

state.activeTeamId = 'red';
GameContext.view.trajectoryMeshes = state.trajectoryMeshes;
GameContext.view.pastTrajectories = state.pastTrajectories;

['red', 'blue'].forEach(id => {
    const team = state.teams[id];

    Object.defineProperty(team, 'wrapper', {
        configurable: true,
        enumerable: false,
        get() { return GameContext.getTeamView(id).wrapper; },
        set(wrapper) { GameContext.registerTeamWrapper(id, wrapper); }
    });

    Object.defineProperty(team, 'userData', {
        configurable: true,
        enumerable: false,
        get() { return GameContext.getTeamUserData(id); },
        set(value) { GameContext.getTeamView(id).userData = value || {}; }
    });

    Object.defineProperty(team, 'realBeam', {
        configurable: true,
        enumerable: false,
        get() { return GameContext.getTeamView(id).realBeam; },
        set(value) { GameContext.getTeamView(id).realBeam = value; }
    });
});

// ---------------------------------------------------------------------------
// @deprecated Phase 1 相容別名 — 新程式碼請用 GameContext.state.*
// ---------------------------------------------------------------------------
let battleLog = state.battleLog;
let globalFlares = state.globalFlares;
let globalBullets = state.globalBullets;

let initialPositions = state.initialPositions;
let teams = state.teams;
let pastTrajectories = state.pastTrajectories;
let trajectoryMeshes = state.trajectoryMeshes;

Object.defineProperty(window, 'missileMeshBase', {
    configurable: true,
    enumerable: true,
    get() { return GameContext.state.missileMeshBase; },
    set(v) { GameContext.state.missileMeshBase = v; }
});

Object.defineProperty(window, 'tAct', {
    configurable: true,
    enumerable: true,
    get() { return GameContext.state.activeTeamId; },
    set(v) { GameContext.state.activeTeamId = v; }
});

Object.defineProperty(window, 'P', {
    configurable: true,
    enumerable: true,
    get() { return GameContext.getActiveTeam(); },
    set() { /* derived; use GameContext.setActiveTeamId */ }
});

Object.defineProperty(window, 'isAnimating', {
    configurable: true,
    enumerable: true,
    get() { return GameContext.state.isAnimating; },
    set(v) { GameContext.state.isAnimating = !!v; }
});

Object.defineProperty(window, 'animProgress', {
    configurable: true,
    enumerable: true,
    get() { return GameContext.state.animProgress; },
    set(v) { GameContext.state.animProgress = v; }
});

Object.defineProperty(window, 'currentTurn', {
    configurable: true,
    enumerable: true,
    get() { return GameContext.state.currentTurn; },
    set(v) { GameContext.state.currentTurn = v; }
});

Object.defineProperty(window, 'replayMode', {
    configurable: true,
    enumerable: true,
    get() { return GameContext.state.replayMode; },
    set(v) { GameContext.state.replayMode = !!v; }
});

Object.defineProperty(window, 'activeTeamId', {
    configurable: true,
    enumerable: true,
    get() { return GameContext.state.activeTeamId; },
    set(v) { GameContext.state.activeTeamId = v; }
});

Object.defineProperty(window, 'mslVisOffset', {
    configurable: true,
    enumerable: true,
    get() { return GameContext.state.mslVisOffset; },
    set(v) { GameContext.state.mslVisOffset = v; }
});

// ============================================================================
// StateMachine — 唯一建議的狀態寫入閘口 (Phase 2 將擴充 API)
// ============================================================================
GameContext.stateMachine = {
    getTeamOrNull(teamId) {
        return GameContext.getTeam(teamId) || null;
    },

    applyDamage(teamId, amount) {
        const t = GameContext.getTeam(teamId);
        if (!t || t.isDestroyed) return false;
        t.hp = Math.max(0, t.hp - amount);
        if (t.hp <= 0) {
            t.hp = 0;
            t.isDestroyed = true;
            console.log(`💀 [系統結算] ${teamId.toUpperCase()} 小隊戰機已墜毀！`);
        }
        return t.isDestroyed;
    },

    updateHeat(teamId, delta) {
        const t = GameContext.getTeam(teamId);
        if (!t) return;
        const maxH = MAX_HEAT;
        const throttle = t.throttle || 4;

        if (t.flameout === undefined) t.flameout = false;

        if (t.flameout) {
            t.heat = Math.max(0, (t.heat || 0) - 15);
            if (t.heat < 40) {
                t.flameout = false;
                console.log(`❄️ [系統提示] ${teamId.toUpperCase()} 引擎冷卻完成，重新點火！`);
            }
        } else if (delta !== undefined) {
            t.heat = Math.max(0, Math.min(maxH, (t.heat || 0) + delta));
        } else {
            if (throttle === 5) t.heat = (t.heat || 0) + 22;
            else if (throttle === 4) t.heat = Math.max(0, (t.heat || 0) - 2);
            else if (throttle === 3) t.heat = Math.max(0, (t.heat || 0) - 6);
            else if (throttle === 2) t.heat = Math.max(0, (t.heat || 0) - 12);
            else if (throttle === 1) t.heat = Math.max(0, (t.heat || 0) - 18);

            if (t.heat >= maxH) {
                t.flameout = true;
                t.throttle = 2;
                console.log(`🔥 [警報] ${teamId.toUpperCase()} 引擎過熱 (FLAMEOUT)！強制關機保護！`);
            }
        }
    },

    updateAP(teamId, rawSpeed, thrustBonus) {
        const t = GameContext.getTeam(teamId);
        if (!t) return;
        const stallAP = CONFIG.rules.stallSpeedAP || 45;
        const minH = CONFIG.rules.minFlightHeight || 0.5;

        const actualThrust = thrustBonus || 35;
        let newAP = rawSpeed + (actualThrust * 0.25);
        newAP = Math.min(MAX_AP, newAP);

        t.speed = newAP;
        t.ap = Math.floor(newAP);

        if (t.wrapper) {
            t.stalled = (t.ap < stallAP || t.wrapper.position.y < minH);
            if (t.stalled) {
                console.log(`⚠ [警報] ${teamId.toUpperCase()} 戰機空速不足 (${t.ap}m/s)，進入氣動失速！`);
            }
        }
    },

    setThrottle(teamId, level) {
        const t = this.getTeamOrNull(teamId);
        if (!t || t.isDestroyed || GameContext.isAnimating() || t.ready) return false;
        const nextLevel = Math.max(1, Math.min(5, Math.round(level)));
        if (nextLevel === 5 && t.heat > 40) return false;
        t.throttle = nextLevel;
        return true;
    },

    setWeaponMode(teamId, weapon) {
        const t = this.getTeamOrNull(teamId);
        if (!t || t.isDestroyed || GameContext.isAnimating() || GameContext.isReplayMode() || t.ready) return false;
        t.weapon = weapon === 'missile' ? 'missile' : 'gun';
        this.clearQueuedAction(teamId);
        return true;
    },

    toggleWeaponMode(teamId) {
        const t = this.getTeamOrNull(teamId);
        if (!t) return null;
        const nextWeapon = t.weapon === 'gun' ? 'missile' : 'gun';
        return this.setWeaponMode(teamId, nextWeapon) ? nextWeapon : null;
    },

    clearQueuedAction(teamId) {
        const t = this.getTeamOrNull(teamId);
        if (!t) return false;
        t.wpnQueued = false;
        t.queuedAction = 'none';
        if (t.flaresArmed) t.flaresArmed = false;
        return true;
    },

    queueAction(teamId, action) {
        const t = this.getTeamOrNull(teamId);
        if (!t || t.isDestroyed || GameContext.isAnimating() || GameContext.isReplayMode() || t.ready) return false;
        if (action === 'none') return this.clearQueuedAction(teamId);
        t.wpnQueued = action === 'gun' || action === 'missile';
        t.queuedAction = action;
        t.flaresArmed = action === 'flare';
        return true;
    },

    toggleGunQueue(teamId) {
        const t = this.getTeamOrNull(teamId);
        if (!t || t.weapon !== 'gun') return false;
        if (t.wpnQueued && t.queuedAction === 'gun') return this.clearQueuedAction(teamId);
        return this.queueAction(teamId, 'gun');
    },

    toggleMissileQueue(teamId) {
        const t = this.getTeamOrNull(teamId);
        if (!t || t.weapon !== 'missile' || !t.pylons) return false;
        const armedCount = t.pylons.filter(item => item.state === 'armed').length;
        if (armedCount <= 0) {
            this.clearQueuedAction(teamId);
            return false;
        }
        if (t.wpnQueued && t.queuedAction === 'missile') return this.clearQueuedAction(teamId);
        return this.queueAction(teamId, 'missile');
    },

    toggleFlares(teamId) {
        const t = this.getTeamOrNull(teamId);
        if (!t || t.isDestroyed || GameContext.isAnimating() || t.ready || t.flareAmmo <= 0) return false;
        if (t.flaresArmed) {
            t.flaresArmed = false;
            t.queuedAction = 'none';
            return true;
        }
        t.flaresArmed = true;
        t.wpnQueued = false;
        t.queuedAction = 'flare';
        return true;
    },

    togglePylonPower(teamId, pylonId) {
        const t = this.getTeamOrNull(teamId);
        if (!t || !t.pylons || t.isDestroyed || GameContext.isAnimating() || GameContext.isReplayMode() || t.ready) return null;
        const p = t.pylons.find(item => item.id === pylonId);
        if (!p || p.state === 'empty') return null;
        if (p.state === 'standby') {
            p.state = 'powering';
        } else if (p.state === 'powering' || p.state === 'armed') {
            p.state = 'standby';
            if (!t.pylons.some(item => item.state === 'armed')) this.clearQueuedAction(teamId);
        }
        return p.state;
    },

    setReady(teamId, ready) {
        const t = this.getTeamOrNull(teamId);
        if (!t || GameContext.isAnimating() || GameContext.isReplayMode() || t.isDestroyed) return false;
        t.ready = !!ready;
        if (t.ready) this.resetPilotInput(teamId);
        return true;
    },

    toggleReady(teamId) {
        const t = this.getTeamOrNull(teamId);
        if (!t) return false;
        return this.setReady(teamId, !t.ready);
    },

    resetPilotInput(teamId) {
        const t = this.getTeamOrNull(teamId);
        if (!t) return false;
        t.joyX = 0;
        t.joyY = 0;
        t.roll = 0;
        t.pendingRoll = 0;
        t.pendingYaw = 0;
        t.pendingPitch = 0;
        return true;
    },

    setRollInput(teamId, roll) {
        const t = this.getTeamOrNull(teamId);
        if (!t || t.isDestroyed || GameContext.isAnimating() || t.ready) return false;
        let nextRoll = roll;
        if (t.gLimiterOn) {
            const maxRollLimit = Math.PI / 4;
            nextRoll = Math.max(-maxRollLimit, Math.min(maxRollLimit, nextRoll));
        }
        t.pendingRoll = nextRoll;
        return true;
    },

    setJoystickInput(teamId, joyX, joyY) {
        const t = this.getTeamOrNull(teamId);
        if (!t || t.isDestroyed || GameContext.isAnimating() || t.ready) return false;
        t.joyX = joyX;
        t.joyY = joyY;
        t.pendingRoll = 0;
        t.roll = joyX * (Math.PI / 4);
        return true;
    },

    setGlobalFlares(flares) {
        GameContext.state.globalFlares.length = 0;
        GameContext.state.globalFlares.push(...flares);
        return true;
    },

    pruneActiveMissiles(teamId) {
        const t = this.getTeamOrNull(teamId);
        if (!t || !t.activeMissiles) return false;
        t.activeMissiles = t.activeMissiles.filter(m => !m.exploded && m.ap > 0);
        return true;
    },

    markDestroyedFlightState(teamId) {
        const t = this.getTeamOrNull(teamId);
        if (!t) return false;
        t.ap = 0;
        t.throttle = 1;
        t.ready = true;
        return true;
    },

    setPostTurnPose(teamId, finalPos, finalQuat) {
        const t = this.getTeamOrNull(teamId);
        if (!t || !t.wrapper) return false;
        t.wrapper.position.copy(finalPos);
        t.wrapper.quaternion.copy(finalQuat);
        t.wrapper.userData.logicalQuat = finalQuat.clone();
        t.startPos = finalPos.clone();
        t.startQuat = finalQuat.clone();
        return true;
    },

    resetPlanningChain(teamId) {
        const t = this.getTeamOrNull(teamId);
        if (!t) return false;
        t.chain = [{ yaw: 0, pitch: 0, roll: 0, throttle: t.throttle || 2, fire: 'none' }];
        return true;
    },

    commitTurn(log) {
        GameContext.state.battleLog.push(log);
        return GameContext.state.battleLog.length;
    },

    advanceTurn() {
        GameContext.state.currentTurn += 1;
        return GameContext.state.currentTurn;
    },

    resetTurnStatus(teamId) {
        const t = GameContext.getTeam(teamId);
        if (!t) return;
        t.ready = false;
        t.wpnQueued = false;
        t.queuedAction = 'none';

        if (t.pylons && typeof scene !== 'undefined') {
            t.pylons.forEach(p => {
                p.hasBoomedThisTurn = false;
                if (p.flyingMesh) { scene.remove(p.flyingMesh); p.flyingMesh = null; }
                if (p.boomMesh) {
                    scene.remove(p.boomMesh);
                    if (p.boomMesh.geometry) p.boomMesh.geometry.dispose();
                    if (p.boomMesh.material) p.boomMesh.material.dispose();
                    p.boomMesh = null;
                }
                if (p.state === 'powering') p.state = 'armed';
                if (p.mesh) p.mesh.visible = (p.state !== 'empty');
            });
        }
    }
};

/** @deprecated 使用 GameContext.stateMachine */
window.StateMachine = GameContext.stateMachine;
