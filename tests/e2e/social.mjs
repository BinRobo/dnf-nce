// 多人在线端到端：两台“平板”在同一个街区互相看到、走动同步、发短句、在线名单、换街区、家长关闭多人功能
// 需要：后端 http://127.0.0.1:5180（ADMIN_PASSWORD=test-admin-123，空数据目录）+ 开发服务器 http://localhost:5199
import { chromium } from 'playwright';
const B = 'http://localhost:5199/?realtime';
const out = process.argv[2] ?? '.cache/social';
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

const A = await tablet('kida', '小明', { cls: 'sword', level: 5 });
check('A 进了城镇并启用多人', await A.evaluate(() => __phaser.scene.getScene('Town').social.active));
check('一个人时看不到别人', (await sees(A)).length === 0);
const Bt = await tablet('kidb', '小红', { cls: 'mage', gender: 'f', level: 7, worn: { hat: 'school', top: 'school' } });
const aSeesB = await until(A, async () => { const l = await sees(A); return l.length === 1 && l[0].hero ? l : null; });
check('A 看到了 B（带形象）', !!aSeesB && aSeesB[0].name === '小红', JSON.stringify(aSeesB));
const bSeesA = await until(Bt, async () => { const l = await sees(Bt); return l.length === 1 && l[0].hero ? l : null; });
check('B 看到了 A', !!bSeesA && bSeesA[0].name === '小明');
await A.waitForTimeout(800);
await A.screenshot({ path: `${out}/s1-A-sees-B.png` });

// B 往右走，A 这边看到 B 的位置在变
const x0 = (await sees(A))[0].tx;
await Bt.evaluate(() => { __phaser.scene.getScene('Town').touchDir = 1; });
await Bt.waitForTimeout(1600);
await Bt.evaluate(() => { __phaser.scene.getScene('Town').touchDir = 0; });
await Bt.waitForTimeout(600);
const x1 = (await sees(A))[0].tx;
check('B 走动，A 看到 B 的位置跟着变', x1 > x0 + 150, `${x0} → ${x1}`);

// B 发短句，A 头顶看到气泡
await Bt.mouse.click(1190, 118);
await Bt.waitForTimeout(600);
await Bt.screenshot({ path: `${out}/s2-B-phrase-picker.png` });
await Bt.mouse.click(425, 132);
const bubble = await until(A, () => A.evaluate(() => __phaser.scene.getScene('Town').world.list.some((c) => c.list?.some?.((t) => typeof t.text === 'string' && t.text.includes('Excuse me')))), 8000);
check('A 看到 B 说的 “Excuse me!”', !!bubble);
await A.screenshot({ path: `${out}/s3-A-sees-phrase.png` });

// 在线名单
await A.mouse.click(1190, 164);
await A.waitForTimeout(900);
await A.screenshot({ path: `${out}/s4-online-list.png` });
const count = await A.evaluate(() => __phaser.scene.getScene('Town').social.count);
check('在线人数是 2', count === 2, `count=${count}`);
await A.keyboard.press('Escape');
await A.evaluate(() => { for (const o of __phaser.scene.getScene('Town').children.list.filter((c) => c.depth === 500)) o.destroy(); });

// A 去另一个街区：B 看不到 A 了；B 也过去后又能看到
await A.evaluate(() => __phaser.scene.getScene('Town').travel('market', 300));
check('A 离开后 B 看不到 A', !!(await until(Bt, async () => (await sees(Bt)).length === 0, 8000)));
await until(A, async () => (await sees(A)) !== null && (await A.evaluate(() => __phaser.scene.getScene('Town').scene.isActive() && __game.save.town.district === 'market')), 15000);
check('A 在集市区是一个人', (await sees(A))?.length === 0);
await Bt.evaluate(() => __phaser.scene.getScene('Town').travel('market', 340));
const together = await until(A, async () => { const l = await sees(A); return l?.length === 1 && l[0].hero ? l : null; }, 20000);
check('B 也到集市区后两人又能互相看到', !!together);

// 家长在后台关闭 B 的多人功能：B 立刻下线，A 看不到 B，B 提示
const ov = await (await api('/api/admin/overview', { cookie: adminCookie })).json();
const kidB = ov.users.find((u) => u.username === 'kidb');
check('后台看到 B 在线（集市区）', kidB.online?.district === 'market' && kidB.online?.name === '小红', JSON.stringify(kidB.online));
await api(`/api/admin/users/${kidB.id}/social`, { method: 'POST', body: { enabled: false }, cookie: adminCookie });
check('关闭多人功能后 A 看不到 B', !!(await until(A, async () => (await sees(A)).length === 0, 8000)));
await Bt.waitForTimeout(800);
await Bt.screenshot({ path: `${out}/s5-B-blocked.png` });
await Bt.waitForTimeout(4000);                       // 超过第一次重连的等待时间
check('B 被关闭后没有再重连、多人功能被禁用', await Bt.evaluate(() => __net.connected === false && __net.enabled === false));
check('后台里 B 不在线', (await (await api('/api/admin/overview', { cookie: adminCookie })).json()).users.find((u) => u.username === 'kidb').online === null);

check('页面没有报错', errors.length === 0, errors.slice(0, 4).join(' | '));
await b.close();
const bad = results.filter((r) => !r).length;
console.log(bad ? `\n${bad} 项失败` : '\n全部通过');
process.exit(bad ? 1 : 0);
