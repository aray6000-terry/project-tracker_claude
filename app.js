(function(){
"use strict";
var CFG = window.APP_CONFIG || {};
var NODES = [
  {name:"簽約成交",
   task:["請購線材","進場時間前 1 個月到貨"],
   gate:["送審核可後才請購","主機、客製機櫃等長交期設備另抓交期"],
   form:["請購單","交期表"]},
  {name:"開工前",
   task:["開工前會議（業主、營造、水電、小包）","確認配管圖與介面分工","小包合約、保險與勞安文件"],
   gate:["配管管徑與數量足夠","110V 電源施作單位已確認"],
   form:["開工會議紀錄","介面分工表"]},
  {name:"上樑前",
   task:["完成各項設備水平佈線","上樑時間結點請購各項設備","消防檢查時間結點時到貨"],
   gate:["封板、灌漿前拍照查驗","強弱電分管","管內不超過約 40%","預留拉線"],
   form:["查驗照片","施工日誌"]},
  {name:"上樑～消防檢查",
   task:["完成各項設備垂直佈線","各項設備清盒及 PIN 線結線"],
   gate:["穿線後測線（通斷、絕緣）","線材兩端標示","依結線表顏色結線"],
   form:["線路測試紀錄"]},
  {name:"消防檢查～使照申請",
   task:["各項設備安裝","各監控箱設備安裝及結線（須標示）","櫃台設計再次確認並規劃幹線路徑"],
   gate:["與消防廠商實測消防連動（門禁釋放、柵欄開啟）","箱體標示與配線圖一致"],
   form:["消防連動測試紀錄"]},
  {name:"櫃台機櫃完工～驗屋",
   task:["設備擺放定位","幹線結線（須標示）","系統設定及測試"],
   gate:["單機 → 系統 → 整合三階段測試","全系統時間對時","機櫃整線"],
   form:["系統測試報告","IP 位址表"]},
  {name:"驗屋交屋",
   task:["各項系統初步檢查及驗收","竣工圖","設備操作手冊","保固書","設備出廠證明"],
   gate:["驗收單簽認並確認保固起算日","操作教育訓練","帳號密碼與備品移交"],
   form:["驗收單","教育訓練簽到表","移交清冊"]},
  {name:"交屋後",
   task:["缺失改善","結算與尾款請款","首次保養與案件歸檔"],
   gate:["缺失依管制表逐項結案","保固到期日列入提醒"],
   form:["結算書","保養紀錄表"]}
];
/* 依交屋日倒推的建議天數（交屋日為 0），可依實際案場修改 */
var OFFSETS = [-540,-480,-360,-240,-120,-45,0,60];
var GROUPS = [["task","完成事項"],["gate","查驗關卡"],["form","產出表單"]];
var FIELDS = ["name","client","site","engineer","mentor","amount","handover","note"];
var LEGACY_KEY = "wv-project-tracker-v1";
var ROLE_LABEL = {admin:["管理員","b-warn"],owner:["負責人","b-run"],editor:["可編輯","b-ok"],viewer:["僅檢視","b-idle"]};
var ST_LABEL = {idle:["未開始","b-idle"],run:["進行中","b-run"],ok:["完成","b-ok"],bad:["逾期","b-bad"]};
var PST_LABEL = {idle:["未開始","b-idle"],run:["進行中","b-run"],late:["有逾期結點","b-bad"],closed:["已結案","b-ok"]};

/* ---------- 狀態（登入憑證只存在記憶體，不寫入瀏覽器儲存空間） ---------- */
var session = {token:null, exp:0, me:null};
var data = {projects:[], users:[]};
var cur = null;              /* 目前開啟的專案 {id,version,myRole,owner,members,project} */
var view = {filter:"all", scope:"all", q:""};
var saver = {timer:null, busy:false, dirty:false, failed:false, target:null};
var lastActive = Date.now();

var $ = function(id){ return document.getElementById(id); };
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];}); }
function pad(n){ return n<10?"0"+n:""+n; }
function today(){ var d=new Date(); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
function addDays(iso,n){ var d=new Date(iso+"T00:00:00"); d.setDate(d.getDate()+n); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
function fmt(iso){ return iso ? String(iso).slice(0,10).replace(/-/g,"/") : "未設定"; }
function fmtTime(iso){ if(!iso) return "—"; var d=new Date(iso); if(isNaN(d)) return esc(iso); return d.getFullYear()+"/"+pad(d.getMonth()+1)+"/"+pad(d.getDate())+" "+pad(d.getHours())+":"+pad(d.getMinutes()); }
function toast(msg){ var t=$("toast"); t.textContent=msg; t.classList.add("on"); clearTimeout(toast._t); toast._t=setTimeout(function(){t.classList.remove("on");},2800); }
function userName(email){ for(var i=0;i<data.users.length;i++) if(data.users[i].email===email) return data.users[i].name||email; return email; }
function userLabel(email){ var n=userName(email); return n===email?email:n+"（"+email+"）"; }
function canEdit(){ return cur && cur.myRole!=="viewer"; }

/* ---------- 結點統計 ---------- */
function itemsOf(i){ var n=NODES[i], out=[]; GROUPS.forEach(function(g){ n[g[0]].forEach(function(_,j){ out.push(g[0]+j); }); }); return out; }
function stat(i,checked,target){
  var ids=itemsOf(i), c=0;
  ids.forEach(function(id){ if(checked(id)) c++; });
  var total=ids.length, st;
  if(c===total) st="ok"; else if(target && target<today()) st="bad"; else if(c>0) st="run"; else st="idle";
  return {c:c,total:total,pct:Math.round(c/total*100),st:st};
}
function nodeStat(p,i){ var n=p.nodes[i]; return stat(i,function(id){return !!n.checks[id];},n.target); }
function sumNodeStat(sm,i){ var n=(sm.nodes||[])[i]||{}; var k=n.k||[]; return stat(i,function(id){return k.indexOf(id)>=0;},n.t); }
function projStatBy(nodeFn,closed){
  var c=0,t=0,over=0,okn=0,next=null;
  for(var i=0;i<NODES.length;i++){ var s=nodeFn(i); c+=s.c; t+=s.total; if(s.st==="bad") over++; if(s.st==="ok") okn++; else if(next===null) next=i; }
  var status = (closed||okn===NODES.length)?"closed":over>0?"late":c>0?"run":"idle";
  return {pct:t?Math.round(c/t*100):0,over:over,okn:okn,next:next,status:status};
}
function projStat(p){ return projStatBy(function(i){return nodeStat(p,i);},p.closed); }
function sumStat(sm){ return projStatBy(function(i){return sumNodeStat(sm,i);},sm.closed); }
function newNodes(handover){
  return NODES.map(function(n,i){
    var t = handover ? addDays(handover, OFFSETS[i]) : "";
    if(t && t < today()) t = "";
    return {target:t, done:"", note:"", checks:{}};
  });
}

/* ---------- API ---------- */
function ApiError(code,msg,data){ this.code=code; this.message=msg; this.data=data; }
function api(action,payload){
  if(!session.token || session.exp*1000 < Date.now()+30000){
    var ae=new ApiError("AUTH","登入已過期，請重新登入");
    if(session.token) onAuthLost(ae);
    return Promise.reject(ae);
  }
  return fetch(CFG.API_URL,{
    method:"POST",
    headers:{"Content-Type":"text/plain;charset=utf-8"},   /* 簡單請求，避免 CORS 預檢 */
    body:JSON.stringify({action:action, idToken:session.token, payload:payload||{}}),
    credentials:"omit", cache:"no-store", redirect:"follow", referrerPolicy:"no-referrer"
  }).then(function(r){
    if(!r.ok) throw new ApiError("NETWORK","連線失敗（"+r.status+"）");
    return r.json();
  },function(){ throw new ApiError("NETWORK","無法連線到伺服器，請檢查網路"); })
  .then(function(res){
    if(res && res.ok) return res.data;
    var e=new ApiError((res&&res.code)||"SERVER",(res&&res.message)||"伺服器錯誤",res&&res.data);
    throw e;
  }).catch(function(e){
    if(!(e instanceof ApiError)) e=new ApiError("SERVER","回應格式錯誤");
    if(e.code==="AUTH"||e.code==="NOT_REGISTERED"||e.code==="DISABLED") onAuthLost(e);
    throw e;
  });
}
function fail(e){ if(e && e.code!=="AUTH") toast(e.message||"發生錯誤"); }

/* ---------- 登入 ---------- */
function decodeJwt(tok){
  try{
    var p=tok.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
    while(p.length%4) p+="=";
    var bin=atob(p), bytes=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  }catch(e){ return null; }
}
function configured(){
  return CFG.CLIENT_ID && CFG.API_URL && CFG.CLIENT_ID.indexOf("請填入")<0 && CFG.API_URL.indexOf("請填入")<0 && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(CFG.API_URL);
}
var gsiReady=false;
function initGsi(){
  if(gsiReady || !(window.google && google.accounts && google.accounts.id)) return gsiReady;
  google.accounts.id.initialize({
    client_id: CFG.CLIENT_ID, callback: onCredential, auto_select: true,
    cancel_on_tap_outside: false, itp_support: true, use_fedcm_for_prompt: true
  });
  gsiReady=true; return true;
}
function showLogin(msg, isError, autoPrompt){
  session.token=null; session.exp=0; session.me=null; cur=null;
  $("tools").hidden=true; $("toolsGuest").hidden=false;
  var h='<section class="login"><div class="login-box"><h2>請先登入</h2>'
    +'<p>使用公司開通的 Google 帳號登入，登入後只會看到您負責或被分享的專案。</p>';
  if(msg) h+='<div class="notice" style="'+(isError?'':'background:var(--accent-soft);color:var(--accent)')+'">'+esc(msg)+'</div>';
  if(!configured()) h+='<div class="notice">系統尚未設定：請管理員在 config.js 填入 CLIENT_ID 與 API_URL。</div>';
  h+='<div id="gsiBtn"></div>'
    +'<ul class="sec"><li>本系統不會取得您的 Google 密碼，也不會存取您的信箱或雲端硬碟。</li>'
    +'<li>帳號需由管理員開通；閒置 '+(CFG.IDLE_MINUTES||30)+' 分鐘會自動登出。</li>'
    +'<li>公用電腦使用後請按「登出」。</li></ul></div></section>';
  $("app").innerHTML=h;
  if(!configured()) return;
  waitGsi(function(){
    google.accounts.id.renderButton($("gsiBtn"),{type:"standard",theme:isDark()?"filled_black":"outline",size:"large",text:"signin_with",shape:"pill",locale:"zh-TW",width:Math.min(260,$("gsiBtn").clientWidth||260)});
    if(!msg || autoPrompt) google.accounts.id.prompt();
  });
}
function waitGsi(cb,tries){
  tries=tries||0;
  if(initGsi()) return cb();
  if(tries>100){ var b=$("gsiBtn"); if(b) b.innerHTML='<div class="notice">無法載入 Google 登入元件，請確認網路或關閉擋廣告外掛後重新整理。</div>'; return; }
  setTimeout(function(){ waitGsi(cb,tries+1); },100);
}
function onCredential(resp){
  var tok=resp && resp.credential, p=tok && decodeJwt(tok);
  if(!p || !p.exp){ showLogin("登入失敗，請再試一次",true); return; }
  session.token=tok; session.exp=p.exp; lastActive=Date.now();
  clearTimeout(session.refresh);
  /* 憑證約 1 小時到期，到期前 5 分鐘嘗試以 Google 一鍵登入無聲更新 */
  session.refresh=setTimeout(function(){ if(session.token && window.google && google.accounts) google.accounts.id.prompt(); }, Math.max(60000,(p.exp*1000-Date.now())-300000));
  if(session.me && session.me.email===String(p.email||"").toLowerCase()){
    if(saver.dirty) flushSave();   /* 同一人更新憑證：不重新載入畫面 */
    return;
  }
  api("me").then(function(me){
    session.me=me;
    $("tools").hidden=false; $("toolsGuest").hidden=true;
    $("userName").textContent=me.name||me.email; $("userName").title=me.email;
    var rl=ROLE_LABEL[me.role==="admin"?"admin":"editor"];
    $("roleTag").innerHTML=me.role==="admin"?'<span class="badge '+rl[1]+'">管理員</span>':'';
    $("btnNew").hidden=!me.canCreate; $("btnImport").hidden=!me.canCreate; $("btnAdmin").hidden=me.role!=="admin";
    if(saver.dirty && saver.target){ cur=saver.target; flushSave(); }
    route();
  }).catch(function(e){
    if(e.code==="AUTH"||e.code==="NOT_REGISTERED"||e.code==="DISABLED") return;
    showLogin(e.message,true);
  });
}
function onAuthLost(e){
  if(!session.token) return;
  var keepCur = saver.dirty ? saver.target : null;
  var msg = e.code==="NOT_REGISTERED" ? "此帳號（"+(decodeJwt(session.token||"")||{}).email+"）尚未開通，請聯絡管理員開通後再登入。"
          : e.code==="DISABLED" ? "此帳號已停用，請聯絡管理員。"
          : "登入已過期，請重新登入"+(keepCur?"；尚未儲存的修改會在登入後自動送出。":"。");
  if(e.code!=="AUTH" && window.google && google.accounts) google.accounts.id.disableAutoSelect();
  if(e.code!=="AUTH") saver.dirty=false;
  showLogin(msg, e.code!=="AUTH", e.code==="AUTH");
}
function logout(){
  if((saver.dirty||saver.busy) && !confirm("還有修改尚未儲存，確定要登出嗎？")) return;
  saver.dirty=false; saver.target=null; clearTimeout(saver.timer); clearTimeout(session.refresh);
  if(window.google && google.accounts && google.accounts.id){ google.accounts.id.disableAutoSelect(); }
  data={projects:[],users:[]};
  history.replaceState(null,"",location.pathname);
  showLogin("您已登出。");
}
/* 閒置自動登出 */
["click","keydown","scroll","touchstart"].forEach(function(ev){ window.addEventListener(ev,function(){ lastActive=Date.now(); },{passive:true}); });
setInterval(function(){
  if(session.token && Date.now()-lastActive > (CFG.IDLE_MINUTES||30)*60000 && !saver.dirty && !saver.busy){
    if(window.google && google.accounts) google.accounts.id.disableAutoSelect();
    data={projects:[],users:[]}; clearTimeout(session.refresh); showLogin("閒置過久，已自動登出。");
  }
},30000);

/* ---------- 列表 ---------- */
function loadList(){
  $("app").innerHTML='<div class="loading">讀取專案中…</div>';
  return api("list").then(function(d){ data.projects=d.projects||[]; data.users=d.users||[]; renderList(); }).catch(fail);
}
function renderList(){
  var me=session.me;
  var ps=data.projects.map(function(x){ return {x:x,s:sumStat(x.summary||{})}; });
  var act=ps.filter(function(o){return o.s.status!=="closed";});
  var overNodes=ps.reduce(function(a,o){return a+o.s.over;},0);
  var avg=act.length?Math.round(act.reduce(function(a,o){return a+o.s.pct;},0)/act.length):0;
  var q=view.q.trim().toLowerCase();
  var list=ps.filter(function(o){
    var sm=o.x.summary||{};
    if(view.filter==="active" && o.s.status==="closed") return false;
    if(view.filter==="late" && o.s.status!=="late") return false;
    if(view.filter==="closed" && o.s.status!=="closed") return false;
    if(view.scope==="mine" && o.x.owner!==me.email) return false;
    if(view.scope==="shared" && (o.x.owner===me.email || o.x.myRole==="admin")) return false;
    if(q){ var hay=[sm.name,sm.client,sm.site,sm.engineer,sm.mentor,o.x.owner,userName(o.x.owner)].join(" ").toLowerCase(); if(hay.indexOf(q)<0) return false; }
    return true;
  });
  list.sort(function(a,b){ return String(b.x.updated).localeCompare(String(a.x.updated)); });
  var h='<section class="stats">'
    +statBox(data.projects.length, me.role==="admin"?"專案總數（全部）":"我可看的專案")
    +statBox(act.length,"進行中專案")
    +statBox(overNodes,"逾期結點",overNodes>0?"bad":"")
    +statBox(avg+"%","進行中平均進度")+'</section>';
  h+='<div class="filters"><div class="seg" role="group" aria-label="狀態">'
    +seg("filter","all","全部")+seg("filter","active","進行中")+seg("filter","late","有逾期")+seg("filter","closed","已結案")
    +'</div><div class="seg" role="group" aria-label="範圍">'
    +seg("scope","all","全部")+seg("scope","mine","我負責")+seg("scope","shared","分享給我")
    +'</div><input class="search" id="q" type="search" placeholder="搜尋專案、業主、工程師…" value="'+esc(view.q)+'"></div>';
  if(!data.projects.length){
    h+='<div class="empty"><p style="font-size:16px;margin:0 0 6px">目前沒有可檢視的專案</p><p style="margin:0">'
      +(me.canCreate?'按「新增專案」建立第一個案件；舊版網頁的資料可用「匯入舊資料」搬進來。':'請等待專案負責人分享，或請管理員指派給您。')+'</p></div>';
  }else if(!list.length){
    h+='<div class="empty">沒有符合條件的專案</div>';
  }else{
    h+='<section class="grid">';
    list.forEach(function(o){
      var x=o.x, sm=x.summary||{}, s=o.s, lb=PST_LABEL[s.status], rl=ROLE_LABEL[x.myRole]||ROLE_LABEL.viewer;
      var nx = s.next===null ? "全部結點已完成" : "下一結點："+NODES[s.next].name+"（"+fmt(((sm.nodes||[])[s.next]||{}).t)+"）";
      h+='<article class="card" tabindex="0" data-open="'+esc(x.id)+'">'
        +'<div class="row"><h3>'+esc(sm.name)+'</h3><span class="badge '+lb[1]+'">'+lb[0]+'</span></div>'
        +'<div class="meta">'+esc(sm.client||"—")+(sm.site?'｜'+esc(sm.site):'')+'</div>'
        +'<div class="meta">工程師：'+esc(sm.engineer||"—")+'　師父：'+esc(sm.mentor||"—")+'</div>'
        +'<div class="dots" aria-hidden="true">'+NODES.map(function(_,i){return '<span class="s-'+sumNodeStat(sm,i).st+'"></span>';}).join("")+'</div>'
        +'<div class="row"><div class="bar'+(s.pct===100?' ok':'')+'" style="flex:1" role="progressbar" aria-valuenow="'+s.pct+'" aria-valuemin="0" aria-valuemax="100"><i style="width:'+s.pct+'%"></i></div><b style="min-width:44px;text-align:right">'+s.pct+'%</b></div>'
        +'<div class="meta">'+esc(nx)+(s.over?'　<span style="color:var(--bad)">逾期 '+s.over+' 個結點</span>':'')+'</div>'
        +'<div class="row meta"><span>負責：'+esc(userName(x.owner))+(x.memberCount?'　共享 '+x.memberCount+' 人':'')+'</span><span class="badge '+rl[1]+'">'+rl[0]+'</span></div>'
        +'</article>';
    });
    h+='</section>';
  }
  $("app").innerHTML=h;
  document.querySelectorAll("[data-seg]").forEach(function(b){ b.onclick=function(){ view[b.dataset.seg]=b.dataset.v; renderList(); }; });
  var qi=$("q");
  qi.oninput=function(){ view.q=qi.value; var pos=qi.selectionStart; renderList(); var q2=$("q"); q2.focus(); try{q2.setSelectionRange(pos,pos);}catch(e){} };
  document.querySelectorAll("[data-open]").forEach(function(c){
    c.onclick=function(){ go("p="+c.dataset.open); };
    c.onkeydown=function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); go("p="+c.dataset.open); } };
  });
}
function statBox(n,l,cls){ return '<div class="stat '+(cls||"")+'"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>'; }
function seg(k,v,l){ return '<button type="button" data-seg="'+k+'" data-v="'+v+'" class="'+(view[k]===v?"on":"")+'">'+l+'</button>'; }

