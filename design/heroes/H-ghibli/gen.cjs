// 风格 H「田园小冒险家」生成器：node gen.cjs → sheet.svg + faces.svg
const fs = require('fs');
const OUT = __dirname + '/';
// ---------- color ----------
const h2r = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const r2h = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = h2r(a), B = h2r(b); return r2h(A.map((v, i) => v + (B[i] - v) * t)); };
const LC = c => mix(c, '#4e2a1e', .5);           // 线色：同色系暖深一档
const SH = '#9a5a46';                              // 阴影色（半透明叠加）
// ---------- defs ----------
const grads = new Map();
function G(c) {
  const id = 'g' + c.slice(1);
  if (!grads.has(id)) grads.set(id, `<linearGradient id="${id}" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="${mix(c, '#fffaf0', .2)}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${mix(c, '#d99a7a', .1)}"/></linearGradient>`);
  return `url(#${id})`;
}
const BASEDEFS = `
<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feOffset in="SourceAlpha" dx="-4" dy="-5" result="o"/><feGaussianBlur in="o" stdDeviation="1.6" result="b"/><feComposite in="SourceAlpha" in2="b" operator="out" result="c"/><feFlood flood-color="${SH}" flood-opacity=".2"/><feComposite in2="c" operator="in" result="s"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="s"/></feMerge></filter>
<filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="2" seed="4" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .6  0 0 0 0 .42  0 0 0 0 .3  0 0 0 -.45 .3" result="m"/><feComposite in="m" in2="SourceAlpha" operator="in" result="t"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="t"/></feMerge></filter>
<filter id="shL" x="-20%" y="-20%" width="140%" height="140%"><feOffset in="SourceAlpha" dx="-2.2" dy="-2" result="o"/><feGaussianBlur in="o" stdDeviation="1.2" result="b"/><feComposite in="SourceAlpha" in2="b" operator="out" result="c"/><feFlood flood-color="${SH}" flood-opacity=".16"/><feComposite in2="c" operator="in" result="s"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="s"/></feMerge></filter>
<filter id="soft"><feGaussianBlur stdDeviation="3"/></filter>
<radialGradient id="glow"><stop offset="0" stop-color="#fffbd8" stop-opacity="1"/><stop offset=".35" stop-color="#fbe9a0" stop-opacity=".75"/><stop offset="1" stop-color="#f6dc8a" stop-opacity="0"/></radialGradient>
<radialGradient id="glowT"><stop offset="0" stop-color="#f4fffb" stop-opacity="1"/><stop offset=".4" stop-color="#bfeee2" stop-opacity=".7"/><stop offset="1" stop-color="#a8e6dc" stop-opacity="0"/></radialGradient>
<radialGradient id="blush"><stop offset="0" stop-color="#f08a78" stop-opacity=".5"/><stop offset="1" stop-color="#f08a78" stop-opacity="0"/></radialGradient>
<radialGradient id="blushD"><stop offset="0" stop-color="#d9604e" stop-opacity=".45"/><stop offset="1" stop-color="#d9604e" stop-opacity="0"/></radialGradient>`;
// ---------- primitives ----------
// S: 平涂+极轻渐变+半透明内阴影，细暖色线；gap=[起点%,长度%] 在高光处断线；hv=[起点%,长度%] 局部加粗
function S(d, c, o = {}) {
  const lc = o.lc || LC(c), w = o.w ?? 1.8;
  let s = `<path d="${d}" fill="${o.flat ? c : G(c)}"${o.noshade ? '' : ' filter="url(#sh)"'}${o.op ? ` opacity="${o.op}"` : ''}/>`;
  if (w > 0) {
    s += `<path d="${d}" fill="none" stroke="${lc}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" pathLength="100"${o.gap ? ` stroke-dasharray="${o.gap[0]} ${o.gap[1]} ${100 - o.gap[0] - o.gap[1]} 0"` : ''}/>`;
    if (o.hv) s += `<path d="${d}" fill="none" stroke="${lc}" stroke-width="${w + .9}" stroke-linecap="round" pathLength="100" stroke-dasharray="0 ${o.hv[0]} ${o.hv[1]} ${100 - o.hv[0] - o.hv[1]}"/>`;
  }
  return s;
}
const ed = (cx, cy, rx, ry) => `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
function E(cx, cy, rx, ry, c, o = {}) {
  const s = S(ed(cx, cy, rx, ry), c, { gap: [62, 8], ...o });
  return o.rot ? `<g transform="rotate(${o.rot} ${cx} ${cy})">${s}</g>` : s;
}
function L(d, c, w = 1.8, extra = '') { return `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`; }
// 手臂 / 腿：粗描边 + 内填
function limb(d, w, c, o = {}) {
  return `<path d="${d}" fill="none" stroke="${o.lc || LC(c)}" stroke-width="${w + 3.6}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" filter="url(#shL)"/>`;
}
const hand = (x, y, skin, r = 8) => E(x, y, r, r * .95, skin, { gap: [60, 10] });
const fly = (x, y, r = 1) => `<circle cx="${x}" cy="${y}" r="${9 * r}" fill="url(#glow)"/><circle cx="${x}" cy="${y}" r="${1.8 * r}" fill="#fffef0"/>`;
const flyT = (x, y, r = 1) => `<circle cx="${x}" cy="${y}" r="${9 * r}" fill="url(#glowT)"/><circle cx="${x}" cy="${y}" r="${1.8 * r}" fill="#ffffff"/>`;
const spark = (x, y, r, c = '#f6d77a') => `<path d="M${x} ${y - r} Q${x + r * .18} ${y - r * .18} ${x + r} ${y} Q${x + r * .18} ${y + r * .18} ${x} ${y + r} Q${x - r * .18} ${y + r * .18} ${x - r} ${y} Q${x - r * .18} ${y - r * .18} ${x} ${y - r}Z" fill="${c}"/>`;
const shadow = (rx = 46) => `<ellipse cx="2" cy="-1" rx="${rx}" ry="7" fill="#b89a70" opacity=".28"/>`;
const fl = (x, y, c, r = 1) => { let t = ''; for (let a = 0; a < 5; a++) { const an = a * 72 * Math.PI / 180; t += `<ellipse cx="${x + Math.cos(an) * 5 * r}" cy="${y + Math.sin(an) * 5 * r}" rx="${4.6 * r}" ry="${3.6 * r}" fill="${c}" stroke="${LC(c)}" stroke-width="1" transform="rotate(${a * 72} ${x + Math.cos(an) * 5 * r} ${y + Math.sin(an) * 5 * r})"/>`; } return t + `<circle cx="${x}" cy="${y}" r="${3 * r}" fill="#f0cf70"/>`; };
// 麻花辫：交替倾斜的发瓣
function braid(x0, y0, x1, y1, n, r0, c) {
  let t = '';
  for (let i = 0; i < n; i++) { const k = i / (n - 1), x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k, r = r0 * (1 - k * .32);
    t += E(x + (i % 2 ? 1.5 : -1.5), y, r, r * .66, c, { w: 1.5, rot: i % 2 ? -26 : 26, gap: [58, 12] }); }
  return t;
}
// 刺绣点线
const stitch = (d, c = '#e9c46a', w = 2) => L(d, c, w, ` stroke-dasharray="0.1 5"`);
const zig = (x1, x2, y, c = '#e6be62', a = 3, step = 6) => { let p = `M${x1} ${y}`; for (let x = x1, k = 0; x < x2; x += step, k++) p += ` L${x + step / 2} ${y + (k % 2 ? a : -a)} L${x + step} ${y}`; return L(p, c, 1.4); };
function pennant(x, y, c, h = 34, len = 40) { const a = len < 0 ? -1 : 1; // 小旗：杆+飘动三角旗
  return L(`M${x} ${y} L${x} ${y - h}`, '#8a5a3e', 2.4) + S(`M${x} ${y - h} Q${x + len * .5} ${y - h - 4} ${x + len} ${y - h + 8} Q${x + len * .5} ${y - h + 12} ${x} ${y - h + 20}Z`, c, { w: 1.5 }) + `<circle cx="${x}" cy="${y - h - 2}" r="2.6" fill="#e6be62"/>`;
}

// ---------- face (head-local, 原点=头中心, 朝右前 3/4) ----------
function facePath(rx, ry, a, b, c, sx = 5) {
  return `M${-rx} 0 C${-rx} ${-ry * .62} ${-rx * .55} ${-ry} 0 ${-ry} C${rx * .55} ${-ry} ${rx} ${-ry * .62} ${rx} 0 C${rx} ${ry * a} ${rx * b} ${ry * c} ${sx} ${ry * c} C${-rx * b + sx * .4} ${ry * c} ${-rx} ${ry * a} ${-rx} 0Z`;
}
const EYEL = '#5a3428';
function eye(x, y, far, F) {
  const t = F.eye, k = far ? .86 : 1;
  if (F.expr === 'happy') return L(`M${x - 8 * k} ${y + 3} Q${x} ${y - 8} ${x + 8 * k} ${y + 3}`, EYEL, 2.8);
  const sz = { round: [7.4, 9], tall: [6.4, 10.4], almond: [7.8, 8.2], sleepy: [6.8, 8], droopy: [7.4, 9.2], big: [8.4, 10.2], sweet: [8.4, 10.6] }[t];
  const rx = sz[0] * k, ry = sz[1];
  const pc = mix(F.ec, '#2a1810', .62);
  let s = `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${F.ec}"/>`;
  s += `<ellipse cx="${x + .6}" cy="${y + .6}" rx="${rx * .58}" ry="${ry * .62}" fill="${pc}"/>`;
  s += `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="none" stroke="${mix(F.ec, '#3a2018', .55)}" stroke-width="1.2"/>`;
  s += `<path d="M${x - rx * .7} ${y + ry * .55} Q${x} ${y + ry * 1.05} ${x + rx * .7} ${y + ry * .55}" fill="none" stroke="${mix(F.ec, '#ffffff', .45)}" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`;
  if (t === 'sleepy') s += `<path d="M${x - rx - 2} ${y - ry - 3} L${x + rx + 2} ${y - ry - 3} L${x + rx + 2} ${y - ry * .3} Q${x} ${y - ry * .45} ${x - rx - 2} ${y - ry * .3}Z" fill="${F.skin}"/>`;
  s += `<circle cx="${x - rx * .3}" cy="${y - ry * .38}" r="${t === 'big' || t === 'sweet' ? 2.7 : 2.3}" fill="#fffdf6"/>`;
  if (t === 'sweet') s += `<circle cx="${x + rx * .36}" cy="${y + ry * .3}" r="1.3" fill="#fffdf6"/><circle cx="${x + rx * .3}" cy="${y - ry * .55}" r=".9" fill="#fffdf6"/>`;
  // 上眼睑
  const ly = t === 'sleepy' ? y - ry * .36 : y - ry - .6;
  let lid;
  if (t === 'droopy') lid = `M${x - rx - 1} ${y - ry * .45} Q${x - rx * .3} ${ly - 1.5} ${x + rx * .5} ${ly + .6} Q${x + rx + 2} ${y - ry * .3} ${x + rx + 2.5} ${y + 1}`;
  else if (t === 'sweet') lid = `M${x - rx - 1} ${y - ry * .3} Q${x - rx * .3} ${ly - 2} ${x + rx * .4} ${ly - .4} Q${x + rx + .6} ${y - ry * .8} ${x + rx + 1.6} ${y - ry * .32}`;
  else if (t === 'almond') lid = `M${x - rx - 1} ${y - ry * .2} Q${x - rx * .2} ${ly - 1.8} ${x + rx + 1} ${y - ry * .55} L${x + rx + 4.5} ${y - ry * .85}`;
  else if (t === 'sleepy') lid = `M${x - rx - 1.5} ${ly + 1} Q${x} ${ly - 1.4} ${x + rx + 1.5} ${ly + 1}`;
  else lid = `M${x - rx - .8} ${y - ry * .3} Q${x - rx * .4} ${ly - 1.4} ${x + rx * .3} ${ly} Q${x + rx} ${y - ry * .7} ${x + rx + .8} ${y - ry * .25}`;
  s += L(lid, EYEL, 2.3);
  if (t === 'sweet') s += L(`M${x + rx + 1.2} ${y - ry * .4} q3 0 4.6 -2.6 M${x + rx * .78} ${y - ry * .8} q2.4 -.4 3.4 -3.4`, EYEL, 1.7);
  else if (F.lash) s += L(`M${x + rx * .6} ${y - ry * .82} l${3 * (far ? .8 : 1)} -3.2 M${x + rx * .95} ${y - ry * .5} l3.6 -1.8`, EYEL, 1.4);
  if (t === 'droopy') s += L(`M${x + rx * .3} ${y + ry + 1.4} l1.6 2 M${x + rx * .8} ${y + ry * .7} l2.4 1.6`, EYEL, 1.1);
  return s;
}
function brow(x, y, far, F) {
  const c = F.bc, k = far ? .86 : 1, t = F.brow;
  if (F.expr === 'sad') return L(far ? `M${x - 7 * k} ${y + 2} Q${x} ${y} ${x + 7 * k} ${y - 4}` : `M${x - 7} ${y - 4} Q${x} ${y} ${x + 7} ${y + 2}`, c, t === 'thick' ? 3.6 : 2.2);
  if (F.expr === 'surprised') y -= 5;
  if (t === 'thick') return L(`M${x - 8 * k} ${y + 1} Q${x} ${y - 3} ${x + 8 * k} ${y - 1.5}`, c, 4.2);
  if (t === 'arch') return L(`M${x - 7 * k} ${y + 1.5} Q${x - 1} ${y - 4} ${x + 8 * k} ${y}`, c, 2);
  if (t === 'mild') return L(`M${x - 7 * k} ${y + .5} Q${x} ${y - (far ? 2 : 4.5)} ${x + 7 * k} ${y - (far ? .5 : 1.5)}`, c, 2.8);
  if (t === 'bean') return `<ellipse cx="${x}" cy="${y - 1}" rx="${4.4 * k}" ry="2.4" fill="${c}" transform="rotate(${far ? 8 : -8} ${x} ${y})"/>`;
  if (t === 'kind') return L(far ? `M${x - 7 * k} ${y + 1} Q${x - 1} ${y - 3.6} ${x + 7 * k} ${y - 3}` : `M${x - 7} ${y - 3} Q${x + 1} ${y - 3.6} ${x + 7} ${y + 1}`, c, 2.2);
  return L(`M${x - 8 * k} ${y + 1} Q${x} ${y - 4} ${x + 9 * k} ${y + .5}`, c, 1.7); // soft
}
function mouth(F) {
  const x = 9 + (F.mx || 0), y = 30 + (F.my || 0), lc = mix(F.skin, '#5a2a20', .6), red = '#c9604c';
  if (F.expr === 'surprised') return `<ellipse cx="${x}" cy="${y + 3}" rx="4.6" ry="6" fill="${red}" stroke="${lc}" stroke-width="1.5"/><ellipse cx="${x}" cy="${y + 6}" rx="2.6" ry="1.6" fill="#f09a8a"/>`;
  if (F.expr === 'sad') return L(`M${x - 6} ${y + 3} Q${x} ${y - 2.5} ${x + 6} ${y + 3}`, lc, 2);
  switch (F.expr === 'happy' ? 'laugh' : F.mouth) {
    case 'grin': return `<path d="M${x - 9} ${y - 2} Q${x} ${y + 1} ${x + 9} ${y - 3} Q${x + 7} ${y + 9} ${x} ${y + 9.5} Q${x - 7} ${y + 9} ${x - 9} ${y - 2}Z" fill="${red}" stroke="${lc}" stroke-width="1.6" stroke-linejoin="round"/><path d="M${x - 7.5} ${y - 1} Q${x} ${y + 1.6} ${x + 7.5} ${y - 2} L${x + 7} ${y + 1.4} Q${x} ${y + 3.6} ${x - 7} ${y + 2}Z" fill="#fffaf0"/><ellipse cx="${x + .5}" cy="${y + 6.6}" rx="4.4" ry="2.4" fill="#f09a8a"/>`;
    case 'fang': return `<path d="M${x - 8} ${y - 1} Q${x} ${y + 2} ${x + 8} ${y - 2} Q${x + 5} ${y + 7} ${x} ${y + 7} Q${x - 5} ${y + 7} ${x - 8} ${y - 1}Z" fill="${red}" stroke="${lc}" stroke-width="1.6" stroke-linejoin="round"/><path d="M${x - 5.6} ${y} L${x - 1.6} ${y + .9} L${x - 3.8} ${y + 5}Z" fill="#fffaf0"/><ellipse cx="${x + 1.5}" cy="${y + 4.8}" rx="3.2" ry="1.6" fill="#f09a8a"/>`;
    case 'open': return `<path d="M${x - 5.5} ${y - 1} Q${x} ${y + 1.5} ${x + 5.5} ${y - 1.5} Q${x + 4} ${y + 6.5} ${x} ${y + 6.5} Q${x - 4} ${y + 6.5} ${x - 5.5} ${y - 1}Z" fill="${red}" stroke="${lc}" stroke-width="1.5" stroke-linejoin="round"/><ellipse cx="${x + .3}" cy="${y + 4.2}" rx="2.8" ry="1.5" fill="#f09a8a"/>`;
    case 'laugh': return `<path d="M${x - 10} ${y - 3} Q${x} ${y} ${x + 10} ${y - 4} Q${x + 8} ${y + 11} ${x} ${y + 11.5} Q${x - 8} ${y + 11} ${x - 10} ${y - 3}Z" fill="${red}" stroke="${lc}" stroke-width="1.6" stroke-linejoin="round"/><path d="M${x - 6} ${y + 9.6} Q${x} ${y + 3} ${x + 6} ${y + 9.4} Q${x} ${y + 12} ${x - 6} ${y + 9.6}Z" fill="#f09a8a"/>`;
    case 'smile': return L(`M${x - 7} ${y - 1} Q${x} ${y + 5.5} ${x + 7} ${y - 1.6}`, lc, 2);
    case 'sweet': return `<path d="M${x - 6} ${y - 1.6} Q${x} ${y + .4} ${x + 6} ${y - 2.2} Q${x + 4.6} ${y + 6.6} ${x} ${y + 6.8} Q${x - 4.6} ${y + 6.6} ${x - 6} ${y - 1.6}Z" fill="#dc7466" stroke="${lc}" stroke-width="1.4" stroke-linejoin="round"/><ellipse cx="${x + .4}" cy="${y + 4.4}" rx="3" ry="1.7" fill="#f6aaa0"/>` + L(`M${x - 6.4} ${y - 1.4} q-1.4 -.6 -2 -1.8 M${x + 6.4} ${y - 2} q1.4 -.8 1.8 -2`, lc, 1.3) + `<circle cx="${x - 11}" cy="${y + 1.5}" r="1.3" fill="${lc}" opacity=".55"/><circle cx="${x + 11.5}" cy="${y + 1}" r="1.3" fill="${lc}" opacity=".55"/>`;
    case 'dimple': return L(`M${x - 7} ${y - 1} Q${x} ${y + 5} ${x + 7} ${y - 1.5}`, lc, 2) + L(`M${x - 10.5} ${y - 3} q-1.2 2.6 .6 4.2 M${x + 10.5} ${y - 3.6} q1.4 2.6 -.4 4.2`, lc, 1.5);
  }
}
function face(F) {
  const ex1 = -14, ex2 = 26, ey = 6 + (F.ey || 0);
  let s = '';
  // 耳朵
  s += E(-F.rx + 1, 8, 7, 9.5, F.skin, { w: 1.6 }) + L(`M${-F.rx - 1} 5 q-2 4 1 7`, LC(F.skin), 1.3);
  s += E(F.rx - 2, 9, 5, 9, F.skin, { w: 1.6 });
  s += S(facePath(F.rx, F.ry, ...F.jaw), F.skin, { w: 1.9, gap: [64, 9], hv: [8, 30], lc: LC(F.skin) });
  // 腮红
  const bl = F.dark ? 'blushD' : 'blush';
  s += `<ellipse cx="${ex1 - 7}" cy="${ey + 17}" rx="10" ry="6" fill="url(#${bl})"/><ellipse cx="${ex2 + 7}" cy="${ey + 17}" rx="11" ry="6.5" fill="url(#${bl})"/>`;
  if (F.mark === 'freckle') for (const [fx, fy] of [[-26, 18], [-21, 21], [-17, 17], [-23, 25], [33, 18], [38, 21], [42, 17], [36, 25], [44, 23]]) s += `<circle cx="${fx}" cy="${fy + F.ey}" r="1.5" fill="#c97a52" opacity=".85"/>`;
  s += eye(ex1, ey, true, F) + eye(ex2, ey, false, F);
  s += brow(ex1, ey - 15 + (F.by || 0), true, F) + brow(ex2, ey - 15 + (F.by || 0), false, F);
  // 鼻子
  s += L(`M12 ${ey + 11} q2.4 1.8 .2 3.6`, LC(F.skin), 1.5);
  s += mouth(F);
  if (F.expr === 'sad') s += `<path d="M${ex2 + 12} ${ey + 8} Q${ex2 + 8} ${ey + 16} ${ex2 + 12} ${ey + 19} Q${ex2 + 16} ${ey + 16} ${ex2 + 12} ${ey + 8}Z" fill="#bfe4f4" stroke="#7ab0cc" stroke-width="1.2"/>`;
  if (F.mark === 'glasses') {
    const gc = '#b07a3e';
    s += `<circle cx="${ex1}" cy="${ey}" r="11" fill="#fffaf0" fill-opacity=".18" stroke="${gc}" stroke-width="2.2"/><circle cx="${ex2}" cy="${ey}" r="12" fill="#fffaf0" fill-opacity=".18" stroke="${gc}" stroke-width="2.2"/>` + L(`M${ex1 + 11} ${ey - 1} Q6 ${ey - 5} ${ex2 - 12} ${ey - 1}`, gc, 2) + L(`M${ex1 - 11} ${ey - 2} L${-F.rx + 2} ${ey - 4}`, gc, 2) + L(`M${ex2 - 6} ${ey - 7} l4 -2`, '#ffffff', 1.6, ' opacity=".8"');
  }
  return s;
}

