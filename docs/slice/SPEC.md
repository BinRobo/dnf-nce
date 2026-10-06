# 垂直切片 · 资源规格（美术 / 剧本 / 音频）

背景与设计依据：/home/ubuntu/dnf/docs/research/design.md（策划）、art.md（美术）、tech.md（程序）。
已确认：剧情方案 A《失落的台词》、混合式战斗、Q 版扁平卡通风格。
切片范围：第 1 章的两个副本 L1–2《Excuse me!》、L5–6《Nice to meet you.》+ 序章 + 城镇。
游戏画布 1280×720，Phaser 3。所有资源放在 public/assets/ 下，**文件名与本规格一致**，程序按名加载。

---

## 1. 美术（SVG）

### 1.1 统一风格
- Q 版扁平卡通，2–2.5 头身，大头大眼，圆润；参考新概念课文动画（/home/ubuntu/dnf/.cache/video/L005_sheet.jpg、L001_sheet.jpg，可用 Read 查看）。
- 外描边 4px，颜色 #2B2A4A（不用纯黑）；内线 2px 同色。只用平涂色块 + 一层阴影色（比底色暗 15–20%），不用渐变、滤镜、阴影效果。
- 色板：天空蓝 #7FD0FF / #A6E3FF，草绿 #6FD36B / #3FA94A，金 #FFC94A，橙 #FF9F43，红 #E8505B，紫 #8B5CF6，肤色 #FFD9B8（阴影 #F2B896），深色 #2B2A4A。
- 不血腥、不恐怖：怪物是“可爱的捣蛋鬼”，Boss 有点滑稽。
- SVG 要求：纯矢量（path/rect/circle/ellipse/polygon），**不要** <text>、<image>、<filter>、<style>、渐变、外部引用；每个文件有明确 viewBox，背景透明（背景图除外）。

### 1.2 角色纸娃娃（主角与 NPC）
程序把角色拆成部件分别做补间动画（呼吸、挥砍、受击后仰、被击飞旋转），因此每个角色是一个目录：
```
public/assets/art/chars/<id>/
  rig.json
  legL.svg legR.svg body.svg armL.svg armR.svg head.svg [head_happy.svg head_sad.svg head_surprised.svg] [weapon.svg]
```
- 角色面朝**右**。站立总高约 340 单位（游戏里会按 0.5 缩放到约 170px）。
- 坐标约定：角色根原点 = 两脚中间的地面点 (0,0)，向上为负 y。
- `rig.json` 格式：
```json
{
  "height": 340,
  "parts": [
    {"id":"legL","file":"legL.svg","x":-18,"y":-70,"px":12,"py":6,"z":0},
    {"id":"armL","file":"armL.svg","x":-30,"y":-190,"px":10,"py":8,"z":1},
    {"id":"body","file":"body.svg","x":0,"y":-150,"px":60,"py":80,"z":2},
    {"id":"legR","file":"legR.svg", "...":"..."},
    {"id":"head","file":"head.svg","x":0,"y":-210,"px":90,"py":150,"z":4},
    {"id":"armR","file":"armR.svg","x":30,"y":-190,"px":10,"py":8,"z":5},
    {"id":"weapon","file":"weapon.svg","x":40,"y":-120,"px":10,"py":80,"z":6,"parent":"armR"}
  ],
  "faces": {"normal":"head.svg","happy":"head_happy.svg","sad":"head_sad.svg","surprised":"head_surprised.svg"}
}
```
  - `x,y`：该部件**枢轴点**在角色坐标系中的位置（如手臂的肩点、腿的胯点、头的脖子点）。
  - `px,py`：枢轴点在该部件 SVG 自身 viewBox 坐标中的位置（程序用它做旋转中心）。
  - `z`：绘制顺序，大的在前。
  - `parent`（可选）：武器挂在右手上，x,y 为相对 armR 枢轴的偏移（单位同角色坐标）。
  - 各部件在默认姿势下拼在一起必须严丝合缝（关节处用圆头相互重叠，旋转 ±40° 不露缝）。
- 头部变体（表情）与 head.svg 尺寸、枢轴完全一致，只换五官。

