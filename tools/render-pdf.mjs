// 把扫描版课本 PDF 渲染成图片：node tools/render-pdf.mjs <from> <to> [scale]
// 依赖：.cache/render.html + pdf.js（见 tools/README），在无头 Chromium 中渲染（CCITT 传真编码）
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';

const [from = '1', to = '9999', scale = '1.4'] = process.argv.slice(2);
const root = '.cache';
mkdirSync(join(root, 'pages'), { recursive: true });
const server = createServer((req, res) => {
  const f = join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!existsSync(f)) return res.writeHead(404).end();
  const type = { '.mjs': 'text/javascript', '.html': 'text/html', '.pdf': 'application/pdf' }[extname(f)] ?? 'application/octet-stream';
  res.writeHead(200, { 'content-type': type }).end(readFileSync(f));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const b = await chromium.launch();
const p = await b.newPage();
await p.goto(`http://127.0.0.1:${server.address().port}/render.html`);
await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
const n = await p.evaluate(() => window.ready);
for (let i = +from; i <= Math.min(+to, n); i++) {
  const out = join(root, 'pages', `p${String(i).padStart(3, '0')}.png`);
  if (existsSync(out)) continue;
  const url = await p.evaluate(([i, s]) => window.renderPage(i, s), [i, +scale]);
  writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  process.stdout.write(`${i} `);
}
console.log('\npages', n);
await b.close();
server.close();