/* ---------- 專案頁 ---------- */
function openProject(id){
  if(cur && cur.id===id){ renderDetail(); return; }
  $("app").innerHTML='<div class="loading">讀取專案中…</div>';
  api("get",{id:id}).then(function(v){ cur=v; renderDetail(); }).catch(function(e){ fail(e); if(e.code==="NOT_FOUND") go(""); });
}
function renderDetail(keepNode){
  var p=cur.project, s=projStat(p), lb=PST_LABEL[s.status], rl=ROLE_LABEL[cur.myRole], ro=!canEdit();
  var h='<div class="back"><button class="btn small" type="button" id="btnBack">← 返回專案列表</button><span class="savestate" id="saveState"></span></div>';
  if(ro) h+='<div class="notice">您對此專案為「僅檢視」權限，無法修改內容。</div>';
  h+='<section class="detail-head"><div class="row" style="flex-wrap:wrap"><h2>'+esc(p.name)+'</h2><span><span class="badge '+lb[1]+'">'+lb[0]+'</span> <span class="badge '+rl[1]+'">'+rl[0]+'</span></span></div>'
    +'<div class="info">'
    +info("業主／營造",p.client)+info("案場地點",p.site)+info("負責工程師",p.engineer)+info("帶案師父",p.mentor)
    +info("合約金額",p.amount)+info("預計驗屋交屋",fmt(p.handover))+info("負責帳號",userName(cur.owner))+info("完成結點",s.okn+" / "+NODES.length)
    +'</div>'
    +(p.note?'<p class="meta" style="margin:0 0 10px">備註：'+esc(p.note)+'</p>':'')
    +'<p class="meta" style="margin:0 0 10px">最後更新：'+fmtTime(cur.updated)+'（'+esc(userName(cur.updatedBy||""))+'）</p>'
    +'<div class="row"><div class="bar'+(s.pct===100?' ok':'')+'" style="flex:1"><i style="width:'+s.pct+'%"></i></div><b style="min-width:52px;text-align:right">'+s.pct+'%</b></div>'
    +'<div class="steps">'+p.nodes.map(function(n,i){ var ns=nodeStat(p,i); return '<button type="button" class="step s-'+ns.st+'" data-jump="'+i+'"><div class="k">結點 '+(i+1)+'・'+ST_LABEL[ns.st][0]+'</div><div class="t">'+esc(NODES[i].name)+'</div><div class="k">'+fmt(n.target)+'</div></button>'; }).join("")+'</div>'
    +'<div class="tools" style="margin-top:10px">'
    +(ro?'':'<button class="btn small" type="button" id="btnEdit">編輯專案資料</button>')
    +(cur.myRole==="owner"||cur.myRole==="admin"?'<button class="btn small" type="button" id="btnShare">分享'+(cur.members&&cur.members.length?'（'+cur.members.length+'）':'')+'</button>':'')
    +'<button class="btn small" type="button" id="btnPrint">列印／存 PDF</button>'
    +'<button class="btn small" type="button" id="btnReload">重新整理</button>'
    +(ro?'':'<button class="btn small" type="button" id="btnClose">'+(p.closed?"重新開啟專案":"標記為已結案")+'</button>')
    +(cur.myRole==="admin"?'<button class="btn small danger" type="button" id="btnDel">刪除專案</button>':'')
    +'</div></section>';
  h+='<div class="'+(ro?'ro':'')+'">';
  p.nodes.forEach(function(n,i){
    var ns=nodeStat(p,i), lab=ST_LABEL[ns.st];
    var open = (keepNode===i || (keepNode===undefined && s.next===i)) ? " open" : "";
    var dis = ro?" disabled":"";
    h+='<details class="node s-'+ns.st+'" id="node-'+i+'"'+open+'><summary>'
      +'<span class="num">'+(i+1)+'</span><span class="title">'+esc(NODES[i].name)+'</span>'
      +'<span class="badge '+lab[1]+'">'+lab[0]+'</span>'
      +'<span class="meta">預計 '+fmt(n.target)+(n.done?'｜完成 '+fmt(n.done):'')+'</span>'
      +'<span class="pct">'+ns.c+' / '+ns.total+'</span></summary>'
      +'<div class="node-body"><div class="dates">'
      +'<label>預計日期<input type="date" data-n="'+i+'" data-field="target" value="'+esc(n.target)+'"'+dis+'></label>'
      +'<label>實際完成日<input type="date" data-n="'+i+'" data-field="done" value="'+esc(n.done)+'"'+dis+'></label>'
      +'</div><div class="groups">';
    GROUPS.forEach(function(g){
      h+='<div class="group"><h4>'+g[1]+'</h4>';
      NODES[i][g[0]].forEach(function(txt,j){
        var id=g[0]+j, on=!!n.checks[id];
        h+='<label class="chk'+(on?' done':'')+'"><input type="checkbox" data-n="'+i+'" data-id="'+id+'"'+(on?' checked':'')+dis+'><span>'+esc(txt)+'</span></label>';
      });
      h+='</div>';
    });
    h+='</div><textarea class="note" data-n="'+i+'" maxlength="1000" placeholder="此結點的備註、問題或待辦（例：缺失編號、協調單號）"'+(ro?' readonly':'')+'>'+esc(n.note)+'</textarea></div></details>';
  });
  h+='</div>';
  $("app").innerHTML=h;
  showSaveState();
  bindDetail();
}
function info(k,v){ return '<div><b>'+k+'</b>'+esc(v||"—")+'</div>'; }
function rerender(i){ var y=window.scrollY; renderDetail(i); window.scrollTo(0,y); }
function bindDetail(){
  var p=cur.project;
  $("btnBack").onclick=function(){ go(""); };
  $("btnPrint").onclick=function(){ document.querySelectorAll("details.node").forEach(function(d){d.open=true;}); window.print(); };
  $("btnReload").onclick=function(){ if(saver.dirty){ toast("還有修改正在儲存，請稍候"); return; } var id=cur.id; cur=null; openProject(id); };
  document.querySelectorAll("[data-jump]").forEach(function(b){ b.onclick=function(){ var d=$("node-"+b.dataset.jump); d.open=true; d.scrollIntoView({behavior:"smooth",block:"start"}); }; });
  if($("btnShare")) $("btnShare").onclick=openShare;
  if($("btnDel")) $("btnDel").onclick=function(){
    var name=prompt("確定要刪除？專案資料夾會移到管理員雲端硬碟的垃圾桶（30 天內可還原）。\n請輸入專案名稱以確認：");
    if(name===null) return;
    if(name.trim()!==p.name.trim()){ toast("名稱不符，未刪除"); return; }
    api("remove",{id:cur.id,confirmName:name.trim()}).then(function(){ cur=null; toast("已刪除專案"); go(""); }).catch(fail);
  };
  if(!canEdit()) return;
  $("btnEdit").onclick=function(){ openForm(true); };
  $("btnClose").onclick=function(){ p.closed=!p.closed; queueSave(); renderDetail(); toast(p.closed?"已標記為結案":"已重新開啟"); };
  document.querySelectorAll('input[type=checkbox][data-id]').forEach(function(cb){
    cb.onchange=function(){
      var i=+cb.dataset.n, node=p.nodes[i];
      if(cb.checked) node.checks[cb.dataset.id]=true; else delete node.checks[cb.dataset.id];
      var ns=nodeStat(p,i);
      if(ns.st==="ok" && !node.done) node.done=today();
      if(ns.st!=="ok" && node.done && !cb.checked) node.done="";
      queueSave(); rerender(i);
    };
  });
  document.querySelectorAll('input[type=date][data-n]').forEach(function(inp){
    inp.onchange=function(){ var i=+inp.dataset.n; p.nodes[i][inp.dataset.field]=inp.value; queueSave(); rerender(i); };
  });
  document.querySelectorAll("textarea.note").forEach(function(t){
    t.oninput=function(){ p.nodes[+t.dataset.n].note=t.value; queueSave(1200); };
  });
}