// ---------- characters ----------
// 每个角色：feet at y=0, 原点中心；头中心 (0,-188)
const HEAD = (inner) => `<g transform="translate(0 -188)">${inner}</g>`;
const neck = skin => S('M-8 -146 L8 -146 L9 -128 L-9 -128Z', skin, { w: 1.6 });

const CH = {};
// ===== 剑士·男 =====
CH.swm = { name: '剑士·男', cls: 'sw', top: -300, F: { skin: '#e9b388', rx: 57, ry: 50, jaw: [.62, .66, 1.0, 5], eye: 'round', ec: '#c7842c', brow: 'thick', bc: '#7a4428', mouth: 'grin', mark: 'ahoge', ey: 2 }, tag: '方脸·粗眉·琥珀眼·咧嘴笑·一缕呆毛' };
CH.swm.draw = function (hi) {
  const F = this.F, sk = F.skin, hair = '#9a5634', red = hi ? '#d2604a' : '#cf6a4e', vest = hi ? '#b0744a' : '#b47c4e', shirt = '#f4e6c6', pants = '#c8a676', boot = '#a8683e', cape = hi ? '#c2564a' : '#c85e4a';
  let s = shadow(50);
  // 披风
  if (hi) {
    s += S('M-24 -132 Q-54 -112 -66 -70 Q-74 -40 -84 -24 Q-68 -28 -60 -18 Q-50 -30 -38 -22 Q-28 -36 -14 -30 L22 -128Z', cape, { gap: [30, 6] });
    s += stitch('M-80 -27 Q-68 -30 -60 -21 Q-50 -32 -38 -25 Q-28 -38 -15 -33', '#f0cf70', 2.4);
    s += zig(-66, -24, -40, '#f0cf70', 2.5, 7);
  } else s += S('M-24 -132 Q-50 -112 -58 -78 Q-64 -60 -70 -50 Q-58 -52 -52 -46 Q-44 -54 -36 -48 Q-26 -58 -12 -56 L22 -128Z', cape, { gap: [30, 6] });
  // 后臂
  s += limb('M-27 -124 Q-42 -106 -44 -86', 13, shirt) + hand(-44, -80, sk);
  // 腿
  s += limb('M-13 -60 Q-14 -40 -15 -18', 16, pants) + limb('M13 -60 Q16 -40 18 -18', 16, pants);
  s += L('M-23 -36 L-7 -36 M10 -36 L26 -36', LC(pants), 1.4, ' opacity=".6"');
  // 靴
  s += S('M-31 -2 Q-33 -24 -24 -26 L-7 -26 Q-5 -12 -1 -8 Q2 0 -6 0 L-27 0 Q-31 0 -31 -2Z', boot, { gap: [40, 8] }) + S('M5 -2 Q5 -24 13 -26 L28 -26 Q30 -12 38 -9 Q43 -2 36 0 L9 0 Q5 0 5 -2Z', boot, { gap: [40, 8] });
  s += S('M-26 -27 L-6 -27 L-6 -21 L-26 -21Z', mix(boot, '#f4e6c6', .3), { w: 1.4, noshade: 1 }) + S('M12 -27 L29 -27 L29 -21 L12 -21Z', mix(boot, '#f4e6c6', .3), { w: 1.4, noshade: 1 });
  // 上衣
  s += S('M-30 -130 Q-36 -100 -38 -50 Q-20 -44 0 -45 Q20 -44 38 -50 Q36 -100 30 -130 Q0 -138 -30 -130Z', red, { gap: [70, 6] });
  if (hi) s += zig(-36, 36, -50, '#f0cf70', 2.4, 6);
  s += S('M-30 -130 Q-36 -100 -37 -66 L-11 -66 Q-9 -100 -7 -133Z', vest, { w: 1.7 }) + S('M30 -130 Q36 -100 37 -66 L14 -66 Q12 -100 9 -133Z', vest, { w: 1.7 });
  s += stitch('M-12 -128 Q-14 -100 -14 -70', mix(vest, '#ffffff', .4), 1.6) + stitch('M12 -128 Q15 -100 17 -70', mix(vest, '#ffffff', .4), 1.6);
  s += S('M-9 -135 L0 -119 L9 -135 Q0 -131 -9 -135Z', shirt, { w: 1.5 });
  s += S('M-38 -76 Q0 -68 38 -76 L38 -65 Q0 -57 -38 -65Z', '#8e5c3c', { w: 1.6 }) + S('M-6 -73 h13 v11 h-13z', '#e0b45a', { w: 1.5 });
  if (hi) { for (const [x, y] of [[-14, -116], [-14, -98], [17, -114], [17, -96]]) s += `<circle cx="${x}" cy="${y}" r="2.8" fill="#f0cf70" stroke="#b07a3e" stroke-width="1"/>`; s += S('M18 -138 Q38 -142 42 -124 Q32 -118 20 -122Z', '#b8784a', { w: 1.6 }) + `<circle cx="32" cy="-129" r="2.6" fill="#f0cf70"/>`; }
  // 大剑
  const bl = hi ? '#efe9dc' : '#e7e2d6';
  let sw = `<circle cx="0" cy="17" r="5.5" fill="#e0b45a" stroke="#a8763a" stroke-width="1.6"/>`;
  sw += S('M-4.5 -10 L4.5 -10 L4.5 13 L-4.5 13Z', '#a0663e', { w: 1.5 }) + L('M-4 -4 L4 -1 M-4 3 L4 6 M-4 9 L4 11', '#7a4a30', 1.2);
  sw += S('M-11 -16 L-11 -150 Q-11 -170 0 -186 Q11 -170 11 -150 L11 -16Z', bl, { lc: '#8a7a6a', gap: [56, 10], hv: [2, 40] });
  sw += L('M0 -24 L0 -150', hi ? '#e6be62' : '#c9c0ae', hi ? 3 : 2.2) + L('M-6 -30 L-6 -150', '#ffffff', 2, ' opacity=".7"');
  sw += S(hi ? 'M-24 -16 Q-28 -6 -18 -6 L18 -6 Q28 -6 24 -16 Q30 -22 22 -24 Q0 -18 -22 -24 Q-30 -22 -24 -16Z' : 'M-20 -15 Q-22 -7 -15 -6 L15 -6 Q22 -7 20 -15 Q0 -19 -20 -15Z', '#e0b45a', { lc: '#a8763a' });
  if (hi) sw += `<circle cx="0" cy="-12" r="4" fill="#e9826a" stroke="#a8503a" stroke-width="1.2"/>` + S('M-2 -20 Q-26 -26 -40 -16 Q-28 -14 -22 -8 Q-12 -16 -2 -14Z', '#f4e6c6', { w: 1.4 }) + spark(-4, -168, 6, '#fff6c8');
  s += `<g transform="translate(48 -92) rotate(30)">${sw}</g>`;
  // 前臂
  s += limb('M27 -124 Q42 -112 45 -98', 13, shirt) + hand(48, -92, sk, 9);
  if (hi) s += S('M-34 -134 Q-44 -116 -40 -102 Q-20 -96 0 -98 Q20 -96 40 -102 Q44 -116 34 -134 Q0 -144 -34 -134Z', '#f4e6c6', { lc: '#a8804a', gap: [70, 6] }) + zig(-38, 40, -103, '#d9a84e', 2.2, 6) + E(0, -124, 5, 5, '#f0cf70', { w: 1.2 }) + `<circle cx="0" cy="-124" r="2" fill="#e9826a"/>`;
  s += neck(sk);
  // 头
  let h = '';
  const band = hi ? '#d2604a' : '#c85e4a';
  // 头巾尾巴（后）
  h += S('M-58 -14 Q-80 -24 -98 -14 Q-86 -6 -80 -6 Q-70 -8 -58 -6Z', band, { w: 1.6 }) + S('M-58 -8 Q-76 4 -84 22 Q-74 22 -68 14 Q-62 4 -55 -2Z', band, { w: 1.6 });
  if (hi) h += S('M-62 -16 Q-80 -44 -74 -66 Q-66 -48 -58 -30Z', '#f4e6c6', { w: 1.4 }) + L('M-61 -20 Q-72 -40 -72 -62', '#c9a876', 1.2);
  h += face(F);
  // 刘海
  h += S('M-58 -6 Q-60 -34 -46 -44 L48 -46 Q62 -34 60 -10 Q56 -20 50 -18 Q48 -30 36 -24 Q32 -36 18 -28 Q8 -40 -4 -28 Q-16 -38 -26 -24 Q-38 -32 -44 -16 Q-52 -20 -58 -6Z', hair, { gap: [50, 6] });
  // 头巾
  h += S('M-62 -6 C-66 -50 -36 -80 2 -80 C42 -80 68 -50 62 -12 Q36 -44 2 -44 Q-32 -44 -62 -6Z', band, { gap: [36, 8], hv: [70, 25] });
  for (const [x, y] of [[-34, -56], [-10, -66], [16, -66], [38, -56], [-48, -36], [52, -36], [2, -52], [-22, -48], [28, -50]]) h += `<circle cx="${x}" cy="${y}" r="2.6" fill="#f8ead0" opacity=".9"/>`;
  h += E(-60, -10, 8, 7, band, { w: 1.5 });
  if (hi) h += zig(-52, 54, -46, '#f0cf70', 1.6, 6);
  // 呆毛
  h += S('M8 -42 Q0 -66 10 -84 Q18 -98 32 -94 Q36 -86 28 -84 Q30 -90 22 -88 Q14 -82 14 -66 Q14 -54 16 -42Z', hair, { w: 1.6 });
  return s + HEAD(h);
};
// ===== 剑士·女 =====
CH.swf = { name: '剑士·女', cls: 'sw', top: -286, F: { skin: '#f8d6ba', rx: 55, ry: 50, jaw: [.42, .36, 1.04, 6], eye: 'almond', ec: '#6a9a4c', brow: 'arch', bc: '#b9884a', mouth: 'open', mark: 'band', lash: 1, ey: 3 }, tag: '尖下巴·细弯眉·绿眼·发带蝴蝶结·单辫' };
CH.swf.draw = function (hi) {
  const F = this.F, sk = F.skin, hair = '#e8bb5e', dress = hi ? '#d96e56' : '#d97a5e', apron = '#faf0dc', sock = '#f6e8cc', shoe = '#b25a40';
  let s = shadow(44);
  if (hi) s += S('M-22 -134 Q-46 -104 -52 -60 Q-38 -66 -30 -58 Q-20 -70 -6 -64 L20 -132Z', '#f4e0b0', { lc: '#a8804a' }) + zig(-48, -8, -64, '#d96e56', 2, 6);
  // 挥手的后臂
  s += E(-25, -124, 10, 9, '#faf0dc') + limb('M-28 -124 Q-44 -136 -48 -154', 9, sk) + hand(-49, -160, sk, 8) + L('M-52 -167 l-2 -5 M-48 -168 l0 -6 M-44 -166 l2 -5', LC(sk), 1.4);
  // 腿
  s += limb('M-10 -50 Q-11 -30 -11 -14', 10, sock) + limb('M10 -50 Q12 -30 14 -14', 10, sock);
  s += S('M-22 -2 Q-22 -14 -13 -15 L-3 -15 Q0 -6 2 -3 Q2 0 -3 0 L-19 0 Q-22 0 -22 -2Z', shoe, { gap: [40, 8] }) + S('M6 -2 Q6 -14 14 -15 L23 -15 Q27 -7 30 -5 Q31 0 26 0 L9 0 Q6 0 6 -2Z', shoe, { gap: [40, 8] });
  s += L('M-18 -12 L-3 -12 M10 -12 L25 -12', '#f4e0c0', 1.6);
  // 灯笼裙
  s += S('M-22 -92 Q-48 -84 -48 -62 Q-48 -48 -38 -43 Q-18 -38 0 -38 Q18 -38 38 -43 Q48 -48 48 -62 Q48 -84 22 -92Z', dress, { gap: [72, 6], hv: [10, 30] });
  s += S('M-38 -46 Q-40 -38 -30 -36 Q-26 -32 -18 -35 Q-12 -31 -4 -34 Q2 -30 8 -34 Q16 -31 20 -35 Q28 -32 32 -36 Q42 -38 38 -46 Q0 -38 -38 -46Z', apron, { w: 1.4, noshade: 1 });
  s += L('M-30 -80 Q-34 -62 -30 -48 M-12 -86 Q-14 -64 -12 -44 M12 -86 Q14 -64 12 -44 M30 -80 Q34 -62 30 -48', LC(dress), 1.2, ' opacity=".45"');
  // 上身
  s += S('M-21 -130 Q-25 -110 -22 -88 Q0 -84 22 -88 Q25 -110 21 -130 Q0 -137 -21 -130Z', dress, { gap: [70, 6] });
  // 围裙
  s += S('M-12 -120 L12 -120 L15 -89 L-15 -89Z', apron, { w: 1.5 }) + S('M-21 -90 Q-27 -66 -22 -46 Q0 -41 23 -46 Q28 -66 21 -90 Q0 -86 -21 -90Z', apron, { w: 1.6 });
  s += L('M-12 -120 L-20 -132 M12 -120 L20 -132', LC(apron), 1.6);
  s += hi ? (() => { let t = ''; for (const x of [-12, 0, 12]) t += `<circle cx="${x}" cy="-58" r="3.4" fill="#f2a28e"/><circle cx="${x}" cy="-58" r="1.4" fill="#f0cf70"/>`; return t + zig(-20, 22, -48, '#e6be62', 2, 6) + zig(-10, 12, -112, '#e6be62', 2, 5); })() : `<path d="M-6 -58 h12 v8 h-12z" fill="none" stroke="${LC(apron)}" stroke-width="1.3"/>`;
  s += S('M-36 -90 Q0 -82 36 -90 L36 -84 Q0 -77 -36 -84Z', hi ? '#f0cf70' : '#c9614a', { w: 1.2 });
  // 泡泡袖(前)
  // 剑（向下斜持）
  let sw = `<circle cx="0" cy="13" r="4.5" fill="#e0b45a" stroke="#a8763a" stroke-width="1.4"/>`;
  sw += S('M-3.6 -8 L3.6 -8 L3.6 10 L-3.6 10Z', '#a0663e', { w: 1.4 });
  sw += S('M-7.5 -12 L-7.5 -98 Q-7.5 -112 0 -122 Q7.5 -112 7.5 -98 L7.5 -12Z', '#ece7dc', { lc: '#8a7a6a', gap: [56, 10] }) + L('M0 -18 L0 -100', hi ? '#e6be62' : '#cfc6b4', 1.8);
  sw += S('M-15 -11 Q-17 -5 -11 -5 L11 -5 Q17 -5 15 -11 Q0 -14 -15 -11Z', '#e0b45a', { lc: '#a8763a' });
  if (hi) sw += S('M2 -10 Q22 -4 30 10 Q20 10 14 4 Q16 16 8 22 Q6 8 2 -4Z', '#f2a28e', { w: 1.3 });
  s += `<g transform="translate(43 -88) rotate(142)">${sw}</g>`;
  s += E(25, -124, 10, 9, apron) + limb('M27 -120 Q36 -104 41 -92', 9, sk) + hand(43, -88, sk, 8);
  if (hi) s += S('M-22 -100 Q-46 -94 -52 -74 Q-36 -80 -30 -74 Q-20 -86 -4 -84Z', '#f6ead0', { w: 1.3 });
  s += neck(sk);
  // 头
  let h = '';
  h += S('M-58 6 C-66 -50 -36 -76 2 -76 C42 -76 66 -50 60 6 L54 24 L-54 24Z', hair, { w: 1.6, noshade: 1 });
  h += face(F);
  h += S('M-60 10 C-66 -46 -38 -76 2 -76 C44 -76 66 -46 60 6 Q58 -10 52 -16 Q46 -32 30 -34 Q34 -24 24 -18 Q14 -32 -2 -36 Q-10 -26 -22 -22 Q-32 -30 -42 -24 Q-52 -16 -60 10Z', hair, { gap: [38, 7], hv: [60, 30] });
  h += L('M-30 -58 Q-14 -66 4 -64 M14 -62 Q30 -58 40 -46', mix(hair, '#fff8e0', .6), 2, ' opacity=".8"');
  // 发带
  const rb = hi ? '#d96e56' : '#cf6a4e';
  h += S('M-60 -12 Q-30 -60 4 -60 Q38 -60 62 -22 L60 -12 Q38 -50 4 -50 Q-30 -50 -58 -2Z', rb, { w: 1.6 });
  h += S('M-40 -52 Q-62 -74 -66 -54 Q-62 -40 -42 -46Z', rb, { w: 1.6 }) + S('M-36 -52 Q-26 -78 -10 -66 Q-14 -50 -34 -46Z', rb, { w: 1.6 }) + E(-38, -49, 5.5, 5, rb, { w: 1.5 });
  if (hi) h += S('M-40 -46 Q-60 -26 -70 -6 Q-62 -8 -58 -4 Q-50 -24 -36 -44Z', rb, { w: 1.4 }) + spark(-14, -70, 5, '#fff2b8') + `<circle cx="-38" cy="-49" r="2.4" fill="#f0cf70"/>`;
  // 辫子（越过前肩）
  let br = '';
  br += braid(53, 16, 59, 86, 7, 12.5, hair);
  br += E(59, 97, 5.5, 4, rb, { w: 1.4 }) + S('M54 100 Q59 118 64 100 Q66 112 70 108 Q66 98 60 99Z', hair, { w: 1.4 });
  if (hi) h += fl(-14, -58, '#fbf2de', .8) + fl(6, -60, '#f2a28e', .75) + fl(26, -56, '#fbf2de', .8) + fl(44, -44, '#c8e8dc', .7);
  return s + HEAD(h + br);
};
// ===== 神枪手·男 =====
CH.gnm = { name: '神枪手·男', cls: 'gn', top: -300, F: { skin: '#f3cba6', rx: 54, ry: 53, jaw: [.55, .5, 1.03, 6], eye: 'tall', ec: '#2f8f86', brow: 'mild', bc: '#6a4636', mouth: 'fang', mark: 'fang', ey: 4 }, tag: '长圆脸·浅蜜肤·青绿眼·小虎牙·飞行帽' };
CH.gnm.draw = function (hi) {
  const F = this.F, sk = F.skin, hair = '#8a5c42', jacket = hi ? '#78acd2' : '#82b2d4', shorts = '#9c6c46', shirt = '#f6ead2', scarf = hi ? '#e9a948' : '#e8b44e', boot = '#9a6038', pack = '#b98c5a', cap = '#c08a5a';
  let s = shadow(50);
  // 大背包 + 铺盖卷
  if (hi) s += pennant(-70, -96, '#e86a50', 124, -40);
  s += S('M-54 -140 Q-60 -100 -54 -60 Q-36 -54 -18 -60 L-14 -140 Q-34 -148 -54 -140Z', pack, { gap: [40, 8], hv: [5, 30] });
  s += S('M-60 -100 Q-62 -80 -56 -70 L-48 -70 L-50 -100Z', mix(pack, '#7a5a3a', .25), { w: 1.4 });
  s += `<g transform="rotate(-8 -32 -146)">${S('M-56 -154 L-8 -154 Q-2 -146 -8 -138 L-56 -138 Q-62 -146 -56 -154Z', '#d9c49a', { w: 1.6 })}${E(-56, -146, 4, 8, '#e9d8b0', { w: 1.4 })}${L('M-40 -154 L-40 -138 M-22 -154 L-22 -138', '#9c6c46', 2.4)}</g>`;
  s += S('M-64 -86 Q-66 -72 -58 -70 Q-50 -72 -52 -86Z', '#9fb4bc', { w: 1.5 }) + L('M-64 -82 q-5 2 -1 7', '#8a9aa0', 1.6);
  // 围巾尾巴
  s += S(hi ? 'M-8 -134 Q-44 -136 -76 -122 Q-90 -116 -96 -104 Q-80 -108 -70 -102 Q-48 -116 -10 -122Z' : 'M-8 -134 Q-38 -134 -64 -122 Q-72 -118 -78 -108 Q-66 -110 -58 -104 Q-40 -116 -10 -122Z', scarf, { w: 1.6 });
  if (hi) s += L('M-30 -131 L-34 -118 M-50 -128 L-52 -114 M-70 -122 L-72 -110', '#f8eecc', 2.4);
  // 后臂 拉背带
  s += limb('M-27 -124 Q-38 -106 -32 -92', 13, jacket) + hand(-30, -88, sk);
  // 腿
  s += limb('M-13 -56 Q-14 -36 -15 -16', 13, sk) + limb('M13 -56 Q15 -36 17 -16', 13, sk);
  s += limb('M-14.6 -40 L-15 -16', 14.5, '#f4ead4') + limb('M16 -40 L17 -16', 14.5, '#f4ead4') + L('M-21 -36 L-8 -36 M10 -36 L23 -36', '#c9a876', 1.6);
  s += S('M-32 -2 Q-34 -22 -24 -24 L-6 -24 Q-4 -12 0 -8 Q3 0 -5 0 L-28 0 Q-32 0 -32 -2Z', boot, { gap: [40, 8] }) + S('M6 -2 Q6 -22 14 -24 L28 -24 Q30 -12 39 -9 Q44 -2 37 0 L10 0 Q6 0 6 -2Z', boot, { gap: [40, 8] });
  s += L('M-30 -12 L-2 -12 M8 -12 L38 -12', mix(boot, '#f4e6c6', .35), 1.6);
  // 背带短裤
  s += S('M-30 -82 Q-34 -64 -31 -50 L-3 -50 L0 -60 L3 -50 L31 -50 Q34 -64 30 -82Z', shorts, { gap: [70, 6] });
  // 衬衫 + 短夹克
  s += S('M-26 -132 Q-30 -106 -29 -80 L29 -80 Q30 -106 26 -132 Q0 -138 -26 -132Z', shirt, { w: 1.6 });
  s += L('M-14 -130 L-12 -80 M14 -130 L13 -80', '#9c6c46', 3.6);
  s += S('M-30 -132 Q-38 -104 -36 -84 Q-24 -80 -14 -82 L-10 -134Z', jacket, { gap: [30, 8] }) + S('M30 -132 Q38 -104 36 -84 Q26 -80 16 -82 L12 -134Z', jacket, { gap: [30, 8] });
  s += S('M-36 -88 L-14 -86 L-14 -80 L-36 -82Z', mix(jacket, '#4a6a8a', .15), { w: 1.4 }) + S('M16 -86 L36 -88 L36 -82 L16 -80Z', mix(jacket, '#4a6a8a', .15), { w: 1.4 });
  if (hi) { for (const [x, y] of [[-17, -122], [-17, -106], [20, -122], [20, -106]]) s += `<circle cx="${x}" cy="${y}" r="2.8" fill="#f0cf70" stroke="#b07a3e" stroke-width="1"/>`; s += spark(-26, -110, 6, '#f0cf70') + zig(-35, -14, -92, '#f0cf70', 1.8, 5) + zig(16, 36, -92, '#f0cf70', 1.8, 5); }
  // 围巾
  s += S('M-20 -138 Q0 -128 22 -138 Q26 -128 20 -120 Q0 -114 -20 -120 Q-26 -128 -20 -138Z', scarf, { w: 1.6 }) + E(-14, -122, 6, 5, scarf, { w: 1.4 });
  // 信号枪（举起）
  let g = '';
  g += S('M-7 -4 Q-15 14 -10 28 Q0 34 9 28 Q8 10 7 -4Z', '#a8683e', { w: 1.6 }) + L('M6 6 Q20 10 18 0', '#9a6a30', 2.2);
  g += S('M-14 -16 L20 -16 Q24 -16 24 -10 L24 0 L-10 2 Q-16 2 -16 -6Z', '#d9a84e', { lc: '#9a6a30' });
  g += S('M18 -20 L58 -22 Q64 -22 64 -16 L64 2 Q64 6 58 6 L18 4Z', hi ? '#e6b85a' : '#d9a84e', { lc: '#9a6a30', gap: [10, 10] });
  g += L('M30 -21 L30 5 M44 -22 L44 5', '#a8763a', 2) + L('M22 -15 L58 -16', '#fff4d0', 2.4, ' opacity=".8"');
  g += S('M60 -22 Q70 -30 76 -30 L76 14 Q70 14 60 6Z', '#e0b45a', { lc: '#9a6a30' }) + `<ellipse cx="76" cy="-8" rx="4" ry="22" fill="#e9c46a" stroke="#9a6a30" stroke-width="1.6"/><ellipse cx="77" cy="-8" rx="2.2" ry="14" fill="#8a6a4a" opacity=".6"/>`;
  g += L('M-2 2 Q4 14 12 4', '#9a6a30', 2);
  if (hi) g += L('M-8 -10 Q4 -2 16 -10', '#f6e3a0', 1.6) + `<circle cx="4" cy="-10" r="2.6" fill="#e86a50"/>`;
  s += `<g transform="translate(52 -152) rotate(-40) scale(1.3)">${g}</g>`;
  // 枪口的烟花光点
  const sp = hi ? [[128, -250, 9, '#f9e6a0'], [148, -228, 6, '#f6b8a8'], [112, -270, 5, '#bfe4f0'], [142, -266, 4, '#fff6c8']] : [[124, -248, 7, '#fbecb4'], [140, -232, 4, '#f8d8b8']];
  s += `<circle cx="114" cy="-236" r="14" fill="#fffaf0" opacity=".6"/>`;
  for (const [x, y, r, c] of sp) s += spark(x, y, r, c);
  // 举起的前臂
  s += limb('M27 -124 Q40 -134 48 -146', 13, jacket) + hand(53, -151, sk, 9);
  if (hi) { for (const sx of [-1, 1]) s += E(sx * 30, -128, 11, 6, '#f0cf70', { lc: '#a8763a', w: 1.4 }) + L(`M${sx * 22} -123 l0 6 M${sx * 27} -122 l0 7 M${sx * 32} -122 l0 7 M${sx * 37} -123 l0 6`, '#e6be62', 1.6); }
  s += neck(sk);
  let h = face(F);
  h += S('M-50 -26 Q-44 -6 -34 -20 Q-26 -4 -14 -22 Q-2 -6 10 -22 Q22 -6 30 -22 Q42 -6 50 -24 L52 -40 L-50 -40Z', hair, { w: 1.6 });
  // 护耳
  h += S('M-64 -22 Q-72 10 -62 32 Q-52 38 -48 24 L-52 -18Z', cap, { w: 1.6 }) + S('M58 -20 Q66 8 60 30 Q52 34 50 22 L48 -16Z', cap, { w: 1.6 });
  h += L('M-56 32 Q-58 46 -52 52', '#9c6c46', 2) + L('M56 30 Q58 44 54 50', '#9c6c46', 2);
  // 飞行帽
  h += S('M-64 -8 C-70 -54 -36 -84 2 -84 C42 -84 70 -54 62 -8 Q36 -38 2 -38 Q-34 -38 -64 -8Z', hi ? '#c48c58' : cap, { gap: [36, 8], hv: [70, 26] });
  h += L('M-60 -12 Q-30 -44 2 -42 Q36 -42 60 -14', '#f6ead0', 6) + L('M2 -84 L2 -44', LC(cap), 1.4, ' opacity=".6"');
  // 护目镜
  const gl = hi ? '#f0cf70' : '#d9a84e';
  h += L('M-62 -40 Q0 -76 62 -42', '#8a5a3a', 4);
  h += `<circle cx="-12" cy="-56" r="12" fill="#b8e0ee" stroke="${gl}" stroke-width="4.4"/><circle cx="18" cy="-56" r="12" fill="#b8e0ee" stroke="${gl}" stroke-width="4.4"/>` + L('M0 -56 L6 -56', gl, 4) + L('M-17 -60 q3 -4 7 -4 M13 -60 q3 -4 7 -4', '#ffffff', 2.2);
  h += `<circle cx="-12" cy="-56" r="16.2" fill="none" stroke="${LC(gl)}" stroke-width="1.2"/><circle cx="18" cy="-56" r="16.2" fill="none" stroke="${LC(gl)}" stroke-width="1.2"/>`;
  if (hi) h += S('M40 -66 Q66 -96 84 -92 Q70 -80 48 -58Z', '#f4e6c6', { w: 1.4 }) + L('M44 -62 Q64 -84 80 -90', '#c9a876', 1.2);
  return s + HEAD(h);
};
// ===== 神枪手·女 =====
CH.gnf = { name: '神枪手·女', cls: 'gn', top: -274, F: { skin: '#fbdcc6', rx: 60, ry: 50, jaw: [.6, .6, 1.0, 5], eye: 'big', ec: '#4c88c8', brow: 'bean', bc: '#c06a34', mouth: 'laugh', mark: 'freckle', lash: 1, ey: 6 }, tag: '圆脸·豆豆眉·天蓝大眼·雀斑·大笑' };
CH.gnf.draw = function (hi) {
  const F = this.F, sk = F.skin, hair = '#e2843e', pin = hi ? '#7cb2d8' : '#86b9da', blouse = '#fbf2de', scarf = '#9fd3b4', shoe = '#9a6038';
  let s = shadow(44);
  if (hi) s += S('M-16 -112 Q-44 -132 -54 -110 Q-50 -96 -18 -102Z', '#f2a28e', { w: 1.5 }) + S('M-16 -106 Q-40 -86 -46 -66 Q-36 -70 -30 -64 Q-26 -84 -12 -100Z', '#f2a28e', { w: 1.5 });
  // 围巾尾
  s += S('M-10 -130 Q-34 -134 -56 -124 Q-62 -118 -66 -112 Q-54 -114 -48 -108 Q-32 -118 -12 -120Z', scarf, { w: 1.6 });
  // 斜挎小包
  s += S('M-44 -78 Q-46 -62 -38 -58 L-22 -58 Q-18 -66 -22 -80Z', '#b98c5a', { w: 1.6 }) + S('M-44 -78 L-22 -80 L-24 -70 Q-34 -66 -44 -70Z', '#a87a4a', { w: 1.4 });
  // 腿
  s += limb('M-10 -48 Q-11 -30 -12 -14', 11, sk) + limb('M10 -48 Q12 -30 14 -14', 11, sk);
  s += limb('M-11.4 -38 L-12 -14', 12.5, '#f6ecd6') + limb('M12.6 -38 L14 -14', 12.5, '#f6ecd6') + L('M-17 -32 L-6 -32 M8 -32 L19 -32 M-17 -26 L-6 -26 M8 -26 L19 -26', scarf, 2.2);
  s += S('M-24 -2 Q-24 -16 -14 -18 L-3 -18 Q0 -8 3 -5 Q4 0 -2 0 L-20 0 Q-24 0 -24 -2Z', shoe, { gap: [40, 8] }) + S('M6 -2 Q6 -16 14 -18 L24 -18 Q28 -8 33 -6 Q36 0 30 0 L9 0 Q6 0 6 -2Z', shoe, { gap: [40, 8] });
  // 灯笼短裤露边
  s += S('M-24 -56 Q-26 -44 -18 -44 Q-10 -42 -4 -48 L4 -48 Q10 -42 18 -44 Q26 -44 24 -56Z', blouse, { w: 1.4 });
  // A字背带裙
  s += S('M-20 -98 Q-40 -70 -42 -52 Q-20 -46 0 -47 Q20 -46 42 -52 Q40 -70 20 -98Z', pin, { gap: [72, 6], hv: [10, 30] });
  s += L('M-24 -84 Q-30 -66 -30 -52 M24 -84 Q30 -66 30 -52', LC(pin), 1.2, ' opacity=".45"');
  s += S('M14 -76 L30 -74 L28 -60 L16 -62Z', mix(pin, '#ffffff', .25), { w: 1.4 });
  if (hi) s += zig(-40, 42, -54, '#f0cf70', 2.4, 6) + `<circle cx="-12" cy="-64" r="3" fill="#f2a28e"/><circle cx="-4" cy="-60" r="2.4" fill="#f0cf70"/><circle cx="-18" cy="-58" r="2.4" fill="#fbf2de"/>`;
  // 上衣
  s += S('M-21 -132 Q-24 -112 -20 -96 L20 -96 Q24 -112 21 -132 Q0 -138 -21 -132Z', blouse, { gap: [70, 6] });
  s += S('M-14 -118 L14 -118 L19 -96 L-19 -96Z', pin, { w: 1.6 }) + L('M-12 -118 L-18 -134 M12 -118 L18 -134', pin, 3.4);
  s += `<circle cx="-12" cy="-116" r="2.4" fill="#e0b45a"/><circle cx="12" cy="-116" r="2.4" fill="#e0b45a"/>`;
  if (hi) s += S('M-2 -108 Q-14 -114 -20 -110 Q-12 -104 -2 -104Z M2 -108 Q14 -114 20 -110 Q12 -104 2 -104Z', '#f0cf70', { lc: '#a8763a', w: 1.2 }) + `<circle cx="0" cy="-106" r="3" fill="#e86a50"/>`;
  s += L('M-36 -118 Q-10 -96 18 -76', '#a87a4a', 3);
  // 泡泡枪（双手横握）
  let g = '';
  g += S('M-18 -92 Q-26 -82 -16 -78 L12 -84 L12 -96 Q-4 -98 -18 -92Z', '#b07448', { w: 1.6 });
  g += S('M20 -98 L72 -104 L72 -90 L20 -88Z', hi ? '#e6b85a' : '#d9a84e', { lc: '#9a6a30' });
  g += S('M72 -106 Q86 -116 88 -98 Q86 -80 72 -88Z', '#e0b45a', { lc: '#9a6a30' }) + `<ellipse cx="84" cy="-98" rx="3" ry="9" fill="#fbe8f0" opacity=".9"/>`;
  g += S('M28 -88 L38 -88 L36 -74 Q32 -70 28 -74Z', '#a8683e', { w: 1.5 });
  g += E(26, -110, 15, 14, '#d9a84e', { lc: '#9a6a30' }) + `<circle cx="26" cy="-110" r="9.5" fill="#cfeaf4"/><path d="M17 -108 Q26 -102 35 -108 L35 -104 Q26 -98 17 -104Z" fill="#f4b8c8" opacity=".85"/>` + L('M20 -115 q4 -4 8 -3', '#ffffff', 2);
  g += L('M48 -102 L48 -88 M62 -103 L62 -89', '#a8763a', 1.8);
  if (hi) g += `<circle cx="26" cy="-126" r="3.4" fill="#e86a50"/>` + zig(40, 70, -96, '#fff2c0', 1.6, 5);
  s += g;
  const bub = hi ? [[100, -122, 11], [120, -146, 8], [96, -160, 13], [132, -112, 6], [114, -182, 7], [140, -168, 5]] : [[100, -120, 10], [118, -144, 7], [98, -158, 12], [128, -112, 5]];
  for (const [x, y, r] of bub) s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${hi ? 'url(#bubH)' : '#eaf6fb'}" fill-opacity=".55" stroke="#8cc0d8" stroke-width="1.3"/>` + L(`M${x - r * .55} ${y - r * .25} Q${x - r * .45} ${y - r * .6} ${x - r * .1} ${y - r * .65}`, '#ffffff', 1.6);
  // 手臂
  s += E(-22, -124, 9, 8, blouse) + limb('M-22 -120 Q-14 -100 0 -94', 9, blouse) + hand(4, -92, sk, 8);
  s += E(22, -124, 9, 8, blouse) + limb('M24 -120 Q32 -104 34 -92', 9, blouse) + hand(34, -86, sk, 8);
  // 围巾
  s += S('M-20 -140 Q0 -130 22 -140 Q26 -130 20 -122 Q0 -116 -20 -122 Q-26 -130 -20 -140Z', scarf, { w: 1.6 }) + S('M-16 -124 Q-20 -112 -14 -104 Q-6 -112 -8 -124Z', scarf, { w: 1.4 });
  s += neck(sk).replace('M-8 -146', 'M-8 -146');
  let h = '';
  h += S('M-62 0 C-72 -54 -36 -80 2 -80 C44 -80 74 -54 64 0 Q68 26 60 42 Q52 34 46 38 L-46 38 Q-54 34 -62 42 Q-70 22 -62 0Z', hair, { w: 1.6, noshade: 1 });
  h += face(F);
  h += S('M-62 2 C-66 -48 -36 -78 2 -78 C42 -78 68 -48 64 2 Q62 -16 56 -20 Q52 -14 48 -24 Q38 -30 30 -22 Q22 -30 12 -24 Q2 -30 -6 -22 Q-16 -30 -24 -22 Q-34 -30 -42 -20 Q-50 -24 -54 -14 Q-60 -14 -62 2Z', hair, { gap: [38, 7], hv: [62, 30] });
  h += S('M-64 -2 Q-70 24 -62 40 Q-56 30 -52 34 Q-54 14 -56 -4Z', hair, { w: 1.6 }) + S('M62 -2 Q70 22 62 40 Q56 30 52 32 Q56 14 56 -4Z', hair, { w: 1.6 });
  h += L('M-34 -60 Q-16 -68 4 -66', mix(hair, '#fff4d8', .55), 2.2, ' opacity=".8"') + L('M-40 -44 Q-30 -60 -10 -66 M20 -64 Q40 -58 50 -36 M-58 8 Q-60 24 -58 34 M58 6 Q62 22 58 34', LC(hair), 1.2, ' opacity=".55"');
  h += S('M-58 16 Q-88 8 -92 32 Q-92 46 -80 42 Q-74 50 -66 40 Q-60 38 -58 32Z', hair, { w: 1.5 }) + S('M58 16 Q88 8 92 32 Q92 46 80 42 Q74 50 66 40 Q60 38 58 32Z', hair, { w: 1.5 }) + L('M-64 24 Q-78 22 -84 34 M64 24 Q78 22 84 34', LC(hair), 1.1, ' opacity=".55"') + E(-61, 25, 5, 6, '#9fd3b4', { w: 1.3 }) + E(61, 25, 5, 6, '#9fd3b4', { w: 1.3 });
  // 头顶护目镜
  const gl = hi ? '#f0cf70' : '#d9a84e';
  h += L('M-60 -30 Q0 -82 62 -34', '#8a5a3a', 4);
  h += `<g transform="rotate(-6 6 -64)"><circle cx="-8" cy="-64" r="11" fill="#bfe6d4" stroke="${gl}" stroke-width="4.2"/><circle cx="20" cy="-64" r="11" fill="#bfe6d4" stroke="${gl}" stroke-width="4.2"/>${L('M3 -64 L9 -64', gl, 4)}${L('M-12 -68 q3 -4 7 -4 M16 -68 q3 -4 7 -4', '#ffffff', 2.2)}</g>`;
  if (hi) h += S('M38 -64 Q48 -90 64 -88 Q56 -74 44 -60Z', '#f2a28e', { w: 1.3 }) + spark(-36, -50, 5, '#fff2b8') + fl(-48, -22, '#fbf2de', .9) + fl(-40, -8, '#f2a28e', .7);
  return s + HEAD(h);
};
// ===== 魔法师·男 =====
CH.mgm = { name: '魔法师·男', cls: 'mg', top: -322, F: { skin: '#f3d0ae', rx: 51, ry: 52, jaw: [.45, .42, 1.04, 5], eye: 'sleepy', ec: '#7a5ab0', brow: 'kind', bc: '#7a8aa2', mouth: 'smile', mark: 'glasses', ey: 4 }, tag: '窄鹅蛋脸·八字温和眉·紫眼·圆框眼镜' };
CH.mgm.draw = function (hi) {
  const F = this.F, sk = F.skin, hair = '#9aa8c0', coat = hi ? '#9a88c8' : '#a395cb', teal = '#72b8aa', cream = '#f6ead0', shoe = '#8a5a44';
  let s = shadow(48);
  // 背上的书
  s += `<g transform="rotate(-16 -38 -130)">${S('M-58 -152 L-22 -152 L-22 -110 L-58 -110Z', '#b07a4e', { gap: [10, 8] })}${S('M-58 -114 L-22 -114 L-22 -108 L-58 -108Z', '#f6ead0', { w: 1.2 })}${L('M-44 -152 L-44 -110', '#e0b45a', 3)}${hi ? spark(-34, -136, 6, '#f0cf70') : `<circle cx="-34" cy="-134" r="4" fill="#e0b45a"/>`}</g>`;
  if (hi) s += S('M-26 -136 Q-56 -110 -62 -70 Q-48 -76 -40 -68 Q-30 -84 -14 -80 L24 -134Z', teal, { lc: '#4a8a7e' }) + zig(-58, -18, -74, '#f0cf70', 2, 6);
  // 后臂
  s += limb('M-26 -124 Q-38 -104 -38 -84', 13, coat) + E(-38, -82, 8, 5, cream, { w: 1.4 }) + hand(-38, -75, sk);
  // 铃铛
  s += L('M-30 -76 L-30 -64', '#8a5a3e', 1.6) + S('M-37 -52 Q-38 -64 -30 -66 Q-22 -64 -23 -52Z', '#e0b45a', { lc: '#9a6a30' }) + `<circle cx="-30" cy="-50" r="2.4" fill="#9a6a30"/>`;
  // 腿 / 鞋
  s += limb('M-10 -30 L-11 -12', 11, cream) + limb('M10 -30 L13 -12', 11, cream);
  s += S('M-24 -2 Q-24 -14 -14 -15 L-4 -15 Q0 -6 4 -4 Q4 0 -2 0 L-20 0 Q-24 0 -24 -2Z', shoe, { gap: [40, 8] }) + S('M6 -2 Q6 -14 14 -15 L24 -15 Q30 -7 36 -6 Q40 0 32 0 L9 0 Q6 0 6 -2Z', shoe, { gap: [40, 8] });
  // 长外套
  s += S('M-28 -134 Q-36 -90 -44 -20 Q-22 -13 0 -16 Q22 -13 44 -22 Q36 -90 28 -134 Q0 -141 -28 -134Z', coat, { gap: [70, 6], hv: [10, 34] });
  s += S('M2 -96 L-10 -17 Q0 -15 14 -16Z', teal, { w: 1.4 });
  s += L('M-26 -94 Q-32 -60 -36 -26 M24 -94 Q30 -60 34 -26', LC(coat), 1.2, ' opacity=".4"');
  for (const y of [-118, -104, -90]) s += `<circle cx="4" cy="${y}" r="2.8" fill="${hi ? '#f0cf70' : cream}" stroke="${LC(coat)}" stroke-width="1"/>`;
  s += S('M-20 -138 Q-10 -122 2 -112 Q-8 -106 -22 -116 Q-30 -126 -20 -138Z', teal, { w: 1.5 }) + S('M22 -138 Q14 -122 4 -112 Q14 -106 24 -116 Q32 -126 22 -138Z', teal, { w: 1.5 });
  s += S('M-34 -60 Q0 -54 36 -62 L36 -56 Q0 -48 -34 -54Z', '#b07a4e', { w: 1.3 });
  if (hi) { s += zig(-42, 44, -26, '#f0cf70', 2.4, 6); for (const [x, y] of [[-28, -40], [26, -42], [-18, -78], [20, -80]]) s += spark(x, y, 4.5, '#f0cf70'); }
  // 灯笼法杖
  s += L('M50 -4 L50 -232', '#8a5a3e', 7.6) + L('M50 -4 L50 -232', '#b07a4e', 4.4) + L('M48.6 -120 l3 2 M48.6 -170 l3 2', '#7a4a30', 1.4);
  s += L('M50 -232 Q50 -248 62 -248 Q72 -248 70 -236', '#8a5a3e', 3.2);
  const ly = hi ? -216 : -214, lr = hi ? 1.25 : 1;
  s += `<circle cx="70" cy="${ly}" r="${32 * lr}" fill="url(#glow)" opacity=".9"/>`;
  s += `<g transform="translate(70 ${ly}) scale(${lr})">${S('M-11 -12 Q-15 0 -10 12 L10 12 Q15 0 11 -12Z', '#fdeeb4', { lc: '#c0904a', noshade: 1 })}${S('M-8 -16 L8 -16 L10 -12 L-10 -12Z', '#c99a4a', { w: 1.3 })}${S('M-8 12 L8 12 L6 16 L-6 16Z', '#c99a4a', { w: 1.3 })}${L('M-4 -10 Q-6 0 -4 10 M4 -10 Q6 0 4 10', '#e6be72', 1.2)}<circle cx="0" cy="0" r="4" fill="#fffbe0"/></g>`;
  s += L('M70 -236 L70 -230', '#8a5a3e', 2);
  if (hi) s += S('M54 -60 Q72 -54 76 -38 Q66 -42 60 -36 Q62 -48 54 -52Z', '#f2a28e', { w: 1.3 });
  // 前臂
  s += limb('M27 -124 Q42 -116 46 -104', 13, coat) + E(47, -104, 5, 8, cream, { w: 1.4 }) + hand(50, -98, sk, 8.5);
  if (hi) s += S('M-18 -136 Q-22 -100 -20 -60 L-10 -58 Q-10 -100 -6 -128Z', '#f6ead0', { lc: '#a8804a', w: 1.4 }) + S('M18 -136 Q24 -100 24 -60 L14 -58 Q12 -100 10 -128Z', '#f6ead0', { lc: '#a8804a', w: 1.4 }) + spark(-15, -84, 4.5, '#e6be62') + spark(19, -84, 4.5, '#e6be62') + spark(-15, -104, 3.5, '#e6be62') + spark(19, -104, 3.5, '#e6be62') + L('M-20 -60 l1 6 M-14 -59 l0 6 M15 -59 l0 6 M21 -60 l1 6', '#e6be62', 1.4);
  s += neck(sk);
  let h = '';
  h += S('M-54 10 C-60 -40 -34 -64 2 -64 C38 -64 62 -40 56 10 L50 16 L-50 18Z', hair, { w: 1.6, noshade: 1 });
  h += face(F);
  h += S('M-56 16 C-60 -30 -36 -50 2 -50 C40 -50 62 -30 56 10 Q52 -6 46 -10 Q44 -22 34 -16 Q30 -28 18 -22 Q10 -32 0 -22 Q-10 -30 -20 -20 Q-30 -28 -38 -16 Q-46 -18 -48 -2 Q-54 0 -56 16Z', hair, { gap: [38, 7] });
  // 宽檐软帽（帽尖向后折）
  const hat = hi ? '#9484c2' : '#9d8fc6';
  h += `<g transform="rotate(-5 0 -46)">`;
  h += S('M-14 -118 C-30 -136 -54 -134 -66 -110 C-58 -112 -50 -108 -44 -100 C-36 -108 -26 -110 -12 -106Z', hat, { gap: [20, 10] }) + E(-66, -106, 6, 6, hi ? '#f0cf70' : '#f2a28e', { w: 1.3 });
  h += S('M-40 -46 C-44 -84 -30 -116 -6 -126 C12 -134 30 -122 26 -102 C24 -86 34 -66 42 -46Z', hat, { gap: [24, 10], hv: [55, 30] });
  h += S('M-40 -48 C-30 -60 34 -62 42 -48 L41 -38 C30 -52 -30 -50 -40 -38Z', teal, { w: 1.5 });
  h += S(ed(0, -40, 88, 16), hat, { gap: [62, 8], hv: [5, 40] });
  h += L('M-80 -36 Q0 -22 82 -38', mix(hat, '#ffffff', .35), 1.6, ' opacity=".7"');
  h += S('M-40 -48 C-30 -60 34 -62 42 -48 L41 -38 C30 -50 -30 -48 -40 -38Z', teal, { w: 1.5 });
  if (hi) h += S('M30 -52 Q56 -96 74 -98 Q66 -76 40 -44Z', '#f6ead0', { w: 1.4 }) + L('M34 -50 Q56 -84 72 -96', '#c9a876', 1.2) + spark(-40, -140, 5, '#fff2b8') + (() => { let t = ''; for (const x of [-60, -40, -20]) t += L(`M${x} -32 L${x} -22`, '#c9a876', 1) + `<circle cx="${x}" cy="-20" r="2.6" fill="#f2a28e"/>`; return t; })();
  else h += spark(10, -60, 5, '#f6d77a');
  h += `</g>`;
  return s + HEAD(h);
};
// ===== 魔法师·女 =====
CH.mgf = { name: '魔法师·女', cls: 'mg', top: -314, F: { skin: '#fde5d4', rx: 55, ry: 50, jaw: [.5, .46, 1.03, 6], eye: 'sweet', ec: '#c0586e', brow: 'soft', bc: '#8a5a62', mouth: 'sweet', mark: 'dimple', lash: 1, ey: 5 }, tag: '鹅蛋脸·瓷白肤·玫瑰圆眼·翘睫毛·小笑嘴·双麻花辫' };
CH.mgf.draw = function (hi) {
  const F = this.F, sk = F.skin, hair = '#a26a62', dress = hi ? '#ad98d6' : '#b5a3d8', teal = '#80c3b6', cream = '#fbf2de', shoe = '#9a5a5a';
  let s = shadow(48);
  if (hi) s += S('M-24 -132 Q-54 -96 -64 -30 Q-46 -36 -36 -26 Q-20 -34 0 -28 Q20 -34 36 -26 Q46 -36 64 -30 Q54 -96 24 -132Z', '#cfeae2', { lc: '#6aa89a', gap: [30, 6] }) + zig(-62, 62, -34, '#e6be62', 2.4, 7);
  // 后手托着光点
  s += limb('M-24 -124 Q-38 -112 -46 -106', 10, dress) + hand(-50, -104, sk, 8);
  s += hi ? flyT(-54, -128, 1.4) + fly(-70, -142, .9) : flyT(-54, -126, 1.1);
  // 腿 / 鞋
  s += limb('M-9 -28 L-10 -12', 9, '#f6ecd8') + limb('M9 -28 L12 -12', 9, '#f6ecd8');
  s += S('M-22 -2 Q-22 -13 -13 -14 L-4 -14 Q0 -6 3 -4 Q3 0 -2 0 L-19 0 Q-22 0 -22 -2Z', shoe, { gap: [40, 8] }) + S('M6 -2 Q6 -13 13 -14 L22 -14 Q27 -6 32 -5 Q34 0 28 0 L9 0 Q6 0 6 -2Z', shoe, { gap: [40, 8] });
  // 长裙
  s += S('M-22 -98 Q-42 -62 -48 -24 Q-24 -16 0 -18 Q24 -16 48 -24 Q42 -62 22 -98Z', dress, { gap: [72, 6], hv: [10, 30] });
  s += S('M-46 -32 Q-48 -22 -40 -20 Q-34 -14 -26 -18 Q-18 -12 -10 -17 Q-2 -12 6 -17 Q14 -12 22 -17 Q30 -13 36 -19 Q46 -20 46 -32 Q0 -22 -46 -32Z', teal, { w: 1.4, noshade: 1 });
  s += L('M-22 -80 Q-30 -54 -34 -30 M0 -82 L0 -24 M22 -80 Q30 -54 34 -30', LC(dress), 1.2, ' opacity=".4"');
  if (hi) { s += zig(-44, 46, -38, '#f0cf70', 2.4, 6); for (const [x, y] of [[-24, -52], [14, -60], [30, -44], [-6, -40]]) s += spark(x, y, 4.5, '#f6dc86'); }
  // 腰间小书
  s += `<g transform="rotate(10 -30 -76)">${S('M-40 -86 L-22 -86 L-22 -64 L-40 -64Z', '#c0804e', { w: 1.5 })}${L('M-37 -86 L-37 -64', '#f6ead0', 2)}</g>`;
  // 上身 + 小披肩
  s += S('M-21 -132 Q-24 -112 -21 -96 L21 -96 Q24 -112 21 -132 Q0 -138 -21 -132Z', dress, { w: 1.6 });
  s += S('M-30 -134 Q-40 -118 -36 -104 Q-18 -98 0 -100 Q18 -98 36 -104 Q40 -118 30 -134 Q0 -142 -30 -134Z', hi ? '#7cc0b2' : teal, { gap: [70, 6] });
  s += S('M-14 -138 Q0 -128 14 -138 L12 -130 Q0 -122 -12 -130Z', cream, { w: 1.3 });
  s += E(0, -124, 4.5, 4.5, hi ? '#f0cf70' : '#e0b45a', { w: 1.2 });
  if (hi) s += zig(-34, 36, -104, '#f0cf70', 2, 5);
  s += S('M-22 -98 Q0 -92 22 -98 L22 -92 Q0 -86 -22 -92Z', cream, { w: 1.2 });
  // 水晶法杖（斜持）
  s += L('M14 -12 L82 -232', '#8a5a3e', 7.4) + L('M14 -12 L82 -232', '#b8845a', 4.2);
  s += L('M82 -232 Q70 -246 76 -258 M82 -232 Q96 -244 90 -258', '#8a5a3e', 3);
  const cr = hi ? 1.35 : 1;
  s += `<circle cx="84" cy="-252" r="${30 * cr}" fill="url(#glowT)"/>`;
  s += `<g transform="translate(84 -252) scale(${cr})">${S('M0 -16 L9 -2 L0 12 L-9 -2Z', '#aee6dc', { lc: '#4a9a8e', noshade: 1 })}${L('M0 -16 L-2 12', '#ffffff', 1.2, ' opacity=".7"')}<path d="M-4 -6 L0 -12 L2 -4Z" fill="#ffffff" opacity=".9"/></g>`;
  if (hi) s += S('M76 -214 Q94 -206 100 -190 Q90 -194 84 -188 Q86 -200 74 -206Z', '#f2a28e', { w: 1.2 }) + S('M78 -212 Q60 -200 58 -182 Q66 -188 72 -184 Q70 -198 80 -206Z', '#f6ead0', { w: 1.2 });
  // 前臂
  s += limb('M24 -124 Q36 -114 40 -104', 10, dress) + hand(44, -102, sk, 8);
  s += neck(sk);
  let h = '';
  h += S('M-56 10 C-64 -44 -34 -68 2 -68 C38 -68 66 -44 58 10 L52 24 L-52 24Z', hair, { w: 1.6, noshade: 1 });
  h += face(F);
  h += S('M-58 12 C-64 -40 -34 -64 0 -64 C36 -64 64 -40 58 10 Q52 -12 40 -24 Q26 -30 10 -42 Q-4 -28 -22 -26 Q-40 -18 -58 12Z', hair, { gap: [38, 7] });
  // 双麻花辫（垂到胸前）
  for (const sx of [-1, 1]) {
    const bx = sx < 0 ? -52 : 54;
    h += braid(bx, 16, bx + sx * 2, 74, 6, 11, hair);
    h += E(bx + sx, 82, 6, 4.4, teal, { w: 1.3 }) + S(`M${bx - 4} 85 Q${bx} 100 ${bx + 5} 85Z`, hair, { w: 1.3 });
  }
  // 宽檐平顶帽
  const hc = hi ? '#f2dca4' : '#efd9a2';
  h += `<g transform="rotate(-4 0 -44)">`;
  h += S(ed(0, -44, 96, 19), hc, { lc: '#a8804a', gap: [62, 8], hv: [5, 40] });
  h += S('M-44 -46 C-46 -86 -20 -98 2 -98 C26 -98 48 -86 44 -46 Q0 -38 -44 -46Z', hc, { lc: '#a8804a', gap: [20, 8] });
  h += S('M-45 -56 Q0 -48 45 -56 L44 -44 Q0 -36 -44 -44Z', hi ? '#9a88c8' : '#a99ad0', { w: 1.4 });
  h += L('M-86 -40 Q0 -26 88 -42', '#fff6dc', 1.6, ' opacity=".8"');
  // 帽上的花与飘带
  h += S('M-44 -50 Q-62 -40 -70 -18 Q-62 -20 -58 -14 Q-54 -34 -42 -44Z', '#a99ad0', { w: 1.3 });
  h += fl(30, -54, '#fbf2de');
  if (hi) h += fl(14, -58, '#f2a28e', .8) + fl(44, -60, '#c8e8dc', .8) + S('M-46 -48 Q-74 -30 -84 0 Q-74 -2 -70 4 Q-62 -24 -44 -42Z', '#f2a28e', { w: 1.3 });
  h += `</g>`;
  return s + HEAD(h);
};

