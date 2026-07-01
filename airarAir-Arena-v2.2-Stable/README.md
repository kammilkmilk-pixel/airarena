# 📖 Air Arena 核心系統字典 (v2.2 Stable)

## 目前更新狀態

截至目前，專案已完成以下整理與風險修正：

- **資料夾結構**：`index.html` 引用路徑已對齊 `css/`、`js/`、`assets/vfx/`、`assets/models/`、`assets/interface/`。
- **啟動方式**：新增 `package.json`，可用 `npm start` 啟動本地伺服器。
- **資源容錯**：新增 `fallbacks.js`，戰機、城市、VFX 貼圖缺失時可降級運行。
- **VFX 載入**：`SpriteManager` 會依序嘗試 JSON `meta.image`、標準 PNG 檔名、由 JSON 推導的 PNG，以及小寫變體。
- **LCOS 修正**：機砲準星大小已改為綁定兩機實際距離，不再受鏡頭遠近影響。
- **場景光照**：新增天空背景、霧化、地板、半球光、太陽方向光、可見太陽與陰影設定。
- **地面顯示**：已移除黑色方格 `GridHelper`，保留純地板接收陰影。
- **Phase 1**：建立 `GameContext`，集中 state / services / three / stateMachine。
- **Phase 2**：核心狀態寫入改由 `GameContext.stateMachine` 承接，UI 與回合流程不再直接寫主要戰術狀態。
- **Phase 3**：開始拆分 `TeamState / TeamView`，Three.js 視覺物件逐步移入 `GameContext.view`。
- **AI MVP**：新增 `js/ai/pilot-ai.js`，RED/BLUE 按鈕可右鍵或雙擊切換 `[PLAYER] / [AI]`，AI 隊伍的下方按鈕會顯示 NPC 行為狀態。

目前仍保留的技術債：

- `pathPoints`、`pathQuats`、`flightCurve`、`activeMissiles` 仍在 team 物件中，屬於模擬/回合 runtime 資料。
- `render.js`、`combat.js` 還有部分舊式相容 accessor，例如 `team.wrapper`、`pylons[].mesh`。
- AI 目前是 MVP FSM，包含 `recover`、`cooldown`、`intercept`、`gunAttack`、`missilePrep`、`missileAttack`；後續仍需調參與加入更完整的避障/規避。

## 專案結構

```
Air-Arena-v2.2-Stable/
├── index.html              # 遊戲入口
├── package.json            # npm start 本地伺服器
├── css/style.css           # 座艙 UI 樣式
├── js/
│   ├── game.js             # 主迴圈、模型載入、重播
│   ├── core/
│   │   ├── config.js       # 數值、資源路徑、地圖
│   │   ├── context.js      # GameContext 單一入口 (Phase 1)
│   │   ├── fallbacks.js    # 資源缺失時的程序化替代
│   │   └── globals.js      # 全域狀態與 StateMachine
│   ├── logic/              # 物理、武器、交戰管線
│   └── view/               # 3D 渲染、HUD、MFD UI
├── assets/
│   ├── manifest.json       # 所需資源清單
│   ├── models/             # .glb 戰機與城市（可選，有 fallback）
│   ├── vfx/                # 特效 flipbook JSON/PNG
│   └── interface/          # 座艙底圖 ui_l.png / ui_s.png
├── tools/vfx-tuner-1to1.html
└── docs/Tactical-Development-Memo.md
```

## 快速啟動

```bash
npm install
npm start
```

瀏覽器開啟 `http://localhost:8080/index.html`（**不可**直接雙擊 HTML，需本地伺服器載入 GLB/JSON）。

若未安裝 Node.js，也可使用：`npx serve -l 8080 .`

## 資源缺失行為

| 資源 | 缺失時 |
|------|--------|
| 戰機 `.glb` | 使用程序幾何替代機 |
| `city.glb` | 使用 `config.js` 內建方塊建築群 |
| VFX PNG | 依序嘗試 JSON `meta.image`、標準檔名、推導檔名與小寫變體，仍失敗則用占位貼圖 |
| UI 底圖 | 使用純色座艙面板 |

完整清單見 `assets/manifest.json`。

## 狀態寫入規範

Phase 2 起，UI、AI 與回合流程應透過 `GameContext.stateMachine` 寫入核心戰術狀態，避免直接改 `teams.*`。