/* ---------- 自動儲存（含版本衝突處理） ---------- */
function queueSave(delay){
  saver.dirty=true; saver.failed=false; saver.target=cur; showSaveState();
  clearTimeout(saver.timer); saver.timer=setTimeout(flushSave, delay||600);
}
function flushSave(){
  var target=saver.target;
  if(!target || !saver.dirty || !session.token) return;
  if(saver.busy){ clearTimeout(saver.timer); saver.timer=setTimeout(flushSave,400); return; }
  saver.busy=true; saver.dirty=false; showSaveState();
  api("save",{id:target.id, version:target.version, project:target.project}).then(function(r){
    target.version=r.version; target.updated=r.updated; target.updatedBy=r.updatedBy;
    saver.busy=false; showSaveState();
    var idx=data.projects.findIndex(function(x){return x.id===target.id;});
    if(idx>=0) data.projects[idx].version=r.version;
    if(saver.dirty) flushSave();
  }).catch(function(e){
    saver.busy=false;
    if(e.code==="CONFLICT"){
      saver.dirty=false;
      alert("其他人剛更新了這個專案，為避免互相覆蓋，已載入最新內容。\n請確認後再重新做一次您剛才的修改。");
      if(cur===target){ cur=null; openProject(target.id); } return;
    }
    if(e.code==="AUTH"){ saver.dirty=true; return; }
    saver.dirty=true; saver.failed=true; showSaveState();
    if(e.code==="FORBIDDEN"||e.code==="INVALID"||e.code==="NOT_FOUND"){ saver.dirty=false; saver.failed=false; toast(e.message); if(cur===target){ cur=null; openProject(target.id); } return; }
    clearTimeout(saver.timer); saver.timer=setTimeout(flushSave,8000);
  });
}
function showSaveState(){
  var el=$("saveState"); if(!el) return;
  el.className="savestate";
  if(saver.failed){ el.className="savestate bad"; el.textContent="儲存失敗，稍後自動重試…"; }
  else if((saver.busy||saver.dirty) && saver.target===cur) el.textContent="儲存中…";
  else if(cur && canEdit()) el.textContent="✓ 已儲存到雲端";
  else el.textContent="";
}
window.addEventListener("beforeunload",function(e){ if(saver.dirty||saver.busy){ e.preventDefault(); e.returnValue=""; } });

