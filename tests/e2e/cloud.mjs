// 云存档端到端：两台“平板”（两个独立浏览器环境）共用一个账号
// 需要：后端 http://127.0.0.1:5180（ADMIN_PASSWORD=test-admin-123，空数据目录）+ 开发服务器 http://localhost:5199
import { chromium } from 'playwright';
const B = 'http://localhost:5199/?realtime';
const out = process.argv[2] ?? '.cache/cloud';
const b = await chromium.launch();
const errors = [];
const results = [];
const check = (name, ok, extra = '') => { results.push([ok, name, extra]); console.log(ok ? '✓' : '✗', name, extra); };
const tablet = async (name) => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !/404|Failed to load resource/.test(m.text()) && errors.push(`${name}: ${m.text().slice(0, 120)}`));
  await profileReady(p, true);
  return p;
};
const profileReady = async (p, nav = false) => {
  if (nav) await p.goto(B);
  await p.waitForFunction(() => window.__phaser?.scene.getScene('Profile')?.ready === true, null, { timeout: 60000 });
  await p.waitForTimeout(400);
};
const createReady = (p) => p.waitForFunction(() => { const sc = __phaser.scene.getScene('Create'); return sc?.scene.isActive() && sc.layer; }, null, { timeout: 20000 }).then(() => p.waitForTimeout(400));
const api = async (path, opt = {}) => (await fetch(`http://127.0.0.1:5180${path}`, { headers: { 'Content-Type': 'application/json', ...(opt.cookie ? { Cookie: opt.cookie } : {}) }, method: opt.method ?? 'GET', body: opt.body ? JSON.stringify(opt.body) : undefined }));

// 管理员生成邀请码
const login = await api('/api/admin/login', { method: 'POST', body: { password: 'test-admin-123' } });
const adminCookie = login.headers.get('set-cookie').split(';')[0];
const inv = await (await api('/api/admin/invites', { method: 'POST', body: { label: '测试' }, cookie: adminCookie })).json();
check('生成邀请码', /^[A-Z2-9]{8}$/.test(inv.code), inv.code);

// ---- 平板 A：注册、建角色 ----
const A = await tablet('A');
await A.screenshot({ path: `${out}/a1-profile.png` });
await A.mouse.click(1130, 44);                       // 登录 / 注册
await A.waitForSelector('.nce-card');
await A.click('.nce-links a');                       // 去注册
await A.waitForSelector('.nce-card input');
const inputs = await A.$$('.nce-card input');
await inputs[0].fill(inv.code);
await inputs[1].fill('xiaoming');
await inputs[2].fill('pass-1234');
await A.screenshot({ path: `${out}/a2-register.png` });
await A.click('.nce-btn:not(.sec)');
await A.waitForFunction(() => !document.querySelector('.nce-card'), null, { timeout: 15000 });
await profileReady(A);
check('A 注册后已登录', await A.evaluate(() => __cloud.user?.username === 'xiaoming'));
await A.screenshot({ path: `${out}/a3-loggedin.png` });
await A.mouse.click(640, 340);                       // 新建角色
await createReady(A);
await A.mouse.click(1135, 330);                      // 魔法师·女
await A.waitForTimeout(300);
await A.mouse.click(640, 662);
await A.waitForSelector('.nce-card input');
await A.fill('.nce-card input', '小美');
await A.click('.nce-btn:not(.sec)');
await A.waitForFunction(() => window.__game.save && __phaser.scene.isActive('Town'), null, { timeout: 20000 });
await A.evaluate(async () => { const s = __game.save; s.level = 5; s.gold = 777; s.story.seen.push('prologue'); await __game.persist(); });
await A.waitForTimeout(6500);
const ck = adminCookie;
const ov = await (await api('/api/admin/overview', { cookie: ck })).json();
const kid = ov.users.find((u) => u.username === 'xiaoming');
check('云端收到角色（等级 5、魔法师·女）', kid?.saves?.[0]?.level === 5 && kid.saves[0].cls === 'mage' && kid.saves[0].gender === 'f', JSON.stringify(kid?.saves?.[0]));
const saveId = kid?.saves?.[0]?.id;

