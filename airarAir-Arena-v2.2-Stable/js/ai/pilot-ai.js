// ============================================================================
// pilot-ai.js - MVP NPC Pilot (FSM + lightweight utility)
// ============================================================================

window.AirArenaAI = {
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    },

    toVector3(raw) {
        return raw ? new THREE.Vector3(raw.x, raw.y, raw.z) : new THREE.Vector3();
    },

    getEnemyId(teamId) {
        return teamId === 'red' ? 'blue' : 'red';
    },

    decide(teamId, battleState = GameContext.getSerializableBattleState()) {
        const self = battleState.teams[teamId];
        const enemyId = this.getEnemyId(teamId);
        const enemy = battleState.teams[enemyId];

        if (!self || !enemy || self.isDestroyed || enemy.isDestroyed || !self.position || !enemy.position) {
            return {
                state: 'idle',
                statusText: 'NPC: 無有效目標',
                throttle: 3,
                joyX: 0,
                joyY: 0,
                roll: 0,
                weapon: 'gun',
                queueAction: 'none',
                ready: true,
                reason: 'No valid target'
            };
        }

        const selfPos = this.toVector3(self.position);
        const enemyPos = this.toVector3(enemy.position);
        const selfForward = this.toVector3(self.forward).normalize();
        const toEnemy = enemyPos.clone().sub(selfPos);
        const distance = toEnemy.length();
        const toEnemyNorm = toEnemy.clone().normalize();
        const angleToTarget = selfForward.angleTo(toEnemyNorm);
        const altitude = selfPos.y;
        const targetAbove = enemyPos.y - selfPos.y;

        const horizontalBias = this.clamp(toEnemyNorm.x * 1.4, -1, 1);
        const verticalBias = this.clamp(-targetAbove / 28, -0.75, 0.75);
        const roll = this.clamp(horizontalBias * 0.45, -Math.PI / 4, Math.PI / 4);

        if (self.ap < 65 || self.stalled || altitude < 5) {
            return {
                state: 'recover',
                statusText: `NPC: 能量恢復 AP ${Math.floor(self.ap)}`,
                throttle: self.heat > 75 ? 3 : 5,
                joyX: this.clamp(horizontalBias * 0.35, -0.45, 0.45),
                joyY: altitude < 8 ? -0.55 : 0.35,
                roll,
                weapon: 'gun',
                queueAction: 'none',
                ready: true,
                reason: 'Recover speed/altitude'
            };
        }

        if (self.heat > 82) {
            return {
                state: 'cooldown',
                statusText: `NPC: 降溫 ${Math.floor(self.heat)}°C`,
                throttle: 2,
                joyX: this.clamp(horizontalBias * 0.5, -0.6, 0.6),
                joyY: verticalBias,
                roll,
                weapon: 'gun',
                queueAction: 'none',
                ready: true,
                reason: 'Cool engine'
            };
        }

        const hasArmedMissile = (self.pylons || []).some(p => p.state === 'armed');
        const hasStandbyMissile = (self.pylons || []).some(p => p.state === 'standby');

        if (distance < 42 && angleToTarget < Math.PI / 7) {
            return {
                state: 'gunAttack',
                statusText: `NPC: 機砲窗口 ${Math.floor(distance)}m`,
                throttle: distance < 18 ? 2 : 4,
                joyX: this.clamp(horizontalBias * 0.45, -0.5, 0.5),
                joyY: verticalBias * 0.5,
                roll,
                weapon: 'gun',
                queueAction: 'gun',
                ready: true,
                reason: 'Gun solution available'
            };
        }

        if (distance < 95 && angleToTarget < Math.PI / 5 && (hasArmedMissile || hasStandbyMissile)) {
            return {
                state: hasArmedMissile ? 'missileAttack' : 'missilePrep',
                statusText: hasArmedMissile ? `NPC: FOX-2 ${Math.floor(distance)}m` : 'NPC: 飛彈通電',
                throttle: self.heat > 65 ? 3 : 4,
                joyX: this.clamp(horizontalBias * 0.5, -0.6, 0.6),
                joyY: verticalBias * 0.45,
                roll,
                weapon: 'missile',
                powerPylons: !hasArmedMissile,
                queueAction: hasArmedMissile ? 'missile' : 'none',
                ready: true,
                reason: hasArmedMissile ? 'Missile shot available' : 'Power pylons'
            };
        }

        return {
            state: 'intercept',
            statusText: `NPC: 轉向攔截 ${Math.floor(distance)}m`,
            throttle: distance > 90 && self.heat < 55 ? 5 : 4,
            joyX: horizontalBias,
            joyY: verticalBias,
            roll,
            weapon: 'gun',
            queueAction: 'none',
            ready: true,
            reason: 'Close distance and align nose'
        };
    },

    run(teamId) {
        const action = this.decide(teamId);
        GameContext.stateMachine.applyPilotAction(teamId, action);
        return action;
    }
};
