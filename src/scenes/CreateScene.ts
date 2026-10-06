import { need } from '../assets';
import Phaser from 'phaser';
import { sfx } from '../audio/sound';
import { makeHero } from '../gfx/hero';
import { saveProfile } from '../save/db';
import { newSave } from '../save/schema';
import { normalizeSkills, skillTree } from '../battle/skilldata';
import { CLASS_IDS, CLASSES, type ClassId, type Gender } from '../systems/classes';
import { WTYPE_NAME } from '../systems/catalog';
import { uid } from '../systems/rng';
import { game } from '../state';
import { button, COLORS, panel, text } from '../ui/widgets';
import { layeredBg } from './BootScene';

/** 新建角色：三职业 × 男女，选好后起名字 */
export class CreateScene extends Phaser.Scene {
  private cls: ClassId = 'sword';
  private gender: Gender = 'm';
  private layer?: Phaser.GameObjects.Container;

  constructor() {
    super('Create');
  }

  preload() {
    const heroes = CLASS_IDS.flatMap((cls) => (['m', 'f'] as Gender[]).map((gender) => ({ ...newSave('p', ''), cls, gender })));
    need(this, { heroes, bgs: ['training'], sfx: ['gun_shot', 'mage_cast', 'swing2'] });
  }

  create() {
    layeredBg(this, 'training');
    this.add.rectangle(0, 0, 1280, 720, 0x0b0d17, 0.3).setOrigin(0);
    text(this, 640, 44, '选择你的职业', 40, '#ffffff', { fontStyle: 'bold', stroke: '#1b1b2b', strokeThickness: 7 }).setOrigin(0.5);
    button(this, 90, 680, 150, 48, '← 返回', () => this.scene.start('Profile'), { size: 20 });
    this.render();
  }

  private render() {
    this.layer?.destroy();
    const L = (this.layer = this.add.container(0, 0));
    CLASS_IDS.forEach((id, i) => {
      const c = CLASSES[id];
      const x = 230 + i * 410, sel = this.cls === id;
      const g = this.add.graphics();
      g.fillStyle(sel ? 0x24305a : 0x161a2e, 0.92).fillRoundedRect(x - 190, 84, 380, 520, 16);
      g.lineStyle(sel ? 5 : 2, sel ? 0xffe14a : c.color, 1).strokeRoundedRect(x - 190, 84, 380, 520, 16);
      L.add(g);
      L.add(text(this, x, 118, c.name, 34, `#${c.color.toString(16).padStart(6, '0')}`, { fontStyle: 'bold' }).setOrigin(0.5));
      L.add(text(this, x, 156, c.desc, 17, '#e9ecff').setOrigin(0.5));
      // 男女两个形象，点谁选谁
      (['m', 'f'] as Gender[]).forEach((gd, k) => {
        const hx = x - 85 + k * 170;
        const on = sel && this.gender === gd;
        if (on) L.add(this.add.ellipse(hx, 432, 150, 26, 0xffe14a, 0.45));
        const s = { ...newSave('preview', ''), cls: id, gender: gd };
        const h = makeHero(this, hx, 430, s, 0.62).idle();
        if (!on) h.setAlpha(sel ? 0.75 : 0.6);
        L.add(h);
        L.add(text(this, hx, 452, gd === 'm' ? '男生' : '女生', 17, on ? '#ffe14a' : COLORS.dim).setOrigin(0.5));
        const hit = this.add.rectangle(hx, 330, 160, 260, 0, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => {
          this.cls = id;
          this.gender = gd;
          sfx(id === 'gunner' ? 'gun_shot' : id === 'mage' ? 'mage_cast' : 'swing2', { volume: 0.6 }, 'ui_click');
          this.render();
        });
        L.add(hit);
      });
      const skills = skillTree({ cls: id }).filter((k) => !k.passive).slice(0, 4).map((k) => k.name).join('、');
      L.add(text(this, x, 490, `武器：${c.wtypes.map((w) => WTYPE_NAME[w]).join(' / ')}`, 16, '#cfd6ff').setOrigin(0.5));
      L.add(text(this, x, 518, `职业特长：${c.bonus}`, 16, '#ffd38a').setOrigin(0.5));
      L.add(text(this, x, 548, `技能：${skills}……`, 15, COLORS.dim, { wordWrap: { width: 340 }, align: 'center' }).setOrigin(0.5, 0));
    });
    L.add(panel(this, 440, 616, 400, 92, 0));
    L.add(button(this, 640, 662, 360, 60, `✓ 选 ${CLASSES[this.cls].name}·${this.gender === 'm' ? '男' : '女'}，起名字`, () => void this.confirm(), { size: 22, color: 0x2f7a4d }));
  }

  private async confirm() {
    const name = window.prompt('给你的角色起个名字：', '')?.trim();
    if (!name) return;
    const s = newSave(uid(), name.slice(0, 12));
    s.cls = this.cls;
    s.gender = this.gender;
    normalizeSkills(s);
    await saveProfile(s);
    game.use(s);
    this.scene.start('Town');
  }
}
