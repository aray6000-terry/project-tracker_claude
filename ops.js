/* 弱電專案平台 — 營運功能畫面：首頁儀表板、圖面、現場照片與問題、領料、請款、廠牌確認表、變更紀錄 */
(function(){
"use strict";
var T = window.TR; if(!T) return;
var esc=T.esc, api=T.api, toast=T.toast, fmt=T.fmt, fmtTime=T.fmtTime, fail=T.fail;
var $=function(id){ return document.getElementById(id); };
var REQ_LABEL={approval:"異常單待主管簽核",submitted:"待採購確認",confirmed:"待倉管出貨",rejected:"採購退回",shipped:"已出貨",cancelled:"已取消"};
var BILL_LABEL={pending:"未達成",done:"已完工待請款",billed:"已請款",invoiced:"已開票",paid:"已收款"};
var ISSUE_LABEL={open:"待處理",doing:"處理中",closed:"已結案"};
var FIELD_LABEL={name:"專案名稱",client:"業主／營造",site:"案場地點",engineer:"負責工程師",mentor:"帶案師父",amount:"合約金額（舊欄位）",handover:"預計驗屋交屋日",note:"備註",
  salesRep:"業務負責人",contractNo:"合約編號",contractAmount:"合約總價",payCondition:"付款條件",otherName:"其它系統名稱"};
function caps(){ return (T.session.me&&T.session.me.caps)||{}; }
function me(){ return T.session.me||{}; }
function dOnly(iso){ return iso?String(fmtTime(iso)).split(" ")[0]:""; }
function money(n){ return n===undefined||n===null?"—":"NT$ "+Math.round(Number(n)||0).toLocaleString(); }
function chip(cls,txt){ return '<span class="status st-'+cls+'">'+esc(txt)+'</span>'; }
function nodeName(i){ return i>=0&&T.NODES[i]?("結點"+(i+1)+" "+T.NODES[i].name):"不指定結點"; }
function nodeOptions(sel,allowNone){ return (allowNone?'<option value="-1">不指定結點</option>':'')+T.NODES.map(function(n,i){ return '<option value="'+i+'"'+(i===sel?" selected":"")+'>結點'+(i+1)+' '+esc(n.name)+'</option>'; }).join(""); }
function sizeTxt(b){ return b>1048576?(b/1048576).toFixed(1)+" MB":Math.max(1,Math.round(b/1024))+" KB"; }
function loading(el){ el.innerHTML='<div class="loading">讀取中…</div>'; }
function checkLabel(n,k){
  var m=/^(task|gate|form)(\d+)$/.exec(k); if(!m||!T.NODES[n]) return k;
  return (T.NODES[n][m[1]]||[])[+m[2]]||k;
}
/** 以新視窗列印指定內容（領料單、廠牌確認表） */
function printHtml(title,body){
  var w=window.open("","_blank"); if(!w){ toast("請允許彈出視窗後再列印"); return; }
  w.document.write('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>'
    +'body{font-family:"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif;padding:24px;color:#111}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin:12px 0}'
    +'th,td{border:1px solid #999;padding:6px 8px;font-size:13px;text-align:left}th{background:#eee}.sign{display:flex;gap:24px;margin-top:48px}.sign div{flex:1;border-top:1px solid #000;padding-top:6px;text-align:center}'
    +'.meta{color:#444;font-size:13px}</style></head><body>'+body+'</body></html>');
  w.document.close(); setTimeout(function(){ w.focus(); w.print(); },300);
}
/** 大型文字圖檔（DXF 等）在瀏覽器內壓成 ZIP（DXF 通常可縮到 1/8～1/10），邊讀邊壓，不佔大量記憶體 */
var CRC_TABLE=(function(){ var t=new Uint32Array(256); for(var n=0;n<256;n++){ var c=n; for(var k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } return t; })();
function zipFile(file,onProgress){
  if(typeof CompressionStream==="undefined"||!file.stream) return Promise.reject(new Error("此瀏覽器無法自動壓縮，請先把檔案壓成 ZIP 再上傳"));
  var crc=0xFFFFFFFF, read=0, total=file.size||1;
  var tap=new TransformStream({transform:function(chunk,ctl){
    for(var i=0,n=chunk.length;i<n;i++) crc=CRC_TABLE[(crc^chunk[i])&0xFF]^(crc>>>8);
    read+=chunk.length; if(onProgress) onProgress(read/total); ctl.enqueue(chunk);
  }});
  return new Response(file.stream().pipeThrough(tap).pipeThrough(new CompressionStream("deflate-raw"))).blob().then(function(body){
    crc=(crc^0xFFFFFFFF)>>>0;
    var name=new TextEncoder().encode(file.name), d=new Date(file.lastModified||Date.now());
    var dt=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xFFFF, dd=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF;
    function hdr(central){
      var b=new DataView(new ArrayBuffer(central?46:30)), o=0;
      function u16(v){ b.setUint16(o,v,true); o+=2; } function u32(v){ b.setUint32(o,v>>>0,true); o+=4; }
      u32(central?0x02014b50:0x04034b50); if(central) u16(20); u16(20); u16(0x0800); u16(8); u16(dt); u16(dd);
      u32(crc); u32(body.size); u32(file.size); u16(name.length); u16(0);
      if(central){ u16(0); u16(0); u16(0); u32(0); u32(0); }
      return b.buffer;
    }
    var local=hdr(false), cen=hdr(true), cenOff=local.byteLength+name.length+body.size;
    var end=new DataView(new ArrayBuffer(22));
    end.setUint32(0,0x06054b50,true); end.setUint16(8,1,true); end.setUint16(10,1,true);
    end.setUint32(12,cen.byteLength+name.length,true); end.setUint32(16,cenOff,true);
    return new File([local,name,body,cen,name,end.buffer],file.name+".zip",{type:"application/zip"});
  });
}
var MAX_UP=25*1024*1024;
/** 超過 25MB 的 DXF／文字檔自動壓成 ZIP；壓縮後仍超過才擋下 */
function fitUpload(f,msg){
  if(f.size<=MAX_UP) return Promise.resolve(f);
  if(!/\.(dxf|txt|csv)$/i.test(f.name)) return Promise.reject(new Error("「"+f.name+"」超過 25MB"));
  return zipFile(f,function(p){ if(msg) msg.textContent="壓縮「"+f.name+"」中… "+Math.round(p*100)+"%"; }).then(function(z){
    if(z.size>MAX_UP) throw new Error("「"+f.name+"」壓縮後仍有 "+(z.size/1048576).toFixed(1)+"MB，超過 25MB");
    return z;
  });
}
function b64FromFile(file){
  return new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){ res(String(r.result).split(",")[1]||""); }; r.onerror=rej; r.readAsDataURL(file); });
}
/** 照片壓縮：最長邊 1600px 的 JPEG，另產生 320px 縮圖 */
function shrinkImage(file){
  return new Promise(function(res,rej){
    var url=URL.createObjectURL(file), img=new Image();
    img.onload=function(){
      function draw(max,q){ var s=Math.min(1,max/Math.max(img.width,img.height)), c=document.createElement("canvas");
        c.width=Math.round(img.width*s); c.height=Math.round(img.height*s); c.getContext("2d").drawImage(img,0,0,c.width,c.height);
        return c.toDataURL("image/jpeg",q).split(",")[1]; }
      var full=draw(1600,0.82), thumb=draw(320,0.6); URL.revokeObjectURL(url); res({data:full,thumb:thumb});
    };
    img.onerror=function(){ URL.revokeObjectURL(url); rej(new Error("無法讀取圖片")); };
    img.src=url;
  });
}
function download(fileId){
  toast("下載中…");
  api("fileGet",{fileId:fileId}).then(function(f){
    var bin=atob(f.data), u=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
    var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([u],{type:f.mime||"application/octet-stream"})); a.download=f.name;
    document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1000);
  }).catch(fail);
}
function lightbox(fileId,caption){
  var box=document.createElement("div"); box.className="lightbox"; box.innerHTML='<div><div class="loading" style="color:#fff">讀取照片中…</div></div>';
  box.onclick=function(){ box.remove(); }; document.body.appendChild(box);
  api("fileGet",{fileId:fileId}).then(function(f){ box.innerHTML='<div><img alt="'+esc(caption||f.name)+'" src="data:'+esc(f.mime)+';base64,'+f.data+'"><p>'+esc(caption||f.name)+'（點一下關閉）</p></div>'; })
    .catch(function(e){ box.remove(); fail(e); });
}

