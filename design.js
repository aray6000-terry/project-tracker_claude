/* 弱電專案平台 — 「設計・編表」分頁：IO 模組表、IP 編表、三層式網路架構、交換器埠數、線材、配線圖 */
(function(){
"use strict";
var T=window.TR; if(!T||!window.DESIGN) return;
var esc=T.esc, api=T.api, toast=T.toast, fail=T.fail;
var $=function(id){ return document.getElementById(id); };
var st={pid:null, dr:null, params:{}, sub:"net", floor:null};
var SUBS=[["net","網路架構"],["io","IO 模組表"],["ip","IP 編表"],["sw","交換器"],["route","佈線圖"],["cable","線材"],["wire","配線系統圖"],["rule","參數與點位規則"]];
var VNAME={}; DESIGN.VLANS.forEach(function(v){ VNAME[v[0]]=v[2]; });

function csv(name, rows){
  var s="﻿"+rows.map(function(r){ return r.map(function(v){ v=v===null||v===undefined?"":String(v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }).join(","); }).join("\r\n");
  var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([s],{type:"text/csv;charset=utf-8"})); a.download=name; document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1000);
}
function svgEsc(s){ return esc(s); }

T.views.designTab=function(cur,el){
  if(st.pid!==cur.id) st={pid:cur.id,dr:null,params:{},sub:"net",floor:null};
  el.innerHTML='<div class="loading">讀取中…</div>';
  api("analysisGet",{id:cur.id}).then(function(d){ st.dr=d.drawing; st.params=d.design||{}; st.quote=d.quote; st.xio=null; render(cur,el); })
    .catch(function(e){ el.innerHTML='<div class="empty">'+esc(e.message)+'</div>'; });
};

function render(cur,el){
  if(!st.dr && (st.params.extraIo||[]).length) st.dr={items:[],floors:[],plans:[],tables:[],fileName:"（尚未分析平面圖，只含單線圖／手動點位）"};
  if(!st.dr){ el.innerHTML='<section class="panel"><h3>設計・編表</h3><p class="meta">請先到「數量・報價」分頁分析圖面（DXF），系統會依各樓層設備數量自動產生 IO 模組表、IP 編表、網路架構、交換器埠數與線材估算。</p></section>'; return; }
  var P=DESIGN.plan(st.dr, Object.assign({}, st.params, {systems: cur.project.systems||[]})), h='';
  h+='<section class="panel"><div class="row" style="flex-wrap:wrap"><h3>設計・編表</h3><span class="meta">依圖面分析（'+esc(st.dr.fileName||"")+'）自動產生，參數可在「參數與點位規則」調整</span></div>'
    +'<nav class="ptabs" style="margin-top:8px">'+SUBS.map(function(s){ return '<button type="button" data-dsub="'+s[0]+'" class="'+(st.sub===s[0]?"on":"")+'">'+s[1]+'</button>'; }).join("")+'</nav></section>';
  h+='<section class="panel" id="dsBody">'+body(P,cur)+'</section>';
  el.innerHTML=h;
  el.querySelectorAll("[data-dsub]").forEach(function(b){ b.onclick=function(){ st.sub=b.dataset.dsub; render(cur,el); }; });
  bind(P,cur,el);
}

function body(P,cur){
  var s=st.sub;
  if(s==="net") return netView(P);
  if(s==="io") return ioView(P);
  if(s==="ip") return ipView(P);
  if(s==="sw") return swView(P);
  if(s==="cable") return cableView(P);
  if(s==="wire") return wireView(P);
  if(s==="route") return routeView(P);
  return ruleView(P,cur);
}

/* ---------- 網路架構（昇位式） ---------- */
function netView(P){
  var n=P.net, fl=n.floors.slice().reverse(), rowH=46, top=70, W=980, H=top+fl.length*rowH+30;
  var y={}; fl.forEach(function(f,i){ y[f]=top+i*rowH+rowH/2; });
  var g='<svg class="netsvg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="三層式網路架構圖">';
  g+='<text x="10" y="24" class="t-h">三層式網路架構（核心 → 匯聚 → 接取）</text>';
  g+='<text x="10" y="50" class="t-s">樓層</text><text x="90" y="50" class="t-s">接取層（每層交換器）</text><text x="640" y="50" class="t-s">匯聚層</text><text x="840" y="50" class="t-s">核心</text>';
  fl.forEach(function(f,i){ if(i%2===0) g+='<rect x="0" y="'+(y[f]-rowH/2)+'" width="'+W+'" height="'+rowH+'" class="band"/>'; g+='<text x="14" y="'+(y[f]+5)+'" class="t-f">'+svgEsc(f)+'</text>'; });
  var dpos={};
  n.dist.forEach(function(d){ dpos[d.id]={x:640,y:y[d.at]}; });
  var cy=y[n.core.floor]||top+20;
  /* access */
  fl.forEach(function(f){
    var sws=n.access.filter(function(a){ return a.floor===f; });
    sws.forEach(function(a,i){
      var x=90+i*180, d=n.dist.filter(function(d){ return d.floors.indexOf(f)>=0; })[0];
      if(d) g+='<path d="M'+(x+160)+' '+y[f]+' C 560 '+y[f]+', 600 '+dpos[d.id].y+', 640 '+dpos[d.id].y+'" class="ln-f"/>';
      g+='<rect x="'+x+'" y="'+(y[f]-15)+'" width="160" height="30" rx="6" class="'+(a.group==="cctv"?"bx-cam":"bx-acc")+'"/>'
        +'<text x="'+(x+8)+'" y="'+(y[f]+5)+'" class="t-b">'+svgEsc(a.id)+' '+a.ports+'埠'+(a.poe?' PoE':'')+'</text>';
    });
  });
  n.dist.forEach(function(d){
    var p=dpos[d.id];
    g+='<path d="M780 '+p.y+' C 810 '+p.y+', 810 '+cy+', 840 '+cy+'" class="ln-c"/>';
    g+='<rect x="640" y="'+(p.y-17)+'" width="140" height="34" rx="6" class="bx-dist"/><text x="648" y="'+(p.y-2)+'" class="t-b">'+svgEsc(d.id)+' '+d.ports+'埠</text><text x="648" y="'+(p.y+12)+'" class="t-s">'+svgEsc(d.label)+'</text>';
  });
  g+='<rect x="840" y="'+(cy-20)+'" width="130" height="40" rx="6" class="bx-core"/><text x="848" y="'+(cy-3)+'" class="t-b">'+svgEsc(n.core.id)+' L3</text><text x="848" y="'+(cy+12)+'" class="t-s">'+n.core.ports+' 埠（'+svgEsc(n.core.floor)+'）</text>';
  g+='</svg>';
  var subs=P.ip.subnets;
  return '<h3>網路架構</h3><p class="meta">建議：核心交換器設在 '+esc(n.core.floor)+' 機房（L3，負責各 VLAN 路由與存取控制）；每 '+P.params.distGroup+' 層設一台匯聚交換器（光纖上連）；每層設接取交換器'+(P.params.separateCctv?'，影像監視另設獨立 PoE 交換器（頻寬大、與其他系統實體分離）':'')+'。</p>'
    +'<div class="netwrap">'+g+'</div>'
    +'<div class="legend"><span class="lg acc"></span>整合接取交換器（對講／門禁／中央監控／其他，分 VLAN）<span class="lg cam"></span>影像監視 PoE 交換器<span class="lg dist"></span>匯聚<span class="lg core"></span>核心</div>'
    +'<h4 style="margin:14px 0 6px">VLAN／網段規劃</h4><div class="tblwrap"><table><thead><tr><th>VLAN</th><th>用途</th><th>網段</th><th>閘道</th><th>設備數</th><th>可用位址</th></tr></thead><tbody>'
    +subs.map(function(s){ return '<tr><td>'+s.vlan+'</td><td>'+esc(s.name)+'</td><td class="mono">'+esc(s.cidr)+'</td><td class="mono">'+esc(s.gateway)+'</td><td>'+s.hosts+'</td><td>'+s.capacity+'</td></tr>'; }).join("")+'</tbody></table></div>'
    +'<div class="tipbox"><b>資安建議</b><br>1. 各系統分 VLAN，核心交換器設 ACL：預設禁止 VLAN 互通，只允許管理電腦與整合主機（中央監控、對講伺服器）存取必要網段與埠號。<br>2. 交換器管理介面只在 VLAN 10，關閉 Telnet／HTTP，改用 SSH／HTTPS，並更改預設密碼。<br>3. 未使用的交換器埠關閉，接取埠可啟用 Port Security（限制 MAC 數）。<br>4. 戶外與公共區設備（攝影機、緊急對講）的埠啟用 802.1X 或 MAC 綁定，避免被拔線接入。<br>5. 需要遠端維護時走 VPN，不直接把設備開到網際網路。</div>';
}

/* ---------- IO ---------- */
function quoteIo(){
  var q=st.quote, out=null; if(!q) return null;
  (q.sections||[]).forEach(function(s){ (s.items||[]).forEach(function(it){ var m=/DI\s*[:：]\s*(\d+)/i.exec(it.name||""); if(m&&!out){ var d=/DO\s*[:：]\s*(\d+)/i.exec(it.name), c=/通訊協定\s*[:：]\s*(\d+)/.exec(it.name); out={di:+m[1],do:d?+d[1]:null,comm:c?+c[1]:null,name:it.name}; } }); });
  return out;
}
function ioView(P){
  var io=P.io, t=io.total, tb=io.table, edit=T.canEdit();
  var h='<div class="row" style="flex-wrap:wrap"><h3>中央監控 I/O 管理點數表與模組配置</h3><div class="tools">'+(tb?'<button class="btn small" id="csvIoTable" type="button">下載點數表（CSV）</button>':'')+'<button class="btn small" id="csvIo" type="button">下載模組點位表（CSV）</button></div></div>';
  if(tb){
    var tt=tb.totals, qi=quoteIo();
    h+='<p class="meta">'+(tb.source==="embedded"?'<b>來源：圖面內嵌的「大樓自動化 I/O 管理點數表」</b>（設計單位填寫，直接採用）。':'<b>來源：公司範本＋圖面數量</b>。圖面沒有點數表時，依範本每台設備的點數計算；泵浦、風機、電錶、燈光迴路等不在平面圖上的設備，請在下表填數量。')
      +'<br>點數表中「通訊格式＝數位訊號」或通訊格式沒填的項目走 IO 整合，DI／DO 點配到各樓層監控箱的 IO 模組；TCP／MODBUS 通訊整合的項目屬軟體點，不佔 IO 模組。</p>'
      +'<div class="kpis">'+k(tt.di,"數位輸入 DI（點數表）")+k(tt.ai,"類比輸入 AI")+k(tt.do,"數位輸出 DO")+k(tt.comm,"通信協定點")+k(tt.hwDi,"IO 整合實體 DI")+k(tt.hwDo,"IO 整合實體 DO")+k(t.n18,"18DI 模組")+k(t.n10,"10DI8DO 模組")+'</div>';
    if(qi) h+='<div class="tipbox"><b>與估價單比對</b>：估價單「'+esc(qi.name)+'」<br>DI：估價 '+qi.di+'，點數表 '+tt.di+(qi.di!==tt.di?'（<span style="color:var(--bad)">差 '+(qi.di-tt.di)+'</span>，DI＋AI＝'+(tt.di+tt.ai)+'）':' ✓')
      +(qi.do!==null?'｜DO：估價 '+qi.do+'，點數表 '+tt.do+(qi.do!==tt.do?'（<span style="color:var(--bad)">差 '+(qi.do-tt.do)+'</span>）':' ✓'):'')
      +(qi.comm!==null?'｜通訊協定：估價 '+qi.comm+'，點數表 '+tt.comm+(qi.comm!==tt.comm?'（<span style="color:var(--bad)">差 '+(qi.comm-tt.comm)+'</span>）':' ✓'):'')+'</div>';
    var tmpl=tb.source==="template"&&edit;
    h+='<div class="tblwrap"><table class="qty iot"><thead><tr><th>項目</th><th>設備名稱</th><th>位置</th><th>通訊格式</th><th>數量</th><th>DI</th><th>AI</th><th>DO</th><th>通信</th><th>點位內容</th></tr></thead><tbody>';
    tb.sections.forEach(function(sec){
      h+='<tr class="grp"><td>'+esc(sec.no)+'</td><td colspan="9"><b>'+esc(sec.name)+'</b></td></tr>';
      sec.rows.forEach(function(r){
        var labels=Object.keys(r.pts).filter(function(k){ return !/@sys$/.test(k); }).map(function(k){ var g=k.split("@"); return g[0]+"×"+r.pts[k]; });
        var qty=tmpl?'<input type="number" min="0" max="999" data-ioq="'+esc(r.name)+'" value="'+(r.qty||0)+'" style="width:64px">'+(r.auto?'<span class="hint">圖面</span>':''):(r.qty||"");
        h+='<tr'+(r.hw?'':' class="muted"')+'><td>'+esc(r.no)+'</td><td>'+esc(r.name)+(r.merged?'<span class="hint">（已併入上方同類）</span>':'')+'</td><td>'+esc(r.loc)+'</td><td>'+esc(r.format)+(r.hw?'':'（不佔模組）')+'</td><td>'+qty+'</td><td>'+(r.sum.di||"")+'</td><td>'+(r.sum.ai||"")+'</td><td>'+(r.sum.do||"")+'</td><td>'+(r.sum.comm||"")+'</td><td class="hint" style="text-align:left;white-space:normal">'+esc(labels.join("、"))+'</td></tr>';
      });
    });
    h+='<tr class="grp"><td></td><td><b>總計</b></td><td></td><td></td><td></td><td><b>'+tt.di+'</b></td><td><b>'+tt.ai+'</b></td><td><b>'+tt.do+'</b></td><td><b>'+tt.comm+'</b></td><td></td></tr></tbody></table></div>';
    if(tmpl) h+='<div class="tools" style="margin-top:8px"><button class="btn primary small" id="btnIoqSave" type="button">儲存數量</button></div>';
  } else {
    h+='<div class="kpis">'+k(t.di,"DI 點")+k(t.do,"DO 點")+k(t.n18,"18DI 模組")+k(t.n10,"10DI8DO 模組")+'</div>';
  }
  h+='<h4 style="margin:16px 0 6px">各樓層監控箱模組配置</h4><p class="meta">模組規格：18DI 或 10DI8DO。依 DO 點數先配 10DI8DO，剩下的 DI 再配 18DI，預留 '+Math.round(P.params.spare*100)+'%。位置欄有樓層的依位置分配，否則依圖面各樓層數量分配，都沒有則放 '+esc(P.params.coreFloor)+' 中央監控室。</p>'
    +'<div class="tblwrap"><table><thead><tr><th>監控箱</th><th>DI</th><th>DO</th><th>18DI</th><th>10DI8DO</th><th>模組</th></tr></thead><tbody>'
    +io.panels.map(function(p){ return '<tr><td>'+esc(p.panel)+'</td><td>'+p.di+'</td><td>'+p.do+'</td><td>'+(p.n18||"")+'</td><td>'+(p.n10||"")+'</td><td class="mono">'+esc(p.modules.map(function(m){return m.id;}).join("、"))+'</td></tr>'; }).join("")
    +'<tr class="grp"><td><b>合計</b></td><td><b>'+t.di+'</b></td><td><b>'+t.do+'</b></td><td><b>'+t.n18+'</b></td><td><b>'+t.n10+'</b></td><td></td></tr></tbody></table></div>';
  var sel=st.floor&&io.panels.some(function(p){return p.floor===st.floor;})?st.floor:(io.panels[0]&&io.panels[0].floor);
  var p=io.panels.filter(function(x){return x.floor===sel;})[0];
  if(p) h+='<h4 style="margin:14px 0 6px">點位表：<select id="ioFloor">'+io.panels.map(function(x){ return '<option'+(x.floor===sel?" selected":"")+'>'+esc(x.floor)+'</option>'; }).join("")+'</select></h4>'
    +'<div class="tblwrap"><table><thead><tr><th>模組</th><th>通道</th><th>點位編號</th><th>設備／點位</th><th>說明</th></tr></thead><tbody>'
    +p.rows.map(function(r){ return '<tr'+(r.name==="預留"?' class="muted"':'')+'><td>'+esc(r.module)+'</td><td>'+esc(r.ch)+'</td><td class="mono">'+esc(r.tag)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.note)+'</td></tr>'; }).join("")+'</tbody></table></div>';
  return h;
}
function k(n,l){ return '<div class="kpi"><div class="n">'+esc(n)+'</div><div class="l">'+esc(l)+'</div></div>'; }

