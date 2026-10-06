// 垂直切片冒烟测试：新建角色 → 序章 → 城镇 → L1-2 副本（自动作答，中途截图）→ 结算
import { chromium } from 'playwright';
const OUT = process.argv[2] ?? '.cache/slice';
const LESSON = process.argv[3] ?? 'L001-002';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(0, 6).join(' | ')));
p.on('console', (m) => m.type() === 'error' && !/404|Failed to load resource/.test(m.text()) && errors.push(m.text()));
p.on('dialog', (d) => d.accept('小明'));
await p.goto('http://localhost:5199/?realtime');
await p.waitForFunction(() => window.__phaser?.scene.isActive('Profile'), null, { timeout: 30000 });
await p.waitForTimeout(500);
await p.mouse.click(640, 340);
await p.waitForFunction(() => __phaser.scene.isActive('Create'), null, { timeout: 10000 });
await p.waitForTimeout(600);
if (process.env.CLS) { const xs = { sword: 230, gunner: 640, mage: 1050 }; await p.mouse.click(xs[process.env.CLS] + (process.env.GENDER === 'f' ? 85 : -85), 330); await p.waitForTimeout(300); }
await p.mouse.click(640, 662);
await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/01-prologue.png` });
for (let i = 0; i < 4; i++) { await p.keyboard.press('Space'); await p.waitForTimeout(700); }
await p.screenshot({ path: `${OUT}/02-prologue-b.png` });
await p.keyboard.press('Escape');
await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/03-town.png` });
// 进入副本：直接调场景
if (process.env.LEVEL) await p.evaluate((lv) => (window.__testLevel = lv), Number(process.env.LEVEL));
await p.evaluate(async (id) => {
  const { buildBattle } = await import('/src/battle/plan.ts');
  const g = window.__game;
  g.save.settings.grade = 'high';
  if (window.__testLevel) {
    g.save.level = window.__testLevel;
    g.save.skills = { ranks: { slash: 1, rising: 2, whirl: 2, wave: 2, frost: 1 }, bar: ['rising', 'whirl', 'wave', 'frost'] };
  }
  window.__phaser.scene.getScene('Town').scene.start('Battle', { plan: buildBattle(g.index.lesson(id), g.save, g.index) });
}, LESSON);
await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/04-intro.png` });
if (process.env.GAUGE) await p.evaluate(() => { const sc = __phaser.scene.getScene('Battle'); sc.ctl.gauge = 95; });
const S = `__phaser.scene.getScene('Battle')`;
let shots = 0, missDone = false, n = 0, bossShots = 0;
for (let step = 0; step < 900; step++) {
  if (!(await p.evaluate(() => __phaser.scene.isActive('Battle')))) break;
  // 剧情 / 视频 / 出口按钮
  const skip = p.locator('button', { hasText: '跳过' });
  if (await skip.count()) { await skip.click(); await p.waitForTimeout(400); continue; }
  const st = await p.evaluate((s) => {
    const sc = eval(s);
    const story = sc.children.list.some((o) => o.depth === 200);
    const exits = sc.children.list.filter((o) => o.depth === 92).flatMap((c) => c.list ?? []).map((b) => ({ x: b.x, y: b.y, t: b.label?.text }));
    const q = sc.quiz.box && !sc.quiz.locked ? sc.ctl.current?.question : null;
    const explain = sc.quiz.box && sc.quiz.box.depth === 75;
    return { story, exits, explain, q: q && { kind: q.kind, answer: q.answer, word: q.word, n: q.options?.length, mode: q.mode }, room: sc.ctl.room.type };
  }, S);
  if (st.story) { await p.keyboard.press('Escape'); await p.waitForTimeout(300); continue; }
  if (st.explain) { await p.screenshot({ path: `${OUT}/06-explain.png` }); await p.keyboard.press('Enter'); await p.waitForTimeout(300); continue; }
  if (st.exits.length) { await p.mouse.click(st.exits[0].x, st.exits[0].y); await p.waitForTimeout(900); continue; }
  if (!st.q) { await p.waitForTimeout(120); continue; }
  n++;
  for (const k of ['q', 'w', 'e', 'r']) await p.keyboard.press(k);
  if (st.room === 'boss' && bossShots < 3) { await p.screenshot({ path: `${OUT}/08-boss-q${bossShots}.png` }); }
  if (n === 2) await p.screenshot({ path: `${OUT}/05-question-${st.q.kind}.png` });
  if (st.q.kind === 'pick') {
    const k = !missDone ? ((st.q.answer + 1) % st.q.n) : st.q.answer;
    missDone = true;
    await p.keyboard.press(String(k + 1));
  } else if (st.q.kind === 'spell') {
    for (const ch of st.q.word) { await p.keyboard.press(ch); await p.waitForTimeout(90); }
  } else {
    const pts = await p.evaluate((s) => {
      const sc = eval(s);
      const q = sc.ctl.current.question;
      const used = new Set();
      const btns = sc.quiz.box.list.filter((o) => o.bg && Math.abs(o.y - (470 + 178)) < 5);
      return q.answer.map((w) => { const i = btns.findIndex((b, i) => b.label.text === w && !used.has(i)); used.add(i); return [btns[i].x, btns[i].y]; });
    }, S);
    for (const [x, y] of pts) { await p.mouse.click(x, y); await p.waitForTimeout(80); }
  }
  // 演出中截图
  if (st.room === 'boss' && bossShots < 3) { await p.waitForTimeout(900); await p.screenshot({ path: `${OUT}/08-boss-hit${bossShots++}.png` }); }
  else if (shots < 8 && n % 2 === 1) { await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/07-combat-${shots++}.png` }); }
  await p.waitForTimeout(150);
}
await p.waitForTimeout(3500);
await p.screenshot({ path: `${OUT}/09-result.png` });
console.log('questions answered', n, 'scene', await p.evaluate(() => __phaser.scene.getScenes(true).map((s) => s.scene.key)));
console.log(JSON.stringify(await p.evaluate(() => ({ lvl: __game.save.level, partners: __game.save.partners, seen: __game.save.story.seen, d: __game.save.dungeons }))));
console.log('ERRORS', JSON.stringify(errors.slice(0, 10)));
await b.close();
