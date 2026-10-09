// 试点：H「田园小冒险家」6 个主角（初始装扮）→ 游戏纸娃娃部件 —— node pilot-h.cjs [--debug]
// 输出 public/assets/art/chars/h_{sm,sf,gm,gf,mm,mf}/。头部（脸 + 发型 + 帽子）直接取 gen.cjs 的 draw() 输出；
// 身体、腿、披风/背包按 gen.cjs 原坐标摘出来；手臂改成自然下垂（武器由游戏武器库挂在右手上）。
const fs = require('fs');
const path = require('path');
const H = require('./gen.cjs');
const { CH, S, E, L, limb, hand, mix, LC, BASEDEFS, grads, braid, neck } = H;

const ROOT = path.resolve(__dirname, '../../../public/assets/art/chars');
const SC = 1.2; // gen 坐标 → rig 单位（全身约 300 → rig.height 约 360，和旧 hero 361 一致）
const M = 6; // 部件外围留白
const r1 = (n) => +(+n).toFixed(2);
const HEAD_G = '<g transform="translate(0 -188)">';

// ---------- 通用部件 ----------
// 下垂手臂：肩 (side*sx, -124) → 手 (side*(sx+7), -86)；可带泡泡袖、袖口
function arm(side, o) {
  const x0 = side * o.sx, hx = side * (o.sx + 7), hy = -86;
  let s = limb(`M${x0} -124 Q${x0 + side * 5} -106 ${x0 + side * 6} -93`, o.w, o.sleeve);
  if (o.cuff) s += E(x0 + side * 6.4, -92, o.w * .55, 4.4, o.cuff, { w: 1.4 });
  s += hand(hx, hy, o.skin, side > 0 ? 9 : 8);
  if (o.puff) s += E(x0, -123, 10, 9, o.puff);
  if (o.goldCuff) s += L(`M${x0 + side * 6.4 - 6} -95 L${x0 + side * 6.4 + 6} -95`, '#f0cf70', 2.4);
  if (o.epaulet) s += E(x0 + side * 3, -127, 11, 6, '#f0cf70', { lc: '#a8763a', w: 1.4 }) + L(`M${x0 - 5} -122 l0 6 M${x0} -121 l0 7 M${x0 + 5} -121 l0 7 M${x0 + side * 10} -122 l0 6`, '#e6be62', 1.6);
  return { s, pivot: [x0, -124], hand: [hx, hy] };
}
function headOf(k, expr) {
  const C = CH[k];
  C.F.expr = expr === 'normal' ? undefined : expr;
  const out = C.draw(0);
  C.F.expr = undefined;
  const i = out.lastIndexOf(HEAD_G);
  if (i < 0) throw new Error('head not found ' + k);
  return out.slice(i);
}

