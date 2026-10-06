# 第 4 轮资源规格

项目根目录 /home/ubuntu/dnf。美术风格按 docs/slice/SPEC.md 1.1 节：Q 版扁平卡通，#2B2A4A 描边（与已有部件同粗细），平涂 + 一层阴影；纯矢量 SVG，不用 text、image、filter、渐变或外部引用，可以用 fill-opacity。

截图自查：Playwright 已安装（`import { chromium } from 'playwright'`）。在 public/assets/art 下运行 `python3 -m http.server <端口>` 预览，用完关掉（用 `kill <pid>`，不要用 pkill -f）。每个任务至少截图自查并迭代一轮。**只写自己那一节列出的文件。**

---

## A. 装扮套装（美术，两个人各做 3 套）

主角骨骼在 public/assets/art/chars/hero/：rig.json 写明每个部件的锚点 px/py；部件文件有 body/armL/armR/legL/legR/head.svg，披风画在 body.svg 里。主角面朝右。

**每套 6 个文件**，放在 public/assets/art/chars/hero/costume/<套装id>/：

1. **body.svg、armL.svg、armR.svg、legL.svg、legR.svg**
   - 以原始同名部件为底稿复制后改画，必须和原文件**完全相同的 viewBox、width、height 和最外层 transform**，这样锚点才对得上。
   - 关节（肩、髋）位置和身体轮廓大致不变，只换衣服：颜色、款式、配饰。
   - 手和皮肤部分保留。披风可以去掉，或换成该套装风格的披风。
2. **hat.svg**
   - 与原始 head.svg 完全相同的 viewBox、width、height 和外层 transform。
   - 只画帽子或头饰，其余透明。它会整张叠在头上，所以要盖住头顶头发，但不能挡住眼睛。
   - 要同时适配 head_happy、head_sad、head_surprised（这几张的头发相同）。

预览：`costume_preview.html?sets=<id1>,<id2>,<id3>`，左边是原始主角做对比，每套显示站立和挥剑两个姿势。截图检查接缝、错位和穿帮（挥剑时肩膀处不能露缝）。

| id | 名字 | 设计要点 |
|---|---|---|
| school | 校园制服 | 新手套：蓝白水手领校服、红领巾或领结、白袜蓝鞋；帽子是一顶蓝色学生帽 |
| knight | 见习骑士 | 银色轻甲胸甲、蓝色内衬、银护臂护腿；帽子是带红羽毛的骑士头盔（露出脸） |
| mage | 魔法学徒 | 紫色星星长袍（下摆盖到膝盖，画在 body 和腿上）、金色腰带；帽子是带星星的紫色尖帽 |
| pardon | 喇叭领主 | 帕顿 Boss 主题：橙红 + 金、红色短披风、小喇叭肩饰；帽子是迷你金喇叭造型的王冠帽 |
| whomist | 名牌怪盗 | 胡迷斯 Boss 主题：墨绿燕尾服 + 银纽扣、胸前别几枚彩色名牌、墨绿斗篷；帽子是小号墨绿高礼帽，配单片眼镜 |
| festival | 节日礼服 | 彩色派对装：橙黄条纹上衣、彩色背带裤、彩带装饰；帽子是派对尖帽 + 彩球 |

- 美术 A1 做 school、knight、mage。
- 美术 A2 做 pardon、whomist、festival。

## B. 第一章系列装备「失物招领」（美术）

主题是第 1 章课文 “Is this your …?” 里的物品。

1. **手持武器 6 把**，放在 public/assets/art/chars/hero/weapons/。先看已有的 longsword.svg、staff.svg、bow.svg、epic_sword.svg 和 weapons.json：竖直朝上，px/py 是握把位置，尺寸与同类相近。

   | look | 名字 | 类别 | 造型 |
   |---|---|---|---|
   | umbrella | 雨伞剑 | 长剑 | 合起来的长柄雨伞当剑，伞尖是剑尖 |
   | penstaff | 钢笔法杖 | 法杖 | 巨大的钢笔，笔尖朝上发光 |
   | pencilbow | 铅笔弓 | 弓 | 两支弯曲的铅笔做弓臂，橡皮头做两端 |
   | handbaghammer | 手提包锤 | 锤 | 长柄，锤头是女士手提包 |
   | ticketdagger | 车票匕首 | 短剑 | 刀身是一张卷起的车票，带打孔 |
   | bookblade | 书本巨剑 | 巨剑 | 剑身由一摞书组成，书脊彩色 |

   在 weapons.json 里加上这 6 个条目（file/px/py）。
