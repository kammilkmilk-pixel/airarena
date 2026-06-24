// ============================================================================
// render.js - 3D 視覺渲染器 (搭載受損焦黑塗裝切換與跨回合特效平滑過渡版)
// ============================================================================

// 🌟 建立 Scene、Camera 與 Controls
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x101010);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000); 
camera.position.set(10, 28.5, -40); 

const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('canvas-container').appendChild(renderer.domElement);
const controls = new THREE.OrbitControls(camera, renderer.domElement); 
controls.minPolarAngle = Math.PI / 6; controls.maxPolarAngle = Math.PI / 1.6; controls.enableDamping = true;
controls.target.set(10, 25, -30); controls.update(); 

scene.add(new THREE.AmbientLight(0xffffff, 0.9)); const dirLight = new THREE.DirectionalLight(0xffffff, 0.4); dirLight.position.set(10, 50, 10); scene.add(dirLight);

// 🌟 核心修正：將 GridHelper 精確對齊至 (10, 0, 20) 中軸線，使雙方起始點完美貼合地圖南/北邊緣
const obstacles = []; const gridXZ = new THREE.GridHelper(100, 100, 0x333333, 0x222222); gridXZ.position.set(10, 0, 20); scene.add(gridXZ);

// ============================================================================
// 💨 TexturePacker 序列圖通用管理員與池化材质
// ============================================================================
class SpriteManager {
    constructor() { this.texture = null; this.frameData = []; this.isReady = false; }
    init(jsonPath, pngPath) {
        return new Promise((resolve, reject) => {
            new THREE.FileLoader().load(jsonPath, (jsonData) => {
                try {
                    const data = JSON.parse(jsonData); const meta = data.meta;
                    this.frameData = Object.keys(data.frames).map(k => {
                        const f = data.frames[k].frame;
                        return [ f.x/meta.size.w, (f.x+f.w)/meta.size.w, (meta.size.h-(f.y+f.h))/meta.size.h, (meta.size.h-f.y)/meta.size.h ];
                    });
                    this.texture = new THREE.TextureLoader().load(pngPath, () => { 
                        this.isReady = true; 
                        resolve(this); 
                    }, undefined, reject);
                } catch(e) { 
                    console.error("❌ 特效 JSON 解析失敗:", e); 
                    reject(e); 
                }
            }, undefined, reject);
        });
    }
}

// 實例化四種特效管理器
const smokeManager = new SpriteManager();
const explosionManager = new SpriteManager();
const flashManager = new SpriteManager();
const puffManager = new SpriteManager();

const smokeColor = (CONFIG.visuals && CONFIG.visuals.smoke) ? CONFIG.visuals.smoke.color : 0x444444;
const puffColor = (CONFIG.visuals && CONFIG.visuals.smoke) ? CONFIG.visuals.smoke.color * 2 : 0xdddddd; 

const mats = {
    smoke: new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide, color: smokeColor }),
    explosion: new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    flash: new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    puff: new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide, color: puffColor })
};

const limitExp = (CONFIG.visuals && CONFIG.visuals.poolLimits) ? CONFIG.visuals.poolLimits.explosion : 10;
const limitFlash = (CONFIG.visuals && CONFIG.visuals.poolLimits) ? CONFIG.visuals.poolLimits.flash : 20;
const limitPuff = (CONFIG.visuals && CONFIG.visuals.poolLimits) ? CONFIG.visuals.poolLimits.puff : 80;

const explosionPool = [];
const flashPool = [];
const puffPool = [];

const expGeoShared = new THREE.PlaneGeometry(8, 8);
const flashGeoShared = new THREE.PlaneGeometry(0.12, 0.12);
const puffGeoShared = new THREE.PlaneGeometry(2, 2);

for (let i = 0; i < limitExp; i++) {
    let expMesh = new THREE.Mesh(expGeoShared, mats.explosion.clone()); expMesh.visible = false; scene.add(expMesh); explosionPool.push(expMesh);
}
for (let i = 0; i < limitFlash; i++) {
    let flashMesh = new THREE.Mesh(flashGeoShared, mats.flash.clone()); flashMesh.visible = false; scene.add(flashMesh); flashPool.push(flashMesh);
}
for (let i = 0; i < limitPuff; i++) {
    let puffMesh = new THREE.Mesh(puffGeoShared, mats.puff.clone()); puffMesh.visible = false; scene.add(puffMesh); puffPool.push(puffMesh);
}

// ============================================================================
// 🚀 動態連續絲帶 (Ribbon) 專用材質
// ============================================================================
function genRibbonTexture() {
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 128, 0);
    grad.addColorStop(0.0, 'rgba(0,0,0,1)');   
    grad.addColorStop(0.3, 'rgba(128,128,128,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,1)'); 
    grad.addColorStop(0.7, 'rgba(128,128,128,1)');
    grad.addColorStop(1.0, 'rgba(0,0,0,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
}
const ribbonTexShared = genRibbonTexture();
const mslTrailMatShared = new THREE.MeshBasicMaterial({ map: ribbonTexShared, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, vertexColors: true });

