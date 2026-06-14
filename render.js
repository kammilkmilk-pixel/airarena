// ============================================================================
// render.js - 3D 視覺渲染器 (獨立彈池 + 槍口動態錨定 + 跨回合無縫連射版)
// ============================================================================

const scene = new THREE.Scene(); scene.background = new THREE.Color(0x101010);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000); 
camera.position.set(10, 28.5, -40); 

const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('canvas-container').appendChild(renderer.domElement);
const controls = new THREE.OrbitControls(camera, renderer.domElement); 
controls.minPolarAngle = Math.PI / 6; controls.maxPolarAngle = Math.PI / 1.6; controls.enableDamping = true;
controls.target.set(10, 25, -30); controls.update(); 

scene.add(new THREE.AmbientLight(0xffffff, 0.9)); const dirLight = new THREE.DirectionalLight(0xffffff, 0.4); dirLight.position.set(10, 50, 10); scene.add(dirLight);

const obstacles = []; const gridXZ = new THREE.GridHelper(100, 100, 0x333333, 0x222222); gridXZ.position.set(12, 0, 18); scene.add(gridXZ);
function createBuilding(x, z, h) { const geo = new THREE.BoxGeometry(1, h, 1); const mat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 }); const b = new THREE.Mesh(geo, mat); b.position.set(x + 0.5, h/2, z + 0.5); scene.add(b); obstacles.push(b); }
createBuilding(5, 10, 4); createBuilding(15, 20, 6); createBuilding(8, 25, 5);

const threatEnvGroup = new THREE.Group(); scene.add(threatEnvGroup);
window.ghostWrapper = new THREE.Group(); window.ghostWrapper.visible = false; scene.add(window.ghostWrapper);
const arrowShape = new THREE.Shape(); arrowShape.moveTo(0, 0.4); arrowShape.lineTo(0.25, -0.4); arrowShape.lineTo(0, -0.15); arrowShape.lineTo(-0.25, -0.4); arrowShape.moveTo(0, 0.4);
const ghostTriangle = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false}));
ghostTriangle.rotation.x = Math.PI / 2; ghostTriangle.position.set(0, -0.08, 0);
const ringGeo = new THREE.RingGeometry(0.4, 0.45, 32);
window.ghostRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false}));
window.ghostRing.rotation.x = Math.PI / 2; window.ghostRing.position.y = -0.08;
const ghostCanvas = document.createElement('canvas'); ghostCanvas.width = 128; ghostCanvas.height = 64;
window.ghostCtx = ghostCanvas.getContext('2d'); window.ghostTex = new THREE.CanvasTexture(ghostCanvas);
const ghostTextPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({map: window.ghostTex, transparent: true, side: THREE.DoubleSide, depthTest: false}));
ghostTextPlane.position.set(0, 0.1, -0.5); ghostTextPlane.rotation.set(-Math.PI / 2, 0, Math.PI);
window.ghostWrapper.add(window.ghostRing, ghostTriangle, ghostTextPlane);

const trackMaterialRed = new THREE.MeshBasicMaterial({ color: 0xff0055, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
const trackMaterialBlue = new THREE.MeshBasicMaterial({ color: 0x00bcd4, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
const flareGeo = new THREE.SphereGeometry(0.4, 8, 8); const expGeo = new THREE.SphereGeometry(1, 16, 16); const expMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
const flareMats = [ new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }), new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }), new THREE.MeshBasicMaterial({ color: 0x664422, transparent: true, opacity: 0.5, depthWrite: false }) ];
const visualFlaresPool = [];

// 🌟 獨立彈池：擴大容量以支援連續 3 回合開火 (24 * 3 * 2架飛機 = 足夠了)
const maxVisualBullets = 150; 
const visualBullets = [];
for (let i = 0; i < maxVisualBullets; i++) {
    let pts = new Float32Array(6);
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    let mesh = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, linewidth: 2, blending: THREE.AdditiveBlending }));
    mesh.visible = false;
    scene.add(mesh);
    visualBullets.push(mesh);
}

