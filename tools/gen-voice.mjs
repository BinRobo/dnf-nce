// 为 NPC 闲聊台词和剧本里的中文对白生成中文配音（微软神经语音，家用）
// 输出 public/content/voice/<hash>.mp3 + public/content/voice/index.json（文本 → 文件）
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

const OUT = 'public/content/voice';
const TMP = '.cache/voice-tmp';
mkdirSync(OUT, { recursive: true });
const voices = JSON.parse(readFileSync('content-src/npc/voices.json', 'utf8'));
const jobs = []; // [who, zh]
const barks = JSON.parse(readFileSync('content-src/npc/barks.json', 'utf8'));
for (const [who, list] of Object.entries(barks)) if (Array.isArray(list)) for (const b of list) jobs.push([who, b.zh]);
for (const f of readdirSync('content-src/story').filter((f) => f.endsWith('.json'))) {
  for (const st of JSON.parse(readFileSync(`content-src/story/${f}`, 'utf8')).steps ?? []) {
    if (st.t === 'say' && st.zh && !st.en && voices[st.who]) jobs.push([st.who, st.zh]);
  }
}
const key = (who, zh) => createHash('md5').update(`${who}|${voices[who].voice}|${voices[who].rate}|${voices[who].pitch}|${zh}`).digest('hex').slice(0, 12);
const index = {};
let made = 0;
for (const [who, zh] of jobs) {
  if (!voices[who]) continue;
  const k = key(who, zh);
  index[`${who}|${zh}`] = `voice/${k}.mp3`;
  const out = `${OUT}/${k}.mp3`;
  if (existsSync(out)) continue;
  const v = voices[who];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(v.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      rmSync(TMP, { recursive: true, force: true });
      mkdirSync(TMP, { recursive: true });
      // 去掉括号里的动作说明，例如“（拼命比划）”
      const said = zh.replace(/（[^）]*）|\([^)]*\)/g, '').trim();
      const r = await tts.toFile(TMP, said || zh, { rate: v.rate, pitch: v.pitch });
      renameSync(r.audioFilePath, out);
      made++;
      break;
    } catch (e) {
      if (attempt === 2) console.warn('失败', who, zh, e.message);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}
writeFileSync(`${OUT}/index.json`, JSON.stringify(index, null, 1));
console.log(`台词 ${jobs.length} 句，新生成 ${made}`);
process.exit(0);
