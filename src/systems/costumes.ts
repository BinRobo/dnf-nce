import type { SaveData } from '../save/schema';

/**
 * 装扮（时装）：只管外观。每套 3 件：帽子 hat、上衣 top（身体+两袖）、下装 bottom（两腿+鞋）。
 * 美术：public/assets/art/chars/hero/costume/<套装>/{hat,body,armL,armR,legL,legR}.svg
 * 材料从打怪、Boss、每日任务获得，在集市的裁缝处打造。穿齐整套：进场特效 + 头顶称号 + 金币 +5%。
 */
export type Piece = 'hat' | 'top' | 'bottom';
export type MatKey = 'cloth' | 'thread' | 'brass' | 'badge' | 'ribbon';

export const MAT_INFO: Record<MatKey, { name: string; icon: string; color: string; from: string }> = {
  cloth: { name: '布料', icon: 'mat_cloth', color: '#e8d2a6', from: '每次通关副本（答对越多越多）' },
  thread: { name: '彩色丝线', icon: 'mat_thread', color: '#ff9fb3', from: '打败精英怪' },
  brass: { name: '铜喇叭片', icon: 'mat_brass', color: '#ffb020', from: '打败吞声领主 · 帕顿（L1-2）' },
  badge: { name: '银名牌', icon: 'mat_badge', color: '#c8d6e0', from: '打败夺名迷雾 · 胡迷斯（L5-6）' },
  ribbon: { name: '节日彩带', icon: 'mat_ribbon', color: '#7dffa5', from: '领取每日任务奖励' },
};

export interface CostumeSet {
  id: string;
  name: string;
  color: number;
  title: string;
  /** 每件的配方 */
  cost: Record<Piece, Partial<Record<MatKey, number>> & { gold?: number }>;
}

export const COSTUMES: CostumeSet[] = [
  { id: 'school', name: '校园制服', color: 0x3b62d9, title: '模范学生', cost: { hat: { cloth: 3, gold: 30 }, top: { cloth: 5, gold: 50 }, bottom: { cloth: 4, gold: 40 } } },
  { id: 'knight', name: '见习骑士', color: 0xc8d6e0, title: '见习骑士', cost: { hat: { cloth: 4, thread: 2 }, top: { cloth: 6, thread: 3 }, bottom: { cloth: 5, thread: 2 } } },
  { id: 'mage', name: '魔法学徒', color: 0x9b7bff, title: '魔法学徒', cost: { hat: { cloth: 4, thread: 2 }, top: { cloth: 6, thread: 3 }, bottom: { cloth: 5, thread: 3 } } },
  { id: 'pardon', name: '喇叭领主', color: 0xff7a2e, title: '喇叭领主', cost: { hat: { cloth: 3, brass: 2 }, top: { cloth: 4, brass: 3 }, bottom: { cloth: 3, brass: 2 } } },
  { id: 'whomist', name: '名牌怪盗', color: 0x2fd39a, title: '名牌怪盗', cost: { hat: { cloth: 3, badge: 2 }, top: { cloth: 4, badge: 3 }, bottom: { cloth: 3, badge: 2 } } },
  { id: 'festival', name: '节日礼服', color: 0xffd34a, title: '派对之星', cost: { hat: { cloth: 3, ribbon: 2 }, top: { cloth: 3, ribbon: 3 }, bottom: { cloth: 3, ribbon: 2 } } },
  // 第 7 套：高阶套装，要集齐各种材料才打得出来（材料来源见 MAT_INFO）
  { id: 'gala', name: '星辉盛装', color: 0xf0b84a, title: '星光冒险家', cost: { hat: { cloth: 6, thread: 4, ribbon: 3, gold: 300 }, top: { cloth: 10, thread: 6, brass: 3, badge: 3, gold: 500 }, bottom: { cloth: 8, thread: 5, ribbon: 3, gold: 400 } } },
];
export const PIECES: Piece[] = ['hat', 'top', 'bottom'];
export const PIECE_NAME: Record<Piece, string> = { hat: '帽子', top: '上衣', bottom: '下装' };
/** 每件对应的骨骼部件文件 */
export const PIECE_PARTS: Record<Piece, string[]> = { hat: ['hat'], top: ['body', 'armL', 'armR'], bottom: ['legL', 'legR'] };

export const costumeDef = (id: string | undefined) => COSTUMES.find((c) => c.id === id);
export const pieceId = (set: string, p: Piece) => `${set}_${p}`;

export function canMake(s: SaveData, set: CostumeSet, p: Piece) {
  if (s.wardrobe.owned.includes(pieceId(set.id, p))) return false;
  const c = set.cost[p];
  return (c.gold ?? 0) <= s.gold && (Object.keys(MAT_INFO) as MatKey[]).every((k) => (c[k] ?? 0) <= s.mats[k]);
}

export function makePiece(s: SaveData, set: CostumeSet, p: Piece): boolean {
  if (!canMake(s, set, p)) return false;
  const c = set.cost[p];
  s.gold -= c.gold ?? 0;
  for (const k of Object.keys(MAT_INFO) as MatKey[]) s.mats[k] -= c[k] ?? 0;
  s.wardrobe.owned.push(pieceId(set.id, p));
  // 做好就自动穿上
  s.wardrobe.worn[p] = set.id;
  return true;
}

/** 穿齐的整套（三件同一套）；没有返回 undefined */
export function fullSet(s: SaveData) {
  const w = s.wardrobe.worn;
  return w.hat && w.hat === w.top && w.top === w.bottom ? costumeDef(w.hat) : undefined;
}
