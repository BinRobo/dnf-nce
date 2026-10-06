// 用法：node content-src/story/validate.mjs
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const lessonDir=path.resolve(dir,'../../public/content/book1/lessons');
const WHO=['hero','sophie','blake','woman','hans','naoko','changwoo','luming','xiaohui','duke','boss_pardon','boss_whomist'];
// 新增说话人：voices.json 里所有角色（含第 2–6 章 NPC 与 Boss）
try{const v=JSON.parse(fs.readFileSync(path.resolve(dir,'../npc/voices.json'),'utf8'));for(const k of Object.keys(v))if(!k.startsWith('_')&&!WHO.includes(k))WHO.push(k)}catch{}
const FACE=['normal','happy','sad','surprised'];
const T=['narr','say','enter','exit','fx','sfx','item','quest'];
const FX=['fog','fog_clear','shake','flash'];
const CAP={prologue:90,L001_intro:15,L001_boss:3,L001_clear:10,L005_intro:15,L005_boss:3,L005_clear:10};
Object.assign(CAP,{quest_L001_give:15,quest_L001_done:20,quest_L005_done:20,room_L001:12,room_L005:12,boss_L001_p2:6,boss_L001_p3:4,boss_L005_p2:6,boss_L005_p3:4,L005_duke:20,tut_start:10,tut_wrong:6,tut_spell:6,tut_awaken:6,tut_exit:6,shop_woman:10});
const MAXSTEPS={prologue:20+6,L001_intro:5,L001_boss:2,L001_clear:3+1,L005_intro:5,L005_boss:2,L005_clear:3+1};
// 时长估算：say/narr/item 每步 3 秒（带原声的 say 取 end-start）；enter/exit/fx 每步 1 秒；sfx 0 秒
const errs=[];const err=(f,i,m)=>errs.push(`${f} step ${i}: ${m}`);
const lessons={};
const lesson=id=>lessons[id]??=JSON.parse(fs.readFileSync(path.join(lessonDir,id+'.json'),'utf8')).dialogue;
const rows=[];
for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.json')).sort()){
  let j;try{j=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'))}catch(e){errs.push(f+': invalid JSON '+e.message);continue}
  const id=f.replace('.json','');
  if(j.id!==id)errs.push(`${f}: id mismatch`);
  if(!j.bg)errs.push(`${f}: missing bg`);
  let dur=0;
  (j.steps||[]).forEach((s,i)=>{
    if(!T.includes(s.t)){err(f,i,'bad t '+s.t);return}
    if(s.t==='say'){
      if(!WHO.includes(s.who))err(f,i,'bad who '+s.who);
      if(s.face&&!FACE.includes(s.face))err(f,i,'bad face '+s.face);
      if(!s.zh&&!s.en)err(f,i,'say needs zh or en');
      if(s.zh&&[...s.zh].length>25)err(f,i,'zh >25 chars');
      let d=3;
      if(s.en){
        if(!s.audio)err(f,i,'en without audio');
        else{
          let dl;try{dl=lesson(s.audio.lesson)}catch{err(f,i,'bad lesson '+s.audio.lesson);return}
          const l=dl[s.audio.line];
          if(!l)err(f,i,'bad line '+s.audio.line);
          else{
            if(l.en!==s.en)err(f,i,`en mismatch: "${s.en}" vs "${l.en}"`);
            if(l.audio)d=l.audio.end-l.audio.start;
          }
        }
      }
      dur+=d;
    }else if(s.t==='narr'){if(!s.zh||[...s.zh].length>25)err(f,i,'narr zh missing/>25');dur+=3}
    else if(s.t==='quest'){if(!s.zh||[...s.zh].length>25)err(f,i,'quest zh missing/>25');dur+=1}
    else if(s.t==='item'){if(!s.key||!s.zh)err(f,i,'item needs key,zh');dur+=3}
    else if(s.t==='enter'||s.t==='exit'){
      if(!WHO.includes(s.who))err(f,i,'bad who '+s.who);
      if(s.t==='enter'&&!['left','right'].includes(s.side))err(f,i,'bad side');
      dur+=1;
    }else if(s.t==='fx'){if(!FX.includes(s.key))err(f,i,'bad fx '+s.key);dur+=1}
    else if(s.t==='sfx'){if(!s.key)err(f,i,'sfx needs key')}
  });
  const cap=CAP[id];
  if(cap&&dur>cap)errs.push(`${f}: duration ${dur.toFixed(1)}s > ${cap}s`);
  const ms=MAXSTEPS[id];
  if(ms&&j.steps.length>ms)errs.push(`${f}: ${j.steps.length} steps > ${ms}`);
  rows.push({id,steps:j.steps.length,dur:+dur.toFixed(1),cap:cap??'-'});
}
console.table(rows);
if(errs.length){console.error(errs.join('\n'));process.exit(1)}
console.log('OK');
