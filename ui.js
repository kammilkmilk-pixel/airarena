// ============================================================================
// ui.js - MFD 儀表板、輸入控制與隊伍切換 (觸控相容 + 座標修復版)
// ============================================================================

let isDraggingJoystick = false;
let isDraggingRollRing = false;
let initialMouseAngle = 0; 
let initialRingRoll = 0;   
window.lastRenderedTeamId = null;

document.addEventListener("DOMContentLoaded", () => {
    console.log("✈️ UI Manager initialized.");

    let btnRed = document.getElementById('btn-sel-red');
    let btnBlue = document.getElementById('btn-sel-blue');
    if(btnRed && btnBlue) {
        btnRed.addEventListener('click', () => {
            if(typeof selectTeam === 'function') selectTeam('red');
            btnRed.style.border = '2px solid #fff'; btnRed.style.color = '#fff'; btnRed.style.background = '#ff0055'; btnRed.style.boxShadow = '0 0 10px rgba(255,0,85,0.5)';
            btnBlue.style.border = '2px solid #444'; btnBlue.style.color = '#00bcd4'; btnBlue.style.background = '#111'; btnBlue.style.boxShadow = 'none';
        });
        btnBlue.addEventListener('click', () => {
            if(typeof selectTeam === 'function') selectTeam('blue');
            btnBlue.style.border = '2px solid #fff'; btnBlue.style.color = '#fff'; btnBlue.style.background = '#00bcd4'; btnBlue.style.boxShadow = '0 0 10px rgba(0,188,212,0.5)';
            btnRed.style.border = '2px solid #444'; btnRed.style.color = '#ff0055'; btnRed.style.background = '#111'; btnRed.style.boxShadow = 'none';
        });
    }

    [1, 2, 3].forEach(level => {
        let btn = document.getElementById(`btn-thr-${level}`);
        if (btn) {
            btn.addEventListener('click', () => {
                let t = teams[activeTeamId]; if (!t || t.isDestroyed || isAnimating || t.ready) return;
                if (level === 3 && t.heat > 40) { showSMSAlert("🛑 溫度過高：必須低於 40°C 才能點火後燃器！", "#ff0055"); return; }
                t.throttle = level;
                if (typeof updateTrajectoryPreview === 'function') updateTrajectoryPreview(t);
            });
        }
    });

    let smsContent = document.getElementById('sms-text-content');
    if(smsContent) smsContent.addEventListener('click', () => {
        let t = teams[activeTeamId]; if (!t || isAnimating || window.replayMode || t.isDestroyed || t.ready) return;
        t.wpnQueued = false; t.queuedAction = 'none';
        if (t.weapon === 'gun') {
            t.weapon = 'missile'; showSMSAlert("🚀 FOX-2 飛彈系統通電中... [請點擊掛架開機]", "#ffbb00");
        } else {
            t.weapon = 'gun'; showSMSAlert("⚠️ 主保險關閉：切換至機砲模式", "#ff0055");
            if (t.pylons) t.pylons.forEach(p => { if (p.state === 'armed' || p.state === 'powering') p.state = 'standby'; });
        }
        updateDashboardUI(t); if(window.updateTrajectoryPreview) window.updateTrajectoryPreview(t);
    });

    document.querySelectorAll('.pylon-switch-wrapper').forEach(el => {
        el.addEventListener('click', (e) => {
            let t = teams[activeTeamId]; if (!t || isAnimating || window.replayMode || t.isDestroyed || t.ready) return;
            if (t.weapon !== 'missile') { showSMSAlert("⚠️ 錯誤：請先將 SMS 切換至飛彈模式", "#ffcc00"); return; }
            let pylonId = parseInt(e.currentTarget.getAttribute('data-pylon'));
            let p = t.pylons.find(item => item.id === pylonId);
            if (!p || p.state === 'empty') { showSMSAlert("🛑 警告：該掛架彈藥耗盡", "#ff0055"); return; }
            if (p.state === 'standby') {
                p.state = 'powering'; showSMSAlert(`⚡ PYLON ${pylonId} 開始開機通電`, "#ffbb00");
            } else if (p.state === 'powering' || p.state === 'armed') {
                p.state = 'standby'; showSMSAlert(`ℹ️ PYLON ${pylonId} 電源切斷`, "#aaa");
                let hasAnyArmed = t.pylons.some(item => item.state === 'armed');
                if (!hasAnyArmed) { t.wpnQueued = false; t.queuedAction = 'none'; }
            }
            updateDashboardUI(t); if(window.updateTrajectoryPreview) window.updateTrajectoryPreview(t);
        });
    });

    let btnEnt = document.getElementById('sms-enter-btn');
    if(btnEnt) btnEnt.addEventListener('click', () => {
        let t = teams[activeTeamId]; if (!t || isAnimating || window.replayMode || t.isDestroyed || t.ready) return;
        if (t.weapon === 'gun') {
            if (t.wpnQueued && t.queuedAction === 'gun') { t.wpnQueued = false; t.queuedAction = 'none'; showSMSAlert("⚠️ 機砲保險已關閉", "#aaa");
            } else { t.wpnQueued = true; t.queuedAction = 'gun'; showSMSAlert("⚡ 機砲射擊線已通電", "#00ff88"); }
        } else {
            let armedCount = t.pylons.filter(item => item.state === 'armed').length;
            let poweringCount = t.pylons.filter(item => item.state === 'powering').length;
            if (armedCount > 0) {
                if (t.wpnQueued && t.queuedAction === 'missile') { t.wpnQueued = false; t.queuedAction = 'none'; showSMSAlert("⚠️ 飛彈發射排程已取消", "#aaa");
                } else { t.wpnQueued = true; t.queuedAction = 'missile'; showSMSAlert(`⚡ 飛彈排程鎖定 (${armedCount} 枚)`, "#00ffff"); }
            } else if (poweringCount > 0) { showSMSAlert("🛑 尋標頭開機中！", "#ffbb00");
            } else { t.wpnQueued = false; t.queuedAction = 'none'; showSMSAlert("🛑 無掛架就緒", "#ff0055"); }
        }
        updateDashboardUI(t); if(window.updateTrajectoryPreview) window.updateTrajectoryPreview(t);
    });

    const btnFlare = document.getElementById('btn-flare');
    if (btnFlare) {
        btnFlare.addEventListener('click', () => {
            let t = teams[activeTeamId]; if (!t || t.isDestroyed || isAnimating || t.ready) return;
            if (t.flareAmmo <= 0) { showSMSAlert("🛑 FLARE EMPTY", "#ff0055"); return; }
            t.flaresArmed = !t.flaresArmed;
            if (t.flaresArmed) { t.wpnQueued = false; t.queuedAction = 'flare'; showSMSAlert("🔆 熱焰彈排程中", "#ff9800");
            } else { t.queuedAction = 'none'; showSMSAlert("⚠️ 熱焰彈解除", "#aaa"); }
            updateDashboardUI(t); if (typeof updateTrajectoryPreview === 'function') updateTrajectoryPreview(t);
        });
    }

    let btnGlim = document.getElementById('btn-glimiter');
    if(btnGlim) btnGlim.addEventListener('click', () => {
        let t = teams[activeTeamId]; if (!t || isAnimating || window.replayMode || t.isDestroyed || t.ready) return;
        t.gLimiterOn = !t.gLimiterOn; updateDashboardUI(t); if(window.updateTrajectoryPreview) window.updateTrajectoryPreview(t);
    });

    let btnEngage = document.getElementById('btn-engage');
    if(btnEngage) btnEngage.addEventListener('click', () => {
        let t = teams[activeTeamId]; if (!t || isAnimating || window.replayMode || t.isDestroyed || t.ready) return;
        if (t.pathPoints && t.pathPoints.length > 0) {
            t.wrapper.position.copy(t.pathPoints[t.pathPoints.length - 1]);
            t.wrapper.quaternion.copy(t.pathQuats[t.pathQuats.length - 1]);
            t.ap = Math.max(0, t.ap - (t.previewCostAp || 0)); t.heat = Math.min(100, t.heat + (t.previewAccumHeat || 0));
        }
        t.joyX = 0; t.joyY = 0; t.roll = 0; t.pendingRoll = 0; t.pendingYaw = 0; t.pendingPitch = 0;
        resetJoystickUI(); t.ready = true; updateDashboardUI(t);
        let oppId = activeTeamId === 'red' ? 'blue' : 'red';
        if (teams[oppId].ready || teams[oppId].isDestroyed) { if(window.executeTurnSimultaneously) window.executeTurnSimultaneously();
        } else { if(window.selectTeam) window.selectTeam(oppId); }
    });

    // 🌟 搖桿觸控事件
    const joyZone = document.getElementById('joystick-zone');
    if (joyZone) {
        joyZone.addEventListener('mousedown', startJoystickDrag); window.addEventListener('mousemove', doJoystickDrag); window.addEventListener('mouseup', endJoystickDrag);
        joyZone.addEventListener('touchstart', (e) => { startJoystickDrag(e.touches[0]); }); window.addEventListener('touchmove', (e) => { doJoystickDrag(e.touches[0]); }); window.addEventListener('touchend', endJoystickDrag);
    }

    // 🌟 滾轉輪 (Roll Ring) 神經中樞：補上觸控事件！
    const rollRing = document.getElementById('roll-ring'); const staticCenter = document.getElementById('control-assembly-center'); 
    if (rollRing && staticCenter) {
        function startRoll(clientX, clientY, e) {
            let t = teams[activeTeamId]; if (!t || t.isDestroyed || isAnimating || t.ready) return;
            isDraggingRollRing = true; if(e && e.stopPropagation) e.stopPropagation(); 
            const rect = staticCenter.getBoundingClientRect(); initialMouseAngle = Math.atan2(clientX - (rect.left + rect.width / 2), -(clientY - (rect.top + rect.height / 2)));
            initialRingRoll = t.pendingRoll !== 0 ? t.pendingRoll : (t.roll || 0);
        }
        function doRoll(clientX, clientY) {
            if (!isDraggingRollRing) return; let t = teams[activeTeamId]; if (!t) return;
            const rect = staticCenter.getBoundingClientRect(); let currentMouseAngle = Math.atan2(clientX - (rect.left + rect.width / 2), -(clientY - (rect.top + rect.height / 2)));
            let deltaAngle = currentMouseAngle - initialMouseAngle; if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2; if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
            let angle = initialRingRoll + deltaAngle; if (t.gLimiterOn) { const maxRollLimit = Math.PI / 4; angle = Math.max(-maxRollLimit, Math.min(maxRollLimit, angle)); }
            t.pendingRoll = angle; rollRing.style.transform = `rotate(${angle}rad)`; if (typeof updateTrajectoryPreview === 'function') updateTrajectoryPreview(t);
        }
        function endRoll() { isDraggingRollRing = false; }

        // 滑鼠綁定
        rollRing.addEventListener('mousedown', (e) => startRoll(e.clientX, e.clientY, e));
        window.addEventListener('mousemove', (e) => doRoll(e.clientX, e.clientY));
        window.addEventListener('mouseup', endRoll);
        // 手機觸控綁定
        rollRing.addEventListener('touchstart', (e) => { startRoll(e.touches[0].clientX, e.touches[0].clientY, e); });
        window.addEventListener('touchmove', (e) => { doRoll(e.touches[0].clientX, e.touches[0].clientY); });
        window.addEventListener('touchend', endRoll);
    }

    window.updateDashboardUI = updateDashboardUI;
});

