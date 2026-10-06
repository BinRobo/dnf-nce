import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error 纯 JS 服务模块
import { createApp } from '../server/app.mjs';

let base = '';
let close: () => Promise<void>;
let dir = '';
const J = { 'Content-Type': 'application/json' };

/** 极简 cookie 罐：每个“浏览器”一个 */
function browser() {
  const jar: Record<string, string> = {};
  return async (method: string, url: string, body?: unknown, extra: Record<string, string> = {}) => {
    const r = await fetch(base + url, {
      method, headers: { ...(body === undefined ? {} : J), Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...extra },
      body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual',
    });
    for (const c of r.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(';');
      const [k, v] = kv.split('=');
      if (/Max-Age=0/.test(c)) delete jar[k];
      else jar[k] = v;
    }
    const text = await r.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: r.status, json, text, headers: r.headers };
  };
}

const save = (id: string, over: Record<string, unknown> = {}) => ({ id, name: '小明', level: 3, version: 3, updatedAt: Date.now(), dungeons: { 'L001-002': { clears: 1 } }, ...over });

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'nce-'));
  mkdirSync(path.join(dir, 'www', 'content'), { recursive: true });
  writeFileSync(path.join(dir, 'www', 'index.html'), '<html>home</html>');
  writeFileSync(path.join(dir, 'www', 'admin.html'), '<html>admin</html>');
  writeFileSync(path.join(dir, 'www', 'content', 'big.bin'), Buffer.alloc(5000, 7));
  writeFileSync(path.join(dir, 'secret.txt'), 'no');
  const app = createApp({ dataDir: path.join(dir, 'data'), staticDir: path.join(dir, 'www'), adminPassword: 'admin-pass-123' });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = app.close;
});
afterAll(async () => {
  await close();
  rmSync(dir, { recursive: true, force: true });
});

async function adminAndInvite() {
  const a = browser();
  expect((await a('POST', '/api/admin/login', { password: 'admin-pass-123' })).status).toBe(200);
  const inv = await a('POST', '/api/admin/invites', { label: '小明', days: 7 });
  return { a, code: inv.json.code as string };
}

describe('账号', () => {
  it('没有邀请码不能注册；有了邀请码能注册并保持登录；邀请码用完作废', async () => {
    const k = browser();
    expect((await k('POST', '/api/register', { invite: 'WRONG', username: 'xiaoming', password: '123456' })).status).toBe(400);
    const { code } = await adminAndInvite();
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    const r = await k('POST', '/api/register', { invite: code.toLowerCase(), username: 'xiaoming', password: '123456' });
    expect(r.status).toBe(200);
    expect((await k('GET', '/api/me')).json.user.username).toBe('xiaoming');
    // 密码不能出现在任何响应里
    expect(JSON.stringify(r.json)).not.toMatch(/hash|salt|123456/);
    const k2 = browser();
    expect((await k2('POST', '/api/register', { invite: code, username: 'other', password: '123456' })).status).toBe(400);
  });

  it('用户名不能重复（不分大小写）、密码太短被拒、登录对错', async () => {
    const { code } = await adminAndInvite();
    const k = browser();
    expect((await k('POST', '/api/register', { invite: code, username: 'XiaoMing', password: '123456' })).status).toBe(409);
    expect((await k('POST', '/api/register', { invite: code, username: 'amy', password: '123' })).status).toBe(400);
    expect((await k('POST', '/api/register', { invite: code, username: 'a', password: '123456' })).status).toBe(400);
    expect((await k('POST', '/api/register', { invite: code, username: 'amy', password: '123456' })).status).toBe(200);
    const k2 = browser();
    expect((await k2('POST', '/api/login', { username: 'AMY', password: 'wrong!' })).status).toBe(401);
    expect((await k2('POST', '/api/login', { username: 'AMY', password: '123456' })).status).toBe(200);
    expect((await k2('POST', '/api/logout', {})).status).toBe(200);
    expect((await k2('GET', '/api/me')).status).toBe(401);
  });

  it('登录失败太多次会被限速', async () => {
    const k = browser();
    for (let i = 0; i < 8; i++) await k('POST', '/api/login', { username: 'ghost', password: 'x'.repeat(8) });
    expect((await k('POST', '/api/login', { username: 'ghost', password: 'x'.repeat(8) })).status).toBe(429);
  });

  it('跨站请求（Origin 不一致）被拒；非 JSON 被拒', async () => {
    const k = browser();
    expect((await k('POST', '/api/login', { username: 'a', password: 'b' }, { Origin: 'http://evil.example' })).status).toBe(403);
    const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' });
    expect(r.status).toBe(415);
  });
});

