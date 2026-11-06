const fs=require('fs');const D=require(process.env.DXF_CORE||require('path').resolve('dxf-core.js'));
const dec=D.decode(fs.readFileSync(process.argv[2]));
const d=D.parse(dec.text);
const T=d.texts;console.log('texts',T.length, 'inserts', (d.inserts||[]).length);
const key=process.argv[3]||'統計數量表';const h=T.filter(t=>t.s.indexOf(key)>=0||/^數量$/.test(t.s));
console.log(h.map(t=>[t.s,Math.round(t.x),Math.round(t.y),t.h]));
const t0=T.find(t=>t.s.indexOf(key)>=0);if(!t0){console.log('找不到標題',key);process.exit(1);}
const hh=t0.h||50;
const near=T.filter(t=>Math.abs(t.x-t0.x)<hh*45&&t.y<t0.y+hh&&t.y>t0.y-hh*14);
near.sort((a,b)=>b.y-a.y||a.x-b.x).slice(0,60).forEach(t=>console.log(Math.round(t.x-t0.x),Math.round(t.y-t0.y),t.h,JSON.stringify(t.s)));
