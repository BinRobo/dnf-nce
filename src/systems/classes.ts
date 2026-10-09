import type { SaveData } from '../save/schema';
import type { WType } from './catalog';

/**
 * 职业：创建角色时选择（剑士 / 神枪手 / 魔法师 × 男女）。
 * 每个职业有自己的主角形象、武器类别、普通攻击方式、技能树和一点职业加成。
 * 所有主角共用同一套骨骼（rig.json 相同），所以装扮通用。
 */
export type ClassId = 'sword' | 'gunner' | 'mage';
export type Gender = 'm' | 'f';

export interface ClassDef {
  id: ClassId;
  name: string;
  desc: string;
  bonus: string;
  color: number;
  /** 可用武器类别 */
  wtypes: WType[];
  /** 没装备武器时手里拿的 */
  defaultLook: string;
  /** 基础技能（随时可用） */
  base: string;
  /** 普通攻击：挥砍 / 射击 / 魔法弹 */
  attack: 'swing' | 'shoot' | 'cast';
  /** 通用护甲里属于本职业的（图标 key） */
  armor: string[];
}

export const CLASSES: Record<ClassId, ClassDef> = {
  sword: {
    id: 'sword', name: '剑士', desc: '挥剑近战，连斩不停', bonus: '暴击伤害更高', color: 0xff7a59,
    wtypes: ['dagger', 'longsword', 'greatsword', 'hammer'], defaultLook: 'longsword', base: 'slash', attack: 'swing',
    armor: ['chainmail', 'plate'],
  },
  gunner: {
    id: 'gunner', name: '神枪手', desc: '远程射击，字母子弹打个不停', bonus: '暴击率更高', color: 0xffb020,
    wtypes: ['pistol', 'rifle', 'cannon', 'bow'], defaultLook: 'pistol', base: 'g_', attack: 'shoot',
    armor: ['leather', 'cloak'],
  },
  mage: {
    id: 'mage', name: '魔法师', desc: '火、冰、雷、光四种元素魔法', bonus: '连击加成更高', color: 0x9b7bff,
    wtypes: ['staff', 'wand', 'orb', 'tome'], defaultLook: 'wand', base: 'm_', attack: 'cast',
    armor: ['cloth'],
  },
};
export const CLASS_IDS: ClassId[] = ['sword', 'gunner', 'mage'];

/** 默认造型是 H 风格（田园小冒险家）；网址加 ?old 可临时换回旧造型，排查问题用 */
export const useOld = () => typeof location !== 'undefined' && /[?&]old(=|&|$)/i.test(location.search);
/** 武器库目录：默认是 H 风格的柔线暖彩版（尺寸和握点与原版相同） */
export const weaponDir = () => (useOld() ? 'hero/weapons/' : 'hero/weapons_h/');
export const heroRig = (c: ClassId, g: Gender) => (useOld() ? (c === 'sword' && g === 'm' ? 'hero' : `hero_${c[0]}${g}`) : `h_${c[0]}${g}`);

export const classOf = (s: Pick<SaveData, 'cls'>) => CLASSES[s.cls ?? 'sword'];
