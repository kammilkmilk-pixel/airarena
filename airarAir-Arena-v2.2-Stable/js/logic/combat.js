// ============================================================================
// combat.js - 回合結算與狀態機 (終極修復包絡線實體生成版)
// ============================================================================

// ----------------------------------------------------------------------------
// 🛠️ 輔助工具區
// ----------------------------------------------------------------------------
function tryAttachAllPylons() {
    if (!missileMeshBase || !teams.red.wrapper || !teams.blue.wrapper) return;
    ['red', 'blue'].forEach(id => {
        const t = teams[id]; if (t.pylons) return; 
        const acConfig = CONFIG.aircrafts[t.type || 'mig21'];
        t.pylons = acConfig.pylons.map(p => {
            let pMesh = new THREE.Group(); pMesh.add(missileMeshBase.clone());
            pMesh.position.set(p.position[0], p.position[1], p.position[2]); t.wrapper.add(pMesh); 
            const pylonState = { id: p.id, localPosition: new THREE.Vector3(p.position[0], p.position[1], p.position[2]), weaponType: p.weapon, state: 'standby' };
            return GameContext.bindPylonView(id, pylonState, { mesh: pMesh, lineMesh: null });
        });
        t.activeMissiles = [];
    });
}

const genSparks = (count, power) => {
    let vels = [];
    for(let i=0; i<count; i++) {
        let phi = Math.random() * Math.PI * 2; let theta = Math.acos(Math.random() * 2 - 1);
        vels.push(new THREE.Vector3(Math.sin(theta)*Math.cos(phi), Math.sin(theta)*Math.sin(phi), Math.cos(theta)).multiplyScalar(power * (0.8 + Math.random() * 0.4)));
    }
    return vels;
};

// ----------------------------------------------------------------------------
// 🏭 戰鬥管線處理器 (Pipeline Processors)
// ----------------------------------------------------------------------------

function processFlightPaths(ctx) {
    ['red', 'blue'].forEach(id => {
        let t = teams[id]; 
        if (t.wrapper && t.userData && t.userData.gunPreview) t.userData.gunPreview.visible = false; 
        if (t.isDestroyed) return;

        t.wasFlaresArmedThisTurn = t.flaresArmed; 
        if (t.flaresArmed) { t.flareAmmo--; t.flaresArmed = false; } 
        
        let res;
        if (!t.pathPoints || t.pathPoints.length < 2) {
            let fallbackChain = t.chain && t.chain.length > 0 ? t.chain : [{yaw:0, pitch:0, roll:0, throttle:t.throttle}];
            res = simulateFlight(t, fallbackChain); 
            t.pathPoints = res.points; t.pathQuats = res.quats; 
        } else {
            res = simulateFlight(t, t.chain);
        }
        if (t.chain && t.chain.length > 0) t.chain[0].resultingAP = res.finalAP; 

        if (typeof drawTrajectoryLine === 'function') drawTrajectoryLine(t);
        if (trajectoryMeshes[id]) {
            let isCurrentPlayer = (typeof tAct !== 'undefined' && id === tAct) || (id === window.tAct);
            trajectoryMeshes[id].visible = isCurrentPlayer ? true : !!(t.userData && t.userData.showEnvelope);
        }

        t.flightCurve = new THREE.CatmullRomCurve3(t.pathPoints, false, 'catmullrom', 0);
        ctx.log[id] = { pts: [...t.pathPoints], quats: [...t.pathQuats], chain: [...t.chain], wasFlaresArmed: t.wasFlaresArmedThisTurn, damageTaken: 0 };

        let fireDelayCounter = 0; 
        if (t.pylons) {
            t.pylons.forEach(p => {
                let isFiringNow = p.state === 'armed' && t.wpnQueued && t.weapon === 'missile';
                let activeM = t.activeMissiles ? t.activeMissiles.find(m => m.pylonId === p.id) : null;
                
               if (isFiringNow && !activeM) {
                    let launchStep = fireDelayCounter * CONFIG.rules.missileLaunchDelay; 
                    fireDelayCounter++; 
                    let initAP = (typeof MISSILE_MAX_AP !== 'undefined') ? MISSILE_MAX_AP : 150;
                    activeM = { pylonId: p.id, active: false, launchStep: launchStep, ap: initAP, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), exploded: false };
                    t.activeMissiles.push(activeM); p.state = 'empty'; 
                }
                if (activeM && !activeM.exploded) ctx.log[`${id}MslTracks`][p.id] = []; 
            });
        }
    });
}

