# 第 5 轮：全书 6 章的游戏内容（策划）

项目 /home/ubuntu/dnf：给小学 3–6 年级学新概念英语第一册的 DNF 风格游戏。

## 先读这些

| 内容 | 位置 |
|---|---|
| 剧情设定 | docs/slice/SPEC.md、docs/slice/SPEC2.md |
| 已有剧本格式 | content-src/story/*.json（尤其 L001_intro.json、L005_boss.json、quest_L001_give.json、town_*.json）及校验脚本 content-src/story/validate.mjs |
| NPC 台词和配音格式 | content-src/npc/barks.json、voices.json |
| 城镇数据 | content-src/npc/town.json |
| 6 张副本地图、每张 12 个副本 | content-src/book1/regions.json |
| 每对课的课文 | content-src/book1/Lxxx-yyy.json；L101 以后正在录入，没有的就按课本标题设计 |

剧情主线：“寂静之雾”偷走了大家的台词。缄默公爵·赫什率领静默军团，手下有 6 位领主。孩子每打败一个怪，就找回一句台词。

已有：
- 第 1 章的 Boss：吞声领主·帕顿（L1-2，大喇叭头、橙红 + 金）、夺名迷雾·胡迷斯（L5-6，瘦高怪盗、墨绿 + 银）。
- 小怪按题型分：听音、识词、拼写、排序、填空、复习。

## 要你产出 4 样东西

### 1. content-src/chapters.json（数据，程序直接读）

```json
{
  "bosses": {
    "boss_xxx": { "title": "领主头衔", "name": "名字", "color": "#rrggbb", "moves": ["waves", "slam", "inhale"],
                  "moveNames": ["招式名1", "招式名2", "招式名3"], "line": "登场台词（中文，≤20字）" }
  },
  "mobs": {
    "mob_xxx": { "name": "名字", "qtype": "listen|meaning|spell" }
  },
  "chapters": [
    { "ch": 1, "mobs": { "listen": "bat", "meaning": "slime", "spell": "goblin" }, "elite": "精英名" }
  ],
  "dungeons": {
    "L025-026": { "boss": "boss_xxx", "tagline": "这一课 Boss 干了什么坏事（≤18字，和课文内容挂钩）", "elite": "精英名（可选）" }
  }
}
```

**Boss 招式。** moves 从下面 6 个程序已有的招式里选 3 个，moveNames 给它起一个贴合这个 Boss 的名字：

| 招式 | 效果 |
|---|---|
| waves | 张嘴放出声波圈 + 字母 |
| slam | 跳起砸地 |
| inhale | 把主角的字母吸走 |
| tags | 甩出彩色卡片飞镖 |
| fog | 消失在雾里再闪现偷袭 |
| hats | 从天上掉东西砸下来 |

**Boss 数量。**
- 第 1 章再加 1 个，给第 1 章其余副本用。
- 第 2–6 章每章 3 个，共 15 个。
- 每个 Boss 的造型和名字都要和本章的课文主题强相关，比如第 2 章有厨房、家具、天气。
- 剪影、主色彼此差别要大，可爱滑稽，但有压迫感。
- 每章第 3 个 Boss 是这一章的“领主”，放在本章第 12 个副本（章末），最华丽。
- 赫什本人（kind = `duke`，已有美术）放在全书最后一个副本 L143-144。

**dungeons。** 给全部 72 个副本都写一条（L001-002、L005-006 已有专门设计，可以照写已有的 Boss）。每个副本指定用本章哪个 Boss，再写一句和那一课课文挂钩的 tagline。

**mobs。** 第 2–6 章每章新设计 3 种小怪，对应听音、识词、拼写，共 15 种。第 1 章沿用已有的 bat/slime/goblin，chapters 里照写。

### 2. docs/slice/ROUND5-art.md（给美术的造型说明）

对上面每个新 Boss（16 个）和新小怪（15 个），各写 3–5 行造型说明：剪影、主色、标志物、和课文的联系、可爱点。文件名用 kind，例如 `mobs/boss_xxx.svg`、`mobs/mob_xxx.svg` 的 xxx。

美术格式照 docs/slice/ROUND3.md 的 A 节：
- Boss 约 420×420，面朝左，脚底中点在底边中点。
- 小怪约 160×160。

把 16 个 Boss 分成 4 组、15 个小怪分成 3 组，在文档里标“美术 B1–B4、M1–M3”，方便我分派。

### 3. 各章 NPC（content-src/npc/town.json + barks.json + voices.json）

山谷村、国王街、集市与车站、雪山邮局、剧院区 5 个街区（第 2–6 章），每个加 3 个 NPC。

- 人物优先用该章课文里出现的人物，例如 Mrs. Smith、Tim、Sally、Jimmy、Penny、Mr. Jones，从课文 JSON 的 speaker 里找。
- 角色形象只能用这些：
  - 已有大人：rig `blake`（男老师）、`woman`（女士）、`tailor`（年长女士）。
  - 两个即将新做的大人：rig `man`（普通叔叔，可换帽子颜色）、`lady`（年轻阿姨）。
  - 小孩：`kid` rig 加一个头像 head。已有头像：hans、naoko、changwoo、luming、xiaohui。可以新增头像，新头像名写进 ROUND5-art.md 的“新头像”一节，最多 6 个。
- town.json 的 spot 格式照已有的写：
  - npc / head / name / label / act: "bark" / district。
  - x 坐标在 200–2300 之间，避开 70、1920、2490 附近的路牌和传送门。
  - after 写本章第 1 个副本的 id，打通它才出现；第 2 章 NPC 写 "L025-026"。
- barks.json 每个 NPC 4–5 句闲聊（中文、≤22 字，带人物性格，可以夹一个简单英文词）。voices.json 给每个 NPC 配一个 zh-CN 音色和 rate/pitch，照已有格式。

### 4. 剧本（content-src/story/）

| 文件 | 内容 | 场次 |
|---|---|---|
| ch{N}_intro.json（N=2..6） | 第一次进入该章街区时播放 | 6–10 句 |
| ch{N}_boss.json（N=1..6） | 本章领主 Boss 登场 | 4–6 句 |
| ch{N}_clear.json（N=1..6） | 打败本章领主后，找回的台词和下一章的伏笔 | 6–8 句 |
| finale.json | 打败赫什后的全书大结局，温暖、有成就感 | 10–14 句 |

- 说话人可用：sophie、blake、hero（主角），本章新 NPC，Boss 用其 kind。
- 适合小学生：短句、有趣、不吓人。每段剧本至少有 1 句英文原句，取自那一章课文。
- 写完运行 `node content-src/story/validate.mjs`，直到通过。

## 规矩

只写上面列出的文件：
- chapters.json
- ROUND5-art.md
- town.json（只追加 spot）
- barks.json、voices.json（只追加）
- story 下的新文件

不改代码。完成后不超过 150 字汇报。
