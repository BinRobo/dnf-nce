// 组队副本（2–4 人）：每个人答自己的题，伤害打在同一个 Boss 身上。
// 共享状态（Boss 血量、倒下 / 救援、合击、终结合唱）由服务器裁决，所有人看到同一场战斗；只放内存。
//
// 客户端 → 服务器：
//   p.create {dungeon}   建队（队长）          p.invite {to}   队长邀请在线好友
//   p.join {pid}         接受邀请               p.decline {pid} 拒绝邀请
//   p.ready {ready}      准备 / 取消            p.leave         离队（战斗中离队 = 倒下不再回来）
//   p.start              队长开战（≥2 人且都已准备）
//   p.ans {ok, g}        答了一题：ok 是否答对，g = hit | nice | perfect
//   p.rescue {target}    答对救援题，把倒下的队友扶起来
//   p.finale             完成了一次“合唱终结”的句子
// 服务器 → 客户端：
//   p.state {party}      队伍信息（大厅里每次变化都会发）
//   p.invite {pid, from, dungeon}   p.gone {reason}（队伍解散 / 被移出）
//   p.start {seed, party, battle}    p.b {ev, s}（战斗事件 + 完整快照）    p.end {win, reason, stats, seconds}
const MAX_MEMBERS = 4;
const DUNGEON_RE = /^L\d{3}-\d{3}$/;