window.vfxReadyPromise = Promise.all([
    smokeManager.init('assets/vfx/smoke_flipbook.json', 'assets/vfx/smoke_flipbook.png'),
    explosionManager.init('assets/vfx/explosion_flipbook.json', 'assets/vfx/explosion_flipbook.png'),
    flashManager.init('assets/vfx/flash_flipbook.json', 'assets/vfx/flash_flipbook.png'),
    puffManager.init('assets/vfx/puff_flipbook.json', 'assets/vfx/puff_flipbook.png')
]).then(() => {
    mats.smoke.map = smokeManager.texture; mats.smoke.needsUpdate = true;
    if (fighterVfxPool.red) fighterVfxPool.red.smokePool.forEach(m => { m.material.map = smokeManager.texture; m.material.needsUpdate = true; });
    if (fighterVfxPool.blue) fighterVfxPool.blue.smokePool.forEach(m => { m.material.map = smokeManager.texture; m.material.needsUpdate = true; });
    
    mats.explosion.map = explosionManager.texture; mats.explosion.needsUpdate = true; 
    explosionPool.forEach(m => { m.material.map = explosionManager.texture; m.material.needsUpdate = true; });
    
    mats.flash.map = flashManager.texture; mats.flash.needsUpdate = true; 
    flashPool.forEach(m => { m.material.map = flashManager.texture; m.material.needsUpdate = true; });
    
    mats.puff.map = puffManager.texture; mats.puff.needsUpdate = true; 
    puffPool.forEach(m => { m.material.map = puffManager.texture; m.material.needsUpdate = true; });
    
    console.log("🌟 所有 VFX 材質載入與綁定完成");
    return true;
}).catch(err => {
    console.error("❌ VFX 載入發生致命錯誤:", err);
});

const fighterVfxPool = { red: null, blue: null };
const particleCount = (CONFIG.visuals && CONFIG.visuals.sparks) ? CONFIG.visuals.sparks.count : 150;

function genSparkTextureShared() {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32; const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(16,16,0,16,16,16); g.addColorStop(0,'#fff'); g.addColorStop(0.3,'#ffb432'); g.addColorStop(0.6,'rgba(255,50,0,0.4)'); g.addColorStop(1,'transparent');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(16,16,16,0,Math.PI*2); ctx.fill(); return new THREE.CanvasTexture(canvas);
}
const sparkTexShared = genSparkTextureShared();

['red', 'blue'].forEach(id => {
    const hGeo = new THREE.BufferGeometry(); hGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(particleCount * 3), 3));
    const hSystem = new THREE.Points(hGeo, new THREE.PointsMaterial({ size: CONFIG.visuals?.sparks?.size || 6, sizeAttenuation: false, map: sparkTexShared, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    hSystem.visible = false; scene.add(hSystem);

    const tGeo = new THREE.BufferGeometry(); const tColors = new Float32Array(particleCount * 6);
    for(let i=0; i<particleCount; i++) { tColors[i*6]=1; tColors[i*6+1]=0.5; tColors[i*6+2]=0.1; tColors[i*6+3]=0.3; } 
    tGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(particleCount * 6), 3)); tGeo.setAttribute('color', new THREE.BufferAttribute(tColors, 3));
    const tSystem = new THREE.LineSegments(tGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    tSystem.visible = false; scene.add(tSystem);

    const teamSmokeMeshes = [];
    for(let i=0; i<particleCount; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mats.smoke.clone()); m.visible = false; scene.add(m); teamSmokeMeshes.push(m); }
    fighterVfxPool[id] = { head: hSystem, tail: tSystem, smokePool: teamSmokeMeshes };
});

const threatEnvGroup = new THREE.Group(); scene.add(threatEnvGroup);
window.ghostWrapper = new THREE.Group(); window.ghostWrapper.visible = false; scene.add(window.ghostWrapper);
const ringGeo1 = new THREE.RingGeometry(0.4, 0.45, 32);
window.ghostRing = new THREE.Mesh(ringGeo1, new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false}));
window.ghostRing.rotation.x = Math.PI / 2; window.ghostRing.position.y = -0.08;
const ghostCanvas = document.createElement('canvas'); ghostCanvas.width = 128; ghostCanvas.height = 64;
window.ghostCtx = ghostCanvas.getContext('2d'); window.ghostTex = new THREE.CanvasTexture(ghostCanvas);
const ghostTextPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({map: window.ghostTex, transparent: true, side: THREE.DoubleSide, depthTest: false}));
ghostTextPlane.position.set(0, 0.1, -0.5); ghostTextPlane.rotation.set(-Math.PI / 2, 0, Math.PI);

window.ghostWrapper.add(window.ghostRing, ghostTextPlane);

const trackMaterialRed = new THREE.MeshBasicMaterial({ color: 0xff0055, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
const trackMaterialBlue = new THREE.MeshBasicMaterial({ color: 0x00bcd4, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
const flareGeo = new THREE.SphereGeometry(0.4, 8, 8); const expGeo = new THREE.SphereGeometry(1, 16, 16); const expMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
const flareMats = [ new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }), new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }), new THREE.MeshBasicMaterial({ color: 0x664422, transparent: true, opacity: 0.5, depthWrite: false }) ];
const visualFlaresPool = [];

