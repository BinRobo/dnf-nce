// 核对课文与视频时间的对应：每句取开头一帧的字幕截图，竖向拼接；与课文逐句对照
// 用法：node tools/check-align.mjs L005-006
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import ffmpeg from 'ffmpeg-static';

const id = process.argv[2];
const l = JSON.parse(readFileSync(`public/content/book1/lessons/${id}.json`, 'utf8'));
const src = `NewConceptEnglish/mv/${id.slice(0, 4)}_batch.mp4`;
const tmp = `.cache/align-${id}`;
mkdirSync(tmp, { recursive: true });
const parts = l.dialogue.map((d, i) => {
  const p = `${tmp}/${String(i).padStart(2, '0')}.png`;
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(d.audio.start + 0.5), '-i', src, '-frames:v', '1', '-vf', 'crop=1440:120:0:930,scale=480:40', p]);
  console.log(i, d.en);
  return p;
});
const args = ['-v', 'error', '-y'];
parts.forEach((p) => args.push('-i', p));
args.push('-filter_complex', `vstack=inputs=${parts.length}`, `.cache/align-${id}.jpg`);
execFileSync(ffmpeg, args);
rmSync(tmp, { recursive: true });