/* ---------- IP ---------- */
function ipView(P){
  var rows=P.ip.rows, f=st.ipf||"all", vl=P.ip.subnets;
  var shown=f==="all"?rows:rows.filter(function(r){ return String(r.vlan)===f; });
  return '<div class="row" style="flex-wrap:wrap"><h3>設備 IP 編表（'+rows.length+'）</h3><button class="btn small" id="csvIp" type="button">下載 Excel（CSV）</button></div>'
    +'<p class="meta">每個 VLAN：.1 為閘道（核心交換器）、.2～.19 給交換器與主機、.20 起依樓層由下往上配給設備；網段預留 '+Math.round(P.params.growth*100)+'% 成長空間。設備名稱格式：代號-樓層-序號（CAM 攝影機、IDU 室內機、ODU 門口機、ACR 讀卡機、IO 模組、SW 交換器…）。</p>'
    +'<div class="filters"><select id="ipVlan"><option value="all">全部 VLAN</option>'+vl.map(function(s){ return '<option value="'+s.vlan+'"'+(String(s.vlan)===f?" selected":"")+'>VLAN '+s.vlan+' '+esc(s.name)+'（'+s.hosts+'）</option>'; }).join("")+'</select></div>'
    +'<div class="tblwrap"><table><thead><tr><th>VLAN</th><th>IP</th><th>遮罩</th><th>閘道</th><th>設備名稱</th><th>樓層</th><th>設備</th></tr></thead><tbody>'
    +shown.slice(0,600).map(function(r){ return '<tr><td>'+r.vlan+'</td><td class="mono">'+esc(r.ip)+'</td><td>/'+r.mask+'</td><td class="mono">'+esc(r.gw)+'</td><td class="mono">'+esc(r.name)+'</td><td>'+esc(r.floor)+'</td><td>'+esc(r.device)+'</td></tr>'; }).join("")+'</tbody></table></div>';
}

