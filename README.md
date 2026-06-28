# 📖 Air Arena 核心系統字典 (v2.1 Pipeline & StateManger 升級版)

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
*(v2.1 管線化與單向資料流)*
* **config.js (數據庫)**: 所有魔法數值（速度、傷害、掛架位置、特效上限）都集中於此。
* **globals.js (狀態中樞)**: 儲存全域狀態 `teams` 與 `battleLog`，**新增 `StateMachine` 作為唯一合法修改資料的閘口 (Gatekeeper)**，避免狀態污染。
* **physics.js (物理大腦)**: 提供 `simulateFlight` 與極速光滑插值函數 `getPosAt` / `getQuatAt`。
* **combat.js (交戰管線)**: 核心結算系統。已升級為流水線架構 (Pipeline)：`processFlightPaths` ➡️ `processFlares` ➡️ `resolveGuns` ➡️ `resolveMissiles` ➡️ `resolveDamageAndDeath`。
* **render.js (畫家大腦)**: 純粹讀取劇本播放動畫，處理跨回合特效繼承與發光渲染。
* **ui.js / hud.js (儀表與座艙)**: 處理 MFD 戰術電腦的亮燈邏輯與動態 3D 視角投影。
* **game.js (應用程序總管)**: 管理 THREE.js 開機載入 (Promise 等待)、主迴圈 `animate()` 與 ACMI 重播時間軸的推進。



