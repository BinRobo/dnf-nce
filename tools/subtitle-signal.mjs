// 读取视频底部英文字幕条，计算“文字掩码”随时间的变化，用于切分字幕段
import { spawn } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

export const W = 720, H = 56, FPS = 10;
// 1440x1080 视频中英文字幕条的位置
export const CROP = 'crop=1300:100:70:940';
const TEXT = 80; // 灰度低于此值视为文字笔画

export function bandFrames(file) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, ['-v', 'error', '-i', file, '-vf', `fps=${FPS},${CROP},scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-']);
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.on('close', (code) => {
      if (code) return reject(new Error('ffmpeg failed'));
      const buf = Buffer.concat(chunks);
      const frames = [];
      for (let o = 0; o + W * H <= buf.length; o += W * H) {
        const mask = new Uint8Array(W * H);
        let dark = 0;
        for (let k = 0; k < W * H; k++) if (buf[o + k] < TEXT) (mask[k] = 1), dark++;
        frames.push({ mask, dark });
      }
      resolve(frames);
    });
  });
}

const xor = (a, b) => {
  let n = 0;
  for (let k = 0; k < a.length; k++) n += a[k] ^ b[k];
  return n;
};

/** dark: 深色像素千分比（幕布时接近 1000）；chg: 与 0.5 秒前相比变化的文字像素数 */
export function features(frames, lag = 5) {
  return frames.map((f, i) => ({
    t: i / FPS,
    dark: Math.round((f.dark / (W * H)) * 1000),
    chg: i >= lag ? xor(f.mask, frames[i - lag].mask) : 0,
  }));
}

if (process.argv[1].endsWith('subtitle-signal.mjs')) {
  const fr = await bandFrames(process.argv[2]);
  for (const x of features(fr)) console.log(x.t.toFixed(1), x.dark, x.chg);
}