// 被 pilot-h.cjs require 时只导出绘图工具，不写文件
module.exports = { CH, S, E, L, limb, hand, face, mix, LC, BASEDEFS, grads, braid, fl, spark, stitch, zig, ed, neck, HEAD };
if (require.main !== module) return;
// 高阶：周围的萤火虫光点
const FLIES = {
  swm: [[-80, -170], [96, -150], [-60, -250], [120, -90], [-96, -110]],
  swf: [[-80, -200], [84, -170], [70, -250], [-78, -100], [100, -60]],
  gnm: [[-86, -210], [-90, -60], [90, -80], [20, -312], [70, -36]],
  gnf: [[-80, -190], [-74, -60], [60, -260], [-30, -290], [80, -40]],
  mgm: [[-86, -190], [100, -150], [-70, -260], [110, -280], [-92, -80], [96, -60]],
  mgf: [[-90, -190], [120, -200], [-70, -60], [104, -110], [40, -320], [-100, -260]],
};
const ORDER = ['swm', 'swf', 'gnm', 'gnf', 'mgm', 'mgf'];
const CLS = { sw: ['#d9775c', '#fbe6da'], gn: ['#5e9cc8', '#e2f0f8'], mg: ['#8f7ec4', '#ece6f6'] };
let charDefs = '';
for (const k of ORDER) for (const hi of [0, 1]) {
  let body = CH[k].draw(hi);
  if (hi) body = FLIES[k].map(([x, y], i) => (k === 'mgf' && i % 2 ? flyT : fly)(x, y, i % 2 ? 1 : 1.35)).join('') + body + FLIES[k].slice(0, 2).map(([x, y]) => fly(x * .7 + 10, y * .8 - 20, .8)).join('');
  charDefs += `<g id="c_${k}_${hi}" filter="url(#paper)">${body}</g>`;
}
const extraDefs = `<radialGradient id="bubH" cx=".35" cy=".35"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#e6f4fb"/><stop offset=".85" stop-color="#f9dcef"/><stop offset="1" stop-color="#fdf1c8"/></radialGradient>`;
const defs = () => `<defs>${BASEDEFS}${extraDefs}${[...grads.values()].join('')}${charDefs}</defs>`;
const FONT = `font-family="'WenQuanYi Zen Hei','Noto Sans CJK SC',sans-serif"`;

