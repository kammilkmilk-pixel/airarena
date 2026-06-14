// ============================================================================
// combat.js - 回合結算與狀態機 (終極抗 NaN 感染 + 完美光帶不斷線版)
// ============================================================================

function tryAttachAllPylons() {
    if (!missileMeshBase || !teams.red.wrapper || !teams.blue.wrapper) return;
    ['red', 'blue'].forEach(id => {
        const t = teams[id]; if (t.pylons) return; 
        const acConfig = CONFIG.aircrafts[t.type || 'mig21'];
        t.pylons = acConfig.pylons.map(p => {
            let pMesh = new THREE.Group(); pMesh.add(missileMeshBase.clone());
            pMesh.position.set(p.position[0], p.position[1], p.position[2]); t.wrapper.add(pMesh); 
            return { id: p.id, localPosition: new THREE.Vector3(p.position[0], p.position[1], p.position[2]), weaponType: p.weapon, state: 'standby', mesh: pMesh, lineMesh: null };
        });
        t.activeMissiles = [];
    });
}

function executeTurnSimultaneously() {
    let ls = document.getElementById('combat-lock-screen'); if(ls) ls.style.display = 'block';
    let db = document.getElementById('ui-dashboard'); if(db) { db.style.pointerEvents = 'none'; db.style.opacity = '0.2'; }
    window.ghostWrapper.visible = false; 
    let rSt = document.getElementById('replay-status'); if(rSt) rSt.innerText = "狀態: 運算中";
    
    let logEntry = { turn: currentTurn, red: {}, blue: {}, redMslTracks: {}, blueMslTracks: {}, redExplodedAt: {}, blueExplodedAt: {}, flaresTrack: [] };

    ['red', 'blue'].forEach(id => {
        let t = teams[id]; if(t.wrapper && t.userData && t.userData.gunPreview) t.userData.gunPreview.visible = false; 
        if(t.isDestroyed) return;

        t.wasFlaresArmedThisTurn = t.flaresArmed; if(t.flaresArmed) { t.flareAmmo--; t.flaresArmed = false; } 
        
        let res;
        if (!t.pathPoints || t.pathPoints.length < 2) {
            let fallbackChain = t.chain && t.chain.length > 0 ? t.chain : [{yaw:0, pitch:0, roll:0, throttle:t.throttle}];
            res = simulateFlight(t, fallbackChain); 
            t.pathPoints = res.points; t.pathQuats = res.quats; 
        } else {
            res = simulateFlight(t, t.chain);
        }
        if (t.chain && t.chain.length > 0) {
            t.chain[0].resultingAP = res.finalAP; 
        }

        // 🌟 破案關鍵：強制為雙方（包含被 UI 隱形的敵人）鑄造實體 3D 軌跡，確保結算時有模型可存檔！
        if (typeof drawTrajectoryLine === 'function') drawTrajectoryLine(t);
        // 鑄造完畢後立刻隱形，避免在動畫播放的 1.5 秒內穿幫
        if (trajectoryMeshes[id]) trajectoryMeshes[id].visible = false; 
        if (window.ghostWrapper) window.ghostWrapper.visible = false; // 確保鬼影不殘留

        t.flightCurve = new THREE.CatmullRomCurve3(t.pathPoints, false, 'catmullrom', 0);
        logEntry[id] = { pts: [...t.pathPoints], quats: [...t.pathQuats], chain: [...t.chain], wasFlaresArmed: t.wasFlaresArmedThisTurn };

        if (t.pylons) {
            t.pylons.forEach(p => {
                if (p.lineMesh) { scene.remove(p.lineMesh); p.lineMesh = null; }
                let isFiringNow = p.state === 'armed' && t.wpnQueued && t.weapon === 'missile';
                let activeM = t.activeMissiles ? t.activeMissiles.find(m => m.pylonId === p.id) : null;
                if (isFiringNow && !activeM) {
                    let launchQuat = t.pathQuats[0]; let visualLineOffset = new THREE.Vector3(0, -0.05, 0.2); let worldOffset = p.localPosition.clone().add(visualLineOffset).applyQuaternion(launchQuat); let startPos = t.pathPoints[0].clone().add(worldOffset);
                    let initAP = (typeof MISSILE_MAX_AP !== 'undefined') ? MISSILE_MAX_AP : 150;
                    activeM = { pylonId: p.id, active: true, ap: initAP, pos: startPos, quat: launchQuat.clone(), exploded: false };
                    t.activeMissiles.push(activeM); p.state = 'empty'; 
                }
                if (activeM && activeM.active && !activeM.exploded) { logEntry[`${id}MslTracks`][p.id] = []; }
            });
        }
    });

    let frameFlares = []; for(let i=0; i<=100; i++) frameFlares.push([]);
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

        for(let step = 0; step <= 100; step++) {
            if (step >= f.startFrame) {
                currentPos.add(currentVel);
                currentVel.multiplyScalar(0.96); 
                currentVel.y -= 0.0005;           
                frameFlares[step].push({ pos: currentPos.clone(), heat: heatVal, age: f.age, teamId: f.teamId, vel: currentVel.clone() });
            }
        }
    });
    logEntry.flaresTrack = frameFlares;

    for (let step = 0; step <= 100; step++) {
        let ratio = step / 100; 
        let cFlares = frameFlares[step] || [];
        ['red', 'blue'].forEach(id => {
            let t = teams[id]; let enemy = id === 'red' ? teams.blue : teams.red;
            if (t.isDestroyed || !t.activeMissiles) return;
            t.activeMissiles.forEach(activeM => {
                if (!activeM.active || activeM.exploded || activeM.ap <= 0) return; 
                let eIdx = Math.min(enemy.pathPoints.length - 1, Math.floor(ratio * enemy.pathPoints.length));
                let stepRes = simulateMissileStep(activeM.pos, activeM.quat, enemy.pathPoints[eIdx], enemy.pathQuats[eIdx], activeM.ap, t, enemy, cFlares, activeM);
                activeM.pos.copy(stepRes.pos); activeM.quat.copy(stepRes.quat); activeM.ap = stepRes.ap;
                logEntry[`${id}MslTracks`][activeM.pylonId].push({ pos: activeM.pos.clone(), quat: activeM.quat.clone() });
                if (stepRes.exploded) { 
                    activeM.exploded = true; logEntry[`${id}ExplodedAt`][activeM.pylonId] = step;
                    logEntry[`${id}MslIsSelfDestruct`] = logEntry[`${id}MslIsSelfDestruct`] || {}; logEntry[`${id}MslIsSelfDestruct`][activeM.pylonId] = stepRes.selfDestructed;
                }
            });
        });
    }
    
    ['red', 'blue'].forEach(id => { if (teams[id].activeMissiles) teams[id].activeMissiles = teams[id].activeMissiles.filter(m => !m.exploded && m.ap > 0); });
    
    battleLog.push(logEntry); 
    let sld = document.getElementById('replay-slider'); 
    if(sld) { sld.min = 1; sld.max = battleLog.length + 0.99; sld.step = 0.01; sld.disabled = false; }
    setTimeout(() => { let ls = document.getElementById('combat-lock-screen'); if(ls) ls.style.display = 'none'; isAnimating = true; animProgress = 0; let rs = document.getElementById('replay-status'); if(rs) rs.innerText = "狀態: 播放中"; }, 300);
}

