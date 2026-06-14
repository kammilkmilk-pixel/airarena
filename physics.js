// ============================================================================
// physics.js - 物理與推演大腦 (尋標器熱源感知升級版)
// ============================================================================

function getQuatAt(t, quats) { 
    if (!quats || quats.length === 0) return new THREE.Quaternion(); 
    if (t <= 0) return quats[0]; 
    if (t >= 1) return quats[quats.length - 1]; 
    let p = t * (quats.length - 1); 
    let idx = Math.floor(p); 
    return quats[idx].clone().slerp(quats[idx + 1], p - idx); 
}

function simulateFlight(teamObj, chain) {
    if (!teamObj.wrapper) return { points: [], quats: [], finalAP: teamObj.ap };
    let simObj = new THREE.Object3D(); simObj.position.copy(teamObj.wrapper.position); simObj.quaternion.copy(teamObj.wrapper.userData.logicalQuat);
    let activeAP = teamObj.ap || 100; let points = [simObj.position.clone()]; let quats = [simObj.quaternion.clone()];
    const acConfig = CONFIG.aircrafts['mig21']; const FRAMES = 30; 
    chain.forEach((cmd, idx) => {
        let thres = cmd.throttle || teamObj.throttle; let stats = acConfig.throttleStats[thres] || { thrust: 35, turnLimit: 0.7, speedProfile: [1.5] };
        let baseThrust = stats.thrust; let currentSpeedMult = stats.speedProfile[0]; 
        let dYaw = ((cmd.yaw || 0) * stats.turnLimit) / FRAMES; let dPitch = ((cmd.pitch || 0) * stats.turnLimit) / FRAMES; let dRoll = (cmd.roll || 0) / FRAMES;
        for (let i = 0; i < FRAMES; i++) {
            let forwardVector = new THREE.Vector3(0, 0, 1).applyQuaternion(simObj.quaternion);
            activeAP = Math.max(-100, Math.min(MAX_AP, activeAP - ((Math.abs(dYaw*180/Math.PI)*FRAMES*1.4)+(Math.abs(dPitch*180/Math.PI)*FRAMES*0.4))/FRAMES - forwardVector.y * 35 / FRAMES));
            simObj.rotateY(dYaw); simObj.rotateX(dPitch); simObj.rotateZ(dRoll); 
            let rawSpeed = (Math.max(5, activeAP + baseThrust) * 0.015) / FRAMES;
            let gravityPull = forwardVector.y * 0.022 / 3; let finalStepDistance = (rawSpeed * currentSpeedMult) - gravityPull;
            simObj.translateZ(Math.max(0.01, finalStepDistance)); points.push(simObj.position.clone()); quats.push(simObj.quaternion.clone());
        }
    });
    return { points, quats, finalAP: activeAP };
}

// 🌟 飛彈推演邏輯重寫：現在飛彈會去「看」所有的熱源並比較溫度！
function simulateMissileStep(pos, quat, targetPos, targetQuat, ap, teamObj, enemyObj, flares, activeM) {
    let forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quat).normalize();
    let speed = typeof MISSILE_SPEED !== 'undefined' ? MISSILE_SPEED : 3.5; 
    pos.add(forward.clone().multiplyScalar(speed));
    
    let bestTargetPos = targetPos.clone();
    let maxHeatSeen = -1;

    // --- 1. 測量敵機熱量 ---
    // 飛機熱量 = (引擎基礎熱量 100 + 儀表板累積的 heat) * 尾管暴露角度
    let enemyExposedHeat = calculateExposedHeat(100 + (enemyObj.heat || 0), targetPos, targetQuat, pos);
    let distToEnemy = pos.distanceTo(targetPos);
    let enemyDir = new THREE.Vector3().subVectors(targetPos, pos).normalize();
    let enemyAngle = forward.angleTo(enemyDir);

    // 判斷敵機是否在導引頭的視角 (Angle) 與射程 (Range) 內
    if (distToEnemy <= SEEKER_RANGE && enemyAngle <= SEEKER_ANGLE && enemyExposedHeat >= SEEKER_MIN_HEAT) {
        maxHeatSeen = enemyExposedHeat;
    }

    // --- 2. 測量周圍「熱焰彈」熱量 (這就是你的 500、150 發揮作用的地方) ---
    if (flares && flares.length > 0) {
        flares.forEach(f => {
            if (f.teamId === enemyObj.id && f.heat > 0) {
                let fDist = pos.distanceTo(f.pos);
                let fDir = new THREE.Vector3().subVectors(f.pos, pos).normalize();
                let fAngle = forward.angleTo(fDir);
                
                if (fDist <= SEEKER_RANGE && fAngle <= SEEKER_ANGLE) {
                    // 距離越近，飛彈感受到的熱量越強
                    let apparentHeat = f.heat * (1 - (fDist / SEEKER_RANGE));
                    
                    // 💥 如果這顆熱焰彈的溫度大於飛機的暴露溫度，飛彈就會被騙走！
                    if (apparentHeat > maxHeatSeen) {
                        maxHeatSeen = apparentHeat;
                        bestTargetPos = f.pos.clone(); // 鎖定點切換到熱焰彈上
                    }
                }
            }
        });
    }

    // --- 導航轉向 ---
    if (maxHeatSeen > -1) {
        // 朝向判定後「最熱」的目標轉向
        let toTarget = new THREE.Vector3().subVectors(bestTargetPos, pos).normalize();
        let qTarget = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), toTarget);
        quat.slerp(qTarget, typeof MISSILE_TURN_RATE !== 'undefined' ? MISSILE_TURN_RATE : 0.04);
    } 
    // 若 maxHeatSeen === -1，代表脫鎖瞎掉，飛彈會維持原來的方向直線盲飛

    // --- 爆炸判定 ---
    let exploded = false; let selfDestructed = false;
    
    // 如果撞到敵機，或是撞到被騙去追的熱焰彈，就觸發近炸引信
    if (distToEnemy < 5 || (bestTargetPos !== targetPos && pos.distanceTo(bestTargetPos) < 2)) {
        exploded = true; 
    }
    
    ap -= (typeof MISSILE_DRAG !== 'undefined' ? MISSILE_DRAG : 0.3);
    if (ap <= 0 && !exploded) { exploded = true; selfDestructed = true; }
    
    return { pos: pos, quat: quat, ap: ap, exploded: exploded, selfDestructed: selfDestructed };
}

function calculateExposedHeat(baseHeat, targetPos, targetQuat, seekerPos) { 
    let rearDir = new THREE.Vector3(0, 0, -1).applyQuaternion(targetQuat).normalize(); 
    let seekerDir = new THREE.Vector3().subVectors(seekerPos, targetPos).normalize(); 
    let aspectDot = rearDir.dot(seekerDir); 
    // 側面或正面暴露的熱量只有尾管直視的 10% ~ 50%
    return baseHeat * Math.max(0.1, (aspectDot + 1) * 0.5); 
}