常用入口：

- `setThrottle(teamId, level)`
- `setWeaponMode(teamId, weapon)` / `toggleWeaponMode(teamId)`
- `togglePylonPower(teamId, pylonId)`
- `queueAction(teamId, action)` / `clearQueuedAction(teamId)`
- `toggleGunQueue(teamId)` / `toggleMissileQueue(teamId)` / `toggleFlares(teamId)`
- `setJoystickInput(teamId, joyX, joyY)` / `setRollInput(teamId, roll)`
- `setReady(teamId, ready)` / `toggleReady(teamId)`

未來 AI 建議只產生「pilot action」，再交給 `GameContext.stateMachine` 套用。

## TeamState / TeamView 分層

Phase 3 起，核心狀態與 Three.js 視覺物件開始分離：

- `GameContext.state.teams`：保留戰術狀態，例如 HP、AP、Heat、Throttle、Weapon、Ready、Pylon state。
- `GameContext.view.teams`：保存 Three.js 物件，例如 aircraft wrapper、HUD 輔助線、pylon mesh、missile trail。
- `team.wrapper`、`team.userData`、`team.realBeam` 目前是相容 accessor，實際資料已存放在 TeamView。
- `pylons[].mesh`、`lineMesh`、`flyingMesh` 等也已透過 pylon view accessor 保存，`pylons[].state` 仍留在 TeamState。

AI 或測試工具應優先使用：

- `GameContext.getSerializableTeamState(teamId)`
- `GameContext.getSerializableBattleState()`

## AI MVP 操作與行為

- 左鍵 `RED TEAM` / `BLUE TEAM`：切換目前操作隊伍。
- 右鍵或雙擊 `RED TEAM` / `BLUE TEAM`：切換該隊伍 `[PLAYER] / [AI]`。
- AI 隊伍的 `規劃中` 按鈕會轉為 NPC 狀態指示器，例如 `NPC: 轉向攔截`、`NPC: 機砲窗口`。
- 玩家按下待命後，如果對手是 AI，系統會自動執行 AI 決策並讓 AI 進入 ready。
- AI 行動只透過 `GameContext.stateMachine.applyPilotAction(teamId, action)` 套用。

AI action 格式：

```js
{
  state: 'intercept',
  statusText: 'NPC: 轉向攔截 120m',
  throttle: 4,
  joyX: 0.3,
  joyY: -0.1,
  roll: 0.12,
  weapon: 'gun',
  queueAction: 'none',
  ready: true,
  reason: 'Close distance and align nose'
}
```