/* ---------- 交換器 ---------- */
function swView(P){
  var n=P.net, sum={};
  n.access.forEach(function(a){ var key=(a.group==="cctv"?"影像監視 PoE 交換器 ":"整合接取交換器 ")+a.ports+" 埠"+(a.poe?" PoE":""); sum[key]=(sum[key]||0)+1; });
  n.dist.forEach(function(d){ var key="匯聚交換器 "+d.ports+" 埠（光纖 SFP）"; sum[key]=(sum[key]||0)+1; });
  if(n.server) sum["主機交換器 "+n.server.ports+" 埠"]=1;
  sum["核心 L3 交換器 "+n.core.ports+" 埠（光纖 SFP）"]=1;
  return '<div class="row" style="flex-wrap:wrap"><h3>交換器與埠數建議</h3><button class="btn small" id="csvSw" type="button">下載 Excel（CSV）</button></div>'
    +'<p class="meta">埠數＝設備數＋預留 '+Math.round(P.params.spare*100)+'%，取 8／16／24／48 埠規格；另需 2 個上連埠（光纖 SFP）。PoE 功率已加 30% 餘裕。</p>'
    +'<h4 style="margin:10px 0 6px">數量彙總</h4><div class="tblwrap"><table><thead><tr><th>規格</th><th>數量</th></tr></thead><tbody>'+Object.keys(sum).map(function(k){ return '<tr><td>'+esc(k)+'</td><td>'+sum[k]+'</td></tr>'; }).join("")+'</tbody></table></div>'
    +'<h4 style="margin:14px 0 6px">各樓層接取交換器</h4><div class="tblwrap"><table><thead><tr><th>樓層</th><th>編號</th><th>埠數</th><th>使用</th><th>PoE 預算</th><th>VLAN／設備數</th><th>上連</th></tr></thead><tbody>'
    +n.access.map(function(a){ var d=n.dist.filter(function(d){ return d.floors.indexOf(a.floor)>=0; })[0];
      return '<tr><td>'+esc(a.floor)+'</td><td class="mono">'+esc(a.id)+'</td><td>'+a.ports+'</td><td>'+a.used+'</td><td>'+(a.poe?a.poeW+" W":"—")+'</td><td>'+esc(Object.keys(a.vlanCount).map(function(v){ return VNAME[v]+" "+a.vlanCount[v]; }).join("、"))+'</td><td class="mono">'+esc(d?d.id:"")+'</td></tr>'; }).join("")+'</tbody></table></div>';
}

