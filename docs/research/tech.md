# 技术调研（主程）：英语地下城 · 战斗表现 / 剧情 / 音频 / 架构

> 调研日期：2026-10-05。范围：只调研与设计，未改动任何项目代码。
> 引用约定：`[n]` 对应文末"参考链接"，凡标 **（已打开）** 的是实际 WebFetch 打开读过的页面；标 **（仅搜索摘要）** 的是只看到搜索结果摘要、未逐页核实，需要时再复核；标 **（经验判断）** 的是我自己的工程判断，没有外部出处。

---

## 0. 摘要（一页版）

1. **引擎**：推荐 **Phaser 4.2.x**（2026-04 发布稳定版，07 月已到 4.2.1），但先做 **1–2 天移植 spike**（把现有原型在 Phaser 4 上跑通 + 在目标老笔记本/iPad 上测帧率）再正式拍板；spike 失败则留在 Phaser 3.90。不建议换 PixiJS（要自己造场景/音频/输入/动画管理）或 Cocos Creator（等于重写，且主要价值在小程序平台，本项目不需要）。
2. **打击感**：现有代码已有"冲刺+白弧+粒子+震屏+伤害数字"的雏形，但全部是 `delayedCall` 链写死在 `DungeonScene.ts`。需要的是：**顿帧（hitstop）+ 时间轴驱动的技能表（skill timeline）+ 特效管线（图集序列帧）+ 对象池**，参数见 §C。
3. **美术格式**：首选 **序列帧图集（Aseprite/PNG 序列 → free-tex-packer-core 打包 → Phaser 图集+动画 JSON）**，零授权成本；Boss 或需要换装的主角再考虑 **Spine**（Essential \$69 不含网格，Pro \$379，一次性买断；用于已发布的游戏即使免费也需要授权）。DragonBones 免费但我没能确认其运行时仍在维护，不推荐。
4. **音频**：SFX/BGM 用 Phaser 自带 Web Audio（首次点击解锁）；**单词发音一律构建时预生成**（Azure Speech 神经语音，en-GB；682 个不同单词 ≈ 5–6 千字符，远低于免费 0.5M 字符/月额度），**不要依赖浏览器 TTS**（Chrome 桌面语音要联网到谷歌、Edge 才有大量语音、iOS 列表受限）。句子继续用课文原声，但要把"整段 mp4"改成"每课一个音频精灵"。
5. **架构**：把 `DungeonScene`（515 行）拆为 **BattleController（纯逻辑状态机）+ BattleView（表现）+ QuestionPanel（题目 UI）**；新增 **StoryRunner（对话/过场）**、**AssetManager（分包加载）**、**AudioService**。`systems/*`、`save/*`、`content/*`、`tests/*` 基本可保留。
6. **存档**：`SAVE_VERSION` 1 → 2 只做"加字段"，现有 `migrate()` 的 base 合并模式可直接承接；关键是 **稳定 ID（dungeon id、itemId）永不改名**，并在迁移前自动备份。

需要用户拍板的事项见 §F（共 10 项）。

---

## A. 现有代码评估

实测事实（本机检查）：
- 源码约 3259 行（含测试/工具）；Phaser 触碰面主要是 `src/scenes/*`、`src/ui/*`、`src/gfx/*`。
- `dist` 构建产物：单个 JS 1.26MB，gzip 后 **338KB**（几乎全是 Phaser；`phaser.min.js` 单独 gzip 317KB）。
- 课程 JSON：`public/content/book1/lessons` 共 334KB，gzip 66KB（启动时 50 个文件一次性 fetch）。
- `public/content/book1/media` 72 个 mp4，共 **204MB**，单文件 1–7.5MB（最大 L141.mp4 7.5MB），已被 `.gitignore`。
- 内容统计：50 个课对、701 个单词条目（去重后 **682**），其中 **0 条带音频**；814 句对话 **全部带**原声片段（clip）。单词发音目前只能走浏览器 TTS。
- 存档：`SAVE_VERSION = 1`，IndexedDB `DB_VER = 1`，每次保存写备份快照并保留 10 份。

### A1. 可保留（基本不动）
| 文件 | 评价 |
|---|---|
| `src/systems/questions.ts`（298 行）、`srs.ts`、`items.ts`、`player.ts`、`session.ts`、`rng.ts` | 纯逻辑、不依赖 Phaser、已有 vitest（`tests/systems.test.ts`）。出题/评级/SM-2/掉落都在这里，是项目最有价值的资产。需要小扩展：`playerStats` 要给出技能参数；`Question` 要带"击中类型"供表现层选技能。 |
| `src/save/schema.ts`、`src/save/db.ts` | 迁移机制（`migrate()` + base 合并）和备份快照设计合理，见 §E。 |
| `src/content/types.ts`、`loader.ts` | 数据结构清晰。`loader.ts` 启动时拉全部课程 JSON，现阶段可接受（66KB gzip），课数增至 72 对后仍 <150KB gzip，可延后改按地图懒加载。 |
| `tests/*.test.ts`、`tools/*.mjs` | 内容流水线（视频切分、字幕对齐、build-content）可保留并扩展。 |
| `src/ui/modal.ts`、`files.ts`、`video.ts`（DOM 视频浮层） | 课文动画用 DOM `<video>` 是对的（Phaser 里解码视频在低端机上更吃资源）。`video.ts` 要接入将来的过场系统（统一"跳过"和暂停 BGM）。 |

### A2. 必须重构
| 文件 | 问题 | 重构方向 |
|---|---|---|
| `src/scenes/DungeonScene.ts`（515 行） | 上帝场景：房间流程、战斗表现、三种题型的 UI 与键盘输入、血量/连击都在一个类里；战斗节奏靠 `time.delayedCall(450/650/700/1200/1700…)` 链硬编码（如答错后 `delayedCall(1700, getHit)`）；`busy` 布尔代替状态机；伤害数字每次 `scene.add.text` 再 `destroy`（Canvas 文本每次生成纹理，低端机易抖动）；`hitEffect` 内联所有特效。 | 拆为 `battle/BattleController`（状态机，纯逻辑，可无头测试）、`battle/BattleView`（演员、特效、相机）、`quiz/QuestionPanel`（3 个题型组件）。节奏改由"技能时间轴数据"驱动（§C）。 |
| `src/gfx/textures.ts`（107 行）、`src/gfx/icons.ts`（203 行） | 用 `Graphics.generateTexture` 程序生成角色/怪/背景/图标。正式美术进场后全部要替换为图集。 | 保留为"占位美术回退"（缺图集时仍可玩），正式美术用 AssetManager 加载；`backdrop()` 改为多层视差背景。 |
| `src/audio/speech.ts`（74 行） | ① 每个 mp4 建一个 `<audio preload="auto">`，点一句话就可能把整段 1–7MB 视频拉下来；② 靠 `setTimeout` 到 `end` 暂停，不精确；③ 没有 SFX/BGM/音量；④ 词级无预生成音频，直接回退到浏览器 TTS。 | 重写为 `audio/AudioService`：`sfx()`、`bgm()`、`voice()`；voice 优先"每课音频精灵"→"预生成单词 mp3"→TTS 最后兜底（§D）。 |
| `src/main.ts` | `Phaser.AUTO` + `Scale.FIT` 固定 1280×720，无渲染配置（antialias、pixelArt 取舍）、无性能/画质设置、无预加载场景。 | 加 `PreloadScene`（进度条）、画质档位、渲染配置；`import.meta.env.DEV` 暴露调试对象保留。 |
| `src/scenes/BootScene.ts` | 启动时同步生成纹理 + 拉全部内容，无进度反馈。 | 改为 Boot（极小）→ Preload（显示进度）→ Title（"点击开始"，同时解锁音频）。 |
| `tests/e2e/playthrough.mjs` | 依赖像素坐标点击（如 `page.mouse.click(640, 340)`、`740+132, 140`）与场景名，布局一变就碎。 | 暴露 `window.__test`（获取当前题目/点击选项/跳过演出）供 Playwright 调用，避免坐标。 |

