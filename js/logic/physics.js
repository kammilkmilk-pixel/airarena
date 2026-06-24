// ============================================================================
// physics.js - 物理與推演大腦 (動態機動誘導阻力優化版)
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
            
            // 🌟 核心修正：動態調降機動時產生的「誘導阻力 (Induced Drag)」係數！
            // Yaw 轉向阻力係數：由極苛刻的 1.4 降低為 0.6
            // Pitch 爬升阻力係數：由 0.4 降低為 0.25
            // 重力勢能轉換：重力影響係數由 35 降至 30 (爬升掉AP，俯衝加AP，完全符合能量守恆)
            let yawDrag = Math.abs(dYaw * 180 / Math.PI) * FRAMES * 0.6;
            let pitchDrag = Math.abs(dPitch * 180 / Math.PI) * FRAMES * 0.25;
            let gravityDrag = forwardVector.y * 30;
            
            activeAP = Math.max(-100, Math.min(MAX_AP, activeAP - (yawDrag + pitchDrag) / FRAMES - gravityDrag / FRAMES));
            
            simObj.rotateY(dYaw); simObj.rotateX(dPitch); simObj.rotateZ(dRoll); 
            let rawSpeed = (Math.max(5, activeAP + baseThrust) * 0.015) / FRAMES;
            let gravityPull = forwardVector.y * 0.022 / 3; let finalStepDistance = (rawSpeed * currentSpeedMult) - gravityPull;
            simObj.translateZ(Math.max(0.01, finalStepDistance)); points.push(simObj.position.clone()); quats.push(simObj.quaternion.clone());
        }
    });
    return { points, quats, finalAP: activeAP };
}

// 🌟 新增：光速座標插值函數
function getPosAt(t, points) {
    if (!points || points.length === 0) return new THREE.Vector3();
    if (points.length === 1) return points[0].clone();
    if (t <= 0) return points[0].clone();
    if (t >= 1) return points[points.length - 1].clone();
    let p = t * (points.length - 1);
    let idx = Math.floor(p);
    return points[idx].clone().lerp(points[idx + 1], p - idx);
}