/* ---------- 線材 ---------- */
function cableView(P){
  var tot={}; P.cables.forEach(function(c){ tot[c.type]=(tot[c.type]||0)+c.meters; });
  var measured=P.cables.some(function(c){ return c.basis==="實測"; });
  return '<div class="row" style="flex-wrap:wrap"><h3>線材估算</h3><button class="btn small" id="csvCable" type="button">下載 Excel（CSV）</button></div>'
    +'<p class="meta">'+(measured?'各層設備配線依 DXF 平面圖座標實測（直角走線 × 損耗 '+P.params.slack+' ＋ 每條上下各預留 '+(P.params.drop||3)+' m），同層數多的平面（例如 6F~13F）已乘上樓層數；主幹光纖以樓高 '+P.params.floorHeight+' m 估算。':'以「每條線平均水平長度 '+P.params.avgRun+' m × 損耗預留 '+P.params.slack+'」與「樓高 '+P.params.floorHeight+' m」估算，實際長度請依現場或配線圖修正。')+'</p>'
    +'<div class="tblwrap"><table><thead><tr><th>線材</th><th>用途</th><th>條數</th><th>米數</th><th>依據</th></tr></thead><tbody>'
    +P.cables.map(function(c){ return '<tr><td>'+esc(c.type)+'</td><td>'+esc(c.use)+'</td><td>'+c.runs+'</td><td>'+c.meters.toLocaleString()+'</td><td>'+esc(c.basis||"估算")+'</td></tr>'; }).join("")+'</tbody></table></div>'
    +'<h4 style="margin:14px 0 6px">依線材合計</h4><div class="tblwrap"><table><tbody>'+Object.keys(tot).map(function(t){ return '<tr><td>'+esc(t)+'</td><td>'+tot[t].toLocaleString()+' m</td><td>'+(/CAT|雙絞/.test(t)?'約 '+Math.ceil(tot[t]/305)+' 箱（305 m／箱）':/C |芯|線/.test(t)?'約 '+Math.ceil(tot[t]/200)+' 卷（200 m／卷）':'')+'</td></tr>'; }).join("")+'</tbody></table></div>';
}

