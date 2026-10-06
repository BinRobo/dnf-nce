import Phaser from 'phaser';
import { friends } from '../net/friends';
import { party } from '../net/party';
import { game } from '../state';
import { dungeonOpen, openDungeons } from '../systems/progress';
import { modal } from '../ui/modal';
import { button, COLORS, text, toast } from '../ui/widgets';

const CLS = { sword: '剑士', gunner: '神枪手', mage: '魔法师' };
const PER_PAGE = 12;

export const dungeonLabel = (id: string) => {
  const t = game.manifest.titles[id];
  return t ? `L${t.lessons[0]}-${t.lessons[1]} ${t.title}` : id;
};

/**
 * 组队面板：没队伍时 = 收到的邀请 + 选副本建队；有队伍时 = 队员、邀请好友、准备 / 开始。
 * 队伍一变就整个重画。
 */
export function openParty(scene: Phaser.Scene, opts: { page?: number } = {}) {
  let m: ReturnType<typeof modal> | null = null;
  let page = opts.page ?? 0;
  let picking = false;

  const close = () => {
    m?.c.destroy();
    m = null;
  };
  const render = () => {
    if (m) {
      m.c.off('destroy');
      m.c.destroy();
    }
    m = modal(scene, 900, 600, party.view ? '🛡 我的队伍' : '🛡 组队打副本');
    m.c.once('destroy', () => {
      unsub();
      m = null;
    });
    if (party.view) lobby();
    else if (picking) pickDungeon();
    else home();
  };

  // -------- 还没有队伍 --------
  const home = () => {
    const mm = m!;
    mm.c.add(text(scene, mm.x + mm.w / 2, mm.y + 74, '2~4 个好朋友一起打同一个 Boss！每人答自己的题，答对就是攻击。', 18, COLORS.dim).setOrigin(0.5));
    let y = mm.y + 120;
    if (party.invites.length) {
      mm.c.add(text(scene, mm.x + 40, y, '📨 收到的邀请', 22, '#ffe14a'));
      y += 40;
      for (const inv of party.invites.slice(0, 3)) {
        const ok = dungeonOpen(game.s, game.manifest, inv.dungeon);
        mm.c.add(text(scene, mm.x + 40, y + 6, `${inv.from.name} 邀请你打\n${dungeonLabel(inv.dungeon)}`, 17));
        mm.c.add(button(scene, mm.x + 560, y + 20, 150, 46, ok ? '加入' : '🔒 还没解锁', () => party.join(inv.pid), { size: 18, color: 0x2f7a4d }).setEnabled(ok));
        mm.c.add(button(scene, mm.x + 730, y + 20, 110, 46, '拒绝', () => party.decline(inv.pid), { size: 18, color: 0x7a2f3a }));
        y += 66;
      }
    }
    mm.c.add(button(scene, mm.x + mm.w / 2, mm.y + 430, 360, 70, '➕ 创建队伍', () => {
      picking = true;
      render();
    }, { size: 26, color: 0x3b62d9 }));
    mm.c.add(text(scene, mm.x + mm.w / 2, mm.y + 510, '只能和互相加了好友的小朋友组队。队长选副本，队员要先通关解锁这个副本。\n组队通关：经验和金币 +25%。', 16, COLORS.dim, { align: 'center' }).setOrigin(0.5));
  };

  const pickDungeon = () => {
    const mm = m!;
    // 最新解锁的排在最前
    const all = openDungeons(game.s, game.manifest).reverse();
    const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
    page = Math.min(page, pages - 1);
    mm.c.add(text(scene, mm.x + mm.w / 2, mm.y + 74, '选一个副本，让队友一起来打', 20, COLORS.dim).setOrigin(0.5));
    all.slice(page * PER_PAGE, (page + 1) * PER_PAGE).forEach((id, i) => {
      mm.c.add(button(scene, mm.x + 230 + (i % 2) * 440, mm.y + 130 + Math.floor(i / 2) * 62, 420, 52, dungeonLabel(id), () => {
        picking = false;
        party.create(id);
      }, { size: 17 }));
    });
    mm.c.add(button(scene, mm.x + 120, mm.y + 555, 150, 40, '◀ 返回', () => {
      picking = false;
      render();
    }, { size: 17 }));
    if (pages > 1) {
      mm.c.add(button(scene, mm.x + 400, mm.y + 555, 80, 40, '◀', () => { page = (page + pages - 1) % pages; render(); }, { size: 18 }));
      mm.c.add(text(scene, mm.x + 450, mm.y + 555, `${page + 1}/${pages}`, 18, COLORS.dim).setOrigin(0.5));
      mm.c.add(button(scene, mm.x + 500, mm.y + 555, 80, 40, '▶', () => { page = (page + 1) % pages; render(); }, { size: 18 }));
    }
  };

  // -------- 队伍大厅 --------
  const lobby = () => {
    const mm = m!;
    const v = party.view!;
    const leader = party.isLeader;
    mm.c.add(text(scene, mm.x + mm.w / 2, mm.y + 74, `🎯 ${dungeonLabel(v.dungeon)}`, 22, '#ffe14a').setOrigin(0.5));
    v.members.forEach((p, i) => {
      const y = mm.y + 120 + i * 64;
      mm.c.add(scene.add.rectangle(mm.x + 40, y - 4, 400, 56, 0x1b1f38, 0.9).setOrigin(0));
      mm.c.add(text(scene, mm.x + 54, y + 4, `${p.id === v.leader ? '👑 ' : ''}${p.name}`, 22));
      mm.c.add(text(scene, mm.x + 54, y + 32, `Lv.${p.lv} ${CLS[p.cls]}`, 14, COLORS.dim));
      mm.c.add(text(scene, mm.x + 420, y + 12, p.ready ? '✔ 准备好了' : '…', 18, p.ready ? '#7dffa0' : COLORS.dim).setOrigin(1, 0));
    });
    for (let i = v.members.length; i < 4; i++) mm.c.add(text(scene, mm.x + 240, mm.y + 148 + i * 64, '（空位）', 18, COLORS.dim).setOrigin(0.5));

    // 右边：队长邀请在线好友
    if (leader) {
      mm.c.add(text(scene, mm.x + 480, mm.y + 118, '邀请在线的好友', 20, '#9fe3ff'));
      const inParty = new Set(v.members.map((p) => p.id));
      const on = (friends.data?.friends ?? []).filter((f) => f.online && !inParty.has(f.id));
      if (!on.length) mm.c.add(text(scene, mm.x + 480, mm.y + 160, '没有在线的好友。\n先去“好友”里加朋友吧。', 16, COLORS.dim));
      on.slice(0, 5).forEach((f, i) => {
        const y = mm.y + 156 + i * 52;
        mm.c.add(text(scene, mm.x + 480, y + 4, `${f.name}  Lv.${f.lv}`, 18));
        mm.c.add(button(scene, mm.x + 800, y + 14, 90, 38, '邀请', () => {
          party.invite(f.id);
          toast(scene, `已邀请 ${f.name}`, '#9fe3ff');
        }, { size: 16, color: 0x2f7a4d }));
      });
    } else {
      mm.c.add(text(scene, mm.x + 480, mm.y + 150, '等队长点“开始”。\n准备好了就点下面的按钮。', 18, COLORS.dim));
    }

    const me = v.members.find((p) => p.id === party.me);
    if (leader) {
      const all = v.members.length >= 2 && v.members.every((p) => p.ready);
      mm.c.add(button(scene, mm.x + 560, mm.y + 540, 300, 62, all ? '⚔ 出发！' : '等队友准备…', () => party.start(), { size: 26, color: 0xb8323f }).setEnabled(all));
    } else {
      const r = !!me?.ready;
      mm.c.add(button(scene, mm.x + 560, mm.y + 540, 300, 62, r ? '取消准备' : '✔ 我准备好了', () => party.ready(!r), { size: 24, color: r ? 0x7a6a2f : 0x2f7a4d }));
    }
    mm.c.add(button(scene, mm.x + 200, mm.y + 540, 200, 62, '离开队伍', () => party.leave(), { size: 22, color: 0x7a2f3a }));
  };

  const unsub = party.subscribe(render);
  if (!friends.data) void friends.refresh().then(render).catch(() => null);
  else void friends.refresh().then(() => m && render()).catch(() => null);
  render();
  return { close };
}
