// ============================================================================
// hud.js - 戰機火控雷達與動態 HUD 投影系統 (真·強控權限防覆蓋完全體)
// ============================================================================

// 🌟 初始化 HUD 點擊事件 (用於開關包絡線)
if (typeof window.hudClickListenerRegistered === 'undefined') {
    window.hudClickListenerRegistered = true;
    const setupHudClick = () => {
        let hudElement = document.getElementById('dynamic-hud');
        if (hudElement && !hudElement.dataset.clickBound) {
            hudElement.dataset.clickBound = "true";
            hudElement.style.pointerEvents = "auto";
            hudElement.addEventListener('click', (e) => {
                let currentTeam = typeof tAct !== 'undefined' ? tAct : window.activeTeamId;
let enemyId = currentTeam === 'red' ? 'blue' : 'red';
                let enemy = (typeof teams !== 'undefined') ? teams[enemyId] : null; 
    
                if (enemy) {
                    if (!enemy.userData) enemy.userData = {};
                    enemy.userData.showEnvelope = !enemy.userData.showEnvelope;
                    console.log(`[HUD] 敵機預測包絡線: ${enemy.userData.showEnvelope ? 'ON' : 'OFF'}`);
        
                    // 🟢 同步控制蜘蛛網 (threatEnvGroup) 與 單一光帶
                    if (typeof threatEnvGroup !== 'undefined') {
                        threatEnvGroup.visible = enemy.userData.showEnvelope;
                    }
                    if (typeof trajectoryMeshes !== 'undefined' && trajectoryMeshes[enemyId]) {
                        trajectoryMeshes[enemyId].visible = enemy.userData.showEnvelope;
                    }
                }
            });
        }
    };
    document.addEventListener('DOMContentLoaded', setupHudClick);
    setupHudClick(); 
}

window.updateDynamicHUD = function() {
    let t = teams[tAct];
    let enemy = tAct === 'red' ? teams.blue : teams.red;
    
    let hudElement = document.getElementById('dynamic-hud');
    if (!hudElement) return;

    let isReplaying = window.replayMode || (typeof isAnimating !== 'undefined' && isAnimating);
    
    // 🟢 關鍵修復防線：如果正在重播或飛機炸了，把敵機和己方的軌跡徹底交給重播模組，此處不干涉
    if (!t || !enemy || t.isDestroyed || enemy.isDestroyed || isReplaying) {
        hudElement.style.display = 'none';
        return;
    }

    if (!t.wrapper || !enemy.wrapper) return;
    let myPos = t.wrapper.position.clone();
    let enemyPos = enemy.wrapper.position.clone();

    let distance = myPos.distanceTo(enemyPos); 
    let forward = new THREE.Vector3(0, 0, 1).applyQuaternion(t.wrapper.quaternion).normalize(); 
    let vecToEnemy = new THREE.Vector3().subVectors(enemyPos, myPos).normalize(); 
    let angle = forward.angleTo(vecToEnemy); 

    // 雷達搜尋限制 (60度)
    let radarLimitAngle = Math.PI / 3; 
    if (angle > radarLimitAngle) {
        hudElement.style.display = 'none';
        // 🟢 即使隱藏了 HUD 方框，只要使用者沒點開包絡線，背地裡依然強制關閉敵機線條，防止其他檔案非法點亮
        if (typeof trajectoryMeshes !== 'undefined' && trajectoryMeshes[enemy.id]) {
            trajectoryMeshes[enemy.id].visible = !!(enemy.userData && enemy.userData.showEnvelope);
        }
        return;
    }

    let projPos = enemyPos.clone().project(camera);
    if (projPos.z > 1) {
        hudElement.style.display = 'none';
        return;
    }

    // 視線遮蔽檢測 (防穿牆鎖定)
    let isObscured = false;
    if (typeof obstacles !== 'undefined' && obstacles.length > 0) {
        let raycaster = new THREE.Raycaster(myPos, vecToEnemy);
        let hits = raycaster.intersectObjects(obstacles, false);
        if (hits.length > 0 && hits[0].distance < distance) {
            isObscured = true;
        }
    }

    // 計算射擊鎖定
    let lockAngleThreshold = Math.PI / 12; 
    let isWeaponLocked = !isObscured && distance <= (t.weapon === 'gun' ? 35 : 60) && angle <= lockAngleThreshold;

    let x = (projPos.x * 0.5 + 0.5) * window.innerWidth;
    let y = (projPos.y * -0.5 + 0.5) * window.innerHeight;
    hudElement.style.left = `${x}px`;
    hudElement.style.top = `${y}px`;
    hudElement.style.display = 'block';

    // 視覺反饋
    let hudShape = document.getElementById('hud-shape');
    if (hudShape) {
        hudShape.className = isWeaponLocked ? (t.weapon === 'gun' ? 'shape-gun predicted-hit' : 'shape-circle predicted-hit') : 'shape-square';
        hudShape.style.opacity = isObscured ? '0.3' : '0.8';

        // 當包絡線開啟時，HUD 框點擊後的綠色強化反饋
        if (enemy.userData && enemy.userData.showEnvelope && !isObscured) {
            hudShape.style.backgroundColor = 'rgba(0, 255, 136, 0.15)';
            hudShape.style.boxShadow = '0 0 15px rgba(0, 255, 136, 0.5)';
        } else {
            hudShape.style.backgroundColor = 'transparent';
            hudShape.style.boxShadow = 'none';
        }
    }

    // 🟢 終極主權宣告：確保包絡線嚴格遵守雷達視線 (LOS) 與點擊開關
    if (typeof trajectoryMeshes !== 'undefined') {
        if (trajectoryMeshes[t.id]) trajectoryMeshes[t.id].visible = true; // 己方預覽線永遠可見
        if (trajectoryMeshes[enemy.id]) {
            trajectoryMeshes[enemy.id].visible = !!(enemy.userData && enemy.userData.showEnvelope && !isObscured);
        }
    }
    // 🟢 追加蜘蛛網的管轄權！只要被大樓遮擋 (!isObscured) 或被玩家關閉，就立刻隱藏
    if (typeof threatEnvGroup !== 'undefined') {
        threatEnvGroup.visible = !!(enemy.userData && enemy.userData.showEnvelope && !isObscured);
    }

    // 更新目標數據
    let tgtType = document.getElementById('hud-tgt-type');
    if (tgtType) {
        tgtType.innerText = isObscured ? 'OBSCURED' : (enemy.type ? enemy.type.toUpperCase() : 'TARGET');
        tgtType.style.color = isObscured ? '#ff9800' : '#00ff88';
    }
    let tgtAlt = document.getElementById('hud-tgt-alt');
    if (tgtAlt) tgtAlt.innerText = enemy.wrapper.position.y.toFixed(1);
    let tgtDist = document.getElementById('hud-tgt-dist');
    if (tgtDist) tgtDist.innerText = distance.toFixed(1);
};

// 確保 Hook 注入
if (typeof window.hudTickRegistered === 'undefined') {
    window.hudTickRegistered = true;
    const originalAnimate = window.animate;
    window.animate = function() {
        if (originalAnimate) originalAnimate();
        window.updateDynamicHUD();
    };
}