### A3. 需要小改
- `src/state.ts`（`GameState` 全局单例）：可保留，但需加一个轻量事件总线（`mitt` 或自写 30 行），供战斗层→音频/成就/剧情订阅。
- `src/ui/widgets.ts`：按钮 `pointerover` 悬停高亮在触屏无意义但无害；需补"最小触控尺寸 ≥ 48 设备无关像素"检查（排序题 chip 高度 50 处于边缘）。
- `src/scenes/TownScene.ts`、`ResultScene.ts`、`InventoryScene.ts`、`ProfileScene.ts`：UI 逻辑可保留，换皮；城镇要接 NPC 对话入口（§D）。
- `package.json`：依赖很干净。新增建议：`free-tex-packer-core`（devDependency）、可选 `vite-plugin-pwa`（离线缓存）。

---

## B. 引擎与关键技术选型

### B1. 引擎（本项目关心：横版战斗、特效、儿童设备性能、迁移成本）

| 选项 | 利 | 弊 | 迁移成本 |
|---|---|---|---|
| **1. 留在 Phaser 3.90** | 零迁移；FX（preFX/postFX 的 glow/bloom/shine）现成；Spine 官方 v3 运行时可用（Spine 4.1 也兼容）[10][11] | 渲染管线是旧架构；Phaser 官方新特性（统一 Filter、Spine 走 Mesh2D 合批、移动端 filter 缓冲优化）都在 v4；LLM/社区资料以 v3 居多是唯一的"生态优势" | 0 |
| **2. 升级 Phaser 4.2.x（推荐，先 spike）** | 2026-04-10 稳定版 4.0.0，07-09 已 4.2.1 [1]；全新 RenderNode 渲染器：每个 quad 只传 4 顶点（少 1/3 GPU 数据）、按需请求纹理单元（对移动端更友好）、WebGL 上下文丢失自动恢复 [4]；统一 Filter 系统（Blur、Glow、Shadow、ColorMatrix、Pixelate 等），官方称对 filter 数据缓冲的重做在移动端最高 16 倍提升（搜索摘要，**未在官方正文核实**，勿当作我们场景的实测值）；官方 `spine-phaser-v4` 运行时（需 Phaser ≥4.2.1）让 Spine 与普通精灵合批 [6][5]；API 大体保留，官方称"迁移基本直接"（搜索摘要，见 [3]） | ① **Canvas 渲染器已弃用**，必须 WebGL（老旧笔记本/软渲染环境有风险）[4]；② v4 的 Bloom/Vignette/Shine 等"派生特效"被移除，需用 threshold+blur 自己拼 [7]；③ 每个 filter = 一次 draw call + 一个帧缓冲，移动端要节制 [7]；④ 发布半年，插件/教程较少；⑤ 破坏性改动见下 | 中小：本项目 Phaser 触碰面约 1900 行 |
| **3. PixiJS v8** | 纯渲染库，体积更小，WebGL/WebGPU，滤镜丰富 [8] | **不含**场景管理、物理、音频、输入、Tween、加载器——这些全要自己造或另选库；对"3 个人以下做教育游戏"净增工作量大 | 大：场景/音频/输入/动画层全部重写 |
| **4. Cocos Creator 3.8** | 免费、无授权费；2–4MB 起步包；TS；Wasm 物理；微信/抖音小游戏导出是强项；中文文档 [9] | 编辑器工作流，等于重写；本项目是网页+家长自用，小程序价值低；美术/策划需要学编辑器；2–4MB 空工程包 vs Phaser 约 0.34MB gzip | 极大：全部重写 |

**对本项目的 v4 破坏性改动清单**（来自官方迁移说明 [3]，对照现有代码）：
- `setTintFill()` 被移除，改用 `tintMode`（`Phaser.TintModes.FILL` 等）。**影响**：`DungeonScene.hitEffect/getHit` 两处受击闪白。
- Pipelines → RenderNodes；FX/Masks → Filters；`BitmapMask` 移除。**影响**：现有代码未用，无需改。
- `Geom.Point` 移除、Mesh/Plane 移除。**影响**：现有代码未用。
- Camera 矩阵变更。**影响**：`cameras.main.shake/flash` 属公共 API，预计不变，需 spike 验证。
- `Phaser.AUTO` 在 v4 仍可用，但 Canvas 回退已无意义。

**结论与 spike 验收标准**（决策门）：
1. 把现有原型 `npm i phaser@4` 跑通（预计 0.5–1 天，主要是 tint 与类型）。
2. 压测场景：1 个 Boss + 8 个小怪精灵（各 4 帧动画）+ 150 粒子 + 2 个 filter + 20 个 BitmapText 伤害数字。
3. 在 ≥2 台目标设备（一台低端 Windows 笔记本——请用户提供型号；一台 iPad）测 60s，**平均 ≥ 55fps、1% low ≥ 40fps、无 WebGL 报错**；
4. 通过 → 全面转 Phaser 4；不通过 → 留在 3.90，特效改用预烘焙发光帧（不用 filter）。

### B2. 骨骼动画 vs 序列帧

