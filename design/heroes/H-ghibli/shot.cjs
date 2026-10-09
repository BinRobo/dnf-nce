// node shot.cjs [x,y,w,h] → preview.png, faces.png (2x)；可选裁切 sheet 到 scratch/crop.png
const { chromium } = require('/home/ubuntu/dnf/node_modules/playwright');
const fs = require('fs');
const D = __dirname + '/';
const S = '/tmp/claude-1000/-home-ubuntu-dnf/10a81ac1-7c35-4833-9f84-cba77dfe86e1/scratchpad/h/';
fs.mkdirSync(S, { recursive: true });
(async () => {
  const b = await chromium.launch();
  for (const [f, out] of [['sheet.svg', 'preview.png'], ['faces.svg', 'faces.png']]) {
    const m = fs.readFileSync(D + f, 'utf8').match(/width="(\d+)" height="(\d+)"/);
    const w = +m[1], h = +m[2];
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await p.goto('file://' + D + f);
    await p.screenshot({ path: D + out });
    const crop = process.argv[2];
    if (crop && f === 'sheet.svg') { const [x, y, cw, ch] = crop.split(',').map(Number); await p.screenshot({ path: S + 'crop.png', clip: { x, y, width: cw, height: ch } }); }
    if (f === 'faces.svg') await p.screenshot({ path: S + 'strip.png', clip: { x: 0, y: h - 520, width: w, height: 520 }, scale: 'css' });
    await p.close();
  }
  await b.close();
})();
