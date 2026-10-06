// 把原始课文视频压缩成网页用的小文件：640x480，H.264 + AAC，支持边下边播
// 用法：node tools/transcode.mjs [L001 ...]（已存在的会跳过）
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import ffmpeg from 'ffmpeg-static';

const SRC = 'NewConceptEnglish/mv';
const OUT = 'public/content/book1/media';
mkdirSync(OUT, { recursive: true });
const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(SRC).filter((f) => /^L\d{3}_batch\.mp4$/.test(f)).map((f) => f.slice(0, 4)).sort();
for (const id of ids) {
  const out = `${OUT}/${id}.mp4`;
  if (existsSync(out)) continue;
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', `${SRC}/${id}_batch.mp4`,
    '-vf', 'scale=640:480,fps=25', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30',
    '-c:a', 'aac', '-b:a', '80k', '-ac', '1', '-movflags', '+faststart', `${out}.part.mp4`]);
  execFileSync('mv', [`${out}.part.mp4`, out]);
  console.log(id, (statSync(out).size / 1e6).toFixed(1) + 'MB');
}
