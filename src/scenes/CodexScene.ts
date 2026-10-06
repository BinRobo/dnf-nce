import { need } from '../assets';
import Phaser from 'phaser';
import { speak } from '../audio/speech';
import { sfx } from '../audio/sound';
import type { LessonPair } from '../content/types';
import { backdrop } from '../gfx/textures';
import type { SrsCard } from '../systems/srs';
import { lineId, wordId } from '../systems/questions';
import { game } from '../state';
import { playVideo } from '../ui/video';
import { button, COLORS, EN_FONT, panel, text } from '../ui/widgets';
import { layeredBg } from './BootScene';

/** 单词卡等级：只能靠答对升级，不能买、不能抽 */
export function cardLevel(c: SrsCard | undefined): { name: string; color: number; css: string } {
  if (!c) return { name: '未发现', color: 0x2a2f52, css: '#6d7399' };
  if (c.reps >= 4 && c.interval >= 14) return { name: '彩', color: 0xff6bc8, css: '#ff9fdc' };
  if (c.reps >= 4) return { name: '金', color: 0xffb020, css: '#ffd27a' };
  if (c.reps >= 2) return { name: '银', color: 0xb8c4dd, css: '#e3e9f7' };
  if (c.reps >= 1) return { name: '铜', color: 0xc77b3e, css: '#f0b07a' };
  return { name: '灰', color: 0x5a6080, css: '#b8bdd8' };
}

export class CodexScene extends Phaser.Scene {
  private lessonId = 'L001-002';
  private tab: 'words' | 'lines' = 'lines';
  private layer?: Phaser.GameObjects.Container;

  constructor() {
    super('Codex');
  }

  preload() {
    need(this, { bgs: ['classroom'] });
  }

  create() {
    if (!layeredBg(this, 'classroom')) backdrop(this, 'town', 700);
    this.add.rectangle(0, 0, 1280, 720, 0x0b0d17, 0.45).setOrigin(0);
    button(this, 100, 676, 160, 50, '← 回城', () => this.scene.start('Town'));
    button(this, 290, 676, 200, 50, '🗡 装备图鉴', () => this.scene.start('Gear'), { color: 0x8a5a12 });
    // 只下载玩过的课
    void game.ensureLessons([...game.playedLessons(), 'L001-002', 'L005-006']).then(() => this.scene.isActive() && this.render());
  }

  private lessons(): LessonPair[] {
    const s = game.s;
    return game.index.lessons.filter(
      (l) => s.dungeons[l.id]?.clears || l.id === 'L001-002' || l.id === 'L005-006' || l.words.some((w) => s.srs[wordId(w)]),
    );
  }

  private render() {
    this.layer?.destroy();
    const L = (this.layer = this.add.container(0, 0));
    const s = game.s;
    const list = this.lessons();
    if (!list.find((l) => l.id === this.lessonId)) this.lessonId = list[0]?.id ?? 'L001-002';
    // 左：课程列表
    L.add(panel(this, 20, 20, 300, 630));
    L.add(text(this, 40, 34, '📖 台词簿与单词卡', 22));
    list.slice(0, 11).forEach((l, i) => {
      const lit = l.dialogue.filter((_, k) => (s.srs[lineId(l, k)]?.correct ?? 0) > 0).length;
      const b = button(this, 170, 96 + i * 50, 270, 44, `L${l.lessons[0]} ${l.title}  ${lit}/${l.dialogue.length}`, () => {
        this.lessonId = l.id;
        sfx('page', { volume: 0.4 });
        this.render();
      }, { size: 16, color: l.id === this.lessonId ? 0x3b62d9 : 0x23284a });
      L.add(b);
    });
    // 右：内容
    L.add(panel(this, 340, 20, 920, 630));
    const tabs: [typeof this.tab, string][] = [['lines', '台词簿'], ['words', '单词卡']];
    tabs.forEach(([k, label], i) => L.add(button(this, 440 + i * 170, 52, 150, 44, label, () => {
      this.tab = k;
      this.render();
    }, { size: 20, color: this.tab === k ? 0x3b62d9 : 0x2a2f52 })));
    const lesson = game.index.lesson(this.lessonId)!;
    if (this.tab === 'lines') this.linesPage(L, lesson);
    else this.wordsPage(L, lesson);
  }

  private linesPage(L: Phaser.GameObjects.Container, l: LessonPair) {
    const s = game.s;
    L.add(text(this, 1240, 52, `${l.title}  ${l.titleZh}`, 22, '#ffe14a').setOrigin(1, 0.5));
    const seen = new Set<string>();
    const rows = l.dialogue.map((d, i) => ({ d, i })).filter(({ d }) => !seen.has(d.en) && !!seen.add(d.en));
    const per = Math.min(13, rows.length);
    let lit = 0;
    rows.slice(0, per).forEach(({ d, i }, k) => {
      const ok = (s.srs[lineId(l, i)]?.correct ?? 0) > 0;
      if (ok) lit++;
      const y = 100 + k * 40;
      if (ok) {
        const b = button(this, 800, y + 14, 860, 36, `🔊  ${d.en}`, () => speak({ text: d.en, clip: d.audio }), { size: 19, font: EN_FONT, color: 0x2a3a5a });
        b.label.setOrigin(0, 0.5).setX(-410);
        L.add(b);
      } else {
        L.add(text(this, 380, y + 14, '▒▒▒▒▒▒  （被雾偷走了，去副本里找回来）', 18, '#6d7399').setOrigin(0, 0.5));
      }
    });
    const all = rows.every(({ i }) => (s.srs[lineId(l, i)]?.correct ?? 0) > 0);
    if (all && l.video) L.add(button(this, 1100, 620, 260, 44, '📺 重看整课动画', () => playVideo(l.video!, l.title, () => {}), { size: 18, color: 0x8a5a12 }));
    else L.add(text(this, 800, 620, `已恢复 ${lit}/${rows.length} 句；全部恢复后可重看整课动画`, 16, COLORS.dim).setOrigin(0.5));
  }

  private wordsPage(L: Phaser.GameObjects.Container, l: LessonPair) {
    const s = game.s;
    const cols = 5;
    l.words.slice(0, 30).forEach((w, i) => {
      const c = s.srs[wordId(w)];
      const lv = cardLevel(c);
      const x = 440 + (i % cols) * 176;
      const y = 120 + Math.floor(i / cols) * 86;
      const g = this.add.graphics();
      g.fillStyle(lv.color, c ? 0.9 : 0.5).fillRoundedRect(x - 80, y - 36, 160, 76, 10);
      g.lineStyle(2, 0x2b2a4a, 1).strokeRoundedRect(x - 80, y - 36, 160, 76, 10);
      L.add(g);
      L.add(text(this, x, y - 12, c ? w.en : '?', w.en.length > 10 ? 16 : 22, c ? '#1b1e33' : '#9aa0c8', { fontFamily: EN_FONT, fontStyle: 'bold' }).setOrigin(0.5));
      L.add(text(this, x, y + 16, c ? w.zh : '还没遇到', 14, c ? '#2b2a4a' : '#9aa0c8').setOrigin(0.5));
      L.add(text(this, x + 72, y - 30, lv.name, 13, '#1b1e33').setOrigin(1, 0));
      if (c) {
        const hit = this.add.rectangle(x, y + 2, 160, 76, 0, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => speak({ text: w.en, clip: w.audio }));
        L.add(hit);
      }
    });
    L.add(text(this, 800, 620, '卡片只能靠答对升级：灰 → 铜 → 银 → 金 → 彩（隔两周还记得）', 16, COLORS.dim).setOrigin(0.5));
  }
}