| 方案 | 成本 | 利 | 弊 |
|---|---|---|---|
| **序列帧图集（推荐起步）** | 零授权；美术用 Aseprite 或任意绘图软件出 PNG 序列 | 实现最简单；Phaser 3.60+ 原生支持 Aseprite JSON（`load.aseprite` + `createFromAseprite`，按"标签"播放）[14]（仅搜索摘要）；风格完全由美术控制；低端设备零额外运行时 | 每个角色/怪物的每个动作都要出帧，体积和美术量随角色数线性增长；换装（装备外观）困难 |
| **Spine** | Essential **\$69**（不含网格等高级功能）；Professional **\$379**；一次性买断、终身更新；Enterprise 仅针对年收入 ≥ 50 万美元企业 [2]。运行时授权：搜索结果称"即使免费游戏也必须持有编辑器授权才可合法使用运行时"（仅搜索摘要，**需发布前对照 Esoteric 官方许可条款复核**） | 小体积（单个骨架通常几十~几百 KB，经验判断）、动作平滑、可程序化混合动作、换装（slot 换图）；Phaser 3 有官方运行时，Phaser 4 有 `spine-phaser-v4`，可 Mesh2D 合批 [5][6] | 需要会绑骨骼的美术；要买授权；Phaser 3/4 运行时不同包，升级引擎时要对应换包 |
| **DragonBones** | 免费 | 有 Phaser 社区插件 [13] | 我**无法确认**其官方运行时仍在维护（搜索结果无明确结论），且 v3→v4 兼容未知；风险大，不推荐 |
| **代码驱动"纸娃娃"** | 零授权 | 把角色切成 身体/手臂/武器 几块，用 Tween 做挥砍、呼吸、受击形变；对 2D 卡通 Q 版风格很划算 | 只适合风格简单的角色 |

**推荐**：第一阶段全部走"序列帧 + 代码形变"：每个怪物只交付 **idle 4 帧 + attack 4 帧**，受击（闪白+后仰）与死亡（缩放/淡出/碎裂粒子）由代码完成；主角 4 个职业交付 idle/run/attack×3/cast/hit/die。**不要先买 Spine**；待美术角色确定后，若 Boss 需要华丽动作再买 Essential/Pro（Boss 若用网格变形就必须 Pro）。

### B3. 图集打包

| 工具 | 授权 | 说明 |
|---|---|---|
| **free-tex-packer-core**（npm） | MIT | Node 模块，导出 Pixi/Phaser/Unity/Cocos2d/Spine 等格式；支持旋转、裁剪、去重、MaxRects 算法、默认最大 2048×2048、可接 TinyPNG [12]。**推荐**：写进 `tools/pack-atlas.mjs`，美术改图后一键重打包 |
| TexturePacker | 官方称非商业项目可免费用基础功能；商业或高级功能需购买（Pro 约 \$24.95，来自搜索摘要，**未在价格页核实**）[15] | 功能强（ASTC/ETC 压缩纹理等），但本项目是网页，PNG/WebP 足够；非必需 |

**纹理内存预算**（经验判断）：GPU 纹理按 `宽×高×4` 字节占用，与 PNG/WebP 文件大小无关。一张 2048² 图集占 16MB。iPad Safari 对 WebGL 内存敏感（WebKit bug 追踪里有 iPad Air 3 在内存增长到 ~1.25GB 时标签页被杀的记录 [16]，虽然那是 canvas resize 泄露的特例，但说明 iOS 有硬上限）。目标：**同屏常驻纹理 ≤ 128MB**（≈ 8 张 2048² 图集），按"城镇包 / 地图包 / 副本包"加载与卸载。

---

## C. 战斗表现层技术方案

### C1. 现状对照
`DungeonScene.hitEffect()`：弧线 `slash` 图 260ms 缩放淡出；`sparks.explode(14|26)`；`cameras.main.shake(90|160ms, 0.006|0.012)`；`setTintFill(0xffffff)` 70ms；伤害数字用 `scene.add.text`。
问题：① 无顿帧，击中瞬间没有"卡肉"；② 震屏幅度偏大——Phaser 的 shake intensity 是画面比例，0.006×1280 ≈ 7.7px，暴击 0.012 ≈ 15px，已超出业界对"强攻击 8–10px"的建议 [18]；③ 无击退/击飞；④ 特效是 1 张静态弧线图，不是序列帧；⑤ 无音效。

### C2. 各要素实现方法与建议参数
业界参数来源：顿帧 50–100ms [17][18]；"同一时刻叠加冻结+震屏+击退+闪白+音效"[17]；弱攻击震屏 2–3px、强攻击 8–10px，闪白 50–100ms，粒子 20–30 个、寿命 0.5–1s、初速 200–400px/s；时序"音效同时 → 闪白 +20ms → 粒子 +50ms → 飘字 +100ms" [18]；UE5 示例用 70ms 降到 5% 速度 [19]。以下数值是在这些范围内结合本项目 1280×720 画布的**起始值，需要真机调手感**。