// ---- 平板 B：全新环境登录，拉到进度 ----
const Bt = await tablet('B');
await Bt.mouse.click(1130, 44);
await Bt.waitForSelector('.nce-card');
const bi = await Bt.$$('.nce-card input');
await bi[0].fill('XiaoMing');
await bi[1].fill('wrong-pass');
await Bt.click('.nce-btn:not(.sec)');
await Bt.waitForSelector('.nce-err:not(:empty)');
check('B 密码错误有提示', (await Bt.textContent('.nce-err')).includes('不对'));
await bi[1].fill('pass-1234');
await Bt.click('.nce-btn:not(.sec)');
await Bt.waitForFunction(() => !document.querySelector('.nce-card'), null, { timeout: 15000 });
await profileReady(Bt);
await Bt.waitForTimeout(1500);
await Bt.screenshot({ path: `${out}/b1-pulled.png` });
const profiles = await Bt.evaluate(async () => { const { listProfiles } = await import('/src/save/db.ts'); return (await listProfiles()).map((p) => ({ id: p.id, level: p.level, gold: p.gold, name: p.name })); });
check('B 拉到了角色并带着进度', profiles.length === 1 && profiles[0].level === 5 && profiles[0].gold === 777, JSON.stringify(profiles));

// B 继续玩：升到 6 级
await Bt.mouse.click(493, 442);                      // 开始冒险（第一张卡片里的按钮）
await Bt.waitForFunction(() => __phaser.scene.isActive('Town'), null, { timeout: 20000 });
await Bt.evaluate(async () => { __game.save.level = 6; __game.save.gold = 900; await __game.persist(); });
await Bt.waitForTimeout(6500);
const full = await (await api(`/api/admin/users/${kid.id}/saves/${saveId}`, { cookie: ck })).json();
check('B 的进度（6 级）回传到云端', full.data.level === 6 && full.rev >= 2, `rev=${full.rev}`);

// ---- 回到 A：刷新后看到 6 级 ----
await profileReady(A, true);
await A.waitForTimeout(1500);
const aLevel = await A.evaluate(async () => { const { listProfiles } = await import('/src/save/db.ts'); return (await listProfiles())[0]?.level; });
check('A 重新打开后同步到 6 级', aLevel === 6, `level=${aLevel}`);
await A.screenshot({ path: `${out}/a4-resynced.png` });

// ---- 断网：离线继续玩，恢复后补传 ----
await A.mouse.click(493, 442);
await A.waitForFunction(() => __phaser.scene.isActive('Town'), null, { timeout: 20000 });
await A.context().setOffline(true);
await A.evaluate(async () => { __game.save.level = 8; await __game.persist(); });
await A.waitForTimeout(6000);
const stillOld = (await (await api(`/api/admin/users/${kid.id}/saves/${saveId}`, { cookie: ck })).json()).data.level;
check('断网时云端还是旧的（6 级）', stillOld === 6);
const pend = await A.evaluate(() => __cloud.state(__game.save.id));
check('断网时状态为“待上传”', pend === 'pending', pend);
await A.context().setOffline(false);
await A.evaluate(() => __cloud.flush());
await A.waitForTimeout(1500);
const nowLv = (await (await api(`/api/admin/users/${kid.id}/saves/${saveId}`, { cookie: ck })).json()).data.level;
check('联网后补传成功（8 级）', nowLv === 8, `level=${nowLv}`);

// ---- B 退出登录：本机角色清掉，云端还在 ----
await profileReady(Bt, true);
await Bt.waitForTimeout(1500);
await Bt.mouse.click(1180, 78);
await Bt.waitForTimeout(500);
await Bt.mouse.click(540, 430);                      // 确认框里的“确定”
await profileReady(Bt);
await Bt.waitForTimeout(800);
const left = await Bt.evaluate(async () => { const { listProfiles } = await import('/src/save/db.ts'); return (await listProfiles()).length; });
check('B 退出登录后本机不留角色', left === 0, `left=${left}`);
const cloudStill = (await (await api('/api/admin/overview', { cookie: ck })).json()).users.find((u) => u.username === 'xiaoming').saves.length;
check('退出后云端存档仍在', cloudStill === 1);
await Bt.screenshot({ path: `${out}/b2-loggedout.png` });

check('页面没有报错', errors.length === 0, errors.slice(0, 4).join(' | '));
await b.close();
const bad = results.filter((r) => !r[0]).length;
console.log(bad ? `\n${bad} 项失败` : '\n全部通过');
process.exit(bad ? 1 : 0);
