// ============================================================================
// game.js - UI 橋樑、模型載入、主迴圈與 ACMI 重播系統 (初始變數修復版)
// ============================================================================

const loader = new THREE.GLTFLoader();

function setupModel(gltf, x, z, yRot) {
    const model = gltf.scene; const box = new THREE.Box3().setFromObject(model); const scale = 1.2 / Math.max(box.getSize(new THREE.Vector3()).x, box.getSize(new THREE.Vector3()).y, box.getSize(new THREE.Vector3()).z); model.scale.set(scale, scale, scale); const center = box.getCenter(new THREE.Vector3()); model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    const wrapper = new THREE.Group(); wrapper.add(model); wrapper.position.set(x, 25, z); wrapper.rotation.y = yRot; wrapper.userData.logicalQuat = wrapper.quaternion.clone(); scene.add(wrapper); 
    return wrapper;
}

loader.load('mig21_red.glb', g => { teams.red.wrapper = setupModel(g, 10, -30, 0); checkInit(); });
loader.load('mig21_blue.glb', g => { teams.blue.wrapper = setupModel(g, 10, 70, Math.PI); checkInit(); });
loader.load('fox_two.glb', g => {
    const m = g.scene; m.traverse(c => { if(c.isMesh) c.material = new THREE.MeshBasicMaterial({ color: 0xdddddd }); });
    const b = new THREE.Box3().setFromObject(m); const s = 1.0 / Math.max(b.getSize(new THREE.Vector3()).x, b.getSize(new THREE.Vector3()).y, b.getSize(new THREE.Vector3()).z); 
    m.scale.set(s*MISSILE_SCALE, s*MISSILE_SCALE, s*MISSILE_SCALE); m.rotation.set(MISSILE_ROT_X, MISSILE_ROT_Y, MISSILE_ROT_Z); const c = b.getCenter(new THREE.Vector3()); m.position.set(-c.x*s, -c.y*s, -c.z*s);
    missileMeshBase = m; checkInit();
}, undefined, err => { 
    if (typeof createProceduralMissileMesh === 'function') missileMeshBase = createProceduralMissileMesh(); 
    if(missileMeshBase) missileMeshBase.position.set(0, 0, 0); 
    checkInit(); 
});

window.activeTeamId = tAct; 
function selectTeam(teamId) {
    if (isAnimating || window.replayMode) return; 
    tAct = teamId; P = teams[tAct]; window.activeTeamId = tAct;  
    document.body.className = `theme-${teamId}`;
    zoomToSelf(); if (typeof updateDashboardUI === 'function') updateDashboardUI(P); updateHUD();
}

function zoomToSelf() {
    if(!P.wrapper || P.isDestroyed || window.replayMode) return;
    let backOffset = new THREE.Vector3(0, 3.5, -10).applyQuaternion(P.wrapper.quaternion);
    let targetCamPos = P.wrapper.position.clone().add(backOffset);
    let startTime = performance.now(); let startCamPos = camera.position.clone(); let startTarget = controls.target.clone();
    function doLerp(now) {
        let elapsed = (now - startTime) / 500; if (elapsed > 1) elapsed = 1;
        camera.position.lerpVectors(startCamPos, targetCamPos, elapsed); controls.target.lerpVectors(startTarget, P.wrapper.position, elapsed);
        if (elapsed < 1 && !window.replayMode) requestAnimationFrame(doLerp);
    }
    requestAnimationFrame(doLerp);
}

function checkInit() { 
    if(teams.red.wrapper && teams.blue.wrapper && missileMeshBase) { 
        try {
            initialPositions.red.pos.copy(teams.red.wrapper.position); initialPositions.red.quat.copy(teams.red.wrapper.quaternion); 
            initialPositions.blue.pos.copy(teams.blue.wrapper.position); initialPositions.blue.quat.copy(teams.blue.wrapper.quaternion); 
            teams.red.startPos = teams.red.wrapper.position.clone(); teams.red.startQuat = teams.red.wrapper.quaternion.clone();
            teams.blue.startPos = teams.blue.wrapper.position.clone(); teams.blue.startQuat = teams.blue.wrapper.quaternion.clone();
            if (typeof tryAttachAllPylons === 'function') tryAttachAllPylons(); 

            ['red', 'blue'].forEach(id => {
                let t = teams[id]; 
                
                // 🌟 核心修復：賦予開局初始數值，讓指針有數字可以計算！
                t.ap = 50;   // 開局給予 50 AP
                t.heat = 0;  // 開局引擎冷卻 0°C
                t.hp = 100;  // 滿血
                
                t.chain = [{yaw:0, pitch:0, roll:0, throttle:t.throttle, fire:'none'}];
                let res = simulateFlight(t, t.chain); t.pathPoints = res.points; t.pathQuats = res.quats;
            });
            
            selectTeam('red'); 
        } catch (error) {
            console.error("開機運算發生錯誤：", error);
        } finally {
            setTimeout(() => {
                let startup = document.getElementById('startup-screen');
                if (startup) { startup.style.opacity = '0'; setTimeout(() => startup.style.display = 'none', 1200); }
            }, 1500); 
        }
    } 
}

