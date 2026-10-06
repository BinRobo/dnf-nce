// 用微软 Sonia（en-GB）神经语音为所有生词预生成发音（家用；非官方接口，商用前应改用 Azure 官方 API）
// 输出 public/content/book1/words/<slug>.mp3；已存在的跳过。build-content 会把 audio 写进课程 JSON。
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';

const VOICE = 'en-GB-SoniaNeural';
const OUT = 'public/content/book1/words';
const TMP = '.cache/tts-tmp';
mkdirSync(OUT, { recursive: true });
export const wordSlug = (w) => w.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const words = new Set();
for (const f of readdirSync('content-src/book1').filter((f) => /^L\d{3}-\d{3}\.json$/.test(f))) {
  for (const w of JSON.parse(readFileSync(`content-src/book1/${f}`, 'utf8')).words) words.add(w.en);
}
let made = 0, failed = 0;
for (const w of words) {
  const out = `${OUT}/${wordSlug(w)}.mp3`;
  if (existsSync(out)) continue;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      rmSync(TMP, { recursive: true, force: true });
      mkdirSync(TMP, { recursive: true });
      const r = await tts.toFile(TMP, w.replace(/\./g, ''), { rate: '-10%' });
      renameSync(r.audioFilePath, out);
      made++;
      break;
    } catch (e) {
      if (attempt === 2) { failed++; console.warn('失败', w, e.message); }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}
console.log(`共 ${words.size} 词，新生成 ${made}，失败 ${failed}`);
process.exit(0);