// ---------- 6 个角色的身体部件（gen.cjs 原坐标）----------
// 每个角色是 P => 部件 的函数：P 是配色（默认 = 设计稿原色），装扮就是换一组 P 再画一遍。
// P：main 主衣色、shade 深一档的衣色、accent 点缀色、light 浅色衬衫/围裙、pants 裤子或袜子、shoe 鞋
const SPEC = {};
const BASE_P = {
  swm: { main: '#cf6a4e', shade: '#b47c4e', accent: '#c85e4a', light: '#f4e6c6', pants: '#c8a676', shoe: '#a8683e' },
  swf: { main: '#d97a5e', shade: '#c9614a', accent: '#c9614a', light: '#faf0dc', pants: '#f6e8cc', shoe: '#b25a40' },
  gnm: { main: '#82b2d4', shade: '#9c6c46', accent: '#e8b44e', light: '#f6ead2', pants: '#f4ead4', shoe: '#9a6038' },
  gnf: { main: '#86b9da', shade: '#a87a4a', accent: '#9fd3b4', light: '#fbf2de', pants: '#f6ecd6', shoe: '#9a6038' },
  mgm: { main: '#a395cb', shade: '#b07a4e', accent: '#72b8aa', light: '#f6ead0', pants: '#f6ead0', shoe: '#8a5a44' },
  mgf: { main: '#b5a3d8', shade: '#c0804e', accent: '#80c3b6', light: '#fbf2de', pants: '#f6ecd8', shoe: '#9a5a5a' },
};
// 胸前徽章位置（装扮的标志画在这里）和头饰挂点（头部局部坐标，头中心为原点）
const BADGE = { swm: [23, -112], swf: [0, -108], gnm: [24, -110], gnf: [0, -108], mgm: [16, -118], mgf: [0, -124] };
const HAT_AT = { swm: [34, -62], swf: [28, -60], gnm: [40, -58], gnf: [40, -56], mgm: [34, -52], mgf: [40, -52] };
SPEC.swm = (P) => {
  const sk = CH.swm.F.skin, belt = '#8e5c3c';
  const bootTrim = mix(P.shoe, '#f4e6c6', .3);
  return {
    id: 'h_sm', top: -300,
    cape: S('M-24 -132 Q-50 -112 -58 -78 Q-64 -60 -70 -50 Q-58 -52 -52 -46 Q-44 -54 -36 -48 Q-26 -58 -12 -56 L22 -128Z', P.accent, { gap: [30, 6] }),
    legL: limb('M-13 -60 Q-14 -40 -15 -18', 16, P.pants) + L('M-23 -36 L-7 -36', LC(P.pants), 1.4, ' opacity=".6"')
      + S('M-31 -2 Q-33 -24 -24 -26 L-7 -26 Q-5 -12 -1 -8 Q2 0 -6 0 L-27 0 Q-31 0 -31 -2Z', P.shoe, { gap: [40, 8] }) + S('M-26 -27 L-6 -27 L-6 -21 L-26 -21Z', bootTrim, { w: 1.4, noshade: 1 }),
    legR: limb('M13 -60 Q16 -40 18 -18', 16, P.pants) + L('M10 -36 L26 -36', LC(P.pants), 1.4, ' opacity=".6"')
      + S('M5 -2 Q5 -24 13 -26 L28 -26 Q30 -12 38 -9 Q43 -2 36 0 L9 0 Q5 0 5 -2Z', P.shoe, { gap: [40, 8] }) + S('M12 -27 L29 -27 L29 -21 L12 -21Z', bootTrim, { w: 1.4, noshade: 1 }),
    hip: [13, -58],
    body: S('M-30 -130 Q-36 -100 -38 -50 Q-20 -44 0 -45 Q20 -44 38 -50 Q36 -100 30 -130 Q0 -138 -30 -130Z', P.main, { gap: [70, 6] })
      + S('M-30 -130 Q-36 -100 -37 -66 L-11 -66 Q-9 -100 -7 -133Z', P.shade, { w: 1.7 }) + S('M30 -130 Q36 -100 37 -66 L14 -66 Q12 -100 9 -133Z', P.shade, { w: 1.7 })
      + H.stitch('M-12 -128 Q-14 -100 -14 -70', mix(P.shade, '#ffffff', .4), 1.6) + H.stitch('M12 -128 Q15 -100 17 -70', mix(P.shade, '#ffffff', .4), 1.6)
      + S('M-9 -135 L0 -119 L9 -135 Q0 -131 -9 -135Z', P.light, { w: 1.5 })
      + S('M-38 -76 Q0 -68 38 -76 L38 -65 Q0 -57 -38 -65Z', belt, { w: 1.6 }) + S('M-6 -73 h13 v11 h-13z', '#e0b45a', { w: 1.5 })
      + neck(sk),
    arm: { sx: 27, w: 13, sleeve: P.light, skin: sk },
  };
};
SPEC.swf = (P) => {
  const sk = CH.swf.F.skin;
  return {
    id: 'h_sf', top: -286,
    legL: limb('M-10 -50 Q-11 -30 -11 -14', 10, P.pants) + S('M-22 -2 Q-22 -14 -13 -15 L-3 -15 Q0 -6 2 -3 Q2 0 -3 0 L-19 0 Q-22 0 -22 -2Z', P.shoe, { gap: [40, 8] }) + L('M-18 -12 L-3 -12', '#f4e0c0', 1.6),
    legR: limb('M10 -50 Q12 -30 14 -14', 10, P.pants) + S('M6 -2 Q6 -14 14 -15 L23 -15 Q27 -7 30 -5 Q31 0 26 0 L9 0 Q6 0 6 -2Z', P.shoe, { gap: [40, 8] }) + L('M10 -12 L25 -12', '#f4e0c0', 1.6),
    hip: [10, -52],
    body: S('M-22 -92 Q-48 -84 -48 -62 Q-48 -48 -38 -43 Q-18 -38 0 -38 Q18 -38 38 -43 Q48 -48 48 -62 Q48 -84 22 -92Z', P.main, { gap: [72, 6], hv: [10, 30] })
      + S('M-38 -46 Q-40 -38 -30 -36 Q-26 -32 -18 -35 Q-12 -31 -4 -34 Q2 -30 8 -34 Q16 -31 20 -35 Q28 -32 32 -36 Q42 -38 38 -46 Q0 -38 -38 -46Z', P.light, { w: 1.4, noshade: 1 })
      + L('M-30 -80 Q-34 -62 -30 -48 M-12 -86 Q-14 -64 -12 -44 M12 -86 Q14 -64 12 -44 M30 -80 Q34 -62 30 -48', LC(P.main), 1.2, ' opacity=".45"')
      + S('M-21 -130 Q-25 -110 -22 -88 Q0 -84 22 -88 Q25 -110 21 -130 Q0 -137 -21 -130Z', P.main, { gap: [70, 6] })
      + S('M-12 -120 L12 -120 L15 -89 L-15 -89Z', P.light, { w: 1.5 }) + S('M-21 -90 Q-27 -66 -22 -46 Q0 -41 23 -46 Q28 -66 21 -90 Q0 -86 -21 -90Z', P.light, { w: 1.6 })
      + L('M-12 -120 L-20 -132 M12 -120 L20 -132', LC(P.light), 1.6)
      + `<path d="M-6 -58 h12 v8 h-12z" fill="none" stroke="${LC(P.light)}" stroke-width="1.3"/>`
      + S('M-36 -90 Q0 -82 36 -90 L36 -84 Q0 -77 -36 -84Z', P.accent, { w: 1.2 })
      + neck(sk),
    arm: { sx: 25, w: 9, sleeve: sk, skin: sk, puff: P.light },
  };
};
SPEC.gnm = (P) => {
  const sk = CH.gnm.F.skin, pack = '#b98c5a';
  const bootLine = mix(P.shoe, '#f4e6c6', .35);
  return {
    id: 'h_gm', top: -300,
    cape: S('M-54 -140 Q-60 -100 -54 -60 Q-36 -54 -18 -60 L-14 -140 Q-34 -148 -54 -140Z', pack, { gap: [40, 8], hv: [5, 30] })
      + S('M-60 -100 Q-62 -80 -56 -70 L-48 -70 L-50 -100Z', mix(pack, '#7a5a3a', .25), { w: 1.4 })
      + `<g transform="rotate(-8 -32 -146)">${S('M-56 -154 L-8 -154 Q-2 -146 -8 -138 L-56 -138 Q-62 -146 -56 -154Z', '#d9c49a', { w: 1.6 })}${E(-56, -146, 4, 8, '#e9d8b0', { w: 1.4 })}${L('M-40 -154 L-40 -138 M-22 -154 L-22 -138', '#9c6c46', 2.4)}</g>`
      + S('M-64 -86 Q-66 -72 -58 -70 Q-50 -72 -52 -86Z', '#9fb4bc', { w: 1.5 }) + L('M-64 -82 q-5 2 -1 7', '#8a9aa0', 1.6)
      + S('M-8 -134 Q-38 -134 -64 -122 Q-72 -118 -78 -108 Q-66 -110 -58 -104 Q-40 -116 -10 -122Z', P.accent, { w: 1.6 }),
    legL: limb('M-13 -56 Q-14 -36 -15 -16', 13, sk) + limb('M-14.6 -40 L-15 -16', 14.5, P.pants) + L('M-21 -36 L-8 -36', '#c9a876', 1.6)
      + S('M-32 -2 Q-34 -22 -24 -24 L-6 -24 Q-4 -12 0 -8 Q3 0 -5 0 L-28 0 Q-32 0 -32 -2Z', P.shoe, { gap: [40, 8] }) + L('M-30 -12 L-2 -12', bootLine, 1.6),
    legR: limb('M13 -56 Q15 -36 17 -16', 13, sk) + limb('M16 -40 L17 -16', 14.5, P.pants) + L('M10 -36 L23 -36', '#c9a876', 1.6)
      + S('M6 -2 Q6 -22 14 -24 L28 -24 Q30 -12 39 -9 Q44 -2 37 0 L10 0 Q6 0 6 -2Z', P.shoe, { gap: [40, 8] }) + L('M8 -12 L38 -12', bootLine, 1.6),
    hip: [13, -56],
    body: S('M-30 -82 Q-34 -64 -31 -50 L-3 -50 L0 -60 L3 -50 L31 -50 Q34 -64 30 -82Z', P.shade, { gap: [70, 6] })
      + S('M-26 -132 Q-30 -106 -29 -80 L29 -80 Q30 -106 26 -132 Q0 -138 -26 -132Z', P.light, { w: 1.6 })
      + L('M-14 -130 L-12 -80 M14 -130 L13 -80', P.shade, 3.6)
      + S('M-30 -132 Q-38 -104 -36 -84 Q-24 -80 -14 -82 L-10 -134Z', P.main, { gap: [30, 8] }) + S('M30 -132 Q38 -104 36 -84 Q26 -80 16 -82 L12 -134Z', P.main, { gap: [30, 8] })
      + S('M-36 -88 L-14 -86 L-14 -80 L-36 -82Z', mix(P.main, '#4a6a8a', .15), { w: 1.4 }) + S('M16 -86 L36 -88 L36 -82 L16 -80Z', mix(P.main, '#4a6a8a', .15), { w: 1.4 })
      + S('M-20 -138 Q0 -128 22 -138 Q26 -128 20 -120 Q0 -114 -20 -120 Q-26 -128 -20 -138Z', P.accent, { w: 1.6 }) + E(-14, -122, 6, 5, P.accent, { w: 1.4 })
      + neck(sk),
    arm: { sx: 27, w: 13, sleeve: P.main, skin: sk },
  };
};
SPEC.gnf = (P) => {
  const sk = CH.gnf.F.skin;
  return {
    id: 'h_gf', top: -274,
    cape: S('M-10 -130 Q-34 -134 -56 -124 Q-62 -118 -66 -112 Q-54 -114 -48 -108 Q-32 -118 -12 -120Z', P.accent, { w: 1.6 }),
    legL: limb('M-10 -48 Q-11 -30 -12 -14', 11, sk) + limb('M-11.4 -38 L-12 -14', 12.5, P.pants) + L('M-17 -32 L-6 -32 M-17 -26 L-6 -26', P.accent, 2.2)
      + S('M-24 -2 Q-24 -16 -14 -18 L-3 -18 Q0 -8 3 -5 Q4 0 -2 0 L-20 0 Q-24 0 -24 -2Z', P.shoe, { gap: [40, 8] }),
    legR: limb('M10 -48 Q12 -30 14 -14', 11, sk) + limb('M12.6 -38 L14 -14', 12.5, P.pants) + L('M8 -32 L19 -32 M8 -26 L19 -26', P.accent, 2.2)
      + S('M6 -2 Q6 -16 14 -18 L24 -18 Q28 -8 33 -6 Q36 0 30 0 L9 0 Q6 0 6 -2Z', P.shoe, { gap: [40, 8] }),
    hip: [10, -50],
    body: S('M-44 -78 Q-46 -62 -38 -58 L-22 -58 Q-18 -66 -22 -80Z', '#b98c5a', { w: 1.6 }) + S('M-44 -78 L-22 -80 L-24 -70 Q-34 -66 -44 -70Z', '#a87a4a', { w: 1.4 })
      + S('M-24 -56 Q-26 -44 -18 -44 Q-10 -42 -4 -48 L4 -48 Q10 -42 18 -44 Q26 -44 24 -56Z', P.light, { w: 1.4 })
      + S('M-20 -98 Q-40 -70 -42 -52 Q-20 -46 0 -47 Q20 -46 42 -52 Q40 -70 20 -98Z', P.main, { gap: [72, 6], hv: [10, 30] })
      + L('M-24 -84 Q-30 -66 -30 -52 M24 -84 Q30 -66 30 -52', LC(P.main), 1.2, ' opacity=".45"')
      + S('M14 -76 L30 -74 L28 -60 L16 -62Z', mix(P.main, '#ffffff', .25), { w: 1.4 })
      + S('M-21 -132 Q-24 -112 -20 -96 L20 -96 Q24 -112 21 -132 Q0 -138 -21 -132Z', P.light, { gap: [70, 6] })
      + S('M-14 -118 L14 -118 L19 -96 L-19 -96Z', P.main, { w: 1.6 }) + L('M-12 -118 L-18 -134 M12 -118 L18 -134', P.main, 3.4)
      + `<circle cx="-12" cy="-116" r="2.4" fill="#e0b45a"/><circle cx="12" cy="-116" r="2.4" fill="#e0b45a"/>`
      + L('M-36 -118 Q-10 -96 18 -76', P.shade, 3)
      + S('M-20 -140 Q0 -130 22 -140 Q26 -130 20 -122 Q0 -116 -20 -122 Q-26 -130 -20 -140Z', P.accent, { w: 1.6 }) + S('M-16 -124 Q-20 -112 -14 -104 Q-6 -112 -8 -124Z', P.accent, { w: 1.4 })
      + neck(sk),
    arm: { sx: 22, w: 9, sleeve: P.light, skin: sk, puff: P.light },
  };
};
SPEC.mgm = (P) => {
  const sk = CH.mgm.F.skin;
  return {
    id: 'h_mm', top: -322,
    cape: `<g transform="rotate(-16 -38 -130)">${S('M-58 -152 L-22 -152 L-22 -110 L-58 -110Z', P.shade, { gap: [10, 8] })}${S('M-58 -114 L-22 -114 L-22 -108 L-58 -108Z', '#f6ead0', { w: 1.2 })}${L('M-44 -152 L-44 -110', '#e0b45a', 3)}<circle cx="-34" cy="-134" r="4" fill="#e0b45a"/></g>`,
    legL: limb('M-10 -34 L-11 -12', 11, P.pants) + S('M-24 -2 Q-24 -14 -14 -15 L-4 -15 Q0 -6 4 -4 Q4 0 -2 0 L-20 0 Q-24 0 -24 -2Z', P.shoe, { gap: [40, 8] }),
    legR: limb('M10 -34 L13 -12', 11, P.pants) + S('M6 -2 Q6 -14 14 -15 L24 -15 Q30 -7 36 -6 Q40 0 32 0 L9 0 Q6 0 6 -2Z', P.shoe, { gap: [40, 8] }),
    hip: [10, -32],
    body: S('M-28 -134 Q-36 -90 -44 -20 Q-22 -13 0 -16 Q22 -13 44 -22 Q36 -90 28 -134 Q0 -141 -28 -134Z', P.main, { gap: [70, 6], hv: [10, 34] })
      + S('M2 -96 L-10 -17 Q0 -15 14 -16Z', P.accent, { w: 1.4 })
      + L('M-26 -94 Q-32 -60 -36 -26 M24 -94 Q30 -60 34 -26', LC(P.main), 1.2, ' opacity=".4"')
      + [-118, -104, -90].map((y) => `<circle cx="4" cy="${y}" r="2.8" fill="${P.light}" stroke="${LC(P.main)}" stroke-width="1"/>`).join('')
      + S('M-20 -138 Q-10 -122 2 -112 Q-8 -106 -22 -116 Q-30 -126 -20 -138Z', P.accent, { w: 1.5 }) + S('M22 -138 Q14 -122 4 -112 Q14 -106 24 -116 Q32 -126 22 -138Z', P.accent, { w: 1.5 })
      + S('M-34 -60 Q0 -54 36 -62 L36 -56 Q0 -48 -34 -54Z', P.shade, { w: 1.3 })
      + L('M-30 -58 L-30 -50', '#8a5a3e', 1.6) + S('M-36 -38 Q-37 -50 -30 -52 Q-23 -50 -24 -38Z', '#e0b45a', { lc: '#9a6a30' }) + `<circle cx="-30" cy="-36" r="2.2" fill="#9a6a30"/>`
      + neck(sk),
    arm: { sx: 27, w: 13, sleeve: P.main, skin: sk, cuff: P.light },
  };
};
SPEC.mgf = (P) => {
  const sk = CH.mgf.F.skin;
  return {
    id: 'h_mf', top: -314,
    legL: limb('M-9 -32 L-10 -12', 9, P.pants) + S('M-22 -2 Q-22 -13 -13 -14 L-4 -14 Q0 -6 3 -4 Q3 0 -2 0 L-19 0 Q-22 0 -22 -2Z', P.shoe, { gap: [40, 8] }),
    legR: limb('M9 -32 L12 -12', 9, P.pants) + S('M6 -2 Q6 -13 13 -14 L22 -14 Q27 -6 32 -5 Q34 0 28 0 L9 0 Q6 0 6 -2Z', P.shoe, { gap: [40, 8] }),
    hip: [9, -30],
    body: S('M-22 -98 Q-42 -62 -48 -24 Q-24 -16 0 -18 Q24 -16 48 -24 Q42 -62 22 -98Z', P.main, { gap: [72, 6], hv: [10, 30] })
      + S('M-46 -32 Q-48 -22 -40 -20 Q-34 -14 -26 -18 Q-18 -12 -10 -17 Q-2 -12 6 -17 Q14 -12 22 -17 Q30 -13 36 -19 Q46 -20 46 -32 Q0 -22 -46 -32Z', P.accent, { w: 1.4, noshade: 1 })
      + L('M-22 -80 Q-30 -54 -34 -30 M0 -82 L0 -24 M22 -80 Q30 -54 34 -30', LC(P.main), 1.2, ' opacity=".4"')
      + `<g transform="rotate(10 -30 -76)">${S('M-40 -86 L-22 -86 L-22 -64 L-40 -64Z', P.shade, { w: 1.5 })}${L('M-37 -86 L-37 -64', '#f6ead0', 2)}</g>`
      + S('M-21 -132 Q-24 -112 -21 -96 L21 -96 Q24 -112 21 -132 Q0 -138 -21 -132Z', P.main, { w: 1.6 })
      + S('M-30 -134 Q-40 -118 -36 -104 Q-18 -98 0 -100 Q18 -98 36 -104 Q40 -118 30 -134 Q0 -142 -30 -134Z', P.accent, { gap: [70, 6] })
      + S('M-14 -138 Q0 -128 14 -138 L12 -130 Q0 -122 -12 -130Z', P.light, { w: 1.3 })
      + E(0, -124, 4.5, 4.5, '#e0b45a', { w: 1.2 })
      + S('M-22 -98 Q0 -92 22 -98 L22 -92 Q0 -86 -22 -92Z', P.light, { w: 1.2 })
      + neck(sk),
    arm: { sx: 24, w: 10, sleeve: P.main, skin: sk },
  };
};