window.updateTrajectoryPreview = function(teamObj) { updateHUD(); };

function updateHUD() {
    if(!P.wrapper || P.isDestroyed) return;
    if (window.replayMode) { if(window.ghostWrapper) window.ghostWrapper.visible = false; if(threatEnvGroup) threatEnvGroup.visible = false; return; }

    ['red', 'blue'].forEach(id => {
        let t = teams[id];
        if (t.startPos && t.startQuat) { t.wrapper.position.copy(t.startPos); t.wrapper.quaternion.copy(t.startQuat); t.wrapper.userData.logicalQuat.copy(t.startQuat); }
    });

    if (!isAnimating && !window.replayMode) {
        if (typeof window.drawStaticFlares === 'function') window.drawStaticFlares();

        ['red', 'blue'].forEach(id => {
            if (teams[id].pylons) {
                teams[id].pylons.forEach(p => {
                    let activeM = teams[id].activeMissiles ? teams[id].activeMissiles.find(m => m.pylonId === p.id) : null;
                    if (activeM && activeM.active && !activeM.exploded) {
                        if (!p.flyingMesh && missileMeshBase) {
                            p.flyingMesh = new THREE.Group(); let mBody = missileMeshBase.clone(); mBody.traverse(c => { if(c.isMesh) c.visible = true; }); mBody.scale.set(2.5, 2.5, 2.5); p.flyingMesh.add(mBody);
                            let fGlowGeo = new THREE.CylinderGeometry(0.1, 0.4, 2.0, 16); fGlowGeo.rotateX(Math.PI / 2); let fGlowMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }); let flyingGlow = new THREE.Mesh(fGlowGeo, fGlowMat); flyingGlow.position.set(0, -0.5, -1.0); p.flyingMesh.add(flyingGlow); scene.add(p.flyingMesh);
                        }
                        if (p.flyingMesh) { p.flyingMesh.position.copy(activeM.pos); p.flyingMesh.quaternion.copy(activeM.quat); p.flyingMesh.visible = true; }
                    } else { if (p.flyingMesh) p.flyingMesh.visible = false; }
                    if (p.boomMesh) p.boomMesh.visible = false;
                });
            }
        });
    }
    
    const acConfig = CONFIG.aircrafts[P.type || 'mig21']; let stats = acConfig.throttleStats[P.throttle] || { heat: 0 };
    if (P.stalled) { P.chain = [{ yaw: 0, pitch: -(Math.PI / 4), roll: 0, throttle: 3, heatDelta: 38, fire: 'none' }]; } else {
        let currentYaw = P.pendingYaw !== 0 ? P.pendingYaw : (P.joyX !== undefined ? -(P.joyX * acConfig.maxYaw) : 0);
        let currentPitch = P.pendingPitch !== 0 ? P.pendingPitch : (P.joyY !== undefined ? -(P.joyY * acConfig.maxPitch) : 0);
        let currentRoll = P.pendingRoll !== 0 ? P.pendingRoll : (P.roll !== undefined ? P.roll : 0);
        if (P.gLimiterOn) { currentYaw = Math.max(-acConfig.maxYaw, Math.min(acConfig.maxYaw, currentYaw)); currentPitch = Math.max(-acConfig.maxPitch, Math.min(acConfig.maxPitch, currentPitch)); currentRoll = Math.max(-acConfig.maxRoll, Math.min(acConfig.maxRoll, currentRoll)); }
        P.chain = [{ yaw: currentYaw, pitch: currentPitch, roll: currentRoll, throttle: P.throttle, heatDelta: stats.heat, fire: P.queuedAction || 'none' }];
    }
    
    let res = simulateFlight(P, P.chain); P.pathPoints = res.points; P.pathQuats = res.quats; 
    if (P.chain && P.chain.length > 0) { P.chain[0].resultingAP = res.finalAP; P.previewCostAp = P.ap - res.finalAP; P.previewAccumHeat = P.chain[0].heatDelta; }
    
    if (typeof drawTrajectoryLine === 'function') drawTrajectoryLine(P);
    
    const enemyId = P.id === 'red' ? 'blue' : 'red';
    if (trajectoryMeshes[enemyId]) { scene.remove(trajectoryMeshes[enemyId]); trajectoryMeshes[enemyId] = null; }
    
    const enemyObj = teams[enemyId];
    if (enemyObj && enemyObj.wrapper && !enemyObj.isDestroyed) {
        while(threatEnvGroup.children.length > 0){ let child = threatEnvGroup.children[0]; if(child.geometry) child.geometry.dispose(); threatEnvGroup.remove(child); }
        threatEnvGroup.position.set(0, 0, 0); threatEnvGroup.quaternion.identity();
        
        const matT1 = new THREE.LineBasicMaterial({ color: 0xff0055, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }); 
        const matT2 = new THREE.LineBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending }); 
        const matT3 = new THREE.LineBasicMaterial({ color: 0xaa4400, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending });
        
        function createEnvelopeNet(testThrottle, lineMat) { const segments = 16; const pathSets = []; for (let i = 0; i < segments; i++) { let angle = (i / segments) * Math.PI * 2; let tYaw = -Math.cos(angle) * (Math.PI / 4); let tPitch = Math.sin(angle) * (Math.PI / 3); let r = simulateFlight(enemyObj, [{yaw: tYaw, pitch: tPitch, roll: 0, throttle: testThrottle}]); pathSets.push(r.points); } for (let i = 0; i < segments; i += 2) { threatEnvGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pathSets[i]), lineMat)); } [15, 30].forEach(frame => { let ringPts = []; for (let i = 0; i < segments; i++) ringPts.push(pathSets[i][frame]); ringPts.push(pathSets[0][frame]); threatEnvGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), lineMat)); }); }
        createEnvelopeNet(1, matT1); createEnvelopeNet(2, matT2); createEnvelopeNet(3, matT3); 
        let centerRes = simulateFlight(enemyObj, [{yaw: 0, pitch: 0, roll: 0, throttle: enemyObj.throttle}]);
        let centerLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(centerRes.points), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })); threatEnvGroup.add(centerLine); threatEnvGroup.visible = true; 
    } else { if(threatEnvGroup) threatEnvGroup.visible = false; }

    if (typeof updateTargetingLock === 'function') updateTargetingLock(P); 
    if (typeof updateMissilePreview === 'function') updateMissilePreview(P); 
    if (typeof updateGunPreview === 'function') updateGunPreview(P); 
    if (typeof updateDashboardUI === 'function') updateDashboardUI(P);
}

