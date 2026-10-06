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
let adminCookie = '';
const J = { 'Content-Type': 'application/json' };
const base = () => `http://127.0.0.1:${port}`;
async function post(cookie: string, url: string, body: unknown) {
  const r = await fetch(base() + url, { method: 'POST', headers: { ...J, Cookie: cookie }, body: JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => null), c: r.headers.get('set-cookie')?.split(';')[0] ?? '' };
}
async function kid(name: string) {
  const inv = await post(adminCookie, '/api/admin/invites', {});
  const r = await post('', '/api/register', { invite: inv.j.code, username: name, password: 'pass-1234' });
  return { cookie: r.c, id: r.j.user.id as string };
}
async function befriend(a: { cookie: string; id: string }, b: { cookie: string; id: string }) {
  const code = (await (await fetch(base() + '/api/friends', { headers: { Cookie: b.cookie } })).json()).code;
  await post(a.cookie, '/api/friends/request', { code });
  await post(b.cookie, '/api/friends/accept', { id: a.id });
}

type Client = { status: number; send: (o: unknown) => void; msgs: any[]; wait: (pred: (m: any) => boolean, ms?: number) => Promise<any>; end: () => void };
function ws(cookie: string): Promise<Client> {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1');
    const key = crypto.randomBytes(16).toString('base64');
    let buf: Buffer = Buffer.alloc(0);
    let up = false;
    const msgs: any[] = [];
    const api: Client = {
      status: 0, msgs,
      send: (o) => {
        const p = Buffer.from(JSON.stringify(o));
        const mask = crypto.randomBytes(4);
        const head = p.length < 126 ? Buffer.from([0x81, 0x80 | p.length]) : Buffer.from([0x81, 0x80 | 126, p.length >> 8, p.length & 255]);
        sock.write(Buffer.concat([head, mask, Buffer.from(Array.from(p, (b, i) => b ^ mask[i & 3]))]));
      },
      wait: async (pred, ms = 2000) => {
        const t = Date.now();
        while (Date.now() - t < ms) {
          const h = msgs.find(pred);
          if (h) return h;
          await new Promise((r) => setTimeout(r, 20));
        }
        throw new Error('等消息超时：' + JSON.stringify(msgs.slice(-3)));
      },
      end: () => sock.destroy(),
    };
    sock.write(`GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nCookie: ${cookie}\r\n\r\n`);
    sock.on('data', (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      if (!up) {
        const i = buf.indexOf('\r\n\r\n');
        if (i < 0) return;
        api.status = Number(buf.subarray(0, i).toString().split(' ')[1]);
        buf = buf.subarray(i + 4);
        up = true;
        resolve(api);
      }
      while (buf.length >= 2) {
        let len = buf[1] & 127;
        let off = 2;
        if (len === 126) {
          len = buf.readUInt16BE(2);
          off = 4;
        }
        if (buf.length < off + len) break;
        const data = buf.subarray(off, off + len);
        buf = buf.subarray(off + len);
        try {
          msgs.push(JSON.parse(data.toString()));
        } catch {
          /* 关闭帧 */
        }
      }
    });
    sock.on('error', () => resolve(api));
  });
}

const look = (name: string) => ({ name, cls: 'mage', gender: 'f', lv: 5, worn: {}, wpn: null, title: '' });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 建好 n 个在线、互为好友、都进了城镇的孩子 */
async function team(n: number, tag: string) {
  const kids = [];
  for (let i = 0; i < n; i++) kids.push(await kid(`acct_${tag}${i}`));
  for (let i = 1; i < n; i++) await befriend(kids[0], kids[i]);
  const cs: Client[] = [];
  for (let i = 0; i < n; i++) {
    const c = await ws(kids[i].cookie);
    c.send({ t: 'join', district: 'campus', x: 100, p: look(`${tag}${i}`) });
    await c.wait((m) => m.t === 'room');
    cs.push(c);
  }
  return { kids, cs };
}
/** 队长建队、邀请所有人、大家准备、开战；返回开战消息 */
async function launch(t: Awaited<ReturnType<typeof team>>) {
  const [lead, ...rest] = t.cs;
  lead.send({ t: 'p.create', dungeon: 'L005-006' });
  const st = await lead.wait((m) => m.t === 'p.state');
  for (let i = 0; i < rest.length; i++) {
    lead.send({ t: 'p.invite', to: t.kids[i + 1].id });
    const inv = await rest[i].wait((m) => m.t === 'p.invite');
    rest[i].send({ t: 'p.join', pid: inv.pid });
    rest[i].send({ t: 'p.ready', ready: true });
  }
  await lead.wait((m) => m.t === 'p.state' && m.party.members.length === t.cs.length && m.party.members.every((x: any) => x.ready));
  lead.send({ t: 'p.start' });
  return { pid: st.party.id, start: await lead.wait((m) => m.t === 'p.start') };
}
const lastB = (c: Client) => [...c.msgs].reverse().find((m) => m.t === 'p.b');

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'nce-party-'));
  const app = createApp({ dataDir: path.join(dir, 'data'), adminPassword: 'admin-pass-123', phraseIds: new Set(), party: { attackMs: 400, comboMs: 300, dodgeMs: 250, rescueGapMs: 50, maxBattleMs: 60000 } });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', () => r()));
  port = (app.server.address() as AddressInfo).port;
  close = app.close;
  adminCookie = (await post('', '/api/admin/login', { password: 'admin-pass-123' })).c;
});
afterAll(async () => {
  await close();
  rmSync(dir, { recursive: true, force: true });
});

