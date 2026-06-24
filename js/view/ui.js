// ============================================================================
// ui.js - MFD 儀表板、輸入控制與隊伍切換 (觸控相容 + 座標修復 + 多指防跳躍完美版)
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
    
    // 🌟 注入 CSS：改用相對定位 (relative)，讓按鈕能融入父容器的排版
    const style = document.createElement('style');
    style.innerHTML = `
        /* 改造紅藍切換按鈕，移除 fixed 定位 */
        #btn-sel-red, #btn-sel-blue {
            position: relative !important; 
            width: 32px !important;
            height: 32px !important;
            border-radius: 50% !important;
            padding: 0 !important;
            min-width: 0 !important;
            color: transparent !important; 
            text-indent: -9999px;
            cursor: pointer;
            transition: all 0.3s ease;
            flex-shrink: 0; /* 防止在窄手機螢幕上被擠壓變扁 */
            margin: 0 10px; /* 與播放器按鈕保持舒適的間距 */
        }
        #btn-sel-red { background: #ff0055 !important; }
        #btn-sel-blue { background: #00bcd4 !important; }
        
        /* 隱藏 XYZ 盲腸 */
        #hud-val-x, #hud-val-y, #hud-val-z { display: none !important; }
        .xyz-container, .coordinate-panel { display: none !important; }
    `;
    document.head.appendChild(style);

    if(btnRed && btnBlue) {
        btnRed.innerText = '';
        btnBlue.innerText = '';

        // 🚀 核心魔法：尋找播放面板，並把圓點直接塞進去！
        let repPlayBtn = document.getElementById('btn-rep-play');
        if (repPlayBtn && repPlayBtn.parentElement) {
            let repPanel = repPlayBtn.parentElement;
            
            // 將播放面板升級為 Flexbox 排版，讓裡面的元素自動置中對齊
            repPanel.style.display = 'flex';
            repPanel.style.alignItems = 'center';
            repPanel.style.justifyContent = 'center';
            
            // 把紅隊圓點插入到播放面板的最前方 (左邊)
            repPanel.insertBefore(btnRed, repPanel.firstChild);
            
            // 把藍隊圓點附加到播放面板的最後方 (右邊)
            repPanel.appendChild(btnBlue);
        }

        btnRed.addEventListener('click', () => {
            if(typeof selectTeam === 'function') selectTeam('red');
            btnRed.style.border = '3px solid #fff'; btnRed.style.boxShadow = '0 0 15px #ff0055';
            btnBlue.style.border = '2px solid #444'; btnBlue.style.boxShadow = 'none';
        });
        btnBlue.addEventListener('click', () => {
            if(typeof selectTeam === 'function') selectTeam('blue');
            btnBlue.style.border = '3px solid #fff'; btnBlue.style.boxShadow = '0 0 15px #00bcd4';
            btnRed.style.border = '2px solid #444'; btnRed.style.boxShadow = 'none';
        });
        
        // 開局初始化外觀
        if(window.tAct === 'red') btnRed.click();
        else btnBlue.click();
    }

    [1, 2, 3].forEach(level => {
        let btn = document.getElementById(`btn-thr-${level}`);
        if (btn) {
            btn.addEventListener('click', () => {
                let t = teams[tAct]; if (!t || t.isDestroyed || isAnimating || t.ready) return;
                if (level === 3 && t.heat > 40) { showSMSAlert("🛑 溫度過高：必須低於 40°C 才能點火後燃器！", "#ff0055"); return; }
                t.throttle = level;
                if (typeof updateTrajectoryPreview === 'function') updateTrajectoryPreview(t);
            });
        }
    });

    let smsContent = document.getElementById('sms-text-content');
    if(smsContent) smsContent.addEventListener('click', () => {
        let t = teams[tAct]; if (!t || isAnimating || window.replayMode || t.isDestroyed || t.ready) return;
        t.wpnQueued = false; t.queuedAction = 'none';
        if (t.weapon === 'gun') {
            t.weapon = 'missile'; showSMSAlert("🚀 FOX-2 飛彈系統通電中... [請點擊掛架開機]", "#ffbb00");
        } else {
            t.weapon = 'gun'; showSMSAlert("⚠️ 主保險關閉：切換至機砲模式", "#ff0055");   
        }
        updateDashboardUI(t); if(window.updateTrajectoryPreview) window.updateTrajectoryPreview(t);
    });

    document.querySelectorAll('.pylon-switch-wrapper').forEach(el => {
        el.addEventListener('click', (e) => {
            let t = teams[tAct]; if (!t || isAnimating || window.replayMode || t.isDestroyed || t.ready) return;
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
        let t = teams[tAct]; if (!t || isAnimating || window.replayMode || t.isDestroyed || t.ready) return;
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
            let t = teams[tAct]; if (!t || t.isDestroyed || isAnimating || t.ready) return;
            if (t.flareAmmo <= 0) { showSMSAlert("🛑 FLARE EMPTY", "#ff0055"); return; }
            t.flaresArmed = !t.flaresArmed;
            if (t.flaresArmed) { t.wpnQueued = false; t.queuedAction = 'flare'; showSMSAlert("🔆 熱焰彈排程中", "#ff9800");
            } else { t.queuedAction = 'none'; showSMSAlert("⚠️ 熱焰彈解除", "#aaa"); }
            updateDashboardUI(t); if (typeof updateTrajectoryPreview === 'function') updateTrajectoryPreview(t);
        });
    }

    let btnGlim = document.getElementById('btn-glimiter');
    if(btnGlim) btnGlim.addEventListener('click', () => {
        let t = teams[tAct]; if (!t || isAnimating || window.replayMode || t.isDestroyed || t.ready) return;
        t.gLimiterOn = !t.gLimiterOn; updateDashboardUI(t); if(window.updateTrajectoryPreview) window.updateTrajectoryPreview(t);
    });

    let btnEngage = document.getElementById('btn-engage');
    if(btnEngage) btnEngage.addEventListener('click', () => {
        let t = teams[tAct]; if (!t || isAnimating || window.replayMode || t.isDestroyed || t.ready) return;
        if (t.pathPoints && t.pathPoints.length > 0) {
            t.wrapper.position.copy(t.pathPoints[t.pathPoints.length - 1]);
            t.wrapper.quaternion.copy(t.pathQuats[t.pathQuats.length - 1]);
            t.ap = Math.max(0, t.ap - (t.previewCostAp || 0)); t.heat = Math.min(100, t.heat + (t.previewAccumHeat || 0));
        }
        t.joyX = 0; t.joyY = 0; t.roll = 0; t.pendingRoll = 0; t.pendingYaw = 0; t.pendingPitch = 0;
        resetJoystickUI(); t.ready = true; updateDashboardUI(t);
        let oppId = tAct === 'red' ? 'blue' : 'red';
        if (teams[oppId].ready || teams[oppId].isDestroyed) { if(window.executeTurnSimultaneously) window.executeTurnSimultaneously();
        } else { if(window.selectTeam) window.selectTeam(oppId); }
    });

    // 🌟 搖桿精密控制綁定 (防死鎖、多指防劫持暴跳)
    const joyZone = document.getElementById('joystick-zone');
    if (joyZone) {
        joyZone.addEventListener('mousedown', startJoystickDrag); 
        window.addEventListener('mousemove', doJoystickDrag); 
        window.addEventListener('mouseup', endJoystickDrag);
        
        // 移動端優化：阻止彈性滾動，防止網頁卡死搖桿
        joyZone.addEventListener('touchstart', (e) => { 
            if (e.cancelable) e.preventDefault(); 
            startJoystickDrag(e.targetTouches[0] || e.touches[0]); 
        }, { passive: false }); 
        
        window.addEventListener('touchmove', (e) => { 
            if (isDraggingJoystick) {
                // 精確篩選：只追蹤最初落在搖桿區域內的觸控點，徹底無視另外一根點擊螢幕的手指
                let touch = Array.from(e.touches).find(t => t.target.closest('#joystick-zone') || t.target === joyZone);
                if (touch) {
                    if (e.cancelable) e.preventDefault();
                    doJoystickDrag(touch);
                }
            }
        }, { passive: false }); 
        
        window.addEventListener('touchend', endJoystickDrag);
    }

    // 🌟 滾轉輪 (Roll Ring) 精密控制綁定
    const rollRing = document.getElementById('roll-ring'); const staticCenter = document.getElementById('control-assembly-center'); 
    if (rollRing && staticCenter) {
        function startRoll(clientX, clientY, e) {
            let t = teams[tAct]; if (!t || t.isDestroyed || isAnimating || t.ready) return;
            isDraggingRollRing = true; if(e && e.stopPropagation) e.stopPropagation(); 
            const rect = staticCenter.getBoundingClientRect(); initialMouseAngle = Math.atan2(clientX - (rect.left + rect.width / 2), -(clientY - (rect.top + rect.height / 2)));
            initialRingRoll = t.pendingRoll !== 0 ? t.pendingRoll : (t.roll || 0);
        }
        function doRoll(clientX, clientY) {
            if (!isDraggingRollRing) return; let t = teams[tAct]; if (!t) return;
            const rect = staticCenter.getBoundingClientRect(); let currentMouseAngle = Math.atan2(clientX - (rect.left + rect.width / 2), -(clientY - (rect.top + rect.height / 2)));
            let deltaAngle = currentMouseAngle - initialMouseAngle; if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2; if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
            let angle = initialRingRoll + deltaAngle; if (t.gLimiterOn) { const maxRollLimit = Math.PI / 4; angle = Math.max(-maxRollLimit, Math.min(maxRollLimit, angle)); }
            t.pendingRoll = angle; rollRing.style.transform = `rotate(${angle}rad)`; if (typeof updateTrajectoryPreview === 'function') updateTrajectoryPreview(t);
        }
        function endRoll() { isDraggingRollRing = false; }

        rollRing.addEventListener('mousedown', (e) => startRoll(e.clientX, e.clientY, e));
        window.addEventListener('mousemove', (e) => doRoll(e.clientX, e.clientY));
        window.addEventListener('mouseup', endRoll);
        
        rollRing.addEventListener('touchstart', (e) => { 
            if (e.cancelable) e.preventDefault(); 
            startRoll(e.touches[0].clientX, e.touches[0].clientY, e); 
        }, { passive: false });
        
        window.addEventListener('touchmove', (e) => { 
            if (isDraggingRollRing) {
                let touch = Array.from(e.touches).find(t => t.target.closest('#roll-ring') || t.target === rollRing);
                if (touch) {
                    if (e.cancelable) e.preventDefault();
                    doRoll(touch.clientX, touch.clientY);
                }
            }
        }, { passive: false });
        
        window.addEventListener('touchend', endRoll);
    }

    window.updateDashboardUI = updateDashboardUI;
});