function createProceduralMissileMesh() {
    let group = new THREE.Group();
    let bodyGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8); bodyGeo.rotateX(Math.PI / 2);
    let body = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: 0xeeeeee })); group.add(body);
    let headGeo = new THREE.ConeGeometry(0.05, 0.2, 8); headGeo.rotateX(Math.PI / 2); headGeo.translate(0, 0, 0.5);
    let head = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xff3333 })); group.add(head);
    for(let i=0; i<4; i++) {
        let finGeo = new THREE.BoxGeometry(0.01, 0.18, 0.15); finGeo.translate(0, 0.08, -0.3);
        let fin = new THREE.Mesh(finGeo, new THREE.MeshBasicMaterial({ color: 0xffcc00 })); fin.rotation.z = (Math.PI / 2) * i; group.add(fin);
    }
    return group;
}

const ghostBeam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,-1,0)]), new THREE.LineBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.6})); 
scene.add(ghostBeam);

window.drawStaticFlares = function() {
    visualFlaresPool.forEach(f => f.visible = false);
    if (typeof globalFlares !== 'undefined') {
        globalFlares.forEach((gf, i) => {
            if (!visualFlaresPool[i]) { let nm = new THREE.Mesh(flareGeo, flareMats[0]); scene.add(nm); visualFlaresPool.push(nm); }
            let fMesh = visualFlaresPool[i]; fMesh.position.copy(gf.pos);
            if (gf.age === 0) { fMesh.material = flareMats[0]; fMesh.scale.set(0.5, 0.5, 0.5); } 
            else if (gf.age === 1) { fMesh.material = flareMats[1]; fMesh.scale.set(1.0, 1.0, 1.0); } 
            else { fMesh.material = flareMats[2]; fMesh.scale.set(1.5, 1.5, 1.5); }
            fMesh.visible = true;
        });
    }
};

function updateSpatialHelpers() {
    ['red', 'blue'].forEach(id => {
        let t = teams[id]; let label = document.getElementById(`alt-label-${id}`);
        if (!t.realBeam) {
            const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,-1,0)]);
            t.realBeam = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({color: id==='red'?0xff0055:0x00bcd4, transparent: true, opacity: 0.5})); 
            scene.add(t.realBeam);
        }
        if (t.wrapper && !t.isDestroyed) { 
            let correctedY = t.wrapper.position.y - 0.08; t.realBeam.position.set(t.wrapper.position.x, correctedY, t.wrapper.position.z); t.realBeam.scale.set(1, Math.max(0.01, correctedY), 1); t.realBeam.visible = true; 
            let pos = t.wrapper.position.clone(); pos.y = pos.y * 0.5; pos.project(camera);
            if (label) { label.style.left = `${(pos.x*.5+.5)*window.innerWidth}px`; label.style.top = `${(pos.y*-.5+.5)*window.innerHeight}px`; label.style.color = id==='red'?'#ff0055':'#00bcd4'; label.innerText = `${t.wrapper.position.y.toFixed(1)}m`; label.style.display = 'block'; }
        } else { if(t.realBeam) t.realBeam.visible = false; if(label) label.style.display = 'none'; }
    });
    
    let ghostLabel = document.getElementById('alt-label-ghost');
    if (window.ghostWrapper && window.ghostWrapper.visible && !window.replayMode) { 
        let correctedGhostY = window.ghostWrapper.position.y - 0.08; ghostBeam.position.set(window.ghostWrapper.position.x, correctedGhostY, window.ghostWrapper.position.z); ghostBeam.scale.set(1, Math.max(0.01, correctedGhostY), 1); ghostBeam.visible = true; 
        let pos = window.ghostWrapper.position.clone(); pos.y = pos.y * 0.5; pos.project(camera);
        if (ghostLabel) { ghostLabel.style.left = `${(pos.x*.5+.5)*window.innerWidth}px`; ghostLabel.style.top = `${(pos.y*-.5+.5)*window.innerHeight}px`; ghostLabel.style.color = tAct==='red'?'#ff0055':'#00bcd4'; ghostLabel.innerText = `${window.ghostWrapper.position.y.toFixed(1)}m`; ghostLabel.style.display = 'block'; }
    } else { ghostBeam.visible = false; if(ghostLabel) ghostLabel.style.display = 'none'; }
}

