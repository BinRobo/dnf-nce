import Phaser from 'phaser';
import { friends, type FriendView } from '../net/friends';
import { domPrompt } from '../ui/dom';
import { confirmBox, modal } from '../ui/modal';
import { button, COLORS, text, toast } from '../ui/widgets';

const CLS = { sword: '剑士', gunner: '神枪手', mage: '魔法师' };
export type Tab = 'list' | 'req' | 'add';
const PER_PAGE = 8;

/** 街区 id → 中文名 */
export function districtNames(scene: Phaser.Scene): Record<string, string> {
  const t = scene.cache.json.get('town') as { districts: { id: string; name: string }[] } | undefined;
  return Object.fromEntries((t?.districts ?? []).map((d) => [d.id, d.name]));
}

export const whereText = (f: FriendView, names: Record<string, string>) =>
  f.online ? (f.online.district ? `📍 ${names[f.online.district] ?? f.online.district}` : '⚔ 在副本里') : '离线';

/**
 * 好友面板：我的好友 / 好友申请 / 添加好友。
 * onGift：点“送礼物”（信箱做好后接上）；onClose：关闭时回调（刷新角标）。
 */
export function openFriends(scene: Phaser.Scene, opts: { tab?: Tab; page?: number; onGift?: (f: FriendView) => void; onClose?: () => void } = {}) {
  const tab = opts.tab ?? 'list';
  const d = friends.data;
  if (!d) {
    toast(scene, '好友信息还在加载，请稍等一下', '#ffd27a');
    void friends.refresh().then(() => openFriends(scene, opts)).catch((e) => toast(scene, (e as Error).message, '#ff9a9a'));
    return;
  }
  const names = districtNames(scene);
  const m = modal(scene, 900, 600, '⭐ 好友');
  const origClose = m.close;
  const close = () => {
    origClose();
    opts.onClose?.();
  };
  // modal 自带的关闭按钮只会销毁容器；这里补一个回调
  m.c.once('destroy', () => opts.onClose?.());
  const reopen = (o: Partial<typeof opts> = {}) => {
    origClose();
    openFriends(scene, { ...opts, ...o });
  };
  const tabs: [Tab, string][] = [['list', `我的好友 ${d.friends.length}/${d.max}`], ['req', `好友申请${d.incoming.length ? ` (${d.incoming.length})` : ''}`], ['add', '添加好友']];
  tabs.forEach(([t, label], i) => m.c.add(button(scene, m.x + 160 + i * 190, m.y + 78, 180, 40, label, () => reopen({ tab: t, page: 0 }), { size: 17, color: tab === t ? 0x3b62d9 : 0x2a2f52 })));

  if (tab === 'list') {
    if (!d.friends.length) m.c.add(text(scene, m.x + m.w / 2, m.y + 270, '还没有好友。\n在城镇里点一下别的小朋友，或者在“添加好友”里输入好友码。', 20, COLORS.dim, { align: 'center' }).setOrigin(0.5));
    const page = opts.page ?? 0;
    const pages = Math.max(1, Math.ceil(d.friends.length / PER_PAGE));
    d.friends.slice(page * PER_PAGE, (page + 1) * PER_PAGE).forEach((f, i) => {
      const x = m.x + 30 + (i % 2) * 430, y = m.y + 118 + Math.floor(i / 2) * 92;
      const g = scene.add.graphics();
      g.fillStyle(0x1a1f38, 1).fillRoundedRect(x, y, 410, 82, 10).lineStyle(2, f.online ? 0x4fdc7b : 0x3a4170, 1).strokeRoundedRect(x, y, 410, 82, 10);
      m.c.add(g);
      m.c.add(text(scene, x + 14, y + 10, `⭐ ${f.name}`, 21, '#ffffff', { fontStyle: 'bold' }));
      m.c.add(text(scene, x + 14, y + 42, `Lv.${f.lv} ${CLS[f.cls]}`, 16, COLORS.dim));
      m.c.add(text(scene, x + 150, y + 42, whereText(f, names), 16, f.online ? '#7dffa5' : COLORS.dim));
      if (opts.onGift) m.c.add(button(scene, x + 330, y + 26, 120, 34, '🎁 送礼物', () => { close(); opts.onGift!(f); }, { size: 15, color: 0x8a5a12 }));
      m.c.add(button(scene, x + 330, y + 62, 120, 26, '删除好友', () => confirmBox(scene, `不再和「${f.name}」做好友吗？`, async () => {
        try {
          await friends.remove(f.id);
          reopen({ page: 0 });
        } catch (e) {
          toast(scene, (e as Error).message, '#ff9a9a');
        }
      }), { size: 13, color: 0x5a2a35 }));
    });
    if (pages > 1) {
      m.c.add(button(scene, m.x + m.w / 2 - 90, m.y + m.h - 34, 90, 36, '上一页', () => reopen({ page: Math.max(0, page - 1) }), { size: 16 }));
      m.c.add(text(scene, m.x + m.w / 2, m.y + m.h - 34, `${page + 1}/${pages}`, 18).setOrigin(0.5));
      m.c.add(button(scene, m.x + m.w / 2 + 90, m.y + m.h - 34, 90, 36, '下一页', () => reopen({ page: Math.min(pages - 1, page + 1) }), { size: 16 }));
    }
  } else if (tab === 'req') {
    if (!d.incoming.length) m.c.add(text(scene, m.x + m.w / 2, m.y + 250, '没有新的好友申请', 20, COLORS.dim).setOrigin(0.5));
    d.incoming.forEach((f, i) => {
      const y = m.y + 150 + i * 62;
      m.c.add(text(scene, m.x + 50, y, `${f.name}`, 22, '#ffffff', { fontStyle: 'bold' }).setOrigin(0, 0.5));
      m.c.add(text(scene, m.x + 300, y, `Lv.${f.lv} ${CLS[f.cls]}`, 18, COLORS.dim).setOrigin(0, 0.5));
      m.c.add(button(scene, m.x + 650, y, 120, 40, '接受', async () => {
        try {
          await friends.accept(f.id);
          toast(scene, `和「${f.name}」成为好友啦！`, '#7dffa5');
          reopen({ tab: d.incoming.length > 1 ? 'req' : 'list' });
        } catch (e) {
          toast(scene, (e as Error).message, '#ff9a9a');
        }
      }, { size: 18, color: 0x2f7a4d }));
      m.c.add(button(scene, m.x + 790, y, 100, 40, '拒绝', async () => {
        await friends.decline(f.id).catch(() => null);
        reopen({ tab: 'req' });
      }, { size: 18, color: 0x5a2a35 }));
    });
    if (d.outgoing.length) m.c.add(text(scene, m.x + 40, m.y + m.h - 30, `等对方同意：${d.outgoing.map((f) => f.name).join('、')}`, 15, COLORS.dim).setOrigin(0, 0.5));
  } else {
    m.c.add(text(scene, m.x + m.w / 2, m.y + 150, '我的好友码（告诉好朋友，让他输入）', 20, COLORS.dim).setOrigin(0.5));
    m.c.add(text(scene, m.x + m.w / 2, m.y + 215, d.code, 72, '#ffe14a', { fontStyle: 'bold', fontFamily: 'monospace', stroke: '#7a3b00', strokeThickness: 8 }).setOrigin(0.5));
    m.c.add(button(scene, m.x + m.w / 2, m.y + 295, 220, 46, '📋 复制好友码', async () => {
      try {
        await navigator.clipboard.writeText(d.code);
        toast(scene, '已复制', '#7dffa5');
      } catch {
        toast(scene, `好友码是 ${d.code}`, '#ffe14a');
      }
    }, { size: 19, color: 0x2a2f52 }));
    m.c.add(button(scene, m.x + m.w / 2, m.y + 400, 360, 60, '输入对方的好友码', async () => {
      const code = await domPrompt('输入好友码', { hint: '6 位字母和数字，问问你的好朋友', label: '好友码', maxLength: 10, submitLabel: '发出申请' });
      if (!code) return;
      try {
        const r = await friends.request({ code });
        toast(scene, r.status === 'friends' ? '你们成为好友啦！' : `已经发给「${r.to?.name}」，等他同意吧`, '#7dffa5');
        reopen({ tab: r.status === 'friends' ? 'list' : 'add' });
      } catch (e) {
        toast(scene, (e as Error).message, '#ff9a9a');
      }
    }, { size: 22, color: 0x2f7a4d }));
    m.c.add(text(scene, m.x + m.w / 2, m.y + 480, '也可以在城镇里直接点一下别的小朋友，选“加为好友”。', 16, COLORS.dim).setOrigin(0.5));
  }
  return { close };
}