const maxVisualBullets = 150; 
const visualBullets = [];
for (let i = 0; i < maxVisualBullets; i++) {
    let pts = new Float32Array(6); 
    let cols = new Float32Array(6); 
    let geo = new THREE.BufferGeometry(); 
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); 
    let mesh = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, linewidth: 2, blending: THREE.AdditiveBlending }));
    mesh.visible = false; scene.add(mesh); visualBullets.push(mesh);
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
    if (!teams || typeof P === 'undefined' || !P) return;
    let isReplaying = window.replayMode || (typeof isAnimating !== 'undefined' && isAnimating);
    ['red', 'blue'].forEach(id => {
        let t = teams[id]; 
        let label = document.getElementById(`alt-label-${id}`);
        if (!t.realBeam) { t.realBeam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,-1,0)]), new THREE.LineBasicMaterial({color: id==='red'?0xff0055:0x00bcd4, transparent: true, opacity: 0.5})); scene.add(t.realBeam); }
        if (id !== window.activeTeamId && !isReplaying) { if(t.realBeam) t.realBeam.visible = false; if(label) label.style.display = 'none'; return; }
        if (t.wrapper && !t.isDestroyed) { 
            let correctedY = t.wrapper.position.y - 0.08; t.realBeam.position.set(t.wrapper.position.x, correctedY, t.wrapper.position.z); t.realBeam.scale.set(1, Math.max(0.01, correctedY), 1); t.realBeam.visible = true; 
            if (isReplaying) { if(label) label.style.display = 'none'; } else {
                let pos = t.wrapper.position.clone(); pos.y = pos.y * 0.8; pos.project(camera);
                if (label) { label.style.left = `${(pos.x*.5+.5)*window.innerWidth}px`; label.style.top = `${(pos.y*-.5+.5)*window.innerHeight}px`; label.style.color = id==='red'?'#ff0055':'#00bcd4'; label.innerText = `${t.wrapper.position.y.toFixed(1)}m`; label.style.display = 'block'; }
            }
        } else { if(t.realBeam) t.realBeam.visible = false; if(label) label.style.display = 'none'; }
    });
    
    let ghostLabel = document.getElementById('alt-label-ghost');
    if (window.ghostWrapper && window.ghostWrapper.visible && !isReplaying) { 
        let correctedGhostY = window.ghostWrapper.position.y - 0.08; ghostBeam.position.set(window.ghostWrapper.position.x, correctedGhostY, window.ghostWrapper.position.z); ghostBeam.scale.set(1, Math.max(0.01, correctedGhostY), 1); ghostBeam.visible = true; 
        let pos = window.ghostWrapper.position.clone(); pos.y = pos.y * 0.8; pos.project(camera);
        if (ghostLabel) { ghostLabel.style.left = `${(pos.x*.5+.5)*window.innerWidth}px`; ghostLabel.style.top = `${(pos.y*-.5+.5)*window.innerHeight}px`; ghostLabel.style.color = window.activeTeamId === 'red' ? '#ff0055' : '#00bcd4'; ghostLabel.innerText = `${window.ghostWrapper.position.y.toFixed(1)}m`; ghostLabel.style.display = 'block'; }
    } else { ghostBeam.visible = false; if(ghostLabel) ghostLabel.style.display = 'none'; }
}

