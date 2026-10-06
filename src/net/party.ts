import { net, type Look, type PartyMsg } from './realtime';

export interface PartyMember extends Look {
  id: string;
  ready: boolean;
}
export interface PartyView {
  id: string;
  leader: string;
  dungeon: string;
  state: 'lobby' | 'battle';
  members: PartyMember[];
}
export interface BattleSnap {
  bossHp: number;
  bossMax: number;
  floor: number;
  phase: 'fight' | 'finale' | 'won' | 'lost';
  finaleNeed: number;
  members: { id: string; hearts: number; down: boolean; left: boolean; finale: boolean; correct: number; damage: number }[];
}
export interface PartyStart {
  seed: number;
  party: PartyView;
  battle: BattleSnap;
}
export interface PartyEnd {
  win: boolean;
  reason: 'win' | 'down' | 'left' | 'time';
  stats: { id: string; name: string; correct: number; wrong: number; damage: number; rescues: number; left: boolean }[];
  seconds: number;
}
export interface Invite {
  pid: string;
  from: { id: string; name: string };
  dungeon: string;
}

/** 组队状态仓库：队伍信息、收到的邀请；界面通过 onChange / onBattle 订阅 */
class Party {
  view: PartyView | null = null;
  invites: Invite[] = [];
  private subs = new Set<() => void>();
  /** 队伍或邀请变化时通知（大厅、城镇角标）；返回取消订阅的函数 */
  subscribe(fn: () => void) {
    this.subs.add(fn);
    return () => void this.subs.delete(fn);
  }
  private changed() {
    for (const f of [...this.subs]) f();
  }
  /** 一条提示（被拒绝、出错、队伍解散） */
  onNote: ((msg: string, bad?: boolean) => void) | null = null;
  /** 开战（城镇场景接收后切到 PartyBattle） */
  onStart: ((e: PartyStart) => void) | null = null;
  /** 战斗中的事件 */
  onBattle: ((e: PartyMsg) => void) | null = null;
  /** 战斗开始了但还没人接收（比如正在切场景）：保留，接收者出现时补发 */
  pendingStart: PartyStart | null = null;

  constructor() {
    net.onParty = (m) => this.feed(m);
  }

  get inParty() {
    return !!this.view;
  }
  get isLeader() {
    return !!this.view && this.view.leader === this.me;
  }
  /** 我的账号 id（从成员列表里无法得知，由城镇场景在收到 room 事件时设置） */
  me = '';

  feed(m: PartyMsg) {
    switch (m.t) {
      case 'p.state':
        this.view = m.party as PartyView;
        this.invites = this.invites.filter((i) => i.pid !== this.view!.id);
        this.changed();
        break;
      case 'p.invite':
        this.invites = [...this.invites.filter((i) => i.pid !== m.pid), { pid: m.pid, from: m.from, dungeon: m.dungeon }];
        this.changed();
        break;
      case 'p.declined':
        this.onNote?.(`${m.name} 暂时不能加入`);
        break;
      case 'p.err':
        this.onNote?.(String(m.msg), true);
        break;
      case 'p.gone':
        if (this.view) this.onNote?.(String(m.reason ?? '队伍解散了'));
        this.view = null;
        this.changed();
        break;
      case 'p.start': {
        const e = m as unknown as PartyStart;
        this.view = e.party;
        this.pendingStart = e;
        this.onStart?.(e);
        break;
      }
      case 'p.b':
      case 'p.end':
        this.onBattle?.(m);
        break;
    }
  }

  create(dungeon: string) {
    net.sendParty({ t: 'p.create', dungeon });
  }
  invite(to: string) {
    net.sendParty({ t: 'p.invite', to });
  }
  join(pid: string) {
    this.invites = this.invites.filter((i) => i.pid !== pid);
    net.sendParty({ t: 'p.join', pid });
    this.changed();
  }
  decline(pid: string) {
    this.invites = this.invites.filter((i) => i.pid !== pid);
    net.sendParty({ t: 'p.decline', pid });
    this.changed();
  }
  ready(r: boolean) {
    net.sendParty({ t: 'p.ready', ready: r });
  }
  start() {
    net.sendParty({ t: 'p.start' });
  }
  leave() {
    if (this.view) net.sendParty({ t: 'p.leave' });
    this.view = null;
    this.changed();
  }
}

export const party = new Party();
