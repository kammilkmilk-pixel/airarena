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

### 🚀 武器與系統 (Weapons & Systems)
* **Pylon (掛架)**: 記錄在 `config.js` 中的實體外掛點。擁有獨立狀態機：`empty` (空) ➡️ `standby` (待命) ➡️ `powering` (開機預熱, 黃燈) ➡️ `armed` (就緒, 綠燈)。
* **Ripple Fire (順序齊射)**: 當多枚飛彈處於 armed 狀態並同時發射時，管線會分配發射延遲（目前為 12 Frame），確保飛彈安全脫離不相撞。
* **Flare (熱焰彈)**: 具備獨立年齡 (age) 與溫度衰減機制的誘餌。能透過計算「距離平方反比」製造偽造的熱源峰值來欺騙飛彈尋標頭。

### 🎇 視覺與特效系統 (VFX & Rendering)
* **Object Pool (物件池)**: 為了防止記憶體洩漏與掉幀，系統預先建立的特效網格池。包含 `explosion` (爆炸火球)、`flash` (高頻火花/槍口焰)、`puff` (長壽命煙霧)。數量上限由 `config.js` 嚴格控管。
* **VFX Triggers (特效觸發器)**: 管線結算時，只負責在劇本 (`battleLog`) 中寫入特效的「時間、座標、縮放與透明度」。完全不碰 3D 渲染，實現邏輯與視覺完美解耦。
* **Billboard 與動態拖曳**: 所有爆炸粒子由 `render.js` 自動面向攝影機 (Billboard)。並支援加入 `wind` 與 `drift` 向量，讓煙霧受飛機空速影響產生物理拉絲感。

### 🧠 模組職責與架構劃分 (Module Architecture)
*(v2.1 管線化與單向資料流)*
* **config.js (數據庫)**: 所有魔法數值（速度、傷害、掛架位置、特效上限）都集中於此。
* **globals.js (狀態中樞)**: 儲存全域狀態 `teams` 與 `battleLog`，**新增 `StateMachine` 作為唯一合法修改資料的閘口 (Gatekeeper)**，避免狀態污染。
* **physics.js (物理大腦)**: 提供 `simulateFlight` 與極速光滑插值函數 `getPosAt` / `getQuatAt`。
* **combat.js (交戰管線)**: 核心結算系統。已升級為流水線架構 (Pipeline)：`processFlightPaths` ➡️ `processFlares` ➡️ `resolveGuns` ➡️ `resolveMissiles` ➡️ `resolveDamageAndDeath`。
* **render.js (畫家大腦)**: 純粹讀取劇本播放動畫，處理跨回合特效繼承與發光渲染。
* **ui.js / hud.js (儀表與座艙)**: 處理 MFD 戰術電腦的亮燈邏輯與動態 3D 視角投影。
* **game.js (應用程序總管)**: 管理 THREE.js 開機載入 (Promise 等待)、主迴圈 `animate()` 與 ACMI 重播時間軸的推進。