| 要素 | 实现（Phaser） | 起始参数 |
|---|---|---|
| **顿帧 hitstop** | 全局：同时把 `scene.time.timeScale`、`scene.tweens.timeScale`、`scene.anims.globalTimeScale` 设为 0.05（Clock 的 `timeScale` 会同比例拉长 `delayedCall` [20]），用**不受缩放影响的计时**（`window.setTimeout` 或 `performance.now()` 在 `update` 里累计）在 N ms 后恢复。注意：不要用被缩放的 `scene.time.delayedCall` 来恢复，否则恢复会被一起变慢。更精细：只冻结攻击者+受击者（对这两个精灵 `anims.pause()`、暂停其 tween），背景/粒子继续动。 | 普通 60ms；暴击 90ms；Boss 受击 80ms；击杀 100ms；Boss 终结技 140ms + 0.3 倍慢放 500ms。上限 150ms，否则像卡顿 [17] |
| **受击闪白** | v3.90：`sprite.setTintFill(0xffffff)`，N ms 后 `clearTint()`；v4：`sprite.tintMode = Phaser.TintModes.FILL; setTint(0xffffff)`，之后还原 `tintMode`[3]。不要用 filter（每个 filter 一个帧缓冲 [7]） | 普通 70ms；暴击 100ms（白→暴击色）；玩家受击红闪 120ms（现有值可用） |
| **击退/击飞** | Tween：被击者 `x += dir*dist`，`Quad.out`，再回位；击飞用 y 抛物线（上 `Sine.out`、下 `Quad.in`）+ 地面阴影椭圆保持原位表现高度；暴击改为击飞。受击者持续 `hit` 动画帧 | 击退 30–50px/120ms；暴击击飞 y −90px，上 200ms 下 180ms；Boss 体型大只后仰 8–12px |
| **屏幕震动** | `cameras.main.shake(duration, intensity)`；intensity 是画面比例 → `px / 1280`。**设置里提供"减少震动/闪光"开关**（光敏和晕动考虑，儿童产品建议默认中档） | 普通 90ms / 0.003（≈4px）；暴击 140ms / 0.006（≈8px）；Boss 登场 400ms / 0.004；玩家受伤 200ms / 0.006 |
| **粒子** | Phaser 3.60+ 的发射器：一个共享 `ParticleEmitter`，`explode(n,x,y)`；图用图集帧（火花/星/碎片），`blendMode:'ADD'`；活跃粒子总数上限 | 普通 10–14；暴击 24–30；击杀 30–40；寿命 300–500ms；初速 200–400；平板"低画质"×0.5 |
| **拖尾/残影** | 冲刺时每 40ms 复制一个半透明精灵（alpha 0.5→0，色调蓝/橙），池化复用，4 个上限。比 Rope/Mesh 拖尾简单且 v3/v4 通用（v4 移除了 Mesh/Plane [3]）。武器挥砍用**预画的 6–8 帧挥砍序列**（ADD 混合）而不是 1 张静态图 | 残影 3–4 个/寿命 160ms；挥砍帧 30fps，约 230ms |
| **伤害数字** | 位图字体 `BitmapText` + 对象池（预建 20 个），不要每次 `add.text`/`destroy`（Canvas 文本会重新生成纹理）；动画：弹出 scale 1.5→1（80ms）→上浮 70px/700ms→最后 300ms 淡出；暴击放大 1.4×、橙黄、带描边 | 字体用工具（如 Hiero/ShoeBox 或 `msdf-bmfont-xml`）一次性烘焙数字+暴击+"COMBO" |
| **相机缩放/镜头** | `cameras.main.zoomTo(1.06, 80)` 再回；Boss 终结技 `pan` 到 Boss + zoom 1.15 持续 400ms，期间 hitstop 慢放 | 暴击 zoom 1.04–1.06；终结技 1.15 |
| **后处理 glow/bloom** | v3.90：`sprite.postFX.addGlow()`、`addBloom()`；v4：Glow 滤镜保留，Bloom 需 threshold+blur 自拼 [7]。**能烘焙进贴图就别用滤镜**：Boss 光环、技能发光画进序列帧并 ADD 混合；只对"终结技演出"整屏短暂开 1 个滤镜（≤ 600ms） | 同屏常驻滤镜 ≤ 2；低画质全关 |
| **音效** | 打击音与顿帧同一帧触发（反馈需在 ~100ms 内到达 [18]）；暴击叠一层高音"叮" | 见 §D2 |
| **技能演出（拼写搓招）** | 现有拼写题每个字母命中有火花，完成后"X 斩！"文字：升级为字母逐个点亮时播放蓄力粒子 + 角色蓄力帧；完成后进入 3 段 `hitFrames` 连击 | — |

### C3. 战斗时间轴（技能表数据驱动）
把"一次攻击"定义为数据，而不是代码里的 delayedCall 链：

```jsonc
// content-src/book1/skills.json（示意）
{
  "slash_basic": {
    "anim": "attack1",
    "dashTo": { "offset": -90, "ms": 140 },
    "hits": [
      { "t": 140, "dmgMul": 1.0, "hitstopMs": 60, "shake": [90, 0.003],
        "knock": { "px": 40, "ms": 120 }, "fx": "slash_a", "sfx": "hit_light", "flashMs": 70 }
    ],
    "returnMs": 260
  },
  "slash_crit": { "extends": "slash_basic",
    "hits": [{ "t": 140, "dmgMul": 2.0, "hitstopMs": 90, "shake": [140, 0.006],
               "knock": { "launch": -90 }, "fx": "slash_crit", "sfx": "hit_crit", "zoom": [1.05, 80] }] }
}
```
`BattleView.playSkill(skillId, attacker, target)` 读取该表，在一个 `Timeline`（对 `scene.time` 的薄封装，可暂停/可跳过）里依次触发；这样美术/策划改手感只改 JSON。`BattleController` 只关心结果（谁掉多少血、是否暴击）。

### C4. 战斗模式（半实时）技术含义
当前是"答题 → 技能结算"的回合制。若要"半实时"（敌人攻击条随时间走、答得快有加成），技术上只需在 `BattleController` 里加计时器与"敌人行动条"状态，不需要碰物理/碰撞。**不建议做真正实时动作（走位、闪避）**：小学生要同时读题，并且平板触屏操作与答题 UI 抢屏幕；成本与风险都高（见 §F）。

### C5. 特效管线：美术交付 → 打包 → 代码使用

```
美术（Aseprite 或任意软件）
  art-src/                       ← 新增，入库（体积大的 .psd/.aseprite 可放 LFS/网盘）
    chars/<id>/<anim>_<NN>.png    每动作一个序列，透明底、统一锚点(脚底中心)、统一画布尺寸
    fx/<id>/<NN>.png              特效序列：命中、暴击、挥砍、爆裂、升级光柱
    ui/…  bg/…
        │  npm run assets          tools/pack-atlas.mjs（free-tex-packer-core）
        ▼
public/assets/
  atlas/<bundle>.png|webp + <bundle>.json   (Phaser 图集格式，2048²，trim，去重)
  anims/<bundle>.anims.json                 (动画名、帧列表、fps、loop；由目录名自动生成，hit 帧可由美术在文件名标注，如 attack1_03_hit.png)
  manifest.assets.json                      (bundle → 文件清单 + 大小，供 AssetManager 与体积预算检查)
        │  运行时
        ▼
AssetManager.loadBundle('dungeon-L001') → registerAnims() → BattleView 用 anim 名/特效 id
```

**交付规范（给美术的一页纸）**：
- 展示尺寸：玩家约 150–190px 高，普通怪 90–130px，Boss 260–340px（画布 1280×720）；建议按 **1.5×** 绘制（清晰度 vs 内存折中），由 spike 在 iPad 上确认；
- 帧率：idle 6–8fps、行动 12–15fps、特效 24–30fps；
- 每个怪物：`idle 4帧 / attack 4帧`（受击死亡由代码形变）；主角：`idle 6 / run 6 / attack×3 各 5 / cast 6 / hit 2 / die 4`；
- 特效：命中 6–8 帧、暴击 8–10 帧、击杀爆裂 8 帧、升级 12 帧；
- 格式：PNG 序列（或 Aseprite 导出 JSON，需勾选 Packed、Trim、Merge Duplicates、标签 [14]），sRGB，预乘 alpha 不要；
- 命名统一小写+下划线，帧号 2 位。

**自动化检查**（`tools/validate-assets.mjs`，加入 `npm test` 或 CI）：图集单张 ≤ 2048²；每个 skill/enemy 引用的 anim 与 fx 必须存在；单个 bundle 体积 ≤ 预算（§D3）。

---

## D. 剧情/对话、资源加载、音频、单词发音

### D1. 剧情演出（对话、立绘、过场）

**需求**：副本前后对话、Boss 登场台词、城镇 NPC、章节过场、与英语学习联动（NPC 说的英文可点击发音）。

