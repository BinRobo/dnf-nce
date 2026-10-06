import Phaser from 'phaser';

export const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
export const EN_FONT = '"Trebuchet MS","Segoe UI",Arial,sans-serif';

export const COLORS = {
  panel: 0x161a2e,
  panelEdge: 0x3a4170,
  btn: 0x2d3561,
  btnHover: 0x3d4785,
  gold: 0xffc94a,
  good: 0x4fdc7b,
  bad: 0xff5a5a,
  text: '#e9ecff',
  dim: '#8f96c2',
};

export function text(
  scene: Phaser.Scene, x: number, y: number, str: string,
  size = 24, color = COLORS.text, opts: Phaser.Types.GameObjects.Text.TextStyle = {},
) {
  const clean = Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined));
  return scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, ...clean });
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, alpha = 0.92) {
  const g = scene.add.graphics();
  g.fillStyle(COLORS.panel, alpha).fillRoundedRect(x, y, w, h, 14);
  g.lineStyle(2, COLORS.panelEdge, 1).strokeRoundedRect(x, y, w, h, 14);
  return g;
}

export interface Button extends Phaser.GameObjects.Container {
  setEnabled(on: boolean): this;
  setLabel(s: string): this;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

export function button(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string,
  onClick: () => void, opts: { color?: number; size?: number; font?: string } = {},
): Button {
  const color = opts.color ?? COLORS.btn;
  const c = scene.add.container(x, y) as Button;
  const bg = scene.add.rectangle(0, 0, w, h, color).setStrokeStyle(2, 0xffffff, 0.15);
  const t = scene.add
    .text(0, 0, label, { fontFamily: opts.font ?? FONT, fontSize: `${opts.size ?? 24}px`, color: '#ffffff', align: 'center' })
    .setOrigin(0.5);
  c.add([bg, t]);
  c.bg = bg;
  c.label = t;
  c.setSize(w, h);
  let enabled = true;
  bg.setInteractive({ useHandCursor: true })
    .on('pointerover', () => enabled && bg.setFillStyle(Phaser.Display.Color.ValueToColor(color).lighten(15).color))
    .on('pointerout', () => bg.setFillStyle(color))
    .on('pointerdown', () => {
      if (!enabled) return;
      scene.tweens.add({ targets: c, scale: 0.94, duration: 60, yoyo: true });
      onClick();
    });
  c.setEnabled = (on: boolean) => {
    enabled = on;
    c.setAlpha(on ? 1 : 0.4);
    return c;
  };
  c.setLabel = (s: string) => {
    t.setText(s);
    return c;
  };
  return c;
}

export function bar(scene: Phaser.Scene, x: number, y: number, w: number, h: number, ratio: number, color: number) {
  const g = scene.add.graphics();
  const draw = (r: number) => {
    g.clear();
    g.fillStyle(0x000000, 0.5).fillRoundedRect(x, y, w, h, h / 2);
    if (r > 0) g.fillStyle(color, 1).fillRoundedRect(x, y, Math.max(h, w * Math.min(1, r)), h, h / 2);
  };
  draw(ratio);
  return { g, draw };
}

/** 屏幕中央浮出一条提示 */
export function toast(scene: Phaser.Scene, msg: string, color = '#ffffff') {
  const { width } = scene.scale;
  const t = text(scene, width / 2, 90, msg, 28, color, { stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setDepth(1000);
  scene.tweens.add({ targets: t, y: 60, alpha: 0, delay: 1400, duration: 500, onComplete: () => t.destroy() });
}