function updateTargetingLock(teamObj) {
    const enemyObj = teamObj.id === 'red' ? teams.blue : teams.red; const btnFireWpn = document.getElementById('btn-fire-wpn');
    if(!btnFireWpn || !teamObj.wrapper || !enemyObj.wrapper || enemyObj.isDestroyed) return;
    
    if (teamObj.flaresArmed) { if(!teamObj.wpnQueued) { btnFireWpn.innerText = `🔆 放棄開火 (拋灑誘餌)`; btnFireWpn.style.borderColor = '#ff9800'; btnFireWpn.style.color = '#ff9800'; } return; }
    
    const distance = teamObj.wrapper.position.distanceTo(enemyObj.wrapper.position); const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(teamObj.wrapper.quaternion).normalize(); const angle = forward.angleTo(new THREE.Vector3().subVectors(enemyObj.wrapper.position, teamObj.wrapper.position).normalize());
    const exposedHeat = calculateExposedHeat(100 + enemyObj.heat, enemyObj.wrapper.position, enemyObj.wrapper.quaternion, teamObj.wrapper.position);

    let isLocked = false; let statusText = "";
    if (teamObj.weapon === 'gun') { 
        let stats = CONFIG.aircrafts[teamObj.type || 'mig21'].throttleStats[teamObj.throttle] || { gunAngleMult: 1.0, gunRangeMult: 1.0 };
        isLocked = (distance <= GUN_RANGE * stats.gunRangeMult && angle <= GUN_ANGLE * stats.gunAngleMult); statusText = isLocked ? `[LOCKED] 機砲` : `[OUT] 機砲`;
    } else {
        isLocked = (distance <= SEEKER_RANGE && angle <= SEEKER_ANGLE && exposedHeat >= SEEKER_MIN_HEAT); statusText = isLocked ? `[LOCKED] FOX-2` : `[NO HEAT] FOX-2`;
    }

    if (!teamObj.wpnQueued) { btnFireWpn.innerText = `🎯 排程 ${statusText}`; if (isLocked) { btnFireWpn.style.borderColor = '#00ff88'; btnFireWpn.style.color = '#00ff88'; } else { btnFireWpn.style.borderColor = '#555'; btnFireWpn.style.color = '#888'; }
    } else { btnFireWpn.innerText = `⛔ 取消排程 [${teamObj.weapon === 'gun' ? '機砲' : 'FOX-2'}]`; btnFireWpn.style.borderColor = '#ff0055'; btnFireWpn.style.color = '#fff'; }
}