function startJoystickDrag(e) { let t = teams[tAct]; if (!t || t.isDestroyed || isAnimating || t.ready) return; isDraggingJoystick = true; updateJoystickPosition(e); }
function doJoystickDrag(e) { if (!isDraggingJoystick) return; updateJoystickPosition(e); }
function endJoystickDrag() { isDraggingJoystick = false; }

function updateJoystickPosition(e) {
    const joyZone = document.getElementById('joystick-zone'); const joyHandle = document.getElementById('joystick-handle');
    if (!joyZone || !joyHandle) return;
    const rect = joyZone.getBoundingClientRect(); const centerX = rect.left + rect.width / 2; const centerY = rect.top + rect.height / 2; const maxRadius = rect.width / 2 - 15; 
    let dx = e.clientX - centerX; let dy = e.clientY - centerY; let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxRadius) { dx = (dx / dist) * maxRadius; dy = (dy / dist) * maxRadius; dist = maxRadius; }
    joyHandle.style.transform = `translate(${dx}px, ${dy}px)`;
    let t = teams[tAct];
    if (t) { t.joyX = dx / maxRadius; t.joyY = -dy / maxRadius; t.pendingRoll = 0; t.roll = t.joyX * (Math.PI / 4); if (typeof updateTrajectoryPreview === 'function') updateTrajectoryPreview(t); }
}

