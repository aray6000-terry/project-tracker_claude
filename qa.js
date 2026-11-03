/* 弱電專案平台 — 品管・缺失：缺失管制表（Punch list）與自主檢查表（三級品管：施工廠商自主檢查＋主管抽查） */
(function(){
"use strict";
var T = window.TR; if(!T) return;
var esc=T.esc, api=T.api, toast=T.toast, fmt=T.fmt, fmtTime=T.fmtTime, fail=T.fail;
var $=function(id){ return document.getElementById(id); };
var U=function(){ return T.opsUtil||{}; };
var PUNCH_LABEL={open:"待改善",fixed:"已改善待結案",closed:"已結案"};
var REVIEW_LABEL={"":"待主管抽查",pass:"抽查通過",return:"退回重檢"};

/* ---------- 自主檢查表範本（依各結點查驗關卡與《專案工程師養成計畫》整理；key 不可重複、不可改，改了舊紀錄會對不到） ---------- */
var ITP={
  2:{title:"配管查驗（封板、灌漿前）",items:[
    ["p1","配管路徑、管徑、數量與配管圖相符"],["p2","強弱電分管，間距符合規定"],["p3","管內佔用率不超過約 40%"],
    ["p4","每管預留拉線，管口封堵"],["p5","出線盒位置、高度與圖面相符"],["p6","封板／灌漿前逐管拍照存證"]]},
  3:{title:"佈線與結線查驗",items:[
    ["w1","線材規格與送審核可型號相符"],["w2","穿線後測線：通斷"],["w3","穿線後測線：絕緣"],
    ["w4","線材兩端標示清楚、與結線表一致"],["w5","依結線表顏色結線"],["w6","線路測試紀錄已填寫"]]},
  4:{title:"設備安裝查驗",items:[
    ["i1","安裝位置、高度與設備配置圖相符"],["i2","設備固定牢靠、外觀無損"],["i3","箱體標示與配線圖一致"],
    ["i4","接地與電源（110V）已確認"],["i5","與消防廠商實測連動（門禁釋放、柵欄開啟）"]]},
  5:{title:"系統測試查驗（單機 → 系統 → 整合）",items:[
    ["t1","單機測試全數完成"],["t2","系統測試完成"],["t3","整合（介面）測試完成"],
    ["t4","全系統時間對時"],["t5","IP 位址表定版並移交"],["t6","機櫃整線、標示完成"]]}
};
/* 各系統加測項目（只在設備安裝、系統測試兩個結點出現） */
var SYS_ITP={
  cctv:{4:[["c1","攝影機視角、焦距符合監視範圍"]],5:[["c2","夜視／低照度畫面清晰"],["c3","錄影天數、解析度符合合約規範"]]},
  access:{4:[["a1","讀卡機、電鎖、出門按鈕安裝完成"]],5:[["a2","讀卡開門、權限設定正確"],["a3","斷電／消防信號時門鎖釋放"]]},
  intercom:{5:[["n1","各戶通話、開門功能逐戶測試"],["n2","管理中心呼叫、留言功能正常"]]},
  bms:{4:[["b1","IO 模組安裝、接點標示與 IO 表一致"]],5:[["b2","DI／DO／AI 點位逐點測試"],["b3","通訊整合（電表、消防、空調、電梯）讀值正確"]]},
  parking:{4:[["k1","柵欄機、車辨攝影機定位完成"]],5:[["k2","車牌辨識率測試"],["k3","柵欄防砸車功能正常"]]},
  network:{5:[["e1","交換器 VLAN、IP 設定與網路架構圖一致"],["e2","網路線測試報告（Fluke 或同等）"]]}
};
function itpItems(node,sys){
  var base=(ITP[node]||{items:[]}).items.slice(), sk=String(sys).split(".")[0];
  var extra=(SYS_ITP[sk]||{})[node]||[];
  return base.concat(extra);
}
function sysOptions(p,sel,allowCommon){
  var ks=T.sysList(p);
  return (allowCommon?'<option value="common"'+(sel==="common"?" selected":"")+'>共用／不分系統</option>':'')
    +ks.map(function(k){ return '<option value="'+esc(k)+'"'+(k===sel?" selected":"")+'>'+esc(T.sysName(p,k))+'</option>'; }).join("");
}
function sysLabel(p,k){ return k==="common"||!k?"共用":T.sysName(p,k); }
function photoTag(kind,id){ return "［"+kind+" "+id+"］"; }
function photosOf(photos,tag){ return photos.filter(function(f){ return String(f.caption||"").indexOf(tag)===0; }); }
function overdue(it){ return it.status!=="closed" && it.due && it.due<T.today(); }

/* 給施工進度的關卡檢查用：回傳未結案缺失數（後端尚未部署時回傳 0，不擋使用者） */
T.qaOpenPunch=function(pid){
  return api("qaGet",{id:pid}).then(function(r){ return (r.punch||[]).filter(function(x){ return x.status!=="closed"; }).length; },
    function(e){ if(e&&e.code==="NOT_DEPLOYED") return 0; fail(e); return 0; });
};

var st={insNode:5,insSys:""};
T.views.qaTab=function(cur,el){
  var u=U(); if(u.loading) u.loading(el); else el.innerHTML='<div class="loading">讀取中…</div>';
  Promise.all([api("qaGet",{id:cur.id}),api("files",{id:cur.id,kind:"photo"})]).then(function(r){
    render(cur,el,r[0],r[1].files||[]);
  }).catch(function(e){
    el.innerHTML='<div class="empty">'+esc(e.message)+(e.code==="NOT_DEPLOYED"?'<br><span class="meta">需在 Apps Script 加入 QA.gs 並重新部署（見 README 部署檢查表）</span>':'')+'</div>';
  });
};

function render(cur,el,d,photos){
  var p=cur.project, edit=T.canEdit(), u=U(), punch=d.punch||[], insp=d.inspect||[];
  var reload=function(){ T.views.qaTab(cur,el); };
  var cnt={open:0,fixed:0,closed:0,late:0}; punch.forEach(function(x){ cnt[x.status]=(cnt[x.status]||0)+1; if(overdue(x)) cnt.late++; });
  punch.sort(function(a,b){ var o={open:0,fixed:1,closed:2}; return (o[a.status]-o[b.status])||String(a.due||"9").localeCompare(String(b.due||"9")); });

  /* ---- 缺失管制表 ---- */
  var h='<section class="panel"><div class="row"><h3>缺失管制表</h3><button class="btn small" type="button" id="btnPunchPrint">列印管制表</button></div>'
    +'<p class="meta">驗屋、業主或主管提出的缺失逐項登記：改善前照片 → 改善後照片＋說明 → 結案。未結案項目會擋住結點 8「缺失依管制表逐項結案」。</p>'
    +'<p>待改善 <b>'+cnt.open+'</b>｜已改善待結案 <b>'+cnt.fixed+'</b>｜已結案 <b>'+cnt.closed+'</b>'+(cnt.late?'｜<span class="bad">逾期 '+cnt.late+'</span>':'')+'</p>';
  if(edit){
    h+='<div class="uprow"><input type="text" id="plLoc" class="fld" maxlength="60" placeholder="位置（例：A棟 3F 梯廳）" style="min-width:160px">'
      +'<select id="plSys" class="fld">'+sysOptions(p,"common",true)+'</select>'
      +'<input type="text" id="plOwner" class="fld" maxlength="60" placeholder="負責人／小包" style="min-width:120px">'
      +'<label class="meta">期限 <input type="date" id="plDue" class="fld"></label></div>'
      +'<div class="uprow"><input type="text" id="plDesc" class="fld" maxlength="500" placeholder="缺失內容（例：攝影機角度偏移，未涵蓋梯廳出入口）" style="flex:1;min-width:220px">'
      +'<label class="meta">改善前照片 <input type="file" id="plPhoto" accept="image/*" multiple></label>'
      +'<button class="btn primary small" id="btnPunchAdd" type="button">新增缺失</button></div>';
  }
  h+=punch.length?'<div class="tblwrap"><table class="cards"><thead><tr><th>編號</th><th>位置</th><th>系統</th><th>內容</th><th>負責人</th><th>期限</th><th>狀態</th><th>照片</th><th></th></tr></thead><tbody>'
    +punch.map(function(x){
      var before=photosOf(photos,photoTag("缺失",x.id)+"改善前"), after=photosOf(photos,photoTag("缺失",x.id)+"改善後");
      var acts='';
      if(edit){
        if(x.status!=="closed") acts+='<button class="btn small" type="button" data-plbefore="'+esc(x.id)+'">加改善前照片</button>';
        if(x.status==="open") acts+='<button class="btn small" type="button" data-plfix="'+esc(x.id)+'">回報已改善</button>';
        if(x.status==="fixed") acts+='<button class="btn small primary" type="button" data-plclose="'+esc(x.id)+'">結案</button><button class="btn small" type="button" data-plreopen="'+esc(x.id)+'">退回</button>';
        if(x.status==="closed") acts+='<button class="btn small" type="button" data-plreopen="'+esc(x.id)+'">重新開啟</button>';
      }
      return '<tr><td class="mono" data-label="編號">'+esc(x.id)+'</td><td data-label="位置">'+esc(x.loc||"—")+'</td><td data-label="系統">'+esc(sysLabel(p,x.sys))+'</td>'
        +'<td data-label="內容">'+esc(x.desc)+(x.fix?'<br><span class="meta">改善：'+esc(x.fix)+'</span>':'')+'<br><span class="meta">'+esc(T.userName(x.by))+' '+fmtTime(x.at)+(x.closedAt?'｜結案 '+esc(T.userName(x.closedBy))+' '+fmtTime(x.closedAt):'')+'</span></td>'
        +'<td data-label="負責人">'+esc(x.owner||"—")+'</td><td data-label="期限"'+(overdue(x)?' class="bad"':'')+'>'+(x.due?fmt(x.due):"—")+(overdue(x)?'（逾期）':'')+'</td>'
        +'<td data-label="狀態">'+(u.chip?u.chip(x.status==="fixed"?"doing":x.status,PUNCH_LABEL[x.status]):esc(PUNCH_LABEL[x.status]))+'</td>'
        +'<td data-label="照片">'+(before.length||after.length?'<div class="thumbs">'+before.concat(after).map(u.thumbHtml||function(){return "";}).join("")+'</div>':'<span class="meta">—</span>')+'</td>'
        +'<td class="act">'+acts+'</td></tr>';
    }).join("")+'</tbody></table></div>':'<p class="meta">目前沒有缺失。</p>';
  h+='</section>';

  /* ---- 自主檢查表 ---- */
  var ks=T.sysList(p); if(!st.insSys||ks.indexOf(st.insSys)<0) st.insSys=ks[0]||"common";
  var cur0=insp.filter(function(x){ return x.node===st.insNode && x.sys===st.insSys; })[0];
  var res=(cur0&&cur0.result)||{}, items=itpItems(st.insNode,st.insSys);
  h+='<section class="panel"><h3>自主檢查表（三級品管）</h3><p class="meta">工程師在各停留點逐項自主檢查並附照片，送出後由主管抽查；退回時需重新檢查後再送出。</p>'
    +'<div class="uprow"><select id="insNode" class="fld">'+Object.keys(ITP).map(function(n){ return '<option value="'+n+'"'+(+n===st.insNode?" selected":"")+'>結點'+(+n+1)+' '+esc(T.NODES[n].name)+'｜'+esc(ITP[n].title)+'</option>'; }).join("")+'</select>'
    +'<select id="insSys" class="fld">'+(ks.length?sysOptions(p,st.insSys,false):'<option value="common">共用</option>')+'</select></div>';
  if(cur0) h+='<p class="meta">上次檢查：'+esc(T.userName(cur0.by))+' '+fmtTime(cur0.at)+'｜'+esc(REVIEW_LABEL[cur0.review||""])+(cur0.reviewer?'（'+esc(T.userName(cur0.reviewer))+' '+fmtTime(cur0.reviewAt)+'）':'')+(cur0.reviewNote?'｜意見：'+esc(cur0.reviewNote):'')+'</p>';
  h+='<div class="tblwrap"><table class="cards"><thead><tr><th>#</th><th>檢查項目</th><th>結果</th><th>說明</th></tr></thead><tbody>'
    +items.map(function(it,i){
      var v=res[it[0]]||{}, dis=edit?'':' disabled';
      var radio=function(val,lab){ return '<label class="pick"><input type="radio" name="ins_'+it[0]+'" value="'+val+'"'+(v.st===val?" checked":"")+dis+'>'+lab+'</label>'; };
      return '<tr><td data-label="#">'+(i+1)+'</td><td data-label="檢查項目">'+esc(it[1])+'</td><td data-label="結果">'+radio("ok","合格")+radio("ng","不合格")+radio("na","不適用")+'</td>'
        +'<td data-label="說明"><input type="text" class="fld" maxlength="200" data-insnote="'+it[0]+'" value="'+esc(v.note||"")+'"'+dis+'></td></tr>';
    }).join("")+'</tbody></table></div>';
  var tag=photoTag("自檢","結點"+(st.insNode+1)+" "+st.insSys), iph=photosOf(photos,tag);
  h+=(iph.length?'<div class="thumbs" style="margin-top:6px">'+iph.map(u.thumbHtml||function(){return "";}).join("")+'</div>':'');
  if(edit) h+='<div class="uprow" style="margin-top:8px"><label class="meta">查驗照片 <input type="file" id="insPhoto" accept="image/*" multiple></label><button class="btn small" id="btnInsPhoto" type="button">上傳照片</button><button class="btn primary small" id="btnInsSave" type="button">送出自主檢查</button></div>';
  if(d.canReview && cur0) h+='<div class="uprow"><button class="btn small" id="btnInsPass" type="button">抽查通過</button><button class="btn small danger" id="btnInsReturn" type="button">退回重檢</button></div>';
  /* 全部紀錄一覽 */
  if(insp.length){
    h+='<h4 style="margin-top:14px">檢查紀錄一覽</h4><ul class="list">'+insp.slice().sort(function(a,b){ return a.node-b.node||a.sys.localeCompare(b.sys); }).map(function(x){
      var its=itpItems(x.node,x.sys), done=its.filter(function(it){ return x.result[it[0]]&&x.result[it[0]].st; }).length, ng=its.filter(function(it){ return x.result[it[0]]&&x.result[it[0]].st==="ng"; }).length;
      return '<li><div class="main"><b>結點'+(x.node+1)+' '+esc(T.NODES[x.node]?T.NODES[x.node].name:"")+'｜'+esc(sysLabel(p,x.sys))+'</b><span class="meta">已檢 '+done+'/'+its.length+(ng?'，<span class="bad">不合格 '+ng+'</span>':'')+'｜'+esc(T.userName(x.by))+' '+fmtTime(x.at)+(x.reviewNote?'｜'+esc(x.reviewNote):'')+'</span></div>'
        +(u.chip?u.chip(x.review==="pass"?"closed":x.review==="return"?"rejected":"open",REVIEW_LABEL[x.review||""]):'')+'</li>';
    }).join("")+'</ul>';
  }
  h+='</section><input type="file" id="qaPhoto" accept="image/*" multiple hidden>';
  el.innerHTML=h;
  if(u.bindFiles) u.bindFiles(el,cur,reload);

  $("insNode").onchange=function(){ st.insNode=+this.value; render(cur,el,d,photos); };
  $("insSys").onchange=function(){ st.insSys=this.value; render(cur,el,d,photos); };
  $("btnPunchPrint").onclick=function(){ printPunch(p,punch); };
  if(d.canReview && cur0){
    $("btnInsPass").onclick=function(){ api("inspectReview",{id:cur.id,inspId:cur0.id,result:"pass"}).then(function(){ toast("已抽查通過"); reload(); }).catch(fail); };
    $("btnInsReturn").onclick=function(){ var n=prompt("退回原因（例：第 3 項缺照片）",""); if(!n) return; api("inspectReview",{id:cur.id,inspId:cur0.id,result:"return",note:n}).then(function(){ toast("已退回"); reload(); }).catch(fail); };
  }
  if(!edit) return;

  var pick=function(caption,done){ var inp=$("qaPhoto"); inp.value=""; inp.onchange=function(){ if(!inp.files.length) return; u.uploadFiles(cur,"photo",inp.files,{node:-1,caption:caption},done); }; inp.click(); };
  $("btnPunchAdd").onclick=function(){
    var desc=$("plDesc").value.trim(); if(!desc){ toast("請填缺失內容"); return; }
    var files=$("plPhoto").files, btn=this; btn.disabled=true;
    api("punchSave",{id:cur.id,item:{loc:$("plLoc").value,sys:$("plSys").value,desc:desc,owner:$("plOwner").value,due:$("plDue").value}}).then(function(r){
      toast("已新增缺失 "+r.id);
      if(files&&files.length) u.uploadFiles(cur,"photo",files,{node:7,caption:photoTag("缺失",r.id)+"改善前 "+desc.slice(0,60)},reload); else reload();
    }).catch(function(e){ btn.disabled=false; fail(e); });
  };
  var find=function(id){ return punch.filter(function(x){ return x.id===id; })[0]; };
  el.querySelectorAll("[data-plbefore]").forEach(function(b){ b.onclick=function(){ var x=find(b.dataset.plbefore); pick(photoTag("缺失",x.id)+"改善前 "+x.desc.slice(0,60),reload); }; });
  el.querySelectorAll("[data-plfix]").forEach(function(b){ b.onclick=function(){
    var x=find(b.dataset.plfix), fix=prompt("改善說明（例：已重新調整角度並複測）",x.fix||""); if(!fix) return;
    toast("請選擇改善後照片");
    pick(photoTag("缺失",x.id)+"改善後 "+fix.slice(0,60),function(){
      api("punchSave",{id:cur.id,item:{id:x.id,status:"fixed",fix:fix}}).then(function(){ toast("已回報改善，待結案"); reload(); }).catch(fail);
    });
  }; });
  el.querySelectorAll("[data-plclose]").forEach(function(b){ b.onclick=function(){
    var x=find(b.dataset.plclose);
    if(!photosOf(photos,photoTag("缺失",x.id)+"改善後").length){ toast("結案前需有改善後照片，請先「退回」再重新回報改善"); return; }
    if(!confirm("確認「"+x.desc+"」已改善完成並結案？")) return;
    api("punchSave",{id:cur.id,item:{id:x.id,status:"closed"}}).then(function(){ toast("已結案"); reload(); }).catch(fail);
  }; });
  el.querySelectorAll("[data-plreopen]").forEach(function(b){ b.onclick=function(){
    var x=find(b.dataset.plreopen); if(!confirm("將「"+x.desc+"」改回待改善？")) return;
    api("punchSave",{id:cur.id,item:{id:x.id,status:"open"}}).then(function(){ toast("已改回待改善"); reload(); }).catch(fail);
  }; });
  $("btnInsPhoto").onclick=function(){ var f=$("insPhoto").files; if(!f.length){ toast("請先選擇照片"); return; } u.uploadFiles(cur,"photo",f,{node:st.insNode,caption:tag+" "+ITP[st.insNode].title},reload); };
  $("btnInsSave").onclick=function(){
    var out={}, miss=0, ng=0;
    items.forEach(function(it){
      var r=el.querySelector('input[name="ins_'+it[0]+'"]:checked'), note=el.querySelector('[data-insnote="'+it[0]+'"]').value.trim();
      out[it[0]]={st:r?r.value:"",note:note}; if(!r) miss++; else if(r.value==="ng") ng++;
    });
    if(miss && !confirm("還有 "+miss+" 項未勾選結果，仍要送出嗎？")) return;
    if(ng && items.some(function(it){ return out[it[0]].st==="ng" && !out[it[0]].note; })){ toast("不合格項目請填寫說明"); return; }
    var btn=this; btn.disabled=true;
    api("inspectSave",{id:cur.id,node:st.insNode,sys:st.insSys,result:out}).then(function(){ toast("已送出自主檢查，待主管抽查"); reload(); }).catch(function(e){ btn.disabled=false; fail(e); });
  };
}

function printPunch(p,punch){
  var u=U(); if(!u.printHtml) return;
  var rows=punch.map(function(x,i){ return '<tr><td>'+(i+1)+'</td><td>'+esc(x.id)+'</td><td>'+esc(x.loc||"")+'</td><td>'+esc(sysLabel(p,x.sys))+'</td><td>'+esc(x.desc)+'</td><td>'+esc(x.owner||"")+'</td><td>'+(x.due?fmt(x.due):"")+'</td><td>'+esc(PUNCH_LABEL[x.status])+'</td><td>'+esc(x.fix||"")+'</td><td>'+(x.closedAt?fmt(x.closedAt):"")+'</td></tr>'; }).join("");
  u.printHtml("缺失管制表－"+p.name,'<h1>缺失管制表</h1><p class="meta">專案：'+esc(p.name)+'｜業主：'+esc(p.client||"")+'｜案場：'+esc(p.site||"")+'｜列印日期：'+esc(T.today())+'</p>'
    +'<table><thead><tr><th>#</th><th>編號</th><th>位置</th><th>系統</th><th>缺失內容</th><th>負責人</th><th>期限</th><th>狀態</th><th>改善說明</th><th>結案日</th></tr></thead><tbody>'+(rows||'<tr><td colspan="10">無</td></tr>')+'</tbody></table>'
    +'<div class="sign"><div>施工單位</div><div>工務主管</div><div>業主／監造</div></div>');
}
})();
