// ============================================================================
// game.js - UI 橋樑、模型載入、主迴圈與 ACMI 重播系統 (無塵乾淨版)
// ============================================================================

const loader = new THREE.GLTFLoader();

// ============================================================================
// 🌟 尾焰生成器與模型掛載
// ============================================================================
function createExhaust() {
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 512;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 128, 512);
    ctx.fillStyle = '#fff'; ctx.shadowBlur = 10; ctx.shadowColor = '#fff';
    for(let y=30; y<512; y+=80) { ctx.beginPath(); ctx.ellipse(64,y,64,15,0,0,Math.PI*2); ctx.fill(); }
    const machTex = new THREE.CanvasTexture(canvas); machTex.wrapS = machTex.wrapT = THREE.RepeatWrapping; 
    
    const canvas2 = document.createElement('canvas'); canvas2.width = 128; canvas2.height = 256;
    const ctx2 = canvas2.getContext('2d'); ctx2.fillStyle = '#000'; ctx2.fillRect(0, 0, 128, 256);
    ctx2.fillStyle = '#fff'; ctx2.shadowBlur = 5; ctx2.shadowColor = '#fff';
    for(let i=0; i<30; i++) ctx2.fillRect(Math.random()*128, 0, 2+Math.random()*3, 256);
    const outerTex = new THREE.CanvasTexture(canvas2); outerTex.wrapS = outerTex.wrapT = THREE.RepeatWrapping;

    const exhaustGroup = new THREE.Group(); 
    // 對齊 MiG-21 尾噴口
    exhaustGroup.position.set(0, -0.08, -0.49);
    
    const innerMat = new THREE.MeshBasicMaterial({ map: machTex, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const outerMat = new THREE.MeshBasicMaterial({ map: outerTex, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    
    const flameLength = 2.0;
    const geoOuter = new THREE.CylinderGeometry(0.12, 0.05, flameLength, 16, 32, true);
    const geoInner = new THREE.CylinderGeometry(0.06, 0.02, flameLength, 16, 32, true);
    
    function applyFlameGradient(geo, length) {
        const count = geo.attributes.position.count; const colors = new Float32Array(count * 3); const pos = geo.attributes.position;
        const cY = new THREE.Color(1,1,0.6), cO = new THREE.Color(1,0.4,0), cB = new THREE.Color(0,0.3,1), cBlk = new THREE.Color(0,0,0);
        let tC = new THREE.Color();
        for(let i=0; i<count; i++) {
            let r = 1.0 - ((pos.getY(i) + length/2) / length);
            if(r<0.2) tC.lerpColors(cY,cO,r/0.2); else if(r<0.6) tC.lerpColors(cO,cB,(r-0.2)/0.4); else tC.lerpColors(cB,cBlk,(r-0.6)/0.4);
            colors[i*3]=tC.r; colors[i*3+1]=tC.g; colors[i*3+2]=tC.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    applyFlameGradient(geoOuter, flameLength); applyFlameGradient(geoInner, flameLength);
    [geoOuter, geoInner].forEach(g => { g.rotateX(Math.PI/2); g.translate(0, 0, -flameLength/2); });
    
    exhaustGroup.add(new THREE.Mesh(geoOuter, outerMat)); exhaustGroup.add(new THREE.Mesh(geoInner, innerMat));

    return { group: exhaustGroup, machTex: machTex, outerTex: outerTex };
}

function setupModel(gltf, x, z, yRot) {
    const model = gltf.scene; 
    
    // 🌟 記錄原始顏色，供受損變暗使用
    model.traverse(c => { 
        if (c.isMesh && c.material) { 
            c.material = c.material.clone(); // 獨立材質避免污染
            if (c.material.color) {
                c.userData.origColor = c.material.color.getHex(); 
            }
        } 
    });

    const box = new THREE.Box3().setFromObject(model); const scale = 1.2 / Math.max(box.getSize(new THREE.Vector3()).x, box.getSize(new THREE.Vector3()).y, box.getSize(new THREE.Vector3()).z); model.scale.set(scale, scale, scale); const center = box.getCenter(new THREE.Vector3()); model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    const wrapper = new THREE.Group(); wrapper.add(model); 

    let exhaust = createExhaust();
    wrapper.add(exhaust.group);         
    wrapper.userData.exhaust = exhaust; 

    wrapper.position.set(x, 25, z); wrapper.rotation.y = yRot; wrapper.userData.logicalQuat = wrapper.quaternion.clone(); scene.add(wrapper); 
    return wrapper;
}

function loadModelAsync(url) {
    return new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
    });
}

async function bootGame() {
    try {
        const [redGltf, blueGltf, foxGltf, vfxReady] = await Promise.all([
    loadModelAsync('assets/models/mig21_red.glb'),
    loadModelAsync('assets/models/mig21_blue.glb'),
    loadModelAsync('assets/models/fox_two.glb').catch(() => null),
    window.vfxReadyPromise
]);

        teams.red.wrapper = setupModel(redGltf, 10, -30, 0);
        teams.blue.wrapper = setupModel(blueGltf, 10, 70, Math.PI);

        if (foxGltf) {
            const m = foxGltf.scene; 
            m.traverse(c => { if(c.isMesh) c.material = new THREE.MeshBasicMaterial({ color: 0xdddddd }); });
            const b = new THREE.Box3().setFromObject(m); 
            const s = 1.0 / Math.max(b.getSize(new THREE.Vector3()).x, b.getSize(new THREE.Vector3()).y, b.getSize(new THREE.Vector3()).z); 
            m.scale.set(s*MISSILE_SCALE, s*MISSILE_SCALE, s*MISSILE_SCALE); 
            m.rotation.set(MISSILE_ROT_X, MISSILE_ROT_Y, MISSILE_ROT_Z); 
            const c = b.getCenter(new THREE.Vector3()); 
            m.position.set(-c.x*s, -c.y*s, -c.z*s);
            missileMeshBase = m;
        } else {
            if (typeof createProceduralMissileMesh === 'function') missileMeshBase = createProceduralMissileMesh(); 
            if (missileMeshBase) missileMeshBase.position.set(0, 0, 0); 
        }

        checkInit();

    } catch (error) {
        console.error("💥 啟動失敗：", error);
    }
}

bootGame();

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
                
                t.ap = 107;   
                t.heat = 0;  
                t.hp = 100;  
                
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
                        if (p.flyingMesh) { 
                            let offset = (typeof window.mslVisOffset !== 'undefined' ? window.mslVisOffset : new THREE.Vector3(0,0,0)).clone().applyQuaternion(activeM.quat);
                            p.flyingMesh.position.copy(activeM.pos).add(offset);
                            p.flyingMesh.quaternion.copy(activeM.quat);
                            p.flyingMesh.visible = true; 
                        }
                    } else { 
                        if (p.flyingMesh) p.flyingMesh.visible = false; 
                    }
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
        
        const matT1 = new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }); 
        const matT2 = new THREE.LineBasicMaterial({ color: 0x00aa55, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending }); 
        const matT3 = new THREE.LineBasicMaterial({ color: 0x006633, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending });
        
        function createEnvelopeNet(testThrottle, lineMat) { const segments = 16; const pathSets = []; for (let i = 0; i < segments; i++) { let angle = (i / segments) * Math.PI * 2; let tYaw = -Math.cos(angle) * (Math.PI / 4); let tPitch = Math.sin(angle) * (Math.PI / 3); let r = simulateFlight(enemyObj, [{yaw: tYaw, pitch: tPitch, roll: 0, throttle: testThrottle}]); pathSets.push(r.points); } for (let i = 0; i < segments; i += 2) { threatEnvGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pathSets[i]), lineMat)); } [15, 30].forEach(frame => { let ringPts = []; for (let i = 0; i < segments; i++) ringPts.push(pathSets[i][frame]); ringPts.push(pathSets[0][frame]); threatEnvGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), lineMat)); }); }
        createEnvelopeNet(1, matT1); createEnvelopeNet(2, matT2); createEnvelopeNet(3, matT3); 
        let centerRes = simulateFlight(enemyObj, [{yaw: 0, pitch: 0, roll: 0, throttle: enemyObj.throttle}]);
        let centerLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(centerRes.points), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })); 
        threatEnvGroup.add(centerLine); 
        threatEnvGroup.visible = typeof isEnvelopeVisible !== 'undefined' ? isEnvelopeVisible : true;
    }

    if (typeof updateTargetingLock === 'function') updateTargetingLock(P); 
    if (typeof updateMissilePreview === 'function') updateMissilePreview(P); 
    if (typeof updateGunPreview === 'function') updateGunPreview(P); 
    if (typeof updateDashboardUI === 'function') updateDashboardUI(P);
    if (typeof updateDynamicHUD === 'function') updateDynamicHUD(P); 
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
        let dRange = GUN_RANGE * stats.gunRangeMult;
        let dAngle = GUN_ANGLE * stats.gunAngleMult;
        
        let vecToEnemy = new THREE.Vector3().subVectors(enemyObj.wrapper.position, teamObj.wrapper.position);
        let forwardDist = vecToEnemy.dot(forward);
        
        if (forwardDist > 0 && forwardDist <= dRange) {
            let timeSinceSpawn = forwardDist / (dRange * 2.0);
            let gravDrop = 0.5 * 9.8 * (timeSinceSpawn * 2) * (timeSinceSpawn * 2) * 0.5;
            let expectedBulletPos = teamObj.wrapper.position.clone().add(forward.clone().multiplyScalar(forwardDist));
            expectedBulletPos.y -= gravDrop;
            
            let coneRadius = forwardDist * Math.tan(dAngle);
            isLocked = (expectedBulletPos.distanceTo(enemyObj.wrapper.position) <= coneRadius);
        }
        
        statusText = isLocked ? `[LOCKED] 機砲` : `[OUT] 機砲`;
    } else { btnFireWpn.innerText = `⛔ 取消排程 [${teamObj.weapon === 'gun' ? '機砲' : 'FOX-2'}]`; btnFireWpn.style.borderColor = '#ff0055'; btnFireWpn.style.color = '#fff'; }
}