function drawTrajectoryLine(teamObj) {
    if (trajectoryMeshes[teamObj.id]) { scene.remove(trajectoryMeshes[teamObj.id]); trajectoryMeshes[teamObj.id] = null; }
    if (teamObj.pathPoints.length < 2) { if (teamObj.id === tAct) window.ghostWrapper.visible = false; return; }
    let pathLen = 0; 
    for(let i=0; i<teamObj.pathPoints.length-1; i++) pathLen += teamObj.pathPoints[i].distanceTo(teamObj.pathPoints[i+1]);
    teamObj.flightLength = pathLen;
    const vis = CONFIG.aircrafts['mig21'].visuals; const vertexArray = []; const leftPts = []; const rightPts = []; const steps = teamObj.pathPoints.length * 2;
    for (let i = 0; i <= steps; i++) { 
        let t = i / steps; 
        let pos = getPosAt(t, teamObj.pathPoints); 
        let q = getQuatAt(t, teamObj.pathQuats); 
        let wingDir = new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize(); 
        
        let ribbonYOffset = vis.engineOffsetY; 
        let centerPos = pos.clone().add(new THREE.Vector3(0, ribbonYOffset, 0).applyQuaternion(q)); 
        
        leftPts.push(centerPos.clone().add(wingDir.clone().multiplyScalar(vis.ribbonWidth / 2))); 
        rightPts.push(centerPos.clone().sub(wingDir.clone().multiplyScalar(vis.ribbonWidth / 2))); 
    }
    for (let i = 0; i < steps; i++) { vertexArray.push(leftPts[i].x, leftPts[i].y, leftPts[i].z, rightPts[i].x, rightPts[i].y, rightPts[i].z, leftPts[i+1].x, leftPts[i+1].y, leftPts[i+1].z); vertexArray.push(rightPts[i].x, rightPts[i].y, rightPts[i].z, rightPts[i+1].x, rightPts[i+1].y, rightPts[i+1].z, leftPts[i+1].x, leftPts[i+1].y, leftPts[i+1].z); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertexArray, 3)); geo.computeVertexNormals();
    trajectoryMeshes[teamObj.id] = new THREE.Mesh(geo, teamObj.id === 'red' ? trackMaterialRed : trackMaterialBlue); scene.add(trajectoryMeshes[teamObj.id]);
    
    if (!isAnimating && !window.replayMode && teamObj.id === tAct && !teamObj.isDestroyed) {
        window.ghostWrapper.visible = true;
        window.ghostWrapper.position.copy(teamObj.pathPoints[teamObj.pathPoints.length - 1]);
        window.ghostWrapper.quaternion.copy(teamObj.pathQuats[teamObj.pathQuats.length - 1]);
        
        if (window.ghostPlaneMesh) {
            window.ghostWrapper.remove(window.ghostPlaneMesh);
        }

        if (teamObj.wrapper) {
            if (teamObj.wrapper.userData.exhaust && teamObj.wrapper.userData.exhaust.group) {
                teamObj.wrapper.userData.exhaust.group.traverse(node => {
                    node.userData.isExhaustComponent = true;
                });
            }

            window.ghostPlaneMesh = teamObj.wrapper.clone();
            window.ghostPlaneMesh.position.set(0, 0, 0);
            window.ghostPlaneMesh.quaternion.set(0, 0, 0, 1);
            
            let teamColor = teamObj.id === 'red' ? 0xff0055 : 0x00bcd4;
            let ghostMat = new THREE.MeshBasicMaterial({
                color: teamColor,
                transparent: true,
                opacity: 0.35,              
                side: THREE.DoubleSide,
                depthWrite: false
            });

            window.ghostPlaneMesh.traverse(c => {
                let isExhaust = c.userData.isExhaustComponent || 
                                (c.name && c.name.toLowerCase().includes('exhaust')) || 
                                (c.parent && c.parent.name && c.parent.name.toLowerCase().includes('exhaust')) ||
                                c.name === 'flyingGlowMesh';

                if (isExhaust) {
                    c.visible = false; 
                } 
                else if (c.isMesh) {
                    c.material = ghostMat;
                    c.visible = true;
                }
            });

            window.ghostWrapper.add(window.ghostPlaneMesh);
        }

        let teamColor = teamObj.id === 'red' ? 0xff0055 : 0x00bcd4;
        if (window.ghostRing) window.ghostRing.material.color.setHex(teamColor);

        window.ghostCtx.clearRect(0,0,128,64); 
        window.ghostCtx.shadowColor = 'rgba(0,0,0,0.9)'; window.ghostCtx.shadowOffsetX = 2; window.ghostCtx.shadowOffsetY = 2; window.ghostCtx.shadowBlur = 4; 
        window.ghostCtx.fillStyle = '#ffeb3b'; window.ghostCtx.font = 'bold 30px Courier New'; window.ghostCtx.textAlign = 'center'; window.ghostCtx.textBaseline = 'middle'; 
        window.ghostCtx.fillText(teamObj.flightLength.toFixed(1) + 'm', 64, 32); 
        window.ghostTex.needsUpdate = true;
    } else if (teamObj.id === tAct) { 
        window.ghostWrapper.visible = false; 
    }
}

function updateGunPreview(teamObj) {
    if (!teamObj.wrapper) return;
    if (!teamObj.userData) teamObj.userData = {};
    if (!teamObj.userData.gunPreview) { let pts = new Float32Array(32 * 3); let geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pts, 3)); let g = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.7, linewidth: 2 })); scene.add(g); teamObj.userData.gunPreview = g; }
    
    if (teamObj.wpnQueued && teamObj.weapon === 'gun' && !isAnimating && !window.replayMode && teamObj.pathPoints && teamObj.pathPoints.length >= 2) {
        let stats = CONFIG.aircrafts[teamObj.type || 'mig21'].throttleStats[teamObj.throttle] || { gunRangeMult: 1.0 };
        let dRange = GUN_RANGE * stats.gunRangeMult; let posArr = teamObj.userData.gunPreview.geometry.attributes.position.array; let ptIdx = 0; let T_now = 1.0; 
        for (let i = 0; i <= 30; i++) {
            let t_spawn = (i / 30) * 1.0; 
            let sPos = getPosAt(t_spawn, teamObj.pathPoints); 
            let sQuat = getQuatAt(t_spawn, teamObj.pathQuats); 
            
            let nPos = sPos.clone().add(new THREE.Vector3(0, -0.2, 0.5).applyQuaternion(sQuat)); 
            
            let el = CONFIG.weapons['gun'].elevation || 0;
            let fwd = new THREE.Vector3(0, Math.sin(el), Math.cos(el)).applyQuaternion(sQuat).normalize();
            
            let dt = Math.max(0, T_now - t_spawn); 
            let muzzleSpeed = dRange * 2.0; 
            let travelDist = muzzleSpeed * dt; 
            let pt = nPos.clone().add(fwd.multiplyScalar(travelDist)); 
            
            let gunGravMult = CONFIG.weapons['gun'].gravityMult !== undefined ? CONFIG.weapons['gun'].gravityMult : 1.0;
            pt.y -= 0.5 * (CONFIG.rules.gravity * gunGravMult) * (dt * dt);
            
            posArr[ptIdx*3] = pt.x; posArr[ptIdx*3+1] = pt.y; posArr[ptIdx*3+2] = pt.z; ptIdx++;
        }
        teamObj.userData.gunPreview.geometry.setDrawRange(0, ptIdx); teamObj.userData.gunPreview.geometry.attributes.position.needsUpdate = true; teamObj.userData.gunPreview.visible = true;
    } else { if(teamObj.userData.gunPreview) teamObj.userData.gunPreview.visible = false; }
}