function drawTrajectoryLine(teamObj) {
    if (trajectoryMeshes[teamObj.id]) { scene.remove(trajectoryMeshes[teamObj.id]); trajectoryMeshes[teamObj.id] = null; }
    if (teamObj.pathPoints.length < 2) { window.ghostWrapper.visible = false; return; }
    teamObj.flightCurve = new THREE.CatmullRomCurve3(teamObj.pathPoints, false, 'catmullrom', 0); 
    const vis = CONFIG.aircrafts['mig21'].visuals; const vertexArray = []; const leftPts = []; const rightPts = []; const steps = teamObj.pathPoints.length * 2;
    for (let i = 0; i <= steps; i++) { let t = i / steps; let pos = teamObj.flightCurve.getPointAt(t); let q = getQuatAt(t, teamObj.pathQuats); let wingDir = new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize(); let centerPos = pos.clone().add(new THREE.Vector3(0, vis.engineOffsetY, vis.tailOffsetZ).applyQuaternion(q)); leftPts.push(centerPos.clone().add(wingDir.clone().multiplyScalar(vis.ribbonWidth / 2))); rightPts.push(centerPos.clone().sub(wingDir.clone().multiplyScalar(vis.ribbonWidth / 2))); }
    for (let i = 0; i < steps; i++) { vertexArray.push(leftPts[i].x, leftPts[i].y, leftPts[i].z, rightPts[i].x, rightPts[i].y, rightPts[i].z, leftPts[i+1].x, leftPts[i+1].y, leftPts[i+1].z); vertexArray.push(rightPts[i].x, rightPts[i].y, rightPts[i].z, rightPts[i+1].x, rightPts[i+1].y, rightPts[i+1].z, leftPts[i+1].x, leftPts[i+1].y, leftPts[i+1].z); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertexArray, 3)); geo.computeVertexNormals();
    trajectoryMeshes[teamObj.id] = new THREE.Mesh(geo, teamObj.id === 'red' ? trackMaterialRed : trackMaterialBlue); scene.add(trajectoryMeshes[teamObj.id]);
    
    if (!isAnimating && !window.replayMode) {
        window.ghostWrapper.visible = true; window.ghostWrapper.position.copy(teamObj.pathPoints[teamObj.pathPoints.length - 1]); window.ghostWrapper.quaternion.copy(teamObj.pathQuats[teamObj.pathQuats.length - 1]);
        window.ghostCtx.clearRect(0,0,128,64); window.ghostCtx.shadowColor = 'rgba(0,0,0,0.9)'; window.ghostCtx.shadowOffsetX = 2; window.ghostCtx.shadowOffsetY = 2; window.ghostCtx.shadowBlur = 4; window.ghostCtx.fillStyle = '#ffeb3b'; window.ghostCtx.font = 'bold 30px Courier New'; window.ghostCtx.textAlign = 'center'; window.ghostCtx.textBaseline = 'middle'; window.ghostCtx.fillText(teamObj.flightCurve.getLength().toFixed(1) + 'm', 64, 32); window.ghostTex.needsUpdate = true;
    } else { window.ghostWrapper.visible = false; }
}

