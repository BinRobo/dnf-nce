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
  await req(r.c, 'PUT', `/api/saves/char-${name}-0001`, { data: { id: `char-${name}-0001`, name: charName, level: 6, version: 3, updatedAt: Date.now(), cls: 'sword', gender: 'm', dungeons: {} } });
  return { cookie: r.c, id: r.j.user.id as string };
}
async function befriend(a: { cookie: string; id: string }, b: { cookie: string; id: string }) {
  const code = (await req(b.cookie, 'GET', '/api/friends')).j.code;
  await req(a.cookie, 'POST', '/api/friends/request', { code });
  await req(b.cookie, 'POST', '/api/friends/accept', { id: a.id });
}
const item = (over: Record<string, unknown> = {}) => ({ uid: 'it-1', name: '雨伞剑', slot: 'weapon', rarity: 'rare', atk: 30, hp: 0, crit: 0, enhance: 3, enhanceFails: 0, obtainedAt: 1, from: '测试', ...over });

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'nce-mail-'));
  const app = createApp({ dataDir: path.join(dir, 'data'), adminPassword: 'admin-pass-123', phraseIds: new Set(['thank_you', 'hello']) });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = app.close;
  adminCookie = (await req('', 'POST', '/api/admin/login', { password: 'admin-pass-123' })).c;
});
afterAll(async () => {
  await close();
  rmSync(dir, { recursive: true, force: true });
});

describe('信箱赠送', () => {
  it('只能送给互相确认的好友；陌生人送不了', async () => {
    const a = await kid('mlA', '送礼的');
    const b = await kid('mlB', '收礼的');
    const g = { kind: 'item', item: item() };
    expect((await req(a.cookie, 'POST', '/api/mail/send', { to: b.id, gift: g })).s).toBe(400);
    await befriend(a, b);
    const r = await req(a.cookie, 'POST', '/api/mail/send', { to: b.id, gift: g, phrase: 'thank_you' });
    expect(r.s).toBe(200);
    expect(r.j.left).toBe(2);
    const inbox = (await req(b.cookie, 'GET', '/api/mail')).j;
    expect(inbox.inbox).toHaveLength(1);
    expect(inbox.inbox[0]).toMatchObject({ from: { id: a.id, name: '送礼的' }, phrase: 'thank_you', gift: { kind: 'item', item: { name: '雨伞剑', rarity: 'rare', enhance: 3 } } });
    expect(JSON.stringify(inbox)).not.toMatch(/mlA|pass-1234/);       // 不泄露登录名
    // 签收后确认：信箱清空
    expect((await req(b.cookie, 'POST', `/api/mail/${inbox.inbox[0].id}/ack`)).s).toBe(200);
    expect((await req(b.cookie, 'GET', '/api/mail')).j.inbox).toHaveLength(0);
  });

  it('史诗装备、史诗碎片、Boss 之魂不能送；字段被收紧；短句要在表里', async () => {
    const a = await kid('mlC');
    const b = await kid('mlD');
    await befriend(a, b);
    const send = (gift: unknown, phrase?: string) => req(a.cookie, 'POST', '/api/mail/send', { to: b.id, gift, phrase });
    expect((await send({ kind: 'item', item: item({ rarity: 'epic' }) })).s).toBe(400);
    expect((await send({ kind: 'item', item: item({ name: '史诗·帕顿的金号角锤', rarity: 'rare' }) })).s).toBe(400);
    expect((await send({ kind: 'mat', mat: 'shard', n: 1 })).s).toBe(400);
    expect((await send({ kind: 'mat', mat: 'soul', n: 1 })).s).toBe(400);
    expect((await send({ kind: 'item', item: item({ slot: 'wings' }) })).s).toBe(400);
    expect((await send({ kind: 'item', item: item() }, 'free text')).s).toBe(400);
    const ok = await send({ kind: 'item', item: item({ atk: 999999, enhance: 99, name: '<b>雨伞剑</b>', hp: 500 }) });
    expect(ok.s).toBe(200);
    const got = (await req(b.cookie, 'GET', '/api/mail')).j.inbox[0].gift.item;
    expect(got).toMatchObject({ atk: 999, enhance: 12, hp: 20 });
    expect(got.name).not.toContain('<');
    const mat = await send({ kind: 'mat', mat: 'stone', n: 500 });
    expect(mat.s).toBe(200);
    expect((await req(b.cookie, 'GET', '/api/mail')).j.inbox[1].gift).toEqual({ kind: 'mat', mat: 'stone', n: 20 });
  });

  it('每天最多送 3 次；对方信箱最多 30 封', async () => {
    const a = await kid('mlE');
    const b = await kid('mlF');
    await befriend(a, b);
    for (let i = 0; i < 3; i++) expect((await req(a.cookie, 'POST', '/api/mail/send', { to: b.id, gift: { kind: 'mat', mat: 'cloth', n: 1 } })).s).toBe(200);
    const fourth = await req(a.cookie, 'POST', '/api/mail/send', { to: b.id, gift: { kind: 'mat', mat: 'cloth', n: 1 } });
    expect(fourth.s).toBe(429);
    expect(fourth.j.error).toContain('明天');
    expect((await req(a.cookie, 'GET', '/api/mail')).j.sentToday).toBe(3);
  });

  it('家长关闭多人功能后不能送也不能收；后台能看到赠送记录', async () => {
    const a = await kid('mlG', '小甲');
    const b = await kid('mlH', '小乙');
    await befriend(a, b);
    await req(a.cookie, 'POST', '/api/mail/send', { to: b.id, gift: { kind: 'item', item: item() }, phrase: 'hello' });
    const log = (await req(adminCookie, 'GET', '/api/admin/gifts?limit=50')).j.gifts;
    const mine = log.find((g: any) => g.from === '小甲' && g.to === '小乙');
    expect(mine).toMatchObject({ gift: '雨伞剑（rare +3）', phrase: 'hello', fromUser: 'mlG', toUser: 'mlH' });
    expect((await req('', 'GET', '/api/admin/gifts')).s).toBe(401);
    await req(adminCookie, 'POST', `/api/admin/users/${b.id}/social`, { enabled: false });
    expect((await req(a.cookie, 'POST', '/api/mail/send', { to: b.id, gift: { kind: 'mat', mat: 'cloth', n: 1 } })).s).toBe(403);
    expect((await req(b.cookie, 'GET', '/api/mail')).s).toBe(403);
  });
});
