// 好友与信箱（赠送）。数据放在 users.json 的账号记录里（好友）和 DATA_DIR/mail/（信箱）。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_FRIENDS = 20;
const MAX_INCOMING = 10;
const DAILY_GIFTS = 3;
const MAX_INBOX = 30;
const SLOTS = new Set(['weapon', 'helmet', 'armor', 'shoes', 'accessory', 'ring']);
const RARITY = new Set(['common', 'uncommon', 'rare', 'legendary']); // 史诗不能送
const MATS = new Set(['stone', 'cloth', 'thread', 'brass', 'badge', 'ribbon']);
const MAT_NAME = { stone: '强化石', cloth: '布料', thread: '彩色丝线', brass: '铜喇叭片', badge: '银名牌', ribbon: '节日彩带' };
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').slice(0, n) : '');

export function createSocial(ctx) {
  const { users, usersF, HttpError, limited, fail, ip, readJson, send, authUser, listSaveIds, readSave, dataDir, phraseOk } = ctx;
  const mailFile = (uid) => path.join(dataDir, 'mail', `${uid}.json`);
  const logFile = path.join(dataDir, 'mail-log.jsonl');
  fs.mkdirSync(path.join(dataDir, 'mail'), { recursive: true });
  function readMail(uid) {
    try {
      return JSON.parse(fs.readFileSync(mailFile(uid), 'utf8')).items ?? [];
    } catch {
      return [];
    }
  }
  function writeMail(uid, items) {
    const tmp = `${mailFile(uid)}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ items }));
    fs.renameSync(tmp, mailFile(uid));
  }
  /** 只保留装备该有的字段，限制范围；史诗装备不能送 */
  function cleanGift(g) {
    if (g?.kind === 'item') {
      const it = g.item ?? {};
      if (!SLOTS.has(it.slot) || !RARITY.has(it.rarity)) throw new HttpError(400, it.rarity === 'epic' ? '史诗装备要靠自己打造，不能送人' : '这件装备不能送');
      const name = str(it.name, 30);
      if (!name || name.startsWith('史诗')) throw new HttpError(400, '这件装备不能送');
      return {
        kind: 'item',
        item: {
          uid: str(it.uid, 40), name, slot: it.slot, rarity: it.rarity, atk: clampInt(it.atk, 0, 999), hp: clampInt(it.hp, 0, 20),
          crit: Math.min(1, Math.max(0, Number(it.crit) || 0)), enhance: clampInt(it.enhance, 0, 12), enhanceFails: 0, obtainedAt: Date.now(), from: '',
        },
      };
    }
    if (g?.kind === 'mat') {
      if (!MATS.has(g.mat)) throw new HttpError(400, '这种材料不能送（史诗碎片和 Boss 之魂要靠自己打）');
      return { kind: 'mat', mat: g.mat, n: clampInt(g.n, 1, 20) };
    }
    throw new HttpError(400, '不知道要送什么');
  }
  const giftText = (g) => (g.kind === 'item' ? `${g.item.name}（${g.item.rarity}${g.item.enhance ? ` +${g.item.enhance}` : ''}）` : `${MAT_NAME[g.mat]} ×${g.n}`);
  /** 给家长看的赠送记录：最近 N 条，新的在前 */
  function recentGifts(limit = 100) {
    try {
      return fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).slice(-limit).reverse().map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  }

  const rnd = (n) => Array.from(crypto.randomBytes(n), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');

  /** 好友码（6 位，给对方输入加好友用）；老账号第一次用到时补发 */
  function ensure(u) {
    u.friends ??= [];
    u.reqIn ??= [];
    u.reqOut ??= [];
    if (!u.friendCode) {
      let c;
      do c = rnd(6);
      while (Object.values(users).some((x) => x.friendCode === c));
      u.friendCode = c;
      usersF.save();
    }
    return u;
  }

  /** 这个账号最近玩的角色（好友列表里显示角色名、等级、职业） */
  function latestChar(uid) {
    let best = null;
    for (const id of listSaveIds(uid)) {
      const rec = readSave(uid, id);
      if (rec && (!best || rec.updatedAt > best.updatedAt)) best = rec;
    }
    return best?.data ?? null;
  }
  function view(uid) {
    const u = users[uid];
    if (!u) return null;
    const ch = latestChar(uid);
    const on = ctx.rt()?.online(uid);
    return {
      id: uid, name: ch?.name ?? u.displayName, lv: ch?.level ?? 1, cls: ch?.cls ?? 'sword', gender: ch?.gender ?? 'm',
      online: on ? { district: on.district } : null,
    };
  }
  /** 删账号后，从所有人的好友 / 申请里去掉 */
  function forget(uid) {
    for (const o of Object.values(users)) {
      for (const k of ['friends', 'reqIn', 'reqOut']) if (o[k]) o[k] = o[k].filter((x) => x !== uid);
    }
  }
  const alive = (uid) => users[uid] && !users[uid].disabled;
  const notify = (uid, msg) => ctx.rt()?.notify(uid, msg);
  const lonely = (u) => {
    if (u.social === false) throw new HttpError(403, '多人功能已被家长关闭');
  };

  function link(a, b) {
    for (const [x, y] of [[a, b], [b, a]]) {
      x.reqIn = x.reqIn.filter((i) => i !== y.id);
      x.reqOut = x.reqOut.filter((i) => i !== y.id);
      if (!x.friends.includes(y.id)) x.friends.push(y.id);
    }
    usersF.save();
  }

  /** 返回 true 表示这个请求已经处理 */
  async function handle(req, res, url) {
    const p = url.pathname;
    const m = req.method;
    if (!p.startsWith('/api/friends') && !p.startsWith('/api/mail')) return false;
    const me = ensure(authUser(req));
    lonely(me);
    if (p.startsWith('/api/mail')) return mail(req, res, p, m, me);
    const clean = (list) => {
      const out = list.filter(alive);
      return out;
    };
    if (p === '/api/friends' && m === 'GET') {
      me.friends = clean(me.friends);
      me.reqIn = clean(me.reqIn);
      me.reqOut = clean(me.reqOut);
      send(res, 200, {
        code: me.friendCode, max: MAX_FRIENDS,
        friends: me.friends.map(view).filter(Boolean), incoming: me.reqIn.map(view).filter(Boolean), outgoing: me.reqOut.map(view).filter(Boolean),
      });
      return true;
    }
    if (p === '/api/friends/request' && m === 'POST') {
      const b = await readJson(req);
      const key = `friend:${me.id}`;
      if (limited(key, 15)) throw new HttpError(429, '加得太频繁了，过几分钟再试');
      let target;
      if (b.code) {
        const code = String(b.code).trim().toUpperCase().replace(/[\s-]/g, '');
        target = Object.values(users).find((x) => x.friendCode === code);
        if (!target) {
          fail(key);
          throw new HttpError(404, '没有这个好友码，请检查有没有输错');
        }
      } else if (b.id) {
        // 在城镇里点一下对方就能加：必须两个人现在在同一个街区
        const a = ctx.rt()?.online(me.id);
        const o = ctx.rt()?.online(String(b.id));
        if (!a?.district || a.district !== o?.district) throw new HttpError(400, '对方已经不在这里了');
        target = users[String(b.id)];
      }
      if (!target || !alive(target.id)) throw new HttpError(404, '找不到这位玩家');
      ensure(target);
      if (target.id === me.id) throw new HttpError(400, '不能加自己为好友哦');
      if (target.social === false) throw new HttpError(403, '对方的多人功能被家长关闭了');
      if (me.friends.includes(target.id)) throw new HttpError(409, '你们已经是好友啦');
      if (me.reqOut.includes(target.id)) throw new HttpError(409, '已经申请过了，等对方同意吧');
      if (me.friends.length >= MAX_FRIENDS) throw new HttpError(400, `好友满了（最多 ${MAX_FRIENDS} 位）`);
      // 对方已经申请过我：直接成为好友
      if (me.reqIn.includes(target.id)) {
        link(me, target);
        notify(target.id, { t: 'friend', k: 'accepted', from: view(me.id) });
        send(res, 200, { status: 'friends', friend: view(target.id) });
        return true;
      }
      if (target.reqIn.length >= MAX_INCOMING) throw new HttpError(400, '对方的好友申请已经排满了，晚点再试');
      if (target.friends.length >= MAX_FRIENDS) throw new HttpError(400, '对方的好友满了');
      me.reqOut.push(target.id);
      target.reqIn.push(me.id);
      usersF.save();
      notify(target.id, { t: 'friend', k: 'request', from: view(me.id) });
      send(res, 200, { status: 'requested', to: view(target.id) });
      return true;
    }
    const am = p.match(/^\/api\/friends\/(accept|decline)$/);
    if (am && m === 'POST') {
      const b = await readJson(req);
      const id = String(b.id ?? '');
      const o = users[id];
      if (!me.reqIn.includes(id) || !o) throw new HttpError(404, '这个申请已经没有了');
      if (am[1] === 'accept') {
        if (me.friends.length >= MAX_FRIENDS) throw new HttpError(400, `好友满了（最多 ${MAX_FRIENDS} 位）`);
        ensure(o);
        link(me, o);
        notify(id, { t: 'friend', k: 'accepted', from: view(me.id) });
      } else {
        me.reqIn = me.reqIn.filter((x) => x !== id);
        ensure(o).reqOut = o.reqOut.filter((x) => x !== me.id);
        usersF.save();
      }
      send(res, 200, { ok: true });
      return true;
    }
    const dm = p.match(/^\/api\/friends\/([0-9a-f]+)$/);
    if (dm && m === 'DELETE') {
      const id = dm[1];
      me.friends = me.friends.filter((x) => x !== id);
      me.reqOut = me.reqOut.filter((x) => x !== id);
      if (users[id]) {
        const o = ensure(users[id]);
        o.friends = o.friends.filter((x) => x !== me.id);
        o.reqIn = o.reqIn.filter((x) => x !== me.id);
      }
      usersF.save();
      send(res, 200, { ok: true });
      return true;
    }
    return false;
  }

  async function mail(req, res, p, m, me) {
    const day = today();
    if (me.giftDay?.day !== day) me.giftDay = { day, n: 0 };
    if (p === '/api/mail' && m === 'GET') {
      send(res, 200, { inbox: readMail(me.id), sentToday: me.giftDay.n, limit: DAILY_GIFTS });
      return true;
    }
    if (p === '/api/mail/send' && m === 'POST') {
      const b = await readJson(req);
      const to = users[String(b.to ?? '')];
      if (!to || !alive(to.id) || !me.friends.includes(to.id) || !ensure(to).friends.includes(me.id)) throw new HttpError(400, '只能送给互相确认过的好友');
      if (to.social === false) throw new HttpError(403, '对方的多人功能被家长关闭了');
      if (me.giftDay.n >= DAILY_GIFTS) throw new HttpError(429, `今天已经送了 ${DAILY_GIFTS} 次啦，明天再来吧`);
      const gift = cleanGift(b.gift);
      const phrase = b.phrase ? String(b.phrase) : '';
      if (phrase && !phraseOk(phrase)) throw new HttpError(400, '这句话不能用');
      const inbox = readMail(to.id);
      if (inbox.length >= MAX_INBOX) throw new HttpError(400, '对方的信箱满了，请他先收一收');
      const id = crypto.randomBytes(8).toString('hex');
      const fromName = view(me.id)?.name ?? me.displayName;
      inbox.push({ id, from: { id: me.id, name: fromName }, at: Date.now(), gift, phrase });
      writeMail(to.id, inbox);
      me.giftDay.n++;
      usersF.save();
      fs.appendFileSync(logFile, JSON.stringify({ at: Date.now(), fromId: me.id, from: fromName, fromUser: me.username, toId: to.id, to: view(to.id)?.name ?? to.displayName, toUser: to.username, gift: giftText(gift), phrase }) + '\n');
      notify(to.id, { t: 'mail', from: { id: me.id, name: fromName } });
      send(res, 200, { ok: true, left: DAILY_GIFTS - me.giftDay.n });
      return true;
    }
    const am = p.match(/^\/api\/mail\/([0-9a-f]{16})\/ack$/);
    if (am && m === 'POST') {
      writeMail(me.id, readMail(me.id).filter((x) => x.id !== am[1]));
      send(res, 200, { ok: true });
      return true;
    }
    return false;
  }

  return { handle, forget, ensure, view, recentGifts };
}
