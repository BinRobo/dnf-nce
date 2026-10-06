import { loadNow } from '../assets';
import Phaser from 'phaser';
import { backdrop } from '../gfx/textures';
import { deleteProfile, exportSave, listProfiles, parseImport, saveProfile } from '../save/db';
import { migrate, type SaveData } from '../save/schema';
import { makeHero } from '../gfx/hero';
import { classOf } from '../systems/classes';
import { game } from '../state';
import { downloadText, pickTextFile, stamp } from '../ui/files';
import { confirmBox } from '../ui/modal';
import { button, COLORS, panel, text, toast } from '../ui/widgets';

const MAX_PROFILES = 4;

export class ProfileScene extends Phaser.Scene {
  constructor() {
    super('Profile');
  }

  create() {
    backdrop(this, 'town', 560);
    const { width } = this.scale;
    text(this, width / 2, 70, '英语地下城', 64, '#ffffff', { stroke: '#1b1b2b', strokeThickness: 8 }).setOrigin(0.5);
    text(this, width / 2, 130, `${game.manifest.title} · 选择你的角色`, 24, '#ffffff', { stroke: '#1b1b2b', strokeThickness: 4 }).setOrigin(0.5);
    void this.render();
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

    button(this, width / 2, 595, 260, 48, '从备份文件导入', () => void this.importFile());
    text(this, width / 2, 635, '存档保存在本机浏览器里，并自动保留最近 10 份快照。\n换电脑、清理浏览器前请先“导出备份”。', 18, '#dfe4ff', {
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
    button(this, x + 50, y + 330, 90, 36, '导出', () => downloadText(`英语地下城-${p.name}-${stamp()}.json`, exportSave(p)), { size: 18 });
    button(this, x + w - 50, y + 330, 90, 36, '删除', () =>
      confirmBox(this, `确定删除角色「${p.name}」吗？\n删除前建议先导出备份。`, async () => {
        await deleteProfile(p.id);
        this.scene.restart();
      }), { size: 18, color: 0x6b2a35 });
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