// ---------- 装扮（衣柜 6 套）：换配色 + 胸前徽章 + 头饰 ----------
// 每套给一组 H 风格的低饱和暖色；上衣件 = body/armL/armR/cape，下装件 = legL/legR，帽子件 = 挂在原帽子上的小头饰（不替换角色自己的帽子）
const SETS = {
  school: { main: '#6f8cc0', accent: '#c95e5a', light: '#f6efe0', pants: '#5f7298', shoe: '#7a5a48', sock: '#f4ecdc' },
  knight: { main: '#b4c0cc', accent: '#5d7fb8', light: '#f2ead6', pants: '#8e98a8', shoe: '#7a6a5e', sock: '#dfe4ea' },
  mage: { main: '#8f7ec4', accent: '#e6be62', light: '#f2e8f8', pants: '#7a6cae', shoe: '#6e5070', sock: '#ece2f6' },
  pardon: { main: '#e08a48', accent: '#e6be62', light: '#fbf0d8', pants: '#a8683e', shoe: '#8a5a3e', sock: '#f8e6c8' },
  whomist: { main: '#5aa88a', accent: '#c8d6e0', light: '#eef6f0', pants: '#4f8a74', shoe: '#5e4a40', sock: '#e2f0e8' },
  festival: { main: '#f0b84a', accent: '#e86a8a', light: '#fff4d8', pants: '#e08aa0', shoe: '#c0605a', sock: '#fde6ee' },
};
// 角色的腿是裤子（剑士男）还是袜子
const PANTS_IS_TROUSERS = { swm: 1 };
function setPalette(k, set) {
  const s = SETS[set];
  return { main: s.main, shade: mix(s.main, '#4e2a1e', .22), accent: s.accent, light: s.light, pants: PANTS_IS_TROUSERS[k] ? s.pants : s.sock, shoe: s.shoe };
}
// 套装标志（小号：胸前徽章；大号：头饰）
function emblem(set, x, y, k = 1) {
  const g = (inner) => `<g transform="translate(${x} ${y}) scale(${k})">${inner}</g>`;
  switch (set) {
    case 'school': return g(E(0, 0, 6.5, 6.5, '#e6be62', { lc: '#a8763a' }) + H.spark(0, 0, 4, '#fffaf0'));
    case 'knight': return g(S('M-6 -7 L6 -7 L6 0 Q6 6 0 9 Q-6 6 -6 0Z', '#dfe6ee', { lc: '#6e7a8a' }) + L('M0 -5 L0 6 M-4 -1 L4 -1', '#5d7fb8', 2));
    case 'mage': return g(S('M2 -8 A8 8 0 1 0 2 8 A6 6 0 1 1 2 -8Z', '#f0cf70', { lc: '#a8763a' }) + H.spark(5, -4, 3, '#fffaf0'));
    case 'pardon': return g(S('M-7 -2 L2 -5 Q8 -9 9 -1 Q8 7 2 3 L-7 2Z', '#e6be62', { lc: '#9a6a30' }) + `<circle cx="-7" cy="0" r="2.4" fill="#c99a4a"/>`);
    case 'whomist': return g(S('M-8 -5 L8 -5 L8 5 L-8 5Z', '#eef2f4', { lc: '#7a8a96' }) + L('M-5 -1 L5 -1 M-5 2 L2 2', '#7a8a96', 1.2) + `<circle cx="0" cy="-7" r="1.6" fill="#7a8a96"/>`);
    case 'festival': return g(H.fl(0, 0, '#e86a8a', .9) + `<circle cx="0" cy="0" r="2.4" fill="#f0cf70"/>`);
  }
  return '';
}
// 头饰：画在头部局部坐标（和 head.svg 同一个画框，游戏里叠在头上）
function hatAccessory(set, k) {
  const [x, y] = HAT_AT[k];
  let s = '';
  switch (set) {
    case 'school': s = `<g transform="translate(${x} ${y}) rotate(-12)">${S('M0 0 Q-14 -12 -18 -2 Q-14 8 0 0Z', '#6f8cc0')}${S('M0 0 Q14 -12 18 -2 Q14 8 0 0Z', '#6f8cc0')}${S('M-1 1 L-6 12 L-1 9Z M1 1 L6 12 L1 9Z', '#6f8cc0', { w: 1.2 })}</g>` + emblem('school', x, y, .9); break;
    case 'knight': s = `<g transform="translate(${x} ${y}) rotate(18)">${S('M0 2 Q-6 -20 6 -40 Q14 -22 6 -2Z', '#f2ead6', { lc: '#a8946e' })}${L('M2 0 Q2 -20 6 -36', '#c9b48a', 1.2)}${S('M0 4 Q10 -14 22 -24 Q20 -8 6 6Z', '#8fa8d0', { w: 1.3 })}</g>` + emblem('knight', x, y + 4, .9); break;
    case 'mage': s = emblem('mage', x, y - 4, 1.5) + H.spark(x + 14, y - 16, 4, '#f6dc86') + H.spark(x - 10, y - 18, 3, '#fff2b8'); break;
    case 'pardon': s = `<g transform="translate(${x} ${y - 6}) rotate(-20)">${S('M-14 -3 L4 -8 Q14 -16 16 -1 Q14 14 4 6 L-14 3Z', '#e6be62', { lc: '#9a6a30' })}<ellipse cx="15" cy="-1" rx="3" ry="9" fill="#f6d77a" stroke="#9a6a30" stroke-width="1.3"/><circle cx="-14" cy="0" r="4" fill="#c99a4a" stroke="#9a6a30" stroke-width="1"/></g>`; break;
    case 'whomist': s = `<g transform="translate(${x} ${y}) rotate(14)">${S('M-6 -2 Q-2 -26 10 -34 Q16 -14 6 0Z', '#5aa88a', { lc: '#3f7a66' })}${L('M0 -4 Q4 -20 9 -30', '#9fd3b4', 1.2)}</g>` + emblem('whomist', x - 2, y + 4, 1.1); break;
    case 'festival': s = `<g transform="translate(${x} ${y}) rotate(16)">${S('M-11 2 L0 -30 L11 2 Q0 6 -11 2Z', '#f0b84a', { lc: '#a8763a' })}${L('M-7 -8 L5 -12 M-9 -2 L8 -6 M-4 -18 L3 -20', '#e86a8a', 2.2)}${E(0, -31, 4.5, 4.5, '#e86a8a', { w: 1.2 })}</g>` + H.spark(x - 16, y - 12, 4, '#f6dc86'); break;
  }
  // 游戏里头像只有约 90px 宽，头饰放大 1.5 倍才看得清
  return HEAD_G + `<g transform="translate(${x} ${y}) scale(1.5) translate(${-x} ${-y})">${s}</g></g>`;
}

