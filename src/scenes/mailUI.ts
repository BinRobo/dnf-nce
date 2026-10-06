import Phaser from 'phaser';
import { loadNow } from '../assets';
import { sfx } from '../audio/sound';
import { itemIcon } from '../gfx/icons';
import type { FriendView } from '../net/friends';
import { giftableItems, giftText, haveMat, mail, MAT_ICON, MAT_LABEL, type Gift, type Mail } from '../net/mail';
import { loadPhrases, phraseUnlocked, type Phrase } from '../net/realtime';
import { RARITY } from '../systems/items';
import { game } from '../state';
import { modal } from '../ui/modal';
import { button, COLORS, text, toast } from '../ui/widgets';

const MATS = ['stone', 'cloth', 'thread', 'brass', 'badge', 'ribbon'] as const;
const dateText = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

/** 送礼物：第 1 步挑礼物（装备 / 材料） */
export async function openGiftPicker(scene: Phaser.Scene, to: FriendView, tab: 'item' | 'mat' = 'item', page = 0) {
  await loadNow(scene, { icons: 'all' });
  const s = game.s;
  const m = modal(scene, 900, 620, `🎁 送给 ${to.name}`);
  const left = mail.box ? mail.box.limit - mail.box.sentToday : 3;
  m.c.add(text(scene, m.x + m.w - 50, m.y + 30, `今天还能送 ${left} 次`, 17, left ? '#ffe14a' : '#ff9a9a').setOrigin(1, 0.5));
  (['item', 'mat'] as const).forEach((t, i) => m.c.add(button(scene, m.x + 130 + i * 190, m.y + 80, 180, 40, t === 'item' ? '装备' : '材料', () => { m.close(); void openGiftPicker(scene, to, t, 0); }, { size: 18, color: tab === t ? 0x3b62d9 : 0x2a2f52 })));
  if (tab === 'item') {
    const list = giftableItems(s).sort((a, b) => b.obtainedAt - a.obtainedAt);
    const per = 18;
    const pages = Math.max(1, Math.ceil(list.length / per));
    if (!list.length) m.c.add(text(scene, m.x + m.w / 2, m.y + 300, '背包里没有可以送的装备\n（穿在身上的和史诗装备不能送）', 20, COLORS.dim, { align: 'center' }).setOrigin(0.5));
    list.slice(page * per, (page + 1) * per).forEach((it, i) => {
      const x = m.x + 90 + (i % 6) * 143, y = m.y + 190 + Math.floor(i / 6) * 128;
      m.c.add(itemIcon(scene, x, y, it, 72));
      m.c.add(text(scene, x, y + 50, `${it.name}${it.enhance ? ` +${it.enhance}` : ''}`, 14, RARITY[it.rarity].css, { wordWrap: { width: 130 }, align: 'center' }).setOrigin(0.5, 0));
      const hit = scene.add.rectangle(x, y + 10, 130, 110, 0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => { m.close(); openPhrasePicker(scene, to, { kind: 'item', item: it }); });
      m.c.add(hit);
    });
    if (pages > 1) {
      m.c.add(button(scene, m.x + m.w / 2 - 90, m.y + m.h - 30, 90, 34, '上一页', () => { m.close(); void openGiftPicker(scene, to, 'item', Math.max(0, page - 1)); }, { size: 15 }));
      m.c.add(text(scene, m.x + m.w / 2, m.y + m.h - 30, `${page + 1}/${pages}`, 17).setOrigin(0.5));
      m.c.add(button(scene, m.x + m.w / 2 + 90, m.y + m.h - 30, 90, 34, '下一页', () => { m.close(); void openGiftPicker(scene, to, 'item', Math.min(pages - 1, page + 1)); }, { size: 15 }));
    }
  } else {
    const counts: Record<string, number> = {};
    MATS.forEach((k, i) => {
      const have = haveMat(s, k);
      const y = m.y + 150 + i * 64;
      counts[k] = Math.min(have, 1);
      m.c.add(scene.add.image(m.x + 70, y, MAT_ICON[k]).setDisplaySize(46, 46));
      m.c.add(text(scene, m.x + 110, y, MAT_LABEL[k], 22, '#ffffff').setOrigin(0, 0.5));
      m.c.add(text(scene, m.x + 300, y, `有 ${have}`, 18, COLORS.dim).setOrigin(0, 0.5));
      if (!have) return;
      const num = text(scene, m.x + 560, y, String(counts[k]), 24, '#ffe14a', { fontStyle: 'bold' }).setOrigin(0.5);
      m.c.add(num);
      const step = (d: number) => { counts[k] = Phaser.Math.Clamp(counts[k] + d, 1, Math.min(have, 20)); num.setText(String(counts[k])); };
      m.c.add(button(scene, m.x + 490, y, 50, 40, '−', () => step(-1), { size: 24 }));
      m.c.add(button(scene, m.x + 630, y, 50, 40, '＋', () => step(1), { size: 24 }));
      m.c.add(button(scene, m.x + 760, y, 130, 40, '选这个', () => { m.close(); openPhrasePicker(scene, to, { kind: 'mat', mat: k, n: counts[k] }); }, { size: 18, color: 0x2f7a4d }));
    });
    m.c.add(text(scene, m.x + m.w / 2, m.y + m.h - 28, '史诗碎片和 Boss 之魂要靠自己打，不能送人；每次最多送 20 个', 15, COLORS.dim).setOrigin(0.5));
  }
}

