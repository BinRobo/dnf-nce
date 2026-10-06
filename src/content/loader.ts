import type { LessonPair, Manifest } from './types';

export const CONTENT_BASE = 'content/book1/';

/** 启动时只取目录（含每课标题），课文本身用 ensureLessons 按需取 */
export async function loadManifest(): Promise<Manifest> {
  return (await fetch(CONTENT_BASE + 'manifest.json')).json();
}

const inflight = new Map<string, Promise<LessonPair | null>>();
export function fetchLesson(id: string): Promise<LessonPair | null> {
  let p = inflight.get(id);
  if (!p) {
    p = fetch(`${CONTENT_BASE}lessons/${id}.json`).then((r) => (r.ok ? (r.json() as Promise<LessonPair>) : null)).catch(() => null);
    inflight.set(id, p);
  }
  return p;
}

export async function loadContent(): Promise<{ manifest: Manifest; lessons: LessonPair[] }> {
  const manifest: Manifest = await (await fetch(CONTENT_BASE + 'manifest.json')).json();
  const ids = manifest.regions.flatMap((r) => r.dungeons);
  const lessons = await Promise.all(
    ids.map(async (id) => {
      const res = await fetch(`${CONTENT_BASE}lessons/${id}.json`);
      if (!res.ok) throw new Error(`缺少课程文件 ${id}.json`);
      return (await res.json()) as LessonPair;
    }),
  );
  return { manifest, lessons };
}