/* ---------- 佈線圖（DXF 平面圖＋配線路徑） ---------- */
var WCLASS={ip:["IP 設備（CAT.6）","w-ip"],cam:["攝影機（CAT.6 PoE）","w-cam"],di:["DI 點（2C 0.75）","w-di"],do:["DO 點（2C 1.25）","w-do"],unit:["住戶設備（至宅內配線箱）","w-unit"],door:["門禁鎖／按鈕（至讀卡機）","w-door"],lane:["車道設備（至車道主機）","w-lane"],audio:["廣播喇叭","w-audio"],bus:["RS-485 匯流排","w-bus"],other:["其他（依原廠）","w-other"]};
function routeView(P){
  var W=P.wiring, plans=W.plans;
  if(!plans.length) return '<h3>佈線圖</h3><p class="meta">這份圖面分析沒有平面圖座標資料。請到「數量・報價」重新分析 DXF（新版分析會保存各層平面與設備位置）。</p>';
  var idx=Math.min(st.plan||0,plans.length-1), pl=plans[idx], b=pl.box, w=b[2]-b[0], h=b[3]-b[1];
  var sw=Math.max(w,h)/700;
  var g='<svg class="netsvg plansvg" viewBox="'+b[0]+' '+(-b[3])+' '+w+' '+h+'" role="img" aria-label="'+esc(pl.title)+' 佈線圖" preserveAspectRatio="xMidYMid meet">';
  var d=pl.segs.map(function(s){ return "M"+s[0]+" "+(-s[1])+"L"+s[2]+" "+(-s[3]); }).join("");
  g+='<path d="'+d+'" class="pl-wall" stroke-width="'+sw+'"/>';
  var show=st.wc||{};
  pl.runs.forEach(function(r){ if(show[r.c]===false) return;
    g+='<path d="M'+r.x+' '+(-r.y)+'L'+r.x+' '+(-r.ty)+'L'+r.tx+' '+(-r.ty)+'" class="pl-run '+WCLASS[r.c][1]+'" stroke-width="'+(sw*1.6)+'"><title>'+esc(r.n+"｜"+r.cable+"｜"+r.m+" m")+'</title></path>'; });
  pl.runs.forEach(function(r){ if(show[r.c]===false) return; g+='<circle cx="'+r.x+'" cy="'+(-r.y)+'" r="'+(sw*4)+'" class="pl-dev '+WCLASS[r.c][1]+'"><title>'+esc(r.n+"（"+r.m+" m）")+'</title></circle>'; });
  g+='<rect x="'+(pl.panel.x-sw*7)+'" y="'+(-pl.panel.y-sw*7)+'" width="'+(sw*14)+'" height="'+(sw*14)+'" class="pl-panel"><title>'+esc(pl.panel.n)+'</title></rect></svg>';
  var cls={}; pl.runs.forEach(function(r){ cls[r.c]=(cls[r.c]||0)+1; });
  var h2='<div class="row" style="flex-wrap:wrap"><h3>佈線圖</h3><div class="tools"><select id="routePlan">'+plans.map(function(p,i){ return '<option value="'+i+'"'+(i===idx?" selected":"")+'>'+esc(p.title+"（"+p.table+"）")+'</option>'; }).join("")+'</select><button class="btn small" id="csvRoute" type="button">下載配線清單（CSV）</button></div></div>'
    +'<p class="meta">依 DXF 平面圖的設備位置，從樓層監控箱（藍色方塊）以直角走線連到各設備；門禁鎖與按鈕接到最近的讀卡機、車道設備接到車道主機、住戶設備接到最近的宅內配線箱。圖面單位推定為 1 單位＝'+(W.unitM*100)+' cm（可在參數調整）。'+(pl.panel.assumed?'<br><b style="color:var(--warn)">這張平面圖沒有標示監控箱，暫以設備中心為起點。</b>':'')+(pl.mult>1?'<br>這張平面代表 '+pl.floors.join("、")+' 共 '+pl.mult+' 層，合計已乘以 '+pl.mult+'。':'')+'</p>'
    +'<div class="legend">'+Object.keys(cls).map(function(c){ return '<label style="display:inline-flex;gap:4px;align-items:center;cursor:pointer"><input type="checkbox" data-wc="'+c+'"'+(show[c]===false?"":" checked")+'><span class="lgw '+WCLASS[c][1]+'"></span>'+esc(WCLASS[c][0])+'（'+cls[c]+'）</label>'; }).join("")+'</div>'
    +'<div class="netwrap">'+g+'</div>'
    +'<h4 style="margin:14px 0 6px">本層線材</h4><div class="tblwrap"><table><thead><tr><th>線材</th><th>條數</th><th>米數</th>'+(pl.mult>1?'<th>× '+pl.mult+' 層條數</th><th>× '+pl.mult+' 層米數</th>':'')+'</tr></thead><tbody>'
    +pl.totals.map(function(t){ return '<tr><td>'+esc(t.cable)+'</td><td>'+t.runs+'</td><td>'+t.m+'</td>'+(pl.mult>1?'<td>'+t.runsAll+'</td><td>'+t.mAll+'</td>':'')+'</tr>'; }).join("")+'</tbody></table></div>'
    +'<details class="mxwrap"><summary>每條配線明細（'+pl.runs.length+'）</summary><div class="tblwrap"><table><thead><tr><th>#</th><th>設備</th><th>線材</th><th>長度（m）</th></tr></thead><tbody>'
    +pl.runs.slice().sort(function(a,b){ return b.m-a.m; }).map(function(r,i){ return '<tr><td>'+(i+1)+'</td><td>'+esc(r.n)+'</td><td>'+esc(r.cable)+'</td><td>'+r.m+'</td></tr>'; }).join("")+'</tbody></table></div></details>';
  return h2;
}