// ---------- sheet ----------
{
  const W = 1800, H = 1000, SC = 1.06;
  let b = `<rect width="${W}" height="${H}" fill="#fbf6e8"/><rect y="500" width="${W}" height="500" fill="#f6f1e0"/>`;
  b += `<text x="22" y="34" ${FONT} font-size="20" fill="#9a7a5e">风格 H · 田园小冒险家（柔线暖彩）</text><text x="22" y="532" ${FONT} font-size="18" fill="#9a7a5e">高阶套装：刺绣 · 金扣 · 羽毛 · 小旗 · 萤火光点</text>`;
  ORDER.forEach((k, i) => {
    const cx = 150 + i * 300;
    for (const hi of [0, 1]) {
      const fy = hi ? 922 : 422;
      b += `<use href="#c_${k}_${hi}" transform="translate(${cx} ${fy}) scale(${SC})"/>`;
      const [c1, c2] = CLS[CH[k].cls];
      const label = `${CH[k].name} · ${hi ? '高阶' : '初始'}`;
      b += `<rect x="${cx - 82}" y="${fy + 22}" width="164" height="34" rx="17" fill="${c2}" stroke="${c1}" stroke-width="1.6"/><text x="${cx}" y="${fy + 45}" text-anchor="middle" ${FONT} font-size="17" fill="${mix(c1, '#4e2a1e', .35)}">${label}</text>`;
    }
  });
  fs.writeFileSync(OUT + 'sheet.svg', `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs()}${b}</svg>`);
}
// ---------- faces ----------
{
  const CW = 410, CI = 400, GAP = 20, W = 3 * CW + 4 * GAP;
  let b = '';
  let y0 = 60;
  b += `<text x="${GAP}" y="40" ${FONT} font-size="24" fill="#8a5a44">风格 H · 六张脸特写（初始套装）</text>`;
  ORDER.forEach((k, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = GAP + col * (CW + GAP), y = y0 + row * (CI + 100 + GAP);
    const C = CH[k], [c1, c2] = CLS[C.cls];
    // 取景：上沿=角色最高点，下到下巴下方一点
    const top = C.top - 8, bot = -112, hgt = bot - top, wid = hgt;
    const vx = 6 - wid / 2 + 8;
    b += `<rect x="${x}" y="${y}" width="${CW}" height="${CI + 90}" rx="22" fill="#fffdf6" stroke="${mix(c1, '#ffffff', .4)}" stroke-width="2"/>`;
    b += `<svg x="${x + 5}" y="${y + 5}" width="${CI}" height="${CI}" viewBox="${vx} ${top} ${wid} ${hgt}"><rect x="${vx}" y="${top}" width="${wid}" height="${hgt}" fill="${c2}" opacity=".55"/><use href="#c_${k}_0"/></svg>`;
    b += `<rect x="${x + 14}" y="${y + CI + 14}" width="${CW - 28}" height="64" rx="16" fill="${c2}"/><text x="${x + 30}" y="${y + CI + 44}" ${FONT} font-size="22" fill="${mix(c1, '#4e2a1e', .3)}">${C.name}</text><text x="${x + 30}" y="${y + CI + 68}" ${FONT} font-size="15" fill="#8a6a56">${C.tag}</text>`;
  });
  let y = y0 + 2 * (CI + 110) + 10;
  const SC = 0.78; // 头宽约 90px
  // 1:1 主条：头宽 90
  b += `<rect x="0" y="${y}" width="${W}" height="330" fill="#f3ecdc"/><text x="${GAP}" y="${y + 30}" ${FONT} font-size="18" fill="#8a5a44">游戏内尺寸对照（1:1，头宽约 ${Math.round(112 * SC)}px）；下排：0.42 倍剪影，检查 6 个角色能否一眼分开</text>`;
  ORDER.forEach((k, i) => {
    const cx = 110 + i * 210;
    b += `<use href="#c_${k}_0" transform="translate(${cx} ${y + 300}) scale(${SC})"/><text x="${cx}" y="${y + 324}" text-anchor="middle" ${FONT} font-size="14" fill="#8a6a56">${CH[k].name}</text>`;
  });
  y += 330;
  b += `<rect x="0" y="${y}" width="${W}" height="170" fill="#efe8d8"/>`;
  ORDER.forEach((k, i) => {
    const cx = 110 + i * 210;
    b += `<g filter="url(#sil)"><use href="#c_${k}_0" transform="translate(${cx} ${y + 158}) scale(.42)"/></g>`;
  });
  const H = y + 175;
  const sil = `<filter id="sil"><feFlood flood-color="#9a8a7a"/><feComposite in2="SourceAlpha" operator="in"/></filter>`;
  fs.writeFileSync(OUT + 'faces.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${sil}</defs>${defs()}<rect width="${W}" height="${H}" fill="#fbf6e8"/>${b}</svg>`);
}
console.log('ok');
