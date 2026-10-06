// 多人在线：同一街区里的孩子能互相看到、发预设短句。
// 手写的最小 WebSocket 服务（RFC 6455），保持后端零依赖。在线状态只放内存，不写磁盘。
//
// 客户端 → 服务器（JSON 文本）：
//   {t:'join', district, x, d, p:{name,cls,gender,lv,worn,wpn,title}}  进入街区（会自动离开上一个）
//   {t:'mv', x, d, m}      位置 / 朝向 d(-1,0,1) / 是否在走 m
//   {t:'say', id}          发一句预设短句（id 必须在短句表里）
//   {t:'who'}              问现在谁在线
//   {t:'leave'}            离开街区（进副本时）
// 服务器 → 客户端：
//   {t:'room', district, you, players:[...]}  进街区后收到的全部在线者
//   {t:'in', p} / {t:'out', id} / {t:'mv', id, x, d, m} / {t:'say', id, ph}
//   {t:'who', list:[{id,name,lv,district}]}
import crypto from 'node:crypto';
import { createParties } from './party.mjs';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 4096;
const MAX_CONNS = 60;
const CLASSES = new Set(['sword', 'gunner', 'mage']);
const RARITY = new Set(['common', 'uncommon', 'rare', 'legendary', 'epic']);
const DISTRICT_RE = /^[a-z]{2,12}$/;
const ID_RE = /^[a-z0-9_]{1,24}$/;

function frame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x80 | opcode;
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | opcode;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').slice(0, n) : '');
const num = (v, lo, hi, d = lo) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
const worn = (v) => {
  const o = {};
  for (const k of ['hat', 'top', 'bottom']) if (typeof v?.[k] === 'string' && /^[a-z]{2,12}$/.test(v[k])) o[k] = v[k];
  return o;
};
/** 外观信息只留白名单字段，限制长度，防止别人往里塞东西 */
function sanitizeLook(p) {
  return {
    name: str(p?.name, 12) || '冒险者',
    cls: CLASSES.has(p?.cls) ? p.cls : 'sword',
    gender: p?.gender === 'f' ? 'f' : 'm',
    lv: num(p?.lv, 1, 99, 1),
    worn: worn(p?.worn),
    wpn: p?.wpn && typeof p.wpn.name === 'string' ? { name: str(p.wpn.name, 30), rarity: RARITY.has(p.wpn.rarity) ? p.wpn.rarity : 'common' } : null,
    title: str(p?.title, 10),
  };
}

class Conn {
  constructor(socket, user) {
    this.socket = socket;
    this.uid = user.id;
    this.alive = true;
    this.buf = Buffer.alloc(0);
    this.district = null;
    this.look = null;
    this.x = 0;
    this.d = 0;
    this.m = false;
    this.lastPong = Date.now();
    this.moveTokens = 20;
    this.sayAt = 0;
    this.tokenAt = Date.now();
  }
  send(obj) {
    if (!this.alive) return;
    try {
      this.socket.write(frame(1, Buffer.from(JSON.stringify(obj))));
    } catch {
      this.alive = false;
    }
  }
  raw(op, payload = Buffer.alloc(0)) {
    if (this.alive) this.socket.write(frame(op, payload));
  }
  close(code = 1000, reason = '') {
    if (!this.alive) return;
    const r = Buffer.from(reason);
    const p = Buffer.alloc(2 + r.length);
    p.writeUInt16BE(code, 0);
    r.copy(p, 2);
    try {
      this.socket.write(frame(8, p));
      this.socket.end();
    } catch {
      /* 对方已断开 */
    }
    this.alive = false;
  }
  view() {
    return { id: this.uid, ...this.look, x: this.x, d: this.d, m: this.m };
  }
}