/* ---------- 配線圖（各樓層） ---------- */
function wireView(P){
  var floors=P.net.floors, sel=st.floor&&floors.indexOf(st.floor)>=0?st.floor:floors[0];
  var items=(st.dr.items||[]).filter(function(it){ return it.floors[sel]; });
  var sws=P.net.access.filter(function(a){ return a.floor===sel; }), panel=P.io.panels.filter(function(p){ return p.floor===sel; })[0];
  var ipNames={}; P.ip.rows.forEach(function(r){ if(r.floor===sel) ipNames[r.device]=1; });
  var ioNames={}; if(panel) panel.rows.forEach(function(r){ if(r.name!=="預留") ioNames[r.name.replace(/(－.*)? #\d+$/,"")]=1; });
  var ORDER={sw:0,cam:1,io:2,unit:3,box:4,other:5};
  var rows=items.map(function(it){
    var to, cable;
    if(ipNames[it.name]){ to=/攝影機/.test(it.name)&&P.params.separateCctv?"cam":"sw"; cable=DESIGN.CABLE.ip; }
    else if(ioNames[it.name]){ to="io"; cable=/叫車|一氧化碳/.test(it.name)?DESIGN.CABLE.do:DESIGN.CABLE.di; }
    else if(/配線箱|配電箱|接線盒|接線箱|出線口/.test(it.name)){ to="box"; cable="—（箱體／出線口）"; }
    else if(/電子門鎖|瓦斯偵測/.test(it.name)){ to="unit"; cable="2C 0.5mm²（至室內機）"; }
    else { to="other"; cable="依原廠規定"; }
    return {name:it.name,n:it.floors[sel],to:to,cable:cable};
  }).sort(function(a,b){ return ORDER[a.to]-ORDER[b.to]; });
  var W=980, rh=30, top=70, H=top+rows.length*rh+20, g='<svg class="netsvg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(sel)+' 設備配置配線圖">';
  g+='<text x="10" y="24" class="t-h">'+svgEsc(sel)+' 設備配置配線圖</text>';
  var LABEL={sw:(sws.filter(function(a){return a.group!=="cctv";}).map(function(a){return a.id;}).join(" ")||"樓層交換器"),
    cam:(sws.filter(function(a){return a.group==="cctv";}).map(function(a){return a.id;}).join(" ")||"攝影 PoE 交換器"),
    io:panel?panel.panel+"（"+panel.modules.map(function(m){return m.type;}).join("＋")+"）":"監控箱",
    unit:"住戶室內對講機（每戶）", box:"箱體／出線口", other:"其他（專用主機／迴路）"};
  var CLS={sw:"bx-acc",cam:"bx-cam",io:"bx-dist",unit:"bx-acc",box:"bx-dist",other:"bx-acc"};
  Object.keys(ORDER).forEach(function(k){
    var idx=[]; rows.forEach(function(r,i){ if(r.to===k) idx.push(i); }); if(!idx.length) return;
    var by=top+(idx[0]+idx[idx.length-1])/2*rh;
    idx.forEach(function(i){ var y=top+i*rh; g+='<path d="M290 '+by+' C 360 '+by+', 380 '+y+', 440 '+y+'" class="ln-f"/>'; });
    g+='<rect x="20" y="'+(by-16)+'" width="270" height="32" rx="6" class="'+CLS[k]+'"/><text x="30" y="'+(by+5)+'" class="t-b">'+svgEsc(LABEL[k]).slice(0,40)+'</text>';
  });
  rows.forEach(function(r,i){ var y=top+i*rh;
    g+='<text x="450" y="'+(y+5)+'" class="t-b">'+svgEsc(r.name)+' ×'+r.n+'</text><text x="760" y="'+(y+5)+'" class="t-s">'+svgEsc(r.cable)+(r.to==="box"?"":" ×"+r.n)+'</text>'; });
  g+='</svg>';
  return '<div class="row" style="flex-wrap:wrap"><h3>設備配置配線圖</h3><select id="wireFloor">'+floors.map(function(f){ return '<option'+(f===sel?" selected":"")+'>'+esc(f)+'</option>'; }).join("")+'</select></div>'
    +'<p class="meta">依該樓層設備數量，標示每類設備接到哪一台交換器或監控箱，以及使用的線材。單線圖範本提供後，會再加上管路與配線路徑。</p><div class="netwrap">'+g+'</div>';
}

/* ---------- 參數與點位規則 ---------- */
function ruleView(P,cur){
  var p=P.params, edit=T.canEdit();
  var fl=P.net.floors;
  var dis=edit?"":" disabled";
  var h='<h3>參數</h3><div class="fgrid">'
    +fld("baseNet","IP 前兩段（例 10.10）",p.baseNet,"text")+fld("spare","IO／交換器預留比例（0.15＝15%）",p.spare,"number")+fld("growth","網段成長預留（0.3＝30%）",p.growth,"number")
    +fld("floorHeight","樓高（m）",p.floorHeight,"number")+fld("avgRun","平均水平配線長度（m）",p.avgRun,"number")+fld("slack","損耗預留倍數",p.slack,"number")+fld("distGroup","每幾層一台匯聚交換器",p.distGroup,"number")+fld("unitM","圖面 1 單位＝幾公尺（cm 圖為 0.01）",p.unitM||P.wiring.unitM,"number")+fld("drop","每條線上下預留（m）",p.drop||3,"number")
    +'<label>核心機房樓層<select id="p_coreFloor"'+dis+'>'+fl.map(function(f){ return '<option'+(f===p.coreFloor?" selected":"")+'>'+esc(f)+'</option>'; }).join("")+'</select></label>'
    +'<label>影像監視交換器<select id="p_separateCctv"'+dis+'><option value="true"'+(p.separateCctv?" selected":"")+'>獨立 PoE 交換器（建議）</option><option value="false"'+(!p.separateCctv?" selected":"")+'>與其他系統共用（分 VLAN）</option></select></label></div>';
  var items=(st.dr.items||[]).filter(function(it){ return it.total>0; });
  h+='<h3 style="margin-top:16px">點位規則（每台設備佔幾個 DI／DO）</h3><p class="meta">預設依公司做法判斷：接點型設備走 IO 整合；電表、水表、消防、空調、電梯、對講、攝影機走通訊整合（DI／DO 為 0）。有特殊接法請直接修改。</p>'
    +'<div class="tblwrap"><table class="items"><thead><tr><th>設備</th><th>數量</th><th>DI</th><th>DO</th><th>整合方式</th></tr></thead><tbody>'
    +items.map(function(it,i){
      var r=(st.params.ioRules&&st.params.ioRules[it.name])||defRule(it.name);
      return '<tr><td>'+esc(it.name)+'</td><td>'+it.total+'</td><td><input type="number" min="0" max="8" data-io="'+i+'" data-k="di" value="'+(r.di||0)+'" style="width:60px"'+dis+'></td><td><input type="number" min="0" max="8" data-io="'+i+'" data-k="do" value="'+(r.do||0)+'" style="width:60px"'+dis+'></td><td>'+(((r.di||0)+(r.do||0))?"IO":(commOf(it.name)?"通訊（"+commOf(it.name)+"）":"—"))+'</td></tr>'; }).join("")
    +'</tbody></table></div>'
    +'<h3 style="margin-top:16px">手動加入的 IO 設備</h3><p class="meta">泵浦、風機、燈光迴路等不在平面圖數量表的設備，請在這裡加入（名稱含「泵浦」「風機」會自動算運轉＋故障 2 個 DI；「燈光」算狀態 DI＋控制 DO）。</p>'
    +'<div class="tblwrap"><table class="items"><thead><tr><th>樓層</th><th>設備名稱</th><th>數量</th><th></th></tr></thead><tbody id="xioRows">'
    +xio().map(function(x,i){ return '<tr><td><select data-xi="'+i+'" data-k="floor"'+dis+'>'+fl.map(function(f){ return '<option'+(f===x.floor?" selected":"")+'>'+esc(f)+'</option>'; }).join("")+'</select></td><td><input data-xi="'+i+'" data-k="name" list="xioList" maxlength="60" value="'+esc(x.name)+'"'+dis+'></td><td><input type="number" min="1" max="200" data-xi="'+i+'" data-k="n" value="'+esc(x.n)+'" style="width:70px"'+dis+'></td><td>'+(edit?'<button class="btn small danger" data-xrm="'+i+'" type="button">移除</button>':'')+'</td></tr>'; }).join("")
    +'</tbody></table></div><datalist id="xioList"><option>揚水泵浦</option><option>污水泵浦</option><option>消防泵浦</option><option>排風機</option><option>送風機</option><option>公共區燈光迴路</option><option>景觀燈光迴路</option></datalist>'
    +(edit?'<button class="btn small" id="btnXioAdd" type="button">新增一列</button>':'')
    +(edit?'<div class="tools" style="margin-top:10px"><button class="btn primary" id="btnDsSave" type="button">套用並儲存</button><button class="btn" id="btnDsReset" type="button">恢復預設</button></div>':'');
  return h;
  function fld(k,l,v,t){ return '<label>'+esc(l)+'<input id="p_'+k+'" type="'+t+'" step="any" value="'+esc(v)+'"'+dis+'></label>'; }
}
function defRule(name){ return DESIGN.ruleOf(DESIGN.IO_RULES,name)||{di:0,do:0}; }
function commOf(name){ for(var i=0;i<DESIGN.COMM_RULES.length;i++) if(DESIGN.COMM_RULES[i][1].test(name)) return DESIGN.COMM_RULES[i][0]; return ""; }
function xio(){ if(!st.xio) st.xio=(st.params.extraIo||[]).map(function(x){ return {floor:x.floor,name:x.name,n:x.n}; }); return st.xio; }

function bind(P,cur,el){
  var re=function(){ render(cur,el); };
  if($("ioFloor")) $("ioFloor").onchange=function(){ st.floor=this.value; re(); };
  if($("wireFloor")) $("wireFloor").onchange=function(){ st.floor=this.value; re(); };
  if($("ipVlan")) $("ipVlan").onchange=function(){ st.ipf=this.value; re(); };
  var name=(cur.project.name||"專案");
  if($("csvIoTable")) $("csvIoTable").onclick=function(){
    var tb=P.io.table, cols=tb.columns, gname={di:"數位輸入",ai:"類比輸入",do:"數位輸出",comm:"通信協定",sys:"系統設定"};
    var rows=[["項目","設備名稱","位置","通訊格式","數量"].concat(cols.map(function(c){ return gname[c.group]+"－"+c.label; }))];
    tb.sections.forEach(function(sec){ rows.push([sec.no,sec.name]); sec.rows.forEach(function(r){ rows.push([r.no,r.name,r.loc,r.format,r.qty].concat(cols.map(function(c){ var v=r.pts[c.label+"@"+c.group]; return v===undefined?"":(c.group==="sys"?"˙":v); }))); }); });
    rows.push(["","總計","","","","數位輸入 "+tb.totals.di,"類比輸入 "+tb.totals.ai,"數位輸出 "+tb.totals.do,"通信協定 "+tb.totals.comm]);
    csv(name+"_IO管理點數表.csv",rows);
  };
  if($("btnIoqSave")) $("btnIoqSave").onclick=function(){
    var q={}; el.querySelectorAll("[data-ioq]").forEach(function(inp){ var r=null; P.io.table.sections.forEach(function(s){ s.rows.forEach(function(x){ if(x.name===inp.dataset.ioq) r=x; }); });
      var v=Math.max(0,Math.min(999,+inp.value||0)); if(!r||!r.auto||v!==r.qty) q[inp.dataset.ioq]=v; });
    var np=Object.assign({},st.params,{ioQty:q});
    api("analysisSave",{id:cur.id,kind:"design",data:np}).then(function(){ st.params=np; toast("已儲存數量"); re(); }).catch(fail);
  };
  if($("csvIo")) $("csvIo").onclick=function(){ var rows=[["監控箱","模組","通道","點位編號","設備","說明"]]; P.io.panels.forEach(function(p){ p.rows.forEach(function(r){ rows.push([p.panel,r.module,r.ch,r.tag,r.name,r.note]); }); }); csv(name+"_IO模組點位表.csv",rows); };
  if($("csvIp")) $("csvIp").onclick=function(){ csv(name+"_IP編表.csv",[["VLAN","用途","IP","遮罩","閘道","設備名稱","樓層","設備"]].concat(P.ip.rows.map(function(r){ return [r.vlan,r.sys,r.ip,"/"+r.mask,r.gw,r.name,r.floor,r.device]; }))); };
  if($("csvSw")) $("csvSw").onclick=function(){ csv(name+"_交換器.csv",[["層級","樓層","編號","埠數","使用","PoE(W)","上連"]].concat(P.net.access.map(function(a){ var d=P.net.dist.filter(function(d){ return d.floors.indexOf(a.floor)>=0; })[0]; return ["接取",a.floor,a.id,a.ports,a.used,a.poe?a.poeW:"",d?d.id:""]; }),P.net.dist.map(function(d){ return ["匯聚",d.at,d.id,d.ports,d.downlinks,"",P.net.core.id]; }),[["核心",P.net.core.floor,P.net.core.id,P.net.core.ports,"","",""]])); };
  if($("routePlan")) $("routePlan").onchange=function(){ st.plan=+this.value; re(); };
  el.querySelectorAll("[data-wc]").forEach(function(c){ c.onchange=function(){ st.wc=st.wc||{}; st.wc[c.dataset.wc]=c.checked; re(); }; });
  if($("csvRoute")) $("csvRoute").onclick=function(){ var rows=[["平面圖","代表樓層","設備","線材","長度(m)","起點X","起點Y","終點X","終點Y"]];
    P.wiring.plans.forEach(function(p){ p.runs.forEach(function(r){ rows.push([p.title,p.floors.join(" "),r.n,r.cable,r.m,r.x,r.y,r.tx,r.ty]); }); }); csv(name+"_配線清單.csv",rows); };
  if($("csvCable")) $("csvCable").onclick=function(){ csv(name+"_線材估算.csv",[["線材","用途","條數","米數","依據"]].concat(P.cables.map(function(c){ return [c.type,c.use,c.runs,c.meters,c.basis||"估算"]; }))); };
  if($("btnDsSave")) $("btnDsSave").onclick=function(){
    var np={ioQty:st.params.ioQty||{}, ioRules:{}, extraIo:xio().filter(function(x){ return String(x.name).trim()&&+x.n>0; }).map(function(x){ return {floor:x.floor,name:String(x.name).trim().slice(0,60),n:Math.min(200,+x.n)}; })};
    ["baseNet","spare","growth","floorHeight","avgRun","slack","distGroup","coreFloor","separateCctv","unitM","drop"].forEach(function(k){ var e=$("p_"+k); if(e) np[k]=e.value; });
    if(!/^\d{1,3}\.\d{1,3}$/.test(np.baseNet)){ toast("IP 前兩段格式例：10.10"); return; }
    var items=(st.dr.items||[]).filter(function(it){ return it.total>0; });
    el.querySelectorAll("[data-io]").forEach(function(inp){ var it=items[+inp.dataset.io]; var r=np.ioRules[it.name]=np.ioRules[it.name]||{}; r[inp.dataset.k]=Math.max(0,Math.min(8,+inp.value||0)); });
    Object.keys(np.ioRules).forEach(function(n){ var r=np.ioRules[n], d=defRule(n); if((r.di||0)===(d.di||0)&&(r.do||0)===(d.do||0)) delete np.ioRules[n]; });
    api("analysisSave",{id:cur.id,kind:"design",data:np}).then(function(){ st.params=np; st.xio=null; toast("已套用並儲存"); re(); }).catch(fail);
  };
  el.querySelectorAll("[data-xi]").forEach(function(inp){ inp.oninput=inp.onchange=function(){ xio()[+inp.dataset.xi][inp.dataset.k]=inp.value; }; });
  el.querySelectorAll("[data-xrm]").forEach(function(b){ b.onclick=function(){ xio().splice(+b.dataset.xrm,1); re(); }; });
  if($("btnXioAdd")) $("btnXioAdd").onclick=function(){ xio().push({floor:P.net.floors[0]||"1F",name:"",n:1}); re(); };
  if($("btnDsReset")) $("btnDsReset").onclick=function(){ if(!confirm("恢復成系統預設參數與點位規則？")) return; api("analysisSave",{id:cur.id,kind:"design",data:{}}).then(function(){ st.params={}; st.xio=null; toast("已恢復預設"); re(); }).catch(fail); };
}
})();