// ---------- 第 7 套：gala 星辉盛装（设计稿的“高阶套装”）----------
// 身体按 gen.cjs 里 draw(hi=1) 的样子：高阶配色 + 金色刺绣、肩披、流苏肩章、小旗、披风；
// 帽子件叠在头上：设计稿高阶版的羽毛 / 花环 / 金护目镜 / 串珠 + 一个小金星冠 + 几颗萤火光点。
// 限制：画框和锚点必须和基础部件一致（rig.json 不改），所以设计稿里超出画框的长披风、长旗杆都改短了；
// 没有披风部件的角色（剑士·女、魔法师·女）的后披风只画在腰以下，免得盖住后臂。
const GOLD = '#f0cf70', GOLD2 = '#e6be62';
const big = (x, y, str, k = 1.4) => `<g transform="translate(${x} ${y}) scale(${k}) translate(${-x} ${-y})">${str}</g>`;
const buckles = (pts) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${GOLD}" stroke="#a8763a" stroke-width="1"/>`).join('');
const studs = (pts) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.8" fill="${GOLD}" stroke="#b07a3e" stroke-width="1"/>`).join('');
// 胸前：金星胸针
const galaBrooch = (x, y) => H.spark(x, y, 8, GOLD) + `<circle cx="${x}" cy="${y}" r="2.6" fill="#e9826a" stroke="#a8503a" stroke-width=".8"/>`;
// 头顶小金星冠（头部局部坐标）
const starCrown = (x, y, k = 1) => big(x, y, S(`M${x - 14} ${y + 4} L${x - 16} ${y - 8} L${x - 7} ${y - 2} L${x} ${y - 14} L${x + 7} ${y - 2} L${x + 16} ${y - 8} L${x + 14} ${y + 4} Q${x} ${y + 7} ${x - 14} ${y + 4}Z`, GOLD, { lc: '#a8763a', w: 1.4 }) + `<circle cx="${x}" cy="${y - 1}" r="2.4" fill="#e9826a"/>` + H.spark(x, y - 18, 3.4, '#fff6c8'), k);
// 女孩用的小金冠（发冠），比星冠矮、贴着头顶
const tiara = (x, y, k = 1) => big(x, y, S(`M${x - 16} ${y + 3} Q${x - 10} ${y - 6} ${x - 5} ${y - 4} Q${x - 2} ${y - 12} ${x} ${y - 15} Q${x + 2} ${y - 12} ${x + 5} ${y - 4} Q${x + 10} ${y - 6} ${x + 16} ${y + 3} Q${x} ${y - 1} ${x - 16} ${y + 3}Z`, GOLD, { lc: '#a8763a', w: 1.3 }) + `<circle cx="${x}" cy="${y - 6}" r="2.6" fill="#f2a28e"/><circle cx="${x - 9}" cy="${y - 1}" r="1.5" fill="#fffaf0"/><circle cx="${x + 9}" cy="${y - 1}" r="1.5" fill="#fffaf0"/>`, k);
const galaFlies = (pts) => pts.map(([x, y, r]) => H.fly(x, y, r)).join('');
const GALA = {};
GALA.swm = () => {
  const P = { ...BASE_P.swm, main: '#d2604a', shade: '#b0744a', accent: '#c2564a' };
  const b = SPEC.swm(P);
  return {
    cape: S('M-24 -132 Q-54 -112 -64 -76 Q-70 -56 -80 -42 Q-66 -44 -58 -38 Q-48 -46 -38 -40 Q-28 -50 -14 -46 L22 -128Z', P.accent, { gap: [30, 6] })
      + H.stitch('M-76 -44 Q-66 -46 -58 -40 Q-48 -48 -38 -43 Q-28 -52 -15 -49', GOLD, 2.4) + H.zig(-62, -24, -60, GOLD, 2.5, 7),
    body: b.body + H.zig(-36, 36, -50, GOLD, 2.4, 6) + studs([[-14, -116], [-14, -98], [17, -114], [17, -96]])
      + S('M18 -138 Q38 -142 42 -124 Q32 -118 20 -122Z', '#b8784a', { w: 1.6 }) + `<circle cx="32" cy="-129" r="2.6" fill="${GOLD}"/>`
      + S('M-34 -134 Q-44 -116 -40 -102 Q-20 -96 0 -98 Q20 -96 40 -102 Q44 -116 34 -134 Q0 -144 -34 -134Z', '#f4e6c6', { lc: '#a8804a', gap: [70, 6] })
      + H.zig(-38, 40, -103, '#d9a84e', 2.2, 6) + galaBrooch(0, -122),
    legL: b.legL + S('M-26 -27 L-6 -27 L-6 -21 L-26 -21Z', GOLD, { w: 1.2, noshade: 1 }),
    legR: b.legR + S('M12 -27 L29 -27 L29 -21 L12 -21Z', GOLD, { w: 1.2, noshade: 1 }),
    arm: { ...b.arm, goldCuff: 1, epaulet: 1 },
    hat: S('M-62 -16 Q-80 -44 -74 -66 Q-66 -48 -58 -30Z', '#f4e6c6', { w: 1.4 }) + L('M-61 -20 Q-72 -40 -72 -62', '#c9a876', 1.2)
      + H.zig(-52, 54, -46, GOLD, 1.6, 6) + starCrown(10, -84, 1.5)
      + galaFlies([[-86, -70, .7], [84, -40, .6], [70, -118, .5]]),
  };
};
GALA.swf = () => {
  const P = { ...BASE_P.swf, main: '#d96e56', accent: GOLD };
  const b = SPEC.swf(P);
  let fl3 = ''; for (const x of [-12, 0, 12]) fl3 += `<circle cx="${x}" cy="-58" r="3.6" fill="#f2a28e"/><circle cx="${x}" cy="-58" r="1.5" fill="${GOLD}"/>`;
  const lowCape = S('M-34 -80 Q-50 -62 -56 -40 Q-44 -44 -38 -38 Q-26 -46 -14 -42 Q0 -48 14 -42 Q26 -46 38 -38 Q44 -44 56 -40 Q50 -62 34 -80Z', '#f4e0b0', { lc: '#a8804a' })
    + H.zig(-52, 52, -44, '#d96e56', 2, 6);
  return {
    body: lowCape + b.body + fl3 + H.zig(-20, 22, -48, GOLD2, 2, 6) + H.zig(-10, 12, -112, GOLD2, 2, 5)
      + H.zig(-38, 38, -45, GOLD2, 2, 7) + galaBrooch(0, -124),
    legL: b.legL + buckles([[-10, -11]]), legR: b.legR + buckles([[18, -11]]),
    arm: { ...b.arm, puff: '#fbeed4' },
    hat: big(16, -56, H.fl(-14, -58, '#fbf2de', .8) + H.fl(6, -60, '#f2a28e', .75) + H.fl(26, -56, '#fbf2de', .8) + H.fl(44, -44, '#c8e8dc', .7), 1.25)
      + S('M-40 -46 Q-60 -26 -70 -6 Q-62 -8 -58 -4 Q-50 -24 -36 -44Z', '#d96e56', { w: 1.4 }) + `<circle cx="-38" cy="-49" r="2.8" fill="${GOLD}"/>`
      + tiara(4, -82, 1.5) + H.spark(-20, -76, 5, '#fff2b8')
      + galaFlies([[-84, -64, .7], [80, -30, .6], [66, -112, .5]]),
  };
};
GALA.gnm = () => {
  const P = { ...BASE_P.gnm, main: '#78acd2', accent: '#e9a948' };
  const b = SPEC.gnm(P);
  return {
    cape: H.pennant(-70, -96, '#e86a50', 68, -32) + b.cape
      + S('M-8 -134 Q-38 -134 -64 -122 Q-76 -116 -86 -104 Q-72 -108 -64 -102 Q-44 -116 -10 -122Z', P.accent, { w: 1.6 })
      + L('M-30 -131 L-34 -118 M-50 -128 L-52 -115 M-68 -121 L-70 -110', '#f8eecc', 2.4),
    body: b.body + studs([[-17, -122], [-17, -106], [20, -122], [20, -106]]) + H.zig(-35, -14, -92, GOLD, 1.8, 5) + H.zig(16, 36, -92, GOLD, 1.8, 5)
      + galaBrooch(24, -112),
    legL: b.legL + buckles([[-14, -12]]), legR: b.legR + buckles([[20, -12]]),
    arm: { ...b.arm, epaulet: 1, goldCuff: 1 },
    hat: big(46, -62, S('M40 -66 Q66 -96 84 -92 Q70 -80 48 -58Z', '#f4e6c6', { w: 1.4 }) + L('M44 -62 Q64 -84 80 -90', '#c9a876', 1.2), 1.3)
      + `<circle cx="-12" cy="-56" r="12" fill="none" stroke="${GOLD}" stroke-width="4.6"/><circle cx="18" cy="-56" r="12" fill="none" stroke="${GOLD}" stroke-width="4.6"/>` + L('M0 -56 L6 -56', GOLD, 4)
      + starCrown(4, -90, 1.4)
      + galaFlies([[-88, -40, .7], [86, -10, .6], [-60, -110, .5]]),
  };
};
GALA.gnf = () => {
  const P = { ...BASE_P.gnf, main: '#7cb2d8' };
  const b = SPEC.gnf(P);
  return {
    cape: S('M-16 -112 Q-44 -132 -54 -110 Q-50 -96 -18 -102Z', '#f2a28e', { w: 1.5 }) + S('M-16 -106 Q-40 -86 -46 -66 Q-36 -70 -30 -64 Q-26 -84 -12 -100Z', '#f2a28e', { w: 1.5 }) + b.cape,
    body: b.body + H.zig(-40, 42, -54, GOLD, 2.4, 6) + `<circle cx="-12" cy="-64" r="3" fill="#f2a28e"/><circle cx="-4" cy="-60" r="2.4" fill="${GOLD}"/><circle cx="-18" cy="-58" r="2.4" fill="#fbf2de"/>`
      + S('M-2 -108 Q-14 -114 -20 -110 Q-12 -104 -2 -104Z M2 -108 Q14 -114 20 -110 Q12 -104 2 -104Z', GOLD, { lc: '#a8763a', w: 1.2 }) + `<circle cx="0" cy="-106" r="3" fill="#e86a50"/>`,
    legL: b.legL + buckles([[-12, -12]]), legR: b.legR + buckles([[18, -12]]),
    arm: { ...b.arm, puff: '#fdf0d6', goldCuff: 1 },
    hat: big(44, -62, S('M38 -64 Q48 -90 64 -88 Q56 -74 44 -60Z', '#f2a28e', { w: 1.3 }), 1.4)
      + big(-44, -16, H.fl(-48, -22, '#fbf2de', .9) + H.fl(-40, -8, '#f2a28e', .7), 1.3) + H.spark(-36, -50, 5, '#fff2b8')
      + `<g transform="rotate(-6 6 -64)"><circle cx="-8" cy="-64" r="11" fill="none" stroke="${GOLD}" stroke-width="4.4"/><circle cx="20" cy="-64" r="11" fill="none" stroke="${GOLD}" stroke-width="4.4"/></g>`
      + tiara(6, -88, 1.5)
      + galaFlies([[-92, -60, .7], [90, -30, .6], [64, -108, .5]]),
  };
};
GALA.mgm = () => {
  const P = { ...BASE_P.mgm, main: '#9a88c8' };
  const b = SPEC.mgm(P);
  let beads = ''; for (const x of [-60, -40, -20]) beads += L(`M${x} -32 L${x} -22`, '#c9a876', 1) + `<circle cx="${x}" cy="-20" r="3" fill="#f2a28e"/>`;
  return {
    cape: S('M-26 -136 Q-56 -110 -62 -70 Q-48 -76 -40 -68 Q-30 -84 -14 -80 L24 -134Z', '#72b8aa', { lc: '#4a8a7e' }) + H.zig(-58, -18, -74, GOLD, 2, 6) + b.cape,
    body: b.body + H.zig(-42, 44, -26, GOLD, 2.4, 6) + [[-28, -40], [26, -42], [-18, -78], [20, -80]].map(([x, y]) => H.spark(x, y, 4.5, GOLD)).join('')
      + [-118, -104, -90].map((y) => `<circle cx="4" cy="${y}" r="2.8" fill="${GOLD}" stroke="#a8763a" stroke-width="1"/>`).join('')
      + S('M-18 -136 Q-22 -100 -20 -60 L-10 -58 Q-10 -100 -6 -128Z', '#f6ead0', { lc: '#a8804a', w: 1.4 }) + S('M18 -136 Q24 -100 24 -60 L14 -58 Q12 -100 10 -128Z', '#f6ead0', { lc: '#a8804a', w: 1.4 })
      + H.spark(-15, -84, 4.5, GOLD2) + H.spark(19, -84, 4.5, GOLD2) + H.spark(-15, -104, 3.5, GOLD2) + H.spark(19, -104, 3.5, GOLD2)
      + L('M-20 -60 l1 6 M-14 -59 l0 6 M15 -59 l0 6 M21 -60 l1 6', GOLD2, 1.4),
    legL: b.legL + buckles([[-12, -10]]), legR: b.legR + buckles([[18, -10]]),
    arm: { ...b.arm, cuff: '#fbf0d6', goldCuff: 1 },
    hat: `<g transform="rotate(-5 0 -46)">${big(34, -50, S('M30 -52 Q56 -96 74 -98 Q66 -76 40 -44Z', '#f6ead0', { w: 1.4 }) + L('M34 -50 Q56 -84 72 -96', '#c9a876', 1.2), 1.3)}${beads}${H.zig(-40, 42, -44, GOLD, 1.6, 6)}${H.spark(2, -90, 10, GOLD)}<circle cx="2" cy="-90" r="2.4" fill="#e9826a"/>${H.spark(-14, -108, 4, '#fff2b8')}</g>`
      + H.spark(-40, -140, 6, '#fff2b8')
      + galaFlies([[-96, -60, .7], [96, -20, .6], [-70, -120, .5]]),
  };
};
GALA.mgf = () => {
  const P = { ...BASE_P.mgf, main: '#ad98d6', accent: '#7cc0b2' };
  const b = SPEC.mgf(P);
  const lowCape = S('M-36 -84 Q-54 -60 -62 -30 Q-46 -36 -36 -26 Q-20 -34 0 -28 Q20 -34 36 -26 Q46 -36 62 -30 Q54 -60 36 -84Z', '#cfeae2', { lc: '#6aa89a', gap: [30, 6] })
    + H.zig(-60, 60, -33, GOLD2, 2.4, 7);
  return {
    body: lowCape + b.body + H.zig(-44, 46, -38, GOLD, 2.4, 6) + [[-24, -52], [14, -60], [30, -44], [-6, -40]].map(([x, y]) => H.spark(x, y, 4.5, '#f6dc86')).join('')
      + H.zig(-34, 36, -104, GOLD, 2, 5) + galaBrooch(0, -124),
    legL: b.legL + buckles([[-10, -10]]), legR: b.legR + buckles([[16, -10]]),
    arm: { ...b.arm, goldCuff: 1 },
    hat: `<g transform="rotate(-4 0 -44)">${big(30, -56, H.fl(14, -58, '#f2a28e', .8) + H.fl(44, -60, '#c8e8dc', .8) + H.fl(30, -54, '#fbf2de'), 1.3)}${S('M-46 -48 Q-74 -30 -84 0 Q-74 -2 -70 4 Q-62 -24 -44 -42Z', '#f2a28e', { w: 1.3 })}${H.zig(-44, 44, -50, GOLD, 1.6, 6)}${H.spark(-20, -54, 7, GOLD)}${H.spark(-4, -52, 5, GOLD2)}</g>`
      + H.spark(-30, -100, 5, '#fff2b8')
      + galaFlies([[-100, -40, .7], [98, -30, .6], [-70, -96, .5]]),
  };
};

