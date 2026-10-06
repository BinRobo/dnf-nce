// 按字幕切分课文视频：node tools/video-segments.mjs L001 [L003 ...]（不带参数 = 全部）
// 输出 .cache/video/<id>.json（每一遍播放的字幕段起止时间）和 .cache/video/<id>_sheet.jpg（字幕截图拼图，用于人工核对）
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import ffmpeg from 'ffmpeg-static';
import { bandFrames, features, FPS } from './subtitle-signal.mjs';

const SRC = 'NewConceptEnglish/mv';
const OUT = '.cache/video';
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
mkdirSync(OUT, { recursive: true });

const DARK = 400; // 千分比：字幕条大面积深色（幕布、片头、黑场）
const BREAK_FRAMES = 10; // 深色持续 1 秒以上才算两遍播放之间的间隔；更短的是转场黑场，忽略
const CHANGE = 1000; // 文字掩码相比 0.5 秒前变化的像素数，字幕切换时为 2000~8000，动画一般 < 600

function xor(a, b) {
  let n = 0;
  for (let k = 0; k < a.length; k++) n += a[k] ^ b[k];
  return n;
}

export function segment(feat, frames) {
  // 标记长时间深色区间（幕布/片头）
  const isBreak = new Array(feat.length).fill(false);
  const flashChange = new Set(); // 转场黑场前后字幕不同：黑场开始处即为字幕切换
  for (let i = 0; i < feat.length; ) {
    if (feat[i].dark < DARK) { i++; continue; }
    let j = i;
    while (j < feat.length && feat[j].dark >= DARK) j++;
    if (j - i >= BREAK_FRAMES) for (let k = i; k < j; k++) isBreak[k] = true;
    else if (frames && i >= 2 && j + 3 < frames.length && xor(frames[i - 2].mask, frames[j + 3].mask) >= CHANGE) flashChange.add(i);
    i = j;
  }
  const passes = [];
  let cur = null;
  let segStart = null;
  const close = (t) => {
    if (cur && segStart !== null && t - segStart > 0.6) cur.push({ start: +segStart.toFixed(1), end: +t.toFixed(1) });
    segStart = null;
  };
  for (let i = 1; i < feat.length; i++) {
    const f = feat[i];
    if (isBreak[i]) {
      close(f.t);
      if (cur?.length) passes.push(cur);
      cur = null;
      continue;
    }
    if (!cur) cur = [];
    const rising = f.chg >= CHANGE && feat[i - 1].chg < CHANGE;
    // 深色画面（幕布拉开、转场黑场）之后 0.6 秒内的变化不算字幕切换
    const nearDark = feat.slice(Math.max(0, i - 6), i + 1).some((x) => x.dark >= DARK);
    if ((rising && !nearDark) || flashChange.has(i)) {
      close(f.t);
      segStart = f.t;
    }
  }
  close(feat.at(-1).t);
  if (cur?.length) passes.push(cur);
  return passes;
}

function sheet(file, segs, out) {
  // 每段取中间一帧，裁出中英字幕区域，竖向拼接
  const tmp = `${OUT}/tmp-${process.pid}-${Date.now()}`;
  mkdirSync(tmp, { recursive: true });
  const parts = segs.map((s, i) => {
    const p = `${tmp}/${i}.png`;
    const a = s.start + 0.6;
    const b = Math.max(a, s.end - 0.3);
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(a), '-i', file, '-ss', String(b), '-i', file,
      '-filter_complex', `[0:v]trim=end_frame=1,crop=1440:230:0:820,scale=480:77[x];[1:v]trim=end_frame=1,crop=1440:230:0:820,scale=480:77[y];[x][y]hstack`, '-frames:v', '1', p]);
    return p;
  });
  const args = ['-v', 'error', '-y'];
  parts.forEach((p) => args.push('-i', p));
  args.push('-filter_complex', parts.length > 1 ? `vstack=inputs=${parts.length}` : 'null', out);
  execFileSync(ffmpeg, args);
  execFileSync('rm', ['-rf', tmp]);
}

export function denseGrid(file, from, to, out) {
  const n = Math.ceil((to - from) * 2);
  const rows = Math.ceil(n / 4);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(from), '-t', String(to - from), '-i', file,
    '-vf', `fps=2,crop=1440:230:0:820,scale=360:58,drawbox=x=0:y=0:w=360:h=58:color=black@0:t=1,tile=4x${rows}`, '-frames:v', '1', out]);
}

const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(SRC).filter((f) => /^L\d{3}_batch\.mp4$/.test(f)).map((f) => f.slice(0, 4)).sort();
for (const id of ids) {
  const file = `${SRC}/${id}_batch.mp4`;
  if (!existsSync(file)) continue;
  const frames = await bandFrames(file);
  const feat = features(frames);
  const passes = segment(feat, frames);
  const duration = feat.at(-1).t;
  writeFileSync(`${OUT}/${id}.json`, JSON.stringify({ id, duration, passes }, null, 1));
  if (passes[0]) sheet(file, passes[0], `${OUT}/${id}_sheet.jpg`);
  console.log(id, `dur=${duration.toFixed(1)}`, 'passes', passes.map((p) => p.length).join('/'));
}
