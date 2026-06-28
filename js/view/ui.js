// ============================================================================
// ui.js - MFD 儀表板與輸入控制 (5檔磁吸滑軌控制)
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

    // 🚀 全新節流閥：5 檔磁吸滑軌控制
    const thrTrack = document.getElementById('throttle-track');
    const thrHandle = document.getElementById('throttle-handle');
    let isDraggingThrottle = false;

    if (thrTrack && thrHandle) {
        const updateThrottleLogic = (clientY) => {
            let currentTeam = typeof tAct !== 'undefined' ? tAct : window.activeTeamId;
            let t = teams[currentTeam]; 
            if (!t || t.isDestroyed || isAnimating || t.ready) return;
            
            const rect = thrTrack.getBoundingClientRect();
            let percent = 1.0 - ((clientY - rect.top) / rect.height);
            percent = Math.max(0, Math.min(1, percent));

            // 🟢 5 檔磁吸邊界計算
            let newLevel = 4; // 預設 MIL (4檔)
            if (percent > 0.9) newLevel = 5;      // AB
            else if (percent > 0.7) newLevel = 4; // MIL
            else if (percent > 0.45) newLevel = 3; // ECO
            else if (percent > 0.2) newLevel = 2; // IDL
            else newLevel = 1;                    // BRK (空氣減速板)

            // 後燃器過熱保險鎖定
            if (newLevel === 5 && t.heat > 40) {
                newLevel = 4; 
                showSMSAlert("🛑 溫度過高：必須低於 40°C 才能點火後燃器！", "#ff0055");
            }

            if (t.throttle !== newLevel) {
                t.throttle = newLevel;
                updateDashboardUI(t); // 自動吸附定位
                if (typeof window.updateTacticalPreview === 'function') window.updateTacticalPreview(t);
            }
        };

        thrHandle.addEventListener('mousedown', (e) => { isDraggingThrottle = true; });
        window.addEventListener('mousemove', (e) => { if (isDraggingThrottle) updateThrottleLogic(e.clientY); });
        window.addEventListener('mouseup', () => { isDraggingThrottle = false; });

        thrHandle.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); isDraggingThrottle = true; }, { passive: false });
        window.addEventListener('touchmove', (e) => { 
            if (isDraggingThrottle) {
                if (e.cancelable) e.preventDefault();
                let touch = Array.from(e.touches).find(evt => evt.target.closest('#throttle-track') || evt.target === thrHandle);
                if (touch) updateThrottleLogic(touch.clientY);
            }
        }, { passive: false });
        window.addEventListener('touchend', () => { isDraggingThrottle = false; });
    }

    // 🌟 SMS 武器切換
    let smsContent = document.getElementById('sms-text-content');
    if(smsContent) smsContent.addEventListener('click', () => {
        let currentTeam = typeof tAct !== 'undefined' ? tAct : window.activeTeamId;
        let t = teams[currentTeam]; 
        if (!t || isAnimating || window.replayMode || t.isDestroyed || t.ready) return;
        
        t.wpnQueued = false; t.queuedAction = 'none';
        if (t.weapon === 'gun') {
            t.weapon = 'missile'; showSMSAlert("🚀 FOX-2 飛彈系統通電中... [請點擊掛架開機]", "#ffbb00");
        } else {
            t.weapon = 'gun'; showSMSAlert("⚠️ 主保險關閉：切換至機砲模式", "#ff0055");   
        }
        updateDashboardUI(t); 
        if(typeof window.updateTacticalPreview === 'function') window.updateTacticalPreview(t);
    });

    // 🌟 掛架控制
    document.querySelectorAll('.pylon-switch-wrapper').forEach(el => {
        el.addEventListener('click', (e) => {
            let currentTeam = typeof tAct !== 'undefined' ? tAct : window.activeTeamId;
            let t = teams[currentTeam]; 
            if (!t || isAnimating || window.replayMode || t.isDestroyed || t.ready) return;
            
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
            updateDashboardUI(t); 
            if(typeof window.updateTacticalPreview === 'function') window.updateTacticalPreview(t);
        });
    });

    // 🌟 武器確認發射
    let btnEnt = document.getElementById('sms-enter-btn');
    if(btnEnt) btnEnt.addEventListener('click', () => {
        let currentTeam = typeof tAct !== 'undefined' ? tAct : window.activeTeamId;
        let t = teams[currentTeam]; 
        if (!t || isAnimating || window.replayMode || t.isDestroyed || t.ready) return;
        
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
        updateDashboardUI(t); 
        if(typeof window.updateTacticalPreview === 'function') window.updateTacticalPreview(t);
    });

    // 🌟 頂部 Flare 釋放與武裝事件
    const btnFlare = document.getElementById('btn-flare');
    if (btnFlare) {
        btnFlare.addEventListener('click', () => {
            let currentTeam = typeof tAct !== 'undefined' ? tAct : window.activeTeamId;
            let t = teams[currentTeam]; 
            if (!t || t.isDestroyed || isAnimating || t.ready) return;
            
            if (t.flareAmmo <= 0) { showSMSAlert("🛑 FLARE EMPTY", "#ff0055"); return; }
            t.flaresArmed = !t.flaresArmed;
            if (t.flaresArmed) { t.wpnQueued = false; t.queuedAction = 'flare'; showSMSAlert("🔆 熱焰彈排程中", "#ff9800");
            } else { t.queuedAction = 'none'; showSMSAlert("⚠️ 熱焰彈解除", "#aaa"); }
            updateDashboardUI(t); 
            if(typeof window.updateTacticalPreview === 'function') window.updateTacticalPreview(t);
        });
    }

    let btnEngage = document.getElementById('btn-engage');
    if(btnEngage) btnEngage.addEventListener('click', () => {
        let currentTeam = typeof tAct !== 'undefined' ? tAct : window.activeTeamId;
        let t = teams[currentTeam]; 
        if (!t || isAnimating || window.replayMode || t.isDestroyed || t.ready) return;
        
        t.joyX = 0; t.joyY = 0; t.roll = 0; t.pendingRoll = 0; t.pendingYaw = 0; t.pendingPitch = 0;
        resetJoystickUI(); t.ready = true; updateDashboardUI(t);
        let oppId = currentTeam === 'red' ? 'blue' : 'red';
        if (teams[oppId].ready || teams[oppId].isDestroyed) { 
            if(window.executeTurnSimultaneously) window.executeTurnSimultaneously();
        } else { 
            if(window.selectTeam) window.selectTeam(oppId); 
        }
    });

    // 🌟 搖桿觸控事件
    const joyZone = document.getElementById('joystick-zone');
    if (joyZone) {
        joyZone.addEventListener('mousedown', startJoystickDrag); window.addEventListener('mousemove', doJoystickDrag); window.addEventListener('mouseup', endJoystickDrag);
        joyZone.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); startJoystickDrag(e.touches[0]); }, { passive: false }); 
        window.addEventListener('touchmove', (e) => { if (isDraggingJoystick) { if (e.cancelable) e.preventDefault(); doJoystickDrag(e.touches[0]); } }, { passive: false }); 
        window.addEventListener('touchend', endJoystickDrag);
    }

    // 🌟 滾轉輪 (Roll Ring) 觸控與旋轉
    const rollRing = document.getElementById('roll-ring'); const staticCenter = document.getElementById('control-assembly-center'); 
    if (rollRing && staticCenter) {
        function startRoll(clientX, clientY, e) {
            let currentTeam = typeof tAct !== 'undefined' ? tAct : window.activeTeamId;
            let t = teams[currentTeam]; 
            if (!t || t.isDestroyed || isAnimating || t.ready) return;
            
            isDraggingRollRing = true; if(e && e.stopPropagation) e.stopPropagation(); 
            const rect = staticCenter.getBoundingClientRect(); initialMouseAngle = Math.atan2(clientX - (rect.left + rect.width / 2), -(clientY - (rect.top + rect.height / 2)));
            initialRingRoll = t.pendingRoll !== 0 ? t.pendingRoll : (t.roll || 0);
        }
        function doRoll(clientX, clientY) {
            if (!isDraggingRollRing) return; 
            let currentTeam = typeof tAct !== 'undefined' ? tAct : window.activeTeamId;
            let t = teams[currentTeam]; if (!t) return;
            
            const rect = staticCenter.getBoundingClientRect(); let currentMouseAngle = Math.atan2(clientX - (rect.left + rect.width / 2), -(clientY - (rect.top + rect.height / 2)));
            let deltaAngle = currentMouseAngle - initialMouseAngle; if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2; if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
            let angle = initialRingRoll + deltaAngle; if (t.gLimiterOn) { const maxRollLimit = Math.PI / 4; angle = Math.max(-maxRollLimit, Math.min(maxRollLimit, angle)); }
            t.pendingRoll = angle; 
            
            rollRing.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`; 
            if (typeof window.updateTacticalPreview === 'function') window.updateTacticalPreview(t);
        }
        function endRoll() { isDraggingRollRing = false; }

        rollRing.addEventListener('mousedown', (e) => startRoll(e.clientX, e.clientY, e));
        window.addEventListener('mousemove', (e) => doRoll(e.clientX, e.clientY));
        window.addEventListener('mouseup', endRoll);
        rollRing.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); startRoll(e.touches[0].clientX, e.touches[0].clientY, e); }, { passive: false });
        window.addEventListener('touchmove', (e) => { if (isDraggingRollRing) { if (e.cancelable) e.preventDefault(); doRoll(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
        window.addEventListener('touchend', endRoll);
    }

    window.updateDashboardUI = updateDashboardUI;
});

function startJoystickDrag(e) { 
    let currentTeam = typeof tAct !== 'undefined' ? tAct : window.activeTeamId; 
    let t = teams[currentTeam]; 
    if (!t || t.isDestroyed || isAnimating || t.ready) return; 
    isDraggingJoystick = true; updateJoystickPosition(e); 
}
function doJoystickDrag(e) { if (!isDraggingJoystick) return; updateJoystickPosition(e); }
function endJoystickDrag() { isDraggingJoystick = false; }

function updateJoystickPosition(e) {
    const joyZone = document.getElementById('joystick-zone'); const joyHandle = document.getElementById('joystick-handle');
    if (!joyZone || !joyHandle) return;
    const rect = joyZone.getBoundingClientRect(); const centerX = rect.left + rect.width / 2; const centerY = rect.top + rect.height / 2; const maxRadius = rect.width / 2 - 15; 
    let dx = e.clientX - centerX; let dy = e.clientY - centerY; let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxRadius) { dx = (dx / dist) * maxRadius; dy = (dy / dist) * maxRadius; dist = maxRadius; }
    joyHandle.style.transform = `translate(${dx}px, ${dy}px)`;
    let currentTeam = typeof tAct !== 'undefined' ? tAct : window.activeTeamId;
    let t = teams[currentTeam];
    if (t) { 
        t.joyX = dx / maxRadius; t.joyY = -dy / maxRadius; t.pendingRoll = 0; t.roll = t.joyX * (Math.PI / 4); 
        if (typeof window.updateTacticalPreview === 'function') window.updateTacticalPreview(t); 
    }
}

function resetJoystickUI() { const joyHandle = document.getElementById('joystick-handle'); if (joyHandle) joyHandle.style.transform = `translate(0px, 0px)`; }

function updateDashboardUI(teamObj) {
    let currentTeam = typeof tAct !== 'undefined' ? tAct : window.activeTeamId;
    if (!teamObj || teamObj.id !== currentTeam) return;

    // 🚀 5 檔磁吸滑動位置
    let handle = document.getElementById('throttle-handle');
    if (handle) {
        if (teamObj.throttle === 5) handle.style.top = '0%';
        else if (teamObj.throttle === 4) handle.style.top = '25%';
        else if (teamObj.throttle === 3) handle.style.top = '50%';
        else if (teamObj.throttle === 2) handle.style.top = '75%';
        else handle.style.top = '100%';
    }

    // 將各個文字檔亮燈
    document.querySelectorAll('#throttle-track .thr-mark').forEach((el, index) => {
        let level = 5 - index;
        if (teamObj.throttle === level) {
            el.classList.add('mark-active');
        } else {
            el.classList.remove('mark-active');
        }
    });

    let baseAp = (typeof teamObj.ap === 'number' && !isNaN(teamObj.ap)) ? teamObj.ap : 120;
    let costAp = (typeof teamObj.previewCostAp === 'number' && !isNaN(teamObj.previewCostAp)) ? teamObj.previewCostAp : 0;
    let previewAp = Math.max(0, baseAp - costAp);

    let baseHeat = (typeof teamObj.heat === 'number' && !isNaN(teamObj.heat)) ? teamObj.heat : 0;
    let accHeat = (typeof teamObj.previewAccumHeat === 'number' && !isNaN(teamObj.previewAccumHeat)) ? teamObj.previewAccumHeat : 0;
    let previewHeat = Math.min(100, baseHeat + accHeat);

    let apVal = document.getElementById('hud-val-ap'); let apNeedle = document.getElementById('needle-ap');
    if (apVal) apVal.innerText = Math.floor(previewAp);
    // 🌟 解鎖 AP 指針上限到 250
    if (apNeedle) {
        let maxGaugeAP = 250; let deg = -90 + (previewAp / maxGaugeAP) * 180; if (isNaN(deg)) deg = -90; deg = Math.max(-90, Math.min(90, deg));
        let theta = deg * Math.PI / 180; let x2 = 50 + 28 * Math.sin(theta); let y2 = 50 - 28 * Math.cos(theta);
        apNeedle.setAttribute('x2', x2); apNeedle.setAttribute('y2', y2); apNeedle.style.transform = ''; 
    }

    let heatVal = document.getElementById('hud-val-heat'); let heatNeedle = document.getElementById('needle-heat');
    if (heatVal) heatVal.innerText = Math.floor(previewHeat);
    // 🌟 指針上限調整至 100 滿表
    if (heatNeedle) {
        let maxGaugeHeat = 100; let deg = -90 + (previewHeat / maxGaugeHeat) * 180; if (isNaN(deg)) deg = -90; deg = Math.max(-90, Math.min(90, deg));
        let theta = deg * Math.PI / 180; let x2 = 50 + 28 * Math.sin(theta); let y2 = 50 - 28 * Math.cos(theta);
        heatNeedle.setAttribute('x2', x2); heatNeedle.setAttribute('y2', y2); heatNeedle.style.transform = ''; 
    }

    let hpFill = document.getElementById('hud-hp-fill-vertical');
    if (hpFill) {
        let currentHp = (typeof teamObj.hp === 'number' && !isNaN(teamObj.hp)) ? teamObj.hp : 100;
        let maxHp = (typeof MAX_HP !== 'undefined' && !isNaN(MAX_HP)) ? MAX_HP : 100;
        let hpPercent = Math.max(0, Math.min(100, (currentHp / maxHp) * 100)); if (isNaN(hpPercent)) hpPercent = 100;
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
            if (stick) {
                stick.className = 'pylon-stick';
                if (p.state === 'empty') { stick.style.background = '#ff0033'; stick.style.boxShadow = '0 0 10px #ff0033'; } 
                else if (p.state === 'powering') { stick.style.background = '#ffaa00'; stick.style.boxShadow = '0 0 12px #ffaa00'; } 
                else if (p.state === 'armed') { stick.style.background = '#00ff88'; stick.style.boxShadow = '0 0 15px #00ff88'; } 
                else { stick.style.background = '#222'; stick.style.boxShadow = 'inset 0 2px 4px #000'; }
            }
        });
    }

    // 🌟 Flare 亮燈
    const btnFlare = document.getElementById('btn-flare');
    if (btnFlare) {
        if (teamObj.flareAmmo <= 0) { 
            btnFlare.className = 'sms-top-btn'; 
            btnFlare.innerText = 'FLARE [0]'; 
            btnFlare.style.color = '#555'; 
            btnFlare.style.borderColor = '#333'; 
            btnFlare.style.background = '#111';
            btnFlare.style.boxShadow = 'none';
        } 
        else if (teamObj.flaresArmed) { 
            btnFlare.className = 'sms-top-btn'; 
            btnFlare.innerText = `FLARE [${teamObj.flareAmmo}]`; 
            btnFlare.style.color = '#fff'; 
            btnFlare.style.borderColor = '#ff9800'; 
            btnFlare.style.background = '#ff6600'; 
            btnFlare.style.boxShadow = '0 0 12px #ff9800';
        } 
        else { 
            btnFlare.className = 'sms-top-btn'; 
            btnFlare.innerText = `FLARE [${teamObj.flareAmmo}]`; 
            btnFlare.style.color = '#ff9800'; 
            btnFlare.style.borderColor = '#ff9800'; 
            btnFlare.style.background = '#111'; 
            btnFlare.style.boxShadow = 'none';
        } 
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
        window.smsAlertTimeout = setTimeout(() => { 
            let currentTeam = typeof tAct !== 'undefined' ? tAct : window.activeTeamId; 
            let t = teams[currentTeam]; 
            if(t) { elSmsContent.style.color = '#ffeb3b'; updateDashboardUI(t); } 
        }, 1800);
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
            if(repSlider) { 
                repSlider.min = 1; 
                repSlider.max = data.maxLog + 0.99; 
                repSlider.step = 0.01; 
                repSlider.disabled = false; 
            }
            break;
        case 'planning':
            if(lockScreen) lockScreen.style.display = 'none';
            if(dashboard) { dashboard.style.pointerEvents = 'auto'; dashboard.style.opacity = '1.0'; }
            if(repStatus) { repStatus.innerText = "狀態: 戰術規劃中"; repStatus.style.color = "#aaa"; }
            if(phaseBanner) { 
                phaseBanner.innerHTML = `ROUND ${data.turn}<br><span style="font-size: 20px; color: #eee; letter-spacing: 4px; text-shadow: 2px 2px 4px #000;">戰術規劃階段</span>`; 
                phaseBanner.style.opacity = '1'; 
                setTimeout(() => { phaseBanner.style.opacity = '0'; }, 2200); 
            }
            break;
        case 'game_over':
            if(lockScreen) lockScreen.style.display = 'none';
            if(phaseBanner) { 
                phaseBanner.innerHTML = `<span style="font-size: 40px; color: #ffeb3b; text-shadow: 2px 2px 10px #ff0000;">ENGAGEMENT OVER</span><br><span style="font-size: 24px; color: #fff;">${data.winner}</span>`; 
                phaseBanner.style.opacity = '1'; 
            }
            break;
    }
});