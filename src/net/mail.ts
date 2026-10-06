import type { Item, SaveData } from '../save/schema';
import { catalogOf } from '../systems/catalog';
import type { MatKey } from '../systems/costumes';
import { recordCodex } from '../systems/items';
import { uid } from '../systems/rng';
import { api } from './friends';

/**
 * 信箱 / 赠送。
 * 送出：先让服务器接收（成功了）再从自己的存档里扣掉；收下：先加进存档并保存，再通知服务器删信，
 * 存档里记着已收下的信件编号，所以中途断网、闪退都不会收两次，也不会丢。
 */
export type Gift = { kind: 'item'; item: Item } | { kind: 'mat'; mat: 'stone' | MatKey; n: number };
export interface Mail {
  id: string;
  from: { id: string; name: string };
  at: number;
  gift: Gift;
  phrase: string;
}
export interface Inbox {
  inbox: Mail[];
  sentToday: number;
  limit: number;
}

export const MAT_LABEL: Record<string, string> = { stone: '强化石', cloth: '布料', thread: '彩色丝线', brass: '铜喇叭片', badge: '银名牌', ribbon: '节日彩带' };
export const MAT_ICON: Record<string, string> = { stone: 'icon_mat_stone', cloth: 'icon_mat_cloth', thread: 'icon_mat_thread', brass: 'icon_mat_brass', badge: 'icon_mat_badge', ribbon: 'icon_mat_ribbon' };

export const giftText = (g: Gift) => (g.kind === 'item' ? `${g.item.name}${g.item.enhance ? ` +${g.item.enhance}` : ''}` : `${MAT_LABEL[g.mat]} ×${g.n}`);

/** 能送的装备：没穿在身上、不是史诗 */
export const giftableItems = (s: SaveData) => s.inventory.filter((i) => !Object.values(s.equipped).includes(i.uid) && i.rarity !== 'epic' && !i.name.startsWith('史诗'));
/** 某种材料我有多少 */
export const haveMat = (s: SaveData, m: string) => (m === 'stone' ? s.stones : (s.mats as unknown as Record<string, number>)[m] ?? 0);

class MailApi {
  box: Inbox | null = null;
  onChange: (() => void) | null = null;

  get unread() {
    return this.box?.inbox.length ?? 0;
  }
  async refresh() {
    this.box = await api<Inbox>('GET', '/api/mail');
    this.onChange?.();
    return this.box;
  }

  /** 送出一份礼物，成功后才扣自己的东西 */
  async send(s: SaveData, toId: string, gift: Gift, phrase: string) {
    if (gift.kind === 'item' && !s.inventory.some((i) => i.uid === gift.item.uid)) throw new Error('这件装备已经不在背包里了');
    if (gift.kind === 'mat' && haveMat(s, gift.mat) < gift.n) throw new Error('材料不够啦');
    const r = await api<{ ok: true; left: number }>('POST', '/api/mail/send', { to: toId, gift, phrase: phrase || undefined });
    if (gift.kind === 'item') {
      s.inventory = s.inventory.filter((i) => i.uid !== gift.item.uid);
    } else if (gift.mat === 'stone') s.stones -= gift.n;
    else (s.mats as unknown as Record<string, number>)[gift.mat] -= gift.n;
    return r.left;
  }

  /**
   * 收下一封信：把礼物加进当前角色的存档。返回给孩子看的文字；
   * 礼物内容不合法（装备名不是游戏里的）就丢弃。调用方负责保存存档，然后再调用 ack。
   */
  claim(s: SaveData, m: Mail): string | null {
    if (s.mail.claimed.includes(m.id)) return '';
    s.mail.claimed.push(m.id);
    if (s.mail.claimed.length > 200) s.mail.claimed = s.mail.claimed.slice(-200);
    const g = m.gift;
    if (g.kind === 'item') {
      if (!catalogOf(g.item.name)) return null;
      const it: Item = { ...g.item, uid: uid(), obtainedAt: Date.now(), from: `${m.from.name} 的礼物`, enhanceFails: 0 };
      s.inventory.push(it);
      recordCodex(s, [it]);
    } else if (g.mat === 'stone') s.stones += g.n;
    else (s.mats as unknown as Record<string, number>)[g.mat] = ((s.mats as unknown as Record<string, number>)[g.mat] ?? 0) + g.n;
    return giftText(g);
  }

  async ack(id: string) {
    await api('POST', `/api/mail/${id}/ack`).catch(() => null);
    if (this.box) this.box.inbox = this.box.inbox.filter((x) => x.id !== id);
    this.onChange?.();
  }
}

export const mail = new MailApi();