/* ======================== 首頁儀表板 ======================== */
T.views.home=function(){
  var app=$("app"); loading(app);
  var c=caps();
  Promise.all([api("dashboard"), c.projects?api("list"):Promise.resolve({projects:[],users:[]})]).then(function(r){
    var d=r[0], ps=r[1].projects||[]; T.data.projects=ps; if(r[1].users&&r[1].users.length) T.data.users=r[1].users;
    var stats=ps.map(function(x){ return T.sumStat(x.summary||{}); });
    var active=stats.filter(function(s){return s.status!=="closed";}).length, late=stats.filter(function(s){return s.status==="late";}).length;
    var h='<section class="panel" style="margin-bottom:14px"><h3>'+esc(me().name||me().email)+'，您好</h3><p class="meta" style="margin:0">角色：'+esc(me().roleName||"")+'。以下是您需要關注的事項。</p></section>';
    h+='<div class="kpis">';
    if(c.projects) h+=kpi(active,"進行中專案")+kpi(late,"有逾期結點的專案",late?"bad":"");
    h+=kpi(d.issueCount||0,"未結案問題",d.issueCount?"warn":"");
    if(d.approvalCount) h+=kpi(d.approvalCount,"待我簽核的異常單","warn");
    if(c.reqConfirm) h+=kpi(d.reqs.submitted||0,"待採購確認領料單",d.reqs.submitted?"warn":"");
    if(c.reqShip) h+=kpi(d.reqs.confirmed||0,"待出貨領料單",d.reqs.confirmed?"warn":"");
    if(c.reqCreate&&!c.reqConfirm) h+=kpi((d.reqs.submitted||0)+(d.reqs.confirmed||0),"處理中的領料單");
    if(d.bills){
      if(d.bills.contract!==undefined){ h+=kpi(money(d.bills.contract),"合約總額")+kpi(money(d.bills.billed),"已請款")+kpi(money(d.bills.paid),"已收款")+kpi(money(d.bills.contract-d.bills.paid),"未收款"); }
      h+=kpi(d.bills.overdue.length,"完工逾 "+d.bills.remindDays+" 天未請款",d.bills.overdue.length?"bad":"");
      if(c.billInvoice) h+=kpi(d.bills.toInvoice.length,"待開立發票",d.bills.toInvoice.length?"warn":"")+kpi(d.bills.toCollect.length,"待收款",d.bills.toCollect.length?"warn":"");
    }
    h+='</div>';
    var todo=[];
    if(d.bills) d.bills.overdue.forEach(function(b){ todo.push('<li><div class="main"><b>'+esc(b.pname)+'｜'+esc(b.name)+'</b><span class="meta">完工回報已 '+b.daysSinceDone+' 天，尚未送出請款</span></div>'+chip("overdue","逾期未請款")+'<a class="btn small" href="#p='+esc(b.pid)+'/bills">前往請款</a></li>'); });
    if(d.bills&&c.billInvoice){
      d.bills.toInvoice.forEach(function(b){ todo.push('<li><div class="main"><b>'+esc(b.pname)+'｜'+esc(b.name)+'</b><span class="meta">'+money(b.billAmount)+'，'+fmtTime(b.billedAt)+' 由 '+esc(T.userName(b.billedBy))+' 請款</span></div>'+chip("billed","待開票")+'<a class="btn small" href="#p='+esc(b.pid)+'/bills">開立發票</a></li>'); });
      d.bills.toCollect.forEach(function(b){ todo.push('<li><div class="main"><b>'+esc(b.pname)+'｜'+esc(b.name)+'</b><span class="meta">發票 '+esc(b.invoiceNo)+'，'+money(b.billAmount)+'</span></div>'+chip("invoiced","待收款")+'<a class="btn small" href="#p='+esc(b.pid)+'/bills">登錄收款</a></li>'); });
    }
    (d.reqQueue||[]).forEach(function(q){ todo.push('<li><div class="main"><b>領料單 '+esc(q.id)+'｜'+esc(q.pname)+'</b><span class="meta">'+q.items.length+' 項，'+esc(T.userName(q.by))+' 申請'+(q.needDate?'，需用 '+fmt(q.needDate):'')+'</span></div>'+chip(q.status,REQ_LABEL[q.status])+'<a class="btn small" href="#reqs">處理</a></li>'); });
    h+='<section class="panel"><h3>待辦事項</h3>'+(todo.length?'<ul class="list">'+todo.join("")+'</ul>':'<p class="meta">目前沒有待辦事項。</p>')+'</section>';
    if(d.issues.length) h+='<section class="panel"><h3>未結案問題（'+d.issueCount+'）</h3><ul class="list">'+d.issues.slice(0,10).map(function(i){
      return '<li><div class="main"><b>'+(i.priority==="high"?'<span style="color:var(--bad)">［急］</span>':'')+esc(i.title)+'</b><span class="meta">'+esc(i.pname)+'｜'+esc(nodeName(i.node))+'｜'+esc(T.userName(i.by))+' '+fmtTime(i.at)+'</span></div>'+chip(i.status,ISSUE_LABEL[i.status])+'<a class="btn small" href="#p='+esc(i.pid)+'/site">查看</a></li>'; }).join("")+'</ul></section>';
    if(d.projects&&d.projects.length) h+=projectStatsPanel(d.projects);
    if(c.projects&&ps.length){
      var recent=ps.slice().sort(function(a,b){ return String(b.updated).localeCompare(String(a.updated)); }).slice(0,6);
      h+='<section class="panel"><div class="row"><h3>最近更新的專案</h3><a class="btn small" href="#projects">全部專案</a></div><ul class="list">'+recent.map(function(x){
        var s=T.sumStat(x.summary||{}), lb=T.PST_LABEL[s.status];
        return '<li><div class="main"><b>'+esc((x.summary||{}).name)+'</b><span class="meta">'+s.pct+'%｜更新 '+fmtTime(x.updated)+'</span></div><span class="badge '+lb[1]+'">'+lb[0]+'</span><a class="btn small" href="#p='+esc(x.id)+'">開啟</a></li>'; }).join("")+'</ul></section>';
    }
    app.innerHTML=h;
  }).catch(function(e){ app.innerHTML='<div class="empty">'+esc(e.message||"讀取失敗")+'</div>'; });
};
/* 首頁：各專案狀態統計 */
function projectStatsPanel(list){
  var show=view.psAll?list:list.filter(function(p){ return !p.closed; });
  var hasBills=list.some(function(p){ return p.bills; }), hasAmt=list.some(function(p){ return p.bills&&p.bills.contract!==undefined; });
  var n=function(v){ return v?String(v):'<span class="meta">0</span>'; };
  var rows=show.map(function(p){
    var pct=p.total?Math.round(p.done/p.total*100):0;
    var stage=p.closed?'已結案':p.next>=0&&T.NODES[p.next]?'結點'+(p.next+1)+' '+T.NODES[p.next].name+(p.nextTarget?'（預計 '+fmt(p.nextTarget)+'）':''):'全部完成';
    var late=!p.closed&&p.nextTarget&&p.nextTarget<new Date().toISOString().slice(0,10);
    var rq=p.reqs||{};
    return '<tr><td><a href="#p='+esc(p.id)+'">'+esc(p.name)+'</a></td><td><div class="bar"><span style="width:'+pct+'%"></span></div><span class="meta">'+p.done+'/'+p.total+'</span></td><td'+(late?' class="bad"':'')+'>'+esc(stage)+(late?'（逾期）':'')+'</td>'
      +'<td>'+n(rq.approval)+'</td><td>'+n((rq.submitted||0)+(rq.confirmed||0))+'</td><td>'+n(rq.shipped)+'</td><td>'+n(p.issues)+'</td>'
      +(hasBills?'<td>'+(p.bills?p.bills.paid+'/'+p.bills.terms+(p.bills.overdue?' <span class="bad">逾期 '+p.bills.overdue+'</span>':''):'—')+'</td>':'')
      +(hasAmt?'<td>'+(p.bills&&p.bills.contract!==undefined?money(p.bills.paidAmt)+' / '+money(p.bills.contract):'—')+'</td>':'')
      +'<td>'+(p.hasDeal?'✓':'<span class="meta">—</span>')+'</td><td>'+(p.hasContract?'✓':'<span class="meta">—</span>')+'</td></tr>';
  }).join("");
  setTimeout(function(){ var b=$("btnPsAll"); if(b) b.onclick=function(){ view.psAll=!view.psAll; T.views.home(); }; },0);
  return '<section class="panel"><div class="row"><h3>各專案狀態（'+show.length+'）</h3><button class="btn small" id="btnPsAll" type="button">'+(view.psAll?'只看進行中':'含已結案')+'</button></div>'
    +'<div class="tblwrap"><table class="pstat"><thead><tr><th>專案</th><th>進度</th><th>目前階段</th><th>異常待簽</th><th>領料處理中</th><th>已出貨</th><th>未結問題</th>'+(hasBills?'<th>已收款期數</th>':'')+(hasAmt?'<th>已收／合約</th>':'')+'<th>成交報價單</th><th>合約</th></tr></thead><tbody>'
    +(rows||'<tr><td colspan="11" class="meta">沒有進行中的專案</td></tr>')+'</tbody></table></div></section>';
}
function kpi(n,l,cls){ return '<div class="kpi '+(cls||"")+'"><div class="n">'+esc(n)+'</div><div class="l">'+esc(l)+'</div></div>'; }

/* ======================== 專案分頁 ======================== */
T.views.projectTab=function(tab,el){
  var cur=T.getCur(); if(!cur) return;
  if(tab==="files") return filesTab(cur,el);
  if(tab==="qty" && T.views.qtyTab) return T.views.qtyTab(cur,el);
  if(tab==="design" && T.views.designTab) return T.views.designTab(cur,el);
  if(tab==="site") return siteTab(cur,el);
  if(tab==="reqs") return reqsView(el,cur);
  if(tab==="bills") return billsTab(cur,el);
  if(tab==="brands") return brandsTab(cur,el);
  if(tab==="log") return logTab(cur,el);
  el.innerHTML='<div class="empty">找不到此頁面</div>';
};