function processFlares(ctx) {
    let activeTurnFlares = [];
    if (typeof globalFlares !== 'undefined') {
        globalFlares.forEach(gf => { activeTurnFlares.push({ pos: gf.pos.clone(), vel: gf.vel.clone(), age: gf.age, teamId: gf.teamId, startFrame: 0 }); });
    }

    ['red', 'blue'].forEach(id => {
        let t = teams[id];
        if (t.wasFlaresArmedThisTurn && t.flightCurve) {
            let acSpeed = t.flightCurve.getLength() / 100;
            for (let burst = 0; burst < 4; burst++) { 
                let startFrame = burst * 15; 
                let sPos = t.flightCurve.getPointAt(startFrame / 100);
                let sQuat = getQuatAt(startFrame / 100, t.pathQuats);
                let vel = new THREE.Vector3((Math.random()-0.5)*0.12, -0.01, acSpeed + 0.01 + Math.random()*0.02).applyQuaternion(sQuat);
                activeTurnFlares.push({ pos: sPos.clone(), vel: vel, age: 0, teamId: id, startFrame: startFrame });
            }
        }
    });

    activeTurnFlares.forEach(f => {
        let currentPos = f.pos.clone(); let currentVel = f.vel.clone();
        let stages = CONFIG.weapons['flare'].stages || [{heat:500},{heat:150},{heat:0}];
        let heatVal = stages[f.age] ? stages[f.age].heat : 0;

        let totalSteps = CONFIG.rules.stepsPerTurn;
        for(let step = 0; step <= totalSteps; step++) { 
            if (step >= f.startFrame) {
                currentPos.add(currentVel); currentVel.multiplyScalar(0.96); currentVel.y -= 0.0005;           
                ctx.flares[step].push({ pos: currentPos.clone(), heat: heatVal, age: f.age, teamId: f.teamId, vel: currentVel.clone() });
            }
        }
    });
    ctx.log.flaresTrack = ctx.flares;
}

