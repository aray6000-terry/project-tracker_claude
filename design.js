/* 弱電專案平台 — 「設計・編表」分頁：IO 模組表、IP 編表、三層式網路架構、交換器埠數、線材、配線圖 */
(function(){
"use strict";
var T=window.TR; if(!T||!window.DESIGN) return;
var esc=T.esc, api=T.api, toast=T.toast, fail=T.fail;
var $=function(id){ return document.getElementById(id); };
var st={pid:null, dr:null, params:{}, sub:"net", floor:null};
var SUBS=[["net","網路架構"],["riser","設備昇位圖"],["io","IO 模組表"],["ip","IP 編表"],["annot","標註回圖面"],["sw","交換器"],["route","佈線圖"],["cable","線材"],["wire","配線系統圖"],["rule","參數與點位規則"]];
var VNAME={}; DESIGN.VLANS.forEach(function(v){ VNAME[v[0]]=v[2]; });

function csv(name, rows){
  var s="﻿"+rows.map(function(r){ return r.map(function(v){ v=v===null||v===undefined?"":String(v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }).join(","); }).join("\r\n");
  var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([s],{type:"text/csv;charset=utf-8"})); a.download=name; document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1000);
}
function svgEsc(s){ return esc(s); }
/** 遮罩：前綴長度 → 完整點分格式（24 → 255.255.255.0） */
function maskOf(pfx){ pfx=+pfx; if(!(pfx>=0&&pfx<=32)) return ""; var m=pfx?(0xffffffff<<(32-pfx))>>>0:0; return [m>>>24,(m>>>16)&255,(m>>>8)&255,m&255].join("."); }
function ipRange(cidr){ var m=/^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/.exec(cidr||""); if(!m) return ""; var n=((+m[1]<<24)>>>0)+(+m[2]<<16)+(+m[3]<<8)+(+m[4]), p=+m[5], size=Math.pow(2,32-p), net=Math.floor(n/size)*size;
  var ip=function(v){ return [Math.floor(v/16777216)%256,Math.floor(v/65536)%256,Math.floor(v/256)%256,v%256].join("."); }; return {first:ip(net+1),last:ip(net+size-2),bc:ip(net+size-1)}; }
/* ---------- 圖面匯出（SVG／PNG）：把畫面樣式寫進 SVG，固定用淺色主題 ---------- */
var EXP_PROPS=["fill","fill-opacity","stroke","stroke-width","stroke-opacity","stroke-dasharray","stroke-linecap","stroke-linejoin","opacity","font-size","font-weight","font-family","text-anchor","dominant-baseline"];
function exportSvgText(svg){
  var root=document.documentElement, prev=root.getAttribute("data-theme");
  root.setAttribute("data-theme","light");
  try{
    var clone=svg.cloneNode(true), src=svg.querySelectorAll("*"), dst=clone.querySelectorAll("*");
    for(var i=0;i<src.length;i++){
      var cs=getComputedStyle(src[i]), sty=[];
      EXP_PROPS.forEach(function(k){ var v=cs.getPropertyValue(k); if(v!=="") sty.push(k+":"+v); });
      dst[i].setAttribute("style",sty.join(";")); dst[i].removeAttribute("class");
    }
    var vb=(svg.getAttribute("viewBox")||"0 0 1000 600").split(/[\s,]+/).map(Number);
    var w=1600, h=Math.round(w*vb[3]/vb[2]);
    if(vb[2]<=1200){ w=vb[2]; h=vb[3]; }   /* 架構圖、配線圖用原尺寸（文字大小正確） */
    clone.removeAttribute("class"); clone.setAttribute("xmlns","http://www.w3.org/2000/svg");
    clone.setAttribute("width",w); clone.setAttribute("height",h);
    clone.setAttribute("style","font-family:"+getComputedStyle(svg).fontFamily+";background:#fff");
    var bg=document.createElementNS("http://www.w3.org/2000/svg","rect");
    bg.setAttribute("x",vb[0]); bg.setAttribute("y",vb[1]); bg.setAttribute("width",vb[2]); bg.setAttribute("height",vb[3]); bg.setAttribute("fill","#ffffff");
    clone.insertBefore(bg,clone.firstChild);
    return {text:'<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(clone), w:w, h:h};
  } finally { if(prev===null) root.removeAttribute("data-theme"); else root.setAttribute("data-theme",prev); }
}
function saveBlob(blob,name){
  var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1500);
}
function exportSvg(svg,name,fmt,opt){
  if(!svg){ toast("找不到圖面"); return; }
  var x=exportSvgText(svg), fname=name.replace(/[\\/:*?"<>|]/g,"_");
  if(fmt==="svg"){ saveBlob(new Blob([x.text],{type:"image/svg+xml;charset=utf-8"}),fname+".svg"); return; }
  var scale=Math.max(1,Math.min(4,3000/x.w)); if(opt&&opt.maxPx) scale=Math.min(scale,opt.maxPx/x.h);   /* 瀏覽器畫布高度上限約 32000px */
  var url=URL.createObjectURL(new Blob([x.text],{type:"image/svg+xml;charset=utf-8"})), img=new Image();
  img.onload=function(){
    var c=document.createElement("canvas"); c.width=Math.round(x.w*scale); c.height=Math.round(x.h*scale);
    var ctx=c.getContext("2d"); ctx.fillStyle="#fff"; ctx.fillRect(0,0,c.width,c.height); ctx.drawImage(img,0,0,c.width,c.height);
    URL.revokeObjectURL(url);
    c.toBlob(function(b){ if(b) saveBlob(b,fname+".png"); else toast("PNG 產生失敗，請改用 SVG"); },"image/png");
  };
  img.onerror=function(){ URL.revokeObjectURL(url); toast("PNG 產生失敗，請改用 SVG"); };
  img.src=url;
}
/** 全樓層設備配置配線圖合併：PNG／SVG 為一張長圖，PDF 用瀏覽器列印（每層一頁） */
function exportAllWire(P,name,fmt){
  var floors=P.net.floors, parts=floors.map(function(f){ return {f:f,x:wireSvg(P,f)}; });
  if(fmt==="pdf"){
    var box=document.createElement("div"); box.id="printAll";
    box.innerHTML='<h2 class="print-title">'+esc(name)+' 設備配置配線圖（全樓層）</h2>'+parts.map(function(p){ return '<div class="print-page"><svg class="netsvg" viewBox="0 0 '+p.x.W+' '+p.x.H+'">'+p.x.g+'</svg></div>'; }).join("");
    document.body.appendChild(box); document.body.classList.add("printing");
    var root=document.documentElement, prev=root.getAttribute("data-theme"); root.setAttribute("data-theme","light");
    var done=function(){ window.removeEventListener("afterprint",done); document.body.classList.remove("printing"); box.remove(); if(prev===null) root.removeAttribute("data-theme"); else root.setAttribute("data-theme",prev); };
    window.addEventListener("afterprint",done);
    setTimeout(function(){ window.print(); setTimeout(function(){ if(document.getElementById("printAll")) done(); },1000); },50);
    toast("在列印視窗的「目的地」選「另存為 PDF」");
    return;
  }
  var W=980, gap=24, y=0, inner='';
  parts.forEach(function(p,i){ if(i) inner+='<line x1="0" y1="'+(y-gap/2)+'" x2="'+W+'" y2="'+(y-gap/2)+'" class="ln-f"/>'; inner+='<g transform="translate(0,'+y+')">'+p.x.g+'</g>'; y+=p.x.H+gap; });
  var H=y-gap, holder=document.createElement("div");
  holder.style.cssText="position:absolute;left:-99999px;top:0;width:980px";
  holder.innerHTML='<svg class="netsvg" viewBox="0 0 '+W+' '+H+'">'+inner+'</svg>';
  document.body.appendChild(holder);
  try{ exportSvg(holder.firstChild,name+"_設備配置配線圖_全樓層",fmt,{maxPx:30000}); } finally { holder.remove(); }
}
function expBtns(){ return '<button class="btn small" data-exp="png" type="button">匯出 PNG</button><button class="btn small" data-exp="svg" type="button">匯出 SVG</button>'; }
/** 單線圖分析：盤名 → 樓層（IO 點數表位置欄寫盤名時用來判斷樓層） */
function sldPanelFloors(d){ var m={}; ((d&&d.panels)||[]).forEach(function(p){ var f=String(p.floor||"").split("~")[0]; if(p.name&&/^(B|R)?\d+F$|^RF$/.test(f)) m[String(p.name).trim().toUpperCase()]=f; }); return m; }

T.views.designTab=function(cur,el){
  if(st.pid!==cur.id) st={pid:cur.id,dr:null,params:{},sub:"net",floor:null};
  el.innerHTML='<div class="loading">讀取中…</div>';
  api("analysisGet",{id:cur.id}).then(function(d){ st.dr=d.drawing; st.params=d.design||{}; st.quote=d.quote; st.xio=null;
      return api("analysisOne",{id:cur.id,kind:"sld"}).then(function(r){ st.panelFloors=sldPanelFloors(r&&r.data); },function(){ st.panelFloors={}; });
    }).then(function(){ render(cur,el); })
    .catch(function(e){ el.innerHTML='<div class="empty">'+esc(e.message)+'</div>'; });
};

function render(cur,el){
  if(!st.dr && (st.params.extraIo||[]).length) st.dr={items:[],floors:[],plans:[],tables:[],fileName:"（尚未分析平面圖，只含單線圖／手動點位）"};
  if(!st.dr){ el.innerHTML='<section class="panel"><h3>設計・編表</h3><p class="meta">請先到「數量・報價」分頁分析圖面（DXF），系統會依各樓層設備數量自動產生 IO 模組表、IP 編表、網路架構、交換器埠數與線材估算。</p></section>'; return; }
  var P=DESIGN.plan(st.dr, Object.assign({}, st.params, {systems: cur.project.systems||[], panelFloors: st.panelFloors||{}})), h='';
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
  if(s==="riser") return riserView(P);
  if(s==="io") return ioView(P);
  if(s==="ip") return ipView(P);
  if(s==="annot") return annotView(P);
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
  return '<div class="row" style="flex-wrap:wrap"><h3>網路架構</h3><div class="tools">'+expBtns()+'</div></div><p class="meta">建議：核心交換器設在 '+esc(n.core.floor)+' 機房（L3，負責各 VLAN 路由與存取控制）；每 '+P.params.distGroup+' 層設一台匯聚交換器（光纖上連）；每層設接取交換器'+(P.params.separateCctv?'，影像監視另設獨立 PoE 交換器（頻寬大、與其他系統實體分離）':'')+'。</p>'
    +'<div class="netwrap">'+g+'</div>'
    +'<div class="legend"><span class="lg acc"></span>整合接取交換器（對講／門禁／中央監控／其他，分 VLAN）<span class="lg cam"></span>影像監視 PoE 交換器<span class="lg dist"></span>匯聚<span class="lg core"></span>核心</div>'
    +'<h4 style="margin:14px 0 6px">VLAN／網段規劃</h4><div class="tblwrap"><table><thead><tr><th>VLAN</th><th>用途</th><th>網段</th><th>子網路遮罩</th><th>預設閘道</th><th>可用範圍</th><th>廣播位址</th><th>設備數</th><th>可用位址</th></tr></thead><tbody>'
    +subs.map(function(s){ var p=String(s.cidr).split('/')[1], rg=ipRange(s.cidr)||{}; return '<tr><td>'+s.vlan+'</td><td>'+esc(s.name)+'</td><td class="mono">'+esc(s.cidr)+'</td><td class="mono">'+maskOf(p)+'</td><td class="mono">'+esc(s.gateway)+'</td><td class="mono">'+esc((rg.first||'')+' ～ '+(rg.last||''))+'</td><td class="mono">'+esc(rg.bc||'')+'</td><td>'+s.hosts+'</td><td>'+s.capacity+'</td></tr>'; }).join("")+'</tbody></table></div>'
    +'<div class="tipbox"><b>資安建議</b><br>1. 各系統分 VLAN，核心交換器設 ACL：預設禁止 VLAN 互通，只允許管理電腦與整合主機（中央監控、對講伺服器）存取必要網段與埠號。<br>2. 交換器管理介面只在 VLAN 10，關閉 Telnet／HTTP，改用 SSH／HTTPS，並更改預設密碼。<br>3. 未使用的交換器埠關閉，接取埠可啟用 Port Security（限制 MAC 數）。<br>4. 戶外與公共區設備（攝影機、緊急對講）的埠啟用 802.1X 或 MAC 綁定，避免被拔線接入。<br>5. 需要遠端維護時走 VPN，不直接把設備開到網際網路。</div>';
}

/* ---------- 設備昇位圖（各樓層設備，可分系統） ---------- */
var RS_KEY="riserOpt", RS=(function(){ var d={split:false,on:{bms:true,access:true,cctv:true,intercom:true}};
  try{ var v=JSON.parse(localStorage.getItem(RS_KEY)||"null"); if(v&&typeof v==="object"){ d.split=!!v.split; if(v.on) Object.keys(d.on).forEach(function(k){ if(k in v.on) d.on[k]=!!v.on[k]; }); } }catch(e){}
  return d; })();
function rsSave(){ try{ localStorage.setItem(RS_KEY,JSON.stringify(RS)); }catch(e){} }
var RS_CLS={bms:"rs-bms",access:"rs-acc",cctv:"rs-cam",intercom:"rs-int",all:"rs-all"};
function riserData(P){ return DESIGN.riser(st.dr,{coreFloor:P.params.coreFloor,extra:st.params.extraIo||[]}); }
/** 要畫的欄：分系統時為勾選的系統，不分系統時一欄「全部設備」 */
function riserCols(R){
  if(!RS.split) return [{key:"all",name:"全部設備",host:"中央監控室"}];
  return R.systems.filter(function(s){ return RS.on[s[0]]; }).map(function(s){ return {key:s[0],name:s[1],host:s[2]}; });
}
function riserEntries(R,f,key){
  var c=R.cells[f]||{}, list=[];
  if(key==="all") R.systems.forEach(function(s){ (c[s[0]]||[]).forEach(function(e){ list.push(e); }); });
  else list=(c[key]||[]).slice();
  return list;
}
function rsSel(R){ return RS.split?R.systems.map(function(x){ return x[0]; }).filter(function(k){ return RS.on[k]; }):null; }
var RS_LY={"RISER-BMS":"rs-bms","RISER-ACCESS":"rs-acc","RISER-CCTV":"rs-cam","RISER-INTERCOM":"rs-int","RISER-ALL":"rs-all"};
/** 與 DXF 同一份版面（mm）畫成 SVG：1 mm ＝ 2.4 px */
function riserSvg(P,R){
  var Lo=DESIGN.riserLayout(R,rsSel(R),P.params,{}), k=2.4, g='', f=function(v){ return Math.round(v*k*10)/10; };
  Lo.prims.forEach(function(p){
    var c=RS_LY[p.ly]||"rs-ink";
    if(p.t==="line") g+='<line x1="'+f(p.x1)+'" y1="'+f(p.y1)+'" x2="'+f(p.x2)+'" y2="'+f(p.y2)+'" class="rs-l '+c+(p.w?' rs-trunk':'')+'"/>';
    else if(p.t==="rect") g+='<rect x="'+f(p.x)+'" y="'+f(p.y)+'" width="'+f(p.w)+'" height="'+f(p.h)+'" class="rs-l '+c+(p.fill?' rs-hostbox':' rs-box')+'"/>';
    else if(p.t==="circle") g+='<circle cx="'+f(p.x)+'" cy="'+f(p.y)+'" r="'+f(p.r)+'" class="rs-l rs-box '+c+'"/>';
    else g+='<text x="'+f(p.x)+'" y="'+f(p.y)+'" font-size="'+(Math.round(p.h*k*1.15*10)/10)+'" class="rs-t '+c+(p.cls?' rs-'+p.cls:'')+'"'+(p.a==="m"?' text-anchor="middle" dominant-baseline="central"':'')+'>'+svgEsc(p.s)+'</text>';
  });
  return {g:g,W:f(Lo.W+8),H:f(Lo.H+6),vb:f(-4)+' '+f(-3)};
}
function riserView(P){
  var R=riserData(P), cols=riserCols(R);
  var h='<div class="row" style="flex-wrap:wrap"><h3>設備昇位圖</h3><div class="tools">'+(cols.length?expBtns()+'<button class="btn small" id="dxfRiser" type="button">匯出 DXF</button>':'')+'<button class="btn small" id="csvRiser" type="button">下載昇位清單（CSV）</button></div></div>'
    +'<p class="meta">依圖面分析的各樓層設備數量，由上而下排列樓層，昇位主幹接到 '+esc(R.core)+'（核心機房樓層，可在「參數與點位規則」修改）。分系統時，停車、能源、環境、佈告欄等子系統併入中央監控；住戶的磁簧、求救鈕、瓦斯偵測接戶內對講保全主機，歸對講保全系統。</p>'
    +'<div class="rs-opts"><label class="rs-chk"><input type="checkbox" id="rsSplit"'+(RS.split?" checked":"")+'> 分系統顯示</label>';
  if(RS.split) h+='<span class="rs-sep-v"></span>'+R.systems.map(function(s){ return '<label class="rs-chk"><input type="checkbox" data-rs="'+s[0]+'"'+(RS.on[s[0]]?" checked":"")+'><span class="lgw-sys '+RS_CLS[s[0]]+'"></span>'+esc(s[1])+'（'+(R.sysTotal[s[0]]||0)+'）</label>'; }).join("");
  h+='</div>';
  if(!cols.length) return h+'<div class="empty">請至少勾選一個系統。</div>';
  if(!R.floors.length) return h+'<div class="empty">圖面分析沒有樓層設備數量。</div>';
  var x=riserSvg(P,R);
  h+='<div class="netwrap"><svg class="netsvg rssvg" viewBox="'+x.vb+' '+x.W+' '+x.H+'" role="img" aria-label="各樓層設備昇位圖">'+x.g+'</svg></div>';
  h+='<h4 style="margin:14px 0 6px">各樓層設備數量</h4><div class="tblwrap"><table><thead><tr><th>樓層</th>'+cols.map(function(c){ return '<th>'+esc(c.name)+'</th>'; }).join("")+(cols.length>1?'<th>合計</th>':'')+'</tr></thead><tbody>';
  var colTot=cols.map(function(){ return 0; });
  R.floors.slice().reverse().forEach(function(f){ var sum=0;
    h+='<tr><td>'+esc(f)+(f===R.core?' <span class="hint">主機</span>':'')+'</td>'+cols.map(function(c,i){ var n=riserEntries(R,f,c.key).reduce(function(a,e){ return a+e.n; },0); sum+=n; colTot[i]+=n; return '<td>'+(n||"—")+'</td>'; }).join("")+(cols.length>1?'<td><b>'+(sum||"—")+'</b></td>':'')+'</tr>'; });
  h+='<tr class="grp"><td><b>合計</b></td>'+colTot.map(function(n){ return '<td><b>'+n+'</b></td>'; }).join("")+(cols.length>1?'<td><b>'+colTot.reduce(function(a,b){ return a+b; },0)+'</b></td>':'')+'</tr></tbody></table></div>';
  return h;
}

/* ---------- IO ---------- */
function quoteIo(){
  var q=st.quote, out=null; if(!q) return null;
  (q.sections||[]).forEach(function(s){ (s.items||[]).forEach(function(it){ var m=/DI\s*[:：]\s*(\d+)/i.exec(it.name||""); if(m&&!out){ var d=/DO\s*[:：]\s*(\d+)/i.exec(it.name), c=/通訊協定\s*[:：]\s*(\d+)/.exec(it.name); out={di:+m[1],do:d?+d[1]:null,comm:c?+c[1]:null,name:it.name}; } }); });
  return out;
}
/* IO 接線編表逐點修改（params.ioEdit，依點位編號 tag 記錄）與 DI 警報／不警報 */
var ALARM_RE=/警報|故障|跳脫|異常|過高|過低|高水位|低水位|滿水|溢水|枯水|求救|漏水|濃度|防盜|侵入|破壞|火警|消防|緊急|超溫|過熱|漏電|斷線|停電|失壓|過載|alarm|fault|trip/i;
function alarmDef(r){
  if(!(r.ch&&/^DI/.test(r.ch)&&r.name!=="預留")) return false;
  var pt=String(r.point||"").trim();
  /* 以點位內容判斷（消防泵浦「運轉」不警報、「故障」警報）；點位內容空白或只是「狀態」時才看設備名稱 */
  if(pt&&!/^(狀態|DI-?\d+)$/i.test(pt)) return ALARM_RE.test(pt);
  return ALARM_RE.test((r.dev||r.name||"")+" "+(r.note||""));
}
function ioOrig(r){ return (r.dev||r.name||"")+"|"+(r.point||""); }
function applyIoEdits(P){
  var ed=st.params.ioEdit||{}, n={alarm:0,normal:0,edited:0,stale:0};
  P.io.panels.forEach(function(p){ p.rows.forEach(function(r){
    if(r.__ioe) return; r.__ioe=1;
    var e=ed[r.tag]; r.origDev=r.dev||r.name; r.origPoint=r.point||""; r.origLoc=r.loc||"";
    if(e){
      if(e.o!==undefined&&e.o!==ioOrig(r)) r.stale=e.o.replace("|","－");
      if(e.dev!==undefined){ r.dev=e.dev; r.name=e.dev||"預留"; }
      if(e.point!==undefined) r.point=e.point;
      if(e.loc!==undefined) r.loc=e.loc;
      r.edited=e.dev!==undefined||e.point!==undefined||e.loc!==undefined;
    }
    if(/^DI/.test(r.ch||"")) r.alarm=e&&e.alarm!==undefined?!!e.alarm:alarmDef(r);
  }); });
  P.io.panels.forEach(function(p){ p.rows.forEach(function(r){ if(r.edited) n.edited++; if(r.stale) n.stale++; if(/^DI/.test(r.ch||"")&&r.name!=="預留"){ if(r.alarm) n.alarm++; else n.normal++; } }); });
  return n;
}
function ioView(P){
  var io=P.io, t=io.total, tb=io.table, edit=T.canEdit(), ien=applyIoEdits(P);
  var h='<div class="row" style="flex-wrap:wrap"><h3>中央監控 I/O 管理點數表與模組配置</h3><div class="tools">'+(tb?'<button class="btn small" id="csvIoTable" type="button">下載點數表（CSV）</button>':'')+'<button class="btn small" id="csvIo" type="button">下載 IO 接線編表（CSV）</button></div></div>';
  if(tb){
    var tt=tb.totals, qi=quoteIo();
    h+='<p class="meta">'+(tb.source==="embedded"?'<b>來源：圖面內嵌的「大樓自動化 I/O 管理點數表」</b>（設計單位填寫，直接採用）。':'<b>來源：公司範本＋圖面數量</b>。圖面沒有點數表時，依範本每台設備的點數計算；泵浦、風機、電錶、燈光迴路等不在平面圖上的設備，請在下表填數量。')
      +'<br>點數表中「通訊格式＝數位訊號」或通訊格式沒填的項目走 IO 整合，DI／DO 點配到各樓層監控箱的 IO 模組；TCP／MODBUS 通訊整合的項目屬軟體點，不佔 IO 模組；住戶的防盜保全（各戶防盜、住家保全、戶內求救、住戶磁簧）接戶內對講保全主機，屬通訊協定，也不佔 IO 模組。</p>'
      +'<div class="kpis">'+k(tt.di,"數位輸入 DI（點數表）")+k(tt.ai,"類比輸入 AI")+k(tt.do,"數位輸出 DO")+k(tt.comm,"通信協定點")+k(tt.hwDi,"IO 整合實體 DI")+k(tt.hwDo,"IO 整合實體 DO")+k(t.n18,"18DI 模組")+k(t.n10,"10DI8DO 模組")+'</div>';
    if(qi) h+='<div class="tipbox"><b>與估價單比對</b>：估價單「'+esc(qi.name)+'」<br>DI：估價 '+qi.di+'，點數表 '+tt.di+(qi.di!==tt.di?'（<span style="color:var(--bad)">差 '+(qi.di-tt.di)+'</span>，DI＋AI＝'+(tt.di+tt.ai)+'）':' ✓')
      +(qi.do!==null?'｜DO：估價 '+qi.do+'，點數表 '+tt.do+(qi.do!==tt.do?'（<span style="color:var(--bad)">差 '+(qi.do-tt.do)+'</span>）':' ✓'):'')
      +(qi.comm!==null?'｜通訊協定：估價 '+qi.comm+'，點數表 '+tt.comm+(qi.comm!==tt.comm?'（<span style="color:var(--bad)">差 '+(qi.comm-tt.comm)+'</span>）':' ✓'):'')+'</div>';
    var need=[]; tb.sections.forEach(function(sec){ sec.rows.forEach(function(r){ if(r.at&&/推定|中央監控室/.test(r.at.by)&&!(P.params.ioFloor||{})[r.fkey]) need.push(r); }); });
    if(need.length) h+='<div class="tipbox" style="border-color:var(--warn,#b7791f)"><b>有 '+need.length+' 項判斷不出樓層，請確認</b>（在下表「接到監控箱」欄選樓層，改完會自動重算模組、IP 與網路架構）：<br>'+need.map(function(r){ return esc(r.name)+(r.loc?'（'+esc(r.loc)+'）':'')+'→'+esc(r.at.floors.join("、"))+'（'+esc(r.at.by.replace(/^推定（|）$/g,""))+'）'; }).join("；")+'</div>';
    var tmpl=tb.source==="template"&&edit;
    h+='<div class="tblwrap"><table class="qty iot"><thead><tr><th>項目</th><th>設備名稱</th><th>位置</th><th>通訊格式</th><th>數量</th><th>DI</th><th>AI</th><th>DO</th><th>通信</th><th>接到監控箱</th><th>點位內容</th></tr></thead><tbody>';
    tb.sections.forEach(function(sec){
      h+='<tr class="grp"><td>'+esc(sec.no)+'</td><td colspan="10"><b>'+esc(sec.name)+'</b></td></tr>';
      sec.rows.forEach(function(r){
        var labels=Object.keys(r.pts).filter(function(k){ return !/@sys$/.test(k); }).map(function(k){ var g=k.split("@"); return g[0]+"×"+r.pts[k]; });
        var qty=tmpl?'<input type="number" min="0" max="999" data-ioq="'+esc(r.name)+'" value="'+(r.qty||0)+'" style="width:64px">'+(r.auto?'<span class="hint">圖面</span>':''):(r.qty||"");
        h+='<tr'+(r.hw?'':' class="muted"')+'><td>'+esc(r.no)+'</td><td>'+esc(r.name)+(r.merged?'<span class="hint">（已併入上方同類）</span>':'')+'</td><td>'+esc(r.loc)+'</td><td>'+esc(r.format)+(r.hw?'':(r.unit?'（住戶保全，通訊協定）':'（不佔模組）'))+'</td><td>'+qty+'</td><td>'+(r.sum.di||"")+'</td><td>'+(r.sum.ai||"")+'</td><td>'+(r.sum.do||"")+'</td><td>'+(r.sum.comm||"")+'</td><td style="white-space:nowrap">'+atCell(r,P,edit)+'</td><td class="hint" style="text-align:left;white-space:normal">'+esc(labels.join("、"))+'</td></tr>';
      });
    });
    h+='<tr class="grp"><td></td><td><b>總計</b></td><td></td><td></td><td></td><td><b>'+tt.di+'</b></td><td><b>'+tt.ai+'</b></td><td><b>'+tt.do+'</b></td><td><b>'+tt.comm+'</b></td><td></td></tr></tbody></table></div>';
    if(tmpl) h+='<div class="tools" style="margin-top:8px"><button class="btn primary small" id="btnIoqSave" type="button">儲存數量</button></div>';
  } else {
    h+='<div class="kpis">'+k(t.di,"DI 點")+k(t.do,"DO 點")+k(t.n18,"18DI 模組")+k(t.n10,"10DI8DO 模組")+'</div>';
  }
  h+='<h4 style="margin:16px 0 6px">各樓層監控箱模組配置</h4><p class="meta">模組規格：18DI 或 10DI8DO。依 DO 點數先配 10DI8DO，剩下的 DI 再配 18DI，預留 '+Math.round(P.params.spare*100)+'%。判斷順序：手動指定 → 位置欄樓層 → 設備名稱樓層 → 位置欄盤名對照單線圖 → 圖面各樓層數量 → 依設備種類推定（泵浦、水池在最底層地下室，發電機、ATS 在 B1，屋頂水箱在最高屋突層）→ '+esc(P.params.coreFloor)+' 中央監控室。上方點數表「接到監控箱」欄可逐項修改。</p>'
    +'<div class="tblwrap"><table><thead><tr><th>監控箱</th><th>DI</th><th>DO</th><th>18DI</th><th>10DI8DO</th><th>模組／IP</th><th>待配置</th></tr></thead><tbody>'
    +io.panels.map(function(p){ return '<tr><td>'+esc(p.panel)+'</td><td>'+p.di+'</td><td>'+p.do+'</td><td>'+(p.n18||"")+'</td><td>'+(p.n10||"")+'</td><td class="mono" style="text-align:left">'+p.modules.map(function(m){return esc(m.id)+(m.manual?' <span class="rtag">手動</span>':'')+(m.ip?' <span class="hint">'+esc(m.ip)+'</span>':'')+(m.manual&&edit?' <button class="btn small danger" type="button" data-iomdel="'+m.xi+'" style="padding:0 6px">移除</button>':'');}).join("<br>")+'</td><td>'+(p.pending?'<b style="color:var(--bad)">'+p.pending+'</b>':'')+'</td></tr>'; }).join("")
    +'<tr class="grp"><td><b>合計</b></td><td><b>'+t.di+'</b></td><td><b>'+t.do+'</b></td><td><b>'+t.n18+'</b></td><td><b>'+t.n10+'</b></td><td></td><td>'+(t.pending?'<b style="color:var(--bad)">'+t.pending+'</b>':'')+'</td></tr></tbody></table></div>'
    +(edit?(function(){ var fs={}; (st.dr.floors||[]).concat(io.panels.map(function(p){ return p.floor; }),P.net.floors||[]).forEach(function(f){ if(f) fs[f]=1; });
      var fl=Object.keys(fs).sort(function(a,b){ return DESIGN.floorRank(a)-DESIGN.floorRank(b); });
      return '<div class="uprow"><span class="meta">手動新增模組</span><select class="fld" id="iomFloor">'+fl.map(function(f){ return '<option>'+esc(f)+'</option>'; }).join("")+'</select><select class="fld" id="iomType"><option>18DI</option><option>10DI8DO</option></select><button class="btn small" id="btnIomAdd" type="button">新增模組</button><span class="hint">新增後模組 IP 自動配給；可用「修改點位 → 移到」把點位搬進新模組。</span></div>'; })():'')
    +'<div class="uprow"><button class="btn small" id="xlsIo" type="button">匯出 IO 表（Excel）</button>'+(edit?'<input type="file" id="ioImpFile" accept=".xlsx"><button class="btn small" id="btnIoImp" type="button">匯入 IO 表</button><span class="hint">匯出後可在 Excel 改設備、點位內容、位置、DI 類別、點位編號（搬到其他端子或填「待配置」），或在新模組編號的列填點位；不要改「點位鍵」欄。匯入時會套用到平台。</span>':'')+'</div>';
  var sel=st.floor==="all"||(st.floor&&io.panels.some(function(p){return p.floor===st.floor;}))?st.floor:(io.panels[0]&&io.panels[0].floor);
  var shown=io.panels.filter(function(x){return sel==="all"||x.floor===sel;});
  if(shown.length){
    var used=0,spare=0,pend=0; shown.forEach(function(x){ x.rows.forEach(function(r){ if(r.pending) pend++; else if(r.name==="預留") spare++; else used++; }); });
    /* 「移到」選單：各模組剩餘端子（DI／DO 分開），可跨樓層 */
    var freeOf={}; io.panels.forEach(function(x){ x.rows.forEach(function(r){ if(r.mod&&r.name==="預留"&&!r.edited){ var t=r.ch.slice(0,2), k=r.mod+"|"+t; (freeOf[k]=freeOf[k]||[]).push(r.tag); } }); });
    var allMods=[]; io.panels.forEach(function(x){ x.modules.forEach(function(m){ allMods.push({id:m.id,floor:x.floor}); }); });
    var mvSel=function(r){
      if(!r.key) return '';
      var t=r.ptype||r.ch.slice(0,2), opts='<option value="">'+(r.pending?'（待配置）':'（目前位置）')+'</option>';
      allMods.forEach(function(m){ var fr=freeOf[m.id+"|"+t]||[]; if(fr.length&&m.id!==r.mod) opts+='<option value="'+esc(fr[0])+'">'+esc(m.id)+'（空 '+fr.length+'）</option>'; });
      if(!r.pending) opts+='<option value="pending">移到待配置</option>';
      if(r.moved||r.pending) opts+='<option value="auto">恢復自動配置</option>';
      return '<select class="fld" data-iomv="'+esc(r.key)+'" style="padding:2px 4px;max-width:150px" aria-label="'+esc(r.name)+' 移到">'+opts+'</select>';
    };
    h+='<h4 style="margin:16px 0 6px">IO 接線編表：<select id="ioFloor"><option value="all"'+(sel==="all"?" selected":"")+'>全部樓層</option>'+io.panels.map(function(x){ return '<option'+(x.floor===sel?" selected":"")+'>'+esc(x.floor)+'</option>'; }).join("")+'</select></h4>'
      +'<p class="meta">每個點位接到哪一個模組、哪一個端子。模組 IP 與「IP 編表」的 IO 設備一致（VLAN '+esc((shown[0].modules[0]||{}).vlan||"")+'）；同一台設備的點排在相鄰端子，模組末端為預留點。使用 '+used+' 點、預留 '+spare+' 點'+(pend?'、<b style="color:var(--bad)">待配置 '+pend+' 點</b>（列在最後，可用「修改點位 → 移到」放進有空端子的模組）':'')+'。'
      +'<br>DI 分<b style="color:var(--bad)">警報</b>（故障、跳脫、高低水位、漏水、濃度、求救、防盜等，發生時中央監控要跳警報、響鈴、記錄）與<b>不警報</b>（運轉、開關、位置等狀態顯示）：全部 DI 中警報 '+ien.alarm+' 點、不警報 '+ien.normal+' 點。系統依點位內容自動判斷，可逐點修改。'
      +(ien.edited?'<br>已手動修改 '+ien.edited+' 點（底色標示）。':'')+'</p>'
      +(ien.stale?'<div class="tipbox" style="border-color:var(--warn,#b7791f)"><b>有 '+ien.stale+' 個點位的自動編排已變動</b>（數量或樓層改過，端子重新排列），手動修改仍套用在原點位編號上，請確認標示「⚠」的列是否正確。</div>':'')
      +(edit?'<div class="tools" style="margin:6px 0">'+(st.ioEditing?'<button class="btn small primary" id="btnIoeSave" type="button">儲存點位修改</button><button class="btn small" id="btnIoeCancel" type="button">取消</button><span class="meta">可改設備、點位內容、位置；預留點也可以填入新的點位。清空設備名稱＝改回預留。「移到」可把點位搬到其他模組（含其他樓層監控箱，放在該模組第一個空端子）或設為待配置，選了就會儲存。</span>':'<button class="btn small" id="btnIoeOn" type="button">修改點位</button>')
        +(Object.keys(st.params.ioEdit||{}).length?'<button class="btn small danger" id="btnIoeReset" type="button">清除全部點位修改</button>':'')
        +(Object.keys(st.params.ioMove||{}).length?'<button class="btn small danger" id="btnIomReset" type="button">清除全部點位搬移（'+Object.keys(st.params.ioMove).length+'）</button>':'')+'</div>':'')
      +'<div class="tblwrap"><table><thead><tr>'+(sel==="all"?'<th>監控箱</th>':'')+'<th>模組</th><th>型號</th><th>模組 IP</th><th>端子</th><th>點位編號</th><th>設備</th><th>點位內容</th><th>DI 類別</th><th>位置</th>'+(edit&&st.ioEditing?'<th>移到</th>':'')+'</tr></thead><tbody>'
      +shown.map(function(x){ var last=""; return x.rows.map(function(r){ var first=r.mod!==last; last=r.mod;
        var ing=edit&&st.ioEditing&&r.ch!=="COM", di=/^DI/.test(r.ch||""), spareRow=r.name==="預留"&&!r.edited;
        var inp=function(k,v,w){ return '<input class="fld" data-ioe="'+esc(r.tag)+'" data-k="'+k+'" value="'+esc(v)+'" style="width:'+w+'px;padding:3px 6px">'; };
        var alm=di&&!spareRow?(edit?'<select class="alm'+(r.alarm?' on':'')+'" data-ioa="'+esc(r.tag)+'" aria-label="'+esc(r.tag)+' 警報類別"><option value="1"'+(r.alarm?' selected':'')+'>警報</option><option value="0"'+(r.alarm?'':' selected')+'>不警報</option></select>':(r.alarm?'<b style="color:var(--bad)">警報</b>':'不警報')):(di?'':'<span class="hint">—</span>');
        var cls=(spareRow?'muted':'')+(r.edited?' ioed':'')+(r.pending?' iopend':'')+(r.moved?' iomoved':'');
        return '<tr'+(cls.trim()?' class="'+cls.trim()+'"':'')+(first?' style="border-top:2px solid var(--line)"':'')+(r.stale?' title="原自動編排：'+esc(r.stale)+'"':'')+'>'+(sel==="all"?'<td>'+(first?esc(x.panel):'')+'</td>':'')+'<td class="mono">'+(first?esc(r.mod||r.module):'')+'</td><td>'+(first?esc(r.type||""):'')+'</td><td class="mono">'+(first?esc(r.ip||""):'')+'</td><td class="mono">'+esc(r.ch)+'</td><td class="mono">'+esc(r.tag)+(r.stale?' ⚠':'')+'</td>'
          +'<td>'+(ing?inp("dev",r.name==="預留"&&!r.edited?"":(r.dev||r.name),170):esc(r.dev||r.name))+'</td><td>'+(ing?inp("point",r.point||"",120):esc(r.point||""))+'</td><td>'+alm+'</td><td>'+(ing?inp("loc",r.loc||"",110):esc(r.loc||r.note||""))+'</td>'+(edit&&st.ioEditing?'<td>'+mvSel(r)+'</td>':'')+'</tr>'; }).join(""); }).join("")+'</tbody></table></div>';
  }
  return h;
}
/** 點數表每列「接到哪一層監控箱」：顯示判斷依據，可手動改 */
function atCell(r,P,edit){
  if(r.unit) return '<span class="hint">住戶保全：經戶內對講保全主機（通訊協定），不接 IO</span>';
  if(!r.at) return '<span class="hint">不佔模組</span>';
  var cur=(P.params.ioFloor||{})[r.fkey]||"", txt=r.at.floors.length>3?r.at.floors.length+" 層（依圖面）":r.at.floors.join("、");
  var warn=/推定|中央監控室/.test(r.at.by);
  if(!edit) return esc(txt)+'<br><span class="hint"'+(warn?' style="color:var(--warn,#b7791f)"':'')+'>'+esc(r.at.by)+'</span>';
  var fl=P.net.floors.slice(); (P.io.panels||[]).forEach(function(p){ if(fl.indexOf(p.floor)<0) fl.push(p.floor); });
  return '<select data-iofl="'+esc(r.fkey)+'" class="fld" style="padding:2px 4px"><option value="">自動：'+esc(txt)+'</option>'+fl.map(function(f){ return '<option'+(f===cur?" selected":"")+'>'+esc(f)+'</option>'; }).join("")+'</select><br><span class="hint"'+(warn&&!cur?' style="color:var(--warn,#b7791f)"':'')+'>'+esc(r.at.by)+'</span>';
}
function k(n,l){ return '<div class="kpi"><div class="n">'+esc(n)+'</div><div class="l">'+esc(l)+'</div></div>'; }

/* ---------- IP ---------- */
function ipView(P){
  var rows=P.ip.rows, f=st.ipf||"all", vl=P.ip.subnets;
  var shown=f==="all"?rows:rows.filter(function(r){ return String(r.vlan)===f; });
  return '<div class="row" style="flex-wrap:wrap"><h3>設備 IP 編表（'+rows.length+'）</h3><button class="btn small" id="csvIp" type="button">下載 Excel（CSV）</button></div>'
    +'<p class="meta">每個 VLAN：.1 為閘道（核心交換器）、.2～.19 給交換器與主機、.20 起依樓層由下往上配給設備；網段預留 '+Math.round(P.params.growth*100)+'% 成長空間。設備名稱格式：代號-樓層-序號（CAM 攝影機、IDU 室內機、ODU 門口機、ACR 讀卡機、IO 模組、SW 交換器…）。</p>'
    +netTable(P)
    +'<div class="filters"><select id="ipVlan"><option value="all">全部 VLAN</option>'+vl.map(function(s){ return '<option value="'+s.vlan+'"'+(String(s.vlan)===f?" selected":"")+'>VLAN '+s.vlan+' '+esc(s.name)+'（'+s.hosts+'）</option>'; }).join("")+'</select></div>'
    +'<div class="tblwrap"><table><thead><tr><th>VLAN</th><th>IP</th><th>遮罩</th><th>閘道</th><th>設備名稱</th><th>樓層</th><th>設備</th></tr></thead><tbody>'
    +shown.slice(0,600).map(function(r){ return '<tr><td>'+r.vlan+'</td><td class="mono">'+esc(r.ip)+'</td><td class="mono">'+maskOf(r.mask)+' <span class="hint">/'+r.mask+'</span></td><td class="mono">'+esc(r.gw)+'</td><td class="mono">'+esc(r.name)+'</td><td>'+esc(r.floor)+'</td><td>'+esc(r.device)+'</td></tr>'; }).join("")+'</tbody></table></div>';
}

/* ---------- IP／IO 標註回圖面（另存 DXF） ---------- */
var AN={mode:"layers",scale:1,table:false,sys:null,out:"strip",noPend:true,hide:""};
function annotView(P){
  if(!window.DXF_ANNOT) return '<p class="meta">標註元件未載入，請重新整理頁面。</p>';
  applyIoEdits(P);
  var keys=P.ip.subnets.map(function(s){ return [s.key,s.name+"（"+s.hosts+"）"]; }).concat([["io","中央監控 IO 點位（"+P.io.panels.reduce(function(m,p){ return m+p.rows.filter(function(r){ return r.key; }).length; },0)+"）"]]);
  if(!AN.sys){ AN.sys={}; keys.forEach(function(k){ AN.sys[k[0]]=true; }); }
  var ann=DXF_ANNOT.labels(st.dr,P,{systems:AN.sys,scale:AN.scale,table:AN.table}), S=ann.stat;
  var noPlan=!(st.dr.plans||[]).length;
  var h='<div class="row" style="flex-wrap:wrap"><h3>IP／IO 標註回圖面</h3></div>'
    +'<p class="meta">依「數量・報價」分析到的平面圖設備位置，把 IP 編表（設備名稱＋IP）與 IO 點位（模組端子＋點位內容）標在每個設備符號旁，監控箱旁標出 IO 模組與 IP。'
    +'同一張平面代表多層（例 9-17F）時，一個符號會列出各層的名稱與 IP。圖上找不到位置的設備（交換器、主機、平面圖沒畫的設備，或數量比符號多）會列在該平面圖右側「<b>待配置</b>」；IO 尚未配到模組的點也標「待配置」。'
    +'<br>原圖內容不會被修改，只在模型空間新增標註；可選分系統圖層（WV-IP-CCTV、WV-IP-INTERCOM、WV-IO、WV-PENDING…，在 CAD 用圖層開關分系統顯示）或全部放在同一圖層（WV-ANNOT）。</p>';
  if(noPlan) h+='<div class="tipbox">已儲存的圖面分析沒有平面圖設備位置（舊版分析），沒關係：下方選擇 DXF 後，平台會<b>直接重新分析這份圖</b>取得設備位置再標註，不需要先回「數量・報價」。</div>';
  else h+='<div class="kpis">'+k(S.ip,"IP 已標在設備旁")+k(S.ipPending,"IP 待配置",S.ipPending?"warn":"")+k(S.io,"IO 點已標在設備旁")+k(S.ioPending,"IO 待配置",S.ioPending?"warn":"")+k(S.plans,"平面圖")+'</div>';
  h+=(noPlan?'':'')+'<h4 style="margin:12px 0 6px">要標註的系統</h4><div class="uprow" style="flex-wrap:wrap">'+keys.map(function(x){ return '<label class="meta"><input type="checkbox" data-ansys="'+x[0]+'"'+(AN.sys[x[0]]?" checked":"")+'> '+esc(x[1])+'</label>'; }).join("")+'</div>'
    +'<div class="uprow" style="flex-wrap:wrap"><span class="meta">顯示方式</span><label class="meta"><input type="radio" name="anmode" value="layers"'+(AN.mode==="layers"?" checked":"")+'> 分系統圖層</label><label class="meta"><input type="radio" name="anmode" value="single"'+(AN.mode==="single"?" checked":"")+'> 全部同一圖層</label>'
    +'<span class="meta" style="margin-left:12px">文字大小</span><select class="fld" id="anScale">'+[0.5,0.75,1,1.5,2,3].map(function(v){ return '<option value="'+v+'"'+(+AN.scale===v?" selected":"")+'>×'+v+'</option>'; }).join("")+'</select>'
    +'<label class="meta" style="margin-left:12px"><input type="checkbox" id="anTable"'+(AN.table?" checked":"")+'> 圖面右側附完整 IP／IO 編表</label></div>'
    +'<div class="uprow" style="flex-wrap:wrap"><span class="meta">輸出方式</span><label class="meta"><input type="radio" name="anout" value="strip"'+(AN.out==="strip"?" checked":"")+'> 合併到原圖，拿掉管線（保留底圖與設備）</label><label class="meta"><input type="radio" name="anout" value="merge"'+(AN.out==="merge"?" checked":"")+'> 合併到原圖另存（含底圖）</label><label class="meta"><input type="radio" name="anout" value="layer"'+(AN.out==="layer"?" checked":"")+'> 只輸出標註（沒有底圖，要自己貼回原圖）</label><label class="meta"><input type="radio" name="anout" value="points"'+(AN.out==="points"?" checked":"")+'> 只留點位＋IP（拿掉管線與建築底圖）</label></div>'
    +'<p class="hint">「只輸出標註」：產生一個只有標註的小 DXF，座標與原圖相同。用法：AutoCAD 開這個標註 DXF → Ctrl＋A 全選 → 指令 <b>COPYBASE</b>（基點 0,0）→ 切到原本的 DWG → 指令 <b>PASTECLIP</b>（插入點 0,0）。也可以先另存成 DWG，再用 XATTACH 以 0,0 外部參考疊上去。'
    +'<br>「只留點位＋IP」：不帶原圖的管線與建築線，只畫各平面圖外框、標題、每個設備位置（小圓＋設備名稱）和 IP／IO 標註，適合給廠商設定 IP 或現場核對點位用。<br>「合併到原圖，拿掉管線」：底圖、設備符號都保留，只把管線圖層關閉＋凍結（圖元沒有刪，AutoCAD 開檔最穩；要永久刪除可在 AutoCAD 用 <b>LAYDEL</b>）。自動只認名稱明確的管線圖層（02-SA-L、SA-L、含「管線／配管／線架」），看不出來的不動；也可以在右邊自己填圖層名稱，用逗號分隔。<br>「合併到原圖另存」：把標註直接寫進選的 DXF。若原 DXF 是用線上網站或 ezdxf 轉出的（不是 AutoCAD 另存），AutoCAD 可能開不完整，請改用「只輸出標註」。</p>';
  var pend=ann.pending.filter(function(p){ return /^待配置/.test(p.title); });
  if(pend.length&&!noPlan) h+='<details class="mxwrap"><summary>待配置清單（'+pend.reduce(function(m,p){ return m+p.items.length; },0)+' 項）</summary><div class="tblwrap" style="max-height:320px;overflow:auto"><table><thead><tr><th>位置</th><th>項目</th></tr></thead><tbody>'
    +pend.map(function(p){ return p.items.map(function(it,i){ return '<tr><td>'+(i?'':esc(p.title.replace(/^待配置（|，圖上找不到位置）$|）$/g,"")))+'</td><td class="mono">'+esc(it.text)+'</td></tr>'; }).join(""); }).join("")+'</tbody></table></div></details>';
  h+='<h4 style="margin:12px 0 6px">產生標註 DXF</h4><p class="meta">選擇要標註的 DXF（通常是分析時用的同一份：'+esc(st.dr.fileName||"")+'）。平台會先在瀏覽器裡重新分析這份圖的設備位置，再把 IP／IO 標上去，所以座標一定對得上；檔案不會上傳。大檔約需 10～60 秒。</p>'
    +'<div class="uprow"><input type="file" id="anFile" accept=".dxf"><button class="btn primary small" id="anGo" type="button">產生並下載標註 DXF</button><span class="hint" id="anMsg"></span></div>'
    +'<div class="uprow" style="flex-wrap:wrap"><label class="meta"><input type="checkbox" id="anNoPend"'+(AN.noPend?" checked":"")+'> 圖上找不到位置的（待配置）不寫到圖面</label>'
    +'<span class="meta" style="margin-left:12px">拿掉管線的圖層</span><input class="fld" id="anHide" style="width:220px" placeholder="留空＝自動（02-SA-L、SA-L、名稱含管線／配管／線架）" value="'+esc(AN.hide)+'"></div>'
    +'<div id="anCheck"></div>';
  return h;
}
/* 各系統網段：預設自動切，可改 VLAN、網段（CIDR）、閘道 */
function netTable(P){
  var vl=P.ip.subnets, edit=T.canEdit(), cu=st.params.ipNet||{};
  var h='<h4 style="margin:12px 0 6px">各系統網段</h4><p class="meta">預設以「'+esc(P.params.baseNet)+'.x.0」依系統自動切網段'+(edit?'；要用公司或業主指定的網段，直接改下表後按「儲存網段」，例如影像監視 192.168.20.0/24、閘道 192.168.20.254。留空＝自動':'')+'。改完 IP 編表、IO 模組 IP 會一起更新。</p>'
    +'<div class="tblwrap"><table class="items"><thead><tr><th>系統</th><th>設備數</th><th>VLAN</th><th>網段（CIDR）</th><th>閘道</th><th>可用位址</th><th></th></tr></thead><tbody>';
  vl.forEach(function(s){
    var c=cu[s.key]||{};
    h+='<tr><td>'+esc(s.name)+(s.custom?' <span class="rtag">自訂</span>':'')+'</td><td>'+s.hosts+'</td>'
      +'<td>'+(edit?'<input class="fld mono" data-ipn="'+s.key+'" data-k="vlan" value="'+esc(c.vlan||"")+'" placeholder="'+s.vlan+'" style="width:70px">':s.vlan)+'</td>'
      +'<td>'+(edit?'<input class="fld mono" data-ipn="'+s.key+'" data-k="cidr" value="'+esc(c.cidr||"")+'" placeholder="'+esc(s.cidr)+'" style="width:150px">':esc(s.cidr))+'</td>'
      +'<td>'+(edit?'<input class="fld mono" data-ipn="'+s.key+'" data-k="gw" value="'+esc(c.gw||"")+'" placeholder="'+esc(s.gateway)+'" style="width:130px">':esc(s.gateway))+'</td>'
      +'<td>'+s.capacity+'</td><td class="hint" style="color:'+(s.warn?'var(--bad)':'inherit')+';white-space:normal">'+esc(s.warn||"")+'</td></tr>';
  });
  h+='</tbody></table></div>';
  if(edit) h+='<div class="tools" style="margin:6px 0 12px"><button class="btn small primary" id="btnIpnSave" type="button">儲存網段</button>'+(Object.keys(cu).length?'<button class="btn small" id="btnIpnReset" type="button">全部恢復自動</button>':'')+'</div>';
  return h;
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
  var h2='<div class="row" style="flex-wrap:wrap"><h3>佈線圖</h3><div class="tools"><select id="routePlan">'+plans.map(function(p,i){ return '<option value="'+i+'"'+(i===idx?" selected":"")+'>'+esc(p.title+"（"+p.table+"）")+'</option>'; }).join("")+'</select>'+expBtns()+'<button class="btn small" id="csvRoute" type="button">下載配線清單（CSV）</button></div></div>'
    +'<p class="meta">依 DXF 平面圖的設備位置，從樓層監控箱（藍色方塊）以直角走線連到各設備；門禁鎖與按鈕接到最近的讀卡機、車道設備接到車道主機、住戶設備接到最近的宅內配線箱。圖面單位推定為 1 單位＝'+(W.unitM*100)+' cm（可在參數調整）。'+((st.dr&&st.dr.planVer>=2)?(pl.segs.length<40?'<br><b style="color:var(--warn)">這張平面圖讀到的建築線條很少，底圖可能是未綁定的外部參考。</b>':''):'<br><b style="color:var(--warn)">目前顯示的是舊版分析結果，平面底圖不完整。請到「數量・報價」重新分析 DXF，並按「儲存分析結果」後再回來。</b>')+(pl.panel.assumed?'<br><b style="color:var(--warn)">這張平面圖沒有標示監控箱，暫以設備中心為起點。</b>':'')+(pl.mult>1?'<br>這張平面代表 '+pl.floors.join("、")+' 共 '+pl.mult+' 層，合計已乘以 '+pl.mult+'。':'')+'</p>'
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
  var x=wireSvg(P,sel), g='<svg class="netsvg" viewBox="0 0 '+x.W+' '+x.H+'" role="img" aria-label="'+esc(sel)+' 設備配置配線圖">'+x.g+'</svg>';
  return '<div class="row" style="flex-wrap:wrap"><h3>設備配置配線圖</h3><div class="tools"><select id="wireFloor">'+floors.map(function(f){ return '<option'+(f===sel?" selected":"")+'>'+esc(f)+'</option>'; }).join("")+'</select>'+expBtns()+'</div></div>'
    +'<div class="tools" style="margin:6px 0"><span class="meta">全樓層合併（'+floors.length+' 層）：</span><button class="btn small" data-expall="pdf" type="button">列印／存成 PDF（每層一頁）</button><button class="btn small" data-expall="png" type="button">合併 PNG</button><button class="btn small" data-expall="svg" type="button">合併 SVG</button></div>'
    +'<p class="meta">依該樓層設備數量，標示每類設備接到哪一台交換器或監控箱，以及使用的線材。單線圖範本提供後，會再加上管路與配線路徑。</p><div class="netwrap">'+g+'</div>';
}
/** 單一樓層的設備配置配線圖內容（不含外層 svg 標籤） */
function wireSvg(P,sel){
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
  var W=980, rh=30, top=70, H=top+Math.max(rows.length,1)*rh+20, g='';
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
  if(!rows.length) g+='<text x="10" y="'+(top+5)+'" class="t-s">這一層沒有設備</text>';
  return {g:g,W:W,H:H};
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
  el.querySelectorAll("[data-expall]").forEach(function(b){ b.onclick=function(){ exportAllWire(P,name,b.dataset.expall); }; });
  el.querySelectorAll("[data-exp]").forEach(function(b){ b.onclick=function(){
    var svg=el.querySelector("#dsBody svg.netsvg"), lbl={net:"網路架構",riser:"設備昇位圖"+(RS.split?"_分系統":""),wire:"設備配置配線圖_"+(st.floor&&P.net.floors.indexOf(st.floor)>=0?st.floor:P.net.floors[0]),route:"佈線圖_"+((P.wiring.plans[Math.min(st.plan||0,P.wiring.plans.length-1)]||{}).title||"")}[st.sub]||"圖";
    exportSvg(svg,name+"_"+lbl,b.dataset.exp); }; });
  if($("rsSplit")) $("rsSplit").onchange=function(){ RS.split=this.checked; rsSave(); re(); };
  el.querySelectorAll("[data-rs]").forEach(function(c){ c.onchange=function(){ RS.on[c.dataset.rs]=c.checked; rsSave(); re(); }; });
  if($("dxfRiser")) $("dxfRiser").onclick=function(){
    var R=riserData(P), sel=rsSel(R);
    var txt=DESIGN.riserDxf(R,sel,{params:P.params,title:name+"　各樓層設備昇位圖"+(sel?"（分系統）":""),source:st.dr.fileName||""});
    saveBlob(new Blob([txt],{type:"application/dxf"}),name.replace(/[\\/:*?"<>|]/g,"_")+"_設備昇位圖"+(sel?"_分系統":"")+".dxf");
    toast("已匯出 DXF（圖層：RISER-BMS／ACCESS／CCTV／INTERCOM，單位 mm）"); };
  if($("csvRiser")) $("csvRiser").onclick=function(){ var R=riserData(P), sn={}; R.systems.forEach(function(s){ sn[s[0]]=s[1]; });
    var rows=[["樓層","系統","設備","數量"]]; R.floors.slice().reverse().forEach(function(f){ R.systems.forEach(function(s){ if(RS.split&&!RS.on[s[0]]) return; ((R.cells[f]||{})[s[0]]||[]).forEach(function(e){ rows.push([f,sn[s[0]],e.name,e.n]); }); }); });
    csv(name+"_設備昇位清單.csv",rows); };
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
  el.querySelectorAll("[data-iofl]").forEach(function(sel){ sel.onchange=function(){
    var m=Object.assign({},st.params.ioFloor||{}); if(sel.value) m[sel.dataset.iofl]=sel.value; else delete m[sel.dataset.iofl];
    var np=Object.assign({},st.params,{ioFloor:m});
    api("analysisSave",{id:cur.id,kind:"design",data:np}).then(function(){ st.params=np; toast("「"+sel.dataset.iofl+"」接到 "+(sel.value||"自動判斷")); re(); }).catch(fail);
  }; });
  if($("csvIo")) $("csvIo").onclick=function(){ var rows=[["樓層","監控箱","模組","型號","模組IP","遮罩","閘道","端子","點位編號","設備","點位內容","DI類別","位置","說明"]]; P.io.panels.forEach(function(p){ var mm={}; p.modules.forEach(function(m){ mm[m.id]=m; }); p.rows.forEach(function(r){ var m=mm[r.mod]||{}; rows.push([p.floor,p.panel,r.mod||r.module,r.type||"",r.ip||"",m.mask?maskOf(m.mask):"",m.gw||"",r.ch,r.tag,r.dev||r.name,r.point||"",/^DI/.test(r.ch||"")&&r.name!=="預留"?(r.alarm?"警報":"不警報"):"",r.loc||"",(r.note||"")+(r.edited?"（手動修改）":"")]); }); }); csv(name+"_IO接線編表.csv",rows); };
  var ioeSave=function(m,msg){ var np=Object.assign({},st.params,{ioEdit:m}); return api("analysisSave",{id:cur.id,kind:"design",data:np}).then(function(){ st.params=np; toast(msg); re(); }).catch(fail); };
  var rowByTag=function(tag){ var hit=null; P.io.panels.forEach(function(p){ p.rows.forEach(function(r){ if(r.tag===tag) hit=r; }); }); return hit; };
  el.querySelectorAll("[data-ioa]").forEach(function(s2){ s2.onchange=function(){
    var r=rowByTag(s2.dataset.ioa); if(!r) return;
    var m=JSON.parse(JSON.stringify(st.params.ioEdit||{})), e=m[r.tag]||{}, v=s2.value==="1";
    if(e.o===undefined) e.o=ioOrig({dev:r.origDev,point:r.origPoint});
    var probe={ch:r.ch,name:r.name,dev:r.dev,point:r.point,note:r.note};
    if(v===alarmDef(probe)) delete e.alarm; else e.alarm=v?1:0;
    if(Object.keys(e).filter(function(k){ return k!=="o"; }).length) m[r.tag]=e; else delete m[r.tag];
    ioeSave(m,r.tag+" 設為"+(v?"警報":"不警報"));
  }; });
  el.querySelectorAll("[data-iomv]").forEach(function(s2){ s2.onchange=function(){
    if(!s2.value) return;
    var m=Object.assign({},st.params.ioMove||{}), k=s2.dataset.iomv, lab=k.split("|").slice(1).join(" ");
    if(s2.value==="auto") delete m[k]; else m[k]=s2.value;
    var np=Object.assign({},st.params,{ioMove:m});
    api("analysisSave",{id:cur.id,kind:"design",data:np}).then(function(){ st.params=np; toast(lab+(s2.value==="auto"?" 恢復自動配置":s2.value==="pending"?" 移到待配置":" 移到 "+s2.value)); re(); }).catch(fail);
  }; });
  var saveDesign=function(patch,msg){ var np=Object.assign({},st.params,patch); return api("analysisSave",{id:cur.id,kind:"design",data:np}).then(function(){ st.params=np; toast(msg); re(); }).catch(fail); };
  if($("btnIomAdd")) $("btnIomAdd").onclick=function(){ var m=(st.params.ioExtraMods||[]).concat([{floor:$("iomFloor").value,type:$("iomType").value}]); saveDesign({ioExtraMods:m},"已在 "+$("iomFloor").value+" 新增 "+$("iomType").value+" 模組"); };
  el.querySelectorAll("[data-iomdel]").forEach(function(b){ b.onclick=function(){ if(!confirm("移除這個手動新增的模組？模組上的點位會重新自動配置。")) return; var m=(st.params.ioExtraMods||[]).slice(); m.splice(+b.dataset.iomdel,1); saveDesign({ioExtraMods:m},"已移除模組"); }; });
  if($("xlsIo")) $("xlsIo").onclick=function(){
    applyIoEdits(P);
    var head=["樓層","監控箱","模組","型號","模組IP","端子","點位編號","設備","點位內容","DI類別","位置","說明","點位鍵（勿改）"];
    var rows=[head.map(function(h){ return {v:h,s:2}; })];
    P.io.panels.forEach(function(p){ var mm={}; p.modules.forEach(function(m){ mm[m.id]=m; }); p.rows.forEach(function(r){ if(r.ch==="COM") return; var m=mm[r.mod]||{};
      rows.push([p.floor,p.panel,r.mod||"待配置",r.type||"",r.ip||"",r.ch,r.pending?"待配置":r.tag,r.name==="預留"&&!r.edited?"預留":(r.dev||r.name),r.point||"",/^DI/.test(r.ch||"")&&!(r.name==="預留"&&!r.edited)?(r.alarm?"警報":"不警報"):"",r.loc||"",r.note||"",r.key||""].map(function(v){ return {v:v,s:3}; })); }); });
    var b=XLSX_WRITE.build([{name:"IO接線編表",cols:[7,12,12,10,14,8,18,26,18,8,18,18,40],rows:rows,freeze:1}]);
    var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([b],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})); a.download=name+"_IO接線編表.xlsx"; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1500);
  };
  if($("btnIoImp")) $("btnIoImp").onclick=function(){
    var f=$("ioImpFile").files[0]; if(!f){ toast("請先選擇 IO 表（.xlsx）"); return; }
    f.arrayBuffer().then(XLSX_LITE.read).then(function(sheets){
      var sh=sheets.filter(function(x){ return x.rows&&x.rows.length; })[0]; if(!sh) throw new Error("讀不到工作表");
      var rows=sh.rows.map(function(r){ return (r||[]).map(function(v){ return v===null||v===undefined?"":String(v).trim(); }); });
      var hi=rows.findIndex(function(r){ return r.indexOf("點位編號")>=0&&r.indexOf("設備")>=0; }); if(hi<0) throw new Error("找不到「點位編號」「設備」欄，請用平台匯出的 IO 表");
      var H=rows[hi], col=function(n){ return H.findIndex(function(h){ return h.indexOf(n)===0; }); };
      var cF=col("樓層"),cM=col("模組"),cT=col("型號"),cTag=col("點位編號"),cD=col("設備"),cP=col("點位內容"),cA=col("DI類別"),cL=col("位置"),cK=col("點位鍵");
      var data=rows.slice(hi+1).filter(function(r){ return r[cTag]||r[cD]; });
      /* 1. 新模組：點位編號用到不存在的模組，且有型號 → 手動新增 */
      var known={}; P.io.panels.forEach(function(p){ p.modules.forEach(function(m){ known[m.id]=1; }); });
      var extra=(st.params.ioExtraMods||[]).slice(), addMods=0, seenNew={};
      data.forEach(function(r){ var m=/^(IO-.+-\d+)-(DI|DO)\d+$/.exec(r[cTag]||""); if(!m||known[m[1]]||seenNew[m[1]]) return; var ty=/10DI8DO/.test(r[cT])?"10DI8DO":/18DI/.test(r[cT])?"18DI":(m[2]==="DO"?"10DI8DO":"18DI"); var fl=r[cF]; if(!fl) return; seenNew[m[1]]=1; extra.push({floor:fl,type:ty}); addMods++; });
      var p1=Object.assign({},st.params,{ioExtraMods:extra});
      var P1=DESIGN.plan(st.dr,Object.assign({},p1,{systems:cur.project.systems||[],panelFloors:st.panelFloors||{}}));
      /* 表上的新模組編號（例 IO-B1-09）對應到平台實際配給的編號（依樓層順序接在現有模組後面） */
      var base0=(st.params.ioExtraMods||[]).length, idMap={};
      Object.keys(seenNew).forEach(function(sid,i){ var xi=base0+i, real=null; P1.io.panels.forEach(function(p){ p.modules.forEach(function(m){ if(m.manual&&m.xi===xi) real=m.id; }); }); if(real) idMap[sid]=real; });
      data.forEach(function(r){ var m=/^(IO-.+-\d+)(-(?:DI|DO)\d+)$/.exec(r[cTag]||""); if(m&&idMap[m[1]]) r[cTag]=idMap[m[1]]+m[2]; });
      /* 2. 搬移：點位鍵現在的位置和表上點位編號不同 */
      var where={}, slotOK={}; P1.io.panels.forEach(function(p){ p.rows.forEach(function(r){ if(r.key) where[r.key]=r.pending?"待配置":r.tag; if(r.mod) slotOK[r.tag]=r.ch.slice(0,2); }); });
      var moves=Object.assign({},st.params.ioMove||{}), nMove=0, bad=[];
      data.forEach(function(r){ var k=r[cK], tag=r[cTag]; if(!k||!where[k]||!tag||tag===where[k]) return;
        if(tag==="待配置"){ moves[k]="pending"; nMove++; return; }
        if(!slotOK[tag]){ bad.push(tag); return; }
        if(slotOK[tag]!==k.split("|")[0]&&false) return;
        moves[k]=tag; nMove++; });
      var p2=Object.assign({},p1,{ioMove:moves});
      var P2=DESIGN.plan(st.dr,Object.assign({},p2,{systems:cur.project.systems||[],panelFloors:st.panelFloors||{}}));
      /* 3. 內容修改：與自動編排不同的設備、點位內容、位置、DI 類別 → ioEdit（依點位編號） */
      /* 有點位鍵的列依點位鍵找到它現在的位置（搬移後其他點的端子會重排）；沒有點位鍵的列（預留端子、新模組）依點位編號 */
      var byTag={}, byKey={}; P2.io.panels.forEach(function(p){ p.rows.forEach(function(r){ if(r.mod) byTag[r.tag]=r; if(r.key) byKey[r.key]=r; }); });
      var ed=JSON.parse(JSON.stringify(st.params.ioEdit||{})), nEd=0;
      data.forEach(function(r){ var x=r[cK]?byKey[r[cK]]:byTag[r[cTag]]; if(!x||x.pending||!x.mod) return; var tag=x.tag;
        if(!r[cK]&&x.name!=="預留"&&!x.edited) return;
        var e=ed[tag]||{}, origDev=x.name==="預留"?"":(x.dev||x.name), ch=false, dv=r[cD]==="預留"?"":r[cD];
        if(dv!==origDev){ if(dv!==(e.dev===undefined?origDev:e.dev)){ e.dev=dv; ch=true; } } else if(e.dev!==undefined){ delete e.dev; ch=true; }
        if(cP>=0){ if(r[cP]!==(x.point||"")){ if(e.point!==r[cP]){ e.point=r[cP]; ch=true; } } else if(e.point!==undefined){ delete e.point; ch=true; } }
        if(cL>=0){ if(r[cL]!==(x.loc||"")&&!/來自 /.test(r[cL])){ if(e.loc!==r[cL]){ e.loc=r[cL]; ch=true; } } }
        if(cA>=0&&/^(警報|不警報)$/.test(r[cA])){ var want=r[cA]==="警報"?1:0, probe={ch:x.ch,name:e.dev!==undefined?(e.dev||"預留"):x.name,dev:e.dev!==undefined?e.dev:x.dev,point:e.point!==undefined?e.point:x.point,note:x.note}, def=alarmDef(probe)?1:0, curA=e.alarm!==undefined?e.alarm:def;
          if(want!==curA){ if(want===def) delete e.alarm; else e.alarm=want; ch=true; } }
        if(ch){ if(e.o===undefined) e.o=(x.dev||x.name)+"|"+(x.point||""); ed[tag]=e; nEd++; } });
      if(!addMods&&!nMove&&!nEd){ toast("表上沒有變更"+(bad.length?"（無效的點位編號："+bad.slice(0,5).join("、")+"）":"")); return; }
      if(!confirm("匯入 IO 表：新增模組 "+addMods+" 個、搬移點位 "+nMove+" 個、修改內容 "+nEd+" 個"+(bad.length?"；略過無效點位編號 "+bad.length+" 個（"+bad.slice(0,5).join("、")+"）":"")+"。確定套用？")) return;
      return saveDesign({ioExtraMods:extra,ioMove:moves,ioEdit:ed},"已匯入 IO 表");
    }).catch(function(e){ toast("無法匯入："+(e.message||e)); });
  };
  if($("btnIomReset")) $("btnIomReset").onclick=function(){ if(!confirm("清除全部點位搬移，恢復自動配置？")) return; var np=Object.assign({},st.params,{ioMove:{}}); api("analysisSave",{id:cur.id,kind:"design",data:np}).then(function(){ st.params=np; toast("已恢復自動配置"); re(); }).catch(fail); };
  if($("btnIoeOn")) $("btnIoeOn").onclick=function(){ st.ioEditing=true; re(); };
  if($("btnIoeCancel")) $("btnIoeCancel").onclick=function(){ st.ioEditing=false; re(); };
  if($("btnIoeReset")) $("btnIoeReset").onclick=function(){ if(!confirm("清除全部點位修改（含警報設定），恢復系統自動編排？")) return; st.ioEditing=false; ioeSave({},"已恢復自動編排"); };
  if($("btnIoeSave")) $("btnIoeSave").onclick=function(){
    var m=JSON.parse(JSON.stringify(st.params.ioEdit||{})), ch=0;
    var byTag={}; el.querySelectorAll("[data-ioe]").forEach(function(inp){ (byTag[inp.dataset.ioe]=byTag[inp.dataset.ioe]||{})[inp.dataset.k]=inp.value.trim().slice(0,80); });
    Object.keys(byTag).forEach(function(tag){
      var r=rowByTag(tag); if(!r) return;
      var v=byTag[tag], orig={dev:r.origDev==="預留"?"":r.origDev,point:r.origPoint,loc:r.origLoc}, e=m[tag]||{};
      ["dev","point","loc"].forEach(function(k){ if(v[k]===undefined) return; if(v[k]===orig[k]) delete e[k]; else e[k]=v[k]; });
      if(e.o===undefined) e.o=ioOrig({dev:r.origDev,point:r.origPoint});
      var keep=Object.keys(e).filter(function(k){ return k!=="o"; }).length;
      if(JSON.stringify(keep?e:null)!==JSON.stringify(m[tag]||null)) ch++;
      if(keep) m[tag]=e; else delete m[tag];
    });
    st.ioEditing=false;
    if(!ch){ toast("沒有變更"); re(); return; }
    ioeSave(m,"已儲存 "+ch+" 個點位的修改");
  };
  el.querySelectorAll("[data-ansys]").forEach(function(c){ c.onchange=function(){ AN.sys[c.dataset.ansys]=c.checked; re(); }; });
  el.querySelectorAll("input[name=anmode]").forEach(function(r){ r.onchange=function(){ AN.mode=r.value; }; });
  el.querySelectorAll("input[name=anout]").forEach(function(r){ r.onchange=function(){ AN.out=r.value; }; });
  if($("anNoPend")) $("anNoPend").onchange=function(){ AN.noPend=this.checked; };
  if($("anHide")) $("anHide").oninput=function(){ AN.hide=this.value; };
  if($("anScale")) $("anScale").onchange=function(){ AN.scale=+this.value; re(); };
  if($("anTable")) $("anTable").onchange=function(){ AN.table=this.checked; re(); };
  if($("anGo")) $("anGo").onclick=function(){
    var f=$("anFile").files[0], msg=$("anMsg"); if(!f){ toast("請先選擇 DXF 檔"); return; }
    if(!/\.dxf$/i.test(f.name)){ toast("請選擇 .dxf 檔（DWG 請先在 AutoCAD 另存成 DXF；ZIP 請先解壓）"); return; }
    var b=this; b.disabled=true; msg.textContent="讀取中…";
    f.arrayBuffer().then(function(buf){
      var keep=new Uint8Array(buf.slice(0));
      /* 重新分析這份圖取得各平面圖的設備位置（與「數量・報價」同一套程式，在背景執行緒） */
      return new Promise(function(ok,no){
        var w=new Worker("dxf-worker.js?v="+encodeURIComponent(window.APP_VERSION||"0"));
        w.onmessage=function(ev){ var m=ev.data; if(m.type==="progress"){ msg.textContent="分析圖面："+m.text; return; } w.terminate(); if(m.type==="error") no(new Error(m.message)); else ok(m.result); };
        w.onerror=function(e){ w.terminate(); no(new Error(e.message||"瀏覽器不支援背景分析")); };
        w.postMessage({buf:buf,name:f.name},[buf]);
      }).then(function(dr2){
        if(!(dr2.plans||[]).length) throw new Error("這份圖讀不到平面圖標題與設備位置，無法標註（數量表 "+((dr2.tables||[]).length)+" 張）");
        msg.textContent="寫入標註中…";
        applyIoEdits(P);
        var ann=DXF_ANNOT.labels(dr2,P,{systems:AN.sys,scale:AN.scale,table:AN.table});
        if(AN.noPend) ann.pending=ann.pending.filter(function(p){ return !/^待配置/.test(p.title); });
        var hideL=AN.hide.trim()?AN.hide.split(/[,，、\s]+/).filter(Boolean):"auto";
        var r=AN.out==="merge"||AN.out==="strip"?DXF_ANNOT.write(keep,ann,{mode:AN.mode,hideLayers:AN.out==="strip"?hideL:null}):DXF_ANNOT.writeStandalone(ann,{mode:AN.mode,points:AN.out==="points"});
        var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([r.bytes],{type:"application/dxf"}));
        a.download=f.name.replace(/\.dxf$/i,"")+(AN.out==="merge"?"_IP_IO標註.dxf":AN.out==="strip"?"_IP_IO標註_無管線.dxf":AN.out==="points"?"_點位IP.dxf":"_IP_IO標註層.dxf"); document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },2000);
        var S=ann.stat;
        msg.textContent="完成：平面圖 "+S.plans+" 張；IP 標在設備旁 "+S.ip+"、待配置 "+S.ipPending+"；IO 標上 "+S.io+" 點、待配置 "+S.ioPending+"；圖層 "+r.layers.join("、");
        if(AN.out==="strip") msg.textContent+=(r.hidden&&r.hidden.length?"；已拿掉管線圖層："+r.hidden.join("、"):"；沒有找到名稱明確的管線圖層，請在「拿掉管線的圖層」自己填");
        if(AN.noPend&&(S.ipPending||S.ioPending)) msg.textContent+="（待配置沒寫到圖面，可看下方檢查表）";
        var ezd=(AN.out==="merge"||AN.out==="strip")&&/WRITTEN_BY_EZDXF|ezdxf/i.test(new TextDecoder("latin1").decode(keep.subarray(0,Math.min(keep.length,200000))));
        if(ezd) msg.textContent+="。注意：原 DXF 是線上網站／ezdxf 轉出的，AutoCAD 若開不完整，請用 AutoCAD 開原圖另存一次 DXF 再產生，或改選「只輸出標註」";
        var C=DXF_ANNOT.check(dr2,P,ann), ck=$("anCheck");
        if(ck) ck.innerHTML='<details open><summary><b>IP 標註檢查（沒算到？沒標到？）</b></summary><table class="tbl"><thead><tr><th>設備</th><th>IP 編表台數</th><th>圖上符號</th><th>已標</th><th>判斷</th></tr></thead><tbody>'
          +C.rows.map(function(r){ return '<tr'+(r.lab<r.ip?' class="iopend"':'')+'><td>'+esc(r.dev)+'</td><td>'+r.ip+'</td><td>'+r.sym+'</td><td>'+r.lab+'</td><td>'+esc(r.why)+'</td></tr>'; }).join("")+'</tbody></table>'
          +(C.noIp.length?'<p class="hint">圖上有符號、但 IP 編表沒有（多半本來就不需要 IP，例如磁簧、瓦斯、陽極鎖、宅內箱；若其中有需要 IP 的設備，代表「沒算到」，請告訴我們補規則）：'+C.noIp.map(function(x){ return esc(x.dev)+" "+x.sym; }).join("、")+'</p>':'')+'<p class="hint">交換器、伺服器、IO 模組在平面圖上通常沒有符號，一律列在待配置。</p></details>';
        b.disabled=false; toast("已產生標註 DXF");
      });
    }).catch(function(e){ b.disabled=false; msg.textContent=""; fail(e); });
  };
  if($("btnIpnSave")) $("btnIpnSave").onclick=function(){
    var m={}, bad="";
    el.querySelectorAll("[data-ipn]").forEach(function(i){ var v=i.value.trim(); if(!v) return; var k=i.dataset.ipn; (m[k]=m[k]||{})[i.dataset.k]=v;
      if(i.dataset.k==="cidr"&&!/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(v)) bad=v; if(i.dataset.k==="gw"&&!/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) bad=v; if(i.dataset.k==="vlan"&&!(+v>0&&+v<4095)) bad=v; });
    if(bad){ toast("「"+bad+"」格式不正確（網段例：192.168.20.0/24；閘道例：192.168.20.254；VLAN 1～4094）"); return; }
    var np=Object.assign({},st.params,{ipNet:m});
    api("analysisSave",{id:cur.id,kind:"design",data:np}).then(function(){ st.params=np; toast("已儲存網段，IP 編表已重新配置"); re(); }).catch(fail);
  };
  if($("btnIpnReset")) $("btnIpnReset").onclick=function(){ if(!confirm("各系統網段全部恢復自動配置？")) return; var np=Object.assign({},st.params,{ipNet:{}}); api("analysisSave",{id:cur.id,kind:"design",data:np}).then(function(){ st.params=np; toast("已恢復自動網段"); re(); }).catch(fail); };
  if($("csvIp")) $("csvIp").onclick=function(){ csv(name+"_IP編表.csv",[["VLAN","用途","IP","遮罩","閘道","設備名稱","樓層","設備"]].concat(P.ip.rows.map(function(r){ return [r.vlan,r.sys,r.ip,maskOf(r.mask),r.gw,r.name,r.floor,r.device]; }))); };
  if($("csvSw")) $("csvSw").onclick=function(){ csv(name+"_交換器.csv",[["層級","樓層","編號","埠數","使用","PoE(W)","上連"]].concat(P.net.access.map(function(a){ var d=P.net.dist.filter(function(d){ return d.floors.indexOf(a.floor)>=0; })[0]; return ["接取",a.floor,a.id,a.ports,a.used,a.poe?a.poeW:"",d?d.id:""]; }),P.net.dist.map(function(d){ return ["匯聚",d.at,d.id,d.ports,d.downlinks,"",P.net.core.id]; }),[["核心",P.net.core.floor,P.net.core.id,P.net.core.ports,"","",""]])); };
  if($("routePlan")) $("routePlan").onchange=function(){ st.plan=+this.value; re(); };
  el.querySelectorAll("[data-wc]").forEach(function(c){ c.onchange=function(){ st.wc=st.wc||{}; st.wc[c.dataset.wc]=c.checked; re(); }; });
  if($("csvRoute")) $("csvRoute").onclick=function(){ var rows=[["平面圖","代表樓層","設備","線材","長度(m)","起點X","起點Y","終點X","終點Y"]];
    P.wiring.plans.forEach(function(p){ p.runs.forEach(function(r){ rows.push([p.title,p.floors.join(" "),r.n,r.cable,r.m,r.x,r.y,r.tx,r.ty]); }); }); csv(name+"_配線清單.csv",rows); };
  if($("csvCable")) $("csvCable").onclick=function(){ csv(name+"_線材估算.csv",[["線材","用途","條數","米數","依據"]].concat(P.cables.map(function(c){ return [c.type,c.use,c.runs,c.meters,c.basis||"估算"]; }))); };
  if($("btnDsSave")) $("btnDsSave").onclick=function(){
    var np={ioQty:st.params.ioQty||{}, ioFloor:st.params.ioFloor||{}, ioEdit:st.params.ioEdit||{}, ioMove:st.params.ioMove||{}, ipNet:st.params.ipNet||{}, ioExtraMods:st.params.ioExtraMods||[], ioRules:{}, extraIo:xio().filter(function(x){ return String(x.name).trim()&&+x.n>0; }).map(function(x){ return {floor:x.floor,name:String(x.name).trim().slice(0,60),n:Math.min(200,+x.n)}; })};
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
