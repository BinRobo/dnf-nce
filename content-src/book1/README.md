# 第一册内容源文件

每对课一个文件（单课课文 + 双课练习），由 `node tools/build-content.mjs` 合并视频切分结果，生成 `public/content/book1/`。

- `words`：生词（含音标、词性、所属课）。
- `lines`：课文，**按视频字幕切分的粒度**逐句列出（与 `.cache/video/Lxxx.json` 第一遍的段数一致），`zh` 取自课本参考译文。
  `speaker` 可选。
- `drills`：根据双课练习改编的填空题，`___` 为空，`options` 第一个之外是干扰项（顺序会被打乱）。
