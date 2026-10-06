import Phaser from 'phaser';
import { GAME_H, GAME_W } from './config';
import { BootScene } from './scenes/BootScene';
import { BattleScene } from './scenes/BattleScene';
import { CodexScene } from './scenes/CodexScene';
import { DungeonScene } from './scenes/DungeonScene';
import { ParentScene } from './scenes/ParentScene';
import { InventoryScene } from './scenes/InventoryScene';
import { ProfileScene } from './scenes/ProfileScene';
import { PartyBattleScene } from './scenes/PartyBattleScene';
import { ResultScene } from './scenes/ResultScene';
import { SkillScene } from './scenes/SkillScene';
import { WardrobeScene } from './scenes/WardrobeScene';
import { CreateScene } from './scenes/CreateScene';
import { GearScene } from './scenes/GearScene';
import { TestScene } from './scenes/TestScene';
import { TownScene } from './scenes/TownScene';
import { game } from './state';
import { cloud } from './save/cloud';
import { net } from './net/realtime';
import { setInputGate } from './ui/dom';

const phaser = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#0b0d17',
  disableContextMenu: true,
  input: { activePointers: 3 },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  // 自动化测试在无 GPU 的服务器上帧率很低：?realtime 让游戏时间跟真实时间走（不影响正式游玩）
  fps: import.meta.env.DEV && new URLSearchParams(location.search).has('realtime') ? { smoothStep: false } : undefined,
  scene: [BootScene, ProfileScene, TownScene, BattleScene, DungeonScene, PartyBattleScene, ResultScene, InventoryScene, CodexScene, ParentScene, SkillScene, WardrobeScene, CreateScene, GearScene, TestScene],
});

setInputGate((on) => (phaser.input.enabled = on));

// 离线缓存（只在 HTTPS 或本机上可用；开发模式不注册，免得缓存干扰调试）
if (!import.meta.env.DEV && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => null));
}

// 开发模式下暴露给控制台/自动化测试
if (import.meta.env.DEV) Object.assign(window, { __phaser: phaser, __game: game, __cloud: cloud, __net: net });

// 关闭或切走页面时再存一次
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void game.persist();
});
