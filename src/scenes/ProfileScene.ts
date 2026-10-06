import { loadNow } from '../assets';
import Phaser from 'phaser';
import { backdrop } from '../gfx/textures';
import { deleteProfile, exportSave, listProfiles, parseImport, saveProfile } from '../save/db';
import { migrate, type SaveData } from '../save/schema';
import { makeHero } from '../gfx/hero';
import { classOf } from '../systems/classes';
import { game } from '../state';
import { cloud } from '../save/cloud';
import { isStandalone, isTouch } from '../ui/device';
import { domDialog } from '../ui/dom';
import { downloadText, pickTextFile, stamp } from '../ui/files';
import { confirmBox } from '../ui/modal';
import { button, COLORS, panel, text, toast } from '../ui/widgets';

const MAX_PROFILES = 4;

export class ProfileScene extends Phaser.Scene {
  /** 角色卡片画完了（自动化测试用） */
  ready = false;

  constructor() {
    super('Profile');
  }

  create() {
    this.ready = false;
    backdrop(this, 'town', 560);
    const { width } = this.scale;
    text(this, width / 2, 70, '英语地下城', 64, '#ffffff', { stroke: '#1b1b2b', strokeThickness: 8 }).setOrigin(0.5);
    text(this, width / 2, 130, `${game.manifest.title} · 选择你的角色`, 24, '#ffffff', { stroke: '#1b1b2b', strokeThickness: 4 }).setOrigin(0.5);
    void this.render();
    this.accountBox();
    // 回到这一页时顺便和云端对齐（别的平板上玩过的进度会出现在这里）
    if (cloud.user && !cloud.offline) void cloud.sync().then((changed) => changed && this.scene.isActive() && this.scene.restart());
  }

  /** 右上角：账号状态 */
  private accountBox() {
    this.deviceHelpers();
    if (!cloud.available) return;
    const u = cloud.user;
    if (u) {
      text(this, 1262, 22, `☁ ${u.displayName}${cloud.offline ? '（离线）' : ''}`, 20, '#ffffff', { stroke: '#1b1b2b', strokeThickness: 4 }).setOrigin(1, 0);
      button(this, 1180, 78, 160, 38, '退出登录', () =>
        confirmBox(this, '退出登录会清掉这台平板上本账号的角色（进度在云端，下次登录会回来）。确定吗？', async () => {
          const err = await cloud.logout();
          if (err) toast(this, err, '#ff9a9a');
          else this.scene.restart();
        }), { size: 17, color: 0x444a6b });
    } else {
      button(this, 1130, 44, 250, 50, '☁ 登录 / 注册', () => this.openLogin(), { size: 21, color: 0x8a5a12 });
      text(this, 1262, 78, '登录后进度存在云端\n换平板也不会丢', 15, '#ffe9a0', { align: 'right', stroke: '#1b1b2b', strokeThickness: 3 }).setOrigin(1, 0);
    }
  }

  /** 平板：全屏按钮 + 第一次提示“添加到主屏幕” */
  private deviceHelpers() {
    const doc = document as unknown as { fullscreenEnabled?: boolean; webkitFullscreenEnabled?: boolean };
    if ((doc.fullscreenEnabled || doc.webkitFullscreenEnabled) && !isStandalone) {
      button(this, 70, 38, 120, 40, '⛶ 全屏', () => (this.scale.isFullscreen ? this.scale.stopFullscreen() : this.scale.startFullscreen()), { size: 17, color: 0x444a6b });
    }
    let seen = false;
    try {
      seen = !!localStorage.getItem('nce_a2hs');
    } catch {
      /* 无痕模式 */
    }
    if (isTouch && !isStandalone && !seen) {
      try {
        localStorage.setItem('nce_a2hs', '1');
      } catch {
        /* 无痕模式 */
      }
      this.time.delayedCall(800, () => toast(this, '小提示：点浏览器的“分享 → 添加到主屏幕”，就能像 App 一样全屏玩，进度也更安全', '#ffe9a0'));
    }
  }

  private openLogin(mode: 'login' | 'register' = 'login') {
    const reg = mode === 'register';
    domDialog({
      title: reg ? '注册新账号' : '登录',
      hint: reg ? '请家长在管理后台生成邀请码' : '输入用户名和密码，进度就回来啦',
      submitLabel: reg ? '注册' : '登录',
      fields: [
        ...(reg ? [{ key: 'invite', label: '邀请码', placeholder: 'XXXX-XXXX', maxLength: 12 }] : []),
        { key: 'username', label: '用户名', maxLength: 16, autocomplete: 'username' },
        { key: 'password', label: reg ? '密码（至少 6 位）' : '密码', type: 'password' as const, maxLength: 64, autocomplete: reg ? 'new-password' : 'current-password' },
      ],
      onSubmit: async (v) => {
        const err = reg ? await cloud.register(v.invite, v.username.trim(), v.password) : await cloud.login(v.username.trim(), v.password);
        if (err) return err;
        await cloud.sync();
        this.scene.restart();
      },
      links: reg
        ? [{ label: '已经有账号？去登录', onClick: () => this.openLogin('login') }]
        : [{ label: '第一次来？用家长给的邀请码注册', onClick: () => this.openLogin('register') }],
    });
  }

