// ============================================================================
// hud.js - 戰機火控雷達、雙框追蹤與 WE-GO 精確 LCOS 彈道預測系統 (無光灰/高亮紅 動態切換版)
// ============================================================================

// 🌟 1. 動態注入 LCOS (Lead Computing Optical Sight) 浮動彈著光環 UI
if (!document.getElementById('lcos-pipper')) {
    const pipper = document.createElement('div');
    pipper.id = 'lcos-pipper';
    pipper.style.position = 'absolute';
    pipper.style.width = '100px'; 
    pipper.style.height = '100px';
    pipper.style.pointerEvents = 'none';
    pipper.style.zIndex = '8000';
    pipper.style.display = 'none'; 
    pipper.style.transform = 'translate(-50%, -50%)';
    // 加入過渡動畫，讓變亮/變暗的過程更柔和
    pipper.style.transition = 'opacity 0.2s ease-in-out'; 
    
    // 繪製高亮軍規 HUD 狙擊光環 (SVG)
    pipper.innerHTML = `
        <svg viewBox="0 0 100 100" style="width: 100%; height: 100%; filter: none;">
            <!-- 主物理散布環 -->
            <circle id="lcos-cone-circle" cx="50" cy="50" r="30" stroke="#aaaaaa" stroke-width="2.5" fill="none" stroke-dasharray="6 6" opacity="0.85"/>
            <!-- 核心彈道中心點 -->
            <circle cx="50" cy="50" r="2.5" fill="#ff0055"/>
            <!-- 四向照門刻度 -->
            <line id="lcos-line-top" x1="50" y1="5" x2="50" y2="18" stroke="#aaaaaa" stroke-width="2.5"/>
            <line id="lcos-line-bottom" x1="50" y1="95" x2="50" y2="82" stroke="#aaaaaa" stroke-width="2.5"/>
            <line id="lcos-line-left" x1="5" y1="50" x2="18" y2="50" stroke="#aaaaaa" stroke-width="2.5"/>
            <line id="lcos-line-right" x1="95" y1="50" x2="82" y2="50" stroke="#aaaaaa" stroke-width="2.5"/>
        </svg>
    `;
    document.body.appendChild(pipper);
}

// 🌟 2. 動態注入敵機未來預估框 (Estimated Position Box)
if (!document.getElementById('ghost-hud')) {
    const ghostHud = document.createElement('div');
    ghostHud.id = 'ghost-hud';
    ghostHud.style.position = 'absolute';
    ghostHud.style.width = '32px';
    ghostHud.style.height = '32px';
    ghostHud.style.border = '2px dashed #00e5ff';
    ghostHud.style.pointerEvents = 'none';
    ghostHud.style.zIndex = '7500';
    ghostHud.style.display = 'none';
    ghostHud.style.transform = 'translate(-50%, -50%)';
    ghostHud.style.boxShadow = '0 0 8px rgba(0, 229, 255, 0.4)';
    
    // 加載標籤與轉折角線
    ghostHud.innerHTML = `
        <div style="position: absolute; top: -18px; left: 50%; transform: translateX(-50%); font-size: 9px; color: #00e5ff; font-weight: bold; white-space: nowrap; text-shadow: 0 0 4px #000; letter-spacing: 1px;">EST. POS</div>
    `;
    document.body.appendChild(ghostHud);
}

// 🌟 3. 初始化 HUD 點擊事件 (僅用於飛彈模式下開關包絡線)
if (typeof window.hudClickListenerRegistered === 'undefined') {
    window.hudClickListenerRegistered = true;
    const setupHudClick = () => {
        let hudElement = document.getElementById('dynamic-hud');
        if (hudElement && !hudElement.dataset.clickBound) {
            hudElement.dataset.clickBound = "true";
            hudElement.style.pointerEvents = "auto";
            hudElement.addEventListener('click', (e) => {
                let currentTeam = GameContext.getActiveTeamId();
                let enemyId = currentTeam === 'red' ? 'blue' : 'red';
                let enemy = (typeof teams !== 'undefined') ? teams[enemyId] : null; 
                let t = teams[currentTeam];

                if (enemy) {
                    if (t && t.weapon === 'gun') {
                        showSMSAlert("⚠️ 機砲模式下強制隱藏包絡線，請專注 LCOS 瞄準", "#ffcc00");
                        return;
                    }

                    if (!enemy.userData) enemy.userData = {};
                    enemy.userData.showEnvelope = !enemy.userData.showEnvelope;
                    
                    if (typeof threatEnvGroup !== 'undefined' && threatEnvGroup) {
                        threatEnvGroup.visible = enemy.userData.showEnvelope;
                    }
                    if (typeof trajectoryMeshes !== 'undefined' && trajectoryMeshes[enemyId]) {
                        trajectoryMeshes[enemyId].visible = enemy.userData.showEnvelope;
                    }
                }
            });
        }
    };
    setupHudClick();
    setInterval(setupHudClick, 2000); 
}

