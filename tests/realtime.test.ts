import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error 纯 JS 服务模块
import { createApp } from '../server/app.mjs';

let port = 0;
let close: () => Promise<void>;
let dir = '';
let rtApi: { online: (uid: string) => unknown; count: () => number };
const J = { 'Content-Type': 'application/json' };
const base = () => `http://127.0.0.1:${port}`;

/** 登录一个“孩子”，返回 Cookie 和账号 id */
async function kid(name: string, adminCookie: string) {
  const inv = await (await fetch(base() + '/api/admin/invites', { method: 'POST', headers: { ...J, Cookie: adminCookie }, body: JSON.stringify({}) })).json();
  const r = await fetch(base() + '/api/register', { method: 'POST', headers: J, body: JSON.stringify({ invite: inv.code, username: name, password: 'pass-1234' }) });
  const cookie = r.headers.get('set-cookie')!.split(';')[0];
  return { cookie, id: (await r.json()).user.id as string };
}
async function admin() {
  const r = await fetch(base() + '/api/admin/login', { method: 'POST', headers: J, body: JSON.stringify({ password: 'admin-pass-123' }) });
  return r.headers.get('set-cookie')!.split(';')[0];
}

/** 最小 WebSocket 客户端（测试用）：握手 + 带掩码的文本帧 */
function ws(cookie: string, opts: { origin?: string } = {}) {
  return new Promise<{ status: number; send: (o: unknown) => void; msgs: any[]; wait: (pred: (m: any) => boolean, ms?: number) => Promise<any>; closed: Promise<number>; end: () => void }>((resolve) => {
    const sock = net.connect(port, '127.0.0.1');
    const key = crypto.randomBytes(16).toString('base64');
    let buf = Buffer.alloc(0);
    let upgraded = false;
    const msgs: any[] = [];
    const waiters: { pred: (m: any) => boolean; res: (m: any) => void }[] = [];
    let closeCode = 0;
    let resolveClosed: (c: number) => void;
    const closed = new Promise<number>((r) => (resolveClosed = r));
    sock.write(`GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nCookie: ${cookie}\r\n${opts.origin ? `Origin: ${opts.origin}\r\n` : ''}\r\n`);
    const api = {
      status: 0, msgs, closed,
      send: (o: unknown) => {
        const p = Buffer.from(JSON.stringify(o));
        const mask = crypto.randomBytes(4);
        const head = p.length < 126 ? Buffer.from([0x81, 0x80 | p.length]) : Buffer.from([0x81, 0x80 | 126, p.length >> 8, p.length & 255]);
        const body = Buffer.from(Array.from(p, (b, i) => b ^ mask[i & 3]));
        sock.write(Buffer.concat([head, mask, body]));
      },
      wait: (pred: (m: any) => boolean, ms = 1500) => new Promise<any>((res, rej) => {
        const hit = msgs.find(pred);
        if (hit) return res(hit);
        waiters.push({ pred, res });
        setTimeout(() => rej(new Error('等消息超时')), ms);
      }),
      end: () => sock.end(),
    };
    sock.on('data', (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      if (!upgraded) {
        const i = buf.indexOf('\r\n\r\n');
        if (i < 0) return;
        const head = buf.subarray(0, i).toString();
        api.status = Number(head.split(' ')[1]);
        buf = buf.subarray(i + 4);
        if (api.status !== 101) return resolve(api);
        upgraded = true;
        resolve(api);
      }
      while (buf.length >= 2) {
        const op = buf[0] & 15;
        let len = buf[1] & 127;
        let off = 2;
        if (len === 126) { len = buf.readUInt16BE(2); off = 4; }
        if (buf.length < off + len) break;
        const data = buf.subarray(off, off + len);
        buf = buf.subarray(off + len);
        if (op === 1) {
          const m = JSON.parse(data.toString());
          msgs.push(m);
          for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); }
        } else if (op === 8) closeCode = data.length >= 2 ? data.readUInt16BE(0) : 1005;
      }
    });
    sock.on('close', () => resolveClosed(closeCode));
    sock.on('error', () => resolve(api));
    setTimeout(() => resolve(api), 3000);
  });
}

const look = (name: string) => ({ name, cls: 'mage', gender: 'f', lv: 5, worn: { hat: 'knight' }, wpn: { name: '水晶法球', rarity: 'rare' }, title: '' });

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'nce-rt-'));
  const app = createApp({ dataDir: path.join(dir, 'data'), adminPassword: 'admin-pass-123', phraseIds: new Set(['hello', 'goodbye']) });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', () => r()));
  port = (app.server.address() as AddressInfo).port;
  close = app.close;
  rtApi = app.rt;
});
afterAll(async () => {
  await close();
  rmSync(dir, { recursive: true, force: true });
});