2. **图标 13 个**，放在 public/assets/art/icons/<key>.svg，64×64。物品斜放 45°、居中、略带底光圈，参照已有的 icons/epic_sword.svg。
   - 上面 6 把武器各一个（文件名同 look）。
   - 另外 7 个：`hat`（帽子，头盔类）、`coat`（外套，衣服类）、`suit`（西装，衣服类）、`shoes`（皮鞋，鞋子类）、`tie`（领带，项链类）、`passport`（护照护符，项链类）、`watch`（手表，戒指类，做成戒指上镶表盘）。

预览写 public/assets/art/preview_r4b.html：6 把武器 + 13 个图标，截图自查。

## C. 裁缝 NPC（美术 + 台词）

1. 新角色 public/assets/art/chars/tailor/：结构完全照搬 chars/woman/（rig.json 与部件文件名一致，4 张表情头）。
   - 形象：集市的裁缝阿姨。圆眼镜、脖子挂软尺、围裙口袋插着剪刀和线轴、发髻上插一支铅笔。
   - 配色和老板娘明显不同。
2. 台词：
   - 在 content-src/npc/barks.json 加 `tailor`：6 句，`"when": "always"`，每句 ≤ 22 字，热情、爱夸人。内容提到：用打怪得到的布料、丝线和 Boss 掉的特殊材料来做套装；穿齐一整套有特别的入场效果。
   - 在 content-src/npc/voices.json 加 tailor 的配音参数：参照已有条目，选一个和老板娘不同的 zh-CN 女声。
3. 预览：在 public/assets/art/preview_r4c.html 里用 CSS 按 rig.json 拼出裁缝（可参考 costume_preview.html 的拼法），截图自查。

## D. 技能特效素材（美术）

放在 public/assets/fx/。都是透明背景，白描边改用同色系深色描边或不描边，发光感用多层半透明叠加：

| 文件 | 尺寸 | 内容 |
|---|---|---|
| fire_burst_1..6.svg | 256×256 | 火焰爆裂 6 帧：小火球 → 膨胀 → 炸开花瓣状火焰 → 外圈火舌 → 散成火星 → 只剩几点余烬（橙红黄） |
| ice_spike.svg | 120×300 | 从地面向上刺出的冰锥（底在下方中点），浅蓝到白，带棱面高光 |
| ice_block.svg | 260×300 | 冻住敌人用的半透明冰块（fill-opacity 约 0.45），带棱面和裂纹 |
| ice_shard.svg | 48×48 | 冰碎片 |
| holy_cross.svg | 300×300 | 金白色十字光芒，四道光刃加中心光球 |
| light_ray.svg | 160×720 | 竖直光柱，边缘半透明，中心更亮 |
| flame_dragon.svg | 360×220 | 炎龙斩用的火焰龙头（面朝右，嘴张开），橙红火焰造型 |
| phoenix.svg | 420×300 | 凤凰（展翅、面朝右，火焰羽毛），给以后的「凤凰之翼」 |

预览写 public/assets/fx/preview.html，深色背景下逐个展示，6 帧火焰横排，截图自查。

---

## E. 粒子贴图（音频/素材，便宜模型）

1. 下载 Kenney「Particle Pack」（CC0，页面 https://kenney.nl/assets/particle-pack ），解压到 /home/ubuntu/dnf/.cache/particle-pack/。
2. 从中挑出以下用途的 PNG（白色或灰度的最好，程序会染色），复制并改名到 public/assets/fx/particles/：
   - fire_1、fire_2
   - flame_1
   - smoke_1、smoke_2
   - spark_1、spark_2
   - star_1、star_2
   - light_1、light_2
   - magic_1、magic_2
   - twirl_1
   - trace_1、trace_2
   - circle_1、circle_2
   - dirt_1
   - scorch_1
   - slash_1

   如果包里的名字不同，就选最接近的。超过 256px 的用 ffmpeg 缩到 256px（ffmpeg 路径：在项目根目录运行 `node -e "console.log(require('ffmpeg-static'))"`）。
3. 写 public/assets/fx/particles/list.json：一个文件名数组（不带扩展名）。
4. （CREDITS.md 由别人负责，不要改。）把包里的 License.txt 复制到 public/assets/fx/particles/LICENSE.txt。
5. **自检（必须）：**用 node 读每个 PNG 文件头，确认是 PNG、宽高大于 0、不超过 256；列出文件数，必须是 21。

只写 public/assets/fx/particles/ 和 .cache/particle-pack/。

## F. 城镇分区背景音乐（音频，便宜模型）

现有背景音乐都来自 Kevin MacLeod（incompetech.com，CC BY 4.0），下载方式见 .cache/music-src/dl.sh：`https://incompetech.com/music/royalty-free/mp3-royaltyfree/<曲名URL编码>.mp3`。

需要新增的 key（写进 public/assets/audio/manifest.json 的 "bgm"，文件放 public/assets/audio/bgm/）：