export function createParties({ getConn, users, opts = {} }) {
  const cfg = {
    attackMs: 11_000, comboMs: 3_000, dodgeMs: 8_000, rescueGapMs: 5_000, maxBattleMs: 8 * 60_000,
    hearts: 5, perMember: 16, finaleFrac: 0.25, ...opts,
  };
  /** pid → party */
  const parties = new Map();
  /** uid → pid */
  const byUser = new Map();

  const send = (uid, msg) => getConn(uid)?.send(msg);
  const bcast = (p, msg) => p.members.forEach((uid) => send(uid, msg));
  const nameOf = (uid) => getConn(uid)?.look?.name ?? users[uid]?.displayName ?? '队友';
  const areFriends = (a, b) => !!users[a]?.friends?.includes(b) && !!users[b]?.friends?.includes(a);
  const rid = () => Math.random().toString(36).slice(2, 10);

  function memberView(p, uid) {
    const l = getConn(uid)?.look;
    return { id: uid, name: l?.name ?? '队友', cls: l?.cls ?? 'sword', gender: l?.gender ?? 'm', lv: l?.lv ?? 1, worn: l?.worn ?? {}, wpn: l?.wpn ?? null, title: l?.title ?? '', ready: p.ready.has(uid) };
  }
  const partyView = (p) => ({ id: p.id, leader: p.leader, dungeon: p.dungeon, state: p.state, members: p.members.map((u) => memberView(p, u)) });
  const sendState = (p) => bcast(p, { t: 'p.state', party: partyView(p) });

  // ---------- 战斗 ----------
  const alive = (b, uid) => !b.m.get(uid).down && !b.m.get(uid).left;
  function snapshot(p) {
    const b = p.battle;
    const need = [...b.m.entries()].filter(([uid]) => alive(b, uid) && !b.m.get(uid).finale).length;
    return {
      bossHp: b.bossHp, bossMax: b.bossMax, floor: b.floor, phase: b.phase, finaleNeed: need,
      members: p.members.map((uid) => { const m = b.m.get(uid); return { id: uid, hearts: m.hearts, down: m.down, left: m.left, finale: m.finale, correct: m.correct, damage: m.damage }; }),
    };
  }
  const event = (p, ev) => bcast(p, { t: 'p.b', ev, s: snapshot(p) });

  function finishBattle(p, win, reason) {
    const b = p.battle;
    if (!b || b.phase === 'won' || b.phase === 'lost') return;
    b.phase = win ? 'won' : 'lost';
    clearInterval(b.attackTimer);
    clearTimeout(b.deadline);
    const stats = p.members.map((uid) => { const m = b.m.get(uid); return { id: uid, name: nameOf(uid), correct: m.correct, wrong: m.wrong, damage: m.damage, rescues: m.rescues, left: m.left }; });
    bcast(p, { t: 'p.end', win, reason, stats, seconds: Math.round((Date.now() - b.startedAt) / 1000) });
    for (const uid of p.members) byUser.delete(uid);
    parties.delete(p.id);
  }
  function checkEnd(p) {
    const b = p.battle;
    if (!b || b.phase === 'won' || b.phase === 'lost') return;
    const live = p.members.filter((u) => alive(b, u));
    if (!live.length) return finishBattle(p, false, p.members.every((u) => b.m.get(u).left) ? 'left' : 'down');
    if (b.phase === 'finale' && live.every((u) => b.m.get(u).finale)) {
      b.bossHp = 0;
      finishBattle(p, true, 'win');
    }
  }
  function hurt(p, uid, ev) {
    const b = p.battle;
    const m = b.m.get(uid);
    m.hearts = Math.max(0, m.hearts - 1);
    if (m.hearts === 0) m.down = true;
    event(p, { ...ev, hearts: m.hearts, down: m.down });
    checkEnd(p);
  }

  function startBattle(p) {
    p.state = 'battle';
    const now = Date.now();
    const bossMax = cfg.perMember * p.members.length;
    const b = (p.battle = {
      startedAt: now, bossMax, bossHp: bossMax, floor: Math.ceil(bossMax * cfg.finaleFrac), phase: 'fight', m: new Map(),
    });
    for (const uid of p.members) b.m.set(uid, { hearts: cfg.hearts, down: false, left: false, lastOkAt: 0, pendingAt: 0, correct: 0, wrong: 0, damage: 0, rescues: 0, rescueAt: 0, finale: false });
    // Boss 定时出招：最近 8 秒内答对过的人躲得开，否则掉 1 颗心；合唱终结阶段暂停
    b.attackTimer = setInterval(() => {
      if (b.phase !== 'fight') return;
      const live = p.members.filter((u) => alive(b, u));
      if (!live.length) return;
      // 优先打最久没答对的人，让大家都得跟上节奏
      live.sort((x, y) => b.m.get(x).lastOkAt - b.m.get(y).lastOkAt);
      const target = live[Math.random() < 0.7 ? 0 : Math.floor(Math.random() * live.length)];
      const dodge = Date.now() - b.m.get(target).lastOkAt < cfg.dodgeMs;
      if (dodge) event(p, { k: 'attack', target, hit: false });
      else hurt(p, target, { k: 'attack', target, hit: true });
    }, cfg.attackMs);
    b.attackTimer.unref?.();
    b.deadline = setTimeout(() => finishBattle(p, false, 'time'), cfg.maxBattleMs);
    b.deadline.unref?.();
    bcast(p, { t: 'p.start', seed: Math.floor(Math.random() * 2 ** 31), party: partyView(p), battle: snapshot(p) });
  }

  // ---------- 队伍 ----------
  function removeMember(p, uid, why) {
    const i = p.members.indexOf(uid);
    if (i < 0) return;
    byUser.delete(uid);
    if (p.state === 'battle' && p.battle) {
      // 战斗中离队：当作倒下且不再回来，队友继续打
      const m = p.battle.m.get(uid);
      m.left = true;
      m.down = true;
      event(p, { k: 'left', who: uid });
      checkEnd(p);
      return;
    }
    p.members.splice(i, 1);
    p.ready.delete(uid);
    send(uid, { t: 'p.gone', reason: why });
    if (!p.members.length) {
      parties.delete(p.id);
      return;
    }
    if (p.leader === uid) {
      p.leader = p.members[0];
      p.ready.add(p.leader);
    }
    sendState(p);
  }
  function disband(p, why) {
    for (const uid of [...p.members]) {
      byUser.delete(uid);
      send(uid, { t: 'p.gone', reason: why });
    }
    parties.delete(p.id);
  }

  /** 收到客户端消息；返回 true 表示已处理 */
  function handle(c, m) {
    const uid = c.uid;
    const p = byUser.has(uid) ? parties.get(byUser.get(uid)) : null;
    const now = Date.now();
    switch (m.t) {
      case 'p.create': {
        if (p || typeof m.dungeon !== 'string' || !DUNGEON_RE.test(m.dungeon)) return true;
        const np = { id: rid(), leader: uid, dungeon: m.dungeon, members: [uid], ready: new Set([uid]), invited: new Set(), state: 'lobby', battle: null };
        parties.set(np.id, np);
        byUser.set(uid, np.id);
        sendState(np);
        return true;
      }
      case 'p.invite': {
        if (!p || p.state !== 'lobby' || p.leader !== uid || typeof m.to !== 'string') return true;
        if (!areFriends(uid, m.to) || !getConn(m.to) || byUser.has(m.to) || p.members.length >= MAX_MEMBERS || p.invited.has(m.to)) {
          c.send({ t: 'p.err', msg: '邀请不了：对方可能不在线、已经在队伍里，或者队伍满了' });
          return true;
        }
        if (users[m.to]?.social === false) return true;
        p.invited.add(m.to);
        send(m.to, { t: 'p.invite', pid: p.id, from: { id: uid, name: nameOf(uid) }, dungeon: p.dungeon });
        return true;
      }
      case 'p.join': {
        const t = parties.get(String(m.pid));
        if (p || !t || t.state !== 'lobby' || !t.invited.has(uid) || t.members.length >= MAX_MEMBERS) {
          c.send({ t: 'p.err', msg: '这支队伍已经满了，或者已经解散了' });
          return true;
        }
        t.invited.delete(uid);
        t.members.push(uid);
        byUser.set(uid, t.id);
        sendState(t);
        return true;
      }
      case 'p.decline': {
        const t = parties.get(String(m.pid));
        if (t?.invited.delete(uid)) send(t.leader, { t: 'p.declined', name: nameOf(uid) });
        return true;
      }
      case 'p.ready': {
        if (!p || p.state !== 'lobby' || p.leader === uid) return true;
        if (m.ready) p.ready.add(uid);
        else p.ready.delete(uid);
        sendState(p);
        return true;
      }
      case 'p.leave': {
        if (!p) return true;
        if (p.state === 'lobby' && p.leader === uid && p.members.length === 1) disband(p, '队伍解散了');
        else removeMember(p, uid, '你离开了队伍');
        return true;
      }
      case 'p.start': {
        if (!p || p.state !== 'lobby' || p.leader !== uid) return true;
        if (p.members.length < 2 || !p.members.every((u) => p.ready.has(u))) {
          c.send({ t: 'p.err', msg: '至少要 2 个人，而且大家都要点“准备好了”' });
          return true;
        }
        startBattle(p);
        return true;
      }
      case 'p.ans': {
        const b = p?.battle;
        if (!b || p.state !== 'battle' || b.phase === 'won' || b.phase === 'lost') return true;
        const me = b.m.get(uid);
        if (!me || me.down) return true;
        if (!m.ok) {
          me.wrong++;
          hurt(p, uid, { k: 'wrong', who: uid });
          return true;
        }
        me.correct++;
        me.lastOkAt = now;
        if (b.phase !== 'fight') {
          event(p, { k: 'ok', who: uid, dmg: 0 });
          return true;
        }
        let dmg = m.g === 'perfect' ? 2 : 1;
        // 合击：别人在 3 秒内也答对了还没配对 → 两个人各 +1，并配成一对
        let combo = null;
        for (const [other, om] of b.m) {
          if (other !== uid && alive(b, other) && om.pendingAt && now - om.pendingAt <= cfg.comboMs) {
            combo = other;
            om.pendingAt = 0;
            om.damage += 1;
            break;
          }
        }
        if (combo) {
          dmg += 1;
          me.pendingAt = 0;
        } else me.pendingAt = now;
        const total = dmg + (combo ? 1 : 0);
        me.damage += dmg;
        b.bossHp = Math.max(b.floor, b.bossHp - total);
        const ev = { k: 'hit', who: uid, dmg: total, grade: m.g === 'perfect' ? 'perfect' : 'hit' };
        if (combo) ev.combo = combo;
        if (b.bossHp <= b.floor) {
          b.phase = 'finale';
          ev.finale = true;
        }
        event(p, ev);
        return true;
      }
      case 'p.rescue': {
        const b = p?.battle;
        if (!b || p.state !== 'battle' || b.phase === 'won' || b.phase === 'lost') return true;
        const me = b.m.get(uid);
        const t = typeof m.target === 'string' ? b.m.get(m.target) : null;
        if (!me || me.down || !t || !t.down || t.left || now - t.rescueAt < cfg.rescueGapMs) return true;
        t.down = false;
        t.hearts = 2;
        t.rescueAt = now;
        me.rescues++;
        event(p, { k: 'rescue', by: uid, to: m.target });
        return true;
      }
      case 'p.finale': {
        const b = p?.battle;
        if (!b || p.state !== 'battle' || b.phase !== 'finale') return true;
        const me = b.m.get(uid);
        if (!me || me.down || me.finale) return true;
        me.finale = true;
        event(p, { k: 'chorus', who: uid });
        checkEnd(p);
        return true;
      }
    }
    return false;
  }

  /** 连接断开（关页面、断网、被顶掉） */
  function onDisconnect(uid) {
    const p = byUser.has(uid) ? parties.get(byUser.get(uid)) : null;
    if (p) removeMember(p, uid, '断线了');
    // 取消还没处理的邀请
    for (const t of parties.values()) t.invited.delete(uid);
  }

  return { handle, onDisconnect, count: () => parties.size, cfg };
}