describe('云存档', () => {
  async function kid(name: string) {
    const { code } = await adminAndInvite();
    const k = browser();
    expect((await k('POST', '/api/register', { invite: code, username: name, password: 'pass-1234' })).status).toBe(200);
    return k;
  }

  it('未登录不能读写；登录后创建 → 读取 → 更新', async () => {
    expect((await browser()('GET', '/api/saves')).status).toBe(401);
    const k = await kid('saver1');
    const s1 = save('save-aaaa');
    const put = await k('PUT', '/api/saves/save-aaaa', { data: s1 });
    expect(put.status).toBe(200);
    expect(put.json.rev).toBe(1);
    const list = await k('GET', '/api/saves');
    expect(list.json.saves).toMatchObject([{ id: 'save-aaaa', rev: 1, level: 3, name: '小明', cleared: 1 }]);
    const got = await k('GET', '/api/saves/save-aaaa');
    expect(got.json.data.name).toBe('小明');
    const put2 = await k('PUT', '/api/saves/save-aaaa', { data: save('save-aaaa', { level: 4 }), baseRev: 1 });
    expect(put2.json.rev).toBe(2);
  });

  it('两台设备同时改：旧版本写入收到 409，可以强制覆盖，被覆盖的进度留在快照里', async () => {
    const k = await kid('saver2');
    await k('PUT', '/api/saves/save-bbbb', { data: save('save-bbbb', { level: 5 }) });
    await k('PUT', '/api/saves/save-bbbb', { data: save('save-bbbb', { level: 6 }), baseRev: 1 });
    const stale = await k('PUT', '/api/saves/save-bbbb', { data: save('save-bbbb', { level: 9 }), baseRev: 1 });
    expect(stale.status).toBe(409);
    expect(stale.json.rev).toBe(2);
    const forced = await k('PUT', '/api/saves/save-bbbb', { data: save('save-bbbb', { level: 9 }), baseRev: 1, force: true });
    expect(forced.status).toBe(200);
    expect(forced.json.rev).toBe(3);
    const snaps = await k('GET', '/api/saves/save-bbbb/snapshots');
    expect(snaps.json.snapshots.length).toBeGreaterThanOrEqual(1);
  });

  it('每个账号最多 4 个角色；格式不对的存档被拒；别人的存档读不到；删除后可恢复在回收站', async () => {
    const k = await kid('saver3');
    for (const id of ['aaaa1', 'bbbb2', 'cccc3', 'dddd4']) expect((await k('PUT', `/api/saves/${id}`, { data: save(id) })).status).toBe(200);
    expect((await k('PUT', '/api/saves/eeee5', { data: save('eeee5') })).status).toBe(400);
    expect((await k('PUT', '/api/saves/aaaa1', { data: { ...save('aaaa1'), id: 'other-id' }, baseRev: 1 })).status).toBe(400);
    expect((await k('PUT', '/api/saves/..%2F..%2Fx', { data: save('x') })).status).toBe(400);
    const other = await kid('saver4');
    expect((await other('GET', '/api/saves/aaaa1')).status).toBe(404);
    expect((await k('DELETE', '/api/saves/aaaa1')).status).toBe(200);
    expect((await k('GET', '/api/saves/aaaa1')).status).toBe(404);
    expect((await k('PUT', '/api/saves/eeee5', { data: save('eeee5') })).status).toBe(200);
  });
});