| key | 场景 | 想要的感觉 | 候选曲名（只能选 Kevin MacLeod 的，下载失败就换别的） |
|---|---|---|---|
| campus_1..3 | 学园区 | 轻快、明亮、上学路上 | Carefree、Wallpaper、Pixel Peeker Polka - faster、Monkeys Spinning Monkeys、Fluffing a Duck |
| market_1..3 | 集市区 | 热闹、跳跃、逛街 | Life of Riley、Merry Go、Bushwick Tarantella、Hyperfun、Scheming Weasel faster |
| shop_1..2 | 小店室内 | 温馨、慢、轻柔 | Easy Lemon、Lobby Time、Cool Vibes、Wholesome |
| valley_1 | 山谷村 | 田园 | Teller of the Tales、Village Consort、Pippin the Hunchback |
| king_1 | 国王街 | 城市午后 | Bossa Antigua、Sidewalk Shade、Cheery Monday |
| station_1 | 集市与车站 | 出发旅行 | On the Ground、Overcast、Happy Alley |
| snow_1 | 雪山邮局 | 冬天、清冷但温暖 | Frost Waltz、Snowfall? 若不存在可选 Peaceful Desolation、Dreamy Flashback |
| theatre_1 | 剧院区 | 剧场、华丽 | Gymnopedie No 1、Danse Macabre? 若不合适选 Fig Leaf Rag、Cheery Monday |

要求：
1. 下载到 .cache/music-src/。HTTP 状态必须是 200，文件必须大于 300KB，否则换候选曲名。
2. 转码与现有一致：mp3，48000Hz，立体声，96kbps；用 loudnorm 让响度接近现有 town_1.mp3（先用 volumedetect 量 town_1 的 mean_volume，新文件相差不超过 3dB）。
3. 更新 manifest.json 的 bgm，并在 CREDITS.md 的「背景音乐」表里给每个文件加一行“文件 | 曲名”。
4. 写 public/audition/bgm2.html：按区域分组列出新曲子，每首一个播放器（`<audio controls>`），写上曲名和用途，方便家长试听。
5. **自检（必须）：**对每个新文件运行 `ffmpeg -i <file> -af volumedetect -f null -`，确认时长大于 60 秒、mean_volume 在 -25dB 到 -12dB 之间、没有解码错误。把结果表输出到 .cache/bgm2-check.txt。有不合格的就修，直到全部合格。

只写 public/assets/audio/bgm/、manifest.json 的 bgm、CREDITS.md、public/audition/bgm2.html、.cache/music-src/、.cache/bgm2-check.txt。

## F2. 城镇音乐返工（家长反馈：新曲子不好听，最早的三首好听）

家长喜欢最早的三首城镇音乐：public/assets/audio/bgm/town_1.mp3（Achaidh Cheide）、town_2（Celtic Impulse）、town_3（Folk Round），都是 Kevin MacLeod 的凯尔特 / 民谣风，轻快、木吉他 / 小提琴 / 风笛。

**要做：**
1. 学园区 campus、集市区 market、小店 shop 直接用这三首：
   - 在 manifest.json 的 bgm 里把 campus_1..3、market_1..3 指向 bgm/town_1.mp3、town_2.mp3、town_3.mp3（同一文件可被多个 key 引用）。
   - shop_1..2 指向 town_3.mp3 和下面新找的 tavern 风格曲子。
   - 删掉原来 campus_*、market_*、shop_* 的 mp3 文件和它们在 CREDITS.md 的行。
2. 其他 5 个街区，各找 **1–2 首和这三首风格接近的 Kevin MacLeod 凯尔特 / 民谣 / 中世纪集市风曲子**，替换 valley_1、king_1、station_1、snow_1、theatre_1（可以加 _2）。删掉被替换的旧文件。
   - 候选（下载失败就换）：Thatched Villagers、Master of the Feast、Minstrel Guild、Pippin the Hunchback、Tavern Loop One、Suonatore di Liuto、Galway、Lord of the Land、Angevin B、Celtic Impulse 风格的其他曲子。
   - 不要电子、爵士、钢琴独奏、氛围类。
3. 转码、响度：mp3 48000Hz 立体声 96kbps；mean_volume 用 volumedetect 量，要和 town_1.mp3 相差 ≤ 1.5 dB（town_1 约 -18.4 dB）。不够就加 volume 增益，再加 alimiter=limit=0.95 防爆音。
4. 更新 CREDITS.md 背景音乐表、public/audition/bgm2.html（按区域列出，标明哪首是原来那三首）。
5. **自检（必须）：**对每个 bgm key 指向的文件跑 volumedetect：时长 > 60 秒、mean 在 -20 到 -17 dB、无解码错误。结果写到 .cache/bgm3-check.txt。不合格就修到合格。

只改 public/assets/audio/bgm/、manifest.json 的 bgm、CREDITS.md、public/audition/bgm2.html、.cache/。