describe('组队', () => {
  it('只能邀请在线的好友；陌生人邀请不了；接受后大家都看到队伍；没准备好不能开战', async () => {
    const t = await team(3, 'pa');
    const stranger = await kid('acct_paStranger');
    const sc = await ws(stranger.cookie);
    sc.send({ t: 'join', district: 'campus', x: 1, p: look('路人') });
    await sc.wait((m) => m.t === 'room');
    const [lead, b] = t.cs;
    lead.send({ t: 'p.create', dungeon: 'L005-006' });
    const st = await lead.wait((m) => m.t === 'p.state');
    expect(st.party).toMatchObject({ leader: t.kids[0].id, dungeon: 'L005-006', state: 'lobby' });
    lead.send({ t: 'p.invite', to: stranger.id });
    await lead.wait((m) => m.t === 'p.err');
    expect(sc.msgs.some((m) => m.t === 'p.invite')).toBe(false);
    lead.send({ t: 'p.invite', to: t.kids[1].id });
    const inv = await b.wait((m) => m.t === 'p.invite');
    expect(inv).toMatchObject({ from: { name: 'pa0' }, dungeon: 'L005-006' });
    b.send({ t: 'p.join', pid: inv.pid });
    const st2 = await lead.wait((m) => m.t === 'p.state' && m.party.members.length === 2);
    expect(st2.party.members.map((x: any) => x.name)).toEqual(['pa0', 'pa1']);
    expect(st2.party.members[1].ready).toBe(false);
    lead.send({ t: 'p.start' });
    await lead.wait((m) => m.t === 'p.err');                    // 队友没准备好
    expect(lead.msgs.some((m) => m.t === 'p.start')).toBe(false);
    // 没被邀请的人不能硬加入
    sc.send({ t: 'p.join', pid: inv.pid });
    await sc.wait((m) => m.t === 'p.err');
    for (const c of [...t.cs, sc]) c.end();
  });

  it('开战后：答对打 Boss，合击额外伤害，答错掉心；Boss 血量所有人看到的一致', async () => {
    const t = await team(2, 'pb');
    const { start } = await launch(t);
    expect(start.battle).toMatchObject({ bossMax: 32, bossHp: 32, phase: 'fight' });
    const [a, b] = t.cs;
    a.send({ t: 'p.ans', ok: true, g: 'hit' });
    await b.wait((m) => m.t === 'p.b' && m.ev.k === 'hit' && m.ev.who === t.kids[0].id);
    expect(lastB(b).s.bossHp).toBe(31);
    b.send({ t: 'p.ans', ok: true, g: 'perfect' });                // 300ms 内：合击
    const combo = await a.wait((m) => m.t === 'p.b' && m.ev.combo);
    expect(combo.ev).toMatchObject({ who: t.kids[1].id, combo: t.kids[0].id, dmg: 4 });   // 完美 2 + 合击 2
    expect(combo.s.bossHp).toBe(27);
    await sleep(350);
    a.send({ t: 'p.ans', ok: true, g: 'hit' });                    // 超过合击窗口：只有 1
    await b.wait((m) => m.t === 'p.b' && m.s.bossHp === 26);
    b.send({ t: 'p.ans', ok: false, g: 'hit' });
    const w = await a.wait((m) => m.t === 'p.b' && m.ev.k === 'wrong');
    expect(w.ev.who).toBe(t.kids[1].id);
    expect(w.ev.hearts).toBeLessThanOrEqual(4);                     // Boss 的定时出招可能已经先扣过一颗
    expect(JSON.stringify([...a.msgs, ...b.msgs])).not.toMatch(/acct_|pass-1234|cookie/);   // 战斗消息里只有账号 id，没有登录名
    for (const c of t.cs) c.end();
  });

  it('心掉光就倒下，队友答对救援题把他扶起来；全员倒下输掉', async () => {
    const t = await team(2, 'pc');
    await launch(t);
    const [a, b] = t.cs;
    for (let i = 0; i < 5; i++) b.send({ t: 'p.ans', ok: false, g: 'hit' });
    const down = await a.wait((m) => m.t === 'p.b' && m.s.members.find((x: any) => x.id === t.kids[1].id)?.down);
    expect(down.s.members.find((x: any) => x.id === t.kids[1].id).hearts).toBe(0);
    b.send({ t: 'p.ans', ok: true, g: 'hit' });                    // 倒下后的作答无效
    await sleep(80);
    expect(lastB(a).s.bossHp).toBe(32);
    a.send({ t: 'p.rescue', target: t.kids[1].id });
    const rescued = await b.wait((m) => m.t === 'p.b' && m.ev.k === 'rescue');
    expect(rescued.s.members.find((x: any) => x.id === t.kids[1].id)).toMatchObject({ down: false, hearts: 2 });
    // 两个人都答错到倒下 → 输
    for (let i = 0; i < 5; i++) a.send({ t: 'p.ans', ok: false, g: 'hit' });
    for (let i = 0; i < 2; i++) b.send({ t: 'p.ans', ok: false, g: 'hit' });
    const end = await a.wait((m) => m.t === 'p.end');
    expect(end).toMatchObject({ win: false, reason: 'down' });
    for (const c of t.cs) c.end();
  });

  it('Boss 血量降到 25% 进入合唱终结：每个活着的人都完成一次才算赢', async () => {
    const t = await team(2, 'pd');
    await launch(t);
    const [a, b] = t.cs;
    // 一直答对（交替，避开合击窗口以外的干扰无所谓）直到进入终结
    for (let i = 0; i < 40 && !a.msgs.some((m) => m.t === 'p.b' && m.ev.finale); i++) {
      (i % 2 ? a : b).send({ t: 'p.ans', ok: true, g: 'perfect' });
      await sleep(30);
    }
    const fin = await a.wait((m) => m.t === 'p.b' && m.ev.finale);
    expect(fin.s).toMatchObject({ phase: 'finale', bossHp: 8, finaleNeed: 2 });
    a.send({ t: 'p.ans', ok: true, g: 'perfect' });                // 终结阶段不再掉血
    await sleep(60);
    expect(lastB(a).s.bossHp).toBe(8);
    a.send({ t: 'p.finale' });
    const c1 = await b.wait((m) => m.t === 'p.b' && m.ev.k === 'chorus');
    expect(c1.s.finaleNeed).toBe(1);
    expect(a.msgs.some((m) => m.t === 'p.end')).toBe(false);
    b.send({ t: 'p.finale' });
    const end = await a.wait((m) => m.t === 'p.end');
    expect(end).toMatchObject({ win: true, reason: 'win' });
    expect(end.stats.map((s: any) => s.name)).toEqual(['pd0', 'pd1']);
    expect(end.stats.reduce((n: number, s: any) => n + s.correct, 0)).toBeGreaterThan(8);
    for (const c of t.cs) c.end();
  });

  it('战斗中有人断线：算他倒下，另一个人继续；剩下的人完成终结就赢；全断线则队伍消失', async () => {
    const t = await team(2, 'pe');
    await launch(t);
    const [a, b] = t.cs;
    b.end();
    const left = await a.wait((m) => m.t === 'p.b' && m.ev.k === 'left');
    expect(left.s.members.find((x: any) => x.id === t.kids[1].id)).toMatchObject({ left: true, down: true });
    for (let i = 0; i < 40 && !a.msgs.some((m) => m.t === 'p.b' && m.ev.finale); i++) {
      a.send({ t: 'p.ans', ok: true, g: 'perfect' });
      await sleep(20);
    }
    await a.wait((m) => m.t === 'p.b' && m.ev.finale);
    a.send({ t: 'p.finale' });
    expect((await a.wait((m) => m.t === 'p.end')).win).toBe(true);
    a.end();
  });

  it('大厅里队长离队，队长换人；同一个账号不能同时在两支队伍里', async () => {
    const t = await team(3, 'pf');
    const [lead, b, c] = t.cs;
    lead.send({ t: 'p.create', dungeon: 'L001-002' });
    await lead.wait((m) => m.t === 'p.state');
    for (const [i, who] of [[1, b], [2, c]] as const) {
      lead.send({ t: 'p.invite', to: t.kids[i].id });
      const inv = await who.wait((m) => m.t === 'p.invite');
      who.send({ t: 'p.join', pid: inv.pid });
    }
    await lead.wait((m) => m.t === 'p.state' && m.party.members.length === 3);
    b.send({ t: 'p.create', dungeon: 'L003-004' });                 // 已经在队里：忽略
    await sleep(100);
    expect(b.msgs.filter((m) => m.t === 'p.state').every((m) => m.party.dungeon === 'L001-002')).toBe(true);
    lead.send({ t: 'p.leave' });
    const st = await b.wait((m) => m.t === 'p.state' && m.party.members.length === 2 && m.party.leader !== t.kids[0].id);
    expect(st.party.leader).toBe(t.kids[1].id);
    expect((await lead.wait((m) => m.t === 'p.gone')).reason).toContain('离开');
    for (const x of t.cs) x.end();
  });
});
