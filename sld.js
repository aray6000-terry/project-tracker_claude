/* 弱電專案平台 — 「圖面檔案」分頁的單線圖分析：判斷各盤體要整合的中央監控點，產生盤體監控點編表，並可套用到 IO 模組表 */
(function(){
"use strict";
var T=window.TR; if(!T||!window.SLD) return;
var esc=T.esc, api=T.api, toast=T.toast, fail=T.fail, fmtTime=T.fmtTime;
var $=function(id){ return document.getElementById(id); };
var st={pid:null, saved:null, draft:null, floors:{}};
var FLOOR_RE=/^(B|R)?\d+F$|^RF$/;

function csv(name, rows){
  var s="﻿"+rows.map(function(r){ return r.map(function(v){ v=v===null||v===undefined?"":String(v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }).join(","); }).join("\r\n");
  var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([s],{type:"text/csv;charset=utf-8"})); a.download=name; document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1000);
}
function canEdit(){ return T.canEdit(); }
/** 套上手動指定的樓層，重算彙總 */
function withFloors(res){
  var fo=res.floorOverride||{};
  var pts=res.points.map(function(p){ var q={}; for(var k in p) q[k]=p[k]; if(fo[p.panel]) q.floor=fo[p.panel]; return q; });
  var by={}, rank=window.DXF?DXF.floorRank:function(){return 0;};
  pts.forEach(function(p){ var f=p.floor||"未定位", b=by[f]=by[f]||{floor:f,di:0,do:0,comm:0,panels:{}}; b.di+=p.di; b.do+=p.do; b.comm+=p.comm; b.panels[p.panel]=1; });
  var byFloor=Object.keys(by).sort(function(a,b){ return rank(a.split("~")[0])-rank(b.split("~")[0]); }).map(function(k){ var b=by[k]; return {floor:b.floor,di:b.di,do:b.do,comm:b.comm,panels:Object.keys(b.panels)}; });
  return {points:pts, byFloor:byFloor};
}
/** IO 模組建議：先依 DO 配 10DI8DO，剩下 DI 配 18DI，預留 15% */
function modules(di,dob){
  var a=Math.ceil(dob*1.15/8), rest=Math.max(0,Math.ceil(di*1.15)-a*10), b=Math.ceil(rest/18);
  return (a?a+" 顆 10DI8DO":"")+(a&&b?"＋":"")+(b?b+" 顆 18DI":"")||"—";
}
/** 點位編號：樓層-盤名-迴路-DI/DO 序號 */
function codes(p){
  var out=[], base=(p.floor||"X").split("~")[0]+"-"+p.panel+"-C"+(p.no===""?"M":("0"+p.no).slice(-2));
  for(var i=1;i<=p.di;i++) out.push(base+"-DI"+i);
  for(var j=1;j<=p.do;j++) out.push(base+"-DO"+j);
  if(p.comm) out.push(base+"-COM");
  return out;
}
function render(cur,el){
  var res=st.draft||st.saved, edit=canEdit();
  var h='<section class="panel"><h3>單線圖（中央監控整合點）</h3><p class="meta">上傳含電氣單線圖的 DXF（可與平面圖同一檔，大檔可壓成 ZIP），系統會讀出各配電盤／箱的負載表，判斷要接中央監控的負載：'
    +'<b>泵浦、風機、發電機</b> → DI 運轉＋故障；<b>有電磁開關／定時器的燈光迴路</b> → DI 狀態＋DO 控制；<b>鐵捲門</b> → DI 門位；<b>消防受信總機、空調、電梯、電表</b> → 通訊整合。'
    +'盤體樓層由電力幹線／電氣配佈平面圖上的盤名判斷。檔案只在您的瀏覽器分析，不會上傳原始檔。</p>';
  if(edit) h+='<div class="uprow"><input type="file" id="sldFile" accept=".dxf,.zip"><button class="btn primary small" id="btnSld" type="button">分析單線圖</button></div><p class="hint" id="sldMsg"></p>';
  if(!res){ el.innerHTML=h+'<p class="meta">尚未分析單線圖。</p></section>'; bind(cur,el); return; }
  var v=withFloors(res);
  if(st.draft) h+='<div class="tipbox">這是剛分析的結果，尚未儲存。確認盤體樓層後按「儲存」。 <button class="btn small primary" id="btnSldSave" type="button">儲存</button> <button class="btn small" id="btnSldCancel" type="button">放棄</button></div>';
  else h+='<p class="meta">目前：<b>'+esc(res.fileName||"")+'</b>｜'+esc(T.userName(res.savedBy||""))+' '+fmtTime(res.savedAt)+'</p>';
  var tt=v.points.reduce(function(a,p){ a.di+=p.di; a.do+=p.do; a.comm+=p.comm; return a; },{di:0,do:0,comm:0});
  h+='<div class="kpis"><div class="kpi"><div class="n">'+res.sheets.length+'</div><div class="l">單線圖圖紙</div></div><div class="kpi"><div class="n">'+res.panels.filter(function(p){return !p.unit;}).length+'</div><div class="l">公設盤體</div></div>'
    +'<div class="kpi"><div class="n">'+v.points.length+'</div><div class="l">監控負載</div></div><div class="kpi"><div class="n">'+tt.di+'</div><div class="l">DI 點</div></div><div class="kpi"><div class="n">'+tt.do+'</div><div class="l">DO 點</div></div><div class="kpi"><div class="n">'+tt.comm+'</div><div class="l">通訊整合</div></div></div>';
  if(res.warnings&&res.warnings.length) h+='<div class="tipbox">'+res.warnings.map(esc).join("<br>")+'</div>';
  var mt=SLD.moduleTable(v.points);
  h+='<div class="tools" style="margin:8px 0"><button class="btn small" id="sldCsv" type="button">下載監控點編表（CSV）</button><button class="btn small" id="sldModCsv" type="button">下載模組編表（CSV）</button><button class="btn small" id="sldPrint" type="button">列印編表</button>'+(edit&&!st.draft?'<button class="btn small primary" id="sldApply" type="button">套用到 IO 模組表</button>':'')+'</div>';
  /* 樓層彙總 */
  h+='<h4 style="margin:10px 0 6px">各樓層監控箱彙總</h4><div class="tblwrap"><table><thead><tr><th>樓層</th><th>盤體</th><th>DI</th><th>DO</th><th>通訊</th><th>建議 IO 模組（預留 15%）</th></tr></thead><tbody>'
    +v.byFloor.map(function(b){ var m=mt.filter(function(x){ return x.floor===(b.floor||"未定位").split("~")[0]; })[0]; return '<tr><td'+(b.floor==="未定位"?' class="bad"':'')+'>'+esc(b.floor)+'</td><td>'+esc(b.panels.join("、"))+'</td><td>'+b.di+'</td><td>'+b.do+'</td><td>'+b.comm+'</td><td>'+esc(modules(b.di,b.do))+(m&&m.modules.length?'<br><span class="meta mono">'+esc(m.modules.map(function(x){ return x.id+" "+x.type; }).join("、"))+'</span>':'')+'</td></tr>'; }).join("")+'</tbody></table></div>';
  /* IO 模組編表（每層一個監控箱） */
  h+='<h4 style="margin:12px 0 6px">IO 模組編表</h4><p class="meta">每層一個監控箱；燈光等有 DO 的迴路整組放同一顆 10DI8DO，泵浦、風機的運轉／故障放同一顆模組；空出的通道為預留（預留 15%）。</p>'
    +mt.map(function(b){ return '<details'+(mt.length<=4?' open':'')+'><summary><b>'+esc(b.box)+'</b>｜DI '+b.di+'、DO '+b.do+(b.comm.length?'、通訊 '+b.comm.length:'')+'｜'+esc(b.modules.map(function(x){ return x.id+"（"+x.type+"）"; }).join("、")||"無 IO 模組")+'</summary>'
      +'<div class="tblwrap"><table><thead><tr><th>模組</th><th>型號</th><th>通道</th><th>位址</th><th>點位編號</th><th>盤名／迴路</th><th>負載</th><th>點位</th></tr></thead><tbody>'
      +b.rows.concat(b.comm).map(function(r){ var sp=r.load==="預留"; return '<tr'+(sp?' class="meta"':'')+'><td>'+esc(r.module)+'</td><td>'+esc(r.type)+'</td><td>'+esc(r.ch)+'</td><td class="mono">'+esc(r.tag)+'</td><td class="mono">'+esc(r.code)+'</td><td>'+esc(r.panel?r.panel+(r.no!==""?" #"+r.no:""):"")+'</td><td>'+esc(r.load)+'</td><td>'+esc(r.label)+'</td></tr>'; }).join("")
      +'</tbody></table></div></details>'; }).join("");
  /* 盤體樓層（可修改） */
  var withPts={}; v.points.forEach(function(p){ withPts[p.panel]=1; });
  var pl=res.panels.filter(function(p){ return withPts[p.name]; });
  h+='<h4 style="margin:12px 0 6px">盤體位置</h4><div class="tblwrap"><table><thead><tr><th>盤名</th><th>上游</th><th>圖紙</th><th>樓層（系統判斷）</th>'+(edit?'<th>指定樓層</th>':'')+'</tr></thead><tbody>'
    +pl.map(function(p){ var fo=(res.floorOverride||{})[p.name]||""; return '<tr><td><b>'+esc(p.name)+'</b></td><td>'+esc(p.from)+'</td><td>'+esc(p.sheet)+'</td><td'+(p.floor?'':' class="bad"')+'>'+esc(p.floor||"找不到")+'</td>'
      +(edit?'<td><input data-sfl="'+esc(p.name)+'" value="'+esc(fo)+'" maxlength="12" placeholder="例：B1F" style="width:80px"></td>':'')+'</tr>'; }).join("")+'</tbody></table></div>';
  /* 盤體監控點編表 */
  h+='<h4 style="margin:12px 0 6px">盤體監控點編表</h4><div class="tblwrap" style="max-height:520px;overflow:auto"><table><thead><tr><th>樓層</th><th>盤名</th><th>迴路</th><th>負載</th><th>類別</th><th>整合</th><th>DI</th><th>DO</th><th>通訊</th><th>點位</th><th>點位編號</th></tr></thead><tbody>'
    +v.points.map(function(p){ return '<tr><td>'+esc(p.floor||"—")+'</td><td>'+esc(p.panel)+'</td><td>'+esc(p.no)+'</td><td>'+esc(p.load)+(p.reserve?' <span class="meta">（預留）</span>':'')+'</td><td>'+esc(p.cat)+'</td><td>'+esc(p.method)+'</td><td>'+(p.di||"")+'</td><td>'+(p.do||"")+'</td><td>'+(p.comm||"")+'</td><td>'+esc(p.label)+'</td><td class="mono">'+esc(codes(p).join(" "))+'</td></tr>'; }).join("")
    +'</tbody></table></div>';
  if(res.unknown&&res.unknown.length) h+='<h4 style="margin:12px 0 6px">有馬達但無法判斷的負載（請確認是否需監控）</h4><ul class="list">'+res.unknown.map(function(u){ return '<li><div class="main"><b>'+esc(u.panel)+' 迴路 '+esc(u.no)+'</b><span class="meta">'+esc(u.load)+'</span></div></li>'; }).join("")+'</ul>';
  h+='<details style="margin-top:10px"><summary>全部盤體與迴路（'+res.panels.length+' 個盤）</summary>'+res.panels.map(function(p){
    return '<p class="meta" style="margin:8px 0 2px"><b>'+esc(p.name)+'</b>'+(p.from?'（上游 '+esc(p.from)+'）':'')+'｜'+esc(p.sheet)+(p.unit?'｜住戶／表箱，不計點':'')+'</p><div class="tblwrap"><table><tbody>'
      +p.circuits.map(function(c){ return '<tr><td>'+c.no+'</td><td>'+esc(c.name)+'</td><td>'+esc(c.desc)+'</td><td class="mono">'+esc(c.ctrl.join(" "))+'</td><td>'+(c.point?'✓ 監控':c.feeds?'→ 分盤 '+esc(c.feeds):esc(c.skip||""))+'</td></tr>'; }).join("")+'</tbody></table></div>'; }).join("")+'</details>';
  el.innerHTML=h+'</section>';
  bind(cur,el);
}
function modRows(res){
  var v=withFloors(res), mt=SLD.moduleTable(v.points), out=[["監控箱","模組","型號","通道","位址","點位編號","盤名","迴路","負載","點位"]];
  mt.forEach(function(b){ b.rows.concat(b.comm).forEach(function(r){ out.push([b.box,r.module,r.type,r.ch,r.tag,r.code,r.panel,r.no,r.load,r.label]); }); });
  return out;
}
function rows(res){
  var v=withFloors(res);
  return [["樓層","盤名","迴路","負載","類別","整合方式","DI","DO","通訊","點位說明","點位編號"]].concat(v.points.map(function(p){ return [p.floor,p.panel,p.no,p.load,p.cat,p.method,p.di,p.do,p.comm,p.label,codes(p).join(" ")]; }));
}
function bind(cur,el){
  var res=st.draft||st.saved;
  if($("btnSld")) $("btnSld").onclick=function(){
    var f=$("sldFile").files[0]; if(!f){ toast("請先選擇 DXF 檔"); return; }
    if(!/\.(dxf|zip)$/i.test(f.name)){ toast("請選擇 .dxf 或 .zip"); return; }
    var msg=$("sldMsg"), b=$("btnSld"); msg.textContent="讀取檔案…"; b.disabled=true;
    f.arrayBuffer().then(function(buf){
      var w=new Worker("dxf-worker.js");
      w.onmessage=function(ev){
        var m=ev.data;
        if(m.type==="progress"){ msg.textContent=m.text; return; }
        w.terminate(); b.disabled=false; msg.textContent="";
        if(m.type==="error"){ toast("分析失敗："+m.message); return; }
        var r=m.result; r.fileName=f.name; r.floorOverride={};
        if(!r.panels.length){ toast("讀不到單線圖負載表（需有 CKT NO. 與 TOTAL 欄）"); return; }
        st.draft=r; render(cur,el); toast("完成：讀到 "+r.panels.length+" 個盤、"+r.points.length+" 個監控負載");
      };
      w.onerror=function(e){ w.terminate(); b.disabled=false; msg.textContent=""; toast("分析失敗："+(e.message||"瀏覽器記憶體不足，請先壓成 ZIP 或只留單線圖")); };
      w.postMessage({buf:buf,name:f.name,mode:"sld"},[buf]);
    }).catch(fail);
  };
  if(!res) return;
  el.querySelectorAll("[data-sfl]").forEach(function(inp){ inp.onchange=function(){
    var v=inp.value.trim().toUpperCase(); if(v&&window.DXF){ var fs=DXF.floorsOf(v); if(fs.length&&fs.every(function(x){ return FLOOR_RE.test(x); })) v=fs.length>1?fs[0]+"~"+fs[fs.length-1]:fs[0]; }
    if(v&&!FLOOR_RE.test(v.split("~")[0])){ toast("樓層格式例：B1F、3F、R1F"); return; }
    res.floorOverride=res.floorOverride||{}; if(v) res.floorOverride[inp.dataset.sfl]=v; else delete res.floorOverride[inp.dataset.sfl];
    if(!st.draft){ st.draft=res; }
    setTimeout(function(){ render(cur,el); },0);
  }; });
  if($("btnSldSave")) $("btnSldSave").onclick=function(){
    var d=st.draft; api("analysisSave",{id:cur.id,kind:"sld",fileName:d.fileName,data:d}).then(function(){ st.saved=d; st.draft=null; toast("已儲存單線圖分析"); render(cur,el); }).catch(fail);
  };
  if($("btnSldCancel")) $("btnSldCancel").onclick=function(){ st.draft=null; render(cur,el); };
  if($("sldCsv")) $("sldCsv").onclick=function(){ csv(((cur.project&&cur.project.name)||"專案")+"_盤體監控點編表.csv",rows(res)); };
  if($("sldModCsv")) $("sldModCsv").onclick=function(){ csv(((cur.project&&cur.project.name)||"專案")+"_IO模組編表.csv",modRows(res)); };
  if($("sldPrint")) $("sldPrint").onclick=function(){
    var w=window.open("","_blank"); if(!w){ toast("請允許彈出視窗"); return; }
    var tbl=function(r){ return '<table><thead><tr>'+r[0].map(function(x){return '<th>'+esc(x)+'</th>';}).join("")+'</tr></thead><tbody>'+r.slice(1).map(function(x){ return '<tr>'+x.map(function(c){return '<td>'+esc(c)+'</td>';}).join("")+'</tr>'; }).join("")+'</tbody></table>'; };
    var nm=esc((cur.project&&cur.project.name)||"");
    w.document.write('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>盤體監控點與 IO 模組編表</title><style>body{font-family:"Microsoft JhengHei",sans-serif;padding:20px}table{border-collapse:collapse;width:100%;margin-bottom:18px}th,td{border:1px solid #999;padding:4px 6px;font-size:12px}th{background:#eee}h2{page-break-before:always}h2:first-of-type{page-break-before:auto}</style></head><body><h2>'+nm+'｜盤體監控點編表</h2>'+tbl(rows(res))+'<h2>'+nm+'｜IO 模組編表</h2>'+tbl(modRows(res))+'</body></html>');
    w.document.close(); setTimeout(function(){ w.print(); },300);
  };
  if($("sldApply")) $("sldApply").onclick=function(){
    var v=withFloors(res), ex=SLD.toExtraIo({points:v.points});
    if(!ex.length){ toast("沒有可套用的 IO 點（需有樓層）"); return; }
    if(!confirm("把單線圖的 "+ex.length+" 組 IO 點加到「設計・編表 → IO 模組表」的額外點位？（之前由單線圖加入的會先清除）")) return;
    api("analysisOne",{id:cur.id,kind:"design"}).then(function(r){
      var p=r.data||{}; p.extraIo=(p.extraIo||[]).filter(function(x){ return !/^單線圖：/.test(x.name||""); }).concat(ex);
      return api("analysisSave",{id:cur.id,kind:"design",data:p});
    }).then(function(){ toast("已套用到 IO 模組表（共 "+ex.length+" 組）"); }).catch(fail);
  };
}
T.views.sldPanel=function(cur,el){
  if(st.pid!==cur.id){ st={pid:cur.id,saved:null,draft:null}; }
  el.innerHTML='<section class="panel"><h3>單線圖（中央監控整合點）</h3><div class="loading">讀取中…</div></section>';
  api("analysisOne",{id:cur.id,kind:"sld"}).then(function(r){ st.saved=r.data; render(cur,el); })
    .catch(function(){ st.saved=null; render(cur,el); });
};
})();