export function createRealtime({ server, authenticate, phraseOk, users = {}, partyOpts = {} }) {
  /** uid → Conn */
  const conns = new Map();
  /** 街区 → Set<Conn> */
  const rooms = new Map();

  const parties = createParties({ getConn: (uid) => conns.get(uid), users, opts: partyOpts });
  const roomOf = (c) => (c.district ? rooms.get(c.district) : undefined);
  function broadcast(room, msg, except) {
    if (!room) return;
    for (const c of room) if (c !== except) c.send(msg);
  }
  function leaveRoom(c) {
    const room = roomOf(c);
    if (!room) return;
    room.delete(c);
    if (!room.size) rooms.delete(c.district);
    broadcast(room, { t: 'out', id: c.uid });
    c.district = null;
  }
  function drop(c) {
    leaveRoom(c);
    if (conns.get(c.uid) === c) {
      parties.onDisconnect(c.uid);
      conns.delete(c.uid);
    }
    c.alive = false;
  }

  function onMessage(c, text) {
    let m;
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }
    const now = Date.now();
    switch (m?.t) {
      case 'join': {
        if (typeof m.district !== 'string' || !DISTRICT_RE.test(m.district)) return;
        leaveRoom(c);
        c.district = m.district;
        c.look = sanitizeLook(m.p);
        c.x = num(m.x, 0, 6000, 0);
        c.d = [-1, 0, 1].includes(m.d) ? m.d : 0;
        c.m = false;
        let room = rooms.get(c.district);
        if (!room) rooms.set(c.district, (room = new Set()));
        const others = [...room].map((o) => o.view());
        room.add(c);
        c.send({ t: 'room', district: c.district, you: c.uid, players: others });
        broadcast(room, { t: 'in', p: c.view() }, c);
        break;
      }
      case 'mv': {
        if (!c.district) return;
        // 令牌桶：平均每秒 12 次，突发 20 次；超了直接丢掉
        c.moveTokens = Math.min(20, c.moveTokens + ((now - c.tokenAt) / 1000) * 12);
        c.tokenAt = now;
        if (c.moveTokens < 1) return;
        c.moveTokens--;
        c.x = num(m.x, 0, 6000, c.x);
        c.d = [-1, 0, 1].includes(m.d) ? m.d : c.d;
        c.m = !!m.m;
        broadcast(roomOf(c), { t: 'mv', id: c.uid, x: c.x, d: c.d, m: c.m }, c);
        break;
      }
      case 'say': {
        if (!c.district || now - c.sayAt < 1500) return;
        if (typeof m.id !== 'string' || !ID_RE.test(m.id) || !phraseOk(m.id)) return;
        c.sayAt = now;
        broadcast(roomOf(c), { t: 'say', id: c.uid, ph: m.id }, c);
        break;
      }
      case 'who': {
        c.send({ t: 'who', list: [...conns.values()].filter((o) => o.look).map((o) => ({ id: o.uid, name: o.look.name, lv: o.look.lv, district: o.district })) });
        break;
      }
      case 'leave':
        leaveRoom(c);
        break;
      default:
        // 组队（p.xxx）
        if (typeof m?.t === 'string' && m.t.startsWith('p.')) parties.handle(c, m);
    }
  }

  function onData(c, chunk) {
    c.buf = Buffer.concat([c.buf, chunk]);
    while (c.alive) {
      const b = c.buf;
      if (b.length < 2) return;
      const fin = !!(b[0] & 0x80);
      const op = b[0] & 0x0f;
      const masked = !!(b[1] & 0x80);
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(MAX_FRAME)) return c.close(1009, '消息太大');
        len = Number(big);
        off = 10;
      }
      if (!masked) return c.close(1002, '客户端数据必须掩码');
      if (len > MAX_FRAME) return c.close(1009, '消息太大');
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      const data = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      c.buf = b.subarray(off + 4 + len);
      if (!fin || op === 0) return c.close(1003, '不支持分片');
      if (op === 1) onMessage(c, data.toString('utf8'));
      else if (op === 8) return c.close(1000);
      else if (op === 9) c.raw(10, data);
      else if (op === 10) c.lastPong = Date.now();
    }
  }

  server.on('upgrade', (req, socket) => {
    const reject = (code, msg) => {
      socket.end(`HTTP/1.1 ${code} ${msg}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    };
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws') return reject(404, 'Not Found');
    const key = req.headers['sec-websocket-key'];
    if (String(req.headers.upgrade).toLowerCase() !== 'websocket' || !key) return reject(400, 'Bad Request');
    // 防跨站劫持：浏览器带 Origin 时必须和 Host 一致
    if (req.headers.origin) {
      let same = false;
      try {
        same = new URL(req.headers.origin).host === req.headers.host;
      } catch {}
      if (!same) return reject(403, 'Forbidden');
    }
    const auth = authenticate(req);
    if (auth.code) return reject(auth.code, auth.code === 401 ? 'Unauthorized' : 'Forbidden');
    if (conns.size >= MAX_CONNS) return reject(503, 'Service Unavailable');
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.setNoDelay(true);
    socket.setTimeout(0);
    const c = new Conn(socket, auth.user);
    // 同一个账号只保留一个连接（换平板登录会把旧的顶掉）
    const old = conns.get(c.uid);
    if (old) {
      old.close(4001, '在别处登录了');
      drop(old);
    }
    conns.set(c.uid, c);
    socket.on('data', (chunk) => onData(c, chunk));
    socket.on('error', () => drop(c));
    // 对方直接断开（没发关闭帧）：马上算离线，不要等心跳超时留下“幽灵”
    socket.on('end', () => {
      drop(c);
      socket.end();
    });
    socket.on('close', () => drop(c));
  });

  // 心跳：每 25 秒 ping 一次，70 秒没回音就断开（平板睡眠、断网）
  const timer = setInterval(() => {
    const now = Date.now();
    for (const c of conns.values()) {
      if (now - c.lastPong > 70_000) {
        c.close(1001, '超时');
        drop(c);
      } else c.raw(9);
    }
  }, 25_000);
  timer.unref();
  server.on('close', () => clearInterval(timer));

  return {
    /** 这个账号现在在哪个街区；不在线返回 null */
    online: (uid) => {
      const c = conns.get(uid);
      return c ? { district: c.district, name: c.look?.name ?? null } : null;
    },
    /** 家长在后台关了多人功能、暂停或删除账号时，立刻踢下线 */
    kick: (uid, code = 4002, reason = '账号设置已更改') => {
      const c = conns.get(uid);
      if (c) {
        c.close(code, reason);
        drop(c);
      }
    },
    count: () => conns.size,
    /** 给某个在线的账号推一条消息（好友申请、收到信件等） */
    notify: (uid, msg) => conns.get(uid)?.send(msg),
    /** 服务关闭 / 重启时：通知所有人并断开，不然重启要等他们自己断 */
    closeAll: () => {
      for (const c of [...conns.values()]) {
        c.close(1001, '服务器重启，马上回来');
        drop(c);
      }
    },
  };
}