// ---------- 输出 ----------
function writeSvg(dir, name, inner, box, debug) {
  const [x0, y0, x1, y1] = box, vx = x0 - M, vy = y0 - M;
  const W = Math.ceil((x1 - x0 + 2 * M) * SC), Hh = Math.ceil((y1 - y0 + 2 * M) * SC);
  const dbg = debug ? `<rect x="${vx}" y="${vy}" width="${W / SC}" height="${Hh / SC}" fill="none" stroke="#0a0" stroke-width="1"/>` : '';
  const used = [...grads.entries()].filter(([id]) => inner.includes(`#${id})`)).map(([, v]) => v).join('');
  fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
  fs.writeFileSync(path.join(dir, name + '.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${r1(W / SC)} ${r1(Hh / SC)}" width="${W}" height="${Hh}"><defs>${BASEDEFS}${used}</defs>${dbg}<g filter="url(#paper)">${inner}</g></svg>\n`);
  return (p) => ({ px: r1((p[0] - vx) * SC), py: r1((p[1] - vy) * SC) });
}
const debug = process.argv.includes('--debug');
// --only=gala：只写 gala 装扮，基础部件和其它 6 套一个文件都不动
const ONLY = (process.argv.find((v) => v.startsWith('--only=')) || '').slice(7);
const BOX = {
  cape: [-104, -170, 30, -40],
  legL: [-36, -64, 8, 2], legR: [-6, -64, 46, 2],
  armL: [-50, -136, -10, -74], armR: [10, -136, 50, -74],
  body: [-56, -150, 56, -10],
  head: [-112, -330, 112, -84],
};
// 第 7 套 gala：和其它装扮同画框同锚点，帽子件用头部画框
function writeGala(k, dir) {
  const g = GALA[k](), base = SPEC[k](BASE_P[k]);
  const cd = 'costume/gala/';
  writeSvg(dir, cd + 'body', g.body, BOX.body, debug);
  writeSvg(dir, cd + 'armL', arm(-1, g.arm).s, BOX.armL, debug);
  writeSvg(dir, cd + 'armR', arm(1, g.arm).s, BOX.armR, debug);
  if (base.cape) writeSvg(dir, cd + 'cape', g.cape || base.cape, BOX.cape, debug);
  writeSvg(dir, cd + 'legL', g.legL, BOX.legL, debug);
  writeSvg(dir, cd + 'legR', g.legR, BOX.legR, debug);
  writeSvg(dir, cd + 'hat', HEAD_G + g.hat + '</g>', BOX.head, debug);
}
for (const k of Object.keys(SPEC)) {
  const sp = SPEC[k](BASE_P[k]);
  const dir = path.join(ROOT, sp.id);
  fs.mkdirSync(dir, { recursive: true });
  if (ONLY === 'gala') { writeGala(k, dir); console.log('ok gala', sp.id); continue; }
  const rig = [];
  const add = (id, inner, pivot, z, extra = {}) => {
    const at = writeSvg(dir, id, inner, BOX[id], debug);
    rig.push({ id, file: id + '.svg', x: r1(pivot[0] * SC), y: r1(pivot[1] * SC), ...at(pivot), z, ...extra });
  };
  const aL = arm(-1, sp.arm), aR = arm(1, sp.arm);
  if (sp.cape) add('cape', sp.cape, [-10, -128], -1);
  add('legL', sp.legL, [-sp.hip[0], sp.hip[1]], 0);
  add('legR', sp.legR, [sp.hip[0], sp.hip[1]], 1);
  add('armL', aL.s, aL.pivot, 2);
  add('body', sp.body, [0, -56], 3);
  const HP = [2, -140]; // 头的枢轴在下巴（脖子归 body）
  add('head', headOf(k, 'normal'), HP, 4);
  for (const ex of ['happy', 'surprised', 'sad']) writeSvg(dir, 'head_' + ex, headOf(k, ex), BOX.head, debug);
  add('armR', aR.s, aR.pivot, 6);
  // 武器挂点 = 右手心相对右肩；z 比 armR 小 → 手盖住握把
  fs.writeFileSync(path.join(dir, 'weapon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" width="1" height="1"></svg>\n');
  rig.push({ id: 'weapon', file: 'weapon.svg', x: r1((aR.hand[0] - aR.pivot[0]) * SC), y: r1((aR.hand[1] - aR.pivot[1]) * SC), px: 0, py: 0, z: 5, parent: 'armR', rot: 65 });
  rig.sort((a, b) => a.z - b.z);
  const faces = { normal: 'head.svg', happy: 'head_happy.svg', surprised: 'head_surprised.svg', sad: 'head_sad.svg' };
  fs.writeFileSync(path.join(dir, 'rig.json'), `{\n  "height": ${Math.round(-sp.top * SC)},\n  "parts": [\n${rig.map((p) => '    ' + JSON.stringify(p)).join(',\n')}\n  ],\n  "faces": ${JSON.stringify(faces)}\n}\n`);
  // 装扮：同画框、同锚点，游戏里直接换贴图
  for (const set of Object.keys(SETS)) {
    const c = SPEC[k](setPalette(k, set));
    const a2L = arm(-1, c.arm), a2R = arm(1, c.arm);
    const cd = `costume/${set}/`;
    writeSvg(dir, cd + 'body', c.body + emblem(set, ...BADGE[k], .8), BOX.body, debug);
    writeSvg(dir, cd + 'armL', a2L.s, BOX.armL, debug);
    writeSvg(dir, cd + 'armR', a2R.s, BOX.armR, debug);
    if (c.cape) writeSvg(dir, cd + 'cape', c.cape, BOX.cape, debug);
    writeSvg(dir, cd + 'legL', c.legL, BOX.legL, debug);
    writeSvg(dir, cd + 'legR', c.legR, BOX.legR, debug);
    writeSvg(dir, cd + 'hat', hatAccessory(set, k), BOX.head, debug);
  }
  writeGala(k, dir);
  console.log('ok', sp.id);
}