// 🌟 4. 核心渲染更新：每影格刷新雙框定位與 LCOS 物理投影
window.updateDynamicHUD = function() {
    let currentTeam = GameContext.getActiveTeamId();
    let t = teams[currentTeam];
    let enemyId = currentTeam === 'red' ? 'blue' : 'red';
    let enemy = teams[enemyId];
    
    let hudShape = document.getElementById('hud-shape');
    let dynamicHud = document.getElementById('dynamic-hud');
    let ghostHud = document.getElementById('ghost-hud');
    let lcosPipper = document.getElementById('lcos-pipper');
    let lcosConeCircle = document.getElementById('lcos-cone-circle');

    if (!t || !enemy || !t.wrapper || !enemy.wrapper || t.isDestroyed || enemy.isDestroyed) {
        if(dynamicHud) dynamicHud.style.display = 'none';
        if(ghostHud) ghostHud.style.display = 'none';
        if(lcosPipper) lcosPipper.style.display = 'none';
        return;
    }

    if (GameContext.isReplayMode()) {
        if(dynamicHud) dynamicHud.style.display = 'none';
        if(ghostHud) ghostHud.style.display = 'none';
        if(lcosPipper) lcosPipper.style.display = 'none';
        return;
    }

    let myGhostPos = (t.pathPoints && t.pathPoints.length > 0) ? t.pathPoints[t.pathPoints.length - 1] : t.wrapper.position;
    let myGhostQuat = (t.pathQuats && t.pathQuats.length > 0) ? t.pathQuats[t.pathQuats.length - 1] : t.wrapper.quaternion;
    
    let enemyCurrentPos = enemy.wrapper.position.clone(); 
    let enemyGhostPos = (enemy.pathPoints && enemy.pathPoints.length > 0) ? enemy.pathPoints[enemy.pathPoints.length - 1] : enemy.wrapper.position; 

    let isObscured = false;
    if (typeof obstacles !== 'undefined' && obstacles.length > 0) {
        let dir = new THREE.Vector3().subVectors(enemyCurrentPos, t.wrapper.position).normalize();
        let dist = t.wrapper.position.distanceTo(enemyCurrentPos);
        let ray = new THREE.Raycaster(t.wrapper.position, dir, 0.1, dist);
        let hits = ray.intersectObjects(obstacles, true);
        if (hits.length > 0) isObscured = true;
    }

    // ========================================================================
    // 🔲 框 1：【主追蹤框 (dynamic-hud)】
    // ========================================================================
    let currentProj = enemyCurrentPos.clone();
    currentProj.project(camera);

    if (currentProj.z > 1.0) {
        if(dynamicHud) dynamicHud.style.display = 'none';
    } else {
        if(dynamicHud) dynamicHud.style.display = 'block';
        let x = (currentProj.x * 0.5 + 0.5) * window.innerWidth;
        let y = (currentProj.y * -0.5 + 0.5) * window.innerHeight;
        
        dynamicHud.style.left = `${x}px`;
        dynamicHud.style.top = `${y}px`;

        if (isObscured) {
            hudShape.style.borderColor = '#ff9800'; 
            hudShape.style.backgroundColor = 'transparent';
            hudShape.style.boxShadow = 'none';
            hudShape.style.borderStyle = 'dashed';
            hudShape.innerHTML = '<span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #ff9800; font-weight: 900; font-size: 14px; text-shadow: 0 0 4px #ff9800;">X</span>';
        } else {
            hudShape.style.borderStyle = 'solid';
            let distance = t.wrapper.position.distanceTo(enemyCurrentPos);
            let forward = new THREE.Vector3(0, 0, 1).applyQuaternion(t.wrapper.quaternion).normalize();
            let angle = forward.angleTo(new THREE.Vector3().subVectors(enemyCurrentPos, t.wrapper.position).normalize());
            
            let isLocked = t.weapon === 'gun' ? (distance <= 350 && angle <= Math.PI/8) : (distance <= 600 && angle <= Math.PI/12);
            
            if (isLocked) {
                hudShape.style.borderColor = '#00ff88';
                hudShape.style.backgroundColor = 'rgba(0, 255, 136, 0.12)';
                hudShape.style.boxShadow = '0 0 15px rgba(0, 255, 136, 0.4)';
                hudShape.innerHTML = '<span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #00ff88; font-weight: 900; font-size: 14px; text-shadow: 0 0 5px #00ff88;">O</span>';
            } else {
                hudShape.style.borderColor = '#00bcd4';
                hudShape.style.backgroundColor = 'transparent';
                hudShape.style.boxShadow = 'none';
                hudShape.innerHTML = '<span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #00bcd4; font-weight: 900; font-size: 14px;">X</span>';
            }
        }
    }

    // ========================================================================
    // 🎯 LCOS (前置瞄準系統) 物理高度精密同步 & 橫向速度補償
    // ========================================================================
    if (t.weapon === 'gun') {
        if (typeof trajectoryMeshes !== 'undefined' && trajectoryMeshes[enemy.id]) trajectoryMeshes[enemy.id].visible = false;
        if (typeof threatEnvGroup !== 'undefined' && threatEnvGroup) threatEnvGroup.visible = false;
        if (t.userData && t.userData.gunPreview) t.userData.gunPreview.visible = false;

        if (!isObscured) {
            let ghostProj = enemyGhostPos.clone();
            ghostProj.project(camera);
            if (ghostProj.z > 1.0) {
                if(ghostHud) ghostHud.style.display = 'none';
            } else {
                if(ghostHud) ghostHud.style.display = 'block';
                let gx = (ghostProj.x * 0.5 + 0.5) * window.innerWidth;
                let gy = (ghostProj.y * -0.5 + 0.5) * window.innerHeight;
                ghostHud.style.left = `${gx}px`;
                ghostHud.style.top = `${gy}px`;
            }

            let dist = myGhostPos.distanceTo(enemyGhostPos);
            
            let aircraftSpeedPerFrame = (t.speed || 107) * 0.015 / 100;
            let muzzleSpeedPerFrame = 4.0; 
            let effectiveBulletSpeed = muzzleSpeedPerFrame + aircraftSpeedPerFrame;
            
            let framesToImpact = dist / effectiveBulletSpeed;
            
            let myGhostForward = new THREE.Vector3(0, 0, 1).applyQuaternion(myGhostQuat).normalize();
            let enemyForward = new THREE.Vector3(0, 0, 1).applyQuaternion(enemy.wrapper.quaternion).normalize();
            
            let myVel = myGhostForward.clone().multiplyScalar(aircraftSpeedPerFrame);
            let enemySpeedPerFrame = (enemy.flightLength || (enemy.ap * 0.015)) / 100;
            let enemyVel = enemyForward.clone().multiplyScalar(enemySpeedPerFrame);
            let relativeVel = enemyVel.clone().sub(myVel);
            
            let bulletImpactPos = myGhostPos.clone().add(myGhostForward.clone().multiplyScalar(dist));
            
            let gFrame = 0.0022; 
            let gravityDrop = 0.5 * gFrame * framesToImpact * (framesToImpact + 1);
            bulletImpactPos.y -= gravityDrop; 
            bulletImpactPos.add(relativeVel.multiplyScalar(framesToImpact * 0.5));

            let aimPoint = bulletImpactPos.clone();
            aimPoint.project(camera);

            if (aimPoint.z > 1.0) {
                lcosPipper.style.display = 'none';
            } else {
                lcosPipper.style.display = 'block';
                let px = (aimPoint.x * 0.5 + 0.5) * window.innerWidth;
                let py = (aimPoint.y * -0.5 + 0.5) * window.innerHeight;
                
                if (!window.lcosLastPos) {
                    window.lcosLastPos = new THREE.Vector2(px, py);
                } else {
                    let screenDist = window.lcosLastPos.distanceTo(new THREE.Vector2(px, py));
                    if (screenDist > 400) { 
                        window.lcosLastPos.set(px, py); 
                    } else {
                        window.lcosLastPos.lerp(new THREE.Vector2(px, py), 0.35); 
                    }
                }
                
                lcosPipper.style.left = `${window.lcosLastPos.x}px`;
                lcosPipper.style.top = `${window.lcosLastPos.y}px`;
                
                if (lcosConeCircle) {
                    const aircraftDistance = t.wrapper.position.distanceTo(enemy.wrapper.position);
                    const minDistance = 25;
                    const maxDistance = 350;
                    const normalizedDistance = Math.max(0, Math.min(1, (aircraftDistance - minDistance) / (maxDistance - minDistance)));
                    const pipperSizePx = 128 - (normalizedDistance * 72);
                    lcosPipper.style.width = `${pipperSizePx}px`;
                    lcosPipper.style.height = `${pipperSizePx}px`;

                    const svgRadius = 30;
                    lcosConeCircle.setAttribute('r', svgRadius);
                    
                    let gap = 3; 
                    let len = 12; 
                    let lines = lcosPipper.querySelectorAll('line');
                    if (lines.length === 4) {
                        lines[0].setAttribute('y1', 50 - svgRadius - gap - len);
                        lines[0].setAttribute('y2', 50 - svgRadius - gap);
                        lines[1].setAttribute('y1', 50 + svgRadius + gap + len);
                        lines[1].setAttribute('y2', 50 + svgRadius + gap);
                        lines[2].setAttribute('x1', 50 - svgRadius - gap - len);
                        lines[2].setAttribute('x2', 50 - svgRadius - gap);
                        lines[3].setAttribute('x1', 50 + svgRadius + gap + len);
                        lines[3].setAttribute('x2', 50 + svgRadius + gap);
                    }
                }

                // 🟢 核心改進：射程外淺灰無光，射程內高亮血紅
                if (dist < 350) {
                    // 進入射程 (In-Range)：高亮度、帶強烈紅色發光
                    lcosPipper.style.opacity = '1.0';
                    lcosPipper.querySelector('svg').style.filter = 'drop-shadow(0 0 8px #ff0055)';
                    lcosConeCircle.setAttribute('stroke', '#ff0055');
                    lcosPipper.querySelectorAll('line').forEach(l => l.setAttribute('stroke', '#ff0055'));
                } else {
                    // 射程外 (Out-of-Range)：淺灰色、拔除發光效果、保持一定透明度以降低干擾
                    lcosPipper.style.opacity = '0.55'; 
                    lcosPipper.querySelector('svg').style.filter = 'none'; // 拔除發光
                    lcosConeCircle.setAttribute('stroke', '#aaaaaa');     // 換成淺灰色
                    lcosPipper.querySelectorAll('line').forEach(l => l.setAttribute('stroke', '#aaaaaa'));
                }
            }
        } else {
            lcosPipper.style.display = 'none';
            if (ghostHud) ghostHud.style.display = 'none';
        }
    } else {
        lcosPipper.style.display = 'none';
        if (ghostHud) ghostHud.style.display = 'none';
        
        let shouldShow = !!(enemy.userData && enemy.userData.showEnvelope && !isObscured);
        if (typeof trajectoryMeshes !== 'undefined' && trajectoryMeshes[enemy.id]) {
            trajectoryMeshes[enemy.id].visible = shouldShow;
        }
        if (typeof threatEnvGroup !== 'undefined' && threatEnvGroup) {
            threatEnvGroup.visible = shouldShow;
        }
    }
    
    if (typeof trajectoryMeshes !== 'undefined' && trajectoryMeshes[t.id]) {
        trajectoryMeshes[t.id].visible = true;
    }

    let tgtType = document.getElementById('hud-tgt-type');
    if (tgtType) {
        tgtType.innerText = isObscured ? 'OBSCURED' : (enemy.type ? enemy.type.toUpperCase() : 'TARGET');
        tgtType.style.color = isObscured ? '#ff9800' : '#00ff88';
    }
    let tgtAlt = document.getElementById('hud-tgt-alt');
    if (tgtAlt) tgtAlt.innerText = Math.floor(enemyCurrentPos.y);
    let tgtDist = document.getElementById('hud-tgt-dist');
    if (tgtDist) tgtDist.innerText = Math.floor(t.wrapper.position.distanceTo(enemyCurrentPos));
};