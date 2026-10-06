# 录入规范：新概念第一册课文 → content-src/book1/Lxxx-yyy.json

工作目录 /home/ubuntu/dnf。每对课（单课课文 + 双课练习）一个文件，例如 `L089-090.json`。
**先完整读一个现成样例**：`content-src/book1/L087-088.json`、`L085-086.json`（照着格式写）。

## 资料位置
- 课本扫描页：`.cache/pages/pNNN.png`（PDF 页码）。每对课通常占 4 页：单课课文、单课生词+译文、双课练习图、双课书面练习。
  L87 在 p181，L89 约在 p185，依次 +4；但中间可能插有测试页（如 "Can you do this test?"），**以页面标题为准**，找不到就前后翻页。
- 视频切分结果：`.cache/video/L0xx.json`（只有单课有视频），`passes[0]` 是第一遍播放的字幕段列表。
- 视频核对拼图：`.cache/video/L0xx_sheet.jpg`，从上到下每行对应 passes[0] 的一个段（左右两帧分别是段开头和结尾），可读出每段英文字幕。

## 字段
- `id`, `lessons`, `title`, `titleZh`（单课标题），`evenTitle`, `evenTitleZh`（双课标题）。
- `words`：单课 + 双课的全部生词，按课本顺序；`ipa` 去掉斜杠；`pos` 词性；`zh` 中文；`lesson` 所属课号。
  不规则动词的过去式写进 zh，如 "离开（过去式 left）"。
- `lines`：课文逐句，`speaker` 用课本角色名（叙述文则省略），`zh` 取课本"参考译文"对应部分。
- `video.splits`（可选）：自动切分漏切时，手工给出切换时间（秒），先切开再按 starts 编号。
- `video.starts`：**必填**。`starts[i]` = 第 i 句课文从 passes[0] 的第几个段开始（0 起）。
  做法：读 sheet，逐行写下每段字幕；课文一句如果被视频拆成多段，就合并（只记第一段的序号）；
  如果视频把两句放在同一段里，就把课文这两句合并成一句。要求：starts 递增、长度 = lines 数、最后一个 < 段数。
  （若视频一段对一句、段数正好等于句数，可省略 video 字段。）
- `drills`：8–9 道单空选择题。`en` 中恰好一个 `___`；`options` 4 个、互不相同，**第一个是正确答案**（游戏会打乱）；
  `zh` 是整句中文。题目来源：双课 Written exercises 改编（优先）+ 单课课文重点句型/生词。
  干扰项必须是错的且只用已学过的词（不要出现两个都能填的选项）。

## 完成后自检（必须做）
1. `node tools/build-content.mjs` —— 不能出现关于你负责的课的 ⚠。
2. `node tools/check-align.mjs L089-090` 然后用 Read 看 `.cache/align-L089-090.jpg`：每行字幕截图应与 lines 同序号的英文一致（第一行偶尔为空白可忽略）。不一致就改 starts 再查。
3. `npx vitest run tests/content.test.ts` 通过。

只修改你负责的 content-src 文件，不要改代码、不要动其他课。
最后简短报告：每对课的句数/段数、合并了哪些句子、有没有拿不准的地方。
