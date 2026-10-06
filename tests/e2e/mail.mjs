// 赠送端到端：好友之间送装备和材料 → 对方收到提醒、在信箱里收下 → 东西到了对方存档、从我这边扣掉
// 需要：后端 http://127.0.0.1:5180（ADMIN_PASSWORD=test-admin-123，空数据目录）+ 开发服务器 http://localhost:5199
import { chromium } from 'playwright';
const B = 'http://localhost:5199/?realtime';
const out = process.argv[2] ?? '.cache/mail';
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



const A = await tablet('mla', '送礼的', { cls: 'sword', level: 5 });
const Bt = await tablet('mlb', '收礼的', { cls: 'mage', gender: 'f', level: 7 });
await until(A, async () => (await sees(A)).length === 1 && (await sees(A))[0].hero);
// A 的背包：一件“雨伞剑” + 5 个强化石
await A.evaluate(async () => {
  const { makeItem } = await import('/src/systems/items.ts');
  const it = makeItem('rare', 5, '测试', 'weapon', 1); it.name = '雨伞剑'; it.uid = 'gift-item-1'; it.enhance = 2;
  __game.save.inventory.push(it); __game.save.stones = 5; await __game.persist();
});
// 先成为好友（用接口，省去重复点界面；界面流程在 friends.mjs 里测过）
const codeB = await Bt.evaluate(async () => (await (await fetch('/api/friends')).json()).code);
const idB = await Bt.evaluate(async () => (await (await fetch('/api/me')).json()).user.id);
await A.evaluate(async (c) => fetch('/api/friends/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: c }) }), codeB);
const idA = await A.evaluate(async () => (await (await fetch('/api/me')).json()).user.id);
await Bt.evaluate(async (id) => fetch('/api/friends/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }), idA);
await A.evaluate(() => 0);
await A.waitForTimeout(1500);

// A：⭐ 好友 → 🎁 送礼物 → 选雨伞剑 → 送出
await A.mouse.click(1190, 210);
await A.waitForTimeout(1500);
await A.screenshot({ path: `${out}/m1-A-friends.png` });
await A.mouse.click(550, 204);                       // 第一位好友的“送礼物”
await A.waitForTimeout(2500);                        // 要先下载装备图标
await A.screenshot({ path: `${out}/m2-A-gift-picker.png` });
await A.mouse.click(280, 240);                       // 第一件装备
await A.waitForTimeout(900);
await A.screenshot({ path: `${out}/m3-A-phrase.png` });
await A.mouse.click(640, 480);                       // 送出！
await A.waitForTimeout(2500);
const invA = await A.evaluate(() => __game.save.inventory.map((i) => i.name));
check('A 的背包里雨伞剑没有了', !invA.includes('雨伞剑'), JSON.stringify(invA));
const boxB = await Bt.evaluate(async () => (await (await fetch('/api/mail')).json()).inbox);
check('服务器里 B 的信箱有 1 封信（雨伞剑 +2）', boxB.length === 1 && boxB[0].gift.item.name === '雨伞剑' && boxB[0].gift.item.enhance === 2, JSON.stringify(boxB.map((m) => [m.gift.item?.name, m.phrase])));
const badge = await until(Bt, () => Bt.evaluate(() => __phaser.scene.getScene('Town').social.mailBadge?.visible && __phaser.scene.getScene('Town').social.mailBadge.text));
check('B 的信箱按钮出现角标 1', badge === '1', String(badge));
await Bt.screenshot({ path: `${out}/m4-B-badge.png` });

// A 再送材料：强化石 ×1
await A.mouse.click(1190, 210); await A.waitForTimeout(1200);
await A.mouse.click(550, 204);
await A.waitForTimeout(2500);
await A.mouse.click(510, 130);                       // “材料”页
await A.waitForTimeout(900);
await A.screenshot({ path: `${out}/m5-A-mats.png` });
await A.mouse.click(950, 200);                       // 强化石：选这个（默认 1 个）
await A.waitForTimeout(900);
await A.mouse.click(640, 480);
await A.waitForTimeout(2500);
check('A 的强化石少了 1 个', (await A.evaluate(() => __game.save.stones)) === 4);

// B 打开信箱，收下两份
await Bt.mouse.click(1190, 256);
await Bt.waitForTimeout(2500);
await Bt.screenshot({ path: `${out}/m6-B-mailbox.png` });
await Bt.mouse.click(970, 190);                      // 第一封“收下”
await Bt.waitForTimeout(2500);
console.log('  第一次收下后: claimed=', await Bt.evaluate(() => __game.save.mail.claimed.length), '弹层数=', await Bt.evaluate(() => __phaser.scene.getScene('Town').children.list.filter((c) => c.depth === 500).length));
await Bt.screenshot({ path: `${out}/m6b-B-between.png` });
await Bt.mouse.move(600, 300);
await Bt.mouse.click(970, 190);                      // 剩下的那封
await Bt.waitForTimeout(2500);
console.log('  第二次收下后: claimed=', await Bt.evaluate(() => __game.save.mail.claimed.length));
const sB = await Bt.evaluate(() => ({ inv: __game.save.inventory.map((i) => `${i.name}+${i.enhance}|${i.from}`), stones: __game.save.stones, claimed: __game.save.mail.claimed.length, codex: __game.save.codex.items.includes('c1_umbrella') }));
check('B 的背包里有了雨伞剑 +2，来源写着送礼的人', sB.inv.some((x) => x.startsWith('雨伞剑+2|送礼的')), JSON.stringify(sB.inv));
check('B 的强化石 +1', sB.stones === 1, `stones=${sB.stones}`);
check('B 的图鉴点亮了雨伞剑；记录已收 2 封', sB.codex && sB.claimed === 2, JSON.stringify(sB));
const left = await Bt.evaluate(async () => (await (await fetch('/api/mail')).json()).inbox.length);
check('B 的信箱清空了', left === 0, `left=${left}`);
// 家长后台的赠送记录
const gifts = (await (await api('/api/admin/gifts', { cookie: adminCookie })).json()).gifts;
check('家长后台有 2 条赠送记录', gifts.length === 2 && gifts[1].gift.startsWith('雨伞剑') && gifts[0].gift.startsWith('强化石'), JSON.stringify(gifts.map((g) => `${g.from}→${g.to}:${g.gift}`)));
await Bt.screenshot({ path: `${out}/m7-B-after.png` });
check('页面没有报错', errors.length === 0, errors.slice(0, 4).join(' | '));
await b.close();
const bad = results.filter((r) => !r).length;
console.log(bad ? `\n${bad} 项失败` : '\n全部通过');
process.exit(bad ? 1 : 0);