/* --- 圖面檔案 --- */
function filesTab(cur,el){
  loading(el);
  api("files",{id:cur.id,kind:"drawing"}).then(function(r){
    var edit=T.canEdit();
    var h='<section class="panel"><h3>圖面檔案</h3><p class="meta">檔案存放在公司雲端「平台資料」的專案資料夾（圖面），只有可看到此專案的人能下載。支援 DWF、DXF、DWG、ZIP、PDF、圖片、Excel，單檔 25MB 以內；超過 25MB 的 DXF 會自動壓縮成 ZIP 再上傳（通常可縮到原本的 1/10）。<br>要自動計算各樓層設備數量，請到「數量・報價」分頁分析 <b>DXF</b>。</p>';
    if(edit) h+='<div class="uprow"><select id="upNode" class="fld" aria-label="對應結點">'+nodeOptions(-1,true)+'</select><input type="text" id="upCap" class="fld" maxlength="200" placeholder="說明（例：3F 弱電平面圖 R2）"><input type="file" id="upFile" multiple accept=".dwf,.dwfx,.dxf,.dwg,.zip,.pdf,.jpg,.jpeg,.png,.xlsx,.xls"><button class="btn primary small" id="btnUp" type="button">上傳</button></div><p class="hint" id="upMsg"></p>';
    h+=r.files.length?'<ul class="list">'+r.files.map(function(f){
      var mine=f.by===me().email||cur.myRole==="admin"||cur.myRole==="manager";
      return '<li><div class="main"><b>'+esc(f.name)+'</b><span class="meta">'+sizeTxt(f.size)+'｜'+esc(nodeName(f.node))+(f.caption?'｜'+esc(f.caption):'')+'｜'+esc(T.userName(f.by))+' '+fmtTime(f.at)+'</span></div>'
        +'<button class="btn small" data-dl="'+esc(f.id)+'" type="button">下載</button>'+(edit&&mine?'<button class="btn small danger" data-del="'+esc(f.id)+'" data-name="'+esc(f.name)+'" type="button">刪除</button>':'')+'</li>'; }).join("")+'</ul>':'<p class="meta">尚未上傳圖面。</p>';
    el.innerHTML=h+'</section><div id="sldBox"></div><div id="moneyList"></div><div id="subList"></div>';
    bindFiles(el,cur,function(){ filesTab(cur,el); });
    if(T.views.sldPanel) T.views.sldPanel(cur,$("sldBox"));
    if(canSeeMoney()) moneyFiles(cur,function(){ filesTab(cur,el); });
    api("files",{id:cur.id,kind:"submittal"}).then(function(r2){
      if(!r2.files.length||!$("subList")) return;
      $("subList").innerHTML='<section class="panel"><h3>送審資料（'+r2.files.length+'）</h3><p class="meta">由「數量・報價」分頁的「產生送審資料」建立。</p><ul class="list">'+r2.files.map(function(f){
        return '<li><div class="main"><b>'+esc(f.name)+'</b><span class="meta">'+esc(f.caption)+'｜'+esc(T.userName(f.by))+' '+fmtTime(f.at)+'</span></div><button class="btn small" data-dl="'+esc(f.id)+'" type="button">下載</button></li>'; }).join("")+'</ul></section>';
      bindFiles($("subList"),cur,function(){ filesTab(cur,el); });
    }).catch(function(){});
    if(edit) $("btnUp").onclick=function(){ uploadFiles(cur,"drawing",$("upFile").files,{node:+$("upNode").value,caption:$("upCap").value},function(){ filesTab(cur,el); }); };
  }).catch(function(e){ el.innerHTML='<div class="empty">'+esc(e.message)+'</div>'; });
}
/* 合約、成交報價單（含金額，只有業務、主管、會計、採購、CEO 看得到） */
function moneyFiles(cur,reload){
  Promise.all([api("files",{id:cur.id,kind:"contract"}),api("files",{id:cur.id,kind:"deal"})]).then(function(r){
    var box=$("moneyList"); if(!box) return;
    var up=canUpMoney(cur)&&T.canEdit();
    var li=function(f){ var mine=f.by===me().email||cur.myRole==="admin"||cur.myRole==="manager";
      return '<li><div class="main"><b>'+esc(f.name)+'</b><span class="meta">'+sizeTxt(f.size)+(f.caption?'｜'+esc(f.caption):'')+'｜'+esc(T.userName(f.by))+' '+fmtTime(f.at)+'</span></div><button class="btn small" data-dl="'+esc(f.id)+'" type="button">下載</button>'+(up&&mine?'<button class="btn small danger" data-del="'+esc(f.id)+'" data-name="'+esc(f.name)+'" type="button">刪除</button>':'')+'</li>'; };
    var h='<section class="panel"><h3>合約（'+r[0].files.length+'）</h3><p class="meta">存放在專案資料夾「合約」，只有業務、主管、會計、採購與 CEO 看得到。支援 PDF、Word、Excel、圖片、ZIP。</p>';
    if(up) h+='<div class="uprow"><input type="text" id="ctCap" class="fld" maxlength="200" placeholder="說明（例：工程合約 2026-10-30 用印版）"><input type="file" id="ctFile" multiple accept=".pdf,.doc,.docx,.xlsx,.xls,.jpg,.jpeg,.png,.zip"><button class="btn primary small" id="btnCt" type="button">上傳合約</button></div>';
    h+=r[0].files.length?'<ul class="list">'+r[0].files.map(li).join("")+'</ul>':'<p class="meta">尚未上傳合約。</p>';
    h+='</section><section class="panel"><h3>成交報價單原始檔（'+r[1].files.length+'）</h3><p class="meta">請在「領料」分頁上傳成交報價單，系統會同時解析品項並保存原始檔。</p>'
      +(r[1].files.length?'<ul class="list">'+r[1].files.map(li).join("")+'</ul>':'<p class="meta">尚未上傳。</p>')+'</section>';
    box.innerHTML=h;
    bindFiles(box,cur,reload);
    if(up) $("btnCt").onclick=function(){ uploadFiles(cur,"contract",$("ctFile").files,{node:-1,caption:$("ctCap").value},reload); };
  }).catch(function(){});
}
function bindFiles(el,cur,reload){
  el.querySelectorAll("[data-dl]").forEach(function(b){ b.onclick=function(){ download(b.dataset.dl); }; });
  el.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=function(){
    if(!confirm("確定刪除「"+b.dataset.name+"」？檔案會移到管理員雲端硬碟的垃圾桶（30 天內可還原）。")) return;
    api("fileDelete",{fileId:b.dataset.del}).then(function(){ toast("已刪除"); reload(); }).catch(fail);
  }; });
  el.querySelectorAll("[data-photo]").forEach(function(f){ f.onclick=function(){ lightbox(f.dataset.photo,f.dataset.cap); }; });
}
function uploadFiles(cur,kind,files,opt,done){
  files=Array.prototype.slice.call(files||[]);
  if(!files.length){ toast("請先選擇檔案"); return; }
  var big=files.filter(function(f){ return kind!=="photo" && f.size>MAX_UP && !/\.(dxf|txt|csv)$/i.test(f.name); });
  if(big.length){ toast("「"+big[0].name+"」超過 25MB"); return; }
  var i=0, ok=0, msg=$("upMsg");
  (function next(){
    if(i>=files.length){ toast("已上傳 "+ok+" 個檔案"); done(); return; }
    var f=files[i++], n=i; if(msg) msg.textContent="上傳中 "+n+" / "+files.length+"：「"+f.name+"」…";
    var prep = kind==="photo" ? shrinkImage(f).then(function(x){ return {data:x.data,thumb:x.thumb,name:f.name.replace(/\.[^.]+$/,"")+".jpg"}; })
                              : fitUpload(f,msg).then(function(g){
                                  if(msg) msg.textContent="上傳中 "+n+" / "+files.length+"：「"+g.name+"」"+(g!==f?"（已壓縮為 "+(g.size/1048576).toFixed(1)+"MB）":"")+"…";
                                  return b64FromFile(g).then(function(d){ return {data:d,name:g.name}; });
                                });
    prep.then(function(x){
      return api("upload",{id:cur.id,kind:kind,name:x.name,data:x.data,thumb:x.thumb||"",node:opt.node,caption:opt.caption||"",issueId:opt.issueId||""});
    }).then(function(){ ok++; next(); }).catch(function(e){ fail(e); next(); });
  })();
}