/* ---------- 新增／編輯 ---------- */
var editingExisting=false;
function openForm(existing){
  editingExisting=!!existing;
  var f=$("frm"), p=existing?cur.project:null;
  $("dlgTitle").textContent=existing?"編輯專案資料":"新增專案";
  FIELDS.forEach(function(k){ f.elements[k].value=p?(p[k]||""):""; });
  var isAdmin=session.me.role==="admin" && !existing;
  $("ownerWrap").hidden=!isAdmin;
  if(isAdmin){
    $("ownerSel").innerHTML=data.users.map(function(u){ return '<option value="'+esc(u.email)+'"'+(u.email===session.me.email?' selected':'')+'>'+esc(u.name?u.name+"（"+u.email+"）":u.email)+'</option>'; }).join("");
  }
  $("dlg").showModal();
}
$("frm").addEventListener("submit",function(e){
  if(e.submitter && e.submitter.value==="cancel") return;
  var f=e.target, d={};
  FIELDS.forEach(function(k){ d[k]=f.elements[k].value.trim(); });
  if(!d.name){ e.preventDefault(); return; }
  if(editingExisting){
    var p=cur.project, oldH=p.handover;
    FIELDS.forEach(function(k){ p[k]=d[k]; });
    if(d.handover && d.handover!==oldH){
      var blanks=p.nodes.filter(function(n){return !n.target;}).length;
      if(blanks===p.nodes.length || confirm("交屋日已變更，要依新交屋日重新帶入各結點的建議日期嗎？\n（已手動填寫的日期會被覆蓋）")){
        p.nodes.forEach(function(n,i){ var t=addDays(d.handover,OFFSETS[i]); if(t>=today()) n.target=t; });
      }
    }
    queueSave(); renderDetail(); toast("已更新專案資料");
  }else{
    var proj={closed:false,nodes:newNodes(d.handover)};
    FIELDS.forEach(function(k){ proj[k]=d[k]; });
    var payload={project:proj};
    if(session.me.role==="admin") payload.owner=f.elements.owner.value;
    toast("建立中…");
    api("create",payload).then(function(v){ cur=v; toast("已建立專案，資料夾已建立於雲端"); go("p="+v.id); }).catch(fail);
  }
});

