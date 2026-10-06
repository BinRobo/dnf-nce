import Phaser from 'phaser';
import { speak } from '../audio/speech';
import { refreshMusic } from '../audio/sound';
import { backdrop } from '../gfx/textures';
import { emptyDayLog, today, type Settings } from '../save/schema';
import { game } from '../state';
import { button, COLORS, EN_FONT, panel, text, toast } from '../ui/widgets';

const TYPE_NAME: Record<string, string> = { listen: '听音辨义', meaning: '见义识词', fill: '句型填空', spell: '拼写', order: '连词成句' };

/** 家长页：4 位 PIN；学习日报、近 7 天时长、设置（每日时长、年级、拼写方式、减弱特效） */
export class ParentScene extends Phaser.Scene {
  private unlocked = false;

  constructor() {
    super('Parent');
  }

  create() {
    backdrop(this, 'dungeon', 700);
    button(this, 100, 676, 160, 50, '← 回城', () => this.scene.start('Town'));
    if (!this.unlocked && !this.gate()) return;
    this.render();
  }

  private gate(): boolean {
    const s = game.s;
    if (!s.settings.pin) {
      const a = window.prompt('第一次进入家长页，请设置 4 位数字密码：')?.trim();
      if (!a || !/^\d{4}$/.test(a)) return this.back('密码需要 4 位数字');
      const b = window.prompt('请再输入一次：')?.trim();
      if (a !== b) return this.back('两次输入不一致');
      s.settings.pin = a;
      void game.persist();
    } else {
      const a = window.prompt('请输入家长密码：')?.trim();
      if (a !== s.settings.pin) return this.back('密码不正确');
    }
    this.unlocked = true;
    return true;
  }

  private back(msg: string) {
    toast(this, msg, '#ff9a9a');
    this.time.delayedCall(900, () => this.scene.start('Town'));
    return false;
  }

  private render() {
    const s = game.s;
    const d = s.dayLog[today()] ?? emptyDayLog();
    // 左：今日报告
    panel(this, 20, 20, 620, 630);
    text(this, 44, 36, `📊 ${s.name} 的学习日报（${today()}）`, 24);
    const acc = d.answers ? Math.round((d.correct / d.answers) * 100) : 0;
    const rows: [string, string][] = [
      ['今日学习时长', `${Math.round(d.ms / 60000)} 分钟（上限 ${s.settings.dailyMinutes} 分钟）`],
      ['答题数 / 首次正确率', `${d.answers} 题 / ${acc}%`],
      ['新学单词 / 复习单词', `${d.newWords.length} / ${d.reviewed.length}`],
      ['完成的课文', d.lessons.map((id) => game.manifest.titles[id]?.title ?? id).join('、') || '—'],
    ];
    rows.forEach(([k, v], i) => {
      text(this, 44, 84 + i * 36, k, 18, COLORS.dim);
      text(this, 250, 84 + i * 36, v, 18, '#ffffff', { wordWrap: { width: 370 } });
    });
    text(this, 44, 236, '各题型首次正确率', 18, COLORS.dim);
    Object.entries(TYPE_NAME).forEach(([k, name], i) => {
      const [n, c] = d.perType[k] ?? [0, 0];
      const x = 44 + (i % 3) * 196, y = 268 + Math.floor(i / 3) * 34;
      text(this, x, y, `${name} ${n ? Math.round((c / n) * 100) + '%' : '—'}`, 17);
    });
    text(this, 44, 344, '今天最难的词（点击听发音）', 18, COLORS.dim);
    const hard = Object.entries(d.missed).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!hard.length) text(this, 44, 376, '今天没有答错的词，太棒了！', 17);
    hard.forEach(([id, n], i) => {
      const e = game.index.items.get(id);
      const label = e?.type === 'word' ? `${e.word.en}  ${e.word.zh}` : e?.type === 'line' ? e.lesson.dialogue[e.index].en : id;
      const b = button(this, 330, 382 + i * 32, 560, 28, `${label}  ×${n}`, () => {
        if (e?.type === 'word') speak({ text: e.word.en, clip: e.word.audio });
        else if (e?.type === 'line') speak({ text: e.lesson.dialogue[e.index].en, clip: e.lesson.dialogue[e.index].audio });
      }, { size: 15, font: EN_FONT, color: 0x23284a });
      b.label.setOrigin(0, 0.5).setX(-270);
    });
    // 近 7 天
    const days = Array.from({ length: 7 }, (_, i) => {
      const t = new Date(Date.now() - (6 - i) * 864e5);
      return today(t);
    });
    const g = this.add.graphics();
    const max = Math.max(s.settings.dailyMinutes, ...days.map((k) => (s.dayLog[k]?.ms ?? 0) / 60000));
    days.forEach((k, i) => {
      const m = (s.dayLog[k]?.ms ?? 0) / 60000;
      const h = (m / max) * 70;
      g.fillStyle(0x7fd0ff, 1).fillRect(680 + i * 76, 210 - h, 40, h);
      text(this, 700 + i * 76, 218, k.slice(5), 13, COLORS.dim).setOrigin(0.5, 0);
      text(this, 700 + i * 76, 204 - h, m ? `${Math.round(m)}` : '', 13).setOrigin(0.5, 1);
    });
    // 右：设置
    panel(this, 660, 20, 600, 630);
    text(this, 684, 36, '近 7 天学习时长（分钟）', 18, COLORS.dim);
    text(this, 684, 260, '⚙ 设置', 22);
    this.choice(300, '每日时长', 'dailyMinutes', [[20, '20 分'], [30, '30 分'], [45, '45 分'], [60, '60 分']]);
    this.choice(360, '年级', 'grade', [['low', '3–4 年级'], ['high', '5–6 年级']]);
    this.choice(420, '拼写方式', 'spellMode', [['auto', '按年级'], ['tiles', '字母块'], ['keyboard', '键盘']]);
    this.choice(480, '减弱震动闪光', 'reduceFx', [[false, '关'], [true, '开']]);
    this.choice(540, '背景音乐', 'music', [[true, '开'], [false, '关']]);
    this.choice(600, '音效', 'sfx', [[true, '开'], [false, '关']]);
  }

  private choice<K extends keyof Settings>(y: number, label: string, key: K, opts: [Settings[K], string][]) {
    const s = game.s;
    text(this, 684, y, label, 18, COLORS.dim).setOrigin(0, 0.5);
    opts.forEach(([v, name], i) => {
      button(this, 900 + i * 92, y, 84, 40, name, () => {
        s.settings[key] = v;
        void game.persist();
        if (key === 'music' || key === 'sfx') refreshMusic();
        this.scene.restart();
      }, { size: 16, color: s.settings[key] === v ? 0x3b62d9 : 0x2a2f52 });
    });
  }
}
