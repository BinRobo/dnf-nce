import type { SaveData } from '../save/schema';

interface RegionLike {
  dungeons: string[];
}

const cleared = (s: SaveData, id: string) => (s.dungeons[id]?.clears ?? 0) > 0;

/** 这个副本现在能不能进：上一张地图通关、本图前一个副本通关（L5-6 在通关 L1-2 后直接开放） */
export function dungeonOpen(s: SaveData, manifest: { regions: RegionLike[] }, id: string): boolean {
  const ri = manifest.regions.findIndex((r) => r.dungeons.includes(id));
  if (ri < 0) return false;
  if (ri > 0 && !manifest.regions[ri - 1].dungeons.every((d) => cleared(s, d))) return false;
  const i = manifest.regions[ri].dungeons.indexOf(id);
  return i === 0 || cleared(s, manifest.regions[ri].dungeons[i - 1]) || (id === 'L005-006' && cleared(s, 'L001-002'));
}

/** 所有现在能进的副本（组队选择用） */
export function openDungeons(s: SaveData, manifest: { regions: RegionLike[] }): string[] {
  return manifest.regions.flatMap((r) => r.dungeons).filter((id) => dungeonOpen(s, manifest, id));
}