| 方案 | 利 | 弊 |
|---|---|---|
| **A. 自定义 JSON 剧本 + StoryRunner（推荐）** | 与现有内容管线（JSON → `build-content.mjs`）一致；可用 vitest 校验引用的角色/立绘/音效是否存在；策划用表格/Markdown 转 JSON 即可 | 要自己做分支/变量（但本项目分支需求很弱） |
| B. Ink（inkjs 运行时）或 Yarn Spinner | 剧本写作体验好、分支强 | 多一套工具链和运行时；孩子向线性剧情不需要；**这两个我未打开官方页面核实**（经验判断） |
| C. 把剧情全做成视频 | 表现最好 | 体积大、制作成本高；已有课文动画视频已是"视频演出"，剧情应与之区分 |

**StoryRunner 设计**（经验判断）：
- 剧本节点类型：`say {speaker, text, portrait, voice?}`、`narr`、`choice`（可选，最多 3 项）、`cam {zoom, pan}`、`sfx`、`bgm`、`wait`、`enter/exit`、`quizGate`（插入一道课文相关小题）、`goto`；
- `DialogueBox`：打字机（中文 25–35 字/秒，点击先补全再翻页）、姓名牌、**2–3 个表情的半身立绘**（来自图集）、"跳过/自动/回看日志"（家长审核友好）；
- 触发点：`dungeon.intro` / `boss.intro` / `dungeon.clear` / `town.npc.<id>` / `chapter.start`；是否已看过记入存档 `storyFlags`（§E）；
- 与学习联动：对话中的英文句子点击即 `AudioService.voice()`；
- 演出中不可误触：全屏透明输入层，`Esc`/长按跳过。

### D2. 音频

**问题**：SFX、BGM、单词发音、句子原声、移动端自动播放限制。

**引擎层**
| 方案 | 利 | 弊 |
|---|---|---|
| **Phaser 内置 Sound（推荐）** | 已打包、Web Audio 管理；首次用户点击自动解锁（`locked` 属性可查）；支持音频精灵；官方建议至少提供 MP3 [21]；iOS 切后台恢复有专门处理（搜索摘要） | 功能朴素 |
| Howler.js | 约 7KB gzip，默认 Web Audio+HTML5 回退，iOS 首次 touchstart 静默解锁，音频精灵（搜索摘要，npm 页面返回 403 **未能打开**） | 与 Phaser 内置功能重叠，引入则要避免两套解锁/音量系统 |

推荐 **Phaser 内置**。`AudioService` 做薄封装：分 `sfx/bgm/voice` 三条总线、各自音量、静音记入存档 `settings`；`visibilitychange` 暂停 BGM。

**自动播放限制**：所有浏览器要求首次用户手势后才能出声 [21]。设计一个"点击开始"的标题画面（也是 `Preload` 完成后的天然停顿），在此处 `sound.unlock`/播放 BGM；`DungeonScene` 的 `autoSpeak`（自动读题）不会因此被拦截，因为玩家早已点击进入副本。iOS 受静音拨片影响的情况要在设置里写提示（经验判断）。

**素材来源**
- **Kenney**：全部素材（含音频包）CC0，可商用，署名非必需，但不得使用 Kenney 标志 [22]；
- **Freesound**：授权为 CC0 / CC-BY / CC-BY-NC 三种，需逐条看；**OpenGameArt**：授权混杂（CC0/CC-BY/GPL）（均为仅搜索摘要）。若可能扩展到商业，**只收 CC0**，并在 `assets/CREDITS.md` 逐条登记来源/授权/链接（经验判断）；
- 需要的 SFX 清单（起步约 30 个）：命中轻/重/暴击、挥砍、拼写字母点击/错误、答对叮、答错、连击音阶（COMBO 2/5/10 升调）、Boss 登场/死亡、升级、掉落（按稀有度 3 档）、UI 点击、翻页/对话滴答；BGM 约 6 首（城镇、4–5 张地图的战斗曲、Boss 曲、结算）。

### D3. 资源加载与首屏预算

**目标**（经验判断，需用户确认）：
| 指标 | 预算 |
|---|---|
| 首屏（到出现"点击开始"）传输量 | ≤ **1MB**（Phaser 3.90 gzip 已约 317KB，Phaser 4 约 345KB [8]；再加 boot 图集 ≤ 300KB、字体 0） |
| 到达城镇可操作 | ≤ 2.5MB |
| 单个副本包（图集+音频精灵+BGM） | ≤ **6MB**，进入副本前预加载并显示进度 |
| 课文视频 | **不预加载**，`preload="metadata"`，边下边播；总 204MB 保持懒加载 |
| 中文字体 | **不加载 webfont**，沿用系统字体（现有 `FONT` 已是 PingFang/YaHei）；数字/COMBO 用位图字体 |

**包划分**：
```
boot      (<300KB)  进度条、标题画面、字体位图、解锁音频的按钮
town      城镇背景、NPC、UI 图集、城镇 BGM
region-N  地图通用：背景层、该图怪物图集、地图 BGM
dungeon-L{id}  该副本 Boss 图集、专属对话立绘、课文原声精灵（每课一个）
shared    主角图集（4 职业）、通用特效、通用 SFX（常驻）
```
- `AssetManager.loadBundle(id)`：封装 Phaser Loader，派发 `progress`；预加载策略：选中副本时加载 `dungeon-*`，并在后台预拉相邻 1–2 个；离开地图时 `textures.remove` 卸载 region 包以控内存；
- **每课一个音频精灵**：用现有 `video-segments` 的切分结果，ffmpeg 抽音轨为 AAC(m4a)/MP3 单声道 ~48kbps（平均 3 秒一句 ≈ 18KB，每课对 ≈ 10–20 句 ≈ 0.2–0.4MB）[经验估算]；格式选 m4a/mp3 以兼容 iOS Safari；
- **PWA/离线**（可选）：`vite-plugin-pwa` 预缓存 boot+town，其余按需缓存；注意更新策略（避免孩子拿着旧版本）。是否做取决于是否要"离线/添加到主屏幕"（§F）；
- **托管**：不能依赖谷歌服务 → 不用 Google Fonts/CDN 外链，所有资源自托管；是否放国内服务器/CDN（涉及备案）取决于使用范围，家长自用可以走局域网/本机静态服务（§F）。

### D4. 单词发音

**现状**：701 个词条（682 个不同单词）无音频；`speech.ts` 回退浏览器 `speechSynthesis`，优先 en-GB。

**浏览器 TTS 的可用性**
- Chrome 桌面的语音是"联网才有"的 19 个高质量语音，无本地回退；长句有 14 秒 bug [23]；
- Edge 桌面有 250+ 联网语音，但 Edge Android 返回空列表 [23]；
- Safari/iOS：下载的增强语音不会出现在 Web Speech API 列表里，升级预装语音还可能让它消失 [23]；
- 以上来自 Readium 文档（已打开）。**中国大陆的实测没有找到可靠资料**：Chrome 的在线语音依赖谷歌服务器这一点是我的**推断**（经验判断），需要在用户实际电脑上跑一次 `speechSynthesis.getVoices()` 才能确认。
- 结论：**不能作为主方案**，只保留为最后兜底。

