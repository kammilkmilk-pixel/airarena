// ============================================================================
// hud.js - 動態投影與鎖定視覺系統 (Dynamic HUD & Replay Tags)
// 負責 3D 座標映射、地形遮蔽(LOS)檢測與重播浮動標籤
// ============================================================================

let isEnvelopeVisible = true;

document.addEventListener("DOMContentLoaded", () => {
    console.log("🎯 HUD Manager initialized.");
    
    // 綁定點擊事件：切換綠色包絡線的顯示/隱藏
    const hudElement = document.getElementById('dynamic-hud');
    if (hudElement) {
        hudElement.addEventListener('click', () => {
            isEnvelopeVisible = !isEnvelopeVisible;
            if (typeof threatEnvGroup !== 'undefined' && threatEnvGroup) {
                threatEnvGroup.visible = isEnvelopeVisible;
            }
        });
    }
});

/**
 * 戰術規劃階段：更新敵機鎖定框 (包含 3D 投影與地形遮蔽判定)
 */
window.updateDynamicHUD = function(teamObj) {
    const hudElement = document.getElementById('dynamic-hud');
    const shapeElement = document.getElementById('hud-shape');
    if (!hudElement || !shapeElement || !teamObj) return;

    const enemyId = teamObj.id === 'red' ? 'blue' : 'red';
    const enemyObj = teams[enemyId];

    // 如果敵機不存在、被擊毀或處於重播模式，則隱藏 HUD
    if (!enemyObj || !enemyObj.wrapper || enemyObj.isDestroyed || window.replayMode || isAnimating) {
        hudElement.style.display = 'none';
        return;
    }

    // 1. 座標轉換 (3D to 2D)
    const enemyPos = enemyObj.wrapper.position.clone();
    enemyPos.project(camera);

    // 檢查是否在攝影機背後 (防鬼影)
    if (enemyPos.z > 1) {
        hudElement.style.display = 'none';
        return;
    }

    // 轉換為螢幕像素
    const screenX = (enemyPos.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = -(enemyPos.y * 0.5 - 0.5) * window.innerHeight;

    // 將座標寫入 left 和 top，並保留 CSS 裡原本的 -50% 置中效果
    hudElement.style.left = `${screenX}px`;
    hudElement.style.top = `${screenY}px`;
    hudElement.style.transform = `translate(-50%, -50%)`; 
    hudElement.style.display = 'block';

    // 2. 地形遮蔽 (LOS) 判定
    const raycaster = new THREE.Raycaster();
    const direction = new THREE.Vector3().subVectors(enemyObj.wrapper.position, camera.position).normalize();
    raycaster.set(camera.position, direction);
    
    // obstacles 是 render.js 裡的建築物陣列
    const intersects = raycaster.intersectObjects(typeof obstacles !== 'undefined' ? obstacles : []);
    const distanceToEnemy = camera.position.distanceTo(enemyObj.wrapper.position);
    
    let isOccluded = (intersects.length > 0 && intersects[0].distance < distanceToEnemy);
    if (isOccluded) {
        hudElement.classList.add('occluded');
        document.getElementById('hud-tgt-type').innerText = 'LOST(LOS)';
    } else {
        hudElement.classList.remove('occluded');
        document.getElementById('hud-tgt-type').innerText = `BOGEY (${enemyObj.type.toUpperCase()})`;
    }

    // 3. 距離與高度更新
    document.getElementById('hud-tgt-alt').innerText = enemyObj.wrapper.position.y.toFixed(1);
    document.getElementById('hud-tgt-dist').innerText = distanceToEnemy.toFixed(1);

    // 4. 武裝狀態與形狀切換 (乾淨靜態版)
    let distance = distanceToEnemy;
    let forward = new THREE.Vector3(0, 0, 1).applyQuaternion(teamObj.wrapper.quaternion).normalize();
    let isHitPredicted = false; 
    let inRange = false;

    if (teamObj.weapon === 'gun') {
        let stats = CONFIG.aircrafts[teamObj.type || 'mig21'].throttleStats[teamObj.throttle] || { gunAngleMult: 1.0, gunRangeMult: 1.0 };
        let dRange = GUN_RANGE * stats.gunRangeMult;
        let dAngle = GUN_ANGLE * stats.gunAngleMult;
        
        let vecToEnemy = new THREE.Vector3().subVectors(enemyObj.wrapper.position, teamObj.wrapper.position);
        let forwardDist = vecToEnemy.dot(forward);
        
        if (forwardDist > 0 && forwardDist <= dRange) {
            inRange = true;
            let timeSinceSpawn = forwardDist / (dRange * 2.0);
            let gravDrop = 0.5 * 9.8 * (timeSinceSpawn * 2) * (timeSinceSpawn * 2) * 0.5;
            let expectedBulletPos = teamObj.wrapper.position.clone().add(forward.clone().multiplyScalar(forwardDist));
            expectedBulletPos.y -= gravDrop;
            
            let coneRadius = forwardDist * Math.tan(dAngle);
            if (expectedBulletPos.distanceTo(enemyObj.wrapper.position) <= coneRadius) {
                isHitPredicted = true; 
            }
        }
    } else if (teamObj.weapon === 'missile') {
        let angle = forward.angleTo(new THREE.Vector3().subVectors(enemyObj.wrapper.position, teamObj.wrapper.position).normalize());
        if (distance <= SEEKER_RANGE) {
            inRange = true;
            let exposedHeat = calculateExposedHeat(100 + enemyObj.heat, enemyObj.wrapper.position, enemyObj.wrapper.quaternion, teamObj.wrapper.position);
            if (angle <= SEEKER_ANGLE && exposedHeat >= SEEKER_MIN_HEAT) {
                isHitPredicted = true;
            }
        }
    }

    // 🟢 清空舊樣式，直接依據武器賦予單一形狀，絕對不疊加！
    shapeElement.className = ''; 

    if (inRange) {
        if (teamObj.weapon === 'gun') {
            shapeElement.classList.add('shape-gun');
        } else {
            shapeElement.classList.add('shape-circle');
        }
    } else {
        shapeElement.classList.add('shape-square');
    }

    // 若必中，加上靜態高亮效果
    if (isHitPredicted && !isOccluded) {
        shapeElement.classList.add('predicted-hit');
    }
};

/**
 * 重播階段：更新浮動速度與高度標籤
 */
window.updateReplayTags = function(currentLog, animProgress) {
    if (!window.replayMode && (typeof isAnimating === 'undefined' || !isAnimating)) {
        document.getElementById('replay-tag-red').style.display = 'none';
        document.getElementById('replay-tag-blue').style.display = 'none';
        return;
    }

    ['red', 'blue'].forEach(id => {
        let tag = document.getElementById(`replay-tag-${id}`);
        let t = teams[id];
        
        if (!tag || !t.wrapper || t.isDestroyed || !currentLog[id]) {
            if(tag) tag.style.display = 'none';
            return;
        }

        // 3D 轉 2D 投影
        let pos = t.wrapper.position.clone();
        pos.project(camera);
        if (pos.z > 1) { tag.style.display = 'none'; return; } // 背後防鬼影

        let screenX = (pos.x * 0.5 + 0.5) * window.innerWidth;
        let screenY = -(pos.y * 0.5 - 0.5) * window.innerHeight;

        tag.style.left = `${screenX + 20}px`;
        tag.style.top = `${screenY - 20}px`;
        tag.style.transform = 'none'; // 清除雙重位移
        tag.style.display = 'block';
        
        // 🟢 1. 取得穩定秒速 (m/s)
        let speed = 0;
        let pts = currentLog[id].pts;
        if (pts && pts.length > 1) {
            let turnDist = pts[0].distanceTo(pts[pts.length - 1]);
            speed = (turnDist / 1.5).toFixed(1); 
        }

        // 🟢 2. 解析歷史紀錄中的 AP 與 引擎溫度 (防呆機制：若劇本無資料則抓取當前狀態)
        let ap = currentLog[id].ap !== undefined ? currentLog[id].ap : (t.ap || 0);
        let heat = currentLog[id].heat !== undefined ? currentLog[id].heat : (t.heat || 0);

        // 🟢 3. 拔除 ALT，重組標籤字串 (速度 | AP | 引擎溫度)
        tag.innerText = `SPD:${speed} | AP:${Math.floor(ap)} | TEMP:${Math.floor(heat)}°C`;
    });
};