// ==========================================
// 🌟 戰鬥動畫啟動入口 (安全鎖)
// ==========================================
window.startCombatAnimation = function() {
    window.replayMode = false;     
    isReplayingAuto = false;       
    animProgress = 0.0;            
    isAnimating = true;            

    let btnExit = document.getElementById('btn-rep-exit');
    if (btnExit) btnExit.style.display = 'none';
    
    let tagR = document.getElementById('replay-tag-red');
    let tagB = document.getElementById('replay-tag-blue');
    if (tagR) tagR.style.display = 'none';
    if (tagB) tagB.style.display = 'none';

    ['red', 'blue'].forEach(id => {
        if (trajectoryMeshes[id]) trajectoryMeshes[id].visible = false;
        if (teams[id].userData && teams[id].userData.gunPreview) teams[id].userData.gunPreview.visible = false;
        if (teams[id].pylons) teams[id].pylons.forEach(p => { if (p.lineMesh) p.lineMesh.visible = false; });
    });
    if (window.ghostWrapper) window.ghostWrapper.visible = false;
    if (threatEnvGroup) threatEnvGroup.visible = false;
};

function animate() {
    requestAnimationFrame(animate); 
    if (typeof controls === 'undefined' || !controls || typeof renderer === 'undefined' || !renderer) return;

    controls.update(); 
    camera.updateMatrixWorld(); 

    // ==========================================
    // 🌟 全天候 Billboard 鏡頭對齊系統（確保特效面向攝影機）
    // ==========================================
    if (typeof explosionPool !== 'undefined') {
        [explosionPool, flashPool, puffPool].forEach(pool => {
            pool.forEach(mesh => {
                if (mesh.visible) {
                    mesh.quaternion.copy(camera.quaternion); 
                    if (mesh.userData.zRot !== undefined) {
                        const qZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), mesh.userData.zRot);
                        mesh.quaternion.multiply(qZ);
                    }
                }
            });
        });
    }
    // ==========================================
    
    let now = performance.now();

    // ==========================================
    // 🌟 統一的尾焰物理動畫
    // ==========================================
    ['red', 'blue'].forEach(id => {
        let t = teams[id];
        if (t.wrapper && t.wrapper.userData && t.wrapper.userData.exhaust && !t.isDestroyed) {
            let exhaust = t.wrapper.userData.exhaust;
            let throttle = t.throttle || 2; 
            
            exhaust.machTex.offset.y -= 0.02 * throttle;
            exhaust.outerTex.offset.y -= 0.03 * throttle;
            let flicker = Math.sin(now * 0.05) * 0.02 * throttle;

            let scaleX = 0.5 * (0.8 + throttle * 0.1);
            let scaleY = 0.5 * (0.8 + throttle * 0.1);
            let scaleZ = 0.5 * (throttle * 0.45) + flicker; 

            exhaust.group.scale.set(scaleX, scaleY, scaleZ);

            let targetOpacity = 0.05 + (throttle * 0.30);
            exhaust.group.children[0].material.opacity = targetOpacity;
            exhaust.group.children[1].material.opacity = Math.min(1.0, targetOpacity * 1.2);
        }
    });
    // ==========================================

    if (typeof updateSpatialHelpers === 'function') updateSpatialHelpers();
    if (typeof updateDynamicHUD === 'function') updateDynamicHUD(P); 

    // ==========================================
    // 1. ACMI 重播模式
    // ==========================================
    if (window.replayMode) { 
        if (isReplayingAuto) {
            let dt = now - (window.lastReplayTime || now);
            window.lastReplayTime = now;
            
            if (window.virtualReplayTime === undefined) window.virtualReplayTime = 1.0;
            let maxTime = battleLog.length + 0.99;
            
            window.virtualReplayTime += (dt / 1500); 

            if (window.virtualReplayTime >= maxTime) {
                window.virtualReplayTime = maxTime;
                isReplayingAuto = false;
                let btnPlay = document.getElementById('btn-rep-play');
                if (btnPlay) btnPlay.innerText = "▶ 播放"; 
            }
            
            let sld = document.getElementById('replay-slider');
            if (sld) sld.value = window.virtualReplayTime;
        }

        try {
            let val = window.virtualReplayTime || 1.0;
            let maxTime = battleLog.length + 0.99;
            let turnIdx = Math.max(0, Math.min(battleLog.length - 1, Math.floor(val) - 1)); 
            let progress = val - Math.floor(val);
            if (progress >= 0.99 || val >= maxTime) { 
                progress = 1.0; 
                turnIdx = Math.max(0, Math.min(battleLog.length - 1, Math.floor(val - 0.01) - 1)); 
            }
            
            if (battleLog[turnIdx]) {
                if (typeof renderCombatFrame === 'function') renderCombatFrame(battleLog[turnIdx], progress);
                if (typeof updateReplayTags === 'function') updateReplayTags(battleLog[turnIdx], progress);
            }
        } catch (e) { 
            console.error("重播渲染遭遇亂流，已由裝甲攔截:", e); 
        }

        renderer.render(scene, camera);
        return;
    }

    // ==========================================
    // 2. 正常戰鬥播放模式
    // ==========================================
    if (isAnimating && teams.red.flightCurve && teams.blue.flightCurve) {
        try {
            animProgress += 0.012; if (animProgress > 1.0) animProgress = 1.0; 
            let currentLog = battleLog.length > 0 ? battleLog[battleLog.length - 1] : null; 
            if (currentLog && typeof renderCombatFrame === 'function') renderCombatFrame(currentLog, animProgress);
            if (typeof updateReplayTags === 'function') updateReplayTags(currentLog, animProgress);
            
            let trackIdx = Math.min(100, Math.floor(animProgress * 100));
            ['red', 'blue'].forEach(id => {
                let t = teams[id]; 
                if(t.isDestroyed || !t.flightCurve) return; 
                if (t.pylons && currentLog) {
                    t.pylons.forEach(p => {
                        let explodeFrame = currentLog[`${id}ExplodedAt`] ? currentLog[`${id}ExplodedAt`][p.id] : undefined;
                        if (explodeFrame !== undefined && trackIdx >= explodeFrame && !p.hasBoomedThisTurn) {
                            let isSelfDestruct = currentLog[`${id}MslIsSelfDestruct`] ? currentLog[`${id}MslIsSelfDestruct`][p.id] : false;
                            if (isSelfDestruct && !window.replayMode) { let banner = document.getElementById('phase-banner'); if (banner) { banner.innerHTML = `<span style="font-size:24px; color:#ff5500; font-weight:bold; text-shadow: 2px 2px 4px #000;">💥 飛彈達最大航程自毀</span>`; banner.style.opacity = '1'; setTimeout(() => banner.style.opacity = '0', 1500); } } 
                            p.hasBoomedThisTurn = true; 
                        }
                    });
                }
            });

            if (animProgress >= 1.0 && typeof finishTurnSimultaneously === 'function') {
                let tagR = document.getElementById('replay-tag-red');
                let tagB = document.getElementById('replay-tag-blue');
                if (tagR) tagR.style.display = 'none';
                if (tagB) tagB.style.display = 'none';

                finishTurnSimultaneously();
            }
        } catch (err) { 
            console.error("戰鬥播放崩潰，已強制跳轉:", err); 
            if(typeof finishTurnSimultaneously === 'function') finishTurnSimultaneously(); 
        }
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
    
    let tagR = document.getElementById('replay-tag-red');
    let tagB = document.getElementById('replay-tag-blue');
    if (tagR) tagR.style.display = 'none';
    if (tagB) tagB.style.display = 'none';

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
        if (btnPlay) btnPlay.innerText = "▶ 播放";
    } else {
        enterReplayMode();
        isReplayingAuto = true;
        
        window.lastReplayTime = performance.now(); 
        
        if (btnPlay) btnPlay.innerText = "⏸ 暫停";
        if (parseFloat(sld.value) >= parseFloat(sld.max)) sld.value = sld.min; 
    }
}

document.addEventListener("DOMContentLoaded", () => {
    let sld = document.getElementById('replay-slider');
    if (sld) {
        sld.addEventListener('input', (e) => {
            enterReplayMode(); 
            
            if (e.isTrusted && isReplayingAuto) {
                isReplayingAuto = false;
                let btnPlay = document.getElementById('btn-rep-play');
                if (btnPlay) btnPlay.innerText = "▶ 播放";
            }
            
            let val = parseFloat(e.target.value); 
            window.virtualReplayTime = val; 

            let turnIdx = Math.floor(val) - 1; 
            let progress = val - Math.floor(val);
            if (progress >= 0.99 || val === parseFloat(sld.max)) { progress = 1.0; turnIdx = Math.floor(val - 0.01) - 1; }
            if (turnIdx < 0) turnIdx = 0; 
            if (turnIdx >= battleLog.length) turnIdx = battleLog.length - 1;
            
            let currentLog = battleLog[turnIdx];
            if (currentLog && typeof renderCombatFrame === 'function') { 
                renderCombatFrame(currentLog, progress); 
                if (typeof updateReplayTags === 'function') updateReplayTags(currentLog, progress);
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