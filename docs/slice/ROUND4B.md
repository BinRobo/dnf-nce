# 第 4 轮 B：三职业 × 男女

项目根目录 /home/ubuntu/dnf。美术风格、截图自查方法和“只写自己那一节的文件”的规矩，都同 docs/slice/ROUND4.md 开头。

职业：
- **剑士 sword**：近战、挥剑。
- **神枪手 gunner**：卡通枪械，子弹是字母和音符。不血腥。
- **魔法师 mage**：元素魔法：火、冰、雷、光。

每个职业都有男 m、女 f 两种。原来的主角 chars/hero 就是“剑士·男”。

---

## G. 新主角（美术，3 人）

新目录：
- chars/hero_sf：剑士·女
- chars/hero_gm、chars/hero_gf：神枪手·男、女
- chars/hero_mm、chars/hero_mf：魔法师·男、女

**硬性要求**（装扮要能套在所有主角身上）：
1. rig.json 直接**复制** chars/hero/rig.json，一个字都不改。
2. body/armL/armR/legL/legR/head 以及 head_happy、head_surprised、head_sad 这些 SVG，必须和 hero 同名文件**完全相同的 viewBox、width、height 和最外层 transform**。
   - 关节位置、身体轮廓、头的大小位置要和 hero 一致；只改发型、脸、衣服。
   - 女生的长头发可以垂到肩后，但不能超出 head 的 viewBox。
3. weapon.svg 直接复制 chars/hero/weapon.svg。
4. 都面朝右，Q 版，和 hero 同一画风，同年龄（小学生冒险者）。

| 目录 | 形象 |
|---|---|
| hero_sf | 剑士女孩：马尾辫，蓝白骑士短上衣 + 短裙 + 打底裤，红披风（和男剑士呼应），棕色靴子 |
| hero_gm | 神枪手男孩：额头上推着护目镜，短发，棕色皮夹克，子弹带改成彩色字母带，工装裤，短靴 |
| hero_gf | 神枪手女孩：双丸子头，护目镜，橙色飞行员夹克，短裤 + 长袜，短靴 |
| hero_mm | 魔法师男孩：卷发，蓝白学徒长袍（**不要和装扮里的紫色“魔法学徒”撞色**），星月图案腰带 |
| hero_mf | 魔法师女孩：长直发配发箍，浅蓝白长袍连衣裙，披肩斗篷，星星胸针 |

分工：
- 美术 G1：hero_sf
- 美术 G2：hero_gm、hero_gf
- 美术 G3：hero_mm、hero_mf

预览：复制 public/assets/art/costume_preview.html，改成 hero_preview.html，`?char=hero_gm` 时读取 chars/hero_gm/。
- 每个角色截图检查站立和挥手两种姿势。
- 再用 `?char=<目录>&sets=school,knight` 检查已有装扮套在新角色身上是否合身。装扮在 chars/hero/costume/，所有主角共用。

## H. 职业武器（美术，2 人）

格式同 chars/hero/weapons/ 里已有武器（先看 weapons.json 和 longsword.svg）：
- **竖直朝上，枪口和杖头朝上**，px/py 是握把位置。
- 每把武器另配一个 64×64 图标，放在 public/assets/art/icons/<look>.svg。图标斜放 45°、居中、略带底光圈，参照 icons/umbrella.svg。
- 在 weapons.json 里加条目。

**美术 H1（神枪手 + 剑士史诗）：**

| look | 名字 | 类别 | 造型 |
|---|---|---|---|
| pistol | 字母手枪 | 手枪 | 圆润的玩具手枪，枪身印 ABC |
| rifle | 音符步枪 | 步枪 | 长枪管，枪托上有音符 |
| cannon | 单词手炮 | 手炮 | 粗短的大炮口，可扛在肩上 |
| icecreampistol | 冰淇淋水枪 | 手枪 | 枪口是冰淇淋甜筒，弹仓是彩色冰淇淋球 |
| carcannon | 小汽车手炮 | 手炮 | 一辆红色玩具小汽车改装成炮，车头是炮口 |
| keyboardrifle | 键盘连射枪 | 步枪 | 枪身是一段键盘，按键当装饰 |
| epic_megacannon | 史诗·帕顿的扩音炮 | 手炮 | 金色大喇叭当炮口，红宝石，橙红 + 金 |
| epic_badgerevolver | 史诗·胡迷斯的名牌左轮 | 手枪 | 墨绿 + 银色左轮，转轮上嵌彩色名牌 |
| epic_canesword | 史诗·胡迷斯的手杖剑 | 长剑 | 绅士手杖里抽出的银色细剑，墨绿握柄，礼帽造型护手 |

**美术 H2（魔法师）：**

