import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error 纯 JS 服务模块
import { createApp } from '../server/app.mjs';

let base = '';
let close: () => Promise<void>;
let dir = '';
let adminCookie = '';
const J = { 'Content-Type': 'application/json' };

async function req(cookie: string, method: string, url: string, body?: unknown) {
  const r = await fetch(base + url, { method, headers: { ...(body === undefined ? {} : J), Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => null), c: r.headers.get('set-cookie')?.split(';')[0] ?? '' };
}
async function kid(name: string, charName = name) {
  const inv = await req(adminCookie, 'POST', '/api/admin/invites', {});
  const r = await req('', 'POST', '/api/register', { invite: inv.j.code, username: name, password: 'pass-1234' });
  const cookie = r.c;
  const id = r.j.user.id as string;
  await req(cookie, 'PUT', `/api/saves/char-${name}-0001`, { data: { id: `char-${name}-0001`, name: charName, level: 6, version: 3, updatedAt: Date.now(), cls: 'mage', gender: 'f', dungeons: {} } });
  return { cookie, id };
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'nce-fr-'));
  const app = createApp({ dataDir: path.join(dir, 'data'), adminPassword: 'admin-pass-123', phraseIds: new Set(['hello']) });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = app.close;
  adminCookie = (await req('', 'POST', '/api/admin/login', { password: 'admin-pass-123' })).c;
});
afterAll(async () => {
  await close();
  rmSync(dir, { recursive: true, force: true });
});

describe('好友', () => {
  it('每个账号有一个好友码；列表里显示角色名而不是登录用户名', async () => {
    const a = await kid('frA', '小明');
    const r = await req(a.cookie, 'GET', '/api/friends');
    expect(r.s).toBe(200);
    expect(r.j.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(r.j).toMatchObject({ friends: [], incoming: [], outgoing: [] });
    expect((await req('', 'GET', '/api/friends')).s).toBe(401);
  });

  it('用好友码申请 → 对方同意 → 互为好友；列表显示对方的角色名、等级、职业，不泄露用户名', async () => {
    const a = await kid('frB1', '小红');
    const b = await kid('frB2', '小蓝');
    const code = (await req(b.cookie, 'GET', '/api/friends')).j.code as string;
    expect((await req(a.cookie, 'POST', '/api/friends/request', { code: 'ZZZZZZ' })).s).toBe(404);
    const rq = await req(a.cookie, 'POST', '/api/friends/request', { code: code.toLowerCase().replace(/^(...)/, '$1-') });
    expect(rq.s).toBe(200);
    expect(rq.j.status).toBe('requested');
    expect((await req(a.cookie, 'POST', '/api/friends/request', { code })).s).toBe(409);       // 重复申请
    const inB = (await req(b.cookie, 'GET', '/api/friends')).j;
    expect(inB.incoming).toHaveLength(1);
    expect(inB.incoming[0]).toMatchObject({ name: '小红', lv: 6, cls: 'mage', gender: 'f' });
    expect(JSON.stringify(inB)).not.toMatch(/frB1|pass-1234|hash/);
    expect((await req(a.cookie, 'GET', '/api/friends')).j.outgoing).toHaveLength(1);
    expect((await req(b.cookie, 'POST', '/api/friends/accept', { id: a.id })).s).toBe(200);
    const fa = (await req(a.cookie, 'GET', '/api/friends')).j;
    const fb = (await req(b.cookie, 'GET', '/api/friends')).j;
    expect(fa.friends.map((f: any) => f.name)).toEqual(['小蓝']);
    expect(fb.friends.map((f: any) => f.name)).toEqual(['小红']);
    expect(fa.outgoing).toHaveLength(0);
    expect((await req(a.cookie, 'POST', '/api/friends/request', { code })).s).toBe(409);       // 已经是好友
    // 删好友：两边都没了
    expect((await req(a.cookie, 'DELETE', `/api/friends/${b.id}`)).s).toBe(200);
    expect((await req(b.cookie, 'GET', '/api/friends')).j.friends).toHaveLength(0);
  });

  it('两人互相申请会直接成为好友；拒绝后申请消失；不能加自己', async () => {
    const a = await kid('frC1');
    const b = await kid('frC2');
    const ca = (await req(a.cookie, 'GET', '/api/friends')).j.code;
    const cb = (await req(b.cookie, 'GET', '/api/friends')).j.code;
    expect((await req(a.cookie, 'POST', '/api/friends/request', { code: ca })).s).toBe(400);
    await req(a.cookie, 'POST', '/api/friends/request', { code: cb });
    const both = await req(b.cookie, 'POST', '/api/friends/request', { code: ca });
    expect(both.j.status).toBe('friends');
    const c = await kid('frC3');
    await req(c.cookie, 'POST', '/api/friends/request', { code: ca });
    expect((await req(a.cookie, 'POST', '/api/friends/decline', { id: c.id })).s).toBe(200);
    expect((await req(a.cookie, 'GET', '/api/friends')).j.incoming).toHaveLength(0);
    expect((await req(a.cookie, 'POST', '/api/friends/accept', { id: c.id })).s).toBe(404);
  });

  it('家长关闭多人功能后不能用好友；也不能被别人加；删账号后从别人的好友里消失', async () => {
    const a = await kid('frD1');
    const b = await kid('frD2');
    const cb = (await req(b.cookie, 'GET', '/api/friends')).j.code;
    await req(a.cookie, 'POST', '/api/friends/request', { code: cb });
    await req(b.cookie, 'POST', '/api/friends/accept', { id: a.id });
    const off = await req(adminCookie, 'POST', `/api/admin/users/${b.id}/social`, { enabled: false });
    expect(off.s).toBe(200);
    expect((await req(b.cookie, 'GET', '/api/friends')).s).toBe(403);
    const c = await kid('frD3');
    expect((await req(c.cookie, 'POST', '/api/friends/request', { code: cb })).s).toBe(403);
    // 后台总览能看到好友
    const ov = (await req(adminCookie, 'GET', '/api/admin/overview')).j;
    expect(ov.users.find((u: any) => u.id === a.id).friends).toEqual(['frD2']);
    await req(adminCookie, 'DELETE', `/api/admin/users/${b.id}`);
    expect((await req(a.cookie, 'GET', '/api/friends')).j.friends).toHaveLength(0);
  });

  it('好友最多 20 位', async () => {
    const a = await kid('frE0');
    const ca = (await req(a.cookie, 'GET', '/api/friends')).j.code;
    for (let i = 1; i <= 20; i++) {
      const o = await kid(`frE${i}`);
      await req(o.cookie, 'POST', '/api/friends/request', { code: ca });
      expect((await req(a.cookie, 'POST', '/api/friends/accept', { id: o.id })).s).toBe(200);
    }
    const x = await kid('frE99');
    expect((await req(x.cookie, 'POST', '/api/friends/request', { code: ca })).s).toBe(400);
    expect((await req(a.cookie, 'GET', '/api/friends')).j.friends).toHaveLength(20);
  });
});
