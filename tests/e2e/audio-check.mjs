import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://localhost:5174/audition/sfx2.html');
const res = await p.evaluate(async () => {
  const m = await (await fetch('/assets/audio/manifest.json')).json();
  const ctx = new OfflineAudioContext(1, 44100, 44100);
  const out = { ok: 0, bad: [] };
  for (const [k, f] of [...Object.entries(m.sfx), ...Object.entries(m.bgm)]) {
    try {
      const buf = await ctx.decodeAudioData(await (await fetch('/assets/audio/' + f)).arrayBuffer());
      const d = buf.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < d.length; i += 4) peak = Math.max(peak, Math.abs(d[i]));
      if (buf.duration < 0.03 || peak < 0.05) out.bad.push(`${k} dur=${buf.duration.toFixed(2)} peak=${peak.toFixed(3)}`);
      else out.ok++;
    } catch (e) { out.bad.push(`${k} ${e}`); }
  }
  return out;
});
console.log(JSON.stringify(res));
await b.close();
