# 音效第 2 批：技能音效 + 怪物音效

项目：/home/ubuntu/dnf（儿童英语 RPG）。现有音效在 public/assets/audio/sfx/，清单 public/assets/audio/manifest.json（"sfx" 里 key → 文件），来源记录 public/assets/audio/CREDITS.md。已下载的 Kenney 素材在 /home/ubuntu/dnf/.cache/audio-src/（impact-sounds、rpg-audio、interface-sounds、digital-audio、music-jingles、ui-audio，均 CC0）。

## 需要新增的 key（全部放 sfx/，写进 manifest.json 的 "sfx"）

技能（每个技能“出招声 cast”+“命中声 hit”；风格要明显不同、听着爽、不刺耳）：
| key | 想要的声音 |
|---|---|
| sk_slash_cast / sk_slash_hit | 快速挥剑“嗖” / 清脆斩中 |
| sk_rising_cast / sk_rising_hit | 上扬的挥砍 / 把敌人挑飞的“砰” |
| sk_whirl_cast / sk_whirl_hit | 旋风呼啸 / 连续切割 |
| sk_thrust_cast / sk_thrust_hit | 冲刺破风 / 穿刺“嗤” |
| sk_wave_cast / sk_wave_hit | 剑气发射（能量波）/ 能量爆开 |
| sk_frost_cast / sk_frost_hit | 结冰咔咔声 / 冰块碎裂（玻璃碎裂类） |
| sk_thunder_cast / sk_thunder_hit | 蓄电滋滋 / 雷击轰鸣（不要太吓人） |
| sk_fire_cast / sk_fire_hit | 点火呼啦 / 火焰爆燃 |
| sk_meteor_cast / sk_meteor_hit | 高处坠落呼啸 / 重砸地面 |
| sk_letters_cast / sk_letters_hit | 魔法闪烁叮当 / 一连串“咚咚”砸落（短） |
| sk_storm_cast / sk_storm_hit | 密集刀风 / 收尾重击 |
| awaken_cast | 觉醒技：激昂的能量聚集（1–2 秒） |

怪物（受击 hurt、出手 attack、被打散 die；卡通可爱风格，不恐怖、不血腥）：
| 怪物 | 说明 |
|---|---|
| mob_bat_* | 蝙蝠：吱吱叫 |
| mob_slime_* | 史莱姆：咕叽/啵 |
| mob_goblin_* | 哥布林：小怪物嘟囔/哼 |
| mob_golem_* | 积木魔像：木头/石块碰撞 |
| mob_imp_* | 小恶魔：调皮尖笑 |
| mob_fog_* | 雾灵：呜呜的幽灵风声 |
| mob_echo_* | 精英骑士：金属铠甲/低吼 |
| mob_boss_* | Boss（大雾怪）：低沉的吼、受击闷响 |
（* = hurt / attack / die，共 24 个；可以复用同一素材做变调。）

## 做法
1. 优先用本地 Kenney 素材；不够的去找 **CC0**（首选）或 **CC-BY** 素材，例如：OpenGameArt 的 CC0 魔法/怪物音效包（如 “RPG Sound Pack”、“80 CC0 RPG SFX”、“Monster sound effects” 等，以页面授权为准），Kenney 其他包（https://kenney.nl/assets 里 Sci-fi Sounds、Voiceover / RPG 类）。打开页面确认授权后再下载到 /home/ubuntu/dnf/.cache/audio-src2/。不要 CC-BY-SA、GPL、NC、来源不明的。
2. 没有现成的可以用 ffmpeg 加工（变调 asetrate/atempo、混音 amix、加淡出、叠加低频 lowpass 等）做出来。ffmpeg 路径：在 /home/ubuntu/dnf 下运行 `node -e "console.log(require('ffmpeg-static'))"`。
3. 统一：mp3 单声道 96kbps，去首尾静音，单个 ≤ 50KB，响度大致统一（loudnorm I=-16），cast/hit 时长 0.15–0.8 秒（awaken_cast ≤ 2 秒）。
4. 更新 manifest.json 和 CREDITS.md（每个新文件：来源包、原文件名、作者、授权、链接、做了什么加工）。
5. 写 /home/ubuntu/dnf/public/audition/sfx2.html：列出所有新 key，每个一个播放按钮，方便家长试听。

只写：public/assets/audio/sfx/、manifest.json、CREDITS.md、public/audition/sfx2.html、.cache/audio-src2/。
完成后不超过 150 字汇报：新增数量、来源与授权、哪些是加工合成的。