function resolveGunsForStep(step, ratio, ctx) {
    ['red', 'blue'].forEach(id => {
        let t = teams[id]; let enemy = id === 'red' ? teams.blue : teams.red;
        if (t.isDestroyed || enemy.isDestroyed || ctx.death[id] !== -1) return;

        if (t.chain && t.chain.length > 0 && t.chain[0].fire === 'gun') {
            let stats = CONFIG.aircrafts[t.type || 'mig21'].throttleStats[t.throttle || 2] || { gunAngleMult: 1.0, gunRangeMult: 1.0 };
            let dRange = (typeof GUN_RANGE !== 'undefined' ? GUN_RANGE : 35) * stats.gunRangeMult;
            let dAngle = (typeof GUN_ANGLE !== 'undefined' ? GUN_ANGLE : Math.PI/12) * stats.gunAngleMult;

            let p1 = getPosAt(ratio, t.pathPoints); let p2 = getPosAt(ratio, enemy.pathPoints);
            let q1 = getQuatAt(ratio, t.pathQuats); 
            
            let el = CONFIG.weapons['gun'].elevation || 0;
            let fwd = new THREE.Vector3(0, Math.sin(el), Math.cos(el)).applyQuaternion(q1).normalize();

            // 生成砲口火光
            if (step % 2 === 0) {
                let gunPorts = CONFIG.aircrafts[t.type || 'mig21'].guns || [{ id: 1, position: [0, -0.05, 1.2] }];
                gunPorts.forEach(gun => {
                    let gunPos = p1.clone().add(new THREE.Vector3(gun.position[0], gun.position[1], gun.position[2]).applyQuaternion(q1));
                    ctx.log.vfxTriggers.push({ type: 'flash', step: step, pos: gunPos.clone(), fwd: fwd.clone(), rot: Math.random() * Math.PI * 2 });
                    if (step % 8 === 0) {
                        let puffPos = gunPos.clone().add(new THREE.Vector3((Math.random()-0.5)*0.2, (Math.random()-0.5)*0.2, 0).applyQuaternion(q1));
                        ctx.log.vfxTriggers.push({ type: 'puff', step: step, pos: puffPos, rot: Math.random() * Math.PI * 2, scale: 0.4, opacity: 0.3 });
                    }
                });
            }
            
            // Raycaster 機砲射線掃描城市模型
            let gunMuzzlePos = p1.clone().add(new THREE.Vector3(0, -0.12, 0.45).applyQuaternion(q1));
            let isGunBlockedByBuilding = false;
            let blockPoint = new THREE.Vector3();
            let distToBlock = 99999;

            if (typeof obstacles !== 'undefined' && obstacles.length > 0) {
                let raycaster = new THREE.Raycaster(gunMuzzlePos, fwd);
                let hits = raycaster.intersectObjects(obstacles, false); 
                if (hits.length > 0) {
                    isGunBlockedByBuilding = true;
                    distToBlock = hits[0].distance;
                    blockPoint.copy(hits[0].point);
                }
            }

            // 機砲打中大廈牆面的火花特效
            if (isGunBlockedByBuilding && distToBlock <= dRange) {
                if (step % 4 === 0) {
                    ctx.log.vfxTriggers.push({ type: 'puff', step: step, pos: blockPoint, rot: Math.random()*Math.PI*2, scale: 0.6, opacity: 0.5 });
                    ctx.log.vfxTriggers.push({ type: 'spark_explosion', step: step, pos: blockPoint, velocities: genSparks(6, 0.3), wind: new THREE.Vector3() });
                }
            }

            // 判斷是否打中敵機
            let vecToEnemy = new THREE.Vector3().subVectors(p2, p1);
            let forwardDist = vecToEnemy.dot(fwd);

            if (forwardDist > 0 && forwardDist <= dRange) {
                let muzzleSpeed = dRange * 2.0; 
                let timeSinceSpawn = forwardDist / muzzleSpeed;
                let expectedBulletPos = p1.clone().add(fwd.clone().multiplyScalar(forwardDist));
                
                let gunGravMult = CONFIG.weapons['gun'].gravityMult !== undefined ? CONFIG.weapons['gun'].gravityMult : 1.0;
                expectedBulletPos.y -= 0.5 * (CONFIG.rules.gravity * gunGravMult) * (timeSinceSpawn * timeSinceSpawn); 
                
                if (expectedBulletPos.distanceTo(p2) <= forwardDist * Math.tan(dAngle)) {
                    // 安全判定：只有敵機在障礙物前面才會扣血
                    if (!isGunBlockedByBuilding || forwardDist < distToBlock) {
                        ctx.hp[enemy.id] -= (GUN_DAMAGE / 100);
                        ctx.log[enemy.id].damageTaken += (GUN_DAMAGE / 100);
                        
                        if (step % 3 === 0) {
                            let hitPos = p2.clone().add(vecToEnemy.clone().normalize().multiplyScalar(-1.5)).add(new THREE.Vector3((Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5)));
                            ctx.log.vfxTriggers.push({ type: 'spark_explosion', step: step, pos: hitPos, velocities: genSparks(12, 0.45), wind: fwd.clone().multiplyScalar(-0.005) });
                            ctx.log.vfxTriggers.push({ type: 'flash', step: step, pos: hitPos, rot: Math.random()*Math.PI*2, scale: 0.8 });
                            ctx.log.vfxTriggers.push({ type: 'puff', step: step, pos: hitPos, rot: Math.random()*Math.PI*2, scale: 0.8, opacity: 0.9, drift: fwd.clone().multiplyScalar(-0.02) });
                        }
                    }
                }
            }
        }
    });
}

