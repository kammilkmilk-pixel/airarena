// ============================================================================
// context.js - 單一應用上下文 (Phase 1: 收斂全局狀態與服務註冊)
// ============================================================================
//
// 依賴方向: config → context → globals/logic → view → game
// 新程式碼請使用 GameContext，勿再新增 window.* 出口。

window.GameContext = {
    config: typeof CONFIG !== 'undefined' ? CONFIG : null,

    /** @type {Record<string, number|string|boolean>} */
    constants: {},

    state: {
        battleLog: [],
        globalFlares: [],
        globalBullets: [],
        missileMeshBase: null,
        initialPositions: null,
        teams: null,
        activeTeamId: 'red',
        currentTurn: 1,
        isAnimating: false,
        animProgress: 0,
        pastTrajectories: [],
        trajectoryMeshes: { red: null, blue: null },
        replayMode: false,
        mslVisOffset: null,
        virtualReplayTime: undefined,
        lastReplayTime: undefined
    },
    services: {},

    view: {
        teams: {
            red: { wrapper: null, userData: {}, realBeam: null, gunPreview: null, pylonViews: {} },
            blue: { wrapper: null, userData: {}, realBeam: null, gunPreview: null, pylonViews: {} }
        },
        trajectoryMeshes: null,
        pastTrajectories: null
    },

    /** 由 render.js 注入: { scene, camera, renderer, controls, ... } */
    three: null,

    /** 由 globals.js 注入 */
    stateMachine: null,

    registerService(name, fn) {
        if (typeof fn !== 'function') {
            console.warn(`[GameContext] registerService("${name}") 需要 function`);
            return;
        }
        this.services[name] = fn;
    },

    callService(name, ...args) {
        const fn = this.services[name];
        if (typeof fn !== 'function') return undefined;
        return fn(...args);
    },

    getActiveTeamId() {
        return this.state.activeTeamId;
    },

    setActiveTeamId(id) {
        if (!this.state.teams || !this.state.teams[id]) return;
        this.state.activeTeamId = id;
    },

    getActiveTeam() {
        return this.state.teams ? this.state.teams[this.state.activeTeamId] : null;
    },

    getTeam(id) {
        return this.state.teams ? this.state.teams[id] : null;
    },

    getTeamView(id) {
        if (!this.view.teams[id]) {
            this.view.teams[id] = { wrapper: null, userData: {}, realBeam: null, gunPreview: null, pylonViews: {} };
        }
        return this.view.teams[id];
    },

    registerTeamWrapper(id, wrapper) {
        const view = this.getTeamView(id);
        view.wrapper = wrapper;
        return wrapper;
    },

    getTeamWrapper(id) {
        return this.getTeamView(id).wrapper;
    },

    getTeamUserData(id) {
        return this.getTeamView(id).userData;
    },

    getPylonView(teamId, pylonId) {
        const teamView = this.getTeamView(teamId);
        if (!teamView.pylonViews[pylonId]) {
            teamView.pylonViews[pylonId] = {};
        }
        return teamView.pylonViews[pylonId];
    },

    bindPylonView(teamId, pylonState, initialView = {}) {
        const pylonView = this.getPylonView(teamId, pylonState.id);
        Object.assign(pylonView, initialView);

        ['mesh', 'lineMesh', 'flyingMesh', 'boomMesh', 'trailMesh', 'flyingGlowMesh'].forEach(prop => {
            if (Object.prototype.hasOwnProperty.call(pylonState, prop)) delete pylonState[prop];
            Object.defineProperty(pylonState, prop, {
                configurable: true,
                enumerable: false,
                get() { return pylonView[prop] || null; },
                set(value) { pylonView[prop] = value; }
            });
        });

        return pylonState;
    },

    getSerializableTeamState(id) {
        const team = this.getTeam(id);
        if (!team) return null;
        const wrapper = this.getTeamWrapper(id);
        const position = wrapper ? wrapper.position : null;
        const forward = wrapper ? new THREE.Vector3(0, 0, 1).applyQuaternion(wrapper.quaternion).normalize() : null;

        return {
            id: team.id,
            type: team.type,
            position: position ? { x: position.x, y: position.y, z: position.z } : null,
            forward: forward ? { x: forward.x, y: forward.y, z: forward.z } : null,
            hp: team.hp,
            isDestroyed: team.isDestroyed,
            ap: team.ap,
            speed: team.speed,
            heat: team.heat,
            flameout: team.flameout,
            throttle: team.throttle,
            stalled: team.stalled,
            gLimiterOn: team.gLimiterOn,
            weapon: team.weapon,
            wpnQueued: team.wpnQueued,
            queuedAction: team.queuedAction || 'none',
            flareAmmo: team.flareAmmo,
            flaresArmed: team.flaresArmed,
            ready: team.ready,
            aiEnabled: !!team.aiEnabled,
            aiState: team.aiState || 'player',
            aiStatusText: team.aiStatusText || 'PLAYER CONTROL',
            pendingPitch: team.pendingPitch,
            pendingYaw: team.pendingYaw,
            pendingRoll: team.pendingRoll,
            joyX: team.joyX || 0,
            joyY: team.joyY || 0,
            roll: team.roll || 0,
            pylons: (team.pylons || []).map(p => ({
                id: p.id,
                weaponType: p.weaponType,
                state: p.state
            })),
            activeMissiles: (team.activeMissiles || []).map(m => ({
                pylonId: m.pylonId,
                active: m.active,
                exploded: m.exploded,
                ap: m.ap
            }))
        };
    },

    getSerializableBattleState() {
        return {
            activeTeamId: this.state.activeTeamId,
            currentTurn: this.state.currentTurn,
            isAnimating: this.state.isAnimating,
            replayMode: this.state.replayMode,
            teams: {
                red: this.getSerializableTeamState('red'),
                blue: this.getSerializableTeamState('blue')
            }
        };
    },

    isReplayMode() {
        return !!this.state.replayMode;
    },

    setReplayMode(value) {
        this.state.replayMode = !!value;
    },

    isAnimating() {
        return !!this.state.isAnimating;
    },

    setAnimating(value) {
        this.state.isAnimating = !!value;
    }
};

/** @deprecated 使用 GameContext */
const ctx = () => GameContext;
