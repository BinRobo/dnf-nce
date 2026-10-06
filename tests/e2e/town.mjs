// 城镇冒烟测试：街区切换、室内、城镇地图、史诗工坊、史诗武器 + Boss 专属招式
import { chromium } from 'playwright';
const OUT = process.argv[2] ?? '.cache/town';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(0, 4).join(' | ')));
p.on('console', (m) => m.type() === 'error' && !/404|Failed to load resource/.test(m.text()) && errors.push(m.text()));
p.on('dialog', (d) => d.accept('小明'));
await p.goto('http://localhost:5199/?realtime');
await p.waitForFunction(() => window.__phaser?.scene.isActive('Profile'), null, { timeout: 30000 });
await p.waitForTimeout(800);
await p.mouse.click(640, 340);
await p.waitForFunction(() => __phaser.scene.isActive('Create'), null, { timeout: 10000 });
await p.waitForTimeout(600);
if (process.env.CLS) { const xs = { sword: 230, gunner: 640, mage: 1050 }; await p.mouse.click(xs[process.env.CLS] + (process.env.GENDER === 'f' ? 85 : -85), 330); await p.waitForTimeout(300); }
await p.mouse.click(640, 662);
await p.waitForFunction(() => window.__game.save && __phaser.scene.isActive('Town'), null, { timeout: 30000 });
await p.waitForTimeout(500);
// 跳过序章，造一个通关了两课、攒满碎片的存档
await p.evaluate(() => {
  const s = window.__game.save;
  s.story.seen.push('prologue', 'quest_L001_give', 'quest_L001_done', 'quest_L005_done');
  for (const id of ['L001-002', 'L005-006']) s.dungeons[id] = { clears: 1, bestRank: 'S', bestScore: 1, firstClearAt: 1 };
  s.mats.shard = 12; s.mats.soul = 3; s.gold = 2000; s.level = 6;
  s.town.district = 'campus';
  __phaser.scene.getScene('Town').scene.restart();
});
const shot = async (name, ms = 1200) => { await p.waitForTimeout(ms); await p.screenshot({ path: `${OUT}/${name}.png` }); };
await shot('t1-campus');
await p.evaluate(() => { const sc = __phaser.scene.getScene('Town'); sc.hero.x = 1700; });
await shot('t2-campus-training', 800);
// 走到路牌 → 集市区
await p.evaluate(() => { const sc = __phaser.scene.getScene('Town'); sc.hero.x = 2480; });
await p.waitForTimeout(300);
await p.keyboard.press('Space');
await shot('t3-market', 1500);
console.log('district', await p.evaluate(() => __game.save.town.district));
// 铁匠
await p.evaluate(() => { const sc = __phaser.scene.getScene('Town'); sc.hero.x = 1000; });
await p.waitForTimeout(300);
await p.keyboard.press('Space');
await shot('t4-craft', 1200);
await p.mouse.click(640 - 450 + 150 + 300 + 0, 360 - 260 + 270 + 150); // 中间那把（金号角锤）的“打造”
await shot('t5-crafted', 900);
console.log('crafted', await p.evaluate(() => __game.save.crafted), 'shard', await p.evaluate(() => __game.save.mats.shard));
// 进商店
await p.evaluate(() => { const sc = __phaser.scene.getScene('Town'); sc.hero.x = 420; });
await p.waitForTimeout(400);
await p.keyboard.press('Space');
await shot('t6-shop', 1500);
// 城镇地图
await p.evaluate(() => __phaser.scene.getScene('Town').worldMap());
await shot('t7-worldmap', 800);
// 装备打造出的史诗武器，进 L5-6 Boss 房，故意答错看 Boss 招式
await p.evaluate(async () => {
  const s = __game.save;
  const it = s.inventory.find((i) => i.rarity === 'epic');
  if (it) s.equipped.weapon = it.uid;
  const { buildBattle } = await import('/src/battle/plan.ts');
  const plan = buildBattle(__game.index.lesson('L005-006'), s, __game.index);
  plan.rooms = plan.rooms.filter((r) => r.type === 'boss').map((r) => ({ ...r, cell: [0, 0] }));
  __phaser.scene.getScene('Town').scene.start('Battle', { plan });
});
await shot('t8-battle', 2500);
for (let i = 0; i < 40; i++) {
  if (!(await p.evaluate(() => __phaser.scene.isActive('Battle')))) break;
  const skip = p.locator('button', { hasText: '跳过' });
  if (await skip.count()) { await skip.click(); await p.waitForTimeout(400); continue; }
  const st = await p.evaluate(() => {
    const sc = __phaser.scene.getScene('Battle');
    const q = sc.quiz.box && !sc.quiz.locked ? sc.ctl.current?.question : null;
    return { story: sc.children.list.some((o) => o.depth === 200), explain: sc.quiz.box && sc.quiz.box.depth === 75, q: q && { kind: q.kind, answer: q.answer, n: q.options?.length } };
  });
  if (st.story) { await p.keyboard.press('Escape'); await p.waitForTimeout(300); continue; }
  if (st.explain) { await p.keyboard.press('Enter'); await p.waitForTimeout(300); continue; }
  if (!st.q) { await p.waitForTimeout(150); continue; }
  if (st.q.kind !== 'pick') { await p.evaluate(() => __phaser.scene.getScene('Battle').scene.stop()); break; }
  const wrong = i < 6;
  await p.keyboard.press(String(1 + (wrong ? (st.q.answer + 1) % st.q.n : st.q.answer)));
  await p.waitForTimeout(wrong ? 900 : 700);
  await p.screenshot({ path: `${OUT}/t9-boss-${i}.png` });
}
console.log('ERRORS', errors.length ? errors : 'none');
await b.close();
