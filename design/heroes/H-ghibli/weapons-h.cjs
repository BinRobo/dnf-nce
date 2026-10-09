// 把游戏武器库（chars/hero/weapons）转成 H 风格（chars/hero/weapons_h）：node weapons-h.cjs
// 做法：去掉 6px 深色外描边那一层；把 #2B2A4A 细线换成“填充色和暖棕各半”的同色系线；
// 填充色往奶油色靠一点、降饱和；整件叠一层纸纹。尺寸、锚点不变，weapons.json 原样复制。
const fs = require('fs');
const path = require('path');
const SRC = path.resolve(__dirname, '../../../public/assets/art/chars/hero/weapons');
const OUT = path.resolve(__dirname, '../../../public/assets/art/chars/hero/weapons_h');
const INK = '#2b2a4a';
const h2r = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16)); };
const r2h = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = h2r(a), B = h2r(b); return r2h(A.map((v, i) => v + (B[i] - v) * t)); };
const lum = (c) => { const [r, g, b] = h2r(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const isHex = (c) => /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c || '');
// 填充色：深色件提亮成暖棕，其余往奶油色靠 10%、再往暖灰靠 5%（降饱和）
function soften(c) {
  c = c.toLowerCase();
  if (c === '#fff' || c === '#ffffff') return '#fffaf0';
  if (c === INK || c === '#000000' || c === '#000') return '#6e4a3e';
  let o = mix(c, '#f6ead6', 0.1);
  o = mix(o, '#b8a48e', 0.05);
  if (lum(o) < 0.32) o = mix(o, '#a07860', 0.35);
  return o;
}
const LC = (c) => mix(c, '#4e2a1e', 0.62);
const PAPER = `<filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="2" seed="4" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .6  0 0 0 0 .42  0 0 0 0 .3  0 0 0 -.45 .3" result="m"/><feComposite in="m" in2="SourceAlpha" operator="in" result="t"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="t"/></feMerge></filter>`;

const attr = (tag, k) => (tag.match(new RegExp(`\\s${k}="([^"]*)"`)) || [])[1];
const setAttr = (tag, k, v) => (attr(tag, k) !== undefined ? tag.replace(new RegExp(`(\\s${k}=")[^"]*(")`), `$1${v}$2`) : tag.replace(/(\/?>)$/, ` ${k}="${v}"$1`));

function convert(svg) {
  // 1) 删掉外描边层：fill 和 stroke 都是墨色、线宽 ≥ 4
  svg = svg.replace(/<(path|circle|rect|ellipse|polygon)\b[^>]*\/>/g, (tag) => {
    const f = (attr(tag, 'fill') || '').toLowerCase(), s = (attr(tag, 'stroke') || '').toLowerCase(), w = +(attr(tag, 'stroke-width') || 0);
    if (f === INK && s === INK && w >= 4) return '';
    let t = tag;
    if (isHex(f)) t = setAttr(t, 'fill', soften(f));
    if (s === INK) {
      if (isHex(f)) { t = setAttr(t, 'stroke', LC(soften(f))); t = setAttr(t, 'stroke-width', 2.4); }
      else { t = setAttr(t, 'stroke', '#7a4e3e'); t = setAttr(t, 'stroke-width', +((w || 2) * 0.9).toFixed(2)); }
    } else if (isHex(s)) t = setAttr(t, 'stroke', soften(s));
    return t;
  });
  // 渐变里的颜色也一起柔化
  svg = svg.replace(/stop-color="(#[0-9a-fA-F]{3,6})"/g, (m, c) => `stop-color="${soften(c)}"`);
  // 2) 整件叠纸纹
  svg = svg.replace(/(<svg[^>]*>)/, `$1<defs>${PAPER}</defs><g filter="url(#paper)">`).replace(/<\/svg>\s*$/, '</g></svg>\n');
  return svg;
}
fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const f of fs.readdirSync(SRC)) {
  if (f.endsWith('.svg')) { fs.writeFileSync(path.join(OUT, f), convert(fs.readFileSync(path.join(SRC, f), 'utf8'))); n++; }
  else if (f === 'weapons.json') fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
}
console.log('ok', n, OUT);
