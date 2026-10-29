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
  /* B. 估價單 */
  h+='<section class="panel"><h3>估價單比對'+(c.quote?'與成本審查':'')+'</h3>';
  if(c.quote){
    h+='<p class="meta">上傳公司格式的估價單（.xlsx），系統會計算各系統售價、成本、毛利與線材／工資，並檢查毛利過低、缺成本、低於標準範本的項目。成本以業務價計算。'
      +(d.standard?'<br>標準範本：'+esc(d.standard.fileName||"")+'（'+esc(d.standard.project||"")+'，'+fmtTime(d.standard.savedAt)+'）':'<br><span style="color:var(--warn)">尚未設定公司標準估價範本，</span>由業務主管上傳一份估價單後按「設為標準範本」。')+'</p>';
    if(edit) h+='<div class="uprow"><input type="file" id="xlsFile" accept=".xlsx"><button class="btn primary small" id="btnXls" type="button">分析估價單</button></div>';
    if(st.qdraft) h+='<div class="tipbox"><b>這是剛分析的估價單，尚未儲存。</b> <button class="btn primary small" id="btnXlsSave" type="button">儲存</button> <button class="btn small" id="btnXlsCancel" type="button">放棄</button>'
      +(["admin","sales_mgr"].indexOf(T.session.me.role)>=0?' <button class="btn small" id="btnStd" type="button">設為公司標準範本</button>':'')+'</div>';
    else if(q) h+='<p class="meta">目前估價單：'+esc(q.fileName||"")+'｜'+esc(T.userName(q.savedBy||""))+' '+fmtTime(q.savedAt)+(["admin","sales_mgr"].indexOf(T.session.me.role)>=0?' <button class="btn small" id="btnStd" type="button">設為公司標準範本</button>':'')+'</p>';
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
function canEditDb(){ return ["admin","sales_mgr","purchase","eng_mgr"].indexOf(T.session.me.role)>=0; }
function modelsHtml(q,edit){
  var h='<section class="panel" id="mdlPanel"><div class="row" style="flex-wrap:wrap"><h3>設備型號對應與送審型錄</h3>'+(st.db?'<div class="tools">'+(edit?'<button class="btn small" id="btnMdlSave" type="button">儲存型號</button><button class="btn small primary" id="btnSubmittal" type="button">產生送審資料</button>':'')+'<button class="btn small" id="btnSubPrint" type="button">列印送審清單</button></div>':'')+'</div>'
    +'<p class="meta">依估價項目的廠牌，從「設備單價資料庫」找出對應型號。廠牌相符且名稱接近的會自動配對，其餘請從建議中選擇；資料庫沒有的設備可直接新增到資料庫最後一列。確認後按「產生送審資料」，系統會在專案資料夾建立送審設備清單，並複製雲端硬碟上的型錄檔。</p>';
  if(!st.db) return h+'<button class="btn small" id="btnLoadDb" type="button">載入設備資料庫並配對</button></section>';
  var rows=QUOTE.matchModels(q,st.db,st.models), f=st.mf||"todo";
  var cnt={}; rows.forEach(function(r){ cnt[r.status]=(cnt[r.status]||0)+1; });
  h+='<div class="filters"><div class="seg">'+[["todo","需處理（"+((cnt.suggest||0)+(cnt.none||0))+"）"],["all","全部（"+rows.length+"）"]].map(function(x){ return '<button type="button" data-mf="'+x[0]+'" class="'+(f===x[0]?"on":"")+'">'+x[1]+'</button>'; }).join("")+'</div>'
    +'<span class="meta">'+Object.keys(MST).filter(function(k){return cnt[k];}).map(function(k){ return MST[k][0]+" "+cnt[k]; }).join("｜")+'</span></div>';
  var shown=f==="all"?rows:rows.filter(function(r){ return r.status==="suggest"||r.status==="none"; });
  var showPrice=caps().quote;
  h+='<div class="tblwrap"><table><thead><tr><th>估價項目</th><th>數量</th><th>估價廠牌</th><th>對應型號</th>'+(showPrice?'<th>資料庫業務價</th>':'')+'<th>型錄</th><th>狀態</th></tr></thead><tbody>'
    +shown.map(function(r){
      var sel;
      if(edit){
        var opts=r.candidates.map(function(c,i){ var d=c.d; return '<option value="c'+i+'"'+(r.pick&&r.pick.model===d.model&&r.pick.name===d.name?" selected":"")+'>'+esc(d.brand+" "+d.model+"｜"+d.name).slice(0,70)+'</option>'; }).join("");
        var pickIn=r.pick&&r.pick.model!=="-"&&!r.candidates.some(function(c){ return c.d.model===r.pick.model&&c.d.name===r.pick.name; });
        sel='<select data-mk="'+esc(r.key)+'"><option value="">（未選）</option>'+(pickIn?'<option value="keep" selected>'+esc(r.pick.brand+" "+r.pick.model)+'</option>':'')+opts+'<option value="search">搜尋資料庫…</option><option value="skip"'+(r.status==="skip"?" selected":"")+'>不送審／不適用</option>'+(canEditDb()?'<option value="add">新增到資料庫…</option>':'')+'</select>';
      } else sel=esc(r.pick&&r.pick.model!=="-"?r.pick.brand+" "+r.pick.model:"—");
      var p=r.pick&&r.pick.model!=="-"?r.pick:null, warn="";
      if(showPrice&&p&&p.price&&r.cost&&r.cost<p.price*0.97) warn='<br><span class="hint" style="color:var(--bad)">估價成本 '+money(r.cost)+' 低於業務價</span>';
      return '<tr><td>'+esc(r.name)+'<br><span class="hint">'+esc(r.section)+'</span></td><td>'+r.qty+' '+esc(r.unit)+'</td><td>'+esc(r.brand||r.brandSpec||"")+'</td><td>'+sel+'</td>'
        +(showPrice?'<td>'+(p&&p.price?money(p.price):"—")+warn+'</td>':'')+'<td>'+(p&&/^https:\/\//.test(p.link||"")?'<a href="'+esc(p.link)+'" target="_blank" rel="noopener noreferrer">型錄</a>':"—")+'</td><td><span class="status '+MST[r.status][1]+'">'+MST[r.status][0]+'</span></td></tr>'; }).join("")
    +'</tbody></table></div><div id="mdlExtra"></div>';
  if(st.subResult) h+='<div class="tipbox"><b>送審資料已建立</b>：型錄複製 '+st.subResult.copied+' 份、需手動下載 '+st.subResult.link+' 份、無型錄 '+st.subResult.none+' 份'+(st.subResult.failed?'、無法複製 '+st.subResult.failed+' 份（連結權限不足）':'')+'。檔案在「圖面檔案」分頁下方的「送審資料」。</div>';
  return h+'</section>';
}
function bindModels(cur,el){
  var q=st.qdraft||(st.data&&st.data.quote);
  if($("btnLoadDb")) $("btnLoadDb").onclick=function(){ this.disabled=true; api("devices",{all:true}).then(function(r){ st.db=r.devices; st.sheets=r.sheets; render(cur,el); }).catch(fail); };
  el.querySelectorAll("[data-mf]").forEach(function(b){ b.onclick=function(){ st.mf=b.dataset.mf; render(cur,el); }; });
  if(!q||!st.db) return;
  var rows=QUOTE.matchModels(q,st.db,st.models), byKey={}; rows.forEach(function(r){ byKey[r.key]=r; });
  function pickOf(d){ return {sheet:d.sheet,name:d.name,brand:d.brand,model:d.model,link:d.link,price:d.price}; }
  el.querySelectorAll("[data-mk]").forEach(function(s){ s.onchange=function(){
    var r=byKey[s.dataset.mk], v=s.value;
    if(v==="keep") return;
    if(v==="") { delete st.models[r.key]; render(cur,el); return; }
    if(v==="skip"){ st.models[r.key]={model:"-"}; render(cur,el); return; }
    if(/^c\d+$/.test(v)){ st.models[r.key]=pickOf(r.candidates[+v.slice(1)].d); render(cur,el); return; }
    var box=$("mdlExtra");
    if(v==="search"){
      box.innerHTML='<div class="tipbox"><b>搜尋資料庫：'+esc(r.name)+'</b><div class="uprow"><input id="mdlQ" class="fld" placeholder="品名、廠牌或型號" value="'+esc((r.brand||"").split(/[.,、]/)[0])+'"><button class="btn small" id="mdlGo" type="button">搜尋</button></div><ul class="list" id="mdlRes"></ul></div>';
      var go=function(){ var qq=$("mdlQ").value.trim().toLowerCase(); var res=st.db.filter(function(d){ return (d.name+" "+d.brand+" "+d.model).toLowerCase().indexOf(qq)>=0; }).slice(0,30);
        $("mdlRes").innerHTML=res.length?res.map(function(d,i){ return '<li><div class="main"><b>'+esc(d.brand+" "+d.model)+'</b><span class="meta">'+esc(d.name)+'｜'+esc(d.sheet)+'</span></div><button class="btn small" data-mpick="'+i+'" type="button">選這個</button></li>'; }).join(""):'<li class="meta">找不到</li>';
        $("mdlRes").querySelectorAll("[data-mpick]").forEach(function(b){ b.onclick=function(){ st.models[r.key]=pickOf(res[+b.dataset.mpick]); render(cur,el); }; }); };
      $("mdlGo").onclick=go; go(); box.scrollIntoView({block:"nearest"}); return;
    }
    if(v==="add"){
      var sheets=(st.sheets||[]);
      box.innerHTML='<div class="tipbox"><b>新增到設備單價資料庫（最後一列）</b><div class="fgrid">'
        +'<label>分類<select id="dbSheet">'+sheets.map(function(x){ return '<option>'+esc(x)+'</option>'; }).join("")+'</select></label>'
        +'<label>品名<input id="dbName" maxlength="120" value="'+esc(r.name)+'"></label><label>廠牌<input id="dbBrand" maxlength="60" value="'+esc((r.brand||"").split(/[.,、]/)[0])+'"></label>'
        +'<label>型號<input id="dbModel" maxlength="80"></label><label>採購價<input id="dbCost" inputmode="numeric"></label><label>業務價<input id="dbPrice" inputmode="numeric" value="'+esc(r.cost||"")+'"></label>'
        +'<label>型錄連結（https://）<input id="dbLink" maxlength="300"></label><label>備註<input id="dbNote" maxlength="200"></label></div>'
        +'<div class="tools"><button class="btn primary small" id="dbAdd" type="button">新增並選用</button></div></div>';
      var guess=sheets.filter(function(x){ return ({bms:/中央監控/,access:/門禁/,intercom:/對講/,parking:/停管/,cctv:/攝影/,media:/多媒體/})[r.sys]&&({bms:/中央監控/,access:/門禁/,intercom:/對講/,parking:/停管/,cctv:/攝影/,media:/多媒體/})[r.sys].test(x); })[0];
      if(guess) $("dbSheet").value=guess;
      $("dbAdd").onclick=function(){
        var d={sheet:$("dbSheet").value,name:$("dbName").value.trim(),brand:$("dbBrand").value.trim(),model:$("dbModel").value.trim(),cost:$("dbCost").value,price:$("dbPrice").value,link:$("dbLink").value.trim(),note:$("dbNote").value};
        if(!d.name||!d.model){ toast("請填品名與型號"); return; }
        api("deviceAdd",d).then(function(){ var nd={sheet:d.sheet,name:d.name,brand:d.brand,model:d.model,link:d.link,price:Number(String(d.price).replace(/,/g,""))||0}; st.db.push(nd); st.models[r.key]=nd; toast("已新增到資料庫"); render(cur,el); }).catch(fail);
      };
      box.scrollIntoView({block:"nearest"});
    }
  }; });
  if($("btnMdlSave")) $("btnMdlSave").onclick=function(){ api("analysisSave",{id:cur.id,kind:"models",data:st.models}).then(function(){ toast("已儲存型號對應"); }).catch(fail); };
  function picked(){ return rows.filter(function(r){ return r.pick&&r.pick.model!=="-"; }).map(function(r){ return {sys:T.sysName({},r.sys),name:r.pick.name||r.name,brand:r.pick.brand,model:r.pick.model,qty:r.qty,unit:r.unit,link:r.pick.link||""}; }); }
  if($("btnSubmittal")) $("btnSubmittal").onclick=function(){
    var items=picked(), todo=rows.filter(function(r){ return r.status==="suggest"||r.status==="none"; }).length;
    if(!items.length){ toast("還沒有選定任何型號"); return; }
    if(todo&&!confirm("還有 "+todo+" 項未選型號，要先用已選的 "+items.length+" 項產生送審資料嗎？")) return;
    api("analysisSave",{id:cur.id,kind:"models",data:st.models}).then(function(){ return api("submittalBuild",{id:cur.id,items:items}); }).then(function(r){
      var c={copied:0,link:0,none:0,failed:0}; r.items.forEach(function(x){ c[x.status]++; }); st.subResult=c; toast("送審資料已建立"); render(cur,el);
    }).catch(fail);
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
      var w=new Worker("dxf-worker.js");
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