describe('多人在线', () => {
  it('没登录连不上；跨站来源被拒', async () => {
    expect((await ws('')).status).toBe(401);
    const a = await admin();
    const k = await kid('rt1', a);
    expect((await ws(k.cookie, { origin: 'http://evil.example' })).status).toBe(403);
  });

  it('同一街区的两个孩子互相看到、看到走动和短句；不同街区互不干扰', async () => {
    const a = await admin();
    const k1 = await kid('rtA', a);
    const k2 = await kid('rtB', a);
    const k3 = await kid('rtC', a);
    const c1 = await ws(k1.cookie);
    const c2 = await ws(k2.cookie);
    const c3 = await ws(k3.cookie);
    expect(c1.status).toBe(101);
    c1.send({ t: 'join', district: 'campus', x: 500, d: 1, p: look('小明') });
    const room1 = await c1.wait((m) => m.t === 'room');
    expect(room1.players).toEqual([]);
    c3.send({ t: 'join', district: 'market', x: 100, p: look('路人') });
    await c3.wait((m) => m.t === 'room');
    c2.send({ t: 'join', district: 'campus', x: 800, d: -1, p: look('小红') });
    const room2 = await c2.wait((m) => m.t === 'room');
    expect(room2.players).toHaveLength(1);
    expect(room2.players[0]).toMatchObject({ name: '小明', cls: 'mage', x: 500, wpn: { name: '水晶法球', rarity: 'rare' }, worn: { hat: 'knight' } });
    expect(JSON.stringify(room2)).not.toMatch(/rtA|pass/);        // 不泄露用户名
    const joined = await c1.wait((m) => m.t === 'in');
    expect(joined.p.name).toBe('小红');
    c2.send({ t: 'mv', x: 900, d: 1, m: true });
    expect(await c1.wait((m) => m.t === 'mv')).toMatchObject({ id: k2.id, x: 900, d: 1, m: true });
    c2.send({ t: 'say', id: 'hello' });
    expect(await c1.wait((m) => m.t === 'say')).toMatchObject({ id: k2.id, ph: 'hello' });
    // 别的街区的收不到
    await new Promise((r) => setTimeout(r, 200));
    expect(c3.msgs.some((m) => m.t === 'mv' || m.t === 'say' || m.t === 'in')).toBe(false);
    // 谁在线
    c3.send({ t: 'who' });
    const who = await c3.wait((m) => m.t === 'who');
    expect(who.list.map((x: any) => x.name).sort()).toEqual(['小明', '小红', '路人']);
    // 离开
    c2.end();
    expect(await c1.wait((m) => m.t === 'out')).toMatchObject({ id: k2.id });
    c1.end();
    c3.end();
  });

  it('只能发短句表里的句子；发得太快会被丢掉；坐标和字段被收紧', async () => {
    const a = await admin();
    const k1 = await kid('rtD', a);
    const k2 = await kid('rtE', a);
    const c1 = await ws(k1.cookie);
    const c2 = await ws(k2.cookie);
    c1.send({ t: 'join', district: 'campus', x: 1, p: look('甲') });
    c2.send({ t: 'join', district: 'campus', x: 1, p: { ...look('乙'), name: '<script>alert(1)</script>很长很长很长很长很长', lv: 9999, cls: 'hacker' } });
    await c1.wait((m) => m.t === 'in');
    const inn = c1.msgs.find((m) => m.t === 'in');
    expect(inn.p.name).not.toContain('<');
    expect(inn.p.name.length).toBeLessThanOrEqual(12);
    expect(inn.p).toMatchObject({ lv: 99, cls: 'sword' });
    c2.send({ t: 'say', id: 'free_text_hi' });                      // 不在表里
    c2.send({ t: 'say', id: 'goodbye' });
    await c1.wait((m) => m.t === 'say');
    expect(c1.msgs.filter((m) => m.t === 'say').map((m) => m.ph)).toEqual(['goodbye']);
    c2.send({ t: 'say', id: 'hello' });                             // 1.5 秒内再发：丢掉
    await new Promise((r) => setTimeout(r, 200));
    expect(c1.msgs.filter((m) => m.t === 'say')).toHaveLength(1);
    for (let i = 0; i < 100; i++) c2.send({ t: 'mv', x: i * 10, d: 1, m: true });
    await new Promise((r) => setTimeout(r, 400));
    expect(c1.msgs.filter((m) => m.t === 'mv').length).toBeLessThan(40);
    c2.send({ t: 'mv', x: 999999, d: 7, m: true });
    await new Promise((r) => setTimeout(r, 100));
    c1.end();
    c2.end();
  });

  it('同一账号再连一次，旧连接被顶掉；家长关闭多人功能立刻踢下线并拒绝再连', async () => {
    const a = await admin();
    const k = await kid('rtF', a);
    const first = await ws(k.cookie);
    first.send({ t: 'join', district: 'campus', x: 1, p: look('单') });
    await first.wait((m) => m.t === 'room');
    const second = await ws(k.cookie);
    expect(second.status).toBe(101);
    expect(await first.closed).toBe(4001);
    expect(rtApi.online(k.id)).toBeTruthy();
    const off = await fetch(base() + `/api/admin/users/${k.id}/social`, { method: 'POST', headers: { ...J, Cookie: a }, body: JSON.stringify({ enabled: false }) });
    expect(off.status).toBe(200);
    expect(await second.closed).toBe(4003);
    expect((await ws(k.cookie)).status).toBe(403);
    const ov = await (await fetch(base() + '/api/admin/overview', { headers: { Cookie: a } })).json();
    expect(ov.users.find((u: any) => u.id === k.id)).toMatchObject({ social: false, online: null });
  });

  it('后台总览能看到谁在线、在哪个街区', async () => {
    const a = await admin();
    const k = await kid('rtG', a);
    const c = await ws(k.cookie);
    c.send({ t: 'join', district: 'king', x: 1, p: look('在线的孩子') });
    await c.wait((m) => m.t === 'room');
    const ov = await (await fetch(base() + '/api/admin/overview', { headers: { Cookie: a } })).json();
    expect(ov.users.find((u: any) => u.id === k.id).online).toMatchObject({ district: 'king', name: '在线的孩子' });
    c.end();
  });
});
