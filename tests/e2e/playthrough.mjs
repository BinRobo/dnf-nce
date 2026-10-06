// 端到端冒烟测试：新建角色 → 打通第一个副本 → 背包 → 刷新确认存档
// 用法：先 npx vite --port 5199，再 node tests/e2e/playthrough.mjs [截图目录]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? '.cache/e2e';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
page.on('dialog', (d) => d.accept('小明'));
await page.goto('http://localhost:5199/');
await page.waitForTimeout(1500);
await page.mouse.click(640, 340); // 新建角色
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/town.png` });
await page.mouse.click(740 + 132, 140); // 第一个副本
await page.waitForTimeout(1500);

const sceneExpr = `__phaser.scene.getScene('Dungeon')`;
let shots = 0, wrongDone = false, videoSeen = false;
for (let step = 0; step < 500; step++) {
  if (!(await page.evaluate(() => __phaser.scene.isActive('Dungeon')))) break;
  // 课文动画浮层：截图后跳过
  const skip = page.locator('button', { hasText: '跳过' });
  if (await skip.count()) {
    if (!videoSeen) await page.screenshot({ path: `${OUT}/video.png` });
    videoSeen = true;
    await skip.click();
    await page.waitForTimeout(500);
    continue;
  }
  const info = await page.evaluate((s) => {
    const sc = eval(s);
    if (sc.busy || !sc.qBox || !sc.mobs.length) return null;
    const q = sc.mobs[0].q;
    return { kind: q.kind, answer: q.answer, word: q.word, opts: q.options, room: sc.roomIdx };
  }, sceneExpr);
  if (!info) { await page.waitForTimeout(200); continue; }
  if (shots < 8) await page.screenshot({ path: `${OUT}/q${shots++}-r${info.room}-${info.kind}.png` });
  if (info.kind === 'pick') {
    const k = !wrongDone ? (info.answer + 1) % info.opts.length : info.answer;
    wrongDone = true;
    await page.keyboard.press(String(k + 1));
  } else if (info.kind === 'spell') {
    await page.keyboard.type(info.word, { delay: 50 });
  } else {
    const pts = await page.evaluate((s) => {
      const sc = eval(s);
      const q = sc.mobs[0].q;
      const used = new Set();
      const btns = sc.qBox.list.filter((o) => o.bg && o.y > 600);
      return q.answer.map((w) => {
        const i = btns.findIndex((b, i) => b.label.text === w && !used.has(i));
        used.add(i);
        return [btns[i].x, btns[i].y];
      });
    }, sceneExpr);
    for (const [x, y] of pts) { await page.mouse.click(x, y); await page.waitForTimeout(60); }
  }
  await page.waitForTimeout(350);
}
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/result.png` });
const save = await page.evaluate(() => {
  const s = __game.save;
  return { level: s.level, inv: s.inventory.length, dungeons: s.dungeons, srs: Object.keys(s.srs).length };
});
console.log('video overlay shown:', videoSeen);
console.log(JSON.stringify(save));
await page.mouse.click(640 - 160, 650); // 回城
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/town-after.png` });
await page.reload();
await page.waitForTimeout(1500);
const kept = await page.evaluate(async () => (await new Promise((r) => {
  const req = indexedDB.open('nce-dungeon');
  req.onsuccess = () => req.result.transaction('profiles').objectStore('profiles').getAll().onsuccess = (e) => r(e.target.result.length);
})));
console.log('profiles after reload:', kept);
console.log('ERRORS', JSON.stringify(errors));
await browser.close();