function updateMissilePreview(teamObj) {
    if (!teamObj.pylons) return; const enemyObj = teamObj.id === 'red' ? teams.blue : teams.red; 
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
            const geo = new THREE.BufferGeometry().setFromPoints(mPoints);
            p.lineMesh = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: lineColor, transparent: true, opacity: lineOpacity, linewidth: 2 }));
            scene.add(p.lineMesh); 
        }
    });
}

function renderCombatFrame(currentLog, animProgress) {
    if (!currentLog || !battleLog) return;
    let turnIdx = battleLog.indexOf(currentLog); if (turnIdx === -1) return;
    let trackIdx = Math.min(100, Math.floor(animProgress * 100));

    explosionPool.forEach(p => p.visible = false); flashPool.forEach(p => p.visible = false); puffPool.forEach(p => p.visible = false);

    let vfxToRender = [];
    
    if (currentLog.vfxTriggers) {
        currentLog.vfxTriggers.forEach(t => {
            vfxToRender.push({ trigger: t, ageFrames: trackIdx - t.step });
        });
    }
    
    if (turnIdx > 0 && battleLog[turnIdx - 1] && battleLog[turnIdx - 1].vfxTriggers) {
        battleLog[turnIdx - 1].vfxTriggers.forEach(t => {
            let pastAge = (100 - t.step) + trackIdx;
            vfxToRender.push({ trigger: t, ageFrames: pastAge });
        });
    }

    let activeCounts = { explosion: 0, flash: 0, puff: 0 };
    vfxToRender.forEach(({ trigger, ageFrames }) => {
        if (ageFrames >= 0) {
            let maxLife = trigger.type === 'flash' ? 8 : (trigger.type === 'puff' ? 60 : 60);
            if (ageFrames < maxLife) {
                let mgr = trigger.type === 'explosion' ? explosionManager : (trigger.type === 'flash' ? flashManager : puffManager);
                let pool = trigger.type === 'explosion' ? explosionPool : (trigger.type === 'flash' ? flashPool : puffPool);
                let countKey = trigger.type;
                
                if (mgr.isReady && activeCounts[countKey] < pool.length) {
                    let mesh = pool[activeCounts[countKey]];
                    mesh.position.copy(trigger.pos);
                    let currentZRot = trigger.rot + (trigger.type === 'puff' ? ageFrames * 0.05 : 0);
                    mesh.userData.zRot = currentZRot; mesh.quaternion.copy(camera.quaternion);
                    mesh.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), currentZRot));
                    
                    let lifeRatio = ageFrames / maxLife; 
                    if (trigger.type === 'flash') { 
                        let s = (trigger.scale || 1.0) * (1.0 - (lifeRatio * 0.4)); mesh.scale.set(s, s, s); mesh.material.opacity = 1.0 - Math.pow(lifeRatio, 2); 
                    } else if (trigger.type === 'puff') { 
                        let baseS = trigger.scale || 1.0;
                        let baseO = trigger.opacity || 0.7;
                        let s = (0.5 + (lifeRatio * 2.5)) * baseS; 
                        mesh.scale.set(s, s, s); 
                        mesh.material.opacity = (1.0 - Math.pow(lifeRatio, 2)) * baseO; 
                    } else if (trigger.type === 'explosion') {
                        let s = (trigger.scale || 1.0) * (0.4 + (lifeRatio * 0.6)); 
                        mesh.scale.set(s, s, s); 
                        mesh.material.opacity = 1.0 - Math.pow(lifeRatio, 1.5); 
                    }
                    
                    let tileIdx = Math.floor(lifeRatio * mgr.frameData.length); if (tileIdx >= mgr.frameData.length) tileIdx = mgr.frameData.length - 1;
                    const uv = mgr.frameData[tileIdx]; const uvAttr = mesh.geometry.attributes.uv;
                    uvAttr.setXY(0, uv[0], uv[3]); uvAttr.setXY(1, uv[1], uv[3]); uvAttr.setXY(2, uv[0], uv[2]); uvAttr.setXY(3, uv[1], uv[2]); uvAttr.needsUpdate = true;
                    mesh.visible = true; activeCounts[countKey]++;
                }
            }
        }
    });

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
        let t = teams[id]; 
        
        if (t.activeMissiles) {
            t.activeMissiles.forEach(am => {
                if (am.mesh) am.mesh.visible = false; 
            });
        }
        
        let hpNow = currentLog.hpTrack ? currentLog.hpTrack[id][trackIdx] : t.hp;
        let isDead = hpNow <= 0;
        let targetColorMultiplier = isDead ? 0.15 : 1.0; 
        
        if (t.wrapper && t.wrapper.userData.isDeadState !== isDead) {
            t.wrapper.traverse(c => {
                if (c.isMesh && !c.isAAA_V3 && c.userData.origColor !== undefined) {
                    if (!t.wrapper.userData.exhaust || c.parent !== t.wrapper.userData.exhaust.group) {
                        let orig = new THREE.Color(c.userData.origColor);
                        c.material.color.setRGB(orig.r * targetColorMultiplier, orig.g * targetColorMultiplier, orig.b * targetColorMultiplier);
                    }
                }
            });
            t.wrapper.userData.isDeadState = isDead;
            
            if (t.wrapper.userData.exhaust) {
                t.wrapper.userData.exhaust.group.visible = !isDead;
            }
        }

        let currentPlanePos, currentPlaneQuat;
        if (currentLog[id].pts.length >= 2) {
            currentPlanePos = getPosAt(animProgress, currentLog[id].pts); currentPlaneQuat = getQuatAt(animProgress, currentLog[id].quats);
            t.wrapper.position.copy(currentPlanePos); t.wrapper.quaternion.copy(currentPlaneQuat);
            if (id === tAct) { let adi = document.getElementById('adi-sky-ground'); if(adi) adi.style.transform = `rotate(${(new THREE.Euler().setFromQuaternion(currentPlaneQuat, 'YXZ').z * 180) / Math.PI}deg) translateY(${-(new THREE.Euler().setFromQuaternion(currentPlaneQuat, 'YXZ').x * 180) / Math.PI * 1.5}px)`; }
        }

        if (t.userData && t.userData.gunPreview) t.userData.gunPreview.visible = false;
        let currentNosePos = currentPlanePos.clone().add(new THREE.Vector3(0, -0.2, 1.5).applyQuaternion(currentPlaneQuat));
        
        for (let age = 0; age <= 2; age++) {
            let logIdx = turnIdx - age; if (logIdx < 0) continue; let pastLog = battleLog[logIdx]; if (!pastLog) continue;
            let logChain = pastLog[id].chain;
            if (logChain && logChain.length > 0 && logChain[0].fire === 'gun' && pastLog[id].pts.length >= 2) {
                let stats = CONFIG.aircrafts[t.type || 'mig21'].throttleStats[logChain[0].throttle || 2] || { gunRangeMult: 1.0 }; 
                let dRange = GUN_RANGE * stats.gunRangeMult;
                
                for (let b = 0; b < 24; b++) {
                    if (bulletIdx >= visualBullets.length) break;
                    let mesh = visualBullets[bulletIdx]; 
                    let t_spawn = (b / 23) * 0.95; 
                    let timeSinceSpawn = animProgress - t_spawn + age; 
                    if (timeSinceSpawn < 0 || timeSinceSpawn > 1.5) continue;
                    
                    let spawnPos = getPosAt(t_spawn, pastLog[id].pts); 
                    let spawnQuat = getQuatAt(t_spawn, pastLog[id].quats);
                    
                    let dt = 0.02; 
                    let acVelocity;
                    
                    if (t_spawn >= dt) {
                        let t_prev = t_spawn - dt;
                        let prevPos = getPosAt(t_prev, pastLog[id].pts);
                        acVelocity = new THREE.Vector3().subVectors(spawnPos, prevPos).divideScalar(dt);
                    } else {
                        let t_next = t_spawn + dt;
                        let nextPos = getPosAt(t_next, pastLog[id].pts);
                        acVelocity = new THREE.Vector3().subVectors(nextPos, spawnPos).divideScalar(dt);
                    }

                    let startPos = spawnPos.clone().add(new THREE.Vector3(0, -0.2, 1.5).applyQuaternion(spawnQuat));
                    let forward = new THREE.Vector3(0, 0, 1).applyQuaternion(spawnQuat);
                    
                    let spreadX = Math.sin(b * 123.45 + logIdx) * 0.015; let spreadY = Math.cos(b * 678.90 + logIdx) * 0.015;
                    let right = new THREE.Vector3(1, 0, 0).applyQuaternion(spawnQuat); let up = new THREE.Vector3(0, 1, 0).applyQuaternion(spawnQuat);
                    forward.add(right.multiplyScalar(spreadX)).add(up.multiplyScalar(spreadY)).normalize();
                    
                    let muzzleSpeed = dRange * 2.0; 
                    let bulletVelocity = forward.clone().multiplyScalar(muzzleSpeed).add(acVelocity);

                    let headPos = startPos.clone().add(bulletVelocity.clone().multiplyScalar(timeSinceSpawn));
                    
                    let gunGravMult = CONFIG.weapons['gun'].gravityMult !== undefined ? CONFIG.weapons['gun'].gravityMult : 1.0;
                    let gravDrop = 0.5 * (CONFIG.rules.gravity * gunGravMult) * (timeSinceSpawn * timeSinceSpawn);
                    headPos.y -= gravDrop;
                    
                    let tracerLen = 4; let tailPos;
                    if (age === 0 && (bulletVelocity.length() * timeSinceSpawn) < tracerLen) { 
                        tailPos = currentNosePos.clone(); 
                    } else { 
                        let visualDir = bulletVelocity.clone().normalize();
                        tailPos = headPos.clone().sub(visualDir.multiplyScalar(tracerLen)); 
                    }
                    
                    mesh.geometry.attributes.position.setXYZ(0, headPos.x, headPos.y, headPos.z); 
                    mesh.geometry.attributes.position.setXYZ(1, tailPos.x, tailPos.y, tailPos.z); 
                    mesh.geometry.attributes.position.needsUpdate = true;

                    let lifeRatio = Math.min(1.0, timeSinceSpawn / 1.5); 
                    let colAttr = mesh.geometry.attributes.color;

                    let curR = 1.0;
                    let curG = 1.0 - (lifeRatio * 0.9); 
                    let curB = 0.2 * (1.0 - lifeRatio); 

                    colAttr.setXYZ(0, curR, curG, curB); 
                    colAttr.setXYZ(1, curR * 0.8, curG * 0.8, curB * 0.8); 
                    colAttr.needsUpdate = true;
                    
                    mesh.material.opacity = Math.max(0, 1.0 - (timeSinceSpawn / 1.5)); 
                    mesh.visible = true;
                    bulletIdx++;
                }
            }
        }
        
        if (t.pylons) {
            t.pylons.forEach(p => {
                let mTracks = currentLog[`${id}MslTracks`] ? currentLog[`${id}MslTracks`][p.id] : null; 
                let explodeFrame = currentLog[`${id}ExplodedAt`] ? currentLog[`${id}ExplodedAt`][p.id] : undefined;
                
                const masterMissileOffset = typeof window.mslVisOffset !== 'undefined' ? window.mslVisOffset : new THREE.Vector3(0.0, 0.0, 0.0);
                const nozzleOffset = new THREE.Vector3(0.0, -0.51, -0.0);
                
                if (p.flyingMesh && !p.flyingMesh.isAAA_V3) {
                    scene.remove(p.flyingMesh);
                    p.flyingMesh = null;
                }
                
                if (mTracks) {
                    if (!p.flyingMesh && typeof missileMeshBase !== 'undefined' && missileMeshBase) {
                        p.flyingMesh = new THREE.Group(); 
                        p.flyingMesh.isAAA_V3 = true; 
                        
                        let mBody = missileMeshBase.clone(); 
                        mBody.traverse(c => { if(c.isMesh) c.visible = true; }); 
                        mBody.scale.set(2.5, 2.5, 2.5); 
                        p.flyingMesh.add(mBody);
                        
                        let fGlowGroup = new THREE.Group();
                        let fOuterMat = new THREE.MeshBasicMaterial({ map: sparkTexShared, color: 0xff4400, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
                        let fOuterGeo = new THREE.PlaneGeometry(0.3, 1.8); fOuterGeo.translate(0, -0.9, 0); fOuterGeo.rotateX(Math.PI / 2);  
                        let outer1 = new THREE.Mesh(fOuterGeo, fOuterMat); let outer2 = new THREE.Mesh(fOuterGeo, fOuterMat); outer2.rotateZ(Math.PI / 2); 
                        
                        let fInnerMat = new THREE.MeshBasicMaterial({ map: sparkTexShared, color: 0xffffff, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
                        let fInnerGeo = new THREE.PlaneGeometry(0.12, 0.8); fInnerGeo.translate(0, -0.4, 0); fInnerGeo.rotateX(Math.PI / 2); 
                        let inner1 = new THREE.Mesh(fInnerGeo, fInnerMat); let inner2 = new THREE.Mesh(fInnerGeo, fInnerMat); inner2.rotateZ(Math.PI / 2);
                        
                        let fHaloMat = new THREE.MeshBasicMaterial({ map: sparkTexShared, color: 0xff8800, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
                        let fHalo = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), fHaloMat); fHalo.name = 'halo';
                        
                        fGlowGroup.add(outer1, outer2, inner1, inner2, fHalo);
                        fGlowGroup.position.copy(nozzleOffset); 
                        
                        p.flyingGlowMesh = fGlowGroup; 
                        p.flyingMesh.add(p.flyingGlowMesh); 
                        scene.add(p.flyingMesh);
                    }
                    
                    let mTrack = mTracks[trackIdx];
                    if (mTrack && mTrack.pos && !isNaN(mTrack.pos.x)) { 
                        if (p.flyingMesh) {
                            let offset = masterMissileOffset.clone().applyQuaternion(mTrack.quat);
                            p.flyingMesh.position.copy(mTrack.pos).add(offset);
                            p.flyingMesh.quaternion.copy(mTrack.quat); 
                            p.flyingMesh.visible = true; 
                            
                            if (p.flyingGlowMesh) {
                                let pulseXY = 0.9 + Math.random() * 0.2; let pulseZ = 0.8 + Math.random() * 0.4;
                                p.flyingGlowMesh.scale.set(pulseXY, pulseXY, pulseZ); 
                                let halo = p.flyingGlowMesh.children.find(c => c.name === 'halo');
                                if (halo) { let invQ = p.flyingMesh.quaternion.clone().invert(); halo.quaternion.copy(invQ.multiply(camera.quaternion)); }
                            }
                        }
                    } else { 
                        if (p.flyingMesh) p.flyingMesh.visible = false; 
                    }
                    if (explodeFrame !== undefined && trackIdx >= explodeFrame) {
                        if (p.flyingMesh) p.flyingMesh.visible = false;
                    }
                    
                    const maxPts = 65; 
                    if (p.trailMesh && !p.trailMesh.isAAA_V3) { scene.remove(p.trailMesh); p.trailMesh = null; }
                    
                    if (!p.trailMesh) {
                        const tGeo = new THREE.BufferGeometry();
                        tGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxPts * 2 * 3), 3));
                        tGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxPts * 2 * 3), 3));
                        tGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(maxPts * 2 * 2), 2));
                        const indices = []; for (let i = 0; i < maxPts - 1; i++) { indices.push(i*2, i*2+1, i*2+2); indices.push(i*2+2, i*2+1, i*2+3); } tGeo.setIndex(indices);
                        p.trailMesh = new THREE.Mesh(tGeo, mslTrailMatShared.clone());
                        p.trailMesh.frustumCulled = false; p.trailMesh.isAAA_V3 = true;
                        scene.add(p.trailMesh);
                    }
                    
                    let posArr = p.trailMesh.geometry.attributes.position.array; let colArr = p.trailMesh.geometry.attributes.color.array; let uvArr = p.trailMesh.geometry.attributes.uv.array;
                    let validPts = 0;
                    
                    for (let h = 0; h < maxPts; h++) {
                        let pastStep = trackIdx - h; let htmlPos = null; let histQuat = null;
                        if (pastStep >= 0) {
                            if (mTracks[pastStep] && mTracks[pastStep].pos) { htmlPos = mTracks[pastStep].pos.clone(); histQuat = mTracks[pastStep].quat; }
                        } else {
                            let prevTurnIdx = turnIdx - 1;
                            if (prevTurnIdx >= 0 && battleLog[prevTurnIdx] && battleLog[prevTurnIdx][`${id}MslTracks`] && battleLog[prevTurnIdx][`${id}MslTracks`][p.id]) {
                                let prevTracks = battleLog[prevTurnIdx][`${id}MslTracks`][p.id]; let prevStep = 100 + pastStep; 
                                if (prevStep >= 0 && prevTracks[prevStep] && prevTracks[prevStep].pos) { htmlPos = prevTracks[prevStep].pos.clone(); histQuat = prevTracks[prevStep].quat; }
                            }
                        }
                        
                        if (htmlPos && histQuat) {
                            let lifeRatio = h / maxPts; 
                            let offset = masterMissileOffset.clone().applyQuaternion(histQuat);
                            htmlPos.add(offset);
                            
                            let localNozzle = nozzleOffset.clone().applyQuaternion(histQuat);
                            let nozzlePos = htmlPos.clone().add(localNozzle);
                            
                            let width = 0.05 + (lifeRatio * 1.5); 
                            let toCam = new THREE.Vector3().subVectors(camera.position, nozzlePos).normalize();
                            let right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,0,1).applyQuaternion(histQuat).normalize(), toCam);
                            if (right.lengthSq() < 0.0001) right.set(1,0,0).applyQuaternion(histQuat);
                            right.normalize().multiplyScalar(width);
                            
                            let leftP = nozzlePos.clone().add(right); let rightP = nozzlePos.clone().sub(right);
                            let idx = validPts * 2;
                            posArr[idx*3+0] = leftP.x;  posArr[idx*3+1] = leftP.y;  posArr[idx*3+2] = leftP.z;
                            posArr[idx*3+3] = rightP.x; posArr[idx*3+4] = rightP.y; posArr[idx*3+5] = rightP.z;
                            
                            let intensity = Math.pow(1.0 - lifeRatio, 1.8); 
                            let r = intensity * 1.0; let g = intensity * 0.9; let b = intensity * 0.8;
                            colArr[idx*3+0] = r; colArr[idx*3+1] = g; colArr[idx*3+2] = b; colArr[idx*3+3] = r; colArr[idx*3+4] = g; colArr[idx*3+5] = b;
                            
                            let v = h / maxPts; uvArr[idx*2+0] = 0; uvArr[idx*2+1] = v; uvArr[idx*2+2] = 1; uvArr[idx*2+3] = v;
                            validPts++;
                        }
                    }
                    
                    if (validPts > 1) { p.trailMesh.geometry.setDrawRange(0, (validPts - 1) * 6); p.trailMesh.geometry.attributes.position.needsUpdate = true; p.trailMesh.geometry.attributes.color.needsUpdate = true; p.trailMesh.geometry.attributes.uv.needsUpdate = true; p.trailMesh.visible = true; } else { p.trailMesh.visible = false; }
                } else { if (p.flyingMesh) p.flyingMesh.visible = false; if (p.trailMesh) p.trailMesh.visible = false; }
            });
        }
    });

    for (; bulletIdx < visualBullets.length; bulletIdx++) { visualBullets[bulletIdx].visible = false; }
}

