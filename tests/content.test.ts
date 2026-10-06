import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LessonPair, Manifest } from '../src/content/types';
import { newSave } from '../src/save/schema';
import { buildDungeon, meaningQ, ContentIndex } from '../src/systems/questions';

const BASE = 'public/content/book1';
const manifest = JSON.parse(readFileSync(`${BASE}/manifest.json`, 'utf8')) as Manifest;
const ids = manifest.regions.flatMap((r) => r.dungeons);
const lessons = ids.map((id) => JSON.parse(readFileSync(`${BASE}/lessons/${id}.json`, 'utf8')) as LessonPair);
const idx = new ContentIndex(lessons);

describe('课程内容', () => {
  it('地图里的副本都有课程文件，且课号连续', () => {
    expect(lessons.length).toBe(ids.length);
    lessons.forEach((l, i) => expect(l.lessons).toEqual([i * 2 + 1, i * 2 + 2]));
  });

  it.each(lessons.map((l) => [l.id, l] as const))('%s 数据完整', (_, l) => {
    expect(l.words.length).toBeGreaterThan(0);
    expect(l.dialogue.length).toBeGreaterThan(0);
    expect(l.drills.length).toBeGreaterThanOrEqual(4);
    for (const w of l.words) expect(w.zh).toBeTruthy();
    for (const d of l.drills) {
      expect(d.en.split('___').length).toBe(2);
      expect(d.options).toContain(d.answer);
      expect(new Set(d.options).size).toBe(d.options.length);
    }
    // 有视频文件时，每句课文都要有原声片段，且时间递增
    if (l.video) {
      expect(existsSync(`${BASE}/${l.video.file}`)).toBe(true);
      let last = 0;
      for (const line of l.dialogue) {
        expect(line.audio).toBeDefined();
        expect(line.audio!.start!).toBeGreaterThanOrEqual(last);
        expect(line.audio!.end!).toBeGreaterThan(line.audio!.start!);
        last = line.audio!.end!;
      }
    }
  });

  it.each(lessons.map((l) => [l.id, l] as const))('%s 能生成合法副本', (_, l) => {
    for (let n = 0; n < 5; n++) {
      const plan = buildDungeon(l, newSave('a', 'a'), idx);
      expect(plan.rooms.at(-1)!.kind).toBe('boss');
      for (const q of plan.rooms.flatMap((r) => r.questions)) {
        if (q.kind === 'pick') {
          expect(q.answer).toBeGreaterThanOrEqual(0);
          expect(new Set(q.options.map((o) => o.toLowerCase())).size).toBe(q.options.length);
        }
        if (q.kind === 'spell') for (const ch of q.word) expect(q.tiles).toContain(ch);
        if (q.kind === 'order') expect([...q.chips].sort()).toEqual([...q.answer].sort());
      }
    }
  });
});

describe('识词题的干扰项', () => {
  it('不会出现只差大小写的选项（miss / Miss）', () => {
    const lesson = lessons.find((l) => l.words.some((w) => w.en === 'miss'));
    expect(lesson).toBeTruthy();
    const w = lesson!.words.find((x) => x.en === 'miss')!;
    for (let n = 0; n < 300; n++) {
      const q = meaningQ(w, idx, lesson!.words);
      expect(new Set(q.options.map((o: string) => o.toLowerCase())).size).toBe(q.options.length);
    }
  });
});
