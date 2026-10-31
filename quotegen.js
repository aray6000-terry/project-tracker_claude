/* 「數量・報價」分頁：自動生成報價單（勾選系統、廠牌、智慧建築版本 → 由報價範本庫＋圖面數量產生） */
(function(){
"use strict";
var T=window.TR; if(!T||!window.QUOTEGEN||!window.XLSX_WRITE) return;
var esc=T.esc, api=T.api, toast=T.toast, fail=T.fail, G=window.QUOTEGEN;
var $=function(id){ return document.getElementById(id); };
var st={pid:null, lib:null, canEdit:false, loading:false, opt:null, q:null, tab:"set"};
var FULL={"宗亞":"宗亞資訊工業股份有限公司","宗友":"宗友資訊股份有限公司"};
var SMART_LABEL={none:"一般（非智慧建築）","2016":"智慧建築 2016 年版","2024":"智慧建築 2024 年版",smart:"智慧建築（未標版本）"};
/* 專案建置系統 → 報價系統 */
var FROM_PROJECT={access:"access",cctv:"cctv",intercom:"intercom",bms:"bms",parking:"parking",visitor:"visitor",media:"media","energy.meter":"energy","energy.water":"energy","energy.solar":"energy"};

function ls(k,v){ try{ if(v===undefined) return JSON.parse(localStorage.getItem(k)||"null"); localStorage.setItem(k,JSON.stringify(v)); }catch(e){ return null; } }
function rocToday(){ var d=new Date(); return (d.getFullYear()-1911)+"/"+("0"+(d.getMonth()+1)).slice(-2)+"/"+("0"+d.getDate()).slice(-2); }
function money(n){ return n===null||n===undefined||isNaN(n)?"—":"$"+Math.round(n).toLocaleString(); }
function pct(x){ return x===null||x===undefined||isNaN(x)?"—":(Math.round(x*1000)/10)+"%"; }

function defaults(cur,dr){
  var p=cur.project||{}, saved=ls("qgen:"+cur.id);
  if(saved) return saved;
  var sys={};
  (p.systems||[]).forEach(function(k){ if(FROM_PROJECT[k]) sys[FROM_PROJECT[k]]=1; });
  ((dr&&dr.items)||[]).forEach(function(it){ if(it.total>0&&FROM_PROJECT[it.sys]) sys[FROM_PROJECT[it.sys]]=1; });
  var brands={}; Object.keys(p.brands||{}).forEach(function(k){ if(FROM_PROJECT[k]) brands[FROM_PROJECT[k]]=p.brands[k]; });
  var smart=(p.systems||[]).indexOf("ib2024")>=0?"2024":(p.systems||[]).indexOf("ib2016")>=0?"2016":"none";
  var co=p.company||"", hdr=ls("qgen:hdr:"+co)||{};
  return {systems:Object.keys(sys), brands:brands, smart:smart, grade:"銀級", sources:{},
    meta:{company:hdr.company||FULL[co]||co, client:p.client||"", project:p.name||"", date:rocToday(), tel:hdr.tel||"", fax:hdr.fax||"", contact:hdr.contact||T.session.me.name||""}};
}

/* ---------- 畫面 ---------- */
function html(cur,dr){
  if(st.pid!==cur.id){ st={pid:cur.id, lib:null, canEdit:false, loading:false, opt:null, q:null, tab:"set"}; }
  if(!st.opt) st.opt=defaults(cur,dr);
  var h='<section class="panel" id="qgenPanel"><div class="row" style="flex-wrap:wrap"><h3>自動生成報價單</h3>'
    +(st.q?'<div class="seg"><button type="button" data-qg-tab="set" class="'+(st.tab==="set"?"on":"")+'">設定</button><button type="button" data-qg-tab="out" class="'+(st.tab==="out"?"on":"")+'">報價單</button></div>':'')+'</div>';
  if(!st.lib){ h+='<div class="loading">讀取報價範本庫…</div></section>'; return h; }
  if(st.tab==="out"&&st.q) return h+outHtml(cur)+'</section>';
  h+='<p class="meta">勾選要報價的系統與廠牌，系統會從「報價範本庫」挑出最接近的範本，再以圖面分析的設備數量帶入；線材與工資依設備金額比例調整。產生後可逐項修改，再下載 Excel 或存為本案估價單。'+(dr?'':'<br><b style="color:var(--warn)">本案尚未分析圖面，數量會沿用範本，請產生後逐項確認。</b>')+'</p>';
  h+=libHtml();
  var o=st.opt, m=o.meta;
  h+='<h4 style="margin:14px 0 6px">報價單抬頭</h4><div class="fgrid">'
    +fld("company","報價公司（抬頭）",m.company)+fld("client","業主",m.client)+fld("project","案件名稱",m.project)
    +fld("date","日期",m.date)+fld("tel","電話",m.tel)+fld("fax","傳真",m.fax)+fld("contact","承辦人",m.contact)+'</div>';
  h+='<h4 style="margin:14px 0 6px">智慧建築</h4><div class="seg" role="group" aria-label="智慧建築">'
    +["none","2016","2024"].map(function(k){ return '<button type="button" data-qg-smart="'+k+'" class="'+(o.smart===k?"on":"")+'">'+(k==="none"?"否":k+" 年版")+'</button>'; }).join("")+'</div>'
    +(o.smart!=="none"?' <label style="display:inline-flex;gap:6px;align-items:center;margin-left:8px">標章等級<select id="qgGrade" class="fld">'+G.GRADES.map(function(g){ return '<option'+(g===o.grade?" selected":"")+'>'+g+'</option>'; }).join("")+'</select></label>':'');
  h+='<h4 style="margin:14px 0 6px">報價系統與廠牌</h4><div class="tblwrap"><table class="items"><thead><tr><th style="width:40px"></th><th>系統</th><th>廠牌（可選或自填）</th><th>範本來源</th></tr></thead><tbody>';
  G.SYSTEMS.forEach(function(S){
    var on=o.systems.indexOf(S.k)>=0, cands=G.candidates(st.lib,S.k,o.smart);
    h+='<tr><td class="c"><input type="checkbox" data-qg-sys="'+S.k+'"'+(on?" checked":"")+' aria-label="'+esc(S.n)+'"></td><td>'+esc(S.n)+'</td>'
      +'<td><input class="fld" data-qg-brand="'+S.k+'" list="qgb_'+S.k+'" maxlength="40" value="'+esc(o.brands[S.k]||"")+'" placeholder="依範本"'+(on?"":" disabled")+'><datalist id="qgb_'+S.k+'">'+S.brands.map(function(b){ return '<option value="'+esc(b)+'">'; }).join("")+'</datalist></td>'
      +'<td>'+(cands.length?'<select class="fld" data-qg-src="'+S.k+'"'+(on?"":" disabled")+'><option value="">自動（'+esc(cands[0].tname)+'）</option>'+cands.map(function(c){ return '<option value="'+esc(c.id)+'"'+(o.sources[S.k]===c.id?" selected":"")+'>'+esc(c.tname)+'（'+esc(SMART_LABEL[c.smart]||"")+'）</option>'; }).join("")+'</select>':'<span class="hint">範本庫沒有這個系統</span>')+'</td></tr>';
  });
  h+='</tbody></table></div>';
  h+='<div class="tools" style="margin-top:12px"><button class="btn primary" id="qgBuild" type="button"'+(st.lib.length?"":" disabled")+'>生成報價單</button>'+(st.q?'<button class="btn" type="button" data-qg-tab="out">回到報價單</button>':'')+'</div>';
  return h+'</section>';
  function fld(k,l,v){ return '<label>'+esc(l)+'<input class="fld" data-qg-meta="'+k+'" maxlength="80" value="'+esc(v||"")+'"></label>'; }
}
function libHtml(){
  var L=st.lib, h='<details class="mxwrap"'+(L.length?"":" open")+'><summary>報價範本庫（'+L.length+' 份）</summary>';
  if(!L.length) h+='<p class="meta" style="color:var(--warn)">範本庫還是空的。'+(st.canEdit?'請上傳公司過去的報價單（.xlsx）作為範本，建議一般案、智慧建築 2016、2024 各至少一份。':'請業務主管上傳公司報價單作為範本。')+'</p>';
  else h+='<div class="tblwrap"><table class="items"><thead><tr><th>範本</th><th>類型</th><th>系統</th><th>上傳</th><th></th></tr></thead><tbody>'
    +L.map(function(t){ var sys=G.SYSTEMS.filter(function(S){ return t.data.sections.some(function(s){ return G.classify(s.name)===S.k; }); }).map(function(S){ return S.n; });
      return '<tr><td>'+esc(t.name)+'<br><span class="hint">'+esc(t.fileName||"")+'</span></td><td>'+(st.canEdit?'<select class="fld" data-qg-libsmart="'+esc(t.id)+'">'+Object.keys(SMART_LABEL).map(function(k){ return '<option value="'+k+'"'+(t.smart===k?" selected":"")+'>'+SMART_LABEL[k]+'</option>'; }).join("")+'</select>':esc(SMART_LABEL[t.smart]||""))+'</td>'
        +'<td style="max-width:360px">'+esc(sys.join("、"))+'</td><td class="hint">'+esc(T.userName(t.savedBy||""))+'<br>'+esc(T.fmtTime(t.savedAt))+'</td><td>'+(st.canEdit?'<button class="btn small danger" type="button" data-qg-librm="'+esc(t.id)+'">移除</button>':'')+'</td></tr>'; }).join("")+'</tbody></table></div>';
  if(st.canEdit) h+='<div class="uprow"><input type="file" id="qgLibFile" accept=".xlsx" multiple><select id="qgLibSmart" class="fld"><option value="">類型：自動判斷</option>'+Object.keys(SMART_LABEL).map(function(k){ return '<option value="'+k+'">'+SMART_LABEL[k]+'</option>'; }).join("")+'</select><button class="btn small primary" id="qgLibAdd" type="button">加入範本庫</button><span class="hint">報價單內容（含成本）只存在公司雲端，僅有報價權限的人看得到。</span></div>';
  return h+'</details>';
}
function outHtml(cur){
  var q=st.q, t=q.total, edit=T.canEdit();
  var flagged=0; q.sections.forEach(function(s){ s.items.forEach(function(it){ if(/請/.test(it.flag)) flagged++; }); });
  var h='<div class="kpis">'+kpi(money(t.price),"未稅總價")+kpi(money(t.gross),"含稅總價（5%）")+kpi(money(t.cost),"成本")+kpi(pct(t.margin),"毛利率",t.margin!==null&&t.margin<0.35?"warn":"")+kpi(flagged,"待確認數量",flagged?"warn":"")+'</div>';
  if(q.missing.length) h+='<div class="tipbox"><b>範本庫沒有</b>'+esc(q.missing.join("、"))+'，這些系統只列出空白段落，請手動新增項目或先上傳含這些系統的範本。</div>';
  if(q.unmatched.length) h+='<details class="mxwrap"'+(q.unmatched.length?" open":"")+'><summary>圖面有、報價單沒對到的設備（'+q.unmatched.length+'）</summary><p class="meta">可能是範本沒有的設備，或屬於配管、箱體等不在報價範圍內的項目。需要報價的請選擇段落後加入。</p><div class="tblwrap"><table class="items"><thead><tr><th>圖面設備</th><th>數量</th><th>加到段落</th><th></th></tr></thead><tbody>'
    +q.unmatched.map(function(u,i){ return '<tr><td>'+esc(u.name)+'</td><td>'+u.qty+'</td><td><select class="fld" data-qg-addsec="'+i+'">'+q.sections.map(function(s,j){ return '<option value="'+j+'"'+(s.sys===mapSys(u.sys)?" selected":"")+'>'+esc(s.no+" "+s.name)+'</option>'; }).join("")+'</select></td><td><button class="btn small" type="button" data-qg-add="'+i+'">加入</button></td></tr>'; }).join("")+'</tbody></table></div></details>';
  h+='<div class="tools" style="margin:10px 0"><button class="btn primary small" id="qgXls" type="button">下載報價單（Excel）</button><button class="btn small" id="qgXlsInt" type="button">下載內部成本版（Excel）</button>'
    +(edit?'<button class="btn small" id="qgSave" type="button">存為本案估價單</button>':'')+'<span class="hint">藍字＝圖面數量；橘字＝請確認</span></div>';
  q.sections.forEach(function(s,si){
    h+='<details class="mxwrap" open><summary><b>'+esc(s.no+"、"+s.name)+'</b>　'+money(s.price)+'　<span class="hint">毛利 '+pct(s.margin)+(s.source?'｜範本：'+esc(s.source.tname):'')+'</span></summary>'
      +'<div class="tblwrap"><table class="items qgtbl"><thead><tr><th>#</th><th>名稱</th><th>單位</th><th>數量</th><th>單價</th><th>複價</th><th>成本</th><th>備註（廠牌）</th><th></th></tr></thead><tbody>'
      +s.items.map(function(it,ii){
        var k=si+"-"+ii, fc=/^圖面/.test(it.flag)?"qg-d":/請/.test(it.flag)?"qg-w":"";
        return '<tr><td>'+it.no+'</td><td><input class="fld qgname" data-qg-it="'+k+'" data-f="name" value="'+esc(it.name)+'">'+(it.flag?'<div class="hint '+fc+'">'+esc(it.flag)+'</div>':'')+'</td>'
          +'<td><input class="fld" style="width:52px" data-qg-it="'+k+'" data-f="unit" value="'+esc(it.unit||"")+'"></td>'
          +'<td><input class="fld '+fc+'" type="number" min="0" step="any" style="width:78px" data-qg-it="'+k+'" data-f="qty" value="'+it.qty+'"></td>'
          +'<td><input class="fld" type="number" min="0" step="any" style="width:96px" data-qg-it="'+k+'" data-f="price" value="'+it.price+'"></td>'
          +'<td style="text-align:right">'+Math.round(it.amount).toLocaleString()+'</td>'
          +'<td><input class="fld" type="number" min="0" step="any" style="width:90px" data-qg-it="'+k+'" data-f="cost" value="'+it.cost+'"></td>'
          +'<td><input class="fld" style="min-width:140px" data-qg-it="'+k+'" data-f="brandSpec" value="'+esc(it.brandSpec||"")+'"></td>'
          +'<td><button class="btn small" type="button" data-qg-del="'+k+'" aria-label="刪除">×</button></td></tr>'; }).join("")
      +'</tbody></table></div><button class="btn small" type="button" data-qg-new="'+si+'">新增項目</button></details>';
  });
  h+='<h4 style="margin:14px 0 6px">附註</h4><textarea id="qgNotes" class="fld" rows="'+Math.max(4,q.notes.length+1)+'" style="width:100%">'+esc(q.notes.join("\n"))+'</textarea>';
  return h;
}
function kpi(n,l,cls){ return '<div class="kpi '+(cls||"")+'"><div class="n">'+esc(n)+'</div><div class="l">'+esc(l)+'</div></div>'; }
function mapSys(s){ return FROM_PROJECT[s]||s; }

/* ---------- 事件 ---------- */
function bind(cur,el,rerender,dr,reload){
  var P=$("qgenPanel"); if(!P) return;
  var re=function(){ var y=window.scrollY; rerender(); window.scrollTo(0,y); };
  if(!st.lib && !st.loading){
    st.loading=true;
    api("quoteLibGet").then(function(r){ st.lib=r.templates||[]; st.canEdit=!!r.canEdit; st.loading=false; re(); })
      .catch(function(e){ st.loading=false; st.lib=[]; fail(e); re(); });
    return;
  }
  P.querySelectorAll("[data-qg-tab]").forEach(function(b){ b.onclick=function(){ st.tab=b.dataset.qgTab; re(); }; });
  var o=st.opt, save=function(){ ls("qgen:"+cur.id,o); ls("qgen:hdr:"+((cur.project||{}).company||""),{company:o.meta.company,tel:o.meta.tel,fax:o.meta.fax,contact:o.meta.contact}); };
  P.querySelectorAll("[data-qg-meta]").forEach(function(i){ i.oninput=function(){ o.meta[i.dataset.qgMeta]=i.value.trim(); save(); }; });
  P.querySelectorAll("[data-qg-smart]").forEach(function(b){ b.onclick=function(){ o.smart=b.dataset.qgSmart; save(); re(); }; });
  if($("qgGrade")) $("qgGrade").onchange=function(){ o.grade=this.value; save(); };
  P.querySelectorAll("[data-qg-sys]").forEach(function(c){ c.onchange=function(){ var k=c.dataset.qgSys; o.systems=o.systems.filter(function(x){ return x!==k; }); if(c.checked) o.systems.push(k); save(); re(); }; });
  P.querySelectorAll("[data-qg-brand]").forEach(function(i){ i.oninput=function(){ o.brands[i.dataset.qgBrand]=i.value.trim(); save(); }; });
  P.querySelectorAll("[data-qg-src]").forEach(function(s){ s.onchange=function(){ if(s.value) o.sources[s.dataset.qgSrc]=s.value; else delete o.sources[s.dataset.qgSrc]; save(); }; });
  if($("qgBuild")) $("qgBuild").onclick=function(){
    if(!o.systems.length){ toast("請至少勾選一個系統"); return; }
    var d=dr||null;
    st.q=G.build({systems:o.systems,brands:o.brands,smart:o.smart,grade:o.grade,sources:o.sources,meta:Object.assign({},o.meta),drawing:(d&&d.items)||[],mapping:{}},st.lib);
    st.tab="out"; re(); toast("已產生報價單，請檢查橘字標示的數量");
  };
  /* 範本庫 */
  if($("qgLibAdd")) $("qgLibAdd").onclick=function(){
    var fs=Array.prototype.slice.call($("qgLibFile").files||[]); if(!fs.length){ toast("請先選擇報價單（.xlsx）"); return; }
    var forced=$("qgLibSmart").value, b=this; b.disabled=true;
    fs.reduce(function(pr,f){ return pr.then(function(){
      return f.arrayBuffer().then(XLSX_LITE.read).then(function(sheets){
        var q=QUOTE.parse(sheets); q.fileName=f.name;
        var name=(q.meta.project||f.name.replace(/\.xlsx$/i,"")).slice(0,80);
        return api("quoteLibSave",{add:{name:name,smart:forced||G.smartOf(q),fileName:f.name,data:q}}).then(function(r){ st.lib=r.templates; toast("已加入範本：「"+name+"」"); });
      }).catch(function(e){ toast("「"+f.name+"」無法加入："+(e.message||e)); });
    }); },Promise.resolve()).then(function(){ b.disabled=false; re(); });
  };
  P.querySelectorAll("[data-qg-librm]").forEach(function(b){ b.onclick=function(){
    var t=st.lib.filter(function(x){ return x.id===b.dataset.qgLibrm; })[0]; if(!t||!confirm("從範本庫移除「"+t.name+"」？")) return;
    api("quoteLibSave",{remove:t.id}).then(function(r){ st.lib=r.templates; toast("已移除"); re(); }).catch(fail); }; });
  P.querySelectorAll("[data-qg-libsmart]").forEach(function(s){ s.onchange=function(){
    api("quoteLibSave",{update:{id:s.dataset.qgLibsmart,smart:s.value}}).then(function(r){ st.lib=r.templates; toast("已更新範本類型"); re(); }).catch(fail); }; });
  /* 報價單編輯 */
  var q=st.q; if(!q) return;
  var itOf=function(k){ var a=k.split("-"); return {s:q.sections[+a[0]], i:+a[1]}; };
  P.querySelectorAll("[data-qg-it]").forEach(function(i){ i.onchange=function(){
    var r=itOf(i.dataset.qgIt), it=r.s.items[r.i], f=i.dataset.f;
    it[f]=/^(qty|price|cost)$/.test(f)?(Number(i.value)||0):i.value.trim();
    if(f==="qty") it.flag=it.flag&&/^圖面/.test(it.flag)?it.flag+"（已修改）":"";
    G.finalize(q); re(); }; });
  P.querySelectorAll("[data-qg-del]").forEach(function(b){ b.onclick=function(){ var r=itOf(b.dataset.qgDel); r.s.items.splice(r.i,1); G.finalize(q); re(); }; });
  P.querySelectorAll("[data-qg-new]").forEach(function(b){ b.onclick=function(){ q.sections[+b.dataset.qgNew].items.push({name:"",unit:"台",qty:1,price:0,cost:0,brandSpec:"",kind:"device",flag:"",tqty:0}); G.finalize(q); re(); }; });
  P.querySelectorAll("[data-qg-add]").forEach(function(b){ b.onclick=function(){
    var i=+b.dataset.qgAdd, u=q.unmatched[i], s=q.sections[+P.querySelector('[data-qg-addsec="'+i+'"]').value];
    s.items.push({name:u.name,unit:"台",qty:u.qty,price:0,cost:0,brandSpec:o.brands[s.sys]||"",kind:"device",flag:"圖面（請填單價）",tqty:0});
    q.unmatched.splice(i,1); G.finalize(q); re(); }; });
  if($("qgNotes")) $("qgNotes").onchange=function(){ q.notes=this.value.split("\n").map(function(x){ return x.replace(/^\d+[.、．]\s*/,"").trim(); }).filter(Boolean); };
  var fname=function(sfx){ return ((q.meta.project||"報價單")+"_報價單"+(sfx||"")+".xlsx").replace(/[\\\/:*?"<>|]/g,"_"); };
  var dl=function(internal){ var b=XLSX_WRITE.build(G.toSheets(q,{internal:internal})); var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([b],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})); a.download=fname(internal?"_內部成本":""); document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1500); };
  if($("qgXls")) $("qgXls").onclick=function(){ dl(false); };
  if($("qgXlsInt")) $("qgXlsInt").onclick=function(){ dl(true); };
  if($("qgSave")) $("qgSave").onclick=function(){
    if(!confirm("把這份報價單存為本案估價單？會取代目前已上傳的估價單，並用來做成本審查與圖面數量比對。")) return;
    var data={meta:{company:q.meta.company,client:q.meta.client,project:q.meta.project,date:q.meta.date,notes:q.notes},households:null,sheet:"自動生成",sections:q.sections,summary:q.summary,total:q.total,generated:true};
    api("analysisSave",{id:cur.id,kind:"quote",fileName:fname(),data:data}).then(function(){ toast("已存為本案估價單"); if(reload) reload(); }).catch(fail);
  };
}
T.quoteGen={html:html, bind:bind};
})();