function animate() {
    requestAnimationFrame(animate); 
    
    if (typeof controls === 'undefined' || !controls || typeof renderer === 'undefined' || !renderer) return;

    controls.update(); 
    if (typeof updateSpatialHelpers === 'function') updateSpatialHelpers();
    
    if (window.replayMode) { renderer.render(scene, camera); return; }

    if (isAnimating && teams.red.flightCurve && teams.blue.flightCurve) {
        try {
            animProgress += 0.012; if (animProgress > 1.0) animProgress = 1.0; 
            let currentLog = battleLog[battleLog.length - 1]; 
            
            if (typeof renderCombatFrame === 'function') renderCombatFrame(currentLog, animProgress);

            let trackIdx = Math.min(100, Math.floor(animProgress * 100));
            ['red', 'blue'].forEach(id => {
                let t = teams[id]; let enemy = id === 'red' ? teams.blue : teams.red;
                if(t.isDestroyed || !t.flightCurve) return; 

                let logChain = currentLog[id].chain; 
                let stepSection = Math.floor(animProgress * logChain.length); if (stepSection >= logChain.length) stepSection = logChain.length - 1;
                if (logChain[stepSection] && logChain[stepSection].fire === 'gun' && !enemy.isDestroyed) {
                    let cmdThrottle = logChain[stepSection].throttle || 2; 
                    let stats = CONFIG.aircrafts['mig21'].throttleStats[cmdThrottle] || { gunAngleMult: 1.0, gunRangeMult: 1.0 };
                    let dynamicGunRange = GUN_RANGE * stats.gunRangeMult; let dynamicGunAngle = GUN_ANGLE * stats.gunAngleMult;
                    let forwardDir = new THREE.Vector3(0, 0, 1).applyQuaternion(t.wrapper.quaternion).normalize(); 
                    let vectorToEnemy = new THREE.Vector3().subVectors(enemy.wrapper.position, t.wrapper.position);
                    if (vectorToEnemy.length() <= dynamicGunRange && forwardDir.angleTo(vectorToEnemy.normalize()) <= dynamicGunAngle) {
                        enemy.hp -= (GUN_DAMAGE * 0.015); if(enemy.hp <= 0) { enemy.hp = 0; enemy.isDestroyed = true; }
                    }
                }

                if (t.pylons) {
                    t.pylons.forEach(p => {
                        let explodeFrame = currentLog[`${id}ExplodedAt`] ? currentLog[`${id}ExplodedAt`][p.id] : undefined;
                        if (explodeFrame !== undefined && trackIdx >= explodeFrame && !p.hasBoomedThisTurn) {
                            let isSelfDestruct = currentLog[`${id}MslIsSelfDestruct`] ? currentLog[`${id}MslIsSelfDestruct`][p.id] : false;
                            if (isSelfDestruct) {
                                if (!window.replayMode) { let banner = document.getElementById('phase-banner'); if (banner) { banner.innerHTML = `<span style="font-size:24px; color:#ff5500; font-weight:bold; text-shadow: 2px 2px 4px #000;">💥 飛彈達最大航程自毀</span>`; banner.style.opacity = '1'; setTimeout(() => banner.style.opacity = '0', 1500); } }
                            } else {
                                enemy.hp -= MISSILE_DAMAGE; if(enemy.hp <= 0) { enemy.hp = 0; enemy.isDestroyed = true; }
                            }
                            p.hasBoomedThisTurn = true; 
                        }
                    });
                }
            });

            if (animProgress >= 1.0 && typeof finishTurnSimultaneously === 'function') finishTurnSimultaneously();
        } catch (err) { console.error(err); if(typeof finishTurnSimultaneously === 'function') finishTurnSimultaneously(); }
    }
    renderer.render(scene, camera);
}

// ============================================================================
// 👇 ACMI 戰術重播系統大腦
// ============================================================================

let replayInterval = null;
let isReplayingAuto = false;