function startJoystickDrag(e) { let t = teams[activeTeamId]; if (!t || t.isDestroyed || isAnimating || t.ready) return; isDraggingJoystick = true; updateJoystickPosition(e); }
function doJoystickDrag(e) { if (!isDraggingJoystick) return; updateJoystickPosition(e); }
function endJoystickDrag() { isDraggingJoystick = false; }

function updateJoystickPosition(e) {
    const joyZone = document.getElementById('joystick-zone'); const joyHandle = document.getElementById('joystick-handle');
    if (!joyZone || !joyHandle) return;
    const rect = joyZone.getBoundingClientRect(); const centerX = rect.left + rect.width / 2; const centerY = rect.top + rect.height / 2; const maxRadius = rect.width / 2 - 15; 
    let dx = e.clientX - centerX; let dy = e.clientY - centerY; let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxRadius) { dx = (dx / dist) * maxRadius; dy = (dy / dist) * maxRadius; dist = maxRadius; }
    joyHandle.style.transform = `translate(${dx}px, ${dy}px)`;
    let t = teams[activeTeamId];
    if (t) { t.joyX = dx / maxRadius; t.joyY = -dy / maxRadius; t.pendingRoll = 0; t.roll = t.joyX * (Math.PI / 4); if (typeof updateTrajectoryPreview === 'function') updateTrajectoryPreview(t); }
}