  private async render() {
    const profiles = await listProfiles();
    const { width } = this.scale;
    const cardW = 270;
    const gap = 24;
    const n = Math.max(1, Math.min(MAX_PROFILES, profiles.length + (profiles.length < MAX_PROFILES ? 1 : 0)));
    const startX = width / 2 - (n * cardW + (n - 1) * gap) / 2;

    // 只加载这几个角色的形象
    await loadNow(this, { heroes: profiles.slice(0, MAX_PROFILES).map((p) => migrate(structuredClone(p))) });
    profiles.slice(0, MAX_PROFILES).forEach((p, i) => this.card(p, startX + i * (cardW + gap), 190, cardW));
    if (profiles.length < MAX_PROFILES) {
      const x = startX + profiles.length * (cardW + gap);
      panel(this, x, 190, cardW, 300, 0.6);
      button(this, x + cardW / 2, 340, 200, 64, '＋ 新建角色', () => this.create_new(), { color: 0x2f7a4d });
    }

    this.ready = true;
    button(this, width / 2, 595, 260, 48, '从备份文件导入', () => void this.importFile());
    text(this, width / 2, 635, cloud.user ? '已登录：进度会自动保存到云端。\n没有网络时先存在本机，连上网会自动补传。' : '没有登录时，存档只保存在这台设备的浏览器里。\n换设备、清理浏览器前请先“导出备份”。', 18, '#dfe4ff', {
      align: 'center', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 0);
  }

  private card(p: SaveData, x: number, y: number, w: number) {
    panel(this, x, y, w, 300);
    const ps = migrate(structuredClone(p));
    makeHero(this, x + w / 2, y + 128, ps, 0.34).idle();
    text(this, x + w / 2, y + 150, p.name, 28).setOrigin(0.5);
    text(this, x + w / 2, y + 185, `Lv.${p.level} ${classOf(ps).name}·${ps.gender === 'f' ? '女' : '男'}`, 20, COLORS.dim).setOrigin(0.5);
    const cleared = Object.values(p.dungeons).filter((d) => d.clears > 0).length;
    text(this, x + w / 2, y + 212, `已通关 ${cleared} 个副本`, 18, COLORS.dim).setOrigin(0.5);
    button(this, x + w / 2, y + 252, w - 40, 44, '开始冒险', () => {
      game.use(p);
      this.scene.start('Town');
    }, { color: 0x3b62d9 });
    const st = cloud.state(p.id);
    if (cloud.available) {
      const label = st === 'synced' ? '☁ 已同步' : st === 'pending' ? '☁ 待上传' : '💾 仅本机';
      text(this, x + w - 12, y + 10, label, 15, st === 'synced' ? '#7dffa5' : st === 'pending' ? '#ffe14a' : '#9ea6d6').setOrigin(1, 0);
    }
    button(this, x + 40, y + 330, 76, 36, '导出', () => downloadText(`英语地下城-${p.name}-${stamp()}.json`, exportSave(p)), { size: 16 });
    if (cloud.user && st === 'local') {
      button(this, x + w / 2, y + 330, 96, 36, '☁ 上传', async () => {
        await cloud.adopt(p);
        toast(this, `「${p.name}」已放进你的账号`, '#7dffa5');
        this.scene.restart();
      }, { size: 16, color: 0x8a5a12 });
    }
    button(this, x + w - 40, y + 330, 76, 36, '删除', () =>
      confirmBox(this, `确定删除角色「${p.name}」吗？${st === 'local' ? '\n删除前建议先导出备份。' : '\n云端的这份也会一起删除。'}`, async () => {
        await cloud.remove(p.id);
        await deleteProfile(p.id);
        this.scene.restart();
      }), { size: 16, color: 0x6b2a35 });
  }

  private create_new() {
    this.scene.start('Create');
  }

  private async importFile() {
    const txt = await pickTextFile();
    if (!txt) return;
    try {
      const s = parseImport(txt);
      await saveProfile(s);
      toast(this, `已导入「${s.name}」`, '#7dffa5');
      this.time.delayedCall(800, () => this.scene.restart());
    } catch (e) {
      toast(this, (e as Error).message, '#ff8080');
    }
  }
}
