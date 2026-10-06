# 英语地下城（新概念英语第一册 · 原型）

借鉴 DNF 核心循环的英语学习网页游戏：刷副本 → 答题即攻击 → 连击评级 → 掉装备 → 强化 → 升级转职，
底层用间隔重复（SM-2）安排复习，答错的内容会变成“怨念怪”在以后的副本和“每日深渊”里回来。

## 部署到其他服务器

见 [docs/DEPLOY.md](docs/DEPLOY.md)：一个 Node 进程同时托管游戏和“账号 + 云存档”后端，`deploy/push.sh` 一键推送，或用 `deploy/make-bundle.sh` 打离线包。家长在 `/admin` 管理孩子账号。

## 运行

```bash
npm install
npm run dev      # 开发，浏览器打开终端里显示的地址
npm test         # 单元测试
npm run build    # 打包到 dist/，可直接放到任何静态服务器
```

## 目录

```
NewConceptEnglish/          原始素材（课本 PDF、课文视频），不进 git
content-src/book1/          人工整理的课程源文件：生词、课文逐句、练习题（每对课一个）
tools/                      内容流水线脚本（见下）
public/content/book1/       构建产物：manifest.json、lessons/*.json、media/*.mp4（视频不进 git）
src/
  systems/                  纯逻辑：出题、间隔重复、掉落/强化、经验、结算（有单元测试）
  save/                     存档：IndexedDB + 自动快照 + 导出/导入 + 版本迁移
  scenes/                   Phaser 场景：角色选择、城镇、副本、结算、背包
  audio/speech.ts           课文原声（从视频截取片段）/ 语音合成兜底
  ui/video.ts               Boss 前播放的课文动画
tests/                      单元测试 + 内容校验；tests/e2e 为浏览器冒烟测试
```

## 内容流水线

```bash
node tools/render-pdf.mjs 1 299      # 扫描版课本 → .cache/pages/*.png（用于对照录入）
node tools/video-segments.mjs        # 按英文字幕切分每段课文视频 → .cache/video/Lxxx.json + 核对拼图
node tools/transcode.mjs             # 压缩视频供网页使用 → public/content/book1/media/
node tools/build-content.mjs         # 合并 content-src + 视频时间 → public/content/book1/
node tools/check-align.mjs L005-006  # 抽查：每句课文对应的视频字幕截图
```

视频字幕的切分粒度和课本断句不总是一致。句数一致时自动对齐；不一致时在源文件里写
`"video": { "pass": 0, "starts": [...] }`，`starts[i]` 表示第 i 句从第几个自动切分段开始。
`build-content` 会对对不上的课给出 ⚠ 提示。

## 存档

- 每打完一关、换装备、强化后自动保存到浏览器 IndexedDB，并保留最近 10 份快照（城镇 → 存档 可回滚）。
- 已请求浏览器“持久化存储”，降低被自动清理的风险；但清除浏览器数据仍会丢失，**请定期导出备份**。
- 存档带版本号，结构变更时在 `src/save/schema.ts` 的 `migrate()` 里升级旧档。