// ============================================================================
// 🌆 大樓實體生成引擎 (數據驅動加載器)
// ============================================================================
function initMapObstacles() {
    if (!CONFIG.map || !CONFIG.map.buildings) return;

    CONFIG.map.buildings.forEach(b => {
        if (b.type === 'box') {
            const width = b.w || 1;
            const depth = b.d || 1;
            const geo = new THREE.BoxGeometry(width, b.h, depth);
            const mat = new THREE.MeshStandardMaterial({ 
                color: b.color || 0x2c2c2c, 
                roughness: 0.85,
                metalness: 0.1
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(b.x + width/2, b.h/2, b.z + depth/2);
            scene.add(mesh);
            obstacles.push(mesh); 
        } 
        else if (b.type === 'model') {
            if (typeof loader !== 'undefined' && b.modelPath) {
                loader.load(b.modelPath, (gltf) => {
                    const model = gltf.scene;
                    model.position.set(b.x, 0, b.z); 
                    let s = b.scale || 1.0;
                    model.scale.set(s, s, s);
                    scene.add(model);
                    model.traverse(child => {
                        if (child.isMesh) obstacles.push(child);
                    });
                });
            }
        }
    });
    console.log(`🌆 戰術地圖初始化完成：已部署 ${obstacles.length} 棟深炭灰摩天大樓。`);
}

initMapObstacles();