/* ---------- 分享 ---------- */
function openShare(){ renderShare(); $("dlgShare").showModal(); }
function renderShare(){
  $("shareOwner").textContent="負責人："+userLabel(cur.owner);
  var members=cur.members||[];
  $("memberList").innerHTML = members.length ? members.map(function(m){
    return '<li><span class="who">'+esc(userLabel(m.email))+'</span>'
      +'<select data-m="'+esc(m.email)+'"><option value="editor"'+(m.perm==="editor"?" selected":"")+'>可編輯</option><option value="viewer"'+(m.perm==="viewer"?" selected":"")+'>僅檢視</option></select>'
      +'<button class="btn small danger" type="button" data-rm="'+esc(m.email)+'">移除</button></li>';
  }).join("") : '<li class="meta">尚未分享給任何人</li>';
  var taken={}; taken[cur.owner]=1; members.forEach(function(m){taken[m.email]=1;});
  var opts=data.users.filter(function(u){return !taken[u.email];});
  $("shareUser").innerHTML = opts.length ? opts.map(function(u){ return '<option value="'+esc(u.email)+'">'+esc(u.name?u.name+"（"+u.email+"）":u.email)+'</option>'; }).join("") : '<option value="">沒有其他可分享的帳號</option>';
  $("btnShareAdd").disabled=!opts.length;
  var admin=cur.myRole==="admin";
  $("ownerAdmin").hidden=!admin;
  if(admin){
    $("newOwner").innerHTML=data.users.map(function(u){ return '<option value="'+esc(u.email)+'"'+(u.email===cur.owner?" selected":"")+'>'+esc(u.name?u.name+"（"+u.email+"）":u.email)+'</option>'; }).join("");
  }
  document.querySelectorAll("#memberList [data-m]").forEach(function(s){ s.onchange=function(){ doShare(s.dataset.m,s.value); }; });
  document.querySelectorAll("#memberList [data-rm]").forEach(function(b){ b.onclick=function(){ doShare(b.dataset.rm,"remove"); }; });
}
function doShare(email,perm){
  api("share",{id:cur.id,email:email,perm:perm}).then(function(r){
    cur.members=r.members; renderShare(); toast(perm==="remove"?"已移除分享":"已更新分享"); renderDetailKeep();
  }).catch(fail);
}
function renderDetailKeep(){ var y=window.scrollY; renderDetail(); window.scrollTo(0,y); }
$("btnShareAdd").onclick=function(){ var e=$("shareUser").value; if(e) doShare(e,$("sharePerm").value); };
$("btnShareClose").onclick=function(){ $("dlgShare").close(); };
$("btnSetOwner").onclick=function(){
  var e=$("newOwner").value; if(!e||e===cur.owner) return;
  var keep=confirm("變更負責人為 "+userLabel(e)+"。\n原負責人要保留「可編輯」權限嗎？\n（確定＝保留；取消＝不保留）");
  api("setOwner",{id:cur.id,email:e,keepPrevious:keep}).then(function(r){ cur.owner=r.owner; cur.members=r.members; renderShare(); renderDetailKeep(); toast("已變更負責人"); }).catch(fail);
};