/* --- 現場照片與問題回報 --- */
function siteTab(cur,el){
  loading(el);
  Promise.all([api("files",{id:cur.id,kind:"photo"}),api("issues",{id:cur.id})]).then(function(r){
    var photos=r[0].files, issues=r[1].issues, edit=T.canEdit();
    var h='<section class="panel"><h3>問題回報</h3><p class="meta">現場遇到的問題記在這裡，下次進場可追蹤處理狀況；可附照片。</p>';
    if(edit) h+='<div class="uprow"><input type="text" id="isTitle" class="fld" maxlength="80" placeholder="問題標題（例：B1 管路堵塞）" style="flex:1;min-width:200px"><select id="isNode" class="fld">'+nodeOptions(-1,true)+'</select><select id="isPri" class="fld"><option value="normal">一般</option><option value="high">緊急</option></select></div>'
      +'<div class="uprow"><input type="text" id="isDesc" class="fld" maxlength="1000" placeholder="說明（位置、原因、需要誰協助）" style="flex:1;min-width:200px"><button class="btn primary small" id="btnIssue" type="button">新增問題</button></div>';
    h+=issues.length?'<ul class="list">'+issues.map(function(i){
      var ph=photos.filter(function(p){ return p.issueId===i.id; });
      return '<li><div class="main"><b>'+(i.priority==="high"?'<span style="color:var(--bad)">［急］</span>':'')+esc(i.title)+'</b><span class="meta">'+esc(nodeName(i.node))+'｜'+esc(T.userName(i.by))+' '+fmtTime(i.at)+(i.desc?'<br>'+esc(i.desc):'')+(i.resolution?'<br>處理：'+esc(i.resolution)+'（'+esc(T.userName(i.resolvedBy))+'）':'')+'</span>'
        +(ph.length?'<div class="thumbs" style="margin-top:6px">'+ph.map(thumbHtml).join("")+'</div>':'')+'</div>'+chip(i.status,ISSUE_LABEL[i.status])
        +(edit?(i.status!=="closed"?'<button class="btn small" data-iphoto="'+esc(i.id)+'" type="button">加照片</button>'+(i.status==="open"?'<button class="btn small" data-ist="doing" data-iid="'+esc(i.id)+'" type="button">處理中</button>':'')+'<button class="btn small" data-ist="closed" data-iid="'+esc(i.id)+'" type="button">結案</button>':'<button class="btn small" data-ist="open" data-iid="'+esc(i.id)+'" type="button">重新開啟</button>'):'')+'</li>'; }).join("")+'</ul>':'<p class="meta">目前沒有問題回報。</p>';
    h+='</section><section class="panel"><h3>現場照片（'+photos.length+'）</h3>';
    if(edit) h+='<div class="uprow"><select id="upNode" class="fld">'+nodeOptions(-1,true)+'</select><input type="text" id="upCap" class="fld" maxlength="200" placeholder="照片說明（例：3F 弱電箱結線完成）"><input type="file" id="upFile" multiple accept="image/*"><button class="btn primary small" id="btnUp" type="button">上傳照片</button></div><p class="hint" id="upMsg">照片會自動壓縮（最長邊 1600 像素）後上傳。</p>';
    var general=photos.filter(function(p){ return !p.issueId; });
    h+=general.length?'<div class="thumbs">'+general.map(thumbHtml).join("")+'</div>':'<p class="meta">尚未上傳照片。</p>';
    el.innerHTML=h+'</section><input type="file" id="issuePhoto" accept="image/*" multiple hidden>';
    bindFiles(el,cur,function(){ siteTab(cur,el); });
    if(!edit) return;
    $("btnUp").onclick=function(){ uploadFiles(cur,"photo",$("upFile").files,{node:+$("upNode").value,caption:$("upCap").value},function(){ siteTab(cur,el); }); };
    $("btnIssue").onclick=function(){
      var title=$("isTitle").value.trim(); if(!title){ toast("請填問題標題"); return; }
      api("issueSave",{id:cur.id,title:title,desc:$("isDesc").value,node:+$("isNode").value,priority:$("isPri").value}).then(function(){ toast("已新增問題"); siteTab(cur,el); }).catch(fail);
    };
    el.querySelectorAll("[data-ist]").forEach(function(b){ b.onclick=function(){
      var res; if(b.dataset.ist==="closed"){ res=prompt("處理說明（例：已通管並複測）",""); if(res===null) return; }
      api("issueSave",{id:cur.id,issueId:b.dataset.iid,status:b.dataset.ist,resolution:res}).then(function(){ toast("已更新"); siteTab(cur,el); }).catch(fail);
    }; });
    el.querySelectorAll("[data-iphoto]").forEach(function(b){ b.onclick=function(){
      var inp=$("issuePhoto"); inp.value=""; inp.onchange=function(){ uploadFiles(cur,"photo",inp.files,{node:-1,issueId:b.dataset.iphoto},function(){ siteTab(cur,el); }); }; inp.click();
    }; });
  }).catch(function(e){ el.innerHTML='<div class="empty">'+esc(e.message)+'</div>'; });
}
function thumbHtml(p){
  return '<figure data-photo="'+esc(p.id)+'" data-cap="'+esc(p.caption||p.name)+'">'+(p.thumb?'<img alt="'+esc(p.caption||p.name)+'" src="data:image/jpeg;base64,'+p.thumb+'">':'<div style="height:110px;display:grid;place-items:center">📷</div>')
    +'<figcaption>'+esc(p.caption||nodeName(p.node))+'｜'+dOnly(p.at)+'</figcaption></figure>';
}