**预生成方案对比**
| 方案 | 授权/风险 | 成本 | 评价 |
|---|---|---|---|
| **Azure AI Speech（推荐）** 构建时调用，生成 mp3 入库 | 微软问答称：输出文件**可商用、无需版税**，前提是**付费标准层（非免费层）**、**输入的是自己的内容**，且分发时需**披露为合成语音** [24]（已打开，是社区问答非法律文件，需要对象时请对照 Azure 条款复核）。注意"自己的内容"：课本文本版权不属于我们，**个人自用风险低，商业化前必须解决课本版权**（经验判断） | 免费层 **0.5M 字符/月**；付费 Azure 中国区神经语音 **¥95.4 / 百万字符** [25]。我们总量：682 词 ≈ 5–6 千字符；814 句 ≈ 3–4 万字符，**一次性远低于免费额度** | 质量稳定、可选 en-GB 男/女声，可调语速；voice 名（如 `en-GB-SoniaNeural`、`en-GB-RyanNeural`）需在 Azure 控制台/文档里确认再定（我未打开语音列表页） |
| **edge-tts**（Python，GPL-3.0） | 走的是 Edge"朗读"非公开接口，**不需 key**；README 说明微软阻止非 Edge 生成的 SSML [26]；搜索摘要提到微软已收紧反滥用/云 IP 过滤（**仅搜索摘要**）。属"非官方抓取"，**ToS 上有灰色地带**；GPL 对"工具产出的音频"一般不传染（经验判断，非法律意见） | 免费 | 仅适合家长自用的一次性生成；若将来扩展/商用，应换 Azure 官方 API 重生成 |
| **Piper**（本地离线，MIT） | 仓库已于 2025-10-06 归档，转至 OHF-Voice/piper1-gpl；**各语音模型各有授权，需逐个查** [27] | 免费、无需联网 | 英音质量与自然度不如 Azure（经验判断）；作为"离线备选" |
| **从课文视频原声截取单词** | 技术上：用 `faster-whisper` 之类词级时间戳 + ffmpeg 切，±50ms 余量；但连读/背景音乐/语速使单词发音不干净，需逐个人工试听 682 个；**版权**：视频是出版方作品，个人自用可，分发需授权（经验判断） | 工时大 | 不推荐做主方案；适合做"一个单词在课文里的原声例句"（已有句级 clip），句子仍用原声 |

**推荐组合**
1. 单词：Azure en-GB 预生成 `public/assets/audio/words/<word>.mp3`（每个 ≈ 6–12KB，总 ≈ 5–8MB），按地图打成音频精灵或按需加载；
2. 句子：课文原声（已有），改为每课音频精灵；缺失的句子用 Azure 补；
3. 兜底：浏览器 TTS；
4. 新增 `tools/gen-tts.mjs`：读取 `lessons/*.json`，对没有 `audio` 的 word 生成并回写 `audio` 字段（`types.ts` 的 `Word.audio` 已预留）；生成物加 `CREDITS`/说明"部分语音为 AI 合成"。
5. 缓存键：`hash(word + voice + rate)`，避免重复调用；生成后固定入库，不依赖运行时联网。

---

## E. 新架构草图

### E1. 模块划分
```
src/
  core/        App(启动)、EventBus、Services(依赖注入)、Settings、Perf(FPS 叠层)
  data/        content loader、defs: enemies/bosses/skills/dungeons/story 的类型+校验
  domain/      (= 现 systems/*) questions, srs, items, player, session, rng  ← 纯逻辑，无 Phaser
  save/        schema(+migrations), db
  battle/
     BattleController.ts   状态机：Intro → Question → Resolving{Attack|Enemy Hit} → Next → RoomClear → Result
     BattleView.ts         演员(Actor)、背景、HUD
     SkillTimeline.ts      读取 skills.json 驱动动画/特效/相机/音效
     FxManager.ts          粒子、残影、挥砍序列帧、对象池
     HitStop.ts, CameraDirector.ts, DamageNumbers.ts
  quiz/        QuestionPanel（PickPanel/SpellPanel/OrderPanel）、输入抽象(触屏/键盘)
  story/       StoryRunner、DialogueBox、Portrait、CutscenePlayer(含 DOM 视频)
  audio/       AudioService（sfx/bgm/voice/tts 兜底）
  assets/      AssetManager（bundle、进度、卸载）、manifest.assets.json 读取
  ui/          widgets、layout(安全区/触控尺寸)、modal
  scenes/      Boot, Preload, Title, Profile, Town, Battle, Result, Inventory（薄壳，只做装配）
```

### E2. 数据流
```
content JSON + 副本定义(dungeons.json) ──▶ domain.buildDungeon() ──▶ DungeonPlan(房间/题目/敌人id/boss id)
                                                                       │
save(SaveData) ──▶ domain.playerStats() ───────────────────────────────┤
                                                                       ▼
                                                          BattleController (状态机，纯逻辑)
                                           emit 事件: roomEnter / questionShown / answered{ok,combo}
                                                       / skillCast{id,crit,dmg} / enemyDown / playerHit / roomClear
                    ┌──────────────────────────────────────┼───────────────────────────────┐
                    ▼                                       ▼                               ▼
              BattleView/FxManager                    AudioService                     StoryRunner
         (SkillTimeline 播放，顿帧/震屏/飘字)       (sfx/voice/bgm)           (boss.intro/dungeon.clear 触发)
                                   │
              finishRun(save, logs) ──▶ SM-2/经验/掉落/成就 ──▶ game.persist() ──▶ IndexedDB(+备份)
```
要点：**逻辑不 import Phaser，表现不改存档**。`BattleController` 单测可以不开浏览器跑完整个副本；`BattleView` 换皮或改引擎时逻辑层不动。

### E3. 对内容管线的影响
- 新增内容源：`content-src/book1/{enemies,bosses,skills,dungeons,story}.json`，由 `tools/build-content.mjs` 校验后输出到 `public/content/book1/`；
- 新增工具：`pack-atlas.mjs`、`gen-tts.mjs`、`cut-lesson-audio.mjs`（每课音频精灵，沿用 `video-segments` 的结果）、`validate-assets.mjs`；
- `manifest.json` 增加 `bundles` 与每个副本的 `assets`、`story` 引用；
- `types.ts` 的 `Word.audio` 已留好，直接复用；`LessonPair.video` 保持；
- 测试扩展：①内容 schema 与引用完整性；②存档迁移 fixture；③BattleController 无头回放；④体积预算检查；⑤e2e 改用 `window.__test`。