需要的角色：
| id | 说明 | 表情 | 武器 |
|---|---|---|---|
| hero | 主角，10 岁左右的新同学，短发，蓝色校服外套 + 冒险小披风 | normal/happy/surprised/sad | 木剑（weapon.svg，竖直，剑尖朝上，握柄枢轴） |
| sophie | Sophie Dupont，法国女孩，金色短卷发，红色贝雷帽，第一个伙伴 | normal/happy/surprised | 无（可选一本书） |
| blake | Mr. Blake 老师，40 岁，眼镜，棕色西装，和蔼 | normal/happy/surprised | 无 |
| woman | 第 1 课丢手提包的女士，长裙，帽子 | normal/happy/surprised | 无（手提包由程序单独画或 handbag.svg 放在 props） |
| classmates | 第 5 课的 5 位同学 Hans/Naoko/Chang-woo/Luming/Xiaohui：**共用一套 kid 身体**（chars/kid/），只给 5 个头像 head_hans.svg… | 每人 normal 即可 | 无 |

另需道具：public/assets/art/props/handbag.svg（女士手提包，约 80×70）、book.svg（发光的“台词簿”，约 90×110）。

### 1.3 怪物（整张 SVG，程序做挤压拉伸、闪白、击飞、碎裂）
```
public/assets/art/mobs/<id>.svg   （面朝左，脚底中点在 viewBox 底边中点）
```
| id | 名称 / 对应题型 | 尺寸（viewBox） | 设计要点 |
|---|---|---|---|
| bat | 耳语蝙蝠 · 听音辨义 | 160×140 | 大耳朵，耳朵里有声波纹，紫灰色 |
| slime | 镜子史莱姆 · 见义识词 | 160×130 | 淡蓝半透明感（用两层色块表现），身上有一面小镜子 |
| goblin | 字母哥布林 · 拼写 | 160×180 | 绿色，举着一块字母积木当盾 |
| golem | 积木傀儡 · 连词成句 | 180×200 | 由彩色积木拼成，方块头 |
| imp | 空格小鬼 · 句型填空 | 150×150 | 身体中间有个“空格”缺口，调皮 |
| fog | 雾精 · 复习怨念怪 | 150×150 | 半透明紫雾团，两只大眼 |
| echo | 精英“Pardon 回音精” | 220×220 | 蝙蝠的精英版：更大、戴喇叭形耳朵、金色装饰 |
| boss_pardon | Boss 回音怪 Pardon（L1–2） | 420×420 | 一只巨大的、长着喇叭嘴的雾团怪，把声音“说糊”，肚子里隐约有手提包 |
| boss_whomist | Boss 名字迷雾 Who-Mist（L5–6） | 420×420 | 戴着一串打乱名牌的项链的雾巨人，表情狡猾但滑稽 |
| duke | 反派缄默公爵（序章只露剪影/半身） | 300×400 | 戴礼帽、披斗篷的演员，嘴上贴着封条 |

### 1.4 背景（1280×720，分层 SVG，带不透明底色）
```
public/assets/art/bg/<scene>_far.svg  （天空/远景，1280×720）
public/assets/art/bg/<scene>_mid.svg  （中景建筑/树，1280×720，透明处留空）
public/assets/art/bg/<scene>_ground.svg（地面带，1280×720，地面线在 y≈470，地面以下画满）
```
| scene | 内容 |
|---|---|
| town | 学校前的小广场：校舍、钟楼、告示板、花坛；明亮温暖 |
| street | 第 1 课：剧院门口/街道（女士丢手提包的场景），带一点灰紫色“静默之雾”笼罩 |
| classroom | 第 5 课：Mr. Blake 的教室（黑板、课桌、窗外蓝天），被雾笼罩 |
| boss | Boss 房：舞台/剧场，聚光灯，紫色雾更浓 |

### 1.5 交付检查
- 写一个 public/assets/art/preview.html，把所有 SVG（角色按 rig.json 组装好）平铺展示，方便检查；用 Playwright 截图自查（`node` + `playwright`，项目已安装），确认无破图、无缝隙、比例统一。

---

## 2. 剧本（JSON）

文件：content-src/story/<id>.json；格式：
```json
{
  "id": "prologue",
  "bg": "town",
  "steps": [
    {"t": "narr", "zh": "开学第一天。"},
    {"t": "enter", "who": "blake", "side": "left"},
    {"t": "say", "who": "blake", "face": "happy", "zh": "欢迎来到我们班！"},
    {"t": "say", "who": "blake", "en": "Good morning.", "audio": {"lesson": "L005-006", "line": 0}},
    {"t": "fx", "key": "fog"},
    {"t": "sfx", "key": "boss_appear"},
    {"t": "item", "key": "book", "zh": "获得：台词簿"},
    {"t": "exit", "who": "blake"}
  ]
}
```
- `say`：`who` ∈ hero/sophie/blake/woman/hans/naoko/changwoo/luming/xiaohui/duke/boss_pardon/boss_whomist；`face` ∈ normal/happy/sad/surprised；`zh` 中文台词（≤ 25 字/句）；`en` 英文台词（**只能用已学课文原句**，并尽量给 `audio` 指向课文原声：lesson 为课程 id，line 为该课 dialogue 中的句子序号，序号从 0 起，见 public/content/book1/lessons/<id>.json 的 dialogue 数组）。
- `narr` 旁白；`enter/exit` 角色登场退场（side: left/right）；`fx`：fog（雾气涌起）/ fog_clear（雾散）/ shake / flash；`item`：获得物品提示。
- 主角不说中文长句，以点头/表情为主；台词口吻温暖幽默，适合 8–12 岁。

