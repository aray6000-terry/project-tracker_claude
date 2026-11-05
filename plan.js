/* 弱電專案平台 — 週計畫（Last Planner／PPC）與測試驗收・竣工包（v2.10.30）
 * 資料存在專案資料夾「分析」：weekPlan.json、accept.json（後端 ANALYSIS_KINDS 需含 weekPlan、accept）
 */
(function(){
"use strict";
var T = window.TR; if(!T) return;
var esc=T.esc, api=T.api, toast=T.toast, fmt=T.fmt, fmtTime=T.fmtTime, fail=T.fail;
var $=function(id){ return document.getElementById(id); };
var U=function(){ return T.opsUtil||{}; };
function rid(){ return Math.random().toString(36).slice(2,10); }
function notDeployed(e){ return e && (e.code==="NOT_DEPLOYED" || /分析類別錯誤/.test(e.message||"")); }
var NEED_BACKEND='<section class="panel"><h3>需要更新後端</h3><p class="meta">此功能的資料存在專案資料夾「分析」（weekPlan.json、accept.json）。請管理員把 v2.10.31 的 Analysis.gs 貼到 Apps Script 並重新部署後再使用。</p></section>';

/* ---------- 共用：讀寫 JSON（分析資料夾） ---------- */
function loadKind(cur,kind){ return api("analysisOne",{id:cur.id,kind:kind}).then(function(r){ return (r&&r.data)||null; }); }
/* ---------- 多人編輯：版本檢查＋逐項合併（v2.10.31） ----------
 * 每個專案每類資料只有一個存檔器；送出時帶上次讀到的版本 baseRev，後端版本不同會回傳 CONFLICT 與最新內容，
 * 前端以「上次同步內容 base／我的內容 mine／別人的內容 theirs」三方合併：同一欄位兩人都改時以自己的為準，其餘都保留。
 */
function clone(o){ return o===undefined?undefined:JSON.parse(JSON.stringify(o)); }
function same(a,b){ return JSON.stringify(a)===JSON.stringify(b); }
function isObj(o){ return o!==null && typeof o==="object" && !Array.isArray(o); }
function keyOf(x){ return isObj(x) ? (x.id!==undefined?"id:"+x.id:x.k!==undefined?"k:"+x.k:null) : null; }
function keyedArr(a){ return Array.isArray(a) && a.every(function(x){ return keyOf(x)!==null; }); }
function merge3(b,m,t){
  if(same(m,b)) return clone(t);
  if(same(t,b)||same(m,t)) return clone(m);
  if(isObj(m)&&isObj(t)){
    var bo=isObj(b)?b:{}, r={}, ks={};
    Object.keys(m).concat(Object.keys(t),Object.keys(bo)).forEach(function(k){ ks[k]=1; });
    Object.keys(ks).forEach(function(k){ var v=merge3(bo[k],m[k],t[k]); if(v!==undefined) r[k]=v; });
    return r;
  }
  if(keyedArr(m)&&keyedArr(t)&&(b===undefined||keyedArr(b))){
    var idx=function(a){ var o={}; (a||[]).forEach(function(x){ o[keyOf(x)]=x; }); return o; };
    var B=idx(b), M=idx(m), Tt=idx(t), out=[], seen={};
    t.concat(m).forEach(function(x){
      var k=keyOf(x); if(seen[k]) return; seen[k]=1;
      var bi=B[k], mi=M[k], ti=Tt[k];
      if(bi!==undefined && mi===undefined && (ti===undefined||same(ti,bi))) return;   /* 我刪除 */
      if(bi!==undefined && ti===undefined && (mi===undefined||same(mi,bi))) return;   /* 別人刪除且我沒改 */
      var v=mi===undefined?clone(ti):ti===undefined?clone(mi):merge3(bi,mi,ti);
      if(v!==undefined) out.push(v);
    });
    return out;
  }
  return clone(m);   /* 同一欄位兩人都改：以自己的為準 */
}
T.merge3=merge3;
var SV={};
function syncInit(cur,kind,data){ SV[cur.id+":"+kind]={base:clone(data||{}),rev:Number(data&&data.rev)||0,busy:false,again:false,t:null,tries:0}; }
/** 取得存檔器：getData／setData 讀寫目前內容，onMerged 在合併別人的修改後重繪畫面 */
function makeSaver(cur,kind,getData,setData,onMerged,stateEl){
  var key=cur.id+":"+kind; if(!SV[key]) syncInit(cur,kind,getData());
  var S=SV[key]; S.get=getData; S.set=setData; S.onMerged=onMerged; S.stateEl=stateEl;
  function show(x){ var e=$(S.stateEl); if(e) e.textContent=x; }
  function flush(){
    if(S.busy){ S.again=true; return; }
    S.busy=true; show("儲存中…");
    var snap=clone(S.get()); snap.v=1; if(kind==="accept") snap.total=allTests(cur.project,snap).length;
    api("analysisSave",{id:cur.id,kind:kind,data:snap,baseRev:S.rev}).then(function(r){
      S.busy=false; S.tries=0; S.base=snap; if(r&&r.rev!==undefined) S.rev=r.rev;
      show("已儲存 "+fmtTime(new Date().toISOString()).split(" ")[1]);
      if(S.again){ S.again=false; flush(); }
    },function(e){
      S.busy=false;
      if(e&&e.code==="CONFLICT"&&e.data&&S.tries<3){
        S.tries++;
        var theirs=e.data.data||{}, merged=merge3(S.base,S.get(),theirs);
        S.set(merged); S.base=clone(theirs); S.rev=Number(e.data.rev)||0;
        toast("其他人剛更新了這份資料，已合併雙方的修改"); show("合併中…");
        if(S.onMerged) S.onMerged();
        flush(); return;
      }
      S.tries=0; show("儲存失敗"); fail(e);
    });
  }
  return function(delay){ show("尚未儲存…"); clearTimeout(S.t); S.t=setTimeout(flush, delay===undefined?1200:delay); };
}
/** 重繪時保留游標位置（合併別人的修改後重繪，避免打字中斷） */
function rerenderKeep(el,fn){
  var a=document.activeElement, sel=null, pos=null;
  if(a&&el.contains(a)){
    var attrs=["data-wp","data-ac","data-co","data-f","data-pre"].filter(function(n){ return a.hasAttribute(n); });
    if(attrs.length){ sel=a.tagName.toLowerCase()+attrs.map(function(n){ return '['+n+'="'+String(a.getAttribute(n)).replace(/"/g,'\\"')+'"]'; }).join(""); try{ pos=a.selectionStart; }catch(e){} }
  }
  fn();
  if(sel){ var b=el.querySelector(sel); if(b){ b.focus(); try{ if(pos!==null) b.setSelectionRange(pos,pos); }catch(e){} } }
}

/* ======================== 週計畫（Last Planner System） ======================== */
var PRE=[["dwg","圖面／送審"],["mat","材料到場"],["itf","介面完成"],["crew","人力到位"]];
var REASONS=["圖面未定或變更","材料未到","前置工項（營造、水電）未完成","人力不足","業主／營造變更","天候","設備故障或缺料","估計工時不足","其他"];
var wp={pid:null,data:null,week:null};
function mondayOf(iso){ var d=new Date(iso+"T00:00:00Z"), dow=(d.getUTCDay()+6)%7; d.setUTCDate(d.getUTCDate()-dow); return d.toISOString().slice(0,10); }
function addW(iso,n){ var d=new Date(iso+"T00:00:00Z"); d.setUTCDate(d.getUTCDate()+7*n); return d.toISOString().slice(0,10); }
function weekTxt(mon){ var e=new Date(mon+"T00:00:00Z"); e.setUTCDate(e.getUTCDate()+6); return fmt(mon)+"～"+fmt(e.toISOString().slice(0,10)).slice(5); }
function committed(it){ return PRE.every(function(p){ return it.pre&&it.pre[p[0]]; }); }
/** PPC：承諾（前置條件全備齊）的工項中，本週完成的比例 */
function ppcOf(items){
  var c=(items||[]).filter(committed), d=c.filter(function(it){ return it.done; }).length;
  return {n:c.length, done:d, pct:c.length?Math.round(d/c.length*100):null, all:(items||[]).length};
}
T.ppcOf=ppcOf;
/** 由專案摘要（後端彙總 summary.ppc）取本週與上週 PPC：{pct,n,done,last} */
T.ppcFromSummary=function(sm){
  var m=sm&&sm.ppc; if(!m) return null;
  var w=mondayOf(T.today()), f=function(a){ return a&&a[0]?Math.round(a[1]/a[0]*100):null; };
  var cur=m[w], prev=m[addW(w,-1)];
  if(!cur&&!prev) return null;
  return {pct:f(cur), n:cur?cur[0]:0, done:cur?cur[1]:0, last:f(prev)};
};

T.views.planTab=function(cur,el){
  if(wp.pid!==cur.id){ wp={pid:cur.id,data:null,week:mondayOf(T.today())}; }
  el.innerHTML='<div class="loading">讀取中…</div>';
  loadKind(cur,"weekPlan").then(function(d){ wp.data=d&&d.weeks?d:{weeks:{}}; syncInit(cur,"weekPlan",wp.data); renderPlan(cur,el); })
    .catch(function(e){ el.innerHTML=notDeployed(e)?NEED_BACKEND:'<div class="empty">'+esc(e.message)+'</div>'; });
};
function renderPlan(cur,el){
  var p=cur.project, edit=T.canEdit(), wk=wp.week, items=wp.data.weeks[wk]||[], pc=ppcOf(items);
  var save=makeSaver(cur,"weekPlan",function(){ return wp.data; },function(v){ v.weeks=v.weeks||{}; wp.data=v; },function(){ if($("wpState")) rerenderKeep(el,function(){ renderPlan(cur,el); }); },"wpState");
  var ks=T.sysList(p);
  var sysOpt=function(sel){ return '<option value="">共用</option>'+ks.map(function(k){ return '<option value="'+esc(k)+'"'+(k===sel?" selected":"")+'>'+esc(T.sysName(p,k))+'</option>'; }).join(""); };
  var h='<section class="panel"><div class="row" style="flex-wrap:wrap"><h3>週工作計畫（Last Planner）</h3><span class="meta" id="wpState"></span></div>'
    +'<p class="meta">每週列出下週要做的工項，前置條件（圖面、材料、介面、人力）<b>全部備齊才算「承諾」</b>。週末勾選完成與否，沒做完要選原因。<b>PPC（計畫完成率）＝承諾工項中完成的比例</b>，一般目標 80% 以上；原因統計用來找出卡關的根源。</p>'
    +'<div class="uprow"><button class="btn small" id="wpPrev" type="button">← 上週</button><b>'+esc(weekTxt(wk))+'</b><button class="btn small" id="wpNext" type="button">下週 →</button>'
    +(wk!==mondayOf(T.today())?'<button class="btn small" id="wpNow" type="button">回本週</button>':'')
    +(edit?'<button class="btn small" id="wpCopy" type="button">帶入上週未完成</button><button class="btn small primary" id="wpAdd" type="button">＋ 新增工項</button>':'')
    +'<button class="btn small" id="wpPrint" type="button">列印</button></div>'
    +'<div class="kpis">'+kpi(pc.pct===null?"—":pc.pct+"%","本週 PPC",pc.pct!==null&&pc.pct<60?"bad":pc.pct!==null&&pc.pct<80?"warn":"")+kpi(pc.n+" / "+pc.all,"承諾工項／全部工項")+kpi(pc.done,"已完成（承諾）")+'</div>';
  if(!items.length) h+='<p class="meta">本週尚未排定工項。'+(edit?'按「新增工項」或「帶入上週未完成」。':'')+'</p>';
  else{
    h+='<div class="tblwrap"><table class="cards"><thead><tr><th>#</th><th>工項（地點、數量）</th><th>系統</th><th>負責人</th><th>前置條件</th><th>承諾</th><th>完成</th><th>未完成原因</th><th></th></tr></thead><tbody>';
    items.forEach(function(it,i){
      var dis=edit?"":" disabled", cm=committed(it);
      h+='<tr><td data-label="#">'+(i+1)+'</td>'
        +'<td data-label="工項"><input type="text" class="fld" maxlength="120" style="min-width:220px;width:100%" data-wp="'+i+'" data-f="task" value="'+esc(it.task||"")+'" placeholder="例：5F 讀卡機安裝 12 組"'+dis+'></td>'
        +'<td data-label="系統"><select class="fld" data-wp="'+i+'" data-f="sys"'+dis+'>'+sysOpt(it.sys)+'</select></td>'
        +'<td data-label="負責人"><input type="text" class="fld" maxlength="30" style="width:90px" data-wp="'+i+'" data-f="who" value="'+esc(it.who||"")+'"'+dis+'></td>'
        +'<td data-label="前置條件">'+PRE.map(function(q){ return '<label class="pick"><input type="checkbox" data-wp="'+i+'" data-pre="'+q[0]+'"'+(it.pre&&it.pre[q[0]]?" checked":"")+dis+'>'+q[1]+'</label>'; }).join("")+'</td>'
        +'<td data-label="承諾">'+(cm?'<span class="badge b-ok">承諾</span>':'<span class="badge b-idle">未備齊</span>')+'</td>'
        +'<td data-label="完成"><label class="pick"><input type="checkbox" data-wp="'+i+'" data-f="done"'+(it.done?" checked":"")+dis+'>完成</label></td>'
        +'<td data-label="未完成原因">'+(it.done?'<span class="meta">—</span>':'<select class="fld" data-wp="'+i+'" data-f="reason"'+dis+'><option value="">（未選）</option>'+REASONS.map(function(r){ return '<option'+(it.reason===r?" selected":"")+'>'+esc(r)+'</option>'; }).join("")+'</select>'
          +'<input type="text" class="fld" maxlength="120" style="margin-top:4px;width:100%" data-wp="'+i+'" data-f="note" value="'+esc(it.note||"")+'" placeholder="說明"'+dis+'>')+'</td>'
        +'<td class="act">'+(edit?'<button class="btn small danger" type="button" data-wpdel="'+i+'">刪除</button>':'')+'</td></tr>';
    });
    h+='</tbody></table></div>';
  }
  h+='</section>'+trendHtml();
  el.innerHTML=h;

  var re=function(){ renderPlan(cur,el); };
  $("wpPrev").onclick=function(){ wp.week=addW(wp.week,-1); re(); };
  $("wpNext").onclick=function(){ wp.week=addW(wp.week,1); re(); };
  if($("wpNow")) $("wpNow").onclick=function(){ wp.week=mondayOf(T.today()); re(); };
  $("wpPrint").onclick=function(){ printPlan(p,wk,items); };
  if(!edit) return;
  var list=function(){ if(!wp.data.weeks[wk]) wp.data.weeks[wk]=[]; return wp.data.weeks[wk]; };
  $("wpAdd").onclick=function(){ list().push({id:rid(),task:"",sys:"",who:"",pre:{},done:false,reason:"",note:""}); save(); re(); };
  $("wpCopy").onclick=function(){
    var prev=(wp.data.weeks[addW(wk,-1)]||[]).filter(function(it){ return !it.done; });
    if(!prev.length){ toast("上週沒有未完成的工項"); return; }
    var have={}; list().forEach(function(it){ if(it.from) have[it.from]=1; });
    var add=prev.filter(function(it){ return !have[it.id]; });
    add.forEach(function(it){ list().push({id:rid(),from:it.id,task:it.task,sys:it.sys,who:it.who,pre:{},done:false,reason:"",note:""}); });
    toast(add.length?"已帶入 "+add.length+" 項（前置條件需重新確認）":"上週未完成的工項都已帶入"); save(); re();
  };
  el.querySelectorAll("[data-wpdel]").forEach(function(b){ b.onclick=function(){ var it=list()[+b.dataset.wpdel]; if(it.task&&!confirm("刪除「"+it.task+"」？")) return; list().splice(+b.dataset.wpdel,1); save(); re(); }; });
  el.querySelectorAll("[data-wp]").forEach(function(inp){
    var it=list()[+inp.dataset.wp];
    if(inp.dataset.pre){ inp.onchange=function(){ it.pre=it.pre||{}; it.pre[inp.dataset.pre]=inp.checked; save(); re(); }; return; }
    var f=inp.dataset.f;
    if(f==="done"){ inp.onchange=function(){ it.done=inp.checked; if(it.done){ it.reason=""; } save(); re(); }; return; }
    if(inp.tagName==="SELECT"){ inp.onchange=function(){ it[f]=inp.value; save(); }; return; }
    inp.oninput=function(){ it[f]=inp.value; save(1500); };
  });
}
function kpi(n,l,cls){ return '<div class="kpi '+(cls||"")+'"><div class="n">'+esc(n)+'</div><div class="l">'+esc(l)+'</div></div>'; }
/** 近 8 週 PPC 趨勢與未完成原因統計 */
function trendHtml(){
  var now=mondayOf(T.today()), rows=[], why={};
  for(var i=7;i>=0;i--){ var w=addW(now,-i), its=wp.data.weeks[w]||[], pc=ppcOf(its); rows.push([w,pc]);
    its.forEach(function(it){ if(committed(it)&&!it.done) why[it.reason||"（未填原因）"]=(why[it.reason||"（未填原因）"]||0)+1; }); }
  var ws=Object.keys(why).sort(function(a,b){ return why[b]-why[a]; }), tot=ws.reduce(function(a,k){ return a+why[k]; },0);
  var h='<section class="panel"><h3>近 8 週 PPC 與未完成原因</h3><div class="tblwrap"><table><thead><tr><th>週</th><th>承諾</th><th>完成</th><th>PPC</th><th style="width:40%"></th></tr></thead><tbody>'
    +rows.map(function(r){ var pc=r[1]; return '<tr><td>'+esc(weekTxt(r[0]))+'</td><td>'+pc.n+'</td><td>'+pc.done+'</td><td>'+(pc.pct===null?'<span class="meta">—</span>':'<b'+(pc.pct<60?' style="color:var(--bad)"':'')+'>'+pc.pct+'%</b>')+'</td>'
      +'<td>'+(pc.pct===null?'':'<div class="bar'+(pc.pct>=80?' ok':'')+'"><i style="width:'+pc.pct+'%"></i></div>')+'</td></tr>'; }).join("")+'</tbody></table></div>';
  h+=ws.length?'<h4 style="margin-top:12px">未完成原因（承諾但沒做完，共 '+tot+' 項）</h4><ul class="list">'+ws.map(function(k){ return '<li><div class="main"><b>'+esc(k)+'</b></div><span class="meta">'+why[k]+' 項（'+Math.round(why[k]/tot*100)+'%）</span></li>'; }).join("")+'</ul>'
    :'<p class="meta">近 8 週沒有承諾後未完成的工項。</p>';
  return h+'</section>';
}
function printPlan(p,wk,items){
  var pc=ppcOf(items), pr=U().printHtml; if(!pr){ window.print(); return; }
  pr("週工作計畫 "+p.name+" "+wk,'<h1>週工作計畫｜'+esc(p.name)+'</h1><p class="meta">週別：'+esc(weekTxt(wk))+'｜PPC：'+(pc.pct===null?"—":pc.pct+"%")+'（承諾 '+pc.n+' 項，完成 '+pc.done+' 項）</p>'
    +'<table><thead><tr><th>#</th><th>工項</th><th>系統</th><th>負責人</th><th>前置條件</th><th>承諾</th><th>完成</th><th>未完成原因</th></tr></thead><tbody>'
    +items.map(function(it,i){ return '<tr><td>'+(i+1)+'</td><td>'+esc(it.task)+'</td><td>'+esc(it.sys?T.sysName(p,it.sys):"共用")+'</td><td>'+esc(it.who)+'</td><td>'+PRE.map(function(q){ return (it.pre&&it.pre[q[0]]?"☑":"☐")+q[1]; }).join(" ")+'</td><td>'+(committed(it)?"是":"否")+'</td><td>'+(it.done?"✓":"")+'</td><td>'+esc(it.done?"":(it.reason||"")+(it.note?"："+it.note:""))+'</td></tr>'; }).join("")
    +'</tbody></table><div class="sign"><div>現場負責人</div><div>工務主管</div></div>');
}

/* ======================== 測試驗收（FAT／SAT）與竣工資料包 ======================== */
/* 測試項目範本：key 不可重複、不可改（改了舊紀錄會對不到）；F＝單機／出廠測試（FAT），S＝現場系統整合測試（SAT） */
var TESTS={
  access:[["a1","F","讀卡機讀卡反應","有效卡 1 秒內開門，無效卡拒絕並記錄"],["a2","F","電鎖、出門按鈕動作","電鎖吸合正常，出門按鈕可開門"],["a3","F","門位偵測","開門過久、強行開門產生警報"],
    ["a4","S","權限群組與時段","不同群組、時段權限正確"],["a5","S","消防連動釋放","消防信號送出後門鎖全部釋放"],["a6","S","斷電釋放（Fail-safe）","主電源中斷時逃生門可開啟"],["a7","S","事件紀錄上傳","管理電腦即時收到進出與警報紀錄"]],
  cctv:[["c1","F","畫面與解析度","解析度、幀率符合合約規範"],["c2","F","視角與焦距","監視範圍符合設備配置圖"],["c3","F","夜視／低照度","夜間畫面可辨識人員"],
    ["c4","S","錄影天數","依實際碼率試算可錄天數符合規範"],["c5","S","時間同步","全部攝影機與 NVR 時間一致"],["c6","S","回放與匯出","可依時間查詢回放並匯出影片"],["c7","S","斷電續錄（UPS）","斷電期間持續錄影、復電自動恢復"],["c8","S","遠端觀看","管理中心／手機可即時觀看"]],
  intercom:[["n1","F","室內機通話","逐戶通話清晰、無雜音"],["n2","F","開門功能","室內機可開啟大門／小門口機門鎖"],["n3","S","管理中心呼叫","管理中心可呼叫各戶、各戶可呼叫管理中心"],
    ["n4","S","緊急求救","按下求救鈕，管理中心即時顯示戶別並警報"],["n5","S","防盜保全回報","磁簧、感知器觸發時管理中心收到警報"],["n6","S","訪客留影","訪客影像可留存並於室內機查看"]],
  bms:[["b1","F","DI 逐點測試","依 IO 點位表逐點觸發，畫面狀態正確"],["b2","F","DO 逐點測試","依 IO 點位表逐點控制，現場設備動作正確"],["b3","F","AI 讀值校正","讀值與現場儀表誤差在允許範圍"],
    ["b4","S","通訊整合讀值","電表、消防、空調、電梯等整合讀值正確"],["b5","S","警報畫面與聲響","警報彈出、聲響、確認流程正確"],["b6","S","歷史趨勢與報表","趨勢圖、報表可查詢匯出"],["b7","S","斷電復電","復電後系統自動啟動並恢復監控"],["b8","S","時間同步","主機與各控制器時間一致"]],
  parking:[["k1","F","柵欄起落","柵欄機起落順暢，時間符合規範"],["k2","F","防砸車","車輛在柵欄下時不會落桿"],["k3","S","車牌辨識率","實測辨識率達合約要求（例 95% 以上）"],
    ["k4","S","月租／臨停計費","月租車自動放行，臨停計費正確"],["k5","S","繳費機","現金／電子支付繳費、找零與發票正常"],["k6","S","斷電手動開啟","斷電時可手動開啟柵欄"]],
  visitor:[["v1","F","訪客登記","登記資料、照片正確存檔"],["v2","S","發卡／QR 碼權限","訪客卡或 QR 碼可通行指定區域"],["v3","S","權限到期","到期後自動失效"]]
};
var TEST_GENERIC=[["g1","F","設備單機功能","各設備單機動作正常"],["g2","S","系統功能","系統畫面、操作、紀錄正常"],["g3","S","介面連動","與其他系統連動、通訊正常"],["g4","S","斷電復電","斷電復電後自動恢復"]];
var CLOSEOUT=[["asbuilt","竣工圖（As-built）",1],["om","設備操作維護手冊（O&M）",1],["test","測試驗收紀錄（本頁列印）",1],["warranty","保固書（含保固起算日）",1],
  ["factory","設備出廠證明／合格證",1],["train","教育訓練簽到表",1],["account","帳號密碼移交清冊",1],["spare","備品移交清冊",0],["iplist","IP 位址表",0],["iolist","IO 點位表",0]];
var RES_LABEL={pass:["合格","b-ok"],fail:["不合格","b-bad"],na:["不適用","b-idle"],"":["未測","b-warn"]};
var ac={pid:null,data:null,sys:null,files:[]};
function testsOf(k){ var base=String(k).split(".")[0]; return TESTS[base]||TEST_GENERIC; }
function allTests(p,d){
  var out=[];
  T.sysList(p).forEach(function(k){
    testsOf(k).forEach(function(t){ out.push({sys:k,key:t[0],stage:t[1],item:t[2],exp:t[3]}); });
    ((d.custom||{})[k]||[]).forEach(function(t){ out.push({sys:k,key:t.k,stage:t.s||"S",item:t.t,exp:t.e||"",custom:1}); });
  });
  ((d.io)||[]).forEach(function(t){ out.push({sys:"bms",key:"io:"+t.k,stage:"F",item:t.t,exp:t.e||"",io:1}); });
  return out;
}
function resOf(d,t){ return ((d.tests||{})[t.sys]||{})[t.key]||{}; }
/** 驗收狀態摘要：未測、不合格、竣工包缺項 */
function acceptSummary(p,d,files){
  var ts=allTests(p,d), un=0, ng=0, ok=0;
  ts.forEach(function(t){ var r=resOf(d,t).res||""; if(r==="fail") ng++; else if(r==="pass"||r==="na") ok++; else un++; });
  var miss=CLOSEOUT.filter(function(c){ return c[2] && !(((d.closeout||{})[c[0]]||{}).ok); });
  return {total:ts.length,untested:un,fail:ng,ok:ok,miss:miss};
}
function docFiles(files,key){ var tag="［竣工 "+key+"］"; return (files||[]).filter(function(f){ return String(f.caption||"").indexOf(tag)===0; }); }

T.views.acceptTab=function(cur,el){
  if(ac.pid!==cur.id){ ac={pid:cur.id,data:null,sys:null,files:[]}; }
  el.innerHTML='<div class="loading">讀取中…</div>';
  Promise.all([loadKind(cur,"accept"), api("files",{id:cur.id,kind:"drawing"}).then(function(r){ return r.files||[]; },function(){ return []; })])
    .then(function(r){ var d=r[0]||{}; d.tests=d.tests||{}; d.custom=d.custom||{}; d.closeout=d.closeout||{}; d.io=d.io||[]; ac.data=d; ac.files=r[1]; syncInit(cur,"accept",r[0]||{}); renderAccept(cur,el); })
    .catch(function(e){ el.innerHTML=notDeployed(e)?NEED_BACKEND:'<div class="empty">'+esc(e.message)+'</div>'; });
};
function renderAccept(cur,el){
  var p=cur.project, d=ac.data, edit=T.canEdit(), ks=T.sysList(p), sm=acceptSummary(p,d,ac.files);
  var save=makeSaver(cur,"accept",function(){ return ac.data; },function(v){ ["tests","custom","closeout"].forEach(function(k){ v[k]=v[k]||{}; }); v.io=v.io||[]; ac.data=v; },function(){ if($("acState")) rerenderKeep(el,function(){ renderAccept(cur,el); }); },"acState");
  if(!ac.sys||ks.indexOf(ac.sys)<0) ac.sys=ks[0]||null;
  var h='<section class="panel"><div class="row" style="flex-wrap:wrap"><h3>測試驗收（FAT／SAT）</h3><span class="meta" id="acState"></span></div>'
    +'<p class="meta"><b>FAT（單機測試）</b>：設備安裝後逐台測試；<b>SAT（系統整合測試）</b>：現場與其他系統連動、斷電復電等整合測試。逐項記錄實測結果，不合格要登記到「品管・缺失」改善後重測。全部測完、竣工包必備文件齊全，才能把專案標記為結案。</p>'
    +'<div class="kpis">'+kpi(sm.ok+" / "+sm.total,"已測（含不適用）")+kpi(sm.untested,"未測",sm.untested?"warn":"")+kpi(sm.fail,"不合格",sm.fail?"bad":"")+kpi(CLOSEOUT.filter(function(c){return c[2];}).length-sm.miss.length+" / "+CLOSEOUT.filter(function(c){return c[2];}).length,"竣工包必備文件",sm.miss.length?"warn":"")+'</div>';
  if(!ks.length){ h+='<p class="meta">專案尚未選擇建置系統，請先在「施工進度 → 編輯專案資料」勾選系統。</p></section>'; }
  else{
    h+='<div class="uprow"><select class="fld" id="acSys">'+ks.map(function(k){ var c=allTests(p,d).filter(function(t){ return t.sys===k; }), done=c.filter(function(t){ var r=resOf(d,t).res; return r==="pass"||r==="na"; }).length;
        return '<option value="'+esc(k)+'"'+(k===ac.sys?" selected":"")+'>'+esc(T.sysLabel(p,k))+'（'+done+'/'+c.length+'）</option>'; }).join("")+'</select>'
      +'<button class="btn small" id="acPrint" type="button">列印測試紀錄</button>'
      +(edit&&String(ac.sys).split(".")[0]==="bms"?'<button class="btn small" id="acIo" type="button">從 IO 點位表帶入測試點</button>':'')+'</div>';
    var ts=allTests(p,d).filter(function(t){ return t.sys===ac.sys; });
    h+='<div class="tblwrap"><table class="cards"><thead><tr><th>階段</th><th>測試項目</th><th>預期結果</th><th>判定</th><th>實測值／說明</th><th>測試日期</th><th>測試人</th>'+(edit?'<th></th>':'')+'</tr></thead><tbody>'
      +ts.map(function(t){
        var r=resOf(d,t), dis=edit?"":" disabled", id=esc(t.sys)+"|"+esc(t.key);
        return '<tr><td data-label="階段"><span class="badge '+(t.stage==="F"?"b-run":"b-warn")+'">'+(t.stage==="F"?"FAT 單機":"SAT 整合")+'</span></td>'
          +'<td data-label="測試項目">'+esc(t.item)+(t.io?' <span class="meta">（IO）</span>':'')+'</td><td data-label="預期結果" class="meta">'+esc(t.exp)+'</td>'
          +'<td data-label="判定"><select class="fld" data-ac="'+id+'" data-f="res"'+dis+'>'+["","pass","fail","na"].map(function(v){ return '<option value="'+v+'"'+((r.res||"")===v?" selected":"")+'>'+RES_LABEL[v][0]+'</option>'; }).join("")+'</select></td>'
          +'<td data-label="實測值"><input type="text" class="fld" maxlength="160" style="min-width:160px;width:100%" data-ac="'+id+'" data-f="val" value="'+esc(r.val||"")+'"'+dis+'></td>'
          +'<td data-label="測試日期"><input type="date" class="fld" data-ac="'+id+'" data-f="date" value="'+esc(r.date||"")+'"'+dis+'></td>'
          +'<td data-label="測試人" class="meta">'+esc(r.by?T.userName(r.by):"—")+'</td>'
          +(edit?'<td class="act">'+(r.res==="fail"?'<button class="btn small" type="button" data-acpunch="'+id+'">登記缺失</button>':'')+(t.custom||t.io?'<button class="btn small danger" type="button" data-acdel="'+id+'">刪除</button>':'')+'</td>':'')+'</tr>';
      }).join("")+'</tbody></table></div>';
    if(edit) h+='<div class="uprow" style="margin-top:8px"><select class="fld" id="acNewS"><option value="F">FAT 單機</option><option value="S" selected>SAT 整合</option></select><input type="text" class="fld" id="acNewT" maxlength="80" placeholder="自訂測試項目" style="flex:1;min-width:180px"><input type="text" class="fld" id="acNewE" maxlength="120" placeholder="預期結果" style="flex:1;min-width:160px"><button class="btn small" id="acNewAdd" type="button">新增項目</button></div>';
    h+='</section>';
  }
  /* 竣工資料包 */
  h+='<section class="panel"><h3>竣工資料包</h3><p class="meta">必備文件（★）都確認齊全才能結案。可直接上傳檔案（存在專案「圖面」資料夾，說明自動標示「竣工」），或註明存放位置後勾選「已齊全」。</p><ul class="list">'
    +CLOSEOUT.map(function(c){
      var v=(d.closeout||{})[c[0]]||{}, fs=docFiles(ac.files,c[0]), dis=edit?"":" disabled";
      return '<li><div class="main"><b>'+(c[2]?'★ ':'')+esc(c[1])+'</b><span class="meta">'+(fs.length?fs.map(function(f){ return '<button type="button" class="btn small" data-dl="'+esc(f.id)+'">'+esc(f.name)+'</button>'; }).join(" "):'尚未上傳')+(v.ok?'｜'+esc(T.userName(v.by))+' '+fmtTime(v.at)+' 確認':'')+'</span>'
        +'<input type="text" class="fld" maxlength="160" style="display:block;margin-top:4px;width:100%;max-width:460px" data-co="'+c[0]+'" data-f="note" value="'+esc(v.note||"")+'" placeholder="備註（例：紙本已交管委會，簽收單在合約資料夾）"'+dis+'></div>'
        +(edit?'<button class="btn small" type="button" data-coup="'+c[0]+'">上傳</button>':'')
        +'<label class="pick"><input type="checkbox" data-co="'+c[0]+'" data-f="ok"'+(v.ok?" checked":"")+dis+'>已齊全</label></li>';
    }).join("")+'</ul><input type="file" id="acFile" multiple hidden></section>';
  el.innerHTML=h;

  var re=function(){ renderAccept(cur,el); };
  if(U().bindFiles) U().bindFiles(el,cur,re);
  if($("acSys")) $("acSys").onchange=function(){ ac.sys=this.value; re(); };
  if($("acPrint")) $("acPrint").onclick=function(){ printAccept(p,d); };
  if(!edit) return;
  var slot=function(id){ var k=id.split("|"); d.tests[k[0]]=d.tests[k[0]]||{}; return d.tests[k[0]][k[1]]=d.tests[k[0]][k[1]]||{}; };
  el.querySelectorAll("[data-ac]").forEach(function(inp){
    var f=inp.dataset.f, id=inp.dataset.ac;
    var set=function(){ var r=slot(id); r[f]=inp.value; r.by=T.session.me.email; r.at=new Date().toISOString(); if(f==="res"&&inp.value&&!r.date) r.date=T.today(); };
    if(f==="val"){ inp.oninput=function(){ set(); save(1500); }; }
    else inp.onchange=function(){ set(); save(); if(f==="res") re(); };
  });
  el.querySelectorAll("[data-acdel]").forEach(function(b){ b.onclick=function(){
    var k=b.dataset.acdel.split("|");
    if(k[1].indexOf("io:")===0) d.io=d.io.filter(function(x){ return "io:"+x.k!==k[1]; });
    else d.custom[k[0]]=(d.custom[k[0]]||[]).filter(function(x){ return x.k!==k[1]; });
    if(d.tests[k[0]]) delete d.tests[k[0]][k[1]]; save(); re(); }; });
  el.querySelectorAll("[data-acpunch]").forEach(function(b){ b.onclick=function(){
    var k=b.dataset.acpunch.split("|"), t=allTests(p,d).filter(function(x){ return x.sys===k[0]&&x.key===k[1]; })[0], r=slot(b.dataset.acpunch);
    api("punchSave",{id:cur.id,item:{loc:"",sys:k[0].slice(0,30),desc:"測試不合格："+(t?t.item:k[1])+(r.val?"（"+r.val+"）":""),owner:"",due:""}})
      .then(function(r){ toast("已登記缺失 "+((r&&r.id)||"")+"，改善後請重測"); }).catch(fail); }; });
  if($("acNewAdd")) $("acNewAdd").onclick=function(){
    var t=$("acNewT").value.trim(); if(!t){ toast("請輸入測試項目"); return; }
    (d.custom[ac.sys]=d.custom[ac.sys]||[]).push({k:"u"+rid(),s:$("acNewS").value,t:t.slice(0,80),e:$("acNewE").value.trim().slice(0,120)}); save(); re(); };
  if($("acIo")) $("acIo").onclick=function(){
    var b=this; b.disabled=true; b.textContent="讀取 IO 點位表…";
    (T.ioPoints?T.ioPoints(cur):Promise.resolve(null)).then(function(rows){
      b.disabled=false; b.textContent="從 IO 點位表帶入測試點";
      if(!rows||!rows.length){ toast("找不到 IO 點位表，請先到「設計・編表」產生"); return; }
      var have={}, n=0; d.io.forEach(function(x){ have[x.k]=1; });
      rows.forEach(function(r){ if(have[r.k]) return; d.io.push(r); n++; });
      toast(n?"已帶入 "+n+" 個 IO 測試點":"IO 測試點都已帶入"); if(n){ save(0); re(); }
    }).catch(function(e){ b.disabled=false; b.textContent="從 IO 點位表帶入測試點"; fail(e); });
  };
  el.querySelectorAll("[data-co]").forEach(function(inp){
    var k=inp.dataset.co, f=inp.dataset.f, v=function(){ return d.closeout[k]=d.closeout[k]||{}; };
    if(f==="ok") inp.onchange=function(){ var o=v(); o.ok=inp.checked; o.by=T.session.me.email; o.at=new Date().toISOString(); save(0); re(); };
    else inp.oninput=function(){ v().note=inp.value; save(1500); };
  });
  el.querySelectorAll("[data-coup]").forEach(function(b){ b.onclick=function(){
    var k=b.dataset.coup, c=CLOSEOUT.filter(function(x){ return x[0]===k; })[0], inp=$("acFile"); inp.value="";
    inp.onchange=function(){ if(!inp.files.length||!U().uploadFiles) return; U().uploadFiles(cur,"drawing",inp.files,{node:6,caption:"［竣工 "+k+"］"+c[1]},function(){ T.views.acceptTab(cur,el); }); };
    inp.click(); }; });
}
function printAccept(p,d){
  var pr=U().printHtml; if(!pr){ window.print(); return; }
  var ts=allTests(p,d), sm=acceptSummary(p,d,ac.files);
  pr("測試驗收紀錄 "+p.name,'<h1>測試驗收紀錄｜'+esc(p.name)+'</h1><p class="meta">業主：'+esc(p.client||"—")+'｜案場：'+esc(p.site||"—")+'｜列印日期：'+esc(fmt(T.today()))+'｜已測 '+sm.ok+'/'+sm.total+'，不合格 '+sm.fail+'，未測 '+sm.untested+'</p>'
    +T.sysList(p).map(function(k){ var rows=ts.filter(function(t){ return t.sys===k; }); if(!rows.length) return "";
      return '<h3>'+esc(T.sysLabel(p,k))+'</h3><table><thead><tr><th>階段</th><th>測試項目</th><th>預期結果</th><th>判定</th><th>實測值／說明</th><th>日期</th><th>測試人</th></tr></thead><tbody>'
        +rows.map(function(t){ var r=resOf(d,t); return '<tr><td>'+(t.stage==="F"?"FAT":"SAT")+'</td><td>'+esc(t.item)+'</td><td>'+esc(t.exp)+'</td><td>'+esc(RES_LABEL[r.res||""][0])+'</td><td>'+esc(r.val||"")+'</td><td>'+esc(r.date?fmt(r.date):"")+'</td><td>'+esc(r.by?T.userName(r.by):"")+'</td></tr>'; }).join("")+'</tbody></table>'; }).join("")
    +'<h3>竣工資料包</h3><table><thead><tr><th>文件</th><th>狀態</th><th>備註</th></tr></thead><tbody>'+CLOSEOUT.map(function(c){ var v=(d.closeout||{})[c[0]]||{}; return '<tr><td>'+(c[2]?"★ ":"")+esc(c[1])+'</td><td>'+(v.ok?"已齊全":"未齊全")+'</td><td>'+esc(v.note||"")+'</td></tr>'; }).join("")+'</tbody></table>'
    +'<div class="sign"><div>施工單位</div><div>監造／營造</div><div>業主／管委會</div></div>');
}

/** 結案檢查（施工進度「標記為已結案」使用）：回傳要擋下的原因；後端未部署或讀取失敗時回傳空字串，不擋使用者 */
T.acceptGate=function(cur){
  return loadKind(cur,"accept").then(function(d){
    d=d||{}; d.tests=d.tests||{}; d.custom=d.custom||{}; d.closeout=d.closeout||{}; d.io=d.io||[];
    var sm=acceptSummary(cur.project,d,[]), why=[];
    if(sm.untested) why.push("測試驗收還有 "+sm.untested+" 項未測");
    if(sm.fail) why.push(sm.fail+" 項測試不合格");
    if(sm.miss.length) why.push("竣工包缺："+sm.miss.map(function(c){ return c[1]; }).join("、"));
    return why.join("；");
  },function(){ return ""; });
};
})();