### E4. 存档兼容迁移
现有机制（`schema.ts`）：`migrate()` 校验 id/name、拒绝更高版本存档、用 `newSave()` 的 base 浅合并旧档，补齐缺失字段并升到当前版本。**对"只加字段"的演进已足够**。

升级到 v2 建议新增字段（全部有默认值）：
```ts
storyFlags: Record<string, true>        // 已看过的剧情/过场
settings: { …原有, bgmVolume, sfxVolume, voiceVolume, quality: 'high'|'mid'|'low', reduceShake: boolean }
unlocked: { skills: string[], cosmetics: string[] }   // 技能/外观
tutorialDone: boolean
```
规则（家长对存档很看重，见项目记忆"save priority"）：
1. **只加不删不改名**：`dungeons` 的 key（如 `L001-002`）、SRS 的 `itemId`、`Item.uid`、`Job` 枚举值永不改；确需改名时写映射表在迁移里做；
2. `SAVE_VERSION` 每次结构变更 +1，在 `migrate()` 里加 `if (s.version < 2) {…}` 分支；
3. **迁移前自动备份**：在 `listProfiles()` 读到旧版本档时，先把原始数据 `add` 进 `backups`，再迁移写回（目前备份只在 `saveProfile` 时写，迁移后的数据才被保存——旧版原始数据可能被覆盖，需补这一步）；
4. 测试：`tests/fixtures/save-v1.json`（用真实存档导出）+ `save.test.ts` 断言迁移后字段完整、旧数据不丢；
5. IndexedDB 的 `DB_VER` 仅在新增 object store 时才升级；本期**不需要**新 store；
6. 数据存在浏览器 origin 下：换域名/端口（如开发 5174 与正式地址）会"丢档"，需要在首次升级前提醒家长用"导出"备份（现有 `exportSave` 可用）。

---

## F. 性能、触屏、风险与待拍板事项

### F1. 性能目标与手段（低端 Windows 笔记本、iPad 60fps）
| 项 | 目标/做法 |
|---|---|
| 帧率 | 平均 ≥ 55fps，1% low ≥ 40fps（spike 验收，见 B1）；画质档位 高/中/低，低档：粒子 ×0.5、关闭所有 filter、关震屏 |
| 预算 | draw call ≤ 60/帧（用图集+同图集合批）；活跃粒子 ≤ 150；常驻滤镜 ≤ 2 [7]；纹理常驻 ≤ 128MB（§B3） |
| 避免 | 每次命中新建 `Text`；每帧重绘 `Graphics`（Boss 血条只在变化时重绘，现状 OK）；大面积半透明叠加；运行时 `generateTexture` |
| 监控 | 开发期 `?perf=1` 叠层显示 FPS/drawcalls/纹理数；Playwright 在 CI 跑固定战斗脚本并输出帧时间 |
| 触屏 | `touch-action: manipulation`、禁用双击缩放/下拉刷新；最小触控 ≥ 48px（设计像素，经 FIT 缩放后复核）；iPad 4:3 在 16:9 FIT 下会上下留黑边——背景图延伸铺满即可（或做"安全区"布局，见 F3）；iPad Safari 不支持常规全屏，建议"添加到主屏幕"（PWA）；拼写题已有字母牌，**平板不能依赖键盘**；输入统一 `pointer` 事件 |

### F2. 风险
1. **Phaser 4 较新**（发布约半年）：社区资料少；Canvas 回退已弃用，老机器 WebGL2 兼容性要实测 [4]。缓解：spike + 保留 3.90 回退路线。
2. **美术进度是最大风险**：全部表现提升依赖美术交付；无美术时只能做"代码形变+占位图"。缓解：先把管线和占位美术跑通，美术按 §C3 规范交付。
3. **iOS 内存**：多张大图集同屏会触发 Safari 杀标签页 [16]。缓解：分包、卸载、纹理预算检查。
4. **滤镜性能**：每个 filter 一个帧缓冲，移动端慎用 [7]。缓解：能烘焙就烘焙。
5. **版权**：课本文本、课文视频、视频原声均属出版方作品；个人自用风险低，一旦扩展（分享/商业化）必须取得授权；Azure"自己的内容"条款同理 [24]。
6. **TTS 条款**：edge-tts 是非官方抓取 [26]，只适合一次性自用生成。
7. **Spine 授权**：如选 Spine，发布前须确认许可对"非商业/免费"场景的要求（仅搜索摘要称需持有授权）。
8. **顿帧实现坑**：用被缩放的计时器恢复会"卡死"；需独立的真实时间计时。
9. **范围蔓延**：剧情/特效/音频/新美术并行，建议分阶段（见 F4）。
10. **存档**：重构期间任何对 `SaveData` 的改动都必须走迁移并带 fixture 测试。

### F3. 需要用户拍板的事项
1. **引擎**：同意"先做 1–2 天 Phaser 4 spike，通过则升级，失败留 3.90"？（影响：之后所有代码按哪个版本写）
2. **目标设备**：请提供 ① 低端 Windows 笔记本的 CPU/GPU/内存/浏览器版本；② iPad 型号与 iOS 版本；平板是"必须支持"还是"尽量支持"？
3. **画幅**：保持 16:9（1280×720，iPad 上下留边）还是做 4:3/16:10 安全区？
4. **美术形式**：① 序列帧起步（推荐）；② 是否同意为 Boss/主角追加 Spine（Essential \$69 / Pro \$379 [2]，一次性）？谁来出美术/绑骨骼？
5. **战斗节奏**：保持"答题→技能"回合制（推荐），还是加"敌人行动条/限时加成"的半实时？对低年级是否要关闭限时压力？
6. **单词发音**：英音还是美音？男声/女声？接受 AI 合成语音吗？允许使用微软 Azure 账号（免费层足够个人用；需注册并可能需要海外信用卡）还是改用 edge-tts（非官方、仅自用）？
7. **音效/BGM 来源**：全部用 CC0 免费素材（Kenney 等）[22]，还是预算购买/委托原创？
8. **剧情作者与形式**：谁写剧本？线性对话（推荐）还是需要分支选择？是否要配音（否则全文字+立绘+音效）？
9. **发布/使用方式**：本机/局域网静态服务，还是放国内服务器/CDN（涉及备案、流量）？是否需要离线 PWA、添加到 iPad 主屏幕？
10. **体验与安全默认值**：震屏/闪白默认档位与"减少动效"开关（对光敏、晕动儿童）；课文视频 204MB 保持懒加载还是再压缩（现 640×480 CRF30）？