/* ---------- 權限管理（管理員） ---------- */
function renderAdmin(){
  if(session.me.role!=="admin"){ go(""); return; }
  $("app").innerHTML='<div class="loading">讀取中…</div>';
  Promise.all([api("adminUsers"),api("adminAudit",{limit:200})]).then(function(r){
    var users=r[0].users, fixed=r[0].fixedAdmins||[], logs=r[1].rows;
    var h='<div class="back"><button class="btn small" type="button" id="btnBack">← 返回專案列表</button></div>';
    h+='<section class="panel"><h3>使用者與權限</h3><p class="meta">只有名單中「啟用」的帳號可以登入。工程師只看得到自己負責或被分享的專案；勾選「可建立專案」才能新增專案。</p>'
      +'<div class="tblwrap"><table class="cards"><thead><tr><th>Google 帳號</th><th>姓名</th><th>角色</th><th>可建立專案</th><th>啟用</th><th>備註</th><th></th></tr></thead><tbody>';
    users.forEach(function(u,i){
      var locked=fixed.indexOf(u.email)>=0;
      h+='<tr data-u="'+i+'"><td class="mono" data-label="帳號">'+esc(u.email)+(locked?'<br><span class="meta">（系統管理員）</span>':'')+'</td>'
        +'<td data-label="姓名"><input type="text" maxlength="30" data-k="name" value="'+esc(u.name)+'"></td>'
        +'<td data-label="角色"><select data-k="role"'+(locked?' disabled':'')+'><option value="engineer"'+(u.role!=="admin"?" selected":"")+'>工程師</option><option value="admin"'+(u.role==="admin"?" selected":"")+'>管理員</option></select></td>'
        +'<td class="c" data-label="可建立專案"><input type="checkbox" data-k="canCreate"'+(u.canCreate?" checked":"")+(locked?' disabled':'')+'></td>'
        +'<td class="c" data-label="啟用"><input type="checkbox" data-k="enabled"'+(u.enabled?" checked":"")+(locked?' disabled':'')+'></td>'
        +'<td data-label="備註"><input type="text" maxlength="100" data-k="memo" value="'+esc(u.memo)+'"></td>'
        +'<td class="act"><button class="btn small" type="button" data-save="'+i+'">儲存</button></td></tr>';
    });
    h+='<tr id="newUserRow"><td class="newhead">新增使用者</td><td data-label="帳號"><input type="email" maxlength="254" id="nuEmail" placeholder="新同事的 Google 帳號"></td>'
      +'<td data-label="姓名"><input type="text" maxlength="30" id="nuName" placeholder="姓名"></td>'
      +'<td data-label="角色"><select id="nuRole"><option value="engineer">工程師</option><option value="admin">管理員</option></select></td>'
      +'<td class="c" data-label="可建立專案"><input type="checkbox" id="nuCreate"></td><td class="c" data-label="啟用"><input type="checkbox" id="nuEnabled" checked></td>'
      +'<td data-label="備註"><input type="text" maxlength="100" id="nuMemo" placeholder="例：工務部"></td>'
      +'<td class="act"><button class="btn small primary" type="button" id="btnAddUser">新增</button></td></tr>';
    h+='</tbody></table></div><p class="hint">停用帳號後，對方立即無法登入或讀取任何專案（已分享的設定保留，重新啟用即恢復）。</p></section>';
    h+='<section class="panel"><div class="row"><h3>操作紀錄（最近 200 筆）</h3><button class="btn small" type="button" id="btnAuditReload">重新整理</button></div>'
      +'<div class="tblwrap"><table class="cards log"><thead><tr><th>時間</th><th>帳號</th><th>動作</th><th>專案</th><th>內容</th><th>結果</th></tr></thead><tbody>'
      +(logs.length?logs.map(function(r){ return '<tr><td style="white-space:nowrap" data-label="時間">'+fmtTime(r[0])+'</td><td class="mono" data-label="帳號">'+esc(r[1])+'</td><td data-label="動作">'+esc(r[2])+'</td><td class="mono" data-label="專案">'+esc(r[3]||"—")+'</td><td data-label="內容">'+esc(r[4]||"—")+'</td><td data-label="結果">'+esc(r[5])+'</td></tr>'; }).join(""):'<tr><td colspan="6" class="meta">尚無紀錄</td></tr>')
      +'</tbody></table></div></section>';
    $("app").innerHTML=h;
    $("btnBack").onclick=function(){ go(""); };
    $("btnAuditReload").onclick=renderAdmin;
    document.querySelectorAll("[data-save]").forEach(function(b){
      b.onclick=function(){
        var tr=b.closest("tr"), u=users[+b.dataset.save];
        var g=function(k){ return tr.querySelector('[data-k="'+k+'"]'); };
        saveUser({email:u.email,name:g("name").value,role:g("role").value,canCreate:g("canCreate").checked,enabled:g("enabled").checked,memo:g("memo").value});
      };
    });
    $("btnAddUser").onclick=function(){
      var email=$("nuEmail").value.trim().toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast("請輸入正確的 Google 帳號"); return; }
      if(users.some(function(u){return u.email===email;})){ toast("此帳號已在名單中"); return; }
      saveUser({email:email,name:$("nuName").value,role:$("nuRole").value,canCreate:$("nuCreate").checked,enabled:$("nuEnabled").checked,memo:$("nuMemo").value});
    };
  }).catch(function(e){ fail(e); });
}
function saveUser(u){
  if(u.role==="admin" && !confirm("確定要將 "+u.email+" 設為管理員？管理員可以看到並修改所有專案、管理使用者。")) return;
  api("adminSaveUser",u).then(function(){ toast("已儲存 "+u.email); data.users=[]; renderAdmin(); }).catch(fail);
}

