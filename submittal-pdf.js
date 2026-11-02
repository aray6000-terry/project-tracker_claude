/* 弱電專案平台 — 送審型錄 PDF 合併（瀏覽器端）
 * 依估價單項次排出：封面 → 送審目錄（含最終頁碼）→ 每項「材料送審資料表」＋該項原廠型錄。
 * 資料表用 canvas 繪製（使用者電腦的中文字型），原廠型錄 PDF 原樣併入，JPG/PNG 型錄放成 A4 一頁。
 * 需先載入 pdf-lib.min.js（window.PDFLib）。 */
(function(root){
"use strict";
var W=1240, H=1754, M=80, TW=W-2*M;            /* A4 @150dpi */
var A4=[595.28,841.89];
var FONT='"Microsoft JhengHei","PingFang TC","Noto Sans TC","Noto Sans CJK TC","Heiti TC",sans-serif';
var TOC_ROWS=30;

function str(v){ return v===null||v===undefined?"":String(v); }
function mkCanvas(){ var c=document.createElement("canvas"); c.width=W; c.height=H; var x=c.getContext("2d"); x.fillStyle="#fff"; x.fillRect(0,0,W,H); x.textBaseline="top"; return {c:c,x:x}; }
function font(x,size,bold){ x.font=(bold?"bold ":"")+size+"px "+FONT; }
function text(x,s,px,py,size,opt){ opt=opt||{}; font(x,size,opt.bold); x.fillStyle=opt.color||"#111"; x.textAlign=opt.align||"left"; x.fillText(str(s),px,py); x.textAlign="left"; }
/* 逐字換行（中英混排），回傳行陣列 */
function wrap(x,s,maxW,size,bold){
  font(x,size,bold); var out=[];
  str(s).split("\n").forEach(function(par){
    var line="";
    for(var i=0;i<par.length;i++){ var t=line+par[i]; if(x.measureText(t).width>maxW&&line){ out.push(line); line=par[i]; } else line=t; }
    out.push(line);
  });
  return out;
}
function fit(x,s,maxW,size,bold){
  font(x,size,bold); s=str(s); if(x.measureText(s).width<=maxW) return s;
  while(s.length>1&&x.measureText(s+"…").width>maxW) s=s.slice(0,-1);
  return s+"…";
}
function rect(x,px,py,w,h,fill){ if(fill){ x.fillStyle=fill; x.fillRect(px,py,w,h); } x.strokeStyle="#333"; x.lineWidth=2; x.strokeRect(px,py,w,h); }
function box(x,px,py){ x.strokeStyle="#111"; x.lineWidth=2; x.strokeRect(px,py+4,22,22); }
/* 表格列：cells=[{t,w,label,bold,maxLines}]，回傳下一列 y */
function row(x,py,cells,size){
  size=size||24; var lh=Math.round(size*1.45), pad=12, lines=cells.map(function(c){ var L=wrap(x,c.t,c.w-2*pad,size,c.bold||c.label); return c.maxLines&&L.length>c.maxLines?L.slice(0,c.maxLines-1).concat([fit(x,L.slice(c.maxLines-1).join(""),c.w-2*pad,size)]):L; });
  var h=Math.max.apply(null,lines.map(function(L){ return L.length; }))*lh+2*pad, px=M;
  cells.forEach(function(c,i){ rect(x,px,py,c.w,h,c.label?"#eef1f3":null); lines[i].forEach(function(l,k){ text(x,l,px+pad,py+pad+k*lh,size,{bold:c.bold||c.label}); }); px+=c.w; });
  return py+h;
}
function toJpeg(cv){ var d=cv.c.toDataURL("image/jpeg",0.9).split(",")[1], b=atob(d), u=new Uint8Array(b.length); for(var i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return u; }

/* ---------- 頁面 ---------- */
function coverPage(o){
  var cv=mkCanvas(), x=cv.x;
  x.strokeStyle="#111"; x.lineWidth=4; x.strokeRect(M,M,TW,H-2*M);
  text(x,"弱電系統工程　材料送審型錄",W/2,330,56,{bold:true,align:"center"});
  var y=520;
  [["工程名稱",o.project],["業主",o.client],["送審範圍",o.scope],["承攬廠商",o.contractor],["送審項目數",o.items.length+" 項（依估價單項次自動編排）"],["送審日期",o.date||"　　年　　月　　日　　第　　次送審"]].forEach(function(r){
    if(!r[1]) return;
    text(x,r[0],M+120,y,26,{color:"#555"});
    var ls=wrap(x,r[1],TW-240,34,true).slice(0,3);
    ls.forEach(function(l,i){ text(x,l,M+120,y+40+i*48,34,{bold:true}); });
    y+=40+ls.length*48+52;
  });
  return cv;
}
var TOC_COLS=[["序",50],["頁碼",70],["項次",80],["品名",280],["廠牌",150],["型號",260],["數量",90],["型錄",100]];
function tocPage(o,start,pno,pageIdx,pageCnt){
  var cv=mkCanvas(), x=cv.x;
  text(x,"送審目錄"+(pageCnt>1?"（"+(pageIdx+1)+"/"+pageCnt+"）":""),W/2,M,40,{bold:true,align:"center"});
  var y=M+80, px=M;
  TOC_COLS.forEach(function(c){ rect(x,px,y,c[1],50,"#e8ecef"); text(x,c[0],px+c[1]/2,y+12,22,{bold:true,align:"center"}); px+=c[1]; });
  y+=50;
  o.items.slice(start,start+TOC_ROWS).forEach(function(it,k){
    var i=start+k, nf=it.pages||0;
    var v=[i+1,pno[i],it.no,it.name,it.brand,it.model,str(it.qty)+" "+str(it.unit),nf?"已附 "+nf+" 頁":"待附"];
    px=M;
    TOC_COLS.forEach(function(c,j){ rect(x,px,y,c[1],46,null); text(x,fit(x,v[j],c[1]-14,20),j<3||j>5?px+c[1]/2:px+7,y+12,20,{align:j<3||j>5?"center":"left",color:j===7&&!nf?"#b45309":"#111"}); px+=c[1]; });
    y+=46;
  });
  return cv;
}
function sheetPage(o,it,i){
  var cv=mkCanvas(), x=cv.x, L=180, V=360, ALL=TW-L;
  text(x,"材 料 送 審 資 料 表",W/2,M,40,{bold:true,align:"center"});
  var y=M+80;
  y=row(x,y,[{t:"工程名稱",w:L,label:true},{t:o.project,w:ALL}]);
  y=row(x,y,[{t:"系統",w:L,label:true},{t:it.section,w:V},{t:"報價項次",w:L,label:true},{t:it.no+"（送審頁序 "+(i+1)+"）",w:V}]);
  y=row(x,y,[{t:"品名",w:L,label:true},{t:it.name,w:ALL,bold:true}]);
  y=row(x,y,[{t:"送審廠牌",w:L,label:true},{t:it.brand,w:V},{t:"型號",w:L,label:true},{t:it.model,w:V,bold:true}]);
  y=row(x,y,[{t:"數量",w:L,label:true},{t:str(it.qty)+" "+str(it.unit),w:V},{t:"估價廠牌",w:L,label:true},{t:it.quoteBrand||"—",w:V}]);
  y=row(x,y,[{t:"送審規格",w:L,label:true},{t:it.spec||"依送審廠牌原廠規格，詳附原廠型錄。",w:ALL,maxLines:8}],22);
  var att=it.attached&&it.attached.length?"已附於本頁之後："+it.attached.join("、"):"待附原廠型錄";
  if(it.failed&&it.failed.length) att+="\n無法併入（請另附）："+it.failed.join("、");
  y=row(x,y,[{t:"原廠型錄",w:L,label:true},{t:att,w:ALL,maxLines:5}],22);
  y=row(x,y,[{t:"備註",w:L,label:true},{t:it.note||"",w:ALL,maxLines:4}],22);
  y+=30;
  text(x,"規格符合性：",M,y,24,{bold:true});
  var px=M+150; [["符合圖說",130],["同等品（另附比較表）",280],["其他：＿＿＿＿＿＿",260]].forEach(function(b){ box(x,px,y); text(x,b[0],px+32,y,24); px+=b[1]+50; });
  y+=70;
  var cw=TW/3; px=M;
  ["承攬廠商","監造單位審查","設計單位審查"].forEach(function(t){ rect(x,px,y,cw,50,"#e8ecef"); text(x,t,px+cw/2,y+12,24,{bold:true,align:"center"}); px+=cw; });
  y+=50; px=M;
  for(var k=0;k<3;k++){
    rect(x,px,y,cw,210,null);
    if(k===0){ wrap(x,o.contractor||"",cw-24,22).slice(0,3).forEach(function(l,j){ text(x,l,px+12,y+14+j*32,22); }); text(x,"簽章：",px+12,y+120,22); }
    else { box(x,px+12,y+14); text(x,"核可",px+42,y+14,22); box(x,px+120,y+14); text(x,"修正後核可",px+150,y+14,22); box(x,px+12,y+60); text(x,"退回",px+42,y+60,22); text(x,"意見：",px+12,y+110,22); }
    px+=cw;
  }
  y+=240;
  text(x,"本表依估價單「"+it.no+"」自動產生。",M,y,20,{color:"#555"});
  return cv;
}

/* ---------- 型錄載入 ---------- */
function kindOf(f){ var m=str(f.mime).toLowerCase(), n=str(f.title).toLowerCase();
  if(m==="application/pdf"||/\.pdf$/.test(n)) return "pdf";
  if(/jpe?g$/.test(m)||/\.jpe?g$/.test(n)) return "jpg";
  if(/png$/.test(m)||/\.png$/.test(n)) return "png";
  return ""; }
function prepFiles(it){
  var P=root.PDFLib;
  it.loaded=[]; it.attached=[]; it.failed=it.failed||[]; it.pages=0;
  return (it.files||[]).reduce(function(pr,f){ return pr.then(function(){
    var k=kindOf(f), name=str(f.title).replace(/\.(pdf|jpe?g|png)$/i,"");
    if(!k||!f.bytes){ it.failed.push(name+(k?"":"（格式不支援，請轉 PDF）")); return; }
    if(k==="pdf") return P.PDFDocument.load(f.bytes,{ignoreEncryption:true,updateMetadata:false}).then(function(d){ var n=d.getPageCount(); if(!n) throw new Error("empty"); it.loaded.push({kind:"pdf",doc:d,n:n,title:name}); it.attached.push(name); it.pages+=n; })
      .catch(function(){ it.failed.push(name+"（PDF 無法讀取）"); });
    it.loaded.push({kind:k,bytes:f.bytes,n:1,title:name}); it.attached.push(name); it.pages+=1;
  }); },Promise.resolve());
}

/* ---------- 書籤 ---------- */
function addOutline(doc,entries){
  if(!entries.length) return;
  var P=root.PDFLib, ctx=doc.context, pages=doc.getPages(), oref=ctx.nextRef(), refs=entries.map(function(){ return ctx.nextRef(); });
  entries.forEach(function(e,i){
    var d={Title:P.PDFHexString.fromText(e.title),Parent:oref,Dest:ctx.obj([pages[e.page].ref,P.PDFName.of("Fit")])};
    if(i>0) d.Prev=refs[i-1]; if(i<refs.length-1) d.Next=refs[i+1];
    ctx.assign(refs[i],ctx.obj(d));
  });
  ctx.assign(oref,ctx.obj({Type:"Outlines",First:refs[0],Last:refs[refs.length-1],Count:refs.length}));
  doc.catalog.set(P.PDFName.of("Outlines"),oref);
  doc.catalog.set(P.PDFName.of("PageMode"),P.PDFName.of("UseOutlines"));
}

/**
 * o = {project, client, contractor, date, items:[{no,section,name,brand,model,qty,unit,quoteBrand,spec,note,
 *        files:[{title,mime,bytes:Uint8Array}]}]}
 * progress(text) 可省略。回傳 Promise<Uint8Array>
 */
function build(o,progress){
  var P=root.PDFLib; if(!P) return Promise.reject(new Error("PDF 元件未載入"));
  progress=progress||function(){};
  var items=o.items||[];
  o.scope=o.scope||items.map(function(it){ return it.section; }).filter(function(s,i,a){ return s&&a.indexOf(s)===i; }).join("、");
  var out, outline=[];
  return items.reduce(function(pr,it,i){ return pr.then(function(){ progress("讀取型錄 "+(i+1)+"/"+items.length); return prepFiles(it); }); },Promise.resolve())
  .then(function(){ return P.PDFDocument.create(); })
  .then(function(doc){
    out=doc;
    var tocN=Math.max(1,Math.ceil(items.length/TOC_ROWS)), pno=[], p=1+tocN+1;
    items.forEach(function(it){ pno.push(p); p+=1+it.pages; });
    var addCanvas=function(cv){ return doc.embedJpg(toJpeg(cv)).then(function(img){ var pg=doc.addPage(A4); pg.drawImage(img,{x:0,y:0,width:A4[0],height:A4[1]}); }); };
    var chain=addCanvas(coverPage(o)).then(function(){ outline.push({title:"封面",page:0}); outline.push({title:"送審目錄",page:1}); });
    for(var t=0;t<tocN;t++) (function(t){ chain=chain.then(function(){ return addCanvas(tocPage(o,t*TOC_ROWS,pno,t,tocN)); }); })(t);
    items.forEach(function(it,i){
      chain=chain.then(function(){
        progress("排版 "+(i+1)+"/"+items.length+"："+it.name);
        outline.push({title:it.no+" "+it.name+"（"+it.model+"）",page:doc.getPageCount()});
        return addCanvas(sheetPage(o,it,i));
      });
      (it.loaded||[]).forEach(function(f){
        chain=chain.then(function(){
          if(f.kind==="pdf") return doc.copyPages(f.doc,f.doc.getPageIndices()).then(function(ps){ ps.forEach(function(pg){ doc.addPage(pg); }); });
          return (f.kind==="png"?doc.embedPng(f.bytes):doc.embedJpg(f.bytes)).then(function(img){
            var land=img.width>img.height*1.15, size=land?[A4[1],A4[0]]:A4, s=Math.min((size[0]-40)/img.width,(size[1]-40)/img.height);
            var pg=doc.addPage(size); pg.drawImage(img,{x:(size[0]-img.width*s)/2,y:(size[1]-img.height*s)/2,width:img.width*s,height:img.height*s});
          }).catch(function(){ /* 影像損毀：補一頁說明 */ var pg=doc.addPage(A4); pg.drawText("Image error: "+f.title.replace(/[^\x20-\x7e]/g,"?"),{x:40,y:800,size:10}); });
        });
      });
    });
    return chain;
  })
  .then(function(){
    addOutline(out,outline);
    out.setTitle(str(o.project)+" 材料送審型錄"); out.setCreator("弱電專案平台"); out.setProducer("弱電專案平台 / pdf-lib");
    progress("產生檔案中…");
    return out.save({useObjectStreams:true});
  });
}

root.SUBMITTAL_PDF={build:build, kindOf:kindOf};
})(typeof self!=="undefined"?self:this);
