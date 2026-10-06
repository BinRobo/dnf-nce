# 第 3 轮资源规格

风格统一按 docs/slice/SPEC.md 1.1 节（Q 版扁平卡通，4px #2B2A4A 描边，平涂+一层阴影，纯矢量 SVG：无 text/image/filter/渐变/外部引用，半透明可用 fill-opacity）。项目根目录 /home/ubuntu/dnf，Playwright 已安装（`import { chromium } from 'playwright'`，本地用 `python3 -m http.server` 起服务，用完关掉）。

## A. Boss 重画 + 新小怪（美术 1）

家长反馈：两个 Boss 都是“紫色大雾团”，敷衍、没有辨识度。要求：**每个 Boss 剪影一眼可辨**（不同的身体结构、主色、标志物），可爱滑稽但有气势，明显比小怪华丽（更多细节、配饰、层次）。

覆盖现有文件（键名不变，面朝左，脚底中点在 viewBox 底边中点，viewBox 420×420 左右，可更高）：
| 文件 | 角色 | 设计要点 |
|---|---|---|
| public/assets/art/mobs/boss_pardon.svg | 吞声领主 · 帕顿（吞掉了街上的 “Excuse me!” 和女士的手提包） | **主色橙红+金**。一个胖胖的领主：头就是一只巨大的金色喇叭/扩音器（大嘴），戴小王冠，披红色披风，大肚皮上鼓出女士的手提包轮廓，两只小短手，一只手拿着权杖（顶端是小喇叭） |
| public/assets/art/mobs/boss_whomist.svg | 夺名迷雾 · 胡迷斯（偷走全班同学的名字） | **主色墨绿+银**。瘦高的怪盗：深绿色斗篷+高礼帽+单片眼镜，斗篷内侧挂满彩色名牌（像勋章），一只手抛着名牌，脚下有一团淡雾；整体是“细长三角”剪影，与帕顿的“圆胖”形成对比 |

新增小怪（面朝左，约 160×160，脚底中点在底边中点）：
| 文件 | 名字 | 对应题型 | 要点 |
|---|---|---|---|
| mobs/parrot.svg | 学舌鹦鹉 | 听音 | 彩色鹦鹉，嘴巴张开学舌 |
| mobs/bookworm.svg | 翻页书怪 | 识词 | 一本长了眼睛和小脚的书，书页像舌头 |
| mobs/pencil.svg | 铅笔小兵 | 拼写 | 削尖的铅笔士兵，橡皮头盔，举着尺子当矛 |

写 public/assets/art/preview_r3.html 展示以上 5 个（并与旧的 bat/slime/goblin 并排看风格是否统一），截图自查，至少迭代一轮。只写上述文件。

## B. 室内与城镇地图（美术 2）

1. 商店室内背景：public/assets/art/bg/shop_{far,mid,ground}.svg（1280×720，地面线 y≈470）。温馨的小杂货店：货架上摆药水瓶、卷轴、糖果罐，柜台在画面中间偏右（x≈820），墙上挂一个手提包形状的招牌图案（无文字）。
2. 城镇地图：public/assets/art/bg/worldmap.svg（1280×720，不透明）。一张卡通羊皮纸风格的俯视地图，上面 6 个区域（**位置固定，程序会在这些坐标放按钮**）：
   - 学园区 (250, 520)：学校、钟楼
   - 集市区 (520, 470)：喷泉、店铺、紫色传送门
   - 山谷村 (360, 270)：山谷里的小村庄、厨房烟囱
   - 国王街 (720, 300)：一排城市房子、87 号
   - 集市与车站 (980, 430)：火车站、铁轨
   - 雪山邮局 (900, 140)，剧院区 (1110, 220)：雪山、剧院
   区域之间画小路相连；不要文字。
写 public/assets/art/preview_r3b.html 展示 shop 三层叠加与 worldmap（在上述 6 个坐标画红点验证位置），截图自查。只写上述文件。

## C. 稀有度打击音效（音频，Haiku）

新增 key（写进 public/assets/audio/manifest.json 的 "sfx"，文件放 public/assets/audio/sfx/）：
| key | 想要的声音 |
|---|---|
| hit_t1 | 蓝色装备命中：比普通更清脆的金属斩击 |
| hit_t2 | 紫色：金属 + 轻微回响/铃声 |
| hit_t3 | 粉色：水晶般的叮 + 厚重打击 |
| hit_t4 | 史诗：最震撼——重击 + 爆裂 + 铃声（可多素材混合） |
| equip_epic | 装备史诗武器时的华丽音效（≤1.5 秒） |
| craft | 打造装备成功（锤击 + 叮） |
| shard | 获得史诗碎片（亮晶晶的叮） |
| door_in | 进门/出门 |
| map_open | 打开城镇地图（翻纸声） |

素材只用 /home/ubuntu/dnf/.cache/audio-src/ 里已有的 Kenney CC0 包（impact-sounds、rpg-audio、interface-sounds、digital-audio、music-jingles、ui-audio）。
**交付方式（必须）**：不要自己转码。在 public/assets/audio/CREDITS.md 的 SFX 表里为每个 key 加一行：
`| sfx/<key>.mp3 | <包名> | <原文件名（不带扩展名）；多个素材用 “a + b (mixed)”> | Kenney | CC0 | https://kenney.nl/assets |`
并把 key 加进 manifest.json。然后运行 `cd /home/ubuntu/dnf && node tools/rebuild-sfx2.mjs`，它会转码并检查每个文件；输出里如有 ⚠ 就换素材重来，直到没有 ⚠（ui_click 那条 0.04s 的警告可以忽略）。源文件名用 `find .cache/audio-src -name '*.ogg'` 查。只改 CREDITS.md、manifest.json（以及脚本生成的 sfx 文件）。

## D. 史诗武器（美术 3）

参照 public/assets/art/chars/hero/weapons/ 下已有武器（先看 epic_sword.svg 与 weapons.json 的格式：竖直朝上，px/py 是握把位置），新增 2 把 Boss 主题史诗武器，华丽程度不低于 epic_sword：
| look 名 | 名字 | 要点 |
|---|---|---|
| epic_horn | 史诗·帕顿的金号角锤 | 金色大喇叭当锤头，红宝石，橙红+金 |
| epic_quill | 史诗·胡迷斯的名牌羽杖 | 银色长杖顶端是墨绿大羽毛笔尖，挂几枚彩色名牌，墨绿+银 |
文件：weapons/epic_horn.svg、weapons/epic_quill.svg，并在 weapons.json 中加对应条目（file/px/py）。另写 64×64 图标：public/assets/art/icons/epic_horn.svg、epic_quill.svg、epic_sword.svg（图标是武器斜放 45°、居中、略带底光圈）。
写 public/assets/art/preview_r3d.html 并排展示 3 把史诗武器与 3 个图标，截图自查。只写上述文件。