/* ---------- 匯入舊版資料（瀏覽器本機或 JSON 檔） ---------- */
$("btnImport").onclick=function(){
  var legacy=null;
  try{ var raw=localStorage.getItem(LEGACY_KEY); if(raw){ legacy=JSON.parse(raw); } }catch(e){}
  if(legacy && Array.isArray(legacy.projects) && legacy.projects.length){
    if(confirm("在這台電腦的瀏覽器找到舊版網頁的 "+legacy.projects.length+" 個專案。\n按「確定」搬移到雲端；按「取消」改選 JSON 備份檔。")){
      importProjects(legacy.projects, true); return;
    }
  }
  $("fileImport").click();
};
$("fileImport").onchange=function(e){
  var file=e.target.files[0]; if(!file) return;
  if(file.size>2*1024*1024){ toast("檔案過大"); e.target.value=""; return; }
  var r=new FileReader();
  r.onload=function(){
    try{
      var s=JSON.parse(r.result);
      if(!s || !Array.isArray(s.projects)) throw new Error();
      importProjects(s.projects,false);
    }catch(err){ toast("匯入失敗：檔案格式不符"); }
    e.target.value="";
  };
  r.readAsText(file);
};
function importProjects(list,fromLocal){
  var ok=0, bad=0, i=0;
  list=list.filter(function(p){ return p && p.name && Array.isArray(p.nodes) && p.nodes.length===NODES.length; });
  if(!list.length){ toast("沒有可匯入的專案"); return; }
  if(!confirm("將建立 "+list.length+" 個新專案（每個專案會在雲端建立一個資料夾）。要繼續嗎？")) return;
  (function next(){
    if(i>=list.length){
      toast("匯入完成：成功 "+ok+" 個"+(bad?"，失敗 "+bad+" 個":""));
      if(fromLocal && ok===list.length && confirm("已全部搬到雲端。要清除這台電腦瀏覽器裡的舊資料嗎？")){ try{ localStorage.removeItem(LEGACY_KEY); }catch(e){} }
      cur=null; go(""); loadList(); return;
    }
    var src=list[i++], proj={closed:!!src.closed,nodes:[]};
    FIELDS.forEach(function(k){ proj[k]=src[k]==null?"":String(src[k]); });
    proj.nodes=src.nodes.map(function(n){ var c={}; Object.keys((n&&n.checks)||{}).forEach(function(k){ if(n.checks[k]===true && /^(task|gate|form)\d{1,2}$/.test(k)) c[k]=true; }); return {target:(n&&n.target)||"",done:(n&&n.done)||"",note:String((n&&n.note)||""),checks:c}; });
    toast("匯入中… "+i+" / "+list.length);
    api("create",{project:proj}).then(function(){ ok++; next(); }).catch(function(e){ bad++; if(e.code==="AUTH") return; next(); });
  })();
}