function finishTurnSimultaneously() {
    animProgress = 1.0; isAnimating = false; 
    let rs = document.getElementById('replay-status'); if(rs) rs.innerText = "狀態: 規劃中";
    
    try {
        let lastLog = battleLog[battleLog.length-1];
        let finalFlares = (lastLog && lastLog.flaresTrack && lastLog.flaresTrack[100]) ? lastLog.flaresTrack[100] : [];
        globalFlares = finalFlares.filter(f => f.age < 2 && f.teamId).map(f => ({ pos: f.pos.clone(), vel: f.vel ? f.vel.clone() : new THREE.Vector3(0,-0.0005,0), age: f.age + 1, teamId: f.teamId }));

        let SAFE_MAX_HEAT = (typeof MAX_HEAT !== 'undefined') ? MAX_HEAT : 200;

        ['red', 'blue'].forEach(id => {
            let t = teams[id]; if(t.isDestroyed) return;
            
            const finalPos = t.flightCurve.getPointAt(1.0); const finalQuat = getQuatAt(1.0, t.pathQuats);
            t.wrapper.position.copy(finalPos); t.wrapper.quaternion.copy(finalQuat); t.wrapper.userData.logicalQuat = finalQuat.clone();
            t.startPos = finalPos.clone(); t.startQuat = finalQuat.clone();

            let finalStepAP = 0;
            if (t.chain && t.chain.length > 0 && typeof t.chain[0].resultingAP === 'number' && !isNaN(t.chain[0].resultingAP)) {
                finalStepAP = t.chain[0].resultingAP;
            } else {
                let fallbackChain = t.chain && t.chain.length > 0 ? t.chain : [{yaw:0, pitch:0, roll:0, throttle:t.throttle}];
                let res = simulateFlight(t, fallbackChain);
                finalStepAP = res.finalAP;
            }

            let stats = CONFIG.aircrafts[t.type || 'mig21'].throttleStats[t.throttle] || { thrust: 15, heat: 0 };
            let heatDelta = (t.chain && t.chain.length > 0 && typeof t.chain[0].heatDelta === 'number') ? t.chain[0].heatDelta : stats.heat;
            
            t.heat = Math.max(0, Math.min(SAFE_MAX_HEAT, (t.heat || 0) + heatDelta));
            t.ap = Math.floor(Math.max(0, finalStepAP) * 0.5) + 45 + stats.thrust; 
            t.stalled = (t.ap < 45 || t.wrapper.position.y < 0.5);
            
            // 強制清洗並以「全新起點」重算待命軌跡
            t.chain = [{ yaw: 0, pitch: 0, roll: 0, throttle: t.throttle || 2, fire: 'none' }]; 
            let freshRes = simulateFlight(t, t.chain);
            t.pathPoints = freshRes.points; 
            t.pathQuats = freshRes.quats;
            
            t.ready = false; t.wpnQueued = false; t.queuedAction = 'none'; 

            if (t.pylons) {
                t.pylons.forEach(p => {
                    p.hasBoomedThisTurn = false; 
                    if (p.flyingMesh) { scene.remove(p.flyingMesh); p.flyingMesh = null; }
                    if (p.boomMesh) { scene.remove(p.boomMesh); if (p.boomMesh.geometry) p.boomMesh.geometry.dispose(); if (p.boomMesh.material) p.boomMesh.material.dispose(); p.boomMesh = null; }
                    if (p.state === 'powering') p.state = 'armed';
                    if (p.mesh) p.mesh.visible = (p.state !== 'empty');
                });
            }

            // 🌟 檔案歸檔：剛才強制鑄造的軌跡在這裡重見天日，被收錄進歷史光帶中！
            if (trajectoryMeshes[id]) { 
                trajectoryMeshes[id].visible = true; 
                trajectoryMeshes[id].material = trajectoryMeshes[id].material.clone(); 
                pastTrajectories.push(trajectoryMeshes[id]); 
                if (pastTrajectories.length > 4) scene.remove(pastTrajectories.shift()); 
                pastTrajectories.forEach((mesh, idx) => { mesh.material.opacity = (pastTrajectories.length - 1 - idx) <= 1 ? 0.35 : 0.12; }); 
                trajectoryMeshes[id] = null; 
            }
        });
    } catch (error) { console.error("回合結算錯誤：", error); }

    currentTurn++;
    let ls = document.getElementById('combat-lock-screen'); if(ls) ls.style.display = 'none';
    let db = document.getElementById('ui-dashboard'); if(db) { db.style.pointerEvents = 'auto'; db.style.opacity = '1.0'; }
    selectTeam(tAct); 
    const banner = document.getElementById('phase-banner'); if (banner) { banner.innerHTML = `ROUND ${currentTurn}<br><span style="font-size: 20px; color: #eee; letter-spacing: 4px; text-shadow: 2px 2px 4px #000;">戰術規劃階段</span>`; banner.style.opacity = '1'; setTimeout(() => { banner.style.opacity = '0'; }, 2200); }
}