function resetJoystickUI() { const joyHandle = document.getElementById('joystick-handle'); if (joyHandle) joyHandle.style.transform = `translate(0px, 0px)`; }

function updateDashboardUI(teamObj) {
    if (!teamObj || teamObj.id !== activeTeamId) return;

    // 🌟 復活 XYZ 座標：自動偵測多種常見 ID 命名，只要有就可以更新！
    let xEl = document.getElementById('hud-val-x') || document.getElementById('val-x') || document.getElementById('pos-x') || document.getElementById('x-val');
    let yEl = document.getElementById('hud-val-y') || document.getElementById('val-y') || document.getElementById('pos-y') || document.getElementById('y-val');
    let zEl = document.getElementById('hud-val-z') || document.getElementById('val-z') || document.getElementById('pos-z') || document.getElementById('z-val');
    if (teamObj.wrapper) {
        if (xEl) xEl.innerText = teamObj.wrapper.position.x.toFixed(1);
        if (yEl) yEl.innerText = teamObj.wrapper.position.y.toFixed(1);
        if (zEl) zEl.innerText = teamObj.wrapper.position.z.toFixed(1);
    }

    [1, 2, 3].forEach(level => { let btn = document.getElementById(`btn-thr-${level}`); if (btn) btn.classList.toggle('active', teamObj.throttle === level); });

    let baseAp = (typeof teamObj.ap === 'number' && !isNaN(teamObj.ap)) ? teamObj.ap : 100;
    let costAp = (typeof teamObj.previewCostAp === 'number' && !isNaN(teamObj.previewCostAp)) ? teamObj.previewCostAp : 0;
    let previewAp = Math.max(0, baseAp - costAp);

    let baseHeat = (typeof teamObj.heat === 'number' && !isNaN(teamObj.heat)) ? teamObj.heat : 0;
    let accHeat = (typeof teamObj.previewAccumHeat === 'number' && !isNaN(teamObj.previewAccumHeat)) ? teamObj.previewAccumHeat : 0;
    let previewHeat = Math.min(1000, baseHeat + accHeat);

    let apVal = document.getElementById('hud-val-ap');
    let apNeedle = document.getElementById('needle-ap');
    if (apVal) apVal.innerText = Math.floor(previewAp);
    if (apNeedle) {
        let deg = -90 + (previewAp / 100) * 180;
        if (isNaN(deg)) deg = -90; 
        deg = Math.max(-90, Math.min(90, deg));
        
        let theta = deg * Math.PI / 180;
        let x2 = 50 + 28 * Math.sin(theta);
        let y2 = 50 - 28 * Math.cos(theta);
        
        apNeedle.setAttribute('x2', x2);
        apNeedle.setAttribute('y2', y2);
        apNeedle.style.transform = ''; 
    }

    let heatVal = document.getElementById('hud-val-heat');
    let heatNeedle = document.getElementById('needle-heat');
    if (heatVal) heatVal.innerText = Math.floor(previewHeat);
    if (heatNeedle) {
        let deg = -90 + (previewHeat / 200) * 180;
        if (isNaN(deg)) deg = -90;
        deg = Math.max(-90, Math.min(90, deg));
        
        let theta = deg * Math.PI / 180;
        let x2 = 50 + 28 * Math.sin(theta);
        let y2 = 50 - 28 * Math.cos(theta);
        
        heatNeedle.setAttribute('x2', x2);
        heatNeedle.setAttribute('y2', y2);
        heatNeedle.style.transform = ''; 
    }

    let hpFill = document.getElementById('hud-hp-fill-vertical');
    if (hpFill) {
        let currentHp = (typeof teamObj.hp === 'number' && !isNaN(teamObj.hp)) ? teamObj.hp : 100;
        let maxHp = (typeof MAX_HP !== 'undefined' && !isNaN(MAX_HP)) ? MAX_HP : 100;
        let hpPercent = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
        if (isNaN(hpPercent)) hpPercent = 100;
        
        hpFill.style.height = `${hpPercent}%`;
        if (hpPercent < 30) { hpFill.style.backgroundColor = '#ff1100'; hpFill.style.boxShadow = '0 0 10px #ff1100'; } 
        else { let tColor = teamObj.id === 'red' ? '#ff0055' : '#00bcd4'; hpFill.style.backgroundColor = tColor; hpFill.style.boxShadow = `0 0 10px ${tColor}`; }
    }

    let isLocked = false; const enemyObj = teamObj.id === 'red' ? teams.blue : teams.red;
    if (teamObj.wrapper && enemyObj.wrapper && !enemyObj.isDestroyed) {
        let distance = teamObj.wrapper.position.distanceTo(enemyObj.wrapper.position); let forward = new THREE.Vector3(0, 0, 1).applyQuaternion(teamObj.wrapper.quaternion).normalize(); let angle = forward.angleTo(new THREE.Vector3().subVectors(enemyObj.wrapper.position, teamObj.wrapper.position).normalize());
        isLocked = teamObj.weapon === 'gun' ? (distance <= 35 && angle <= Math.PI/12) : (distance <= 60 && angle <= Math.PI/12);
    }

    let elSmsContent = document.getElementById('sms-text-content');
    if (elSmsContent) {
        let wpnName = teamObj.weapon === 'gun' ? '機砲' : '飛彈'; let statusText = '[就緒]';
        if (teamObj.wpnQueued) { statusText = '[已排程]'; } 
        else if (teamObj.weapon === 'missile') {
            let armedCount = teamObj.pylons ? teamObj.pylons.filter(p => p.state === 'armed').length : 0; let poweringCount = teamObj.pylons ? teamObj.pylons.filter(p => p.state === 'powering').length : 0;
            statusText = armedCount > 0 ? (isLocked ? '[已鎖定]' : '[就緒]') : (poweringCount > 0 ? '[開機中]' : '[未通電]');
        } else { statusText = isLocked ? '[已鎖定]' : '[就緒]'; wpnName = `機砲 [INF]`; }
        elSmsContent.innerText = `狀態 ${statusText} ${wpnName}`;
    }

    if (teamObj.pylons) {
        teamObj.pylons.forEach(p => {
            let stick = document.getElementById(`pylon-stick-${p.id}`); let lamp = document.getElementById(`pylon-lamp-${p.id}`);
            if (stick && lamp) {
                if (p.state === 'empty') { stick.className = 'pylon-stick'; lamp.className = 'pylon-lamp'; lamp.style.opacity = '0.1'; } 
                else if (p.state === 'powering') { stick.className = 'pylon-stick stick-up'; lamp.className = 'pylon-lamp lamp-cold'; } 
                else if (p.state === 'armed') { stick.className = 'pylon-stick stick-up'; lamp.className = 'pylon-lamp lamp-hot'; } 
                else { stick.className = 'pylon-stick'; lamp.className = 'pylon-lamp'; lamp.style.opacity = '0.3'; }
            }
        });
    }

    let btnGlim = document.getElementById('btn-glimiter'); if (btnGlim) btnGlim.className = teamObj.gLimiterOn ? 'cockpit-rect-btn btn-g-limit active' : 'cockpit-rect-btn btn-g-limit';
    const btnFlare = document.getElementById('btn-flare');
    if (btnFlare) {
        if (teamObj.flareAmmo <= 0) { btnFlare.className = 'cockpit-rect-btn empty'; btnFlare.innerText = 'FLARE [0]'; } 
        else if (teamObj.flaresArmed) { btnFlare.className = 'cockpit-rect-btn armed'; btnFlare.innerText = `🔥 FLARE [${teamObj.flareAmmo}]`; } 
        else { btnFlare.className = 'cockpit-rect-btn'; btnFlare.innerText = `FLARE [${teamObj.flareAmmo}]`; }
    }
    let btnEngage = document.getElementById('btn-engage');
    if (btnEngage) {
        if (teamObj.ready) { btnEngage.className = 'cockpit-rect-btn btn-standby ready'; btnEngage.innerText = '✔ 就緒'; } 
        else { btnEngage.className = 'cockpit-rect-btn btn-standby'; btnEngage.innerText = '待命'; }
    }
}

function showSMSAlert(text, color) {
    let elSmsContent = document.getElementById('sms-text-content');
    if (elSmsContent) {
        elSmsContent.innerText = text; elSmsContent.style.color = color || '#00ff88';
        if(window.smsAlertTimeout) clearTimeout(window.smsAlertTimeout);
        window.smsAlertTimeout = setTimeout(() => { let t = teams[activeTeamId]; if(t) { elSmsContent.style.color = '#ffeb3b'; updateDashboardUI(t); } }, 1800);
    }
}