/* 弱電專案平台 — 「數量・報價」分頁：DXF 圖面設備數量、估價單成本審查、圖面與估價單數量比對 */
(function(){
"use strict";
var T=window.TR; if(!T) return;
var esc=T.esc, api=T.api, toast=T.toast, fail=T.fail, fmtTime=T.fmtTime;
var $=function(id){ return document.getElementById(id); };
var st={pid:null, data:null, draft:null, qdraft:null, mapping:{}, view:"sys", models:{}, db:null};
function caps(){ return (T.session.me&&T.session.me.caps)||{}; }
function money(n){ return n===null||n===undefined||isNaN(n)?"—":"$"+Math.round(n).toLocaleString(); }
function pct(x){ return x===null||x===undefined||isNaN(x)?"—":(Math.round(x*1000)/10)+"%"; }
function sysName(k){ return T.sysName({},k); }
var STATUS={ok:["相符","st-shipped"],short:["估價單較少","st-overdue"],over:["估價單較多","st-billed"],missing:["估價單找不到","st-rejected"]};
var LEVEL={bad:["嚴重","st-overdue"],warn:["注意","st-billed"],info:["提醒","st-submitted"]};

/* ---------- 下載 CSV（Excel 可直接開啟） ---------- */
function downloadCsv(name, rows){
  var csv="﻿"+rows.map(function(r){ return r.map(function(v){ v=v===null||v===undefined?"":String(v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }).join(","); }).join("\r\n");
  var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); a.download=name;
  document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1000);
}

/* ---------- 分頁進入點 ---------- */
T.views.qtyTab=function(cur,el){
  if(st.pid!==cur.id){ st={pid:cur.id,data:null,draft:null,qdraft:null,mapping:{},view:"sys",models:{},db:null}; }
  el.innerHTML='<div class="loading">讀取中…</div>';
  api("analysisGet",{id:cur.id}).then(function(d){ st.data=d; st.mapping=d.mapping||{}; st.models=d.models||{}; render(cur,el); })
    .catch(function(e){ el.innerHTML='<div class="empty">'+esc(e.message)+'</div>'; });
};

function render(cur,el){
  var d=st.data, edit=T.canEdit(), c=caps();
  var dr=st.draft||d.drawing, q=st.qdraft||d.quote;
  var h='';
  /* A. 圖面數量 */
  h+='<section class="panel"><div class="row" style="flex-wrap:wrap"><h3>圖面設備數量（DXF 自動計算）</h3>'+(dr?'<div class="tools"><div class="seg"><button type="button" data-qv="sys" class="'+(st.view==="sys"?"on":"")+'">依系統</button><button type="button" data-qv="item" class="'+(st.view==="item"?"on":"")+'">設備明細</button></div><button class="btn small" id="btnCsv" type="button">下載 Excel（CSV）</button></div>':'')+'</div>';
  h+='<p class="meta">圖面在您的電腦（瀏覽器）裡分析，不會上傳原始檔。系統會讀取每張平面圖的「監控設備數量表」，並逐一核對圖面上的設備符號數量；樓層範圍（例如 6F~13F）會自動展開。<br>AutoCAD「另存新檔」選 <b>DXF</b>；檔案太大可先壓縮成 <b>.zip</b>。</p>';
  if(edit) h+='<div class="uprow"><input type="file" id="dxfFile" accept=".dxf,.zip"><button class="btn primary small" id="btnDxf" type="button">分析圖面</button><span class="hint" id="dxfMsg"></span></div>';
  if(st.draft) h+='<div class="tipbox"><b>這是剛分析的結果，尚未儲存。</b> 確認無誤後按「儲存分析結果」。 <button class="btn primary small" id="btnDxfSave" type="button">儲存分析結果</button> <button class="btn small" id="btnDxfCancel" type="button">放棄</button></div>';
  else if(dr) h+='<p class="meta">目前結果：'+esc(dr.fileName||"")+'｜'+esc(T.userName(dr.savedBy||""))+' '+fmtTime(dr.savedAt)+'</p>';
  if(dr) h+=drawingHtml(dr); else h+='<p class="meta">尚未分析圖面。</p>';
  h+='</section>';
  if(c.quote && T.quoteGen) h+=T.quoteGen.html(cur,dr);
  /* B. 估價單 */
  h+='<section class="panel"><h3>估價單比對'+(c.quote?'與成本審查':'')+'</h3>';
  if(c.quote){
    h+='<p class="meta">上傳公司格式的估價單（.xlsx），系統會計算各系統售價、成本、毛利與線材／工資，並檢查毛利過低、缺成本、低於標準範本的項目。成本以業務價計算。'
      +(d.standard?'<br>標準範本：'+esc(d.standard.fileName||"")+'（'+esc(d.standard.project||"")+'，'+fmtTime(d.standard.savedAt)+'）':'<br><span style="color:var(--warn)">尚未設定公司標準估價範本，</span>由業務主管上傳一份估價單後按「設為標準範本」。')+'</p>';
    if(edit) h+='<div class="uprow"><input type="file" id="xlsFile" accept=".xlsx"><button class="btn primary small" id="btnXls" type="button">分析估價單</button></div>';
    if(st.qdraft) h+='<div class="tipbox"><b>這是剛分析的估價單，尚未儲存。</b> <button class="btn primary small" id="btnXlsSave" type="button">儲存</button> <button class="btn small" id="btnXlsCancel" type="button">放棄</button>'
      +(["admin","ceo","sales_mgr"].indexOf(T.session.me.role)>=0?' <button class="btn small" id="btnStd" type="button">設為公司標準範本</button>':'')+'</div>';
    else if(q) h+='<p class="meta">目前估價單：'+esc(q.fileName||"")+'｜'+esc(T.userName(q.savedBy||""))+' '+fmtTime(q.savedAt)+(["admin","ceo","sales_mgr"].indexOf(T.session.me.role)>=0?' <button class="btn small" id="btnStd" type="button">設為公司標準範本</button>':'')+'</p>';
    if(q&&!q.redacted) h+=quoteHtml(q);
  } else {
    h+='<p class="meta">估價單由業務上傳；這裡只顯示圖面與估價單的「數量」比對，不顯示金額。</p>';
  }
  if(q&&dr) h+=compareHtml(dr,q,edit);
  else if(!q) h+='<p class="meta">尚未上傳估價單。</p>';
  h+='</section>';
  if(q) h+=modelsHtml(q,edit);
  el.innerHTML=h;
  bind(cur,el);
  bindModels(cur,el);
  if(c.quote && T.quoteGen) T.quoteGen.bind(cur,el,function(){ render(cur,el); },dr,function(){ T.views.qtyTab(cur,el); });
}

/* ---------- 圖面結果 ---------- */
function drawingHtml(dr){
  var floors=dr.floors||[], items=dr.items||[], h='';
  if(dr.warnings&&dr.warnings.length) h+='<div class="tipbox">'+dr.warnings.map(esc).join("<br>")+'</div>';
  if(dr.embedded&&dr.embedded.length) h+='<div class="tipbox">圖面內含 '+dr.embedded.length+' 份嵌入的 Excel 表'+(dr.embedded.some(function(e){ return e.sheets.some(function(x){ return x.rows.slice(0,10).some(function(r){ return (r||[]).some(function(v){ return /點數表/.test(String(v||"")); }); }); }); })?'（含「I/O 管理點數表」）':'')+'，已自動讀入，請到「設計・編表 → IO 模組表」查看。</div>';
  if(st.view==="sys"){
    var bySys={}; items.forEach(function(it){ var s=bySys[it.sys]=bySys[it.sys]||{n:0,f:{},c:0}; s.n+=it.total; s.c++; floors.forEach(function(f){ s.f[f]=(s.f[f]||0)+(it.floors[f]||0); }); });
    h+='<div class="tblwrap"><table class="qty"><thead><tr><th>系統</th><th>品項數</th>'+floors.map(function(f){return '<th>'+esc(f)+'</th>';}).join("")+'<th>合計</th></tr></thead><tbody>'
      +Object.keys(bySys).map(function(k){ var s=bySys[k]; return '<tr><td>'+esc(sysName(k))+'</td><td>'+s.c+'</td>'+floors.map(function(f){ return '<td>'+(s.f[f]||"")+'</td>'; }).join("")+'<td><b>'+s.n+'</b></td></tr>'; }).join("")+'</tbody></table></div>';
  } else {
    var last="";
    h+='<div class="tblwrap"><table class="qty"><thead><tr><th>系統</th><th>設備</th>'+floors.map(function(f){return '<th>'+esc(f)+'</th>';}).join("")+'<th>合計</th></tr></thead><tbody>'
      +items.map(function(it){ var sh=it.sys!==last; last=it.sys; return '<tr'+(sh?' class="grp"':'')+'><td>'+(sh?esc(sysName(it.sys)):"")+'</td><td>'+esc(it.name)+'</td>'+floors.map(function(f){ return '<td>'+(it.floors[f]||"")+'</td>'; }).join("")+'<td><b>'+it.total+'</b></td></tr>'; }).join("")+'</tbody></table></div>';
  }
  if(dr.checks&&dr.checks.length){
    h+='<details class="mxwrap"><summary>圖面符號與數量表不一致：'+dr.checks.length+' 處（請設計或工務確認）</summary><div class="tblwrap"><table><thead><tr><th>數量表</th><th>設備</th><th>數量表寫</th><th>圖面符號數</th></tr></thead><tbody>'
      +dr.checks.map(function(x){ return '<tr><td>'+esc(x.table)+'</td><td>'+esc(x.names.join("／"))+'</td><td>'+x.table_qty+'</td><td>'+x.symbols+'</td></tr>'; }).join("")+'</tbody></table></div><p class="hint">符號數只計算該層平面圖範圍內的圖塊；同一種圖塊若用於多個項目（例如公共／住戶磁簧）會合併比較。</p></details>';
  } else h+='<p class="meta" style="color:var(--ok)">✓ 各層圖面符號數量與數量表一致。</p>';
  return h;
}

/* ---------- 估價單結果 ---------- */
function quoteHtml(q){
  var issues=QUOTE.review(q,{standard:st.data.standard?st.std:null});
  var h='<div class="kpis">'
    +kpi(money(q.total.price),"未稅總價")+kpi(money(q.total.cost),"成本（業務價）")+kpi(pct(q.total.margin),"整案毛利",q.total.margin<0.4?"warn":"")
    +(q.households?kpi(money(q.total.perHousehold),"每戶價格（"+q.households+" 戶）"):"")+'</div>';
  h+='<div class="tblwrap"><table><thead><tr><th>#</th><th>系統</th><th>售價</th><th>成本</th><th>毛利</th><th>線材</th><th>拉線工資</th><th>安裝工資</th></tr></thead><tbody>'
    +q.sections.map(function(s){ return '<tr><td>'+esc(s.no)+'</td><td>'+esc(s.name)+'</td><td>'+money(s.price)+'</td><td>'+money(s.cost)+'</td><td'+(s.margin<0.35?' style="color:var(--bad);font-weight:700"':'')+'>'+pct(s.margin)+'</td><td>'+money(s.wire)+'</td><td>'+money(s.pullLabor)+'</td><td>'+money(s.installLabor)+'</td></tr>'; }).join("")
    +'</tbody></table></div>';
  h+='<h4 style="margin:14px 0 6px">成本審查（'+issues.length+' 項）</h4>'+(issues.length?'<ul class="list">'+issues.map(function(i){
    return '<li><div class="main"><b>'+esc(i.where)+'</b><span class="meta">'+esc(i.msg)+(i.row?'（Excel 第 '+i.row+' 列）':'')+'</span></div><span class="status '+LEVEL[i.level][1]+'">'+LEVEL[i.level][0]+'</span></li>'; }).join("")+'</ul>':'<p class="meta" style="color:var(--ok)">✓ 沒有發現問題。</p>');
  return h;
}
function kpi(n,l,cls){ return '<div class="kpi '+(cls||"")+'"><div class="n">'+esc(n)+'</div><div class="l">'+esc(l)+'</div></div>'; }

/* ---------- 圖面 vs 估價單 ---------- */
function compareHtml(dr,q,edit){
  var rows=QUOTE.compareDrawing(dr.items||[],q,st.mapping);
  var opts=[]; q.sections.forEach(function(s){ s.items.forEach(function(it){ if(it.kind==="device") opts.push([s.no+"-"+it.no, s.no+" "+it.name+"（"+it.qty+"）"]); }); });
  var bad=rows.filter(function(r){ return r.status!=="ok"; }).length;
  var h='<h4 style="margin:14px 0 6px">圖面數量 vs 估價單數量'+(bad?'：<span style="color:var(--bad)">'+bad+' 項需確認</span>':'')+'</h4>'
    +'<p class="hint">系統依名稱自動配對；配錯時可直接改選對應的估價項目，按「儲存對照」後下次會記住。</p>'
    +'<div class="filters"><div class="seg"><button type="button" data-cf="bad" class="'+(st.cf!=="all"?"on":"")+'">只看需確認</button><button type="button" data-cf="all" class="'+(st.cf==="all"?"on":"")+'">全部</button></div>'
    +(edit?'<button class="btn small primary" id="btnMapSave" type="button">儲存對照</button>':'')+'</div>';
  var shown=st.cf==="all"?rows:rows.filter(function(r){ return r.status!=="ok"; });
  h+='<div class="tblwrap"><table><thead><tr><th>圖面設備</th><th>系統</th><th>圖面數量</th><th>對應估價項目</th><th>估價數量</th><th>結果</th></tr></thead><tbody>'
    +shown.map(function(r){
      var sel=edit?'<select data-map="'+esc(r.name)+'"><option value="">（無對應）</option>'+opts.map(function(o){ return '<option value="'+esc(o[0])+'"'+(r.quote&&r.quote.key===o[0]?" selected":"")+'>'+esc(o[1])+'</option>'; }).join("")+'</select>'
        :esc(r.quote?r.quote.name:"—");
      return '<tr><td>'+esc(r.name)+'</td><td>'+esc(sysName(r.sys))+'</td><td>'+r.drawing+'</td><td>'+sel+'</td><td>'+(r.quote?r.quote.qty+(r.shared?'<span class="hint">（與其他圖面項目合計比較）</span>':''):"—")+'</td><td><span class="status '+STATUS[r.status][1]+'">'+STATUS[r.status][0]+'</span></td></tr>'; }).join("")
    +'</tbody></table></div>';
  return h;
}

/* ---------- 設備型號對應與送審型錄 ---------- */
var MST={chosen:["已確認","st-shipped"],auto:["自動配對","st-confirmed"],suggest:["請選擇","st-billed"],none:["資料庫沒有","st-rejected"],skip:["不送審","st-cancelled"]};
var SEED=(window.CATALOG_SEED&&window.CATALOG_SEED.items)||[];
var CAT_MAX=20*1024*1024;
function canEditDb(){ return ["admin","ceo","sales_mgr","purchase","eng_mgr"].indexOf(T.session.me.role)>=0; }
function driveId(link){ var m=/drive\.google\.com\/(?:file\/d\/|open\?id=)([A-Za-z0-9_-]{20,})/.exec(link||""); return m?m[1]:""; }
function driveUrl(id){ return "https://drive.google.com/file/d/"+id+"/view"; }
function normTok(s){ return String(s||"").toUpperCase().replace(/[\s\-_]/g,""); }
/* 型號關鍵字比對：英數字要前後分界（NB-12 不會配到 NB-1202PW），中文直接包含 */
function keyHit(model,k){
  var M=String(model||"").toUpperCase(), K=String(k||"").toUpperCase();
  if(/[^\x00-\x7f]/.test(K)){ K=K.replace(/\s+/g,""); return K.length>=2&&M.replace(/\s+/g,"").indexOf(K)>=0; }
  if(K.length<3) return false;
  var pat=K.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/-/g,"-?");
  return new RegExp("(^|[^A-Z0-9])"+pat+"(?![0-9])").test(M);
}
/* 依型號找型錄庫：可同時配到多個（例：NB-S8000＋VK4690G）；較短的型號若是較長型號的前段則略過（NB-150T vs NB-150TM） */
function seedByModel(model){
  var hits=[];
  SEED.forEach(function(s){ var ks=s.keys.concat([s.model]).filter(function(k){ return keyHit(model,k); }).map(normTok); if(ks.length) hits.push({s:s,k:ks}); });
  return hits.filter(function(h){ return !hits.some(function(o){ return o!==h&&h.k.every(function(k){ return o.k.some(function(ok){ return ok!==k&&ok.indexOf(k)===0; }); }); }); }).map(function(h){ return h.s; });
}
function seedByName(r){
  return SEED.map(function(s,i){ var sc=QUOTE.similarity(r.name,s.name); if(seedByModel(r.brandSpec||"").indexOf(s)>=0) sc+=0.5; return {i:i,s:s,sc:sc}; })
    .filter(function(x){ return x.sc>=0.5; }).sort(function(a,b){ return b.sc-a.sc; }).slice(0,4);
}
/* 這一項要附的型錄：手動指定 → 資料庫連結 → 型錄庫（內建）→ 平台上傳 */
function catOf(p){
  if(!p||p.model==="-") return {files:[],src:""};
  if(p.files&&p.files.length) return {files:p.files,src:"指定"};
  var id=driveId(p.link); if(id) return {files:[{id:id,title:"設備資料庫型錄連結"}],src:"資料庫"};
  var ss=seedByModel(p.model), fs=[];
  ss.forEach(function(s){ s.files.forEach(function(f){ if(!fs.some(function(x){ return x.id===f.id; })) fs.push(f); }); });
  if(fs.length) return {files:fs,src:"型錄庫"};
  var lib=(st.catlib||[]).filter(function(f){ return f.model&&normTok(f.model)===normTok(p.model); });
  if(lib.length) return {files:[{id:lib[0].id,title:lib[0].title}],src:"上傳"};
  return {files:[],src:"",ext:/^https:\/\//.test(p.link||"")?p.link:""};
}
function shortT(t){ t=String(t||"").replace(/\.(pdf|jpe?g|png)$/i,""); return t.length>26?t.slice(0,25)+"…":t; }
/* 設備資料庫配對後，資料庫沒有的項目改用型錄庫預設（名稱高度相符、廠牌不衝突時） */
function brandOk(r,s){
  var have=String((r.brand||"")+" "+(r.brandSpec||"")).toUpperCase(); if(!have.trim()||!s.brand) return true;
  return s.brand.toUpperCase().split(/\s+/).some(function(t){ return t.length>=2&&have.indexOf(t)>=0; });
}
/* 名稱防呆：數字規格不可衝突（8埠≠24埠）、品名結尾的主體（防水盒、讀卡機…）須出現在型錄名稱 */
function nameOk(n,sn){
  var core=String(n||"").replace(/[（(][^）)]*[）)]/g,"").replace(/[\s"'”]/g,"");
  var nums=function(s){ return (String(s).match(/\d+/g)||[]).filter(function(x){ return x.length<4; }); };
  var a=nums(core), b=nums(sn);
  if(a.length&&b.length&&!a.some(function(x){ return b.indexOf(x)>=0; })) return false;
  var tail=core.slice(-3); return !tail||String(sn).replace(/\s/g,"").indexOf(tail)>=0;
}
function matchRows(q){
  var rows=QUOTE.matchModels(q,st.db,st.models);
  rows.forEach(function(r){
    if(r.status!=="none") return;
    var sn=seedByName(r).filter(function(x){ return brandOk(r,x.s)&&nameOk(r.name,x.s.name); });
    if(sn.length&&sn[0].sc>=0.75&&(!sn[1]||sn[1].sc<=sn[0].sc-0.1)){ var s=sn[0].s; r.pick={name:s.name,brand:s.brand,model:s.model,link:"",files:s.files.slice(),src:"seed"}; r.status="auto"; }
  });
  return rows;
}
function modelsHtml(q,edit){
  var h='<section class="panel" id="mdlPanel"><div class="row" style="flex-wrap:wrap"><h3>設備型號對應與送審型錄</h3>'+(st.db?'<div class="tools">'+(edit?'<button class="btn small" id="btnMdlSave" type="button">儲存型號</button><button class="btn small" id="btnSubmittal" type="button">產生送審資料</button>':'')+'<button class="btn small primary" id="btnSubPdf" type="button">輸出送審型錄 PDF</button><button class="btn small" id="btnSubPrint" type="button">列印送審清單</button></div>':'')+'</div>'
    +'<p class="meta">依估價項目的廠牌，從「設備單價資料庫」與「型錄庫」找出對應型號與原廠型錄。每一項都可以從選單改選其他型號，或選「手動輸入型號…」；型錄可按「更換」改選或上傳（PDF／JPG／PNG），上傳的型錄會存進公司型錄庫，下次其他專案也能選用。確認後按「輸出送審型錄 PDF」，依估價單項次排成「封面 → 送審目錄 → 送審資料表＋原廠型錄」一份 PDF。</p>';
  if(!st.db) return h+'<button class="btn small" id="btnLoadDb" type="button">載入設備資料庫並配對</button></section>';
  if(st.catlibErr) h+='<div class="tipbox"><b>型錄庫無法讀取</b>'+esc(st.catlibErr)+'</div>';
  var rows=matchRows(q), f=st.mf||"todo";
  var cnt={}, nocat=0; rows.forEach(function(r){ cnt[r.status]=(cnt[r.status]||0)+1; if(r.pick&&r.pick.model!=="-"&&!catOf(r.pick).files.length) nocat++; });
  h+='<div class="filters"><div class="seg">'+[["todo","需處理（"+((cnt.suggest||0)+(cnt.none||0))+"）"],["nocat","缺型錄（"+nocat+"）"],["all","全部（"+rows.length+"）"]].map(function(x){ return '<button type="button" data-mf="'+x[0]+'" class="'+(f===x[0]?"on":"")+'">'+x[1]+'</button>'; }).join("")+'</div>'
    +'<span class="meta">'+Object.keys(MST).filter(function(k){return cnt[k];}).map(function(k){ return MST[k][0]+" "+cnt[k]; }).join("｜")+'</span></div>';
  var shown=f==="all"?rows:f==="nocat"?rows.filter(function(r){ return r.pick&&r.pick.model!=="-"&&!catOf(r.pick).files.length; }):rows.filter(function(r){ return r.status==="suggest"||r.status==="none"; });
  var showPrice=caps().quote;
  h+='<div class="tblwrap"><table><thead><tr><th>估價項目</th><th>數量</th><th>估價廠牌</th><th>送審型號</th>'+(showPrice?'<th>資料庫業務價</th>':'')+'<th>原廠型錄</th><th>狀態</th></tr></thead><tbody>'
    +shown.map(function(r){
      var sel, p=r.pick&&r.pick.model!=="-"?r.pick:null;
      if(edit){
        var opts=r.candidates.map(function(c,i){ var d=c.d; return '<option value="c'+i+'"'+(r.pick&&!r.pick.src&&r.pick.model===d.model&&r.pick.name===d.name?" selected":"")+'>'+esc((d.brand+" "+d.model+"｜"+d.name).slice(0,70))+'</option>'; }).join("");
        var sn=seedByName(r), sopts=sn.map(function(x){ return '<option value="s'+x.i+'"'+(r.pick&&r.pick.src==="seed"&&r.pick.model===x.s.model?" selected":"")+'>'+esc((x.s.brand+" "+x.s.model+"｜"+x.s.name).slice(0,70))+'</option>'; }).join("");
        var inC=r.pick&&!r.pick.src&&r.candidates.some(function(c){ return c.d.model===r.pick.model&&c.d.name===r.pick.name; });
        var inS=r.pick&&r.pick.src==="seed"&&sn.some(function(x){ return x.s.model===r.pick.model; });
        var pickIn=p&&!inC&&!inS;
        sel='<select data-mk="'+esc(r.key)+'" style="max-width:300px"><option value="">（未選）</option>'+(pickIn?'<option value="keep" selected>'+esc((p.brand+" "+p.model).trim()+(p.manual?"（手動）":""))+'</option>':'')
          +(opts?'<optgroup label="設備資料庫">'+opts+'</optgroup>':'')+(sopts?'<optgroup label="型錄庫">'+sopts+'</optgroup>':'')
          +'<optgroup label="其他"><option value="manual">手動輸入型號…</option><option value="search">搜尋資料庫／型錄庫…</option><option value="skip"'+(r.status==="skip"?" selected":"")+'>不送審／不適用</option>'+(canEditDb()?'<option value="add">新增到設備資料庫…</option>':'')+'</optgroup></select>';
      } else sel=esc(p?p.brand+" "+p.model:"—");
      var warn="";
      if(showPrice&&p&&p.price&&r.cost&&r.cost<p.price*0.97) warn='<br><span class="hint" style="color:var(--bad)">估價成本 '+money(r.cost)+' 低於業務價</span>';
      var c=catOf(p), cat="—";
      if(p){
        cat=c.files.length?c.files.map(function(x){ return '<div>📄 '+esc(shortT(x.title))+'</div>'; }).join("")+'<span class="hint">'+esc(c.src)+'</span>'
          :(c.ext?'<a href="'+esc(c.ext)+'" target="_blank" rel="noopener noreferrer">原廠連結</a><br><span class="hint" style="color:var(--warn)">非雲端檔，無法自動併入</span>':'<span class="hint" style="color:var(--warn)">待附</span>');
      }
      if(edit&&r.status!=="skip") cat+='<div><button class="btn small" type="button" data-mcat="'+esc(r.key)+'">'+(c.files.length?"更換":"上傳／選擇")+'</button></div>';
      return '<tr><td>'+esc(r.name)+'<br><span class="hint">'+esc(r.key+" "+r.section)+'</span></td><td>'+r.qty+' '+esc(r.unit)+'</td><td>'+esc(r.brand||r.brandSpec||"")+'</td><td>'+sel+'</td>'
        +(showPrice?'<td>'+(p&&p.price?money(p.price):"—")+warn+'</td>':'')+'<td style="min-width:150px">'+cat+'</td><td><span class="status '+MST[r.status][1]+'">'+MST[r.status][0]+'</span></td></tr>'; }).join("")
    +'</tbody></table></div><div id="mdlExtra"></div><div class="hint" id="subPdfMsg" aria-live="polite"></div>';
  if(st.subResult) h+='<div class="tipbox"><b>送審資料已建立</b>：型錄複製 '+st.subResult.copied+' 份、需手動下載 '+st.subResult.link+' 份、無型錄 '+st.subResult.none+' 份'+(st.subResult.failed?'、無法複製 '+st.subResult.failed+' 份（連結權限不足）':'')+'。檔案在「圖面檔案」分頁下方的「送審資料」。</div>';
  if(st.pdfResult) h+='<div class="tipbox"><b>送審型錄 PDF 已下載</b>'+esc(st.pdfResult)+'</div>';
  return h+'</section>';
}
function readB64(file){ return new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){ res(String(r.result).split(",")[1]||""); }; r.onerror=function(){ rej(new Error("無法讀取檔案")); }; r.readAsDataURL(file); }); }
function b64ToBytes(s){ var b=atob(s||""), u=new Uint8Array(b.length); for(var i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return u; }
function bindModels(cur,el){
  var q=st.qdraft||(st.data&&st.data.quote);
  if($("btnLoadDb")) $("btnLoadDb").onclick=function(){
    this.disabled=true;
    var libP=api("catalogList",{id:cur.id}).then(function(r){ st.catlib=r.files||[]; st.catlibErr=""; })
      .catch(function(e){ st.catlib=[]; st.catlibErr=/不支援/.test(e.message||"")?"後端尚未更新到 v2.8.0，暫時只能使用內建型錄庫與設備資料庫連結。":(e.message||""); });
    Promise.all([api("devices",{all:true}),libP]).then(function(a){ st.db=a[0].devices; st.sheets=a[0].sheets; render(cur,el); }).catch(fail);
  };
  el.querySelectorAll("[data-mf]").forEach(function(b){ b.onclick=function(){ st.mf=b.dataset.mf; render(cur,el); }; });
  if(!q||!st.db) return;
  var rows=matchRows(q), byKey={}; rows.forEach(function(r){ byKey[r.key]=r; });
  function pickOf(d){ return {sheet:d.sheet,name:d.name,brand:d.brand,model:d.model,link:d.link,price:d.price}; }
  function seedPick(s){ return {name:s.name,brand:s.brand,model:s.model,link:"",files:s.files.slice(),src:"seed"}; }
  /* 目前選定（含自動配對）的型號，轉成可修改的紀錄 */
  function ensurePick(r){ if(!st.models[r.key]&&r.pick&&r.pick.model!=="-") st.models[r.key]=Object.assign({},r.pick.src?r.pick:pickOf(r.pick)); return st.models[r.key]||null; }
  var box=function(){ return $("mdlExtra"); };
  function manualPanel(r){
    var p=r.pick&&r.pick.model!=="-"?r.pick:{};
    box().innerHTML='<div class="tipbox"><b>手動輸入型號：'+esc(r.name)+'</b><div class="fgrid">'
      +'<label>廠牌<input id="mnBrand" maxlength="60" value="'+esc(p.brand||(r.brand||"").split(/[.,、]/)[0])+'"></label>'
      +'<label>型號<input id="mnModel" maxlength="80" value="'+esc(p.model||"")+'"></label>'
      +'<label>品名<input id="mnName" maxlength="120" value="'+esc(p.name||r.name)+'"></label></div>'
      +'<p class="hint">設備資料庫沒有、或實際送審型號跟預設不同時使用。型錄可在套用後按該列的「上傳／選擇」。</p>'
      +'<div class="tools"><button class="btn primary small" id="mnOk" type="button">套用</button><button class="btn small" id="mnX" type="button">取消</button></div></div>';
    $("mnX").onclick=function(){ render(cur,el); };
    $("mnOk").onclick=function(){
      var m={brand:$("mnBrand").value.trim(),model:$("mnModel").value.trim(),name:$("mnName").value.trim()||r.name,link:"",manual:true,src:"manual"};
      if(!m.model){ toast("請填型號"); return; }
      var old=st.models[r.key]; if(old&&old.files&&old.model===m.model) m.files=old.files;
      st.models[r.key]=m; render(cur,el);
    };
    box().scrollIntoView({block:"nearest"}); $("mnModel").focus();
  }
  function catPanel(r){
    var p=r.pick&&r.pick.model!=="-"?r.pick:null;
    if(!p){ toast("請先選擇或手動輸入型號"); manualPanel(r); return; }
    var c=catOf(p);
    var h='<div class="tipbox"><b>原廠型錄：'+esc(r.name)+'（'+esc((p.brand+" "+p.model).trim())+'）</b>'
      +'<div style="margin:6px 0">目前：'+(c.files.length?c.files.map(function(x,i){ return '<span class="badge b-idle" style="margin:2px">'+esc(shortT(x.title))+(c.src==="指定"?' <a href="#" data-crm="'+i+'" aria-label="移除">✕</a>':'')+'</span>'; }).join("")+' <span class="hint">（'+esc(c.src)+'）</span>':'<span class="hint">尚無型錄</span>')
      +(p.files&&p.files.length?' <button class="btn small" id="catAuto" type="button">改回自動配對</button>':'')+'</div>'
      +'<h4 style="margin:10px 0 4px">從型錄庫選擇</h4><div class="uprow"><input id="catQ" class="fld" placeholder="型號、品名或廠牌" value="'+esc(p.model)+'"><button class="btn small" id="catGo" type="button">搜尋</button></div><ul class="list" id="catRes"></ul>'
      +'<h4 style="margin:10px 0 4px">上傳型錄（PDF／JPG／PNG，20MB 內）</h4><div class="uprow"><input type="file" id="catFile" accept=".pdf,.jpg,.jpeg,.png">'
      +'<label class="hint"><input type="checkbox" id="catAdd"> 加在目前型錄後面（不勾＝取代）</label>'
      +(canEditDb()&&p.sheet?'<label class="hint"><input type="checkbox" id="catDb" checked> 同時寫回設備資料庫「'+esc(p.sheet)+'」的型錄連結</label>':'')
      +'<button class="btn small primary" id="catUp" type="button">上傳並套用</button><span class="hint" id="catMsg"></span></div>'
      +'<div class="tools"><button class="btn small" id="catX" type="button">關閉</button></div></div>';
    box().innerHTML=h; box().scrollIntoView({block:"nearest"});
    $("catX").onclick=function(){ render(cur,el); };
    if($("catAuto")) $("catAuto").onclick=function(){ var m=ensurePick(r); delete m.files; render(cur,el); };
    box().querySelectorAll("[data-crm]").forEach(function(a){ a.onclick=function(ev){ ev.preventDefault(); var m=ensurePick(r); m.files=c.files.filter(function(_,i){ return i!==+a.dataset.crm; }); render(cur,el); }; });
    var setFiles=function(files,append){ var m=ensurePick(r); var base=append?catOf(m).files:[]; m.files=base.concat(files.filter(function(f){ return !base.some(function(b){ return b.id===f.id; }); })); render(cur,el); };
    var go=function(){
      var qq=$("catQ").value.trim().toLowerCase(), res=[];
      SEED.forEach(function(s){ if(!qq||(s.brand+" "+s.model+" "+s.name+" "+s.keys.join(" ")+" "+s.files.map(function(f){ return f.title; }).join(" ")).toLowerCase().indexOf(qq)>=0) res.push({t:(s.brand+" "+s.model).trim(),d:s.name+"｜內建型錄庫",files:s.files}); });
      (st.catlib||[]).forEach(function(f){ if(!qq||(f.title+" "+f.brand+" "+f.model+" "+f.name).toLowerCase().indexOf(qq)>=0) res.push({t:(f.brand+" "+f.model).trim()||f.title,d:f.title+"｜平台上傳",files:[{id:f.id,title:f.title}]}); });
      st.db.forEach(function(d){ var id=driveId(d.link); if(id&&(!qq||(d.name+" "+d.brand+" "+d.model).toLowerCase().indexOf(qq)>=0)) res.push({t:d.brand+" "+d.model,d:d.name+"｜設備資料庫連結",files:[{id:id,title:d.brand+" "+d.model+" 型錄"}]}); });
      res=res.slice(0,30);
      $("catRes").innerHTML=res.length?res.map(function(x,i){ return '<li><div class="main"><b>'+esc(x.t)+'</b><span class="meta">'+esc(x.d)+'</span></div><button class="btn small" data-cpick="'+i+'" type="button">選用</button><button class="btn small" data-cadd="'+i+'" type="button">加入</button></li>'; }).join(""):'<li class="meta">型錄庫找不到，請直接上傳。</li>';
      $("catRes").querySelectorAll("[data-cpick]").forEach(function(b){ b.onclick=function(){ setFiles(res[+b.dataset.cpick].files,false); }; });
      $("catRes").querySelectorAll("[data-cadd]").forEach(function(b){ b.onclick=function(){ setFiles(res[+b.dataset.cadd].files,true); }; });
    };
    $("catGo").onclick=go; $("catQ").onkeydown=function(e){ if(e.key==="Enter") go(); }; go();
    $("catUp").onclick=function(){
      var fl=$("catFile").files[0], btn=this; if(!fl){ toast("請先選擇型錄檔"); return; }
      if(!/\.(pdf|jpe?g|png)$/i.test(fl.name)){ toast("型錄只接受 PDF、JPG、PNG"); return; }
      if(fl.size>CAT_MAX){ toast("檔案超過 20MB，請先壓縮"); return; }
      btn.disabled=true; $("catMsg").textContent="上傳中…";
      var append=$("catAdd").checked, wdb=!!($("catDb")&&$("catDb").checked);
      readB64(fl).then(function(d){ return api("catalogUpload",{id:cur.id,fileName:fl.name,data:d,brand:p.brand||"",model:p.model||"",name:p.name||r.name,writeDb:wdb,sheet:p.sheet||""}); })
        .then(function(meta){
          (st.catlib=st.catlib||[]).push(meta);
          var m=ensurePick(r); if(meta.dbUpdated){ m.link=meta.link; st.db.forEach(function(d){ if(d.sheet===p.sheet&&d.model===p.model) d.link=meta.link; }); }
          toast("型錄已上傳到公司型錄庫"+(meta.dbUpdated?"，並寫回設備資料庫":""));
          setFiles([{id:meta.id,title:meta.title}],append);
        }).catch(function(e){ btn.disabled=false; $("catMsg").textContent=""; if(/不支援/.test(e.message||"")) toast("後端尚未更新到 v2.8.0，無法上傳型錄"); else fail(e); });
    };
  }
  el.querySelectorAll("[data-mcat]").forEach(function(b){ b.onclick=function(){ catPanel(byKey[b.dataset.mcat]); }; });
  el.querySelectorAll("[data-mk]").forEach(function(s){ s.onchange=function(){
    var r=byKey[s.dataset.mk], v=s.value;
    if(v==="keep") return;
    if(v==="") { delete st.models[r.key]; render(cur,el); return; }
    if(v==="skip"){ st.models[r.key]={model:"-"}; render(cur,el); return; }
    if(/^c\d+$/.test(v)){ st.models[r.key]=pickOf(r.candidates[+v.slice(1)].d); render(cur,el); return; }
    if(/^s\d+$/.test(v)){ st.models[r.key]=seedPick(SEED[+v.slice(1)]); render(cur,el); return; }
    if(v==="manual"){ manualPanel(r); return; }
    if(v==="search"){
      box().innerHTML='<div class="tipbox"><b>搜尋：'+esc(r.name)+'</b><div class="uprow"><input id="mdlQ" class="fld" placeholder="品名、廠牌或型號" value="'+esc((r.brand||"").split(/[.,、]/)[0])+'"><button class="btn small" id="mdlGo" type="button">搜尋</button></div><ul class="list" id="mdlRes"></ul></div>';
      var go=function(){ var qq=$("mdlQ").value.trim().toLowerCase();
        var res=st.db.filter(function(d){ return (d.name+" "+d.brand+" "+d.model).toLowerCase().indexOf(qq)>=0; }).slice(0,25).map(function(d){ return {p:pickOf(d),t:d.brand+" "+d.model,m:d.name+"｜"+d.sheet}; })
          .concat(SEED.filter(function(x){ return (x.name+" "+x.brand+" "+x.model+" "+x.keys.join(" ")).toLowerCase().indexOf(qq)>=0; }).slice(0,15).map(function(x){ return {p:seedPick(x),t:(x.brand+" "+x.model).trim(),m:x.name+"｜型錄庫"}; }));
        $("mdlRes").innerHTML=res.length?res.map(function(d,i){ return '<li><div class="main"><b>'+esc(d.t)+'</b><span class="meta">'+esc(d.m)+'</span></div><button class="btn small" data-mpick="'+i+'" type="button">選這個</button></li>'; }).join(""):'<li class="meta">找不到，可改用「手動輸入型號…」</li>';
        $("mdlRes").querySelectorAll("[data-mpick]").forEach(function(b){ b.onclick=function(){ st.models[r.key]=res[+b.dataset.mpick].p; render(cur,el); }; }); };
      $("mdlGo").onclick=go; go(); box().scrollIntoView({block:"nearest"}); return;
    }
    if(v==="add"){
      var sheets=(st.sheets||[]);
      box().innerHTML='<div class="tipbox"><b>新增到設備單價資料庫（最後一列）</b><div class="fgrid">'
        +'<label>分類<select id="dbSheet">'+sheets.map(function(x){ return '<option>'+esc(x)+'</option>'; }).join("")+'</select></label>'
        +'<label>品名<input id="dbName" maxlength="120" value="'+esc(r.name)+'"></label><label>廠牌<input id="dbBrand" maxlength="60" value="'+esc((r.brand||"").split(/[.,、]/)[0])+'"></label>'
        +'<label>型號<input id="dbModel" maxlength="80"></label><label>採購價<input id="dbCost" inputmode="numeric"></label><label>業務價<input id="dbPrice" inputmode="numeric" value="'+esc(r.cost||"")+'"></label>'
        +'<label>型錄連結（https://）<input id="dbLink" maxlength="300"></label><label>備註<input id="dbNote" maxlength="200"></label></div>'
        +'<p class="hint">沒有型錄連結也可以先新增，之後在該列按「上傳／選擇」上傳型錄並寫回資料庫。</p>'
        +'<div class="tools"><button class="btn primary small" id="dbAdd" type="button">新增並選用</button></div></div>';
      var SR={bms:/中央監控/,access:/門禁/,intercom:/對講/,parking:/停管/,cctv:/攝影/,media:/多媒體/};
      var guess=sheets.filter(function(x){ return SR[r.sys]&&SR[r.sys].test(x); })[0];
      if(guess) $("dbSheet").value=guess;
      $("dbAdd").onclick=function(){
        var d={sheet:$("dbSheet").value,name:$("dbName").value.trim(),brand:$("dbBrand").value.trim(),model:$("dbModel").value.trim(),cost:$("dbCost").value,price:$("dbPrice").value,link:$("dbLink").value.trim(),note:$("dbNote").value};
        if(!d.name||!d.model){ toast("請填品名與型號"); return; }
        api("deviceAdd",d).then(function(){ var nd={sheet:d.sheet,name:d.name,brand:d.brand,model:d.model,link:d.link,price:Number(String(d.price).replace(/,/g,""))||0}; st.db.push(nd); st.models[r.key]=nd; toast("已新增到資料庫"); render(cur,el); }).catch(fail);
      };
      box().scrollIntoView({block:"nearest"});
    }
  }; });
  if($("btnMdlSave")) $("btnMdlSave").onclick=function(){ api("analysisSave",{id:cur.id,kind:"models",data:st.models}).then(function(){ toast("已儲存型號對應"); }).catch(fail); };
  function chosenRows(){ return rows.filter(function(r){ return r.pick&&r.pick.model!=="-"; }); }
  function picked(){ return chosenRows().map(function(r){ var c=catOf(r.pick); return {sys:T.sysName({},r.sys),name:r.pick.name||r.name,brand:r.pick.brand,model:r.pick.model,qty:r.qty,unit:r.unit,link:r.pick.link||(c.files[0]?driveUrl(c.files[0].id):"")}; }); }
  if($("btnSubmittal")) $("btnSubmittal").onclick=function(){
    var items=picked(), todo=rows.filter(function(r){ return r.status==="suggest"||r.status==="none"; }).length;
    if(!items.length){ toast("還沒有選定任何型號"); return; }
    if(todo&&!confirm("還有 "+todo+" 項未選型號，要先用已選的 "+items.length+" 項產生送審資料嗎？")) return;
    api("analysisSave",{id:cur.id,kind:"models",data:st.models}).then(function(){ return api("submittalBuild",{id:cur.id,items:items}); }).then(function(r){
      var c={copied:0,link:0,none:0,failed:0}; r.items.forEach(function(x){ c[x.status]++; }); st.subResult=c; toast("送審資料已建立"); render(cur,el);
    }).catch(fail);
  };
  /* 輸出送審型錄 PDF：依估價單項次，瀏覽器端合併 */
  if($("btnSubPdf")) $("btnSubPdf").onclick=function(){
    if(!window.SUBMITTAL_PDF||!window.PDFLib){ toast("PDF 元件未載入，請重新整理頁面"); return; }
    var list=chosenRows(), todo=rows.filter(function(r){ return r.status==="suggest"||r.status==="none"; }).length;
    if(!list.length){ toast("還沒有選定任何型號"); return; }
    var withCat=list.filter(function(r){ return catOf(r.pick).files.length; }).length;
    if(!confirm("輸出送審型錄 PDF：\n・送審 "+list.length+" 項（已附型錄 "+withCat+" 項，待附 "+(list.length-withCat)+" 項）"+(todo?"\n・還有 "+todo+" 項未選型號，不會列入":"")+"\n\n確定輸出？")) return;
    var btn=this, msg=$("subPdfMsg"), say=function(t){ if(msg) msg.textContent=t; };
    btn.disabled=true; st.fcache=st.fcache||{};
    var ids=[], backendOld=false, errs={};
    list.forEach(function(r){ catOf(r.pick).files.forEach(function(f){ if(ids.indexOf(f.id)<0) ids.push(f.id); }); });
    ids.reduce(function(pr,id,i){ return pr.then(function(){
      if(st.fcache[id]||backendOld) return;
      say("下載型錄 "+(i+1)+"/"+ids.length+"…");
      return api("catalogFile",{id:cur.id,fileId:id}).then(function(f){ st.fcache[id]={name:f.name,mime:f.mime,bytes:f.data?b64ToBytes(f.data):null}; })
        .catch(function(e){ if(/不支援/.test(e.message||"")) backendOld=true; errs[id]=e.message||"讀取失敗"; });
    }); },Promise.resolve()).then(function(){
      var qm=(q&&q.meta)||{}, pj=cur.project||{};
      var items=list.map(function(r){
        var c=catOf(r.pick), sec=r.key.split("-")[0];
        return {no:r.key,section:sec+"、"+r.section,name:r.name,brand:r.pick.brand||"",model:r.pick.model||"",qty:r.qty,unit:r.unit||"",quoteBrand:r.brand||r.brandSpec||"",spec:"",note:r.pick.manual?"手動指定型號":"",
          files:c.files.filter(function(f){ return st.fcache[f.id]; }).map(function(f){ var x=st.fcache[f.id]; return {title:x.name||f.title,mime:x.mime,bytes:x.bytes}; }),
          failed:c.files.filter(function(f){ return !st.fcache[f.id]; }).map(function(f){ return shortT(f.title)+"（"+(errs[f.id]||"讀取失敗")+"）"; })};
      });
      return SUBMITTAL_PDF.build({project:pj.name||qm.project||"",client:pj.client||qm.client||"",contractor:qm.company||pj.company||"",items:items},say).then(function(bytes){
        var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
        a.download=((pj.name||"專案")+"_送審型錄.pdf").replace(/[\\\/:*?"<>|]/g,"_"); document.body.appendChild(a); a.click();
        setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },3000);
        var att=items.filter(function(it){ return it.pages; }).length, mb=(bytes.length/1048576).toFixed(1);
        st.pdfResult="共 "+items.length+" 項、"+mb+"MB；已附型錄 "+att+" 項，待附 "+(items.length-att)+" 項。"+(backendOld?"（後端尚未更新到 v2.8.0，型錄未能併入）":"");
        btn.disabled=false; say(""); render(cur,el);
      });
    }).catch(function(e){ btn.disabled=false; say(""); fail(e); });
  };
  if($("btnSubPrint")) $("btnSubPrint").onclick=function(){
    var items=picked(); var w=window.open("","_blank"); if(!w){ toast("請允許彈出視窗"); return; }
    w.document.write('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>送審設備清單</title><style>body{font-family:"Microsoft JhengHei","PingFang TC",sans-serif;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:6px;font-size:13px}th{background:#eee}</style></head><body><h1 style="font-size:20px">送審設備清單</h1><p>專案：'+esc(cur.project.name)+'｜日期：'+esc(T.today())+'</p><table><thead><tr><th>#</th><th>系統</th><th>品名</th><th>廠牌</th><th>型號</th><th>數量</th><th>型錄</th></tr></thead><tbody>'
      +items.map(function(it,i){ return '<tr><td>'+(i+1)+'</td><td>'+esc(it.sys)+'</td><td>'+esc(it.name)+'</td><td>'+esc(it.brand)+'</td><td>'+esc(it.model)+'</td><td>'+esc(it.qty)+' '+esc(it.unit||"")+'</td><td>'+(/^https:\/\//.test(it.link)?esc(it.link):"")+'</td></tr>'; }).join("")+'</tbody></table></body></html>');
    w.document.close(); setTimeout(function(){ w.print(); },300);
  };
}

/* ---------- 事件 ---------- */
function bind(cur,el){
  el.querySelectorAll("[data-qv]").forEach(function(b){ b.onclick=function(){ st.view=b.dataset.qv; render(cur,el); }; });
  el.querySelectorAll("[data-cf]").forEach(function(b){ b.onclick=function(){ st.cf=b.dataset.cf; render(cur,el); }; });
  el.querySelectorAll("[data-map]").forEach(function(s){ s.onchange=function(){ if(s.value) st.mapping[s.dataset.map]=s.value; else st.mapping[s.dataset.map]="-"; render(cur,el); }; });
  if($("btnCsv")) $("btnCsv").onclick=function(){
    var dr=st.draft||st.data.drawing, fl=dr.floors;
    downloadCsv((cur.project.name||"專案")+"_圖面設備數量.csv",[["系統","設備"].concat(fl,["合計"])].concat(dr.items.map(function(it){ return [sysName(it.sys),it.name].concat(fl.map(function(f){ return it.floors[f]||""; }),[it.total]); })));
  };
  if($("btnDxf")) $("btnDxf").onclick=function(){
    var f=$("dxfFile").files[0]; if(!f){ toast("請先選擇 DXF 檔"); return; }
    if(!/\.(dxf|zip)$/i.test(f.name)){ toast("請選擇 .dxf 或 .zip"); return; }
    var msg=$("dxfMsg"); msg.textContent="讀取檔案…"; $("btnDxf").disabled=true;
    f.arrayBuffer().then(function(buf){
      var w=new Worker("dxf-worker.js?v=2.8.0");
      w.onmessage=function(ev){
        var m=ev.data;
        if(m.type==="progress"){ msg.textContent=m.text; return; }
        w.terminate(); $("btnDxf").disabled=false;
        if(m.type==="error"){ msg.textContent=""; toast("分析失敗："+m.message); return; }
        var r=m.result; r.fileName=f.name;
        delete r.stats; st.draft=r; render(cur,el);
        toast("完成：讀到 "+r.tables.length+" 張數量表、"+r.items.length+" 種設備");
      };
      w.onerror=function(e){ w.terminate(); $("btnDxf").disabled=false; msg.textContent=""; toast("分析失敗："+(e.message||"瀏覽器不支援")); };
      w.postMessage({buf:buf,name:f.name},[buf]);
    }).catch(fail);
  };
  if($("btnDxfSave")) $("btnDxfSave").onclick=function(){
    var data=st.draft; api("analysisSave",{id:cur.id,kind:"drawing",fileName:data.fileName,data:data}).then(function(){ toast("已儲存圖面分析"); st.draft=null; T.views.qtyTab(cur,el); }).catch(fail);
  };
  if($("btnDxfCancel")) $("btnDxfCancel").onclick=function(){ st.draft=null; render(cur,el); };
  if($("btnXls")) $("btnXls").onclick=function(){
    var f=$("xlsFile").files[0]; if(!f){ toast("請先選擇估價單"); return; }
    f.arrayBuffer().then(XLSX_LITE.read).then(function(sheets){
      var q=QUOTE.parse(sheets); q.fileName=f.name; st.qdraft=q;
      return st.data.standard && !st.std ? api("standardGet").then(function(s){ st.std=s.standard; }) : null;
    }).then(function(){ render(cur,el); toast("估價單分析完成"); }).catch(function(e){ toast("無法讀取估價單："+e.message); });
  };
  if($("btnXlsSave")) $("btnXlsSave").onclick=function(){
    var q=st.qdraft; api("analysisSave",{id:cur.id,kind:"quote",fileName:q.fileName,data:q}).then(function(){ toast("已儲存估價單"); st.qdraft=null; T.views.qtyTab(cur,el); }).catch(fail);
  };
  if($("btnXlsCancel")) $("btnXlsCancel").onclick=function(){ st.qdraft=null; render(cur,el); };
  if($("btnStd")) $("btnStd").onclick=function(){
    var q=st.qdraft||st.data.quote; if(!q||q.redacted) return;
    if(!confirm("把「"+(q.fileName||"這份估價單")+"」設為公司標準估價範本？之後所有估價單都會跟它比對單價、成本與漏列項目。")) return;
    api("standardSave",{fileName:q.fileName,data:q}).then(function(r){ st.data.standard=r.info; st.std=q; toast("已設為標準範本"); render(cur,el); }).catch(fail);
  };
  if($("btnMapSave")) $("btnMapSave").onclick=function(){
    api("analysisSave",{id:cur.id,kind:"mapping",data:st.mapping}).then(function(){ toast("已儲存對照"); }).catch(fail);
  };
  /* 載入標準範本（審查用） */
  if(caps().quote && st.data.standard && !st.std && !st.loadingStd){
    st.loadingStd=true;
    api("standardGet").then(function(s){ st.std=s.standard; if((st.qdraft||st.data.quote)&&T.getCur()&&T.getCur().id===cur.id) render(cur,el); }).catch(function(){});
  }
}
})();
