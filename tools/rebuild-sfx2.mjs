// 按 CREDITS.md 里记录的来源，重新转码全部音效，并逐个检查不是静音/空文件
// 用法：node tools/rebuild-sfx2.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';

const SRC = '.cache/audio-src';
const all = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ogg|wav)$/.test(f)) all.push(p); } };
walk(SRC);
const rows = readFileSync('public/assets/audio/CREDITS.md', 'utf8').split('\n')
  .map((l) => l.split('|').map((x) => x.trim()))
  .filter((c) => /^sfx\/.+\.mp3$/.test(c[1] ?? ''));
let ok = 0;
const bad = [];
for (const c of rows) {
  const out = `public/assets/audio/${c[1]}`;
  const names = c[3].replace(/\(.*\)/, '').split('+').map((x) => x.trim());
  const find = (n) => all.find((p) => p.replace(/\\/g, '/').split('/').pop().replace(/\.(ogg|wav)$/, '') === n);
  const srcs = names.map(find);
  if (srcs.some((x) => !x)) { bad.push(`${c[1]}: 找不到源文件 ${c[3]}`); continue; }
  const src = srcs[0];
  const awaken = out.includes('awaken');
  // 只去开头静音（阈值很低），不去结尾；统一响度；单声道 96k
  const af = `silenceremove=start_periods=1:start_threshold=-60dB,loudnorm=I=-16:TP=-1.5,atrim=0:${awaken ? 2 : 0.9},afade=t=out:st=${awaken ? 1.7 : 0.75}:d=0.15`;
  if (srcs.length > 1) {
    const ins = srcs.flatMap((x) => ['-i', x]);
    execFileSync(ffmpeg, ['-v', 'error', '-y', ...ins, '-filter_complex', `amix=inputs=${srcs.length}:normalize=0,${af}`, '-ac', '1', '-ar', '44100', '-b:a', '96k', out]);
  } else execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', src, '-af', af, '-ac', '1', '-ar', '44100', '-b:a', '96k', out]);
  // 检查：时长与峰值
  const info = execFileSync(ffmpeg, ['-hide_banner', '-i', out, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  void info;
  const r = (await import('node:child_process')).spawnSync(ffmpeg, ['-hide_banner', '-i', out, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const peak = Number(/max_volume: (-?[\d.]+)/.exec(r.stderr)?.[1] ?? -99);
  const dur = /time=(\d+):(\d+):([\d.]+)/.exec(r.stderr.split('time=').length > 1 ? r.stderr.slice(r.stderr.lastIndexOf('time=')) : '');
  const sec = dur ? Number(dur[3]) : 0;
  if (peak < -20 || sec < 0.05) bad.push(`${c[1]}: 峰值 ${peak}dB，时长 ${sec}s`);
  else ok++;
}
console.log(`重建 ${ok}/${rows.length}`);
for (const b of bad) console.log('⚠', b);
