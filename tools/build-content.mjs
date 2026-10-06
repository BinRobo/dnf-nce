// 合并内容源文件 + 视频切分结果，生成游戏使用的课程数据
// 用法：node tools/build-content.mjs
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const SRC = 'content-src/book1';
const OUT = 'public/content/book1';
const VIDEO = '.cache/video';
const MEDIA = `${OUT}/media`;

// 第一册分 6 张地图，每张 12 个副本（24 课）
const REGIONS = JSON.parse(readFileSync(`${SRC}/regions.json`, 'utf8'));

mkdirSync(`${OUT}/lessons`, { recursive: true });
const pad = (n) => String(n).padStart(3, '0');
const problems = [];
const titles = {};
const built = [];

for (const f of readdirSync(SRC).filter((f) => /^L\d{3}-\d{3}\.json$/.test(f)).sort()) {
  const src = JSON.parse(readFileSync(`${SRC}/${f}`, 'utf8'));
  const odd = `L${pad(src.lessons[0])}`;
  const segFile = `${VIDEO}/${odd}.json`;
  const mediaFile = `media/${odd}.mp4`;
  let segs = null;
  if (existsSync(segFile)) {
    const v = JSON.parse(readFileSync(segFile, 'utf8'));
    const n = src.lines.length;
    if (src.video?.starts) {
      // 人工校对：starts[i] = 第 i 句从第几个自动切分段开始
      let raw = v.passes[src.video.pass ?? 0].map((x) => ({ ...x }));
      // 人工补切：自动切分漏掉的字幕切换点（秒）
      for (const t of src.video.splits ?? []) {
        const k = raw.findIndex((x) => x.start < t && t < x.end);
        if (k < 0) problems.push(`${src.id}: splits ${t} 不在任何段内`);
        else raw.splice(k, 1, { start: raw[k].start, end: t }, { start: t, end: raw[k].end });
      }
      const st = src.video.starts;
      if (st.length !== n || st.at(-1) >= raw.length) problems.push(`${src.id}: video.starts 与课文句数/视频段数不符`);
      else segs = st.map((k, i) => ({ start: raw[k].start, end: raw[(st[i + 1] ?? raw.length) - 1].end }));
    } else {
      // 自动：取段数与课文句数一致的那一遍（优先第一遍，带中文字幕）
      const pi = v.passes.findIndex((p) => p.length === n);
      if (pi >= 0) segs = v.passes[pi];
      else problems.push(`${src.id}: 课文 ${n} 句，视频各遍切出 ${v.passes.map((p) => p.length).join('/')} 段，需要人工校对（video.starts）`);
    }
  }
  const hasMedia = existsSync(`${OUT}/${mediaFile}`);
  const clip = (i) => (segs && hasMedia ? { file: mediaFile, start: segs[i].start, end: segs[i].end } : undefined);

  for (const d of src.drills) {
    const blanks = d.en.split('___').length - 1;
    if (blanks !== 1) problems.push(`${src.id}: 练习题需要恰好一个 ___：${d.en}`);
    if (new Set(d.options).size !== d.options.length) problems.push(`${src.id}: 练习选项重复：${d.en}`);
  }

  const lesson = {
    id: src.id,
    lessons: src.lessons,
    title: src.title,
    titleZh: src.titleZh,
    evenTitle: src.evenTitle,
    evenTitleZh: src.evenTitleZh,
    words: src.words.map((w) => {
      // Sonia 预生成的单词发音（tools/gen-tts.mjs）
      const slug = w.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const audio = existsSync(`${OUT}/words/${slug}.mp3`) ? { file: `words/${slug}.mp3` } : undefined;
      return { en: w.en, zh: w.zh, ipa: w.ipa, pos: w.pos, lesson: w.lesson, audio };
    }),
    dialogue: src.lines.map((l, i) => ({ speaker: l.speaker ?? '', en: l.en, zh: l.zh, audio: clip(i) })),
    drills: src.drills.map((d) => ({ en: d.en, zh: d.zh, answer: d.options[0], options: d.options })),
    video: segs && hasMedia ? { file: mediaFile, start: Math.max(0, segs[0].start - 0.5), end: segs.at(-1).end } : undefined,
  };
  writeFileSync(`${OUT}/lessons/${src.id}.json`, JSON.stringify(lesson, null, 1));
  built.push(src.id);
  titles[src.id] = { title: src.title, titleZh: src.titleZh, lessons: lesson.lessons };
}

// NPC 闲聊台词与配音清单
mkdirSync('public/content/npc', { recursive: true });
for (const f of ['barks.json', 'voices.json', 'town.json']) if (existsSync(`content-src/npc/${f}`)) writeFileSync(`public/content/npc/${f}`, readFileSync(`content-src/npc/${f}`));

// 剧本：content-src/story/*.json → public/content/story/
mkdirSync('public/content/story', { recursive: true });
for (const f of existsSync('content-src/story') ? readdirSync('content-src/story').filter((f) => f.endsWith('.json')) : []) {
  writeFileSync(`public/content/story/${f}`, readFileSync(`content-src/story/${f}`));
}

const manifest = {
  book: 1,
  // 每课标题：地图、家长报告等只需要标题的地方不必下载整课
  titles,
  title: '新概念英语 第一册',
  regions: REGIONS.map((r) => ({ ...r, dungeons: r.dungeons.filter((id) => built.includes(id)) })).filter((r) => r.dungeons.length),
};
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
console.log(`生成 ${built.length} 个副本，${manifest.regions.length} 张地图`);
if (!existsSync(MEDIA)) console.log('提示：尚未转码视频（node tools/transcode.mjs），课文将使用语音合成');
for (const p of problems) console.log('⚠', p);

// 全书 6 章的 Boss / 小怪 / 副本数据
if (existsSync('content-src/chapters.json')) writeFileSync('public/content/chapters.json', readFileSync('content-src/chapters.json'));

// 职业技能数据：content-src/skills/*.json → public/content/skills/
mkdirSync('public/content/skills', { recursive: true });
for (const f of existsSync('content-src/skills') ? readdirSync('content-src/skills').filter((f) => f.endsWith('.json')) : []) {
  writeFileSync(`public/content/skills/${f}`, readFileSync(`content-src/skills/${f}`));
}