/* ---------- 主題 ---------- */
var THEME_KEY="wv-project-tracker-theme";
function isDark(){ var cur=document.documentElement.getAttribute("data-theme"); return cur?cur==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches; }
function applyTheme(t){ if(t) document.documentElement.setAttribute("data-theme",t); else document.documentElement.removeAttribute("data-theme"); }
try{ applyTheme(localStorage.getItem(THEME_KEY)); }catch(e){}
function toggleTheme(){ var next=isDark()?"light":"dark"; applyTheme(next); try{ localStorage.setItem(THEME_KEY,next); }catch(e){} }
$("btnTheme").onclick=toggleTheme; $("btnTheme2").onclick=toggleTheme;

/* ---------- 其他按鈕與路由 ---------- */
$("btnNew").onclick=function(){ openForm(false); };
$("btnAdmin").onclick=function(){ go("admin"); };
$("btnLogout").onclick=logout;
function go(h){ if(location.hash.replace(/^#/,"")===h) route(); else location.hash=h; window.scrollTo(0,0); }
function route(){
  if(!session.me) return;
  var h=location.hash.replace(/^#/,"");
  var m=h.match(/^p=([a-f0-9]{12})$/);
  if(m){ openProject(m[1]); return; }
  if(saver.dirty) flushSave();
  cur=null;
  if(h==="admin"){ renderAdmin(); return; }
  loadList();
}
window.addEventListener("hashchange",route);
showLogin();
})();