function resolveMissilesForStep(step, ratio, ctx) {
    let cFlares = ctx.flares[step] || [];
    ['red', 'blue'].forEach(id => {
        let t = teams[id]; let enemy = id === 'red' ? teams.blue : teams.red;
        if (t.isDestroyed || !t.activeMissiles) return;
        
        t.activeMissiles.forEach(activeM => {
            if (activeM.exploded || activeM.ap <= 0) return; 
            
            if (!activeM.active) {
                if (step < activeM.launchStep) { ctx.log[`${id}MslTracks`][activeM.pylonId].push(null); return; }
                if (step === activeM.launchStep) {
                    activeM.active = true; 
                    let acPos = getPosAt(ratio, t.pathPoints); let acQuat = getQuatAt(ratio, t.pathQuats);
                    let pylonConfig = t.pylons.find(p => p.id === activeM.pylonId);
                    activeM.pos.copy(acPos).add(pylonConfig.localPosition.clone().add(new THREE.Vector3(0, -0.05, 0.2)).applyQuaternion(acQuat));
                    activeM.quat.copy(acQuat);
                    ctx.log[`${id}MslTracks`][activeM.pylonId].push({ pos: activeM.pos.clone(), quat: activeM.quat.clone() });
                    return; 
                }
            }

            let oldPos = activeM.pos.clone();
            let targetPos = getPosAt(ratio, enemy.pathPoints); let targetQuat = getQuatAt(ratio, enemy.pathQuats);
            let stepRes = simulateMissileStep(activeM.pos, activeM.quat, targetPos, targetQuat, activeM.ap, t, enemy, cFlares, activeM);

            let isMissileCrashedIntoBuilding = false;
            if (typeof obstacles !== 'undefined' && obstacles.length > 0 && stepRes.pos) {
                let moveVec = new THREE.Vector3().subVectors(stepRes.pos, oldPos);
                let dist = moveVec.length();
                if (dist > 0.0001) {
                    let raycaster = new THREE.Raycaster(oldPos, moveVec.normalize());
                    let hits = raycaster.intersectObjects(obstacles, false);
                    if (hits.length > 0 && hits[0].distance <= dist) {
                        isMissileCrashedIntoBuilding = true;
                        stepRes.pos.copy(hits[0].point); 
                    }
                }
            }    

            if (stepRes.pos) activeM.pos.copy(stepRes.pos); 
            if (stepRes.quat) activeM.quat.copy(stepRes.quat); 
            if (stepRes.ap !== undefined) activeM.ap = stepRes.ap;

            if (isMissileCrashedIntoBuilding) {
                stepRes.exploded = true;
                activeM.ap = 0; 
                console.log(`🚀💥 [武器事故] 飛彈在攔截途中撞擊城市建築物，發生劇烈殉爆！`);
            }

            ctx.log[`${id}MslTracks`][activeM.pylonId].push({ pos: activeM.pos.clone(), quat: activeM.quat.clone() });

            if (stepRes.exploded) { 
                activeM.exploded = true; ctx.log[`${id}ExplodedAt`][activeM.pylonId] = step;
                ctx.log[`${id}MslIsSelfDestruct`] = ctx.log[`${id}MslIsSelfDestruct`] || {}; 
                ctx.log[`${id}MslIsSelfDestruct`][activeM.pylonId] = stepRes.lostTarget || stepRes.selfDestructed; 
                
                let mFwd = new THREE.Vector3(0,0,1).applyQuaternion(activeM.quat);
                ctx.log.vfxTriggers.push({ type: 'spark_explosion', step: step, pos: activeM.pos.clone(), velocities: genSparks(80, 0.8), wind: mFwd.clone().multiplyScalar(-0.005) });
                ctx.log.vfxTriggers.push({ type: 'explosion', step: step, pos: activeM.pos.clone(), rot: Math.random() * Math.PI * 2, scale: 1.2 });
                ctx.log.vfxTriggers.push({ type: 'flash', step: step, pos: activeM.pos.clone(), rot: Math.random() * Math.PI * 2, scale: 1.5 });

                if (!isMissileCrashedIntoBuilding && activeM.pos.distanceTo(targetPos) <= ((CONFIG.weapons['fox2'] && CONFIG.weapons['fox2'].fuseRange) ? CONFIG.weapons['fox2'].fuseRange : 3.5) + 1.5) { 
                    ctx.hp[enemy.id] -= MISSILE_DAMAGE; ctx.log[enemy.id].damageTaken += MISSILE_DAMAGE;
                }
            }
        });
    });
}