## 📑 目錄 (Table of Contents)
1. [✈️ 核心狀態數值 (Core Stats)](#️-核心狀態數值-core-stats)
2. [⏱️ 時間與推演單位 (Time Mechanics)](#️-時間與推演單位-time-mechanics)
3. [🚀 武器與系統 (Weapons & Systems)](#-武器與系統-weapons--systems)
4. [🎇 視覺與特效系統 (VFX & Rendering)](#-視覺與特效系統-vfx--rendering)
5. [🧠 模組職責與架構劃分 (Module Architecture)](#-模組職責與架構劃分-module-architecture)

---

### ✈️ 核心狀態數值 (Core Stats)
* **AP (Aerodynamic Power / Action Points)**: 戰機的「動能/推力儲備」。由引擎節流閥與重力產生，並在轉向與爬升時劇烈消耗。AP < 45 或 高度 < 0.5 時將觸發 Stall (失速)。飛彈也有 AP，代表固體火箭推進器的剩餘燃料，耗盡則飛彈墜毀。
* **Heat (Core Temp / 紅外線特徵)**: 戰機引擎的熱量。開啟後燃器會劇烈增加。熱量過高（>100）會鎖死後燃器。這同時也是敵方 FOX-2 飛彈尋標頭追蹤的目標數值。
* **HP (Hit Points)**: 戰機的結構完整度。統一透過 `StateMachine.applyDamage()` 扣除，歸零自動觸發死亡螺旋邏輯。目前機砲為累積均攤傷害，飛彈為近炸引信單次巨大傷害。

### ⏱️ 時間與推演單位 (Time Mechanics)
* **Turn (回合)**: 遊戲的核心時間單位，一次交戰結算代表現實時間中的 1.5 秒。
* **Frame / Step (影格/步進)**: 物理推演的最小單位。1 個 Turn 被切割為 100 個 Step。所有的傷害、碰撞、飛彈尋標，都在這 100 步的陣列迴圈中預先推演完成。

### 🌪️ 飛行力學與環境 (Flight Mechanics & Environment)
* **5-Stage Throttle (5 檔節流閥)**: 引擎推力細分為 BRK (減速板)、IDL (怠速)、ECO (經濟巡航)、MIL (軍用推力) 與 AB (後燃器)。各檔位具有獨立的推力、迴轉極限與熱力學廢熱累積係數。
* **Aerodynamic Stall (氣動失速)**: 當 AP < 45 時觸發。戰機會喪失 85% 的操控面靈敏度 (Washout)，機頭受重力影響自動下沉，並以每影格固定的沉降率墜落。玩家必須透過推桿俯衝換取動能來改出失速。
* **Urban Collision (城市碰撞系統)**: 導入 3D 建築群網格並結合 Raycaster 射線檢測。大廈會遮蔽 LOS (雷達視線) 導致 HUD 脫鎖。機砲或飛彈擊中大廈會產生獨立的殉爆火花特效，戰機撞擊則直接觸發死亡結算。

### 🚀 武器與系統 (Weapons & Systems)
* **Pylon (掛架)**: 記錄在 `config.js` 中的實體外掛點。擁有獨立狀態機：`empty` ➡️ `standby` ➡️ `powering` ➡️ `armed`。
* **Ripple Fire (順序齊射)**: 當多枚飛彈處於 armed 狀態時，管線會分配發射延遲（12 Frame），確保飛彈安全脫離。
* **Fox-2 Seeker (紅外線尋標頭)**: 基於 Cosine 衰減模型的熱源追蹤機制。飛彈會動態比較敵機尾管暴露面積與熱焰彈的平方反比熱量，決定鎖定目標。
* **Flare (熱焰彈)**: 具備獨立年齡與三階段溫度衰減機制的誘餌，可於空中持續停留 3 回合干擾敵方飛彈。

### 🎇 視覺與特效系統 (VFX & Rendering)
* **Object Pool (物件池)**: 預先建立的特效網格池 (爆炸、火花、煙霧)，透過 JSON 解析 TexturePacker 序列圖。
* **VFX Triggers (特效觸發器)**: 管線結算時，只負責在劇本 (`battleLog`) 寫入觸發指令，完全不碰 3D 渲染，實現邏輯與視覺完美解耦。
* **Infinite Bounding HUD (無邊界 HUD 投影)**: 戰術光帶與包絡線採用 X 光疊加與無限大邊界球 (Bounding Sphere) 技術。確保在 90 度極端垂直機動下不被 WebGL 引擎錯誤剔除，同時遵守大樓物理遮蔽。
* **Damage Shader (受損塗裝)**: 戰機血量歸零時，利用材質的 RGB Multiplier 動態將機身切換為焦黑塗裝，並關閉尾焰特效。

### 🧠 模組職責與架構劃分 (Module Architecture)
*(v2.2 管線化與單向資料流)*
* **context.js (應用上下文)**: `GameContext` 收斂 state / services / three，新程式碼的統一入口。
* **config.js (數據庫)**: 所有魔法數值、資源路徑（`CONFIG.assets`）、掛架位置、特效上限。
* **fallbacks.js (容錯層)**: 模型/城市/VFX 缺失時的程序化替代方案。
* **globals.js (狀態初始化)**: 建立 `GameContext.state` 與 `stateMachine`；保留 `@deprecated` 相容別名。
* **physics.js (物理大腦)**: 提供 `simulateFlight` 與極速光滑插值函數 `getPosAt` / `getQuatAt`。
* **combat.js (交戰管線)**: 流水線架構：`processFlightPaths` ➡️ `processFlares` ➡️ `resolveGuns` ➡️ `resolveMissiles` ➡️ `resolveDamageAndDeath`。
* **render.js (畫家大腦)**: 讀取劇本播放動畫，VFX 載入與城市場景初始化。
* **ui.js / hud.js (儀表與座艙)**: MFD 戰術電腦與動態 3D HUD 投影。
* **game.js (應用程序總管)**: THREE.js 開機載入、主迴圈 `animate()` 與 ACMI 重播時間軸。