| look | 名字 | 类别 | 造型 |
|---|---|---|---|
| wand | 星光魔杖 | 魔杖 | 短魔杖，顶端一颗星 |
| orb | 水晶法球 | 法球 | 握柄托着一颗发光水晶球 |
| tome | 单词魔典 | 魔典 | 带握把的厚魔法书，封面有字母 |
| teacherwand | 老师的教鞭 | 魔杖 | 木头教鞭，顶端发光的粉笔头 |
| glassorb | 玻璃杯法球 | 法球 | 一只透明玻璃杯里装着旋转的魔法光 |
| epic_hornstaff | 史诗·帕顿的号角法杖 | 法杖 | 长杖，顶端金色小喇叭，喇叭口冒出音波光圈，橙红 + 金 |

两人各写一个预览页（preview_r4h1.html / preview_r4h2.html），截图自查。

## I. 职业技能数据（策划，2 人）

剑士沿用现有技能树。神枪手、魔法师各写 23 个**主动**技能，写到 content-src/skills/gunner.json 和 content-src/skills/mage.json。4 个被动技能（语法之盾、两次觉醒、连击大师）三职业共用，不用写。

- 开放等级按顺序**必须是**：1,1,3,3,5,5,8,8,12,12,15,18,18,22,22,34,34,38,38,42,42,54,58。
- 越往后的技能越华丽：段数更多、组合更多步骤、元素混合。
- 第 1 个技能是“随时可用”的基础技。

每个技能：
```json
{ "id": "g_rapid", "name": "速射", "level": 1, "desc": "连开四枪，字母子弹打个不停", "glyph": "射",
  "color": "#ffd34a", "element": "phys",
  "fx": [ { "do": "shoot", "proj": "letter", "n": 4, "perRank": 1, "gap": 70 } ] }
```

- **id**：神枪手用 g_ 开头，魔法师用 m_ 开头。
- **name**：≤ 6 个字，要酷、孩子喜欢。可以借用 DNF 风格，但不要照抄 DNF 的技能名。
- **desc**：≤ 24 个字，写清楚效果。
- **glyph**：1 个字，显示在技能图标上。
- **element**：phys / fire / ice / thunder / light / mix。
  - 神枪手以 phys 为主，可以有火（榴弹）、雷（电磁）、光（激光）。
  - 魔法师四元素都要有，后期加 mix。
- **fx**：按顺序执行的步骤，可用的步骤：

| do | 参数 | 说明 | 算命中吗 |
|---|---|---|---|
| charge | color | 蓄力：光点汇聚 | 否 |
| tint | element(fire/ice/thunder/light) | 整屏色调 | 否 |
| zoom / shake | shake 可带 px | 镜头推近 / 震屏 | 否 |
| wait | ms | 停顿 | 否 |
| freeze | — | 把敌人冻进冰块 | 否 |
| shoot | proj, n, perRank, gap, spread | 从主角射向敌人，每发命中一次 | n 次 |
| rain | proj, n, perRank, gap | 从天上落到敌人身上 | n 次 |
| explode | kind(fire/ice/thunder/light/phys), scale | 在敌人身上爆炸 | 1 次 |
| lightning | n, perRank | 天降分叉闪电 | n 次 |
| shatter | — | 击碎冰块（前面必须先 freeze） | 1 次 |
| spikes | n, perRank | 冰锥破土 | 1 次 |
| pillar | n, perRank | 地面喷火柱 | n 次 |
| ray | n, perRank | 光柱落下 | n 次 |
| cross | — | 十字圣光 | 1 次 |
| dragon / phoenix | — | 火龙冲击 / 火凤凰俯冲 | 1 次 |
| slash | n, perRank | 刀光（神枪手可以当回旋踢） | n 次 |
| beam | color | 横向激光 | 3 次 |

- **proj** 可选：bullet, laser, fireball, iceball, thunderball, lightorb, rocket, grenade, arrow, star, letter, note。
- **perRank**：技能每升 1 级，n 增加多少（0–3）。
- **规则**：
  - 1 级时总命中段数在 1–16 之间。
  - 最后一步必须是命中步骤。
  - n 在 1–12 之间。

写完运行 `node tools/validate-skills.mjs gunner`（或 mage），直到输出 OK。

分工：
- 策划 I1：神枪手。
- 策划 I2：魔法师。

## J. 职业音效（便宜模型）

做法同 ROUND3.md 的 C 节：只用 .cache/audio-src/ 里的 Kenney CC0 素材，在 CREDITS.md 的 SFX 表加行，把 key 加进 manifest.json，然后运行 `node tools/rebuild-sfx2.mjs`，直到输出里没有 ⚠。

| key | 想要的声音 |
|---|---|
| gun_shot | 卡通手枪“啪”（清脆、短、不吓人） |
| gun_rifle | 步枪连射单发，比手枪更利落 |
| gun_cannon | 手炮“嘭”，低沉 |
| gun_laser | 激光“咻——” |
| gun_reload | 换弹“咔哒” |
| grenade | 榴弹落地爆炸 |
| mage_cast | 施法“嗡”（魔法聚集） |
| mage_bolt | 魔法弹飞出 |
| mage_fire | 火球呼啸 |
| mage_ice | 冰晶凝结“叮” |
| mage_thunder | 电流“滋滋” |
| mage_light | 圣光“铃——” |
