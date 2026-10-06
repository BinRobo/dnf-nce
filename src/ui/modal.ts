import Phaser from 'phaser';
import { button, panel, text } from './widgets';

/** 半透明遮罩 + 面板，返回一个 container，调用 close() 关闭 */
export function modal(scene: Phaser.Scene, w: number, h: number, title: string) {
  const { width, height } = scene.scale;
  const c = scene.add.container(0, 0).setDepth(500);
  const dim = scene.add.rectangle(0, 0, width, height, 0x000000, 0.6).setOrigin(0).setInteractive();
  const x = (width - w) / 2;
  const y = (height - h) / 2;
  c.add([dim, panel(scene, x, y, w, h, 0.98), text(scene, width / 2, y + 30, title, 30).setOrigin(0.5)]);
  const close = () => c.destroy();
  c.add(button(scene, x + w - 34, y + 30, 44, 44, '✕', close, { size: 22 }));
  return { c, x, y, w, h, close };
}

export function confirmBox(scene: Phaser.Scene, msg: string, onYes: () => void) {
  const m = modal(scene, 520, 240, '确认');
  m.c.add(text(scene, m.x + m.w / 2, m.y + 100, msg, 22, undefined, { align: 'center', wordWrap: { width: 460 } }).setOrigin(0.5));
  m.c.add(button(scene, m.x + m.w / 2 - 100, m.y + 190, 160, 50, '确定', () => { m.close(); onYes(); }, { color: 0xb8323f }));
  m.c.add(button(scene, m.x + m.w / 2 + 100, m.y + 190, 160, 50, '取消', m.close));
  return m;
}