### F4. 建议分阶段（给排期参考，经验估算）
| 阶段 | 内容 | 估时 |
|---|---|---|
| P0 | 引擎 spike + 目标设备测试 + 决策 | 1–2 天 |
| P1 | 重构：BattleController/View 拆分、AudioService、AssetManager、事件总线；全部用占位美术；不改玩法 | 4–6 天 |
| P2 | 打击感：HitStop、技能时间轴、FxManager、BitmapText 飘字、相机、SFX 接入（占位图 + 程序特效） | 3–4 天 |
| P3 | 美术管线：pack-atlas、validate-assets、首批美术（1 主角+3 怪+1 Boss+特效）接入 | 3–4 天（不含美术工期） |
| P4 | 剧情：StoryRunner + DialogueBox + 剧本 JSON + 存档字段 v2 | 3–5 天 |
| P5 | 音频生产：gen-tts、每课音频精灵、BGM/SFX 清单 | 2–3 天 |
| P6 | 触屏/性能优化、画质档、PWA、e2e 重写 | 3–4 天 |

---

## 参考链接（按编号）

**已打开：**
- [1] Phaser 4 下载页（4.0.0 Caladan 2026-04-10；4.1.0 04-30；4.2.0 06-19；4.2.1 07-09）：https://phaser.io/download/phaser4
- [2] Spine 购买页（Essential \$69 特价，不含网格等高级功能；Professional \$379；一次性买断，免费升级）：https://en.esotericsoftware.com/spine-purchase
- [3] Phaser v3→v4 迁移要点（tintFill 移除、Pipelines→RenderNodes、FX/Masks→Filters、Mesh/Plane 与 Geom.Point 移除、Canvas 弃用）：https://app.unpkg.com/phaser@4.2.1/files/skills/v3-to-v4-migration/SKILL.md ；概览页：https://www.skills.sh/phaserjs/phaser/v3-to-v4-migration
- [4] Phaser 4 渲染器文章（RenderNode、4 顶点 quad、纹理单元、WebGL2、Canvas 弃用）：https://phaser.io/news/2026/04/phaser-4-renderer-faster-cleaner-and-built-for-modern-games
- [5] Phaser 4.2 Spine 渲染（spine-phaser-v4 4.3.11，需 Phaser ≥ 4.2.1，Mesh2D 合批，可回退 spine-webgl）：https://phaser.io/news/2026/07/phaser-4-2-spine-renderer-mesh2d-stencil
- [6] Spine Phaser v4 运行时发布（API 与 v3 运行时一致）：https://phaser.io/news/2025/04/spine-phaser-v4-runtime-released
- [7] Phaser 4 渲染概念/Filters（内置 ColorMatrix/Blur/Glow/Shadow；Bloom 等派生特效移除；每个 filter 占一次 draw call+帧缓冲；移动端慎用）：https://phaser.io/tutorials/phaser-4-rendering-concepts
- [8] 引擎对比（Phaser 4 完整包 345KB gzip；PixiJS 是渲染库、无场景/物理）：https://www.pistack.xyz/posts/2026-08-18-phaser-vs-pixijs-vs-kaboom-javascript-game-engine-comparison/ ；Phaser 4 评测摘要：https://phaser.io/news/2026/04/gamefromscratch-reviews-phaser-4-the-biggest-release-ever
- [9] Web 游戏引擎对比（Cocos Creator 空工程 2–4MB、Wasm 物理、免费、小程序强、中文文档）：https://app.cinevva.com/guides/web-game-engines-comparison ；Cocos Creator 3.8.6 发布（包体、Spine、性能）：https://www.cocos.com/en/post/f539c7888e620701228458d6b89b80c7
- [12] free-tex-packer-core（MIT；Phaser/Pixi/Spine 等导出；2048 默认；MaxRects）：https://cdn.jsdelivr.net/npm/free-tex-packer-core@0.3.8/README.md
- [15] TexturePacker 是否免费（非商业基础功能免费）：https://www.codeandweb.com/texturepacker/knowledgebase/is-texturepacker-free
- [16] WebKit 2020 bug：iPad Air 3 WebGL canvas 缩放内存泄漏至 ~1.25GB 后被杀（iOS 14.3 修复），说明 iOS 对 WebGL 内存敏感：https://bugs.webkit.org/show_bug.cgi?id=219780
- [17] Game feel / Juice（顿帧 50–100ms、震屏、粒子）：https://www.wayline.io/learn/game-feel/1
- [18] Web 小游戏手感参数（闪白 50–100ms；震屏 2–3px/8–10px；粒子 20–30、0.5–1s、200–400px/s；反馈时序）：https://eastondev.com/blog/en/posts/dev/20260521-game-feedback-feel/
- [19] UE5 顿帧示例（0.05 倍速持续 0.07s；单独作用于受击者）：https://uhiyama-lab.com/en/notes/ue/game-feel-hit-feedback/
- [20] Phaser Clock.timeScale（影响 TimerEvent/delayedCall）：https://docs.phaser.io/api-documentation/class/time-clock
- [21] Phaser 音频文档（首次点击解锁、`locked`、建议至少提供 MP3、Sound Manager 全局）：https://docs.phaser.io/phaser/concepts/audio
- [22] Kenney 支持页（全部素材 CC0，可商用，署名可选，不得使用其 logo）：https://kenney.nl/support
- [23] Web Speech 在各平台的语音可用性（Chrome 桌面联网语音/Edge 250+/Edge Android 为空/iOS 列表限制）：https://readium.org/speech/docs/WebSpeech.html
- [24] 微软问答：Azure TTS 输出可商用、需付费标准层、输入需为自有内容、需披露合成语音：https://learn.microsoft.com/en-us/answers/questions/1192398/can-i-use-azure-text-to-speech-for-commercial-usag
- [25] Azure 中国区定价（神经语音 ¥95.4/百万字符，免费层 0.5M 字符/月）：https://www.azure.cn/en-us/pricing/details/cognitive-services/
- [26] edge-tts（GPL-3.0；无需 key；微软阻止非 Edge 生成的 SSML）：https://github.com/rany2/edge-tts
- [27] Piper（MIT；2025-10-06 归档，迁至 OHF-Voice/piper1-gpl；模型授权需另查）：https://github.com/rhasspy/piper

**仅搜索摘要、未能逐页打开（引用处已标注）：**
- [10][11] Phaser 3 的 Spine 插件与授权讨论：https://phaser.discourse.group/t/can-i-use-the-spine-plugin-in-the-example-commercially/13726（403）；https://spineplugin.readthedocs.io/en/latest/legal.html
- [13] Phaser DragonBones 插件：https://phaser.io/news/2017/03/phaser-dragonbones-plugin
- [14] Phaser 3.60 `createFromAseprite`：https://newdocs.phaser.io/docs/3.60.0/focus/Phaser.Animations.AnimationState-createFromAseprite（域名无法解析）
- Howler.js：https://www.npmjs.com/package/howler（403）
- Freesound / OpenGameArt 授权类型：搜索结果摘要，需逐条素材页确认。
