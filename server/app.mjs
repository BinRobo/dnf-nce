// 英语地下城 · 账号与云存档服务（零依赖，Node ≥ 18）
// 同时可以托管打包好的游戏（STATIC_DIR），所以一个进程就能跑起整个站点。
// 数据都是 JSON 文件，放在 DATA_DIR：users.json / invites.json / sessions.json / saves / snapshots / trash。
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRealtime } from './realtime.mjs';
import { createSocial } from './social.mjs';

const MAX_BODY = 3 * 1024 * 1024;
const SESSION_DAYS = 90;
const ADMIN_HOURS = 12;
const SNAPSHOT_GAP_MS = 10 * 60_000;
const SNAPSHOT_KEEP = 15;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
};
const GZIP_TYPES = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest', '.txt']);

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const rid = (n = 16) => crypto.randomBytes(n).toString('hex');
const safeEq = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
function hashPassword(pw, salt = rid(16)) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
function checkPassword(pw, u) {
  const h = crypto.scryptSync(pw, u.salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(u.hash, 'hex'));
}
/** 去掉容易看错的字符（0/O、1/I） */
const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newInvite = () => Array.from(crypto.randomBytes(8), (b) => INVITE_CHARS[b % INVITE_CHARS.length]).join('');

class JsonFile {
  constructor(file, init) {
    this.file = file;
    try {
      this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      this.data = init;
    }
  }
  save() {
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}

class HttpError extends Error {
  constructor(code, msg, extra = {}) {
    super(msg);
    this.code = code;
    this.extra = extra;
  }
}

export function createApp(opts) {
  const dataDir = path.resolve(opts.dataDir);
  const staticDir = opts.staticDir ? path.resolve(opts.staticDir) : null;
  const maxSaves = opts.maxSaves ?? 4;
  const adminPassword = opts.adminPassword;
  if (!adminPassword || adminPassword.length < 8) throw new Error('必须设置 ADMIN_PASSWORD（至少 8 位）');
  for (const d of ['saves', 'snapshots', 'trash']) fs.mkdirSync(path.join(dataDir, d), { recursive: true });

  const usersF = new JsonFile(path.join(dataDir, 'users.json'), { users: {} });
  const invitesF = new JsonFile(path.join(dataDir, 'invites.json'), { invites: {} });
  const sessionsF = new JsonFile(path.join(dataDir, 'sessions.json'), { sessions: {} });
  const users = usersF.data.users;
  const invites = invitesF.data.invites;
  const sessions = sessionsF.data.sessions;

  // ---------- 小工具 ----------
  const ip = (req) => (opts.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '') || req.socket.remoteAddress || '?';
  const fails = new Map();
  function limited(key, max = 8, windowMs = 10 * 60_000) {
    const now = Date.now();
    const arr = (fails.get(key) ?? []).filter((t) => now - t < windowMs);
    fails.set(key, arr);
    return arr.length >= max;
  }
  const fail = (key) => fails.set(key, [...(fails.get(key) ?? []), Date.now()]);

  const parseCookies = (req) =>
    Object.fromEntries(String(req.headers.cookie ?? '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
  const cookie = (name, value, maxAgeSec) =>
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${opts.secureCookie ? '; Secure' : ''}`;

  function send(res, code, body, headers = {}) {
    const buf = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
    res.end(buf);
  }

  async function readJson(req) {
    const type = String(req.headers['content-type'] ?? '');
    if (!type.includes('application/json')) throw new HttpError(415, '需要 JSON 请求');
    const chunks = [];
    let n = 0;
    for await (const c of req) {
      n += c.length;
      if (n > MAX_BODY) throw new HttpError(413, '数据太大');
      chunks.push(c);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      throw new HttpError(400, 'JSON 格式不对');
    }
  }

  // ---------- 会话 ----------
  function newSession(kind, uid, hours) {
    const token = rid(32);
    sessions[sha(token)] = { kind, uid, exp: Date.now() + hours * 3600_000 };
    sessionsF.save();
    return token;
  }
  function session(req, kind) {
    const c = parseCookies(req);
    const token = kind === 'admin' ? c.nce_admin : c.nce_sid;
    if (!token) return null;
    const key = sha(token);
    const s = sessions[key];
    if (!s || s.kind !== kind) return null;
    if (s.exp < Date.now()) {
      delete sessions[key];
      sessionsF.save();
      return null;
    }
    return { key, ...s };
  }
  function authUser(req) {
    const s = session(req, 'user');
    const u = s && users[s.uid];
    if (!u || u.disabled) throw new HttpError(401, '请先登录');
    u.lastSeen = Date.now();
    return u;
  }
  function authAdmin(req) {
    if (!session(req, 'admin')) throw new HttpError(401, '请先登录管理后台');
  }
  function dropSessions(uid) {
    for (const [k, s] of Object.entries(sessions)) if (s.uid === uid) delete sessions[k];
    sessionsF.save();
    rt?.kick(uid);
  }

  // ---------- 存档文件 ----------
  const saveDir = (uid) => path.join(dataDir, 'saves', uid);
  const saveFile = (uid, id) => path.join(saveDir(uid), `${id}.json`);
  const snapDir = (uid, id) => path.join(dataDir, 'snapshots', uid, id);
  const ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
  function readSave(uid, id) {
    try {
      return JSON.parse(fs.readFileSync(saveFile(uid, id), 'utf8'));
    } catch {
      return null;
    }
  }
  const listSaveIds = (uid) => (fs.existsSync(saveDir(uid)) ? fs.readdirSync(saveDir(uid)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : []);
  function writeAtomic(file, text) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  }
  function snapshot(uid, id, rec, force = false) {
    const dir = snapDir(uid, id);
    fs.mkdirSync(dir, { recursive: true });
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    const last = Number(files.at(-1)?.slice(0, -5) ?? 0);
    if (!force && Date.now() - last < SNAPSHOT_GAP_MS) return;
    writeAtomic(path.join(dir, `${Date.now()}.json`), JSON.stringify(rec));
    for (const f of files.slice(0, Math.max(0, files.length + 1 - SNAPSHOT_KEEP))) fs.rmSync(path.join(dir, f), { force: true });
  }
  const meta = (id, rec) => ({
    id, rev: rec.rev, updatedAt: rec.updatedAt, name: rec.data.name, level: rec.data.level, cls: rec.data.cls ?? 'sword', gender: rec.data.gender ?? 'm',
    cleared: Object.values(rec.data.dungeons ?? {}).filter((d) => d.clears > 0).length,
    todayMin: rec.data.playtime?.day === new Date(rec.updatedAt).toISOString().slice(0, 10) ? Math.round((rec.data.playtime?.ms ?? 0) / 60000) : undefined,
  });
  function validSave(id, data) {
    return data && typeof data === 'object' && data.id === id && typeof data.name === 'string' && data.name.length <= 40 && Number.isFinite(data.level) && Number.isFinite(data.updatedAt) && typeof data.version === 'number';
  }

  let rt;
  const social = createSocial({ users, usersF, HttpError, limited, fail, ip, readJson, send, authUser, listSaveIds, readSave, rt: () => rt, dataDir, phraseOk });

  // ---------- API ----------
  const publicUser = (u) => ({ id: u.id, username: u.username, displayName: u.displayName, dailyMinutes: u.dailyMinutes ?? null, social: u.social !== false });

  async function api(req, res, url) {
    const m = req.method;
    const p = url.pathname;
    // 防跨站请求：浏览器带 Origin 时必须和 Host 一致
    if (m !== 'GET' && req.headers.origin) {
      let same = false;
      try {
        same = new URL(req.headers.origin).host === req.headers.host;
      } catch {}
      if (!same) throw new HttpError(403, '来源不被允许');
    }
    if (p === '/api/health') return send(res, 200, { ok: true, time: Date.now() });

    // ----- 用户 -----
    if (p === '/api/register' && m === 'POST') {
      const b = await readJson(req);
      const key = `reg:${ip(req)}`;
      if (limited(key, 10)) throw new HttpError(429, '尝试太多次，请稍后再试');
      const code = String(b.invite ?? '').trim().toUpperCase().replace(/[\s-]/g, '');
      const inv = invites[code];
      const username = String(b.username ?? '').trim();
      const password = String(b.password ?? '');
      // 分开说清楚是哪种情况，家长和孩子才知道怎么办
      const why = !inv ? '没有这个邀请码：请检查有没有输错，或让家长在后台看看它还在不在' : inv.exp < Date.now() ? '这个邀请码已经过期了，请让家长重新生成一个' : inv.used >= inv.maxUses ? '这个邀请码已经用完了，请让家长重新生成一个' : '';
      if (why) {
        fail(key);
        throw new HttpError(400, why);
      }
      if (!/^[A-Za-z0-9_一-龥]{2,16}$/.test(username)) throw new HttpError(400, '用户名要 2–16 个字（字母、数字、下划线或汉字）');
      if (password.length < 6 || password.length > 64) throw new HttpError(400, '密码至少 6 位');
      if (Object.values(users).some((u) => u.username.toLowerCase() === username.toLowerCase())) throw new HttpError(409, '这个用户名被用过了，换一个吧');
      const id = rid(8);
      users[id] = { id, username, displayName: username, ...hashPassword(password), createdAt: Date.now(), lastSeen: Date.now(), disabled: false, dailyMinutes: null, invite: code, label: inv.label };
      inv.used++;
      usersF.save();
      invitesF.save();
      const token = newSession('user', id, SESSION_DAYS * 24);
      return send(res, 200, { user: publicUser(users[id]) }, { 'Set-Cookie': cookie('nce_sid', token, SESSION_DAYS * 86400) });
    }
    if (p === '/api/login' && m === 'POST') {
      const b = await readJson(req);
      const username = String(b.username ?? '').trim();
      const key = `login:${ip(req)}:${username.toLowerCase()}`;
      if (limited(key)) throw new HttpError(429, '密码错得太多了，过几分钟再试');
      const u = Object.values(users).find((x) => x.username.toLowerCase() === username.toLowerCase());
      let ok = false;
      try {
        ok = !!u && checkPassword(String(b.password ?? ''), u);
      } catch {}
      if (!ok) {
        fail(key);
        throw new HttpError(401, '用户名或密码不对');
      }
      if (u.disabled) throw new HttpError(403, '这个账号被家长暂停了');
      u.lastSeen = Date.now();
      usersF.save();
      const token = newSession('user', u.id, SESSION_DAYS * 24);
      return send(res, 200, { user: publicUser(u) }, { 'Set-Cookie': cookie('nce_sid', token, SESSION_DAYS * 86400) });
    }
    if (p === '/api/logout' && m === 'POST') {
      const s = session(req, 'user');
      if (s) {
        delete sessions[s.key];
        sessionsF.save();
      }
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('nce_sid', '', 0) });
    }
    if (p === '/api/me' && m === 'GET') {
      const u = authUser(req);
      return send(res, 200, { user: publicUser(u) });
    }
    if (p === '/api/me/password' && m === 'POST') {
      const u = authUser(req);
      const b = await readJson(req);
      if (!checkPassword(String(b.old ?? ''), u)) throw new HttpError(401, '旧密码不对');
      const pw = String(b.password ?? '');
      if (pw.length < 6 || pw.length > 64) throw new HttpError(400, '新密码至少 6 位');
      Object.assign(u, hashPassword(pw));
      usersF.save();
      return send(res, 200, { ok: true });
    }

    // ----- 好友 -----
    if (await social.handle(req, res, url)) return;

    // ----- 云存档 -----
    if (p === '/api/saves' && m === 'GET') {
      const u = authUser(req);
      const list = listSaveIds(u.id).map((id) => ({ id, rec: readSave(u.id, id) })).filter((x) => x.rec).map((x) => meta(x.id, x.rec));
      return send(res, 200, { saves: list });
    }
    const sm = p.match(/^\/api\/saves\/([^/]+)(?:\/(snapshots))?$/);
    if (sm) {
      const u = authUser(req);
      const id = sm[1];
      if (!ID_RE.test(id)) throw new HttpError(400, '存档编号不对');
      if (sm[2] === 'snapshots' && m === 'GET') {
        const dir = snapDir(u.id, id);
        const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse() : [];
        return send(res, 200, { snapshots: files.map((f) => ({ ts: Number(f.slice(0, -5)) })) });
      }
      if (m === 'GET') {
        const rec = readSave(u.id, id);
        if (!rec) throw new HttpError(404, '云端没有这个存档');
        return send(res, 200, { rev: rec.rev, updatedAt: rec.updatedAt, data: rec.data });
      }
      if (m === 'PUT') {
        const b = await readJson(req);
        if (!validSave(id, b.data)) throw new HttpError(400, '存档格式不对');
        const cur = readSave(u.id, id);
        if (cur && b.baseRev !== cur.rev && !b.force) throw new HttpError(409, '云端有更新的进度', { rev: cur.rev, updatedAt: cur.updatedAt });
        if (!cur && listSaveIds(u.id).length >= maxSaves) throw new HttpError(400, `每个账号最多 ${maxSaves} 个角色`);
        if (cur) snapshot(u.id, id, cur, !!b.force);
        const rec = { rev: (cur?.rev ?? 0) + 1, updatedAt: b.data.updatedAt, data: b.data };
        writeAtomic(saveFile(u.id, id), JSON.stringify(rec));
        usersF.save();
        return send(res, 200, { rev: rec.rev });
      }
      if (m === 'DELETE') {
        const rec = readSave(u.id, id);
        if (rec) {
          fs.mkdirSync(path.join(dataDir, 'trash', u.id), { recursive: true });
          fs.renameSync(saveFile(u.id, id), path.join(dataDir, 'trash', u.id, `${id}.${Date.now()}.json`));
        }
        return send(res, 200, { ok: true });
      }
    }

    // ----- 管理后台 -----
    if (p === '/api/admin/login' && m === 'POST') {
      const b = await readJson(req);
      const key = `admin:${ip(req)}`;
      if (limited(key, 5)) throw new HttpError(429, '尝试太多次，请 10 分钟后再试');
      if (!safeEq(b.password ?? '', adminPassword)) {
        fail(key);
        throw new HttpError(401, '管理员密码不对');
      }
      const token = newSession('admin', 'admin', ADMIN_HOURS);
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('nce_admin', token, ADMIN_HOURS * 3600) });
    }
    if (p === '/api/admin/logout' && m === 'POST') {
      const s = session(req, 'admin');
      if (s) {
        delete sessions[s.key];
        sessionsF.save();
      }
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('nce_admin', '', 0) });
    }
    if (p.startsWith('/api/admin/')) {
      authAdmin(req);
      if (p === '/api/admin/overview' && m === 'GET') {
        const now = Date.now();
        return send(res, 200, {
          users: Object.values(users).map((u) => ({
            id: u.id, username: u.username, createdAt: u.createdAt, lastSeen: u.lastSeen, disabled: u.disabled, dailyMinutes: u.dailyMinutes ?? null, label: u.label ?? '',
            social: u.social !== false, online: rt?.online(u.id) ?? null, friends: (u.friends ?? []).map((id) => users[id]?.username).filter(Boolean),
            saves: listSaveIds(u.id).map((id) => ({ id, rec: readSave(u.id, id) })).filter((x) => x.rec).map((x) => meta(x.id, x.rec)),
          })),
          invites: Object.entries(invites).map(([code, i]) => ({ code, label: i.label, exp: i.exp, used: i.used, maxUses: i.maxUses, active: i.exp > now && i.used < i.maxUses })),
        });
      }
      if (p === '/api/admin/gifts' && m === 'GET') {
        return send(res, 200, { gifts: social.recentGifts(Math.min(300, Number(url.searchParams.get('limit')) || 100)) });
      }
      if (p === '/api/admin/invites' && m === 'POST') {
        const b = await readJson(req);
        const days = Math.min(60, Math.max(1, Number(b.days) || 14));
        const code = newInvite();
        invites[code] = { label: String(b.label ?? '').slice(0, 20), exp: Date.now() + days * 86400_000, used: 0, maxUses: Math.min(10, Math.max(1, Number(b.maxUses) || 1)), createdAt: Date.now() };
        invitesF.save();
        return send(res, 200, { code, exp: invites[code].exp });
      }
      const im = p.match(/^\/api\/admin\/invites\/([A-Z0-9]+)$/);
      if (im && m === 'DELETE') {
        delete invites[im[1]];
        invitesF.save();
        return send(res, 200, { ok: true });
      }
      const um = p.match(/^\/api\/admin\/users\/([0-9a-f]+)(?:\/([a-z]+))?(?:\/([A-Za-z0-9_-]+))?(?:\/([a-z]+))?$/);
      if (um) {
        const u = users[um[1]];
        if (!u) throw new HttpError(404, '没有这个账号');
        const [, , action, arg, sub] = um;
        if (!action && m === 'DELETE') {
          fs.mkdirSync(path.join(dataDir, 'trash', u.id), { recursive: true });
          for (const id of listSaveIds(u.id)) fs.renameSync(saveFile(u.id, id), path.join(dataDir, 'trash', u.id, `${id}.${Date.now()}.json`));
          social.forget(u.id);
          delete users[u.id];
          dropSessions(u.id);
          usersF.save();
          return send(res, 200, { ok: true });
        }
        if (action === 'password' && m === 'POST') {
          const b = await readJson(req);
          const pw = String(b.password ?? '');
          if (pw.length < 6 || pw.length > 64) throw new HttpError(400, '密码至少 6 位');
          Object.assign(u, hashPassword(pw));
          dropSessions(u.id);
          usersF.save();
          return send(res, 200, { ok: true });
        }
        if (action === 'disable' && m === 'POST') {
          const b = await readJson(req);
          u.disabled = !!b.disabled;
          if (u.disabled) dropSessions(u.id);
          usersF.save();
          return send(res, 200, { ok: true });
        }
        if (action === 'social' && m === 'POST') {
          const b = await readJson(req);
          u.social = !!b.enabled;
          if (!u.social) rt?.kick(u.id, 4003, '多人功能已被家长关闭');
          usersF.save();
          return send(res, 200, { ok: true });
        }
        if (action === 'limit' && m === 'POST') {
          const b = await readJson(req);
          const n = b.dailyMinutes === null || b.dailyMinutes === '' ? null : Math.round(Number(b.dailyMinutes));
          if (n !== null && !(n >= 5 && n <= 600)) throw new HttpError(400, '每天时长 5–600 分钟');
          u.dailyMinutes = n;
          usersF.save();
          return send(res, 200, { ok: true });
        }
        if (action === 'saves' && arg && ID_RE.test(arg)) {
          const rec = readSave(u.id, arg);
          if (!rec) throw new HttpError(404, '没有这个存档');
          if (!sub && m === 'GET') return send(res, 200, rec);
          if (sub === 'snapshots' && m === 'GET') {
            const dir = snapDir(u.id, arg);
            const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse() : [];
            return send(res, 200, {
              snapshots: files.map((f) => {
                const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
                return { ts: Number(f.slice(0, -5)), ...meta(arg, s) };
              }),
            });
          }
          if (sub === 'restore' && m === 'POST') {
            const b = await readJson(req);
            const f = path.join(snapDir(u.id, arg), `${Number(b.ts)}.json`);
            if (!fs.existsSync(f)) throw new HttpError(404, '没有这个快照');
            const old = JSON.parse(fs.readFileSync(f, 'utf8'));
            snapshot(u.id, arg, rec, true);
            // rev +1 且 updatedAt 取现在，孩子的设备下次打开就会拉到恢复后的进度
            const data = { ...old.data, updatedAt: Date.now() };
            writeAtomic(saveFile(u.id, arg), JSON.stringify({ rev: rec.rev + 1, updatedAt: data.updatedAt, data }));
            return send(res, 200, { ok: true });
          }
        }
      }
    }
    throw new HttpError(404, '没有这个接口');
  }

  // ---------- 静态文件 ----------
  function serveStatic(req, res, url) {
    if (!staticDir || (req.method !== 'GET' && req.method !== 'HEAD')) return send(res, 404, { error: '没有这个页面' });
    let rel;
    try {
      rel = decodeURIComponent(url.pathname);
    } catch {
      return send(res, 400, { error: '地址不对' });
    }
    if (rel === '/admin' || rel === '/admin/') rel = '/admin.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(staticDir, rel);
    if (!file.startsWith(staticDir + path.sep) || path.basename(file).startsWith('.')) return send(res, 403, { error: '不允许' });
    let st;
    try {
      st = fs.statSync(file);
      if (st.isDirectory()) return send(res, 404, { error: '没有这个页面' });
    } catch {
      return send(res, 404, { error: '没有这个页面' });
    }
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Last-Modified': st.mtime.toUTCString(), 'Accept-Ranges': 'bytes',
      'Cache-Control': rel === '/admin.html' ? 'no-store' : /\/assets\/index-[\w-]+\.js$/.test(rel) ? 'public, max-age=31536000, immutable' : ext === '.json' || ext === '.html' || rel === '/sw.js' ? 'no-cache' : ext === '.mp4' || ext === '.mp3' ? 'public, max-age=604800' : 'public, max-age=86400',
    };
    if (rel === '/admin.html') headers['X-Frame-Options'] = 'DENY';
    const ims = req.headers['if-modified-since'];
    if (ims && new Date(ims) >= new Date(Math.floor(st.mtimeMs / 1000) * 1000)) {
      res.writeHead(304, headers);
      return res.end();
    }
    const range = String(req.headers.range ?? '').match(/^bytes=(\d*)-(\d*)$/);
    if (range && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
      let end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      if (start >= st.size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
        return res.end();
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return req.method === 'HEAD' ? res.end() : fs.createReadStream(file, { start, end }).pipe(res);
    }
    const gz = GZIP_TYPES.has(ext) && st.size > 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    if (gz) {
      res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
      return req.method === 'HEAD' ? res.end() : fs.createReadStream(file).pipe(zlib.createGzip({ level: 6 })).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    return req.method === 'HEAD' ? res.end() : fs.createReadStream(file).pipe(res);
  }

  // ---------- 多人在线（WebSocket） ----------
  // 预设短句表：孩子只能发这里面的 id。服务器从托管的游戏目录里读，每分钟刷新一次
  let phraseCache = { at: 0, ids: null };
  function phraseOk(id) {
    if (opts.phraseIds) return opts.phraseIds.has(id);
    if (Date.now() - phraseCache.at > 60_000) {
      let ids = null;
      // 线上：托管目录里的 content/social/phrases.json；本地开发（没有托管目录）：public/ 里的
      for (const dir of [staticDir, path.resolve('public')]) {
        if (!dir) continue;
        try {
          ids = new Set(JSON.parse(fs.readFileSync(path.join(dir, 'content', 'social', 'phrases.json'), 'utf8')).map((p) => p.id));
          break;
        } catch {
          /* 换下一个位置；都没有就全部拒绝 */
        }
      }
      phraseCache = { at: Date.now(), ids };
    }
    return !!phraseCache.ids?.has(id);
  }
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else serveStatic(req, res, url);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.code, { error: e.message, ...e.extra });
      console.error(e);
      if (!res.headersSent) send(res, 500, { error: '服务器出错了' });
    }
  });
  server.requestTimeout = 60_000;
  rt = createRealtime({
    server,
    phraseOk,
    users,
    partyOpts: opts.party,
    authenticate: (req) => {
      const sess = session(req, 'user');
      const u = sess && users[sess.uid];
      if (!u || u.disabled) return { code: 401 };
      if (u.social === false) return { code: 403 };
      u.lastSeen = Date.now();
      return { user: u };
    },
  });
  return { server, rt, close: () => new Promise((r) => { rt.closeAll(); server.close(() => r()); server.closeAllConnections?.(); }) };
}
