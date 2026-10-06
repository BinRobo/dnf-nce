// 组队端到端：两台平板成为好友 → 建队、邀请、加入、准备、开战 → 答题伤害 / 倒下 / 救人 → 终结合唱 → 结算
// 需要：后端 http://127.0.0.1:5180（ADMIN_PASSWORD=test-admin-123，空数据目录）+ 开发服务器 http://localhost:5199
import { chromium } from 'playwright';
const B = 'http://localhost:5199/?realtime';
const out = process.argv[2] ?? '.cache/party';
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
    await saveProfile(s);
    await __cloud.adopt(s);
    __game.use(s);
    __phaser.scene.getScene('Profile').scene.start('Town');
  }, [charName, opts]);
  await p.waitForFunction(() => __phaser.scene.getScene('Town')?.scene.isActive() && __phaser.scene.getScene('Town').social, null, { timeout: 40000 });
  return p;
}
const until = async (p, fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await p.waitForTimeout(250); } return null; };
const post = (p, path, body) => p.evaluate(async ([path, body]) => (await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(), [path, body]);
const inBattle = (p) => p.evaluate(() => __phaser.scene.getScene('PartyBattle')?.scene.isActive() && !!__phaser.scene.getScene('PartyBattle').quiz);
const snap = (p) => p.evaluate(() => __phaser.scene.getScene('PartyBattle').snap);
const send = (p, m) => p.evaluate((m) => __net.sendParty(m), m);

const A = await tablet('pta', '小明', { cls: 'sword', level: 5 });
const Bt = await tablet('ptb', '小红', { cls: 'mage', gender: 'f', level: 7 });
await A.waitForTimeout(1500);

// ---- 成为好友
const fa = await A.evaluate(async () => (await (await fetch('/api/friends')).json()));
await post(Bt, '/api/friends/request', { code: fa.code });
const idB = (await A.evaluate(async () => (await (await fetch('/api/friends')).json()))).incoming[0]?.id;
await post(A, '/api/friends/accept', { id: idB });
await A.waitForTimeout(800);
const idA = (await Bt.evaluate(async () => (await (await fetch('/api/friends')).json()))).friends[0]?.id;
check('两人成为好友', !!idA && !!idB);

// ---- 建队（点界面）
await A.mouse.click(1190, 302);                 // 🛡 组队
await A.waitForTimeout(800);
await A.screenshot({ path: `${out}/p1-A-home.png` });
await A.mouse.click(640, 490);                  // 创建队伍
await A.waitForTimeout(600);
await A.screenshot({ path: `${out}/p2-A-pick.png` });
await A.mouse.click(420, 190);                  // 第一个副本
await A.waitForTimeout(900);
const st = await A.evaluate(async () => { const { party } = await import('/src/net/party.ts'); return party.view && { dungeon: party.view.dungeon, n: party.view.members.length, leader: party.isLeader }; });
check('A 建好队伍，A 是队长', st?.n === 1 && st.leader && st.dungeon === 'L001-002', JSON.stringify(st));
// 邀请 B
await A.evaluate(async (id) => { (await import('/src/net/party.ts')).party.invite(id); }, idB);
await A.screenshot({ path: `${out}/p3-A-lobby.png` });
const badge = await until(Bt, () => Bt.evaluate(() => __phaser.scene.getScene('Town').social.partyBadge?.visible && __phaser.scene.getScene('Town').social.partyBadge.text));
check('B 的“组队”按钮出现角标 1', badge === '1', String(badge));
await Bt.screenshot({ path: `${out}/p4-B-badge.png` });
await Bt.mouse.click(1190, 302);
await Bt.waitForTimeout(800);
await Bt.screenshot({ path: `${out}/p5-B-invite.png` });
await Bt.mouse.click(750, 240);                 // 加入
const joined = await until(A, () => A.evaluate(async () => (await import('/src/net/party.ts')).party.view?.members.length === 2));
check('B 加入后队伍有 2 人', !!joined);
await Bt.waitForTimeout(500);
await Bt.screenshot({ path: `${out}/p6-B-lobby.png` });
await Bt.mouse.click(750, 600);                 // 我准备好了
await until(A, () => A.evaluate(async () => (await import('/src/net/party.ts')).party.view?.members.every((m) => m.ready)));
await A.waitForTimeout(500);
await A.screenshot({ path: `${out}/p7-A-ready.png` });
await A.mouse.click(750, 600);                  // 出发
check('两台平板都进入组队战斗', !!(await until(A, () => inBattle(A), 40000)) && !!(await until(Bt, () => inBattle(Bt), 40000)));
await A.waitForTimeout(1500);
await A.screenshot({ path: `${out}/b1-A-battle.png` });
await Bt.screenshot({ path: `${out}/b2-B-battle.png` });
let s0 = await snap(A);
check('Boss 血量 = 16 × 2', s0.bossMax === 32 && s0.bossHp === 32, JSON.stringify([s0.bossHp, s0.bossMax]));
check('A 屏幕上有题目', await A.evaluate(() => __phaser.scene.getScene('PartyBattle').quiz.visible));

// 只留选择题，方便用点击答题
const pickOnly = (p) => p.evaluate(() => { const sc = __phaser.scene.getScene('PartyBattle'); sc.pool = sc.pool.filter((q) => q.kind === 'pick'); if (sc.cur && sc.cur.kind !== 'pick') sc.abort?.(); });
const answerUI = async (p, right = true) => {
  await pickOnly(p);
  const q = await until(p, () => p.evaluate(() => { const sc = __phaser.scene.getScene('PartyBattle'); return sc.cur?.kind === 'pick' && sc.quiz.visible ? { a: sc.cur.answer, n: sc.cur.options.length } : null; }));
  if (!q) return false;
  await p.waitForTimeout(500);
  const i = right ? q.a : (q.a + 1) % q.n;
  await p.mouse.click(330 + (i % 2) * 600, 470 + 124 + Math.floor(i / 2) * 62);
  return true;
};
// 真实点击答对一题 → 服务器记一次伤害
let ok1 = false, dealt = null;
for (let t = 0; t < 3 && !dealt; t++) {
  ok1 = (await answerUI(A)) || ok1;
  dealt = await until(A, async () => (await snap(A)).bossHp < 32, 4000);
}
check('A 点击答对一题，Boss 掉血', ok1 && !!dealt, String((await snap(A)).bossHp));
await A.screenshot({ path: `${out}/b3-A-hit.png` });
// B 屏幕上也看到了 A 的攻击（血条同步）
check('B 屏幕上 Boss 血量同步', (await snap(Bt)).bossHp === (await snap(A)).bossHp);

// ---- 答错扣心
await answerUI(A, false);
const lost = await until(A, async () => (await snap(A)).members.find((m) => m.hearts < 5));
check('答错的人少一颗心', !!lost);

// ---- B 倒下，A 救人
for (let i = 0; i < 5; i++) { await send(Bt, { t: 'p.ans', ok: false }); await Bt.waitForTimeout(80); }
const down = await until(A, async () => (await snap(A)).members.find((m) => m.id === idB)?.down);
check('B 5 颗心掉光后倒下', !!down);
await A.waitForTimeout(600);
await A.screenshot({ path: `${out}/b4-A-B-down.png` });
await A.evaluate((id) => { const sc = __phaser.scene.getScene('PartyBattle'); sc.slots.get(id).hit.emit('pointerdown'); }, idB);
const rescueQ = await until(A, () => A.evaluate(() => __phaser.scene.getScene('PartyBattle').info.text.includes('救')));
check('A 点倒下的队友，出现救援题', !!rescueQ);
await answerUI(A);
const up = await until(A, async () => { const m = (await snap(A)).members.find((x) => x.id === idB); return m && !m.down && m.hearts === 2; });
check('A 答对后 B 被救起，回到 2 颗心', !!up);
await A.screenshot({ path: `${out}/b5-A-rescued.png` });

// ---- 打到只剩 25% → 终结合唱
const hitLoop = async (n) => { for (let i = 0; i < n; i++) { await send(A, { t: 'p.ans', ok: true, g: 'perfect' }); await A.waitForTimeout(40); await send(Bt, { t: 'p.ans', ok: true }); await A.waitForTimeout(40); } };
await hitLoop(8);
const fin = await until(A, async () => (await snap(A)).phase === 'finale');
check('血量打到 25% 进入终结合唱', !!fin);
await A.waitForTimeout(1200);
await A.screenshot({ path: `${out}/b6-A-finale.png` });
check('合唱阶段 A 屏幕上是排序题', await until(A, () => A.evaluate(() => __phaser.scene.getScene('PartyBattle').cur?.kind === 'order'), 6000) !== null);
await send(A, { t: 'p.finale' });
await A.waitForTimeout(400);
check('只有一个人唱完时还没赢', (await snap(A)).phase === 'finale');
await send(Bt, { t: 'p.finale' });

// ---- 结算
const expBefore = await A.evaluate(() => __game.s.exp + __game.s.level * 1000);
const resA = await until(A, () => A.evaluate(() => __phaser.scene.getScene('Result')?.scene.isActive() && __phaser.scene.getScene('Result').party), 15000);
const resB = await until(Bt, () => Bt.evaluate(() => __phaser.scene.getScene('Result')?.scene.isActive() && __phaser.scene.getScene('Result').party), 15000);
check('双方都进入结算画面', !!resA && !!resB);
await A.waitForTimeout(3500);
await A.screenshot({ path: `${out}/r1-A-result.png` });
const sum = await A.evaluate(() => { const s = __game.s; const r = __phaser.scene.getScene('Result').r; return { clears: s.dungeons['L001-002']?.clears, bonus: r.partyBonus, gold: r.gold, cleared: r.cleared, win: __phaser.scene.getScene('Result').party.win }; });
check('结算：通关、记录通关、有 25% 组队加成', sum.win && sum.cleared && sum.clears === 1 && sum.bonus === 0.25, JSON.stringify(sum));
void expBefore;
await A.mouse.click(480, 650);
await A.waitForTimeout(1500);
const back = await A.evaluate(() => __phaser.scene.getScene('Town').scene.isActive());
check('点“回到城镇”回到城镇', back);
const gone = await A.evaluate(async () => (await import('/src/net/party.ts')).party.view === null);
check('队伍已解散', gone);
check('页面没有报错', errors.length === 0, errors.slice(0, 4).join(' | '));
await b.close();
const bad = results.filter((r) => !r).length;
console.log(bad ? `\n${bad} 项失败` : '\n全部通过');
process.exit(bad ? 1 : 0);