/* --- 領料（專案內與全域共用） --- */
var TYPE_LABEL={device:"設備",material:"材料",labor:"工資發包",service:"服務"};
var draft={items:[],q:{}};
function usedByRef(list,pid){
  var u={}; list.forEach(function(q){ if(q.pid!==pid||q.status==="cancelled"||q.status==="rejected") return;
    q.items.forEach(function(it){ if(it.ref) u[it.ref]=(u[it.ref]||0)+Number(it.qty||0); }); });
  return u;
}
function dealRows(deal){
  var out=[]; if(!deal||!deal.sections) return out;
  deal.sections.forEach(function(s){ (s.items||[]).forEach(function(it){ if(Number(it.qty)>0&&it.row) out.push({ref:"r"+it.row,sec:s.name||"",name:it.name,unit:it.unit||"",qty:Number(it.qty),type:it.kind||"",brand:it.brand||""}); }); });
  return out;
}
function canUpMoney(cur){ var c=caps(); return !!(c.quote||c.billTerms||(cur&&(cur.myRole==="admin"||cur.myRole==="manager"))); }
function canSeeMoney(){ var c=caps(); return !!(c.quote||c.cost||c.billAmounts); }
function reqsView(el,cur){
  var app=el||$("app"); loading(app);
  var c=caps();
  Promise.all([api("reqs",cur?{id:cur.id}:{}), cur?api("dealGet",{id:cur.id}).catch(function(){ return {deal:null}; }):Promise.resolve({deal:null})]).then(function(res){
    var r=res[0], deal=res[1].deal, list=r.reqs, h='';
    if(!cur) h+='<section class="panel" style="margin-bottom:14px"><h3>領料單</h3><p class="meta" style="margin:0">流程：工務申請 →（超出成交報價單時：直屬主管簽核異常單）→ 採購確認 → 倉管出貨；每一步都會記錄處理人與時間。'+(c.reqCreate?'要申請領料請到該專案的「領料」分頁。':'')+'</p></section>';
    if(cur) h+=dealPanel(cur,deal);
    if(cur && c.reqCreate && T.canEdit()) h+=reqForm(deal);
    var filter=view.reqFilter||"active";
    h+='<div class="filters"><div class="seg">'+[["active","處理中"],["all","全部"],["shipped","已出貨"]].map(function(f){ return '<button type="button" data-rf="'+f[0]+'" class="'+(filter===f[0]?"on":"")+'">'+f[1]+'</button>'; }).join("")+'</div></div>';
    var shown=list.filter(function(q){ return filter==="all"||(filter==="shipped"?q.status==="shipped":["approval","submitted","confirmed","rejected"].indexOf(q.status)>=0); });
    h+=shown.length?shown.map(function(q){ return reqCard(q,c); }).join(""):'<div class="empty">沒有符合的領料單</div>';
    app.innerHTML=h;
    app.querySelectorAll("[data-rf]").forEach(function(b){ b.onclick=function(){ view.reqFilter=b.dataset.rf; reqsView(el,cur); }; });
    app.querySelectorAll("[data-ract]").forEach(function(b){ b.onclick=function(){
      var act=b.dataset.ract, note="";
      if(act==="deny"){ note=prompt("不同意的原因（必填）",""); if(note===null) return; if(!note.trim()){ toast("請填寫原因"); return; } }
      else if(act==="approve"){ note=prompt("簽核意見（選填）",""); if(note===null) return; }
      else if(act==="reject"||act==="confirm"||act==="ship"){ note=prompt(act==="reject"?"退回原因":"說明（選填，例：已下單、預計到貨日、出貨單號）",""); if(note===null) return; }
      if(act==="cancel"&&!confirm("確定取消這張領料單？")) return;
      api("reqAct",{reqId:b.dataset.rid,act:act,note:note}).then(function(){ toast("已更新領料單"); reqsView(el,cur); }).catch(fail);
    }; });
    app.querySelectorAll("[data-rprint]").forEach(function(b){ b.onclick=function(){ var q=list.filter(function(x){return x.id===b.dataset.rprint;})[0]; if(q) printReq(q); }; });
    if(cur) bindDealPanel(cur,function(){ reqsView(el,cur); });
    if(cur && c.reqCreate && T.canEdit()) bindReqForm(cur,deal,usedByRef(list,cur.id),function(){ reqsView(el,cur); });
  }).catch(function(e){ app.innerHTML='<div class="empty">'+esc(e.message)+'</div>'; });
}
var view={};
/* 成交報價單：上傳（業務／主管）與摘要 */
function dealPanel(cur,deal){
  var rows=dealRows(deal), cnt={};
  rows.forEach(function(x){ cnt[x.type]=(cnt[x.type]||0)+1; });
  var h='<section class="panel"><h3>成交報價單</h3>';
  if(deal) h+='<p class="meta">目前：<b>'+esc(deal.fileName||"成交報價單")+'</b>｜'+esc(T.userName(deal.savedBy||""))+' '+fmtTime(deal.savedAt)+'｜共 '+rows.length+' 項（'+Object.keys(cnt).map(function(k){ return (TYPE_LABEL[k]||"其他")+' '+cnt[k]; }).join("、")+'）。領料表會依這份報價單產生，超出數量需填異常單給直屬主管簽核。</p>';
  else h+='<p class="meta">尚未上傳成交報價單。上傳後，「申請領料」會依報價單自動列出所有品項（含工資發包），超出報價數量時需填異常單給直屬主管簽核。'+(canUpMoney(cur)?'':'請業務或主管上傳。')+'</p>';
  if(canUpMoney(cur)&&T.canEdit()) h+='<div class="uprow"><input type="file" id="dealFile" accept=".xlsx,.xls"><button class="btn small'+(deal?'':' primary')+'" id="btnDeal" type="button">'+(deal?'更新成交報價單':'上傳成交報價單')+'</button></div><p class="hint" id="dealMsg">格式同公司估價單範本（Excel）；原始檔會一併存到專案資料夾「成交報價單」。</p>';
  return h+'</section>';
}
function readQuoteFile(f){
  return f.arrayBuffer().then(function(buf){
    if(/\.xls$/i.test(f.name)){ if(!window.XLS_LITE) throw new Error("不支援 .xls，請另存為 .xlsx"); return XLS_LITE.read(buf); }
    return XLSX_LITE.read(buf);
  }).then(function(sheets){ return QUOTE.parse(sheets); });
}
function bindDealPanel(cur,reload){
  var b=$("btnDeal"); if(!b) return;
  b.onclick=function(){
    var f=$("dealFile").files[0]; if(!f){ toast("請先選擇成交報價單"); return; }
    if(f.size>25*1024*1024){ toast("檔案超過 25MB"); return; }
    $("dealMsg").textContent="解析中…";
    readQuoteFile(f).then(function(q){
      var rows=dealRows(q);
      if(!rows.length) throw new Error("讀不到品項，請確認是公司估價單格式");
      if(!confirm("讀到 "+(q.sections||[]).length+" 個系統、"+rows.length+" 個品項，總價 "+money(q.total&&q.total.price)+"。確定設為本專案的成交報價單？")) { $("dealMsg").textContent=""; return; }
      q.fileName=f.name; $("dealMsg").textContent="儲存中…";
      return api("analysisSave",{id:cur.id,kind:"deal",fileName:f.name,data:q})
        .then(function(){ return b64FromFile(f); })
        .then(function(d){ return api("upload",{id:cur.id,kind:"deal",name:f.name,data:d,caption:"成交報價單"}); })
        .then(function(){ toast("已更新成交報價單"); reload(); });
    }).catch(function(e){ $("dealMsg").textContent=""; fail(e); });
  };
}
function reqCard(q,c){
  var anomaly=(q.over&&q.over.length)||q.anomalyReason;
  var steps='<div class="pipeline"><span class="on">申請 '+esc(T.userName(q.by))+' '+fmtTime(q.at)+'</span>'
    +(anomaly?' → <span class="'+(q.approvedAt?"on":"")+'">主管簽核 '+(q.approvedAt?esc(T.userName(q.approver))+' '+esc(q.approval)+' '+fmtTime(q.approvedAt):'待簽核')+'</span>':'')
    +' → <span class="'+(q.confirmedAt?"on":"")+'">採購 '+(q.confirmedAt?esc(T.userName(q.purchaser))+' '+fmtTime(q.confirmedAt):'待確認')+'</span> → <span class="'+(q.shippedAt?"on":"")+'">倉管 '+(q.shippedAt?esc(T.userName(q.shipper))+' '+fmtTime(q.shippedAt):'待出貨')+'</span></div>';
  var acts='';
  if(q.canApprove&&q.status==="approval") acts+='<button class="btn small primary" data-ract="approve" data-rid="'+esc(q.id)+'" type="button">同意異常單</button><button class="btn small danger" data-ract="deny" data-rid="'+esc(q.id)+'" type="button">不同意</button>';
  if(c.reqConfirm&&q.status==="submitted") acts+='<button class="btn small primary" data-ract="confirm" data-rid="'+esc(q.id)+'" type="button">採購確認</button><button class="btn small danger" data-ract="reject" data-rid="'+esc(q.id)+'" type="button">退回</button>';
  if(c.reqShip&&q.status==="confirmed") acts+='<button class="btn small primary" data-ract="ship" data-rid="'+esc(q.id)+'" type="button">確認出貨</button>';
  if(q.by===me().email&&(q.status==="submitted"||q.status==="approval")) acts+='<button class="btn small" data-ract="cancel" data-rid="'+esc(q.id)+'" type="button">取消申請</button>';
  acts+='<button class="btn small" data-rprint="'+esc(q.id)+'" type="button">列印</button>';
  var ab=anomaly?'<div class="anomaly"><b>異常單</b>：'+esc(q.anomalyReason||"")+(q.approvalNote?'<br>主管意見：'+esc(q.approvalNote):'')+overTable(q.over)+'</div>':'';
  return '<section class="panel"><div class="row" style="flex-wrap:wrap"><h3>'+esc(q.id)+'｜<a href="#p='+esc(q.pid)+'/reqs">'+esc(q.pname)+'</a></h3>'+chip(q.status,REQ_LABEL[q.status])+'</div>'
    +'<p class="meta" style="margin:4px 0">送出：'+esc(T.userName(q.by))+' '+fmtTime(q.at)+'｜設備需求日期 '+esc(fmt(q.needDate)||"—")+(q.note?'｜說明：'+esc(q.note):'')+(q.purchaseNote?'｜採購：'+esc(q.purchaseNote):'')+(q.shipNote?'｜倉管：'+esc(q.shipNote):'')+'</p>'+steps+ab
    +'<div class="tblwrap"><table><thead><tr><th>類別</th><th>品名</th><th>廠牌</th><th>型號</th><th>數量</th></tr></thead><tbody>'+q.items.map(function(it){ return '<tr><td>'+esc(TYPE_LABEL[it.type]||(it.ref?"":"報價單外"))+'</td><td>'+esc(it.name)+'</td><td>'+esc(it.brand)+'</td><td class="mono">'+esc(it.model)+'</td><td>'+esc(it.qty)+' '+esc(it.unit)+'</td></tr>'; }).join("")+'</tbody></table></div>'
    +'<div class="tools" style="margin-top:8px">'+acts+'</div></section>';
}
function overTable(over){
  if(!over||!over.length) return '';
  return '<div class="tblwrap"><table><thead><tr><th>品名</th><th>報價數量</th><th>先前已申請</th><th>本次</th><th>超出</th></tr></thead><tbody>'+over.map(function(o){
    return '<tr><td>'+esc(o.name)+(o.extra?'（報價單外）':'')+'</td><td>'+esc(o.extra?"—":o.quote)+'</td><td>'+esc(o.extra?"—":o.before)+'</td><td>'+esc(o.now)+'</td><td><b>'+esc(o.extra?o.now:Math.round((o.before+o.now-o.quote)*100)/100)+'</b></td></tr>'; }).join("")+'</tbody></table></div>';
}
function reqForm(deal){
  var hasDeal=dealRows(deal).length>0;
  return '<section class="panel"><h3>申請領料</h3><p class="meta">'+(hasDeal?'下表依<b>成交報價單</b>列出所有品項（含工資發包），在「本次申請」填數量即可；報價單沒有的品項可從下方加入，會列為異常。':'尚未上傳成交報價單，請從設備資料庫搜尋加入品項，或直接輸入。')+'送出後由採購確認、倉管出貨；系統會記錄送出人與時間。</p>'
    +(hasDeal?'<div class="uprow"><input type="text" id="dealQ" class="fld" placeholder="篩選品項（品名、系統）" style="flex:1;min-width:180px"><label class="meta"><input type="checkbox" id="dealLeft"> 只顯示尚有剩餘的</label></div><div class="tblwrap" style="max-height:420px;overflow:auto"><table class="items"><thead><tr><th>系統</th><th>類別</th><th>品名</th><th>報價</th><th>已申請</th><th>剩餘</th><th>本次申請</th></tr></thead><tbody id="dealItems"></tbody></table></div>':'')
    +'<h4 style="margin:12px 0 6px">'+(hasDeal?'報價單外品項（會列為異常）':'品項')+'</h4>'
    +'<div class="uprow"><input type="text" id="devQ" class="fld" placeholder="搜尋設備（品名、廠牌、型號，例：AR-727、攝影機）" style="flex:1;min-width:200px"><button class="btn small" id="btnDevQ" type="button">搜尋</button><button class="btn small" id="btnAddBlank" type="button">手動新增一列</button></div>'
    +'<ul class="list" id="devRes"></ul>'
    +'<div class="tblwrap"><table class="items"><thead><tr><th>品名</th><th>廠牌</th><th>型號</th><th>數量</th><th>單位</th><th></th></tr></thead><tbody id="reqItems"></tbody></table></div>'
    +'<div id="anomalyBox"></div>'
    +'<div class="uprow"><label class="meta">設備需求日期 <input type="date" id="reqNeed" class="fld" required></label><input type="text" id="reqNote" class="fld" maxlength="300" placeholder="申請說明（例：3F 攝影機安裝用）" style="flex:1;min-width:200px"><button class="btn primary" id="btnReqSubmit" type="button">送出申請</button></div>'
    +'<p class="hint">送出人：'+esc(me().name||me().email)+'（送出時間由系統記錄）</p></section>';
}
function renderDraft(){
  var tb=$("reqItems"); if(!tb) return;
  tb.innerHTML=draft.items.length?draft.items.map(function(it,i){
    return '<tr><td><input data-di="'+i+'" data-k="name" maxlength="80" value="'+esc(it.name)+'"></td><td><input data-di="'+i+'" data-k="brand" maxlength="40" value="'+esc(it.brand)+'"></td><td><input data-di="'+i+'" data-k="model" maxlength="60" value="'+esc(it.model)+'"></td>'
      +'<td><input data-di="'+i+'" data-k="qty" type="number" min="0" step="1" value="'+esc(it.qty)+'" style="width:80px"></td><td><input data-di="'+i+'" data-k="unit" maxlength="10" value="'+esc(it.unit)+'" style="width:60px"></td><td><button class="btn small danger" data-drm="'+i+'" type="button">移除</button></td></tr>'; }).join("")
    :'<tr><td colspan="6" class="meta">尚未加入品項</td></tr>';
  tb.querySelectorAll("[data-di]").forEach(function(inp){ inp.oninput=function(){ draft.items[+inp.dataset.di][inp.dataset.k]=inp.value; if(draft.onChange) draft.onChange(); }; });
  tb.querySelectorAll("[data-drm]").forEach(function(b){ b.onclick=function(){ draft.items.splice(+b.dataset.drm,1); renderDraft(); if(draft.onChange) draft.onChange(); }; });
}
function bindReqForm(cur,deal,used,reload){
  if(draft.pid!==cur.id) draft={pid:cur.id,items:[],q:{}};
  var rows=dealRows(deal), hasDeal=rows.length>0;
  function renderDeal(){
    var tb=$("dealItems"); if(!tb) return;
    var kw=($("dealQ").value||"").trim(), left=$("dealLeft").checked;
    var shown=rows.filter(function(x){ var rem=x.qty-(used[x.ref]||0); return (!kw||(x.name+" "+x.sec).indexOf(kw)>=0)&&(!left||rem>0); });
    tb.innerHTML=shown.length?shown.map(function(x){
      var u=used[x.ref]||0, rem=Math.round((x.qty-u)*100)/100, v=draft.q[x.ref]||"";
      return '<tr><td>'+esc(x.sec)+'</td><td>'+esc(TYPE_LABEL[x.type]||"")+'</td><td>'+esc(x.name)+'</td><td>'+esc(x.qty)+' '+esc(x.unit)+'</td><td>'+esc(u)+'</td><td'+(rem<=0?' class="bad"':'')+'>'+esc(rem)+'</td>'
        +'<td><input type="number" min="0" step="any" data-dq="'+esc(x.ref)+'" value="'+esc(v)+'" style="width:80px" aria-label="本次申請 '+esc(x.name)+'"></td></tr>'; }).join("")
      :'<tr><td colspan="7" class="meta">沒有符合的品項</td></tr>';
    tb.querySelectorAll("[data-dq]").forEach(function(inp){ inp.oninput=function(){ var n=Number(inp.value); if(n>0) draft.q[inp.dataset.dq]=n; else delete draft.q[inp.dataset.dq]; checkOver(); }; });
  }
  function collect(){
    var items=[];
    rows.forEach(function(x){ var n=draft.q[x.ref]; if(n>0) items.push({name:x.name,brand:x.brand,model:"",qty:n,unit:x.unit,ref:x.ref,type:x.type,sec:x.sec}); });
    draft.items.forEach(function(it){ if(String(it.name).trim()) items.push({name:it.name,brand:it.brand,model:it.model,qty:Number(it.qty),unit:it.unit}); });
    return items;
  }
  function overList(items){
    if(!hasDeal) return [];
    var map={}; rows.forEach(function(x){ map[x.ref]=x; });
    var out=[];
    items.forEach(function(it){
      if(!it.ref){ out.push({name:it.name,now:it.qty,extra:true}); return; }
      var x=map[it.ref], before=used[it.ref]||0; if(before+it.qty>x.qty+1e-9) out.push({ref:it.ref,name:x.name,quote:x.qty,before:before,now:it.qty});
    });
    return out;
  }
  function checkOver(){
    var box=$("anomalyBox"); if(!box) return;
    var over=overList(collect()), keep=$("anomalyReason")?$("anomalyReason").value:(draft.reason||"");
    box.innerHTML=over.length?'<div class="anomaly"><b>異常單：有 '+over.length+' 項超出成交報價單</b>（送出後先由直屬主管簽核，同意後才會到採購）'+overTable(over)
      +'<label class="meta" style="display:block;margin-top:6px">異常說明（必填）<textarea id="anomalyReason" class="fld" maxlength="500" rows="2" style="width:100%" placeholder="例：業主追加 2F 東側門禁 1 樘，已口頭確認，待補追加單">'+esc(keep)+'</textarea></label></div>':'';
    if($("anomalyReason")) $("anomalyReason").oninput=function(){ draft.reason=this.value; };
    $("btnReqSubmit").textContent=over.length?"送出（含異常單，送主管簽核）":"送出申請";
  }
  draft.onChange=checkOver;
  if(hasDeal){ renderDeal(); $("dealQ").oninput=renderDeal; $("dealLeft").onchange=renderDeal; }
  renderDraft(); checkOver();
  var search=function(){
    var q=$("devQ").value.trim(); if(!q){ toast("請輸入關鍵字"); return; }
    $("devRes").innerHTML='<li class="meta">搜尋中…</li>';
    api("devices",{q:q}).then(function(r){
      $("devRes").innerHTML=r.devices.length?r.devices.slice(0,15).map(function(d,i){
        return '<li><div class="main"><b>'+esc(d.name)+'</b><span class="meta">'+esc(d.brand)+'｜'+esc(d.model)+'｜'+esc(d.sheet)+(d.price?'｜業務價 '+money(d.price):'')+'</span></div><button class="btn small" data-addev="'+i+'" type="button">加入</button></li>'; }).join("")
        :'<li class="meta">資料庫中找不到，可按「手動新增一列」。</li>';
      $("devRes").querySelectorAll("[data-addev]").forEach(function(b){ b.onclick=function(){ var d=r.devices[+b.dataset.addev];
        draft.items.push({name:d.name,brand:d.brand,model:d.model,qty:1,unit:"個"}); renderDraft(); checkOver(); toast("已加入「"+d.name+"」"); }; });
    }).catch(fail);
  };
  $("btnDevQ").onclick=search; $("devQ").onkeydown=function(e){ if(e.key==="Enter"){ e.preventDefault(); search(); } };
  $("btnAddBlank").onclick=function(){ draft.items.push({name:"",brand:"",model:"",qty:1,unit:"個"}); renderDraft(); checkOver(); };
  $("btnReqSubmit").onclick=function(){
    var items=collect();
    if(!items.length){ toast("請至少填一項本次申請數量"); return; }
    if(items.some(function(it){ return !(Number(it.qty)>0); })){ toast("數量需大於 0"); return; }
    if(!$("reqNeed").value){ toast("請填設備需求日期"); $("reqNeed").focus(); return; }
    var over=overList(items), reason=$("anomalyReason")?$("anomalyReason").value.trim():"";
    if(over.length&&!reason){ toast("超出報價單數量，請填寫異常說明"); $("anomalyReason").focus(); return; }
    var btn=$("btnReqSubmit"); btn.disabled=true;
    api("reqCreate",{id:cur.id,items:items,needDate:$("reqNeed").value,note:$("reqNote").value,anomalyReason:reason})
      .then(function(r){ draft={pid:cur.id,items:[],q:{}}; toast(r.req.status==="approval"?"已送出 "+r.req.id+"，異常單待直屬主管簽核":"已送出領料單 "+r.req.id); reload(); })
      .catch(function(e){ btn.disabled=false; if(e.code==="OVER_QTY") toast(e.message); else fail(e); });
  };
}
function printReq(q){
  var anomaly=(q.over&&q.over.length)||q.anomalyReason;
  printHtml("領料單 "+q.id,'<h1>領料單 '+esc(q.id)+'</h1><p class="meta">專案：'+esc(q.pname)+'｜狀態：'+esc(REQ_LABEL[q.status])+'｜設備需求日期：'+esc(fmt(q.needDate))+'</p>'
    +'<p class="meta">送出：'+esc(T.userName(q.by))+' '+esc(fmtTime(q.at))+(anomaly?'｜主管簽核：'+esc(q.approver?T.userName(q.approver)+' '+q.approval+' '+fmtTime(q.approvedAt):'—'):'')+'｜採購：'+esc(q.purchaser?T.userName(q.purchaser)+' '+fmtTime(q.confirmedAt):'—')+'｜倉管：'+esc(q.shipper?T.userName(q.shipper)+' '+fmtTime(q.shippedAt):'—')+'</p>'
    +(q.note?'<p>說明：'+esc(q.note)+'</p>':'')
    +'<table><thead><tr><th>#</th><th>類別</th><th>品名</th><th>廠牌</th><th>型號</th><th>數量</th><th>單位</th><th>實發</th></tr></thead><tbody>'+q.items.map(function(it,i){ return '<tr><td>'+(i+1)+'</td><td>'+esc(TYPE_LABEL[it.type]||(it.ref?"":"報價單外"))+'</td><td>'+esc(it.name)+'</td><td>'+esc(it.brand)+'</td><td>'+esc(it.model)+'</td><td>'+esc(it.qty)+'</td><td>'+esc(it.unit)+'</td><td></td></tr>'; }).join("")+'</tbody></table>'
    +(anomaly?'<h2 style="font-size:16px">異常單</h2><p>異常說明：'+esc(q.anomalyReason)+'</p>'+overTable(q.over)+(q.approvalNote?'<p>主管意見：'+esc(q.approvalNote)+'</p>':''):'')
    +'<div class="sign"><div>申請人（工務）</div>'+(anomaly?'<div>直屬主管簽核</div>':'')+'<div>採購確認</div><div>倉管出貨</div><div>領料人簽收</div></div>');
}
T.views.reqs=function(){ reqsView(null,null); };

