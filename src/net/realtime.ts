import { cloud } from '../save/cloud';
import type { Item, Rarity, SaveData } from '../save/schema';
import { fullSet } from '../systems/costumes';
import { equippedItems } from '../systems/player';
import { game } from '../state';

/**
 * 多人在线（城镇里互相看到）：WebSocket 连 /ws，只在登录且家长没关闭多人功能时启用。
 * 孩子之间不能打字，只能发“预设短句”（课文原句，见 content-src/social/phrases.json）。
 */
export interface Look {
  name: string;
  cls: 'sword' | 'gunner' | 'mage';
  gender: 'm' | 'f';
  lv: number;
  worn: { hat?: string; top?: string; bottom?: string };
  wpn: { name: string; rarity: Rarity } | null;
  title: string;
}
export interface RemotePlayer extends Look {
  id: string;
  x: number;
  d: number;
  m: boolean;
}
export interface Phrase {
  id: string;
  en: string;
  zh: string;
  unlock: string;
  audio: { lesson: string; line: number };
}
export type NetEvent =
  | { t: 'room'; district: string; you: string; players: RemotePlayer[] }
  | { t: 'in'; p: RemotePlayer }
  | { t: 'out'; id: string }
  | { t: 'mv'; id: string; x: number; d: number; m: boolean }
  | { t: 'say'; id: string; ph: string }
  | { t: 'who'; list: { id: string; name: string; lv: number; district: string | null }[] }
  | { t: 'friend'; k: 'request' | 'accepted'; from: { id: string; name: string } }
  | { t: 'mail'; from: { id: string; name: string } }
  | { t: 'blocked'; reason: string };

/** 组队消息（p.*）不走 onEvent，交给 party 仓库处理 */
export type PartyMsg = { t: `p.${string}`; [k: string]: any };

/** 把当前角色变成发给别人的外观信息 */
export function myLook(s: SaveData = game.s): Look {
  const w = equippedItems(s).find((i: Item) => i.slot === 'weapon');
  return {
    name: s.name, cls: s.cls ?? 'sword', gender: s.gender ?? 'm', lv: s.level, worn: s.wardrobe?.worn ?? {},
    wpn: w ? { name: w.name, rarity: w.rarity } : null, title: fullSet(s)?.title ?? '',
  };
}

/** 别人的外观 → makeHero 能用的“临时存档”（只填画角色要用到的字段） */
export function lookToSave(p: Look): SaveData {
  const uid = 'remote-weapon';
  return {
    cls: p.cls, gender: p.gender, level: p.lv, job: 'novice', wardrobe: { owned: [], worn: p.worn }, skills: { ranks: {}, bar: [] },
    inventory: p.wpn ? [{ uid, name: p.wpn.name, slot: 'weapon', rarity: p.wpn.rarity, atk: 0, hp: 0, crit: 0, enhance: 0, enhanceFails: 0, obtainedAt: 0, from: '' }] : [],
    equipped: p.wpn ? { weapon: uid } : {},
  } as unknown as SaveData;
}

let phrasesP: Promise<Phrase[]> | null = null;
export function loadPhrases(): Promise<Phrase[]> {
  phrasesP ??= fetch('content/social/phrases.json').then((r) => (r.ok ? (r.json() as Promise<Phrase[]>) : [])).catch(() => []);
  return phrasesP;
}

/** 哪些短句已经解锁：第 1 个副本的两句一开始就能用，其余通关对应副本后解锁 */
export const phraseUnlocked = (p: Phrase, s: SaveData = game.s) => p.unlock === 'L001-002' || (s.dungeons[p.unlock]?.clears ?? 0) > 0;

class Realtime {
  /** 事件监听（TownScene 注册，离开城镇时清掉） */
  onEvent: ((e: NetEvent) => void) | null = null;
  /** 组队消息的接收者（net/party.ts 注册） */
  onParty: ((e: PartyMsg) => void) | null = null;
  private ws: WebSocket | null = null;
  private open = false;
  private blocked = '';
  private retry = 0;
  private timer: number | undefined;
  private want: { district: string; x: number; d: number } | null = null;
  private lastSent = { x: -1, d: 0, m: false, at: 0 };

  /** 现在能不能用多人功能 */
  get enabled() {
    return cloud.available && !!cloud.user && cloud.user.social !== false && !this.blocked && 'WebSocket' in window;
  }
  get connected() {
    return this.open;
  }

  /** 进入一个街区：没连就先连，连上后自动加入 */
  join(district: string, x: number, d: number) {
    if (!this.enabled) return;
    this.want = { district, x, d };
    this.lastSent = { x, d, m: false, at: 0 };
    if (this.open) this.sendJoin();
    else this.connect();
  }

  /** 离开街区（进副本、换角色时）；连接保持，回来时不用重连 */
  leave() {
    this.want = null;
    if (this.open) this.send({ t: 'leave' });
  }

  /** 每帧调用：位置变化时按需要发出去（限速） */
  tick(x: number, d: number, m: boolean) {
    if (!this.open || !this.want) return;
    const now = performance.now();
    const l = this.lastSent;
    const changed = m !== l.m || d !== l.d;
    if (changed || (m && now - l.at > 160)) {
      this.send({ t: 'mv', x: Math.round(x), d, m });
      this.lastSent = { x, d, m, at: now };
    }
  }

  /** 发组队消息 */
  sendParty(o: PartyMsg) {
    this.send(o);
  }
  say(id: string) {
    this.send({ t: 'say', id });
  }
  who() {
    this.send({ t: 'who' });
  }

  /** 登出 / 换角色时彻底断开 */
  close() {
    this.want = null;
    this.blocked = '';
    window.clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
    this.open = false;
  }

  private send(o: unknown) {
    if (this.open && this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o));
  }
  private sendJoin() {
    if (!this.want) return;
    this.send({ t: 'join', district: this.want.district, x: Math.round(this.want.x), d: this.want.d, p: myLook() });
  }

  private connect() {
    if (this.ws || !this.enabled) return;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.open = true;
      this.retry = 0;
      this.sendJoin();
    };
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data as string) as { t?: string };
        if (typeof m.t === 'string' && m.t.startsWith('p.')) this.onParty?.(m as PartyMsg);
        else this.onEvent?.(m as NetEvent);
      } catch {
        /* 忽略坏消息 */
      }
    };
    ws.onclose = (ev) => {
      this.open = false;
      this.ws = null;
      this.onParty?.({ t: 'p.gone', reason: '网络断开了，已退出队伍' });
      // 4001 在别处登录了、4002 账号被改、4003 家长关了多人功能：不要重连
      if (ev.code === 4003) this.blocked = '多人功能已被家长关闭';
      else if (ev.code === 4001) this.blocked = '这个账号在别的设备上登录了';
      else if (ev.code === 4002) this.blocked = '账号设置已更改，请重新登录';
      if (this.blocked) {
        this.onEvent?.({ t: 'blocked', reason: this.blocked });
        return;
      }
      if (!this.want || !this.enabled) return;
      // 断线重连：1、2、4、8、15 秒
      const wait = Math.min(15000, 1000 * 2 ** this.retry++);
      this.timer = window.setTimeout(() => this.connect(), wait);
    };
    ws.onerror = () => undefined;
  }
}

export const net = new Realtime();