需要的剧本与时长上限（按每句约 3 秒估算）：
| id | 时机 | 上限 | 内容 |
|---|---|---|---|
| prologue | 新建角色后第一次进城镇 | ≤ 90 秒（约 20 步） | 开学日；Mr. Blake 欢迎；Sophie 也是今天来的；静默之雾涌来，全城的人说不出话；只有主角还能说英语；Mr. Blake 交出空白“台词簿”；Sophie 成为伙伴；目标：先去街上帮那位说不出话的女士 |
| L001_intro | 进入 L1–2 副本前的委托 | ≤ 15 秒（4–5 步） | 女士着急地比划，说不出话；最后 1 句是本课原句并带原声，但被雾“吃掉”关键词（用 `en` 写完整原句，程序负责挖空） |
| L001_boss | Boss 登场 | ≤ 3 秒（1–2 步） | 回音怪 Pardon 一句挑衅 |
| L001_clear | Boss 击败后 | ≤ 10 秒（3 步） | 雾散；女士用原声说出 "Is this your handbag?"/"Thank you very much." ；台词簿第 1 页恢复 |
| L005_intro | 进入 L5–6 前 | ≤ 15 秒 | 回到教室，Mr. Blake 想介绍同学却叫不出名字 |
| L005_boss | Boss 登场 | ≤ 3 秒 | 名字迷雾 Who-Mist 一句挑衅 |
| L005_clear | 击败后 | ≤ 10 秒 | 同学们恢复说话，全班说 "Nice to meet you."（原声）；Hans 等同学之后会加入 |
| town_blake / town_sophie | 城镇点击 NPC | 每个 2–3 句 | 只用已学原句或简短中文提示 |

另外写 content-src/story/README.md，列出每个剧本的估算时长。

---

## 3. 音频

目录：public/assets/audio/sfx/<key>.mp3、public/assets/audio/bgm/<key>.mp3；单个音效 ≤ 60KB、单声道；BGM 64–96kbps、可循环、每首 ≤ 2.5MB。只用 **CC0**（优先，如 Kenney：Impact Sounds、RPG Audio、Interface Sounds、UI Audio、Digital Audio、Music Jingles）或 **CC-BY**（需署名）素材；不要 CC-BY-SA / GPL / 不明授权。转码用项目里的 ffmpeg（`node -e "console.log(require('ffmpeg-static'))"` 得到路径）。

| key | 用途 |
|---|---|
| swing1 swing2 swing3 | 挥砍（3 个变体） |
| hit_light hit_heavy hit_crit | 命中：普通 / 重击 / 暴击（暴击带清脆“叮”） |
| launch land | 击飞 / 落地 |
| enemy_pop | 小怪被打散（卡通“噗”） |
| shield player_hurt | 护盾挡住 / 主角受伤 |
| ui_click ui_correct ui_wrong | 按钮 / 答对 / 答错（答错要温和，不刺耳） |
| letter_ok letter_miss | 拼写字母正确（短促、明亮，程序会升调）/ 空挥 |
| combo | 连对提升 |
| gauge_full awaken | 觉醒槽满 / 觉醒技 |
| boss_appear boss_phase boss_down | Boss 登场 / 换阶段 / 被击败 |
| door step | 房间门 / 跑步 |
| levelup loot loot_epic coin | 升级 / 掉落 / 史诗掉落 / 金币 |
| fog fog_clear | 雾气涌起 / 雾散 |
| page | 翻页（剧情对话、台词簿） |
| bgm/town bgm/dungeon bgm/boss bgm/story | 城镇（轻快）/ 副本（冒险）/ Boss（紧张但不吓人）/ 剧情（温柔） |

交付：public/assets/audio/CREDITS.md（每个文件：来源包名、原文件名、作者、授权、链接）；public/assets/audio/manifest.json（`{"sfx":{"swing1":"sfx/swing1.mp3",...},"bgm":{...}}`）。