/** 第 2 步：附一句话（课文原句，可以不说），然后送出 */
function openPhrasePicker(scene: Phaser.Scene, to: FriendView, gift: Gift) {
  const s = game.s;
  const m = modal(scene, 700, 420, `送给 ${to.name}：${giftText(gift)}`);
  let list: Phrase[] = [];
  let idx = -1; // -1 = 不说话
  const phraseText = text(scene, m.x + m.w / 2, m.y + 190, '不附话', 28, '#ffffff', { align: 'center', wordWrap: { width: 460 } }).setOrigin(0.5);
  m.c.add(text(scene, m.x + m.w / 2, m.y + 100, '附上一句话（课文里学过的）', 20, COLORS.dim).setOrigin(0.5));
  m.c.add(phraseText);
  const show = () => phraseText.setText(idx < 0 ? '不附话' : `${list[idx].en}\n${list[idx].zh}`);
  void loadPhrases().then((all) => {
    list = all.filter((p) => phraseUnlocked(p, s));
    // 默认选一句合适的“给你。”
    const def = list.findIndex((p) => p.id === 'here_you_are');
    idx = def >= 0 ? def : -1;
    show();
  });
  const go = (d: number) => {
    if (!list.length) return;
    idx = ((idx + 1 + d + list.length + 1) % (list.length + 1)) - 1;
    show();
  };
  m.c.add(button(scene, m.x + 90, m.y + 190, 70, 70, '◀', () => go(-1), { size: 30 }));
  m.c.add(button(scene, m.x + m.w - 90, m.y + 190, 70, 70, '▶', () => go(1), { size: 30 }));
  m.c.add(button(scene, m.x + m.w / 2, m.y + 330, 300, 58, '🎁 送出！', async () => {
    try {
      const left = await mail.send(s, to.id, gift, idx >= 0 ? list[idx].id : '');
      await game.persist();
      m.close();
      sfx('coin');
      toast(scene, `送出啦！今天还能送 ${left} 次`, '#7dffa5');
      void mail.refresh().catch(() => null);
    } catch (e) {
      toast(scene, (e as Error).message, '#ff9a9a');
    }
  }, { size: 24, color: 0x8a5a12 }));
}

/** 信箱：别人送我的礼物，点“收下”放进当前角色的背包 / 材料 */
export async function openMailbox(scene: Phaser.Scene, page = 0, onClose?: () => void) {
  await loadNow(scene, { icons: 'all' });
  let box;
  try {
    box = await mail.refresh();
  } catch (e) {
    return toast(scene, (e as Error).message, '#ff9a9a');
  }
  const s = game.s;
  const phrases = await loadPhrases();
  const m = modal(scene, 900, 600, `📮 信箱（${box.inbox.length}）`);
  m.c.once('destroy', () => onClose?.());
  if (!box.inbox.length) m.c.add(text(scene, m.x + m.w / 2, m.y + 280, '信箱是空的\n好朋友送你礼物时，会出现在这里', 22, COLORS.dim, { align: 'center' }).setOrigin(0.5));
  const per = 4;
  const pages = Math.max(1, Math.ceil(box.inbox.length / per));
  box.inbox.slice(page * per, (page + 1) * per).forEach((mm: Mail, i) => {
    const y = m.y + 130 + i * 106;
    const g = scene.add.graphics();
    g.fillStyle(0x1a1f38, 1).fillRoundedRect(m.x + 30, y - 46, 840, 96, 10).lineStyle(2, 0x3a4170, 1).strokeRoundedRect(m.x + 30, y - 46, 840, 96, 10);
    m.c.add(g);
    if (mm.gift.kind === 'item') m.c.add(itemIcon(scene, m.x + 90, y, mm.gift.item, 64));
    else m.c.add(scene.add.image(m.x + 90, y, MAT_ICON[mm.gift.mat]).setDisplaySize(56, 56));
    m.c.add(text(scene, m.x + 145, y - 26, `${mm.from.name} 送你：${giftText(mm.gift)}`, 21, '#ffffff', { fontStyle: 'bold' }));
    const ph = phrases.find((p) => p.id === mm.phrase);
    m.c.add(text(scene, m.x + 145, y + 6, ph ? `“${ph.en}”  ${ph.zh}` : '', 17, '#ffe9a0'));
    m.c.add(text(scene, m.x + 145, y + 30, dateText(mm.at), 14, COLORS.dim));
    m.c.add(button(scene, m.x + 780, y, 130, 46, '收下', async () => {
      const what = mail.claim(s, mm);
      await game.persist();
      await mail.ack(mm.id);
      if (what === null) toast(scene, '这份礼物坏掉了，没法收下', '#ff9a9a');
      else {
        sfx('coin');
        toast(scene, what ? `收到「${what}」！` : '已经收过这份礼物了', '#7dffa5');
      }
      m.close();
      void openMailbox(scene, Math.min(page, Math.max(0, Math.ceil((mail.unread || 1) / per) - 1)), onClose);
    }, { size: 20, color: 0x2f7a4d }));
  });
  if (pages > 1) {
    m.c.add(button(scene, m.x + m.w / 2 - 90, m.y + m.h - 34, 90, 36, '上一页', () => { m.close(); void openMailbox(scene, Math.max(0, page - 1), onClose); }, { size: 16 }));
    m.c.add(text(scene, m.x + m.w / 2, m.y + m.h - 34, `${page + 1}/${pages}`, 18).setOrigin(0.5));
    m.c.add(button(scene, m.x + m.w / 2 + 90, m.y + m.h - 34, 90, 36, '下一页', () => { m.close(); void openMailbox(scene, Math.min(pages - 1, page + 1), onClose); }, { size: 16 }));
  }
}