// 🌟 修正版：移除強行繞回機身起點的閉合邏輯，還原成純淨自然的彈道拋物線
function updateGunPreview(teamObj) {
    if (!teamObj.wrapper) return;
    if (!teamObj.userData) teamObj.userData = {};
    if (!teamObj.userData.gunPreview) {
        let pts = new Float32Array(32 * 3);
        let geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
        let g = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.7, linewidth: 2 }));
        scene.add(g); teamObj.userData.gunPreview = g;
    }
    
    if (teamObj.wpnQueued && teamObj.weapon === 'gun' && !isAnimating && !window.replayMode && teamObj.pathPoints && teamObj.pathPoints.length >= 2) {
        let stats = CONFIG.aircrafts[teamObj.type || 'mig21'].throttleStats[teamObj.throttle] || { gunRangeMult: 1.0 };
        let dRange = GUN_RANGE * stats.gunRangeMult; 
        let posArr = teamObj.userData.gunPreview.geometry.attributes.position.array;
        let curve = new THREE.CatmullRomCurve3(teamObj.pathPoints, false, 'catmullrom', 0);
        
        let ptIdx = 0;
        let T_now = 1.0; 

        // 僅描繪這回合在天空中留下的真實子彈流彈道，不再連回過去的飛機
        for (let i = 0; i <= 30; i++) {
            let t_spawn = (i / 30) * 0.95; 
            let sPos = curve.getPointAt(t_spawn); 
            let sQuat = getQuatAt(t_spawn, teamObj.pathQuats);
            let nPos = sPos.clone().add(new THREE.Vector3(0, -0.2, 4.0).applyQuaternion(sQuat));
            let fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(sQuat);
            
            let dt = Math.max(0, T_now - t_spawn); 
            let travelDist = dt * dRange * 2.0; 
            let pt = nPos.clone().add(fwd.multiplyScalar(travelDist));
            pt.y -= 0.5 * 9.8 * (dt * 2) * (dt * 2) * 0.5; // 考慮引力下墜
            
            posArr[ptIdx*3] = pt.x; posArr[ptIdx*3+1] = pt.y; posArr[ptIdx*3+2] = pt.z; 
            ptIdx++;
        }
        
        teamObj.userData.gunPreview.geometry.setDrawRange(0, ptIdx);
        teamObj.userData.gunPreview.geometry.attributes.position.needsUpdate = true; 
        teamObj.userData.gunPreview.visible = true;
    } else { if(teamObj.userData.gunPreview) teamObj.userData.gunPreview.visible = false; }
}

function updateMissilePreview(teamObj) {
    if (!teamObj.pylons) return;
    const enemyObj = teamObj.id === 'red' ? teams.blue : teams.red; 
    if (isAnimating || window.replayMode) { teamObj.pylons.forEach(p => { if (p.lineMesh) { scene.remove(p.lineMesh); p.lineMesh = null; } }); return; }

    let hasPath = teamObj.pathPoints && teamObj.pathPoints.length > 0;
    teamObj.pylons.forEach(p => {
        if(p.lineMesh) { scene.remove(p.lineMesh); p.lineMesh = null; }
        let isFiringNow = p.state === 'armed' && teamObj.wpnQueued && teamObj.weapon === 'missile';
        let activeM = teamObj.activeMissiles ? teamObj.activeMissiles.find(m => m.pylonId === p.id) : null;
        let isFlying = activeM && activeM.active;

        if (p.mesh) { let glowMesh = p.mesh.children.find(child => child.geometry && child.geometry.type === "SphereGeometry"); if (glowMesh) glowMesh.visible = false; }
        if (!isFiringNow && !isFlying) { if (p.mesh) p.mesh.visible = (p.state !== 'empty'); return; }
        if (p.mesh) p.mesh.visible = false;

        let mPos, mQuat, mAP;
        if (isFiringNow && !isFlying) {
            let launchQuat = hasPath ? teamObj.pathQuats[0] : teamObj.wrapper.quaternion;
            let visualLineOffset = new THREE.Vector3(0, -0.5, 0.2); let worldOffset = p.localPosition.clone().add(visualLineOffset).applyQuaternion(launchQuat);
            mPos = (hasPath ? teamObj.pathPoints[0].clone() : teamObj.wrapper.position.clone()).add(worldOffset); mQuat = launchQuat.clone(); mAP = MISSILE_MAX_AP;
        } else { mPos = activeM.pos.clone(); mQuat = activeM.quat.clone(); mAP = activeM.ap; }

        let mPoints = [mPos.clone()]; let simPos = mPos.clone(); let simQuat = mQuat.clone(); let simAP = mAP;
        for (let step = 0; step <= 100; step++) { 
            let ratio = step / 100; let eIdx = Math.min(enemyObj.pathPoints.length - 1, Math.floor(ratio * enemyObj.pathPoints.length)); let targetPos = enemyObj.pathPoints[eIdx] || enemyObj.wrapper.position; let targetQuat = enemyObj.pathQuats[eIdx] || enemyObj.wrapper.quaternion;
            let stepRes = simulateMissileStep(simPos, simQuat, targetPos, targetQuat, simAP, teamObj, enemyObj, []); 
            simPos = stepRes.pos; simQuat = stepRes.quat; simAP = stepRes.ap; mPoints.push(simPos.clone()); 
            if (stepRes.exploded || simAP <= 0) break; 
        }
        
        if (mPoints.length >= 2) {
            let isTracking = mPoints.length < 100 || (mPoints.length > 10 && mPoints[mPoints.length-1].distanceTo(enemyObj.wrapper.position) < 10);
            let lineColor = isTracking ? teamObj.colorMain : 0xffffff; let lineOpacity = isTracking ? 0.8 : 0.4;
            const curve = new THREE.CatmullRomCurve3(mPoints, false, 'catmullrom', 0); const tubeGeo = new THREE.TubeGeometry(curve, mPoints.length * 2, 0.08, 5, false);
            p.lineMesh = new THREE.Mesh(tubeGeo, new THREE.MeshBasicMaterial({ color: lineColor, transparent: true, opacity: lineOpacity })); scene.add(p.lineMesh); 
        }
    });
}