function resolveDamageAndDeathForStep(step, ratio, ctx) {
    let pRed = getPosAt(ratio, teams.red.pathPoints);
    let pBlue = getPosAt(ratio, teams.blue.pathPoints);

    if (!teams.red.isDestroyed && !teams.blue.isDestroyed && ctx.death.red === -1 && ctx.death.blue === -1) {
        if (pRed.distanceTo(pBlue) < 1.8) { 
            ['red', 'blue'].forEach(id => { ctx.hp[id] = 0; ctx.death[id] = step; ctx.log[id].damageTaken = 100; });
            ctx.log.vfxTriggers.push({ type: 'explosion', step: step, pos: pRed.clone().add(pBlue).multiplyScalar(0.5), scale: 2.8, rot: Math.random() * Math.PI });
        }
    }

    ['red', 'blue'].forEach(id => {
        let t = teams[id];
        if (t.isDestroyed) return;

        let steps = CONFIG.rules.stepsPerTurn;
        let prevRatio = Math.max(0, ratio - (1/steps));
        let pPrev = getPosAt(prevRatio, t.pathPoints);
        let currentPos = getPosAt(ratio, t.pathPoints);
        let currentQuat = getQuatAt(ratio, t.pathQuats);
        
        let hasCollided = false; let collisionType = "";

        let moveVec = new THREE.Vector3().subVectors(currentPos, pPrev);
        let dist = moveVec.length();

        if (ctx.death[id] === -1 && typeof obstacles !== 'undefined' && obstacles.length > 0 && dist > 0.0001) {
            let raycaster = new THREE.Raycaster(pPrev, moveVec.normalize());
            let hits = raycaster.intersectObjects(obstacles, false);
            if (hits.length > 0 && hits[0].distance <= dist) {
                hasCollided = true; collisionType = "building";
                currentPos.copy(hits[0].point);
            }
        }

        let minH = CONFIG.rules.minFlightHeight || 0.5;
        if (ctx.death[id] === -1 && !hasCollided && currentPos.y <= minH + 0.15) {
            hasCollided = true; collisionType = "ground";
        }

        if (hasCollided && ctx.death[id] === -1) {
            ctx.hp[id] = 0; ctx.death[id] = step; ctx.log[id].damageTaken = 100;
            ctx.log.vfxTriggers.push({ type: 'explosion', step: step, pos: currentPos.clone(), scale: 2.3, rot: Math.random()*Math.PI*2 });
            ctx.log.vfxTriggers.push({ type: 'spark_explosion', step: step, pos: currentPos.clone(), velocities: genSparks(60, 0.7), wind: new THREE.Vector3(0,0,0) });
            ctx.log.vfxTriggers.push({ type: 'flash', step: step, pos: currentPos.clone(), rot: Math.random()*Math.PI*2, scale: 1.5 });
            console.log(`💥 [撞擊事故] ${id.toUpperCase()} 戰機規避失敗，直接撞毀於 ${collisionType === 'building' ? '城市建築' : '地面'}！`);
        }

        if (ctx.death[id] === step || (ctx.death[id] !== -1 && step === ctx.death[id])) {
            let deathRatio = step / CONFIG.rules.stepsPerTurn;
            let simPos = getPosAt(deathRatio, t.pathPoints); let simQuat = getQuatAt(deathRatio, t.pathQuats);

            for (let i = Math.max(0, Math.floor(deathRatio * (t.pathPoints.length - 1))) + 1; i < t.pathPoints.length; i++) {
                simQuat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), 0.16)); 
                simQuat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), -0.07)); 
                let fwd = new THREE.Vector3(0,0,1).applyQuaternion(simQuat);
                simPos.add(fwd.multiplyScalar(0.28)); simPos.y -= 0.42; 
                if (simPos.y < minH) simPos.y = minH; 
                
                t.pathPoints[i] = simPos.clone(); t.pathQuats[i] = simQuat.clone();
                ctx.log[id].pts[i] = simPos.clone(); ctx.log[id].quats[i] = simQuat.clone();
            }
        }
        
        ctx.log.hpTrack[id][step] = Math.max(0, ctx.hp[id]);

        if (ctx.death[id] !== -1 && step >= ctx.death[id]) {
            let deadPos = getPosAt(ratio, t.pathPoints); let deadQuat = getQuatAt(ratio, t.pathQuats);
            let fwd = new THREE.Vector3(0,0,1).applyQuaternion(deadQuat);
            if (step % 2 === 0 && deadPos.y > minH + 0.1) {
                ctx.log.vfxTriggers.push({ type: 'spark_explosion', step: step, pos: deadPos.clone(), velocities: genSparks(8, 0.4), wind: fwd.clone().multiplyScalar(-0.006) });
                ctx.log.vfxTriggers.push({ type: 'puff', step: step, pos: deadPos.clone(), rot: Math.random()*Math.PI*2, scale: 1.8, opacity: 1.0, drift: fwd.clone().multiplyScalar(-0.025) });
                ctx.log.vfxTriggers.push({ type: 'flash', step: step, pos: deadPos.clone().add(new THREE.Vector3((Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5))), rot: Math.random()*Math.PI*2, scale: 0.8 });
            }
        } else if (ctx.hp[id] > 0) {
            let acPos = getPosAt(ratio, t.pathPoints); let acQuat = getQuatAt(ratio, t.pathQuats);
            if (ctx.hp[id] <= 30) {
                if (step % 3 === 0) ctx.log.vfxTriggers.push({ type: 'puff', step: step, pos: acPos.clone(), rot: Math.random()*Math.PI*2, scale: 1.2, opacity: 0.9, drift: new THREE.Vector3(0,0,1).applyQuaternion(acQuat).multiplyScalar(-0.02) });
                if (step % 15 === 0) ctx.log.vfxTriggers.push({ type: 'flash', step: step, pos: acPos.clone(), rot: Math.random()*Math.PI*2, scale: 0.6 });
            } else if (ctx.hp[id] <= 80) {
                if (step % 10 === 0) ctx.log.vfxTriggers.push({ type: 'puff', step: step, pos: acPos.clone(), rot: Math.random()*Math.PI*2, scale: 0.6, opacity: 0.5, drift: new THREE.Vector3(0,0,1).applyQuaternion(acQuat).multiplyScalar(-0.02) });
            }
        }
    });
}