describe('管理后台', () => {
  it('不登录不能用；密码错被拒', async () => {
    expect((await browser()('GET', '/api/admin/overview')).status).toBe(401);
    expect((await browser()('POST', '/api/admin/login', { password: 'nope-nope-1' })).status).toBe(401);
  });

  it('总览能看到孩子和存档摘要；改密码、停用、限时、删除', async () => {
    const { a, code } = await adminAndInvite();
    const k = browser();
    await k('POST', '/api/register', { invite: code, username: 'managed', password: 'first-pass' });
    await k('PUT', '/api/saves/mmmm1', { data: save('mmmm1', { level: 12 }) });
    const ov = await a('GET', '/api/admin/overview');
    const u = ov.json.users.find((x: any) => x.username === 'managed');
    expect(u.saves[0]).toMatchObject({ id: 'mmmm1', level: 12 });
    expect(JSON.stringify(ov.json)).not.toMatch(/hash|salt/);
    // 限时
    expect((await a('POST', `/api/admin/users/${u.id}/limit`, { dailyMinutes: 45 })).status).toBe(200);
    expect((await k('GET', '/api/me')).json.user.dailyMinutes).toBe(45);
    expect((await a('POST', `/api/admin/users/${u.id}/limit`, { dailyMinutes: 1 })).status).toBe(400);
    // 改密码：旧会话失效，新密码可登录
    expect((await a('POST', `/api/admin/users/${u.id}/password`, { password: 'second-pass' })).status).toBe(200);
    expect((await k('GET', '/api/me')).status).toBe(401);
    expect((await browser()('POST', '/api/login', { username: 'managed', password: 'first-pass' })).status).toBe(401);
    const k2 = browser();
    expect((await k2('POST', '/api/login', { username: 'managed', password: 'second-pass' })).status).toBe(200);
    // 停用
    await a('POST', `/api/admin/users/${u.id}/disable`, { disabled: true });
    expect((await k2('GET', '/api/me')).status).toBe(401);
    expect((await browser()('POST', '/api/login', { username: 'managed', password: 'second-pass' })).status).toBe(403);
    await a('POST', `/api/admin/users/${u.id}/disable`, { disabled: false });
    expect((await browser()('POST', '/api/login', { username: 'managed', password: 'second-pass' })).status).toBe(200);
    // 家长查看存档
    const full = await a('GET', `/api/admin/users/${u.id}/saves/mmmm1`);
    expect(full.json.data.level).toBe(12);
    // 删除
    expect((await a('DELETE', `/api/admin/users/${u.id}`)).status).toBe(200);
    expect((await browser()('POST', '/api/login', { username: 'managed', password: 'second-pass' })).status).toBe(401);
  });

  it('从快照恢复存档', async () => {
    const { a, code } = await adminAndInvite();
    const k = browser();
    await k('POST', '/api/register', { invite: code, username: 'restorer', password: 'abcdef' });
    await k('PUT', '/api/saves/rrrr1', { data: save('rrrr1', { level: 7 }) });
    await k('PUT', '/api/saves/rrrr1', { data: save('rrrr1', { level: 1 }), baseRev: 1, force: true });
    const ov = await a('GET', '/api/admin/overview');
    const u = ov.json.users.find((x: any) => x.username === 'restorer');
    const snaps = await a('GET', `/api/admin/users/${u.id}/saves/rrrr1/snapshots`);
    const target = snaps.json.snapshots.find((s: any) => s.level === 7);
    expect(target).toBeTruthy();
    expect((await a('POST', `/api/admin/users/${u.id}/saves/rrrr1/restore`, { ts: target.ts })).status).toBe(200);
    expect((await k('GET', '/api/saves/rrrr1')).json.data.level).toBe(7);
  });

  it('邀请码可以撤销', async () => {
    const { a, code } = await adminAndInvite();
    expect((await a('DELETE', `/api/admin/invites/${code}`)).status).toBe(200);
    expect((await browser()('POST', '/api/register', { invite: code, username: 'late', password: '123456' })).status).toBe(400);
  });
});

describe('静态文件', () => {
  it('首页、管理页、路径穿越防护、Range', async () => {
    expect((await fetch(base + '/')).status).toBe(200);
    expect(await (await fetch(base + '/admin')).text()).toContain('admin');
    expect((await fetch(base + '/%2e%2e/secret.txt')).status).toBeGreaterThanOrEqual(400);
    expect((await fetch(base + '/../secret.txt')).status).toBeGreaterThanOrEqual(400);
    const r = await fetch(base + '/content/big.bin', { headers: { Range: 'bytes=10-19' } });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe('bytes 10-19/5000');
    expect((await r.arrayBuffer()).byteLength).toBe(10);
    expect((await fetch(base + '/nope.txt')).status).toBe(404);
  });

  it('数据目录里的文件不会被当静态文件吐出来', async () => {
    expect((await fetch(base + '/data/users.json')).status).toBe(404);
  });
});
