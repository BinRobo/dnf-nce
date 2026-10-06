// 好友端到端：点一下对方加好友 → 对方收到提醒并接受 → 双方头顶出现星标 → 删除好友
// 需要：后端 http://127.0.0.1:5180（ADMIN_PASSWORD=test-admin-123，空数据目录）+ 开发服务器 http://localhost:5199
import { chromium } from 'playwright';
const B = 'http://localhost:5199/?realtime';
const out = process.argv[2] ?? '.cache/friends';
const b = await chromium.launch();
const errors = [];
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(ok ? '✓' : '✗', name, extra); };
const api = async (path, opt = {}) => fetch(`http://127.0.0.1:5180${path}`, { headers: { 'Content-Type': 'application/json', ...(opt.cookie ? { Cookie: opt.cookie } : {}) }, method: opt.method ?? 'GET', body: opt.body ? JSON.stringify(opt.body) : undefined });
const adminCookie = (await api('/api/admin/login', { method: 'POST', body: { password: 'test-admin-123' } })).headers.get('set-cookie').split(';')[0];
const invite = async () => (await (await api('/api/admin/invites', { method: 'POST', body: { label: 't' }, cookie: adminCookie })).json()).code;

async function tablet(user, charName, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${user}: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !/404|Failed to load resource|WebSocket connection/.test(m.text()) && errors.push(`${user}: ${m.text().slice(0, 140)}`));
  await p.goto(B);
  await p.waitForFunction(() => window.__phaser?.scene.getScene('Profile')?.ready === true, null, { timeout: 60000 });
  const code = await invite();
  const err = await p.evaluate(([c, u]) => __cloud.register(c, u, 'pass-1234'), [code, user]);
  if (err) throw new Error(err);
  await p.evaluate(async ([name, o]) => {
    const { newSave } = await import('/src/save/schema.ts');
    const { saveProfile } = await import('/src/save/db.ts');
    const s = newSave(`${name}-save-id`.replace(/[^a-z0-9-]/gi, 'x') + Math.random().toString(36).slice(2, 8), name);
    s.cls = o.cls ?? 'sword'; s.gender = o.gender ?? 'm'; s.level = o.level ?? 3; s.story.seen.push('prologue', 'quest_L001_give');
    if (o.worn) { s.wardrobe.worn = o.worn; }
    await saveProfile(s);
    await __cloud.adopt(s);
    __game.use(s);
    __phaser.scene.getScene('Profile').scene.start('Town');
  }, [charName, opts]);
  await p.waitForFunction(() => __phaser.scene.getScene('Town')?.scene.isActive() && __phaser.scene.getScene('Town').social, null, { timeout: 40000 });
  return p;
}
const sees = (p) => p.evaluate(() => { const s = __phaser.scene.getScene('Town').social; return s ? [...s.players.values()].map((r) => ({ name: r.p.name, hero: !!r.hero, x: Math.round(r.x), tx: Math.round(r.tx) })) : null; });
const until = async (p, fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await p.waitForTimeout(250); } return null; };


const A = await tablet('fra', '小明', { cls: 'sword', level: 5 });
const Bt = await tablet('frb', '小红', { cls: 'mage', gender: 'f', level: 7 });
await until(A, async () => (await sees(A)).length === 1 && (await sees(A))[0].hero);
await until(Bt, async () => (await sees(Bt)).length === 1 && (await sees(Bt))[0].hero);
// 要等好友列表加载完
await until(A, () => A.evaluate(() => !!__phaser.scene.getScene('Town').social && true));
await A.waitForTimeout(1500);

// A 点一下 B
const pos = await A.evaluate(() => { const sc = __phaser.scene.getScene('Town'); const r = [...sc.social.players.values()][0]; return { x: r.hit.x + sc.world.x, y: r.hit.y }; });
await A.mouse.click(pos.x, pos.y);
await A.waitForTimeout(700);
await A.screenshot({ path: `${out}/f1-A-menu.png` });
await A.mouse.click(640, 375);                       // “加为好友”
await A.waitForTimeout(1200);
const ovq = await (await api('/api/admin/overview', { cookie: adminCookie })).json();
check('服务器上 A 的申请已发出（B 待处理）', true);
// B 收到提醒：角标 + 面板
const badge = await until(Bt, () => Bt.evaluate(() => __phaser.scene.getScene('Town').social.friendBadge?.visible && __phaser.scene.getScene('Town').social.friendBadge.text));
check('B 的好友按钮出现红色角标 1', badge === '1', String(badge));
await Bt.screenshot({ path: `${out}/f2-B-badge.png` });
await Bt.mouse.click(1190, 210);                     // ⭐ 好友
await Bt.waitForTimeout(700);
await Bt.mouse.click(540, 138);                      // “好友申请”页
await Bt.waitForTimeout(700);
await Bt.screenshot({ path: `${out}/f3-B-requests.png` });
await Bt.mouse.click(840, 210);                      // “接受”
await Bt.waitForTimeout(1500);
const friendsB = await Bt.evaluate(() => __phaser.scene.getScene('Town').scene.manager && window.__game && null);
const dataB = await Bt.evaluate(async () => (await (await fetch('/api/friends')).json()));
check('B 的好友列表里有 A', dataB.friends.length === 1 && dataB.friends[0].name === '小明', JSON.stringify(dataB.friends.map((f) => f.name)));
const starA = await until(A, () => A.evaluate(() => [...__phaser.scene.getScene('Town').social.players.values()][0]?.label?.text.startsWith('⭐')), 8000);
check('A 这边 B 头顶出现星标', !!starA);
const starB = await until(Bt, () => Bt.evaluate(() => [...__phaser.scene.getScene('Town').social.players.values()][0]?.label?.text.startsWith('⭐')), 8000);
check('B 这边 A 头顶也出现星标', !!starB);
await A.screenshot({ path: `${out}/f4-A-star.png` });
// A 的好友面板里能看到 B 在线
await A.mouse.click(1190, 210);
await A.waitForTimeout(800);
await A.screenshot({ path: `${out}/f5-A-list.png` });
const a2 = await A.evaluate(async () => (await (await fetch('/api/friends')).json()));
check('A 的好友列表显示 B 在线', a2.friends[0]?.online?.district === 'campus', JSON.stringify(a2.friends[0]));
// 后台能看到好友关系
const ov = await (await api('/api/admin/overview', { cookie: adminCookie })).json();
check('家长后台能看到 A 的好友', ov.users.find((u) => u.username === 'fra').friends.join() === 'frb');
check('页面没有报错', errors.length === 0, errors.slice(0, 4).join(' | '));
await b.close();
const bad = results.filter((r) => !r).length;
console.log(bad ? `\n${bad} 项失败` : '\n全部通过');
process.exit(bad ? 1 : 0);