// ----------------------------------------------------------------------------
// 🎬 總指揮官 (Main Execution & Resolution) - Event Bus 廣播版
// ----------------------------------------------------------------------------

function executeTurnSimultaneously() {
    window.dispatchEvent(new CustomEvent('EnginePhaseChanged', { detail: { phase: 'calculating' } }));
    window.ghostWrapper.visible = false; 

    let steps = CONFIG.rules.stepsPerTurn; let arrayLen = steps + 1; 

    let ctx = {
        log: { turn: currentTurn, red: {}, blue: {}, redMslTracks: {}, blueMslTracks: {}, redExplodedAt: {}, blueExplodedAt: {}, flaresTrack: [], vfxTriggers: [], hpTrack: { red: new Array(arrayLen).fill(0), blue: new Array(arrayLen).fill(0) } },
        hp: { red: teams.red.hp, blue: teams.blue.hp },
        death: { red: -1, blue: -1 },
        flares: Array.from({length: arrayLen}, () => [])
    };

    processFlightPaths(ctx);
    processFlares(ctx);

    for (let step = 0; step <= steps; step++) {
        let ratio = step / steps;
        resolveGunsForStep(step, ratio, ctx);
        resolveMissilesForStep(step, ratio, ctx);
        resolveDamageAndDeathForStep(step, ratio, ctx);
    }

    ['red', 'blue'].forEach(id => { 
        let t = teams[id]; // ✅ 加上這行，徹底修復 t 未定義造成的執行崩潰
        GameContext.stateMachine.pruneActiveMissiles(id);
        if (ctx.death[id] !== -1) {
            if (typeof drawTrajectoryLine === 'function') drawTrajectoryLine(t);
            if (trajectoryMeshes[id]) {
                let isCurrentPlayer = (typeof tAct !== 'undefined' && id === tAct) || (id === window.tAct);
                trajectoryMeshes[id].visible = isCurrentPlayer ? true : !!(t.userData && t.userData.showEnvelope);
            }
        }
    });
    
    GameContext.stateMachine.commitTurn(ctx.log);
    window.dispatchEvent(new CustomEvent('EnginePhaseChanged', { detail: { phase: 'playing', maxLog: battleLog.length } }));
    if (GameContext.services.startCombatAnimation) {
        GameContext.callService('startCombatAnimation');
    } else {
        GameContext.setAnimating(true);
        GameContext.state.animProgress = 0;
    }
}