function resetJoystickUI() { const joyHandle = document.getElementById('joystick-handle'); if (joyHandle) joyHandle.style.transform = `translate(0px, 0px)`; }

function updateDashboardUI(teamObj) {
    if (!teamObj || teamObj.id !== tAct) return;

    [1, 2, 3].forEach(level => { let btn = document.getElementById(`btn-thr-${level}`); if (btn) btn.classList.toggle('active', teamObj.throttle === level); });

    let baseAp = (typeof teamObj.ap === 'number' && !isNaN(teamObj.ap)) ? teamObj.ap : 100;
    let costAp = (typeof teamObj.previewCostAp === 'number' && !isNaN(teamObj.previewCostAp)) ? teamObj.previewCostAp : 0;
    let previewAp = Math.max(0, baseAp - costAp);

    let baseHeat = (typeof teamObj.heat === 'number' && !isNaN(teamObj.heat)) ? teamObj.heat : 0;
    let accHeat = (typeof teamObj.previewAccumHeat === 'number' && !isNaN(teamObj.previewAccumHeat)) ? teamObj.previewAccumHeat : 0;
    let previewHeat = Math.min(100, baseHeat + accHeat);

    let apVal = document.getElementById('hud-val-ap');
    let apNeedle = document.getElementById('needle-ap');
    if (apVal) apVal.innerText = Math.floor(previewAp);
    if (apNeedle) {
        let maxGaugeAP = 250; 
        let deg = -90 + (previewAp / maxGaugeAP) * 180;
        if (isNaN(deg)) deg = -90; 
        deg = Math.max(-90, Math.min(90, deg));
        let theta = deg * Math.PI / 180;
        let x2 = 50 + 28 * Math.sin(theta); let y2 = 50 - 28 * Math.cos(theta);
        apNeedle.setAttribute('x2', x2); apNeedle.setAttribute('y2', y2); apNeedle.style.transform = ''; 
    }

    let heatVal = document.getElementById('hud-val-heat');
    let heatNeedle = document.getElementById('needle-heat');
    if (heatVal) heatVal.innerText = Math.floor(previewHeat);
    if (heatNeedle) {
        let maxGaugeHeat = 100;
        let deg = -90 + (previewHeat / maxGaugeHeat) * 180;
        if (isNaN(deg)) deg = -90;
        deg = Math.max(-90, Math.min(90, deg));
        let theta = deg * Math.PI / 180;
        let x2 = 50 + 28 * Math.sin(theta); let y2 = 50 - 28 * Math.cos(theta);
        heatNeedle.setAttribute('x2', x2); heatNeedle.setAttribute('y2', y2); heatNeedle.style.transform = ''; 
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
            let stick = document.getElementById(`pylon-stick-${p.id}`); 
            let lamp = document.getElementById(`pylon-lamp-${p.id}`);
            if (lamp) lamp.style.display = 'none'; 

            if (stick) {
                stick.style.width = '18px'; stick.style.height = '18px'; stick.style.borderRadius = '4px'; stick.style.marginTop = '4px'; stick.style.transition = 'all 0.3s ease'; stick.className = 'pylon-stick';
                if (p.state === 'empty') { stick.style.background = '#ff0033'; stick.style.boxShadow = '0 0 10px #ff0033'; } 
                else if (p.state === 'powering') { stick.style.background = '#ffaa00'; stick.style.boxShadow = '0 0 12px #ffaa00'; } 
                else if (p.state === 'armed') { stick.style.background = '#00ff88'; stick.style.boxShadow = '0 0 15px #00ff88'; } 
                else { stick.style.background = '#222'; stick.style.boxShadow = 'inset 0 2px 4px #000'; }
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
        window.smsAlertTimeout = setTimeout(() => { let t = teams[tAct]; if(t) { elSmsContent.style.color = '#ffeb3b'; updateDashboardUI(t); } }, 1800);
    }
}

window.addEventListener('EnginePhaseChanged', (e) => {
    const data = e.detail;
    let lockScreen = document.getElementById('combat-lock-screen');
    let dashboard = document.getElementById('ui-dashboard');
    let repStatus = document.getElementById('replay-status');
    let repSlider = document.getElementById('replay-slider');
    let phaseBanner = document.getElementById('phase-banner');

    switch(data.phase) {
        case 'calculating':
            if(lockScreen) lockScreen.style.display = 'block';
            if(dashboard) { dashboard.style.pointerEvents = 'none'; dashboard.style.opacity = '0.2'; }
            if(repStatus) repStatus.innerText = "狀態: 運算中";
            break;
        case 'playing':
            if(lockScreen) lockScreen.style.display = 'none';
            if(repStatus) repStatus.innerText = "狀態: 播放中";
            if(repSlider) { repSlider.min = 1; repSlider.max = data.maxLog + 0.99; repSlider.step = 0.01; repSlider.disabled = false; }
            break;
        case 'planning':
            if(lockScreen) lockScreen.style.display = 'none';
            if(dashboard) { dashboard.style.pointerEvents = 'auto'; dashboard.style.opacity = '1.0'; }
            if(repStatus) { repStatus.innerText = "狀態: 戰術規劃中"; repStatus.style.color = "#aaa"; }
            if(phaseBanner) { 
                phaseBanner.innerHTML = `ROUND ${data.turn}<br><span style="font-size: 20px; color: #eee; letter-spacing: 4px; text-shadow: 2px 2px 4px #000;">戰術規劃階段</span>`; 
                phaseBanner.style.opacity = '1'; setTimeout(() => { phaseBanner.style.opacity = '0'; }, 2200); 
            }
            break;
        case 'game_over':
            if(lockScreen) lockScreen.style.display = 'none';
            if(phaseBanner) { phaseBanner.innerHTML = `<span style="font-size: 40px; color: #ffeb3b; text-shadow: 2px 2px 10px #ff0000;">ENGAGEMENT OVER</span><br><span style="font-size: 24px; color: #fff;">${data.winner}</span>`; phaseBanner.style.opacity = '1'; }
            break;
    }
});

// ============================================================================
// 📊 自動化守門員：真．即時戰術開發動態看板 (Live Runtime Dev Panel)
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
    // 1. 注入科幻風格的 CSS 樣式
    const style = document.createElement('style');
    style.innerHTML = `
        #live-dev-panel {
            position: fixed; top: 10px; right: 10px; width: 320px;
            background: rgba(16, 16, 16, 0.85); border: 1px solid #00ff88;
            border-radius: 6px; color: #00ff88; font-family: 'Courier New', monospace;
            font-size: 11px; z-index: 999999; box-shadow: 0 0 15px rgba(0,255,136,0.2);
            transition: all 0.3s ease; overflow: hidden;
        }
        #live-dev-panel.collapsed { height: 30px; width: 120px; border-color: #555; color: #aaa; }
        .dev-panel-header { 
            background: rgba(0, 255, 136, 0.15); padding: 6px 10px; 
            font-weight: bold; cursor: pointer; display: flex; justify-content: space-between; align-items: center;
        }
        .dev-panel-content { padding: 10px; max-height: 400px; overflow-y: auto; }
        .dev-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
        .dev-table th, .dev-table td { border-bottom: 1px solid rgba(0,255,136,0.15); padding: 5px 4px; text-align: left; }
        .dev-table th { color: #ffeb3b; font-size: 10px; text-transform: uppercase; }
        .dev-val { color: #fff; font-weight: bold; text-align: right; }
        .dev-section-title { color: #00bcd4; margin-top: 8px; font-weight: bold; border-left: 2px solid #00bcd4; padding-left: 4px; }
    `;
    document.head.appendChild(style);

    // 2. 建立面板的 HTML 結構
    const panel = document.createElement('div');
    panel.id = 'live-dev-panel';
    panel.className = 'collapsed'; // 預設收起，不擋住遊戲畫面
    panel.innerHTML = `
        <div class="dev-panel-header" id="dev-panel-toggle">
            <span>📊 DEV MEMO</span>
            <span id="dev-panel-arrow">展開</span>
        </div>
        <div class="dev-panel-content">
            <div class="dev-section-title">🌍 全域環境物理</div>
            <table class="dev-table">
                <tr><td>世界標準重力 (g)</td><td class="dev-val" id="dev-g">-</td></tr>
                <tr><td>最低失速門檻 (AP)</td><td class="dev-val" id="dev-stall">-</td></tr>
            </table>
            
            <div class="dev-section-title">⚔️ 當前選中隊伍機動 (${tAct.toUpperCase()})</div>
            <table class="dev-table">
                <tr><td>戰機現有動能 (AP)</td><td class="dev-val" id="dev-current-ap">-</td></tr>
                <tr><td>發動機當前溫度 (°C)</td><td class="dev-val" id="dev-current-heat">-</td></tr>
                <tr><td>失速狀態 (Stalled)</td><td class="dev-val" id="dev-current-stall">-</td></tr>
            </table>

            <div class="dev-section-title">💥 航向機砲主參數</div>
            <table class="dev-table">
                <tr><td>安裝向上仰角 (Elevation)</td><td class="dev-val" id="dev-gun-el">-</td></tr>
                <tr><td>砲彈專屬重力乘數 (Mult)</td><td class="dev-val" id="dev-gun-gmult">-</td></tr>
                <tr><td>武器核心極限射程 (Range)</td><td class="dev-val" id="dev-gun-range">-</td></tr>
            </table>
        </div>
    `;
    document.body.appendChild(panel);

    // 3. 綁定點擊收起/展開事件
    const toggleBtn = document.getElementById('dev-panel-toggle');
    const arrow = document.getElementById('dev-panel-arrow');
    toggleBtn.addEventListener('click', () => {
        panel.classList.toggle('collapsed');
        arrow.innerText = panel.classList.contains('collapsed') ? '展開' : '收起';
    });

    // 4. 建立每秒自動記憶體輪詢機制 (Live Echo)
    setInterval(() => {
        if (panel.classList.contains('collapsed')) return; // 收起時暫停刷新，節省效能
        
        try {
            // 讀取全域環境
            document.getElementById('dev-g').innerText = CONFIG.rules.gravity.toFixed(1) + " m/s²";
            document.getElementById('dev-stall').innerText = CONFIG.rules.stallSpeedAP + " AP";
            
            // 讀取即時戰機狀態
            let t = teams[tAct];
            document.getElementById('dev-current-ap').innerText = Math.floor(t.ap) + " AP";
            document.getElementById('dev-current-heat').innerText = Math.floor(t.heat) + " °C";
            document.getElementById('dev-current-stall').innerText = t.stalled ? "⚠️ STALL" : "🟢 FLYING";
            document.getElementById('dev-current-stall').style.color = t.stalled ? "#ff0033" : "#00ff88";

            // 讀取最新武器庫物理
            let gun = CONFIG.weapons['gun'];
            let elDeg = ((gun.elevation || 0) * 180 / Math.PI);
            document.getElementById('dev-gun-el').innerText = elDeg.toFixed(1) + "°";
            document.getElementById('dev-gun-gmult').innerText = (gun.gravityMult * 100).toFixed(0) + "%";
            document.getElementById('dev-gun-range').innerText = gun.range + " m";
            
        } catch (err) {
            // 防止開局加載順序導致的短暫 undefined 報錯
        }
    }, 400); // 每 0.4 秒神經網路自動同步一次
});