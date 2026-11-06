const fs=require('fs');const D=require(process.env.DXF_CORE||require('path').resolve('dxf-core.js'));
const f=process.argv[2];const buf=fs.readFileSync(f);
const dec=D.decode(buf);
const t0=Date.now();
const r=D.analyze(dec.text,{});
console.log('ms',Date.now()-t0,'keys',Object.keys(r));
console.log((r.warnings||[]).join('\n'));
console.log('tables',(r.tables||[]).length);
fs.writeFileSync('r.json',JSON.stringify(r,null,1).slice(0,2e6));