function finishTurnSimultaneously() {
    GameContext.state.animProgress = 0;
    GameContext.setAnimating(false);
    try {
        let lastLog = battleLog[battleLog.length-1];
        let finalFlares = (lastLog && lastLog.flaresTrack && lastLog.flaresTrack[CONFIG.rules.stepsPerTurn]) ? lastLog.flaresTrack[CONFIG.rules.stepsPerTurn] : [];
        GameContext.stateMachine.setGlobalFlares(finalFlares.filter(f => f.age < 2 && f.teamId).map(f => ({ pos: f.pos.clone(), vel: f.vel ? f.vel.clone() : new THREE.Vector3(0,-0.0005,0), age: f.age + 1, teamId: f.teamId })));

        ['red', 'blue'].forEach(id => {
            let t = teams[id]; if(t.isDestroyed) return;
            if (lastLog[id] && lastLog[id].damageTaken > 0) GameContext.stateMachine.applyDamage(id, lastLog[id].damageTaken);
            
            if (t.isDestroyed) {
                if (trajectoryMeshes[id]) { scene.remove(trajectoryMeshes[id]); trajectoryMeshes[id] = null; }
                GameContext.stateMachine.markDestroyedFlightState(id);
                return; 
            }
            
            const finalPos = t.flightCurve.getPointAt(1.0); const finalQuat = getQuatAt(1.0, t.pathQuats);
            GameContext.stateMachine.setPostTurnPose(id, finalPos, finalQuat);

            let finalStepAP = (t.chain && t.chain.length > 0 && typeof t.chain[0].resultingAP === 'number' && !isNaN(t.chain[0].resultingAP)) ? t.chain[0].resultingAP : simulateFlight(t, t.chain && t.chain.length > 0 ? t.chain : [{yaw:0, pitch:0, roll:0, throttle:t.throttle}]).finalAP;
            let stats = CONFIG.aircrafts[t.type || 'mig21'].throttleStats[t.throttle] || { thrust: 15, heat: 0 };
            let heatDelta = (t.chain && t.chain.length > 0 && typeof t.chain[0].heatDelta === 'number') ? t.chain[0].heatDelta : stats.heat;
            
            GameContext.stateMachine.updateHeat(id, heatDelta);
            GameContext.stateMachine.updateAP(id, finalStepAP, stats.thrust);
            GameContext.stateMachine.resetPlanningChain(id);
            let freshRes = simulateFlight(t, t.chain); t.pathPoints = freshRes.points; t.pathQuats = freshRes.quats;
            GameContext.stateMachine.resetTurnStatus(id);

            // 1. 先處理舊回合的殘影
            if (trajectoryMeshes[id]) { 
                trajectoryMeshes[id].material = trajectoryMeshes[id].material.clone();
                pastTrajectories.push(trajectoryMeshes[id]); if (pastTrajectories.length > 4) scene.remove(pastTrajectories.shift()); 
                pastTrajectories.forEach((mesh, idx) => { mesh.material.opacity = (pastTrajectories.length - 1 - idx) <= 1 ? 0.35 : 0.12; }); 
                trajectoryMeshes[id] = null; 
            }

            // 2. 🟢 救命神藥：確保新回合一開始，立刻為敵方建立未來網格，否則 HUD 將無實體可操作！
            if (typeof drawTrajectoryLine === 'function') {
                drawTrajectoryLine(t);
                if (trajectoryMeshes[id]) {
                    let isCurrentPlayer = (typeof tAct !== 'undefined' && id === tAct) || (id === window.tAct);
                    trajectoryMeshes[id].visible = isCurrentPlayer ? true : !!(t.userData && t.userData.showEnvelope);
                }
            }
        });
    } catch (error) { console.error("回合結算錯誤：", error); }

    if (teams.red.isDestroyed || teams.blue.isDestroyed) {
        let winner = "DRAW (雙方同歸於盡)";
        if (teams.red.isDestroyed && !teams.blue.isDestroyed) winner = "BLUE TEAM 勝利";
        if (!teams.red.isDestroyed && teams.blue.isDestroyed) winner = "RED TEAM 勝利";
        window.dispatchEvent(new CustomEvent('EnginePhaseChanged', { detail: { phase: 'game_over', winner: winner } }));
        return; 
    }
    
    GameContext.stateMachine.advanceTurn();
    selectTeam('red'); 
    window.dispatchEvent(new CustomEvent('EnginePhaseChanged', { detail: { phase: 'planning', turn: currentTurn } }));
}