/* --- 請款 --- */
function billsTab(cur,el){
  loading(el);
  api("bills",{id:cur.id}).then(function(r){
    var c=caps(), list=r.bills, p=r.projects[cur.id]||{}, editTerms=c.billTerms&&T.canEdit();
    var h='<section class="panel"><h3>請款進度</h3><p class="meta">'+(p.contractAmount!==undefined?'合約總價 '+money(p.contractAmount)+'｜':'')+'付款條件：'+esc(cur.project.payCondition||"未填寫")+'<br>流程：工務回報完工 → 送出請款 → 會計開立發票 → 登錄收款。完工回報後超過 '+r.remindDays+' 天未請款，系統每天早上 8 點寄信提醒工程師與業務。</p>';
    h+=list.length?'<div class="tblwrap"><table><thead><tr><th>#</th><th>期別</th><th>比例</th>'+(c.billAmounts?'<th>金額</th>':'')+'<th>觸發結點</th><th>狀態</th><th>紀錄</th><th>操作</th></tr></thead><tbody>'+list.map(function(b){ return billRowHtml(b,c,cur); }).join("")+'</tbody></table></div>'
      :'<p class="meta">尚未設定請款期別。'+(editTerms?'請在下方設定。':'請業務設定付款條件。')+'</p>';
    h+='</section>';
    if(editTerms) h+=termsEditor(list,p);
    el.innerHTML=h;
    bindBillActs(el,function(){ billsTab(cur,el); });
    if(editTerms) bindTermsEditor(cur,list,function(){ billsTab(cur,el); });
  }).catch(function(e){ el.innerHTML='<div class="empty">'+esc(e.message)+'</div>'; });
}
function billRowHtml(b,c,cur,showProject){
  var st=b.overdue?chip("overdue","逾期 "+b.daysSinceDone+" 天未請款"):chip(b.status,BILL_LABEL[b.status]);
  var logs=[];
  if(b.doneAt) logs.push("完工 "+dOnly(b.doneAt)+" "+T.userName(b.doneBy));
  if(b.billedAt) logs.push("請款 "+dOnly(b.billedAt)+(b.billAmount!==undefined?" "+money(b.billAmount):""));
  if(b.invoiceNo) logs.push("發票 "+b.invoiceNo);
  if(b.paidDate) logs.push("收款 "+fmt(b.paidDate)+(b.paidAmount!==undefined?" "+money(b.paidAmount):""));
  var role=cur?cur.myRole:(b.myRole||""), canE=["admin","manager","owner","editor"].indexOf(role)>=0, acts='';
  if(canE&&b.status==="pending") acts+='<button class="btn small" data-bact="done" data-bid="'+esc(b.id)+'" type="button">回報完工</button>';
  if(canE&&(b.status==="done"||b.status==="pending")) acts+='<button class="btn small primary" data-bact="bill" data-bid="'+esc(b.id)+'" data-amt="'+esc(b.amount===undefined?"":b.amount)+'" type="button">送出請款</button>';
  if(c.billInvoice&&b.status==="billed") acts+='<button class="btn small primary" data-bact="invoice" data-bid="'+esc(b.id)+'" type="button">登錄發票</button>';
  if(c.billInvoice&&(b.status==="billed"||b.status==="invoiced")) acts+='<button class="btn small primary" data-bact="paid" data-bid="'+esc(b.id)+'" data-amt="'+esc(b.billAmount||"")+'" type="button">登錄收款</button>';
  if((c.billInvoice||role==="manager")&&b.status!=="pending") acts+='<button class="btn small danger" data-bact="reset" data-bid="'+esc(b.id)+'" type="button">退回</button>';
  var hint='';
  var cp=T.getCur();
  if(cp&&b.status==="pending"&&b.trigger>=0&&cp.project&&cp.project.nodes[b.trigger]&&cp.project.nodes[b.trigger].done) hint='<br><span style="color:var(--warn)">觸發結點已完成，可回報完工</span>';
  return '<tr>'+(showProject?'<td><a href="#p='+esc(b.pid)+'/bills">'+esc(b.pname)+'</a></td>':'<td>'+b.seq+'</td>')+'<td>'+esc(b.name)+hint+'</td><td>'+esc(b.pct)+'%</td>'+(c.billAmounts?'<td>'+money(b.amount)+'</td>':'')
    +'<td>'+esc(b.trigger>=0?"結點"+(b.trigger+1):"—")+'</td><td>'+st+'</td><td class="meta">'+esc(logs.join("；"))+'</td><td>'+acts+'</td></tr>';
}
function bindBillActs(el,reload){
  el.querySelectorAll("[data-bact]").forEach(function(b){ b.onclick=function(){
    var act=b.dataset.bact, p={billId:b.dataset.bid,act:act};
    if(act==="done"&&!confirm("確認此期工程已施作完畢？回報後若超過期限未請款，系統會提醒。")) return;
    if(act==="bill"){ if(b.dataset.amt!==""){ var a=prompt("請款金額（元）",b.dataset.amt); if(a===null) return; p.amount=a; } else if(!confirm("確定送出請款？")) return; }
    if(act==="invoice"){ var no=prompt("發票號碼",""); if(!no) return; p.invoiceNo=no; }
    if(act==="paid"){ var d=prompt("收款日期（YYYY-MM-DD）",T.today()); if(!d) return; p.paidDate=d; var m=prompt("收款金額（元）",b.dataset.amt); if(m===null) return; p.amount=m; }
    if(act==="reset"&&!confirm("確定退回到「未達成」？已登錄的請款、發票、收款資料會清除。")) return;
    api("billAct",p).then(function(){ toast("已更新"); reload(); }).catch(fail);
  }; });
}
var termDraft=null;
function termsEditor(list,p){
  return '<section class="panel"><h3>設定請款期別</h3><p class="meta">依合約付款條件設定各期比例；金額留空會依合約總價自動計算。已有請款紀錄的期別不能刪除。</p>'
    +'<div class="tblwrap"><table class="items"><thead><tr><th>期別名稱</th><th>比例%</th><th>金額（選填）</th><th>觸發結點</th><th>備註</th><th></th></tr></thead><tbody id="termRows"></tbody></table></div>'
    +'<div class="tools"><button class="btn small" id="btnTermAdd" type="button">新增一期</button><button class="btn small" id="btnTermTpl" type="button">套用常用：訂金30／完工60／保固10</button><button class="btn primary small" id="btnTermSave" type="button">儲存期別</button><span class="meta" id="termSum"></span></div></section>';
}
function bindTermsEditor(cur,list,reload){
  termDraft=list.map(function(b){ return {id:b.id,name:b.name,pct:b.pct,amount:"",trigger:b.trigger,note:b.note}; });
  var draw=function(){
    $("termRows").innerHTML=termDraft.map(function(t,i){
      return '<tr><td><input data-ti="'+i+'" data-k="name" maxlength="40" value="'+esc(t.name)+'"></td><td><input data-ti="'+i+'" data-k="pct" type="number" min="0" max="100" value="'+esc(t.pct)+'" style="width:70px"></td>'
        +'<td><input data-ti="'+i+'" data-k="amount" inputmode="numeric" value="'+esc(t.amount)+'" placeholder="自動" style="width:110px"></td><td><select data-ti="'+i+'" data-k="trigger">'+nodeOptions(t.trigger,true)+'</select></td>'
        +'<td><input data-ti="'+i+'" data-k="note" maxlength="200" value="'+esc(t.note||"")+'"></td><td><button class="btn small danger" data-trm="'+i+'" type="button">刪除</button></td></tr>'; }).join("");
    var sum=termDraft.reduce(function(a,t){ return a+(Number(t.pct)||0); },0);
    $("termSum").textContent="比例合計 "+sum+"%"+(sum!==100?"（提醒：通常應為 100%）":"");
    $("termRows").querySelectorAll("[data-ti]").forEach(function(inp){ inp.oninput=inp.onchange=function(){ termDraft[+inp.dataset.ti][inp.dataset.k]=inp.dataset.k==="trigger"?+inp.value:inp.value; if(inp.dataset.k==="pct") draw(); }; });
    $("termRows").querySelectorAll("[data-trm]").forEach(function(b){ b.onclick=function(){ termDraft.splice(+b.dataset.trm,1); draw(); }; });
  };
  draw();
  $("btnTermAdd").onclick=function(){ termDraft.push({name:"",pct:0,amount:"",trigger:-1,note:""}); draw(); };
  $("btnTermTpl").onclick=function(){ if(termDraft.length&&!confirm("要以常用範本取代目前的期別嗎？")) return;
    termDraft=[{name:"訂金",pct:30,amount:"",trigger:0,note:""},{name:"完工款",pct:60,amount:"",trigger:6,note:""},{name:"保固款",pct:10,amount:"",trigger:7,note:"保固期滿"}]; draw(); };
  $("btnTermSave").onclick=function(){
    api("billTermsSave",{id:cur.id,terms:termDraft.map(function(t){ return {id:t.id,name:t.name,pct:Number(t.pct)||0,amount:t.amount,trigger:t.trigger,note:t.note}; })})
      .then(function(){ toast("已儲存請款期別"); reload(); }).catch(fail);
  };
}
T.views.bills=function(){
  var app=$("app"); loading(app);
  api("bills",{}).then(function(r){
    var c=caps(), f=view.billFilter||"all";
    var byP={}; Object.keys(r.projects).forEach(function(id){ byP[id]={p:r.projects[id],bills:[]}; });
    r.bills.forEach(function(b){ if(byP[b.pid]){ b.myRole=byP[b.pid].p.myRole; byP[b.pid].bills.push(b); } });
    var rows=Object.keys(byP).map(function(id){ var x=byP[id], billed=0, paid=0;
      x.bills.forEach(function(b){ if(["billed","invoiced","paid"].indexOf(b.status)>=0) billed+=Number(b.billAmount)||0; if(b.status==="paid") paid+=Number(b.paidAmount)||0; });
      return {id:id,p:x.p,bills:x.bills,billed:billed,paid:paid,overdue:x.bills.filter(function(b){return b.overdue;}).length}; })
      .sort(function(a,b){ return b.overdue-a.overdue || String(a.p.name).localeCompare(String(b.p.name)); });
    var h='<section class="panel" style="margin-bottom:14px"><h3>請款進度查詢</h3><p class="meta" style="margin:0">完工回報超過 '+r.remindDays+' 天未請款會標紅並每日寄信提醒。點專案名稱可進入該專案的請款頁。</p></section>';
    h+='<div class="filters"><div class="seg">'+[["all","全部"],["overdue","逾期未請款"],["toInvoice","待開票"],["toCollect","待收款"]].map(function(x){ return '<button type="button" data-bf="'+x[0]+'" class="'+(f===x[0]?"on":"")+'">'+x[1]+'</button>'; }).join("")+'</div></div>';
    if(f!=="all"){
      var sel=r.bills.filter(function(b){ return f==="overdue"?b.overdue:f==="toInvoice"?b.status==="billed":b.status==="invoiced"; });
      h+=sel.length?'<section class="panel"><div class="tblwrap"><table><thead><tr><th>專案</th><th>期別</th><th>比例</th>'+(c.billAmounts?'<th>金額</th>':'')+'<th>觸發結點</th><th>狀態</th><th>紀錄</th><th>操作</th></tr></thead><tbody>'+sel.map(function(b){ return billRowHtml(b,c,null,true); }).join("")+'</tbody></table></div></section>':'<div class="empty">沒有符合的期別</div>';
    } else {
      h+=rows.length?'<section class="panel"><div class="tblwrap"><table><thead><tr><th>專案</th>'+(c.billAmounts?'<th>合約總價</th><th>已請款</th><th>已收款</th><th>未收款</th>':'')+'<th>期別狀態</th></tr></thead><tbody>'+rows.map(function(x){
        return '<tr><td><a href="#p='+esc(x.id)+'/bills">'+esc(x.p.name)+'</a>'+(x.overdue?' '+chip("overdue","逾期 "+x.overdue):'')+'</td>'
          +(c.billAmounts?'<td>'+money(x.p.contractAmount)+'</td><td>'+money(x.billed)+'</td><td>'+money(x.paid)+'</td><td>'+money((x.p.contractAmount||0)-x.paid)+'</td>':'')
          +'<td>'+(x.bills.length?x.bills.map(function(b){ return chip(b.overdue?"overdue":b.status,b.name+"："+BILL_LABEL[b.status]); }).join(" "):'<span class="meta">未設定</span>')+'</td></tr>'; }).join("")+'</tbody></table></div></section>':'<div class="empty">沒有可查看的專案</div>';
    }
    app.innerHTML=h;
    app.querySelectorAll("[data-bf]").forEach(function(b){ b.onclick=function(){ view.billFilter=b.dataset.bf; T.views.bills(); }; });
    bindBillActs(app,T.views.bills);
  }).catch(function(e){ app.innerHTML='<div class="empty">'+esc(e.message)+'</div>'; });
};