function enterReplayMode() {
    if (!window.replayMode) {
        window.replayMode = true;
        
        let btnExit = document.getElementById('btn-rep-exit');
        if (btnExit) btnExit.style.display = 'inline-block';
        
        let rs = document.getElementById('replay-status');
        if (rs) { rs.innerText = "🔴 歷史回放中"; rs.style.color = "#ff3355"; }
        
        ['red', 'blue'].forEach(id => {
            if (trajectoryMeshes[id]) trajectoryMeshes[id].visible = false;
            if (teams[id].userData && teams[id].userData.gunPreview) teams[id].userData.gunPreview.visible = false;
            if (teams[id].pylons) teams[id].pylons.forEach(p => { if (p.lineMesh) p.lineMesh.visible = false; });
        });
        if (window.ghostWrapper) window.ghostWrapper.visible = false;
        if (threatEnvGroup) threatEnvGroup.visible = false;
    }
}

function exitReplayMode() {
    window.replayMode = false;
    isReplayingAuto = false;
    if (replayInterval) cancelAnimationFrame(replayInterval);
    
    let btnPlay = document.getElementById('btn-rep-play');
    if (btnPlay) btnPlay.innerText = "▶ 播放";
    
    let btnExit = document.getElementById('btn-rep-exit');
    if (btnExit) btnExit.style.display = 'none';
    
    let rs = document.getElementById('replay-status');
    if (rs) { rs.innerText = "狀態: 戰術規劃中"; rs.style.color = "#aaa"; }
    
    let sld = document.getElementById('replay-slider');
    if (sld) sld.value = sld.max; 
    
    ['red', 'blue'].forEach(id => {
        let t = teams[id];
        if (t.startPos && t.startQuat && !t.isDestroyed) {
            t.wrapper.position.copy(t.startPos);
            t.wrapper.quaternion.copy(t.startQuat);
        }
    });
    
    updateHUD(); 
}

function toggleReplayPlay() {
    let sld = document.getElementById('replay-slider');
    if (!sld || battleLog.length === 0) return;
    
    let btnPlay = document.getElementById('btn-rep-play');
    
    if (isReplayingAuto) {
        isReplayingAuto = false;
        cancelAnimationFrame(replayInterval);
        if (btnPlay) btnPlay.innerText = "▶ 播放";
    } else {
        enterReplayMode();
        isReplayingAuto = true;
        if (btnPlay) btnPlay.innerText = "⏸ 暫停";
        
        if (parseFloat(sld.value) >= parseFloat(sld.max)) sld.value = sld.min; 
        
        let lastTime = performance.now();
        function playLoop(now) {
            if (!isReplayingAuto) return;
            let dt = now - lastTime;
            lastTime = now;
            
            let val = parseFloat(sld.value) + (dt / 1500); 
            if (val >= parseFloat(sld.max)) {
                val = parseFloat(sld.max);
                isReplayingAuto = false;
                if (btnPlay) btnPlay.innerText = "▶ 播放"; 
            }
            sld.value = val;
            sld.dispatchEvent(new Event('input'));
            
            if (isReplayingAuto) replayInterval = requestAnimationFrame(playLoop);
        }
        replayInterval = requestAnimationFrame(playLoop);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    let sld = document.getElementById('replay-slider');
    if (sld) {
        sld.addEventListener('input', (e) => {
            enterReplayMode(); 
            
            if (e.isTrusted && isReplayingAuto) {
                isReplayingAuto = false;
                cancelAnimationFrame(replayInterval);
                let btnPlay = document.getElementById('btn-rep-play');
                if (btnPlay) btnPlay.innerText = "▶ 播放";
            }
            
            let val = parseFloat(e.target.value); 
            let turnIdx = Math.floor(val) - 1; 
            let progress = val - Math.floor(val);
            if (progress >= 0.99 || val === parseFloat(sld.max)) { progress = 1.0; turnIdx = Math.floor(val - 0.01) - 1; }
            if (turnIdx < 0) turnIdx = 0; 
            if (turnIdx >= battleLog.length) turnIdx = battleLog.length - 1;
            
            let currentLog = battleLog[turnIdx];
            if (currentLog && typeof renderCombatFrame === 'function') { 
                renderCombatFrame(currentLog, progress); 
                renderer.render(scene, camera); 
            }
        });
    }

    let btnPlay = document.getElementById('btn-rep-play');
    if (btnPlay) btnPlay.addEventListener('click', toggleReplayPlay);

    let btnExit = document.getElementById('btn-rep-exit');
    if (btnExit) btnExit.addEventListener('click', exitReplayMode);
});

window.onresize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };

animate();