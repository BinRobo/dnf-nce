import Phaser from 'phaser';
import { JOBS } from '../systems/player';
import type { Job } from '../save/schema';

/** 原型阶段用程序绘制的角色和怪物，之后可以直接换成像素美术素材（同名纹理即可）。 */
export function makeTextures(scene: Phaser.Scene) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const gen = (key: string, w: number, h: number, draw: () => void) => {
    g.clear();
    draw();
    g.generateTexture(key, w, h);
  };

  for (const job of Object.keys(JOBS) as Job[]) {
    const cape = JOBS[job].color;
    gen(`player_${job}`, 96, 112, () => {
      g.fillStyle(cape, 1).fillTriangle(30, 40, 22, 98, 52, 92); // 披风
      g.fillStyle(0x2b3150, 1).fillRect(36, 80, 10, 26).fillRect(52, 80, 10, 26); // 腿
      g.fillStyle(0x6b7bb8, 1).fillRoundedRect(30, 40, 38, 44, 8); // 身体
      g.fillStyle(0xffd9b3, 1).fillCircle(49, 28, 17); // 头
      g.fillStyle(cape, 1).fillRoundedRect(31, 8, 36, 14, 6); // 头盔
      g.fillStyle(0x1b1b2b, 1).fillCircle(55, 28, 3); // 眼
      g.fillStyle(0xd7e3ff, 1).fillRect(66, 22, 6, 58); // 剑
      g.fillStyle(0xffc94a, 1).fillRect(60, 70, 18, 6);
    });
  }

  gen('slime', 90, 70, () => {
    g.fillStyle(0x4fdc7b, 1).fillEllipse(45, 44, 84, 50);
    g.fillStyle(0x8af0aa, 1).fillEllipse(32, 32, 20, 10);
    g.fillStyle(0xffffff, 1).fillCircle(32, 42, 9).fillCircle(56, 42, 9);
    g.fillStyle(0x1b1b2b, 1).fillCircle(30, 44, 4).fillCircle(54, 44, 4);
  });

  gen('goblin', 90, 110, () => {
    g.fillStyle(0x6c8b3c, 1).fillTriangle(14, 30, 30, 40, 26, 22).fillTriangle(76, 30, 60, 40, 64, 22);
    g.fillStyle(0x85a84a, 1).fillCircle(45, 36, 22);
    g.fillStyle(0x7a4a2a, 1).fillRoundedRect(25, 56, 40, 40, 8);
    g.fillStyle(0x4b2e1a, 1).fillRect(28, 94, 10, 14).fillRect(52, 94, 10, 14);
    g.fillStyle(0xff3b3b, 1).fillCircle(37, 34, 4).fillCircle(53, 34, 4);
    g.fillStyle(0x5a3a1a, 1).fillRect(4, 40, 10, 50); // 木棒
  });

  gen('ghost', 90, 100, () => {
    g.fillStyle(0xa77bff, 0.85).fillCircle(45, 40, 32).fillRect(13, 40, 64, 40);
    for (let i = 0; i < 4; i++) g.fillTriangle(13 + i * 16, 80, 29 + i * 16, 80, 21 + i * 16, 96);
    g.fillStyle(0x1b0b3b, 1).fillEllipse(34, 40, 10, 16).fillEllipse(56, 40, 10, 16);
  });

  gen('boss', 200, 200, () => {
    g.fillStyle(0x5a1a2a, 1).fillTriangle(50, 50, 30, 0, 75, 40).fillTriangle(150, 50, 170, 0, 125, 40);
    g.fillStyle(0xb8323f, 1).fillRoundedRect(30, 40, 140, 130, 30);
    g.fillStyle(0x8a1f2b, 1).fillRect(45, 160, 30, 38).fillRect(125, 160, 30, 38);
    g.fillStyle(0xffe14a, 1).fillCircle(72, 85, 14).fillCircle(128, 85, 14);
    g.fillStyle(0x1b1b2b, 1).fillCircle(72, 87, 6).fillCircle(128, 87, 6);
    g.fillStyle(0xffffff, 1);
    for (let i = 0; i < 5; i++) g.fillTriangle(62 + i * 16, 120, 76 + i * 16, 120, 69 + i * 16, 136);
  });

  gen('abyss', 200, 200, () => {
    g.fillStyle(0x2a0f4a, 1).fillCircle(100, 100, 90);
    g.fillStyle(0x6d2bd9, 1).fillCircle(100, 100, 64);
    g.fillStyle(0xffffff, 1).fillEllipse(100, 100, 90, 56);
    g.fillStyle(0xff3bd0, 1).fillCircle(100, 100, 22);
    g.fillStyle(0x000000, 1).fillCircle(100, 100, 10);
  });

  gen('spark', 16, 16, () => g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8));
  gen('slash', 160, 160, () => {
    g.lineStyle(14, 0xffffff, 1).beginPath().arc(80, 80, 64, -1.2, 1.2).strokePath();
    g.lineStyle(6, 0x9fe3ff, 1).beginPath().arc(80, 80, 52, -1, 1).strokePath();
  });
  gen('heart', 28, 26, () => {
    g.fillStyle(0xff4d6d, 1).fillCircle(8, 8, 8).fillCircle(20, 8, 8).fillTriangle(0, 11, 28, 11, 14, 26);
  });
  gen('heart_empty', 28, 26, () => {
    g.fillStyle(0x3b3f5c, 1).fillCircle(8, 8, 8).fillCircle(20, 8, 8).fillTriangle(0, 11, 28, 11, 14, 26);
  });
  g.destroy();
}

export type Theme = 'town' | 'dungeon' | 'abyss';

export function backdrop(scene: Phaser.Scene, theme: Theme, groundY = 420) {
  const { width, height } = scene.scale;
  const g = scene.add.graphics().setDepth(-10);
  const sky = { town: [0x2a4b8d, 0x8ec5ff], dungeon: [0x141831, 0x3a2e5c], abyss: [0x0a0614, 0x3b0d4f] }[theme];
  g.fillGradientStyle(sky[0], sky[0], sky[1], sky[1], 1).fillRect(0, 0, width, groundY);
  // 远山
  const hill = { town: 0x3d6b4f, dungeon: 0x232845, abyss: 0x1f0a2e }[theme];
  g.fillStyle(hill, 1);
  for (let x = -100; x < width + 200; x += 220) g.fillTriangle(x, groundY, x + 140, groundY - 160 - ((x / 7) % 60), x + 300, groundY);
  // 地面
  const ground = { town: 0x6b5b3e, dungeon: 0x2e2a3a, abyss: 0x1a0f26 }[theme];
  g.fillStyle(ground, 1).fillRect(0, groundY, width, height - groundY);
  g.fillStyle(0x000000, 0.18);
  for (let x = 0; x < width; x += 64) g.fillRect(x, groundY, 2, height - groundY);
  if (theme !== 'town') {
    // 火把
    for (const x of [160, width - 160]) {
      g.fillStyle(0x5a3a1a, 1).fillRect(x - 4, groundY - 150, 8, 40);
      const f = scene.add.circle(x, groundY - 160, 12, theme === 'abyss' ? 0xc04bff : 0xffa53a).setDepth(-9);
      scene.tweens.add({ targets: f, scale: 1.3, alpha: 0.7, duration: 300, yoyo: true, repeat: -1 });
    }
  }
  return g;
}
