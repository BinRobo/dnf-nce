import { CONTENT_BASE } from '../content/loader';
import type { AudioClip } from '../content/types';

/** 在画面上方弹出课文动画（DOM <video>），播完或点“跳过”后回调 */
export function playVideo(clip: AudioClip, title: string, onDone: () => void) {
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,.82);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10;gap:12px;font-family:"PingFang SC","Microsoft YaHei",sans-serif';
  const h = document.createElement('div');
  h.textContent = `📺 ${title}`;
  h.style.cssText = 'color:#ffe14a;font-size:clamp(18px,3vw,30px);font-weight:bold';
  const v = document.createElement('video');
  v.src = `${CONTENT_BASE}${clip.file}#t=${clip.start ?? 0}`;
  v.playsInline = true;
  v.style.cssText = 'width:min(86vw,120vh);max-height:72vh;border-radius:12px;background:#000;box-shadow:0 0 30px #000';
  const skip = document.createElement('button');
  skip.textContent = '跳过 ▶▶';
  skip.style.cssText = 'font-size:20px;padding:8px 28px;border-radius:10px;border:0;background:#3b62d9;color:#fff;cursor:pointer';
  wrap.append(h, v, skip);
  document.body.append(wrap);

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    v.pause();
    wrap.remove();
    onDone();
  };
  skip.onclick = finish;
  v.ontimeupdate = () => {
    if (clip.end !== undefined && v.currentTime >= clip.end) finish();
  };
  v.onended = finish;
  v.onerror = finish;
  v.onloadedmetadata = () => {
    v.currentTime = clip.start ?? 0;
    v.play().catch(() => {
      // 浏览器拒绝自动播放时显示控件让孩子自己点
      v.controls = true;
    });
  };
}