function renderCombatFrame(currentLog, animProgress) {
    if (!currentLog || !battleLog) return;
    
    // 取得當前影格的回合索引 (純函數式狀態推演，支援完美重播倒帶！)
    let turnIdx = battleLog.indexOf(currentLog);
    if (turnIdx === -1) return;

    let trackIdx = Math.min(100, Math.floor(animProgress * 100));

    // 熱焰彈渲染
    visualFlaresPool.forEach(f => f.visible = false); 
    let cFlares = currentLog.flaresTrack[trackIdx] || [];
    cFlares.forEach((cf, i) => {
        if (!visualFlaresPool[i]) { let nm = new THREE.Mesh(flareGeo, flareMats[0]); scene.add(nm); visualFlaresPool.push(nm); }
        let fMesh = visualFlaresPool[i]; fMesh.position.copy(cf.pos);
        if (cf.age === 0) { fMesh.material = flareMats[0]; fMesh.scale.set(0.5, 0.5, 0.5); } 
        else if (cf.age === 1) { fMesh.material = flareMats[1]; fMesh.scale.set(1.0, 1.0, 1.0); } 
        else { fMesh.material = flareMats[2]; fMesh.scale.set(1.5, 1.5, 1.5); }
        fMesh.visible = true;
    });

    let bulletIdx = 0;
    ['red', 'blue'].forEach(id => {
        let t = teams[id]; let enemy = id === 'red' ? teams.blue : teams.red;
        
        let currentPlanePos, currentPlaneQuat;
        if (currentLog[id].pts.length >= 2) {
            let logCurve = new THREE.CatmullRomCurve3(currentLog[id].pts, false, 'catmullrom', 0);
            currentPlanePos = logCurve.getPointAt(animProgress); 
            currentPlaneQuat = getQuatAt(animProgress, currentLog[id].quats);
            t.wrapper.position.copy(currentPlanePos);
            t.wrapper.quaternion.copy(currentPlaneQuat);
            if (id === tAct) { let adi = document.getElementById('adi-sky-ground'); if(adi) adi.style.transform = `rotate(${(new THREE.Euler().setFromQuaternion(currentPlaneQuat, 'YXZ').z * 180) / Math.PI}deg) translateY(${-(new THREE.Euler().setFromQuaternion(currentPlaneQuat, 'YXZ').x * 180) / Math.PI * 1.5}px)`; }
        }

        if (t.userData && t.userData.gunPreview) t.userData.gunPreview.visible = false;
        
        // 取得當前機鼻座標 (作為槍口錨點)
        let currentNosePos = currentPlanePos.clone().add(new THREE.Vector3(0, -0.2, 4.0).applyQuaternion(currentPlaneQuat));

        // 🌟 無狀態時空回溯：往前翻找包含自己在內的「過去 3 個回合」的開火紀錄
        for (let age = 0; age <= 2; age++) {
            let logIdx = turnIdx - age;
            if (logIdx < 0) continue;
            
            let pastLog = battleLog[logIdx];
            if (!pastLog) continue;
            
            let logChain = pastLog[id].chain;
            if (logChain && logChain.length > 0 && logChain[0].fire === 'gun' && pastLog[id].pts.length >= 2) {
                let stats = CONFIG.aircrafts[t.type || 'mig21'].throttleStats[logChain[0].throttle || 2] || { gunRangeMult: 1.0 };
                let dRange = GUN_RANGE * stats.gunRangeMult;
                let pastCurve = new THREE.CatmullRomCurve3(pastLog[id].pts, false, 'catmullrom', 0);

                // 繪製這回合產生的 24 發子彈
                for (let b = 0; b < 24; b++) {
                    if (bulletIdx >= visualBullets.length) break;
                    let mesh = visualBullets[bulletIdx]; 
                    let t_spawn = (b / 23) * 0.95; 

                    // 計算這顆子彈從發射到現在，總共飛了多少「回合時間」
                    let timeSinceSpawn = animProgress - t_spawn + age;
                    
                    // 如果時間為負 (還沒發射)，或是飛太久 (超過 1.5 個回合)，就不畫它
                    if (timeSinceSpawn < 0 || timeSinceSpawn > 1.5) continue;

                    // 找出發射瞬間的姿態與位置
                    let spawnPos = pastCurve.getPointAt(t_spawn); 
                    let spawnQuat = getQuatAt(t_spawn, pastLog[id].quats);
                    let noseOffset = new THREE.Vector3(0, -0.2, 4.0).applyQuaternion(spawnQuat); 
                    let startPos = spawnPos.clone().add(noseOffset);
                    
                    let forward = new THREE.Vector3(0, 0, 1).applyQuaternion(spawnQuat);
                    let spreadX = Math.sin(b * 123.45 + logIdx) * 0.015; let spreadY = Math.cos(b * 678.90 + logIdx) * 0.015;
                    let right = new THREE.Vector3(1, 0, 0).applyQuaternion(spawnQuat); let up = new THREE.Vector3(0, 1, 0).applyQuaternion(spawnQuat);
                    forward.add(right.multiplyScalar(spreadX)).add(up.multiplyScalar(spreadY)).normalize();
                    
                    // 根據總飛行時間計算彈頭位置
                    let travelDist = timeSinceSpawn * dRange * 2.0; 
                    let headPos = startPos.clone().add(forward.clone().multiplyScalar(travelDist));
                    let gravDrop = 0.5 * 9.8 * (timeSinceSpawn * 2) * (timeSinceSpawn * 2) * 0.5; 
                    headPos.y -= gravDrop;

                    let tracerLen = 4; // 曳光彈長度
                    let tailPos;

                    // 🌟 核心視覺欺騙：如果是這回合剛發射的子彈，且還沒完全脫離槍口，把尾巴死死黏在當前機鼻上！
                    if (age === 0 && travelDist < tracerLen) {
                        tailPos = currentNosePos.clone();
                    } else {
                        // 如果飛遠了，或者這是上一回合射出的子彈，就讓它自由脫離
                        tailPos = headPos.clone().sub(forward.clone().multiplyScalar(tracerLen));
                    }
                    
                    mesh.geometry.attributes.position.setXYZ(0, headPos.x, headPos.y, headPos.z); 
                    mesh.geometry.attributes.position.setXYZ(1, tailPos.x, tailPos.y, tailPos.z); 
                    mesh.geometry.attributes.position.needsUpdate = true;
                    
                    mesh.material.color.setHex(id === 'red' ? 0xff5533 : 0x00e5ff); 
                    // 根據飛行時間逐漸淡出
                    mesh.material.opacity = Math.max(0, 1.0 - (timeSinceSpawn / 1.5)); 
                    mesh.visible = true;
                    bulletIdx++;
                }
            }
        }
        
        // 飛彈渲染邏輯維持不變
        if (t.pylons) {
            t.pylons.forEach(p => {
                let mTracks = currentLog[`${id}MslTracks`] ? currentLog[`${id}MslTracks`][p.id] : null; let explodeFrame = currentLog[`${id}ExplodedAt`] ? currentLog[`${id}ExplodedAt`][p.id] : undefined;
                if (mTracks) {
                    if (!p.flyingMesh && missileMeshBase) {
                        p.flyingMesh = new THREE.Group(); let mBody = missileMeshBase.clone(); mBody.traverse(c => { if(c.isMesh) c.visible = true; }); mBody.scale.set(2.5, 2.5, 2.5); p.flyingMesh.add(mBody);
                        let fGlowGeo = new THREE.CylinderGeometry(0.1, 0.4, 2.0, 16); fGlowGeo.rotateX(Math.PI / 2); let fGlowMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }); let flyingGlow = new THREE.Mesh(fGlowGeo, fGlowMat); flyingGlow.position.set(0, -0.5, -1.0); p.flyingMesh.add(flyingGlow); scene.add(p.flyingMesh);
                    }
                    let mTrack = mTracks[trackIdx];
                    if (mTrack && mTrack.pos && !isNaN(mTrack.pos.x)) { p.flyingMesh.position.copy(mTrack.pos); p.flyingMesh.quaternion.copy(mTrack.quat); p.flyingMesh.visible = true; if (p.mesh) p.mesh.visible = false; } else { if (p.flyingMesh) p.flyingMesh.visible = false; }
                    if (explodeFrame !== undefined) {
                        let boomAge = trackIdx - explodeFrame; 
                        if (boomAge >= 0) { if (p.flyingMesh) p.flyingMesh.visible = false; }
                        
                        let isSelfDestruct = currentLog[`${id}MslIsSelfDestruct`] ? currentLog[`${id}MslIsSelfDestruct`][p.id] : false; let maxAge = isSelfDestruct ? 40 : 15; 
                        if (boomAge >= 0 && boomAge < maxAge) { 
                            if (!p.boomMesh) { p.boomMesh = new THREE.Mesh(expGeo, expMat.clone()); scene.add(p.boomMesh); }
                            p.boomMesh.position.copy(mTracks[explodeFrame].pos);
                            if (isSelfDestruct) { p.boomMesh.material.color.setHex(0xff5500); let bScale = 1.2 + boomAge * 0.15; p.boomMesh.scale.set(bScale, bScale, bScale); p.boomMesh.material.opacity = Math.max(0, 1.0 - boomAge * 0.025); } else { p.boomMesh.material.color.setHex(0xffffee); let bScale = 0.6 + boomAge * 0.05; p.boomMesh.scale.set(bScale, bScale, bScale); p.boomMesh.material.opacity = Math.max(0, 1.0 - boomAge * 0.1); }
                            p.boomMesh.visible = true;
                        } else { if (p.boomMesh) p.boomMesh.visible = false; }
                    } else { if (p.boomMesh) p.boomMesh.visible = false; }
                } else { if (p.flyingMesh) p.flyingMesh.visible = false; if (p.boomMesh) p.boomMesh.visible = false; }
            });
        }
    });

    for (; bulletIdx < visualBullets.length; bulletIdx++) { visualBullets[bulletIdx].visible = false; }
}