/* --- 廠牌確認表 --- */
function brandsTab(cur,el){
  var p=cur.project, ks=T.sysList(p);
  var rows=ks.map(function(k,i){ return '<tr><td>'+(i+1)+'</td><td>'+esc(T.sysName(p,k))+'</td><td>'+esc(T.brandOf(p,k)||"（未填）")+'</td><td></td><td></td></tr>'; }).join("");
  var missing=ks.filter(function(k){ return !T.brandOf(p,k); }).length;
  var table='<table><thead><tr><th>#</th><th>系統</th><th>廠牌</th><th>確認（✓／改）</th><th>備註</th></tr></thead><tbody>'+(rows||'<tr><td colspan="5">尚未勾選建置系統</td></tr>')+'</tbody></table>';
  el.innerHTML='<section class="panel"><div class="row" style="flex-wrap:wrap"><h3>各系統廠牌選單確認表</h3><button class="btn small primary" id="btnBrandPrint" type="button">列印／存 PDF</button></div>'
    +'<p class="meta">提供業主、監造確認各系統採用廠牌。系統與廠牌在「編輯專案資料」修改。'+(missing?'<br><span style="color:var(--warn)">尚有 '+missing+' 個系統未填廠牌。</span>':'')+'</p>'
    +'<div class="tblwrap">'+table+'</div><div class="sign"><div>業主</div><div>監造／建築師</div><div>本公司專案負責人</div></div></section>';
  $("btnBrandPrint").onclick=function(){
    printHtml("廠牌確認表－"+p.name,'<h1>各系統廠牌選單確認表</h1><p class="meta">專案：'+esc(p.name)+'｜業主：'+esc(p.client||"")+'｜案場：'+esc(p.site||"")+'｜日期：'+esc(T.today())+'</p>'+table
      +'<div class="sign"><div>業主</div><div>監造／建築師</div><div>本公司專案負責人</div></div>');
  };
}

/* --- 變更紀錄 --- */
function describe(r){
  var d=r.detail||{}, n=function(i){ return "結點"+(Number(i)+1); };
  switch(r.type){
    case "create": return "建立專案「"+(d.to||"")+"」";
    case "field": return "修改「"+(FIELD_LABEL[d.k]||d.k)+"」："+(d.from===""?"（空白）":(d.k==="salesRep"?T.userName(d.from):d.from))+" → "+(d.to===""?"（空白）":(d.k==="salesRep"?T.userName(d.to):d.to));
    case "closed": return d.to?"標記為已結案":"重新開啟專案";
    case "systems": return "建置系統："+((d.to||[]).map(function(k){ return T.sysName({},k); }).join("、")||"（無）");
    case "brand": return "「"+T.sysName({},d.k)+"」廠牌："+(d.from||"（空白）")+" → "+(d.to||"（空白）");
    case "date": return n(d.n)+"「"+(d.k==="target"?"預計日期":"實際完成日")+"」："+(d.from||"未設定")+" → "+(d.to||"未設定");
    case "note": return n(d.n)+" 備註："+(d.to||"（清空）");
    case "check": return n(d.n)+(d.to?" 勾選":" 取消勾選")+"「"+checkLabel(d.n,d.k)+"」";
    case "sys": return n(d.n)+"「"+T.sysName({},d.k)+"」進度 "+d.from+"% → "+d.to+"%";
    case "miss": return n(d.n)+"「"+T.sysName({},d.k)+"」缺項："+(d.to||"（清空）");
    case "file": return (d.op==="add"?"上傳":"刪除")+(d.kind==="photo"?"照片":"圖面")+"「"+d.name+"」";
    case "issue": return d.op==="add"?"新增問題「"+d.title+"」":"問題「"+d.title+"」"+ISSUE_LABEL[d.from]+" → "+ISSUE_LABEL[d.to]+(d.note?"（"+d.note+"）":"");
    case "req": return "領料單 "+d.reqId+" "+({submit:"申請",confirm:"採購確認",reject:"採購退回",ship:"倉管出貨",cancel:"取消"}[d.op]||d.op)+(d.note?"（"+d.note+"）":"");
    case "bill": return d.op==="terms"?"更新請款期別（"+d.count+" 期）":"請款「"+d.name+"」"+({done:"回報完工",bill:"送出請款",invoice:"開立發票 "+(d.invoiceNo||""),paid:"登錄收款",reset:"退回"}[d.op]||d.op);
    default: return r.type;
  }
}
function logTab(cur,el){
  loading(el);
  api("changes",{id:cur.id}).then(function(r){
    var rows=r.rows;
    el.innerHTML='<section class="panel"><h3>變更紀錄（'+rows.length+'）</h3><p class="meta">每次修改都會記錄編輯者、時間與內容，無法刪改。</p>'
      +(rows.length?'<div class="tblwrap"><table class="cards log"><thead><tr><th>時間</th><th>編輯者</th><th>更新事項</th></tr></thead><tbody>'+rows.map(function(x){
        return '<tr><td data-label="時間" style="white-space:nowrap">'+fmtTime(x.at)+'</td><td data-label="編輯者">'+esc(x.name||T.userName(x.email))+'</td><td data-label="更新事項">'+esc(describe(x))+'</td></tr>'; }).join("")+'</tbody></table></div>':'<p class="meta">尚無紀錄。</p>')+'</section>';
  }).catch(function(e){ el.innerHTML='<div class="empty">'+esc(e.message)+'</div>'; });
}
})();
