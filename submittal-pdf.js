/* 弱電專案平台 — 送審型錄 PDF 合併（瀏覽器端）
 * 依估價單項次排出：封面 → 送審目錄（含最終頁碼）→ 每項「材料送審資料表」＋該項原廠型錄。
 * 原廠型錄上自動「框選型號＋箭頭＋標示項次」（紅色，可在 Acrobat 移動／調整的註解），每頁右下加紅色頁碼。
 * 同一份型錄給多個項次用時只附一次，標示所有項次（例：一.9、二.17）。
 * 資料表用 canvas 繪製（使用者電腦的中文字型）；型號位置用 pdf.js 讀型錄文字找出。
 * 需先載入 pdf-lib.min.js（window.PDFLib）；pdf.js 由 pdfjs/ 動態載入，載入失敗時只標示項次不框選。 */
(function(root){
"use strict";
var W=1240, H=1754, M=80, TW=W-2*M;            /* A4 @150dpi */
var A4=[595.28,841.89];
var FONT='"Microsoft JhengHei","PingFang TC","Noto Sans TC","Noto Sans CJK TC","Heiti TC",sans-serif';
var TOC_ROWS=30, SEARCH_PAGES=8;
var RED=[0.86,0.08,0.08];

function str(v){ return v===null||v===undefined?"":String(v); }
function disp(no){ return str(no).replace(/-/g,"."); }           /* 項次顯示：一-4 → 一.4（同送審範例） */
function mkCanvas(w,h){ var c=document.createElement("canvas"); c.width=w||W; c.height=h||H; var x=c.getContext("2d"); x.fillStyle="#fff"; x.fillRect(0,0,c.width,c.height); x.textBaseline="top"; return {c:c,x:x}; }
function font(x,size,bold){ x.font=(bold?"bold ":"")+size+"px "+FONT; }
function text(x,s,px,py,size,opt){ opt=opt||{}; font(x,size,opt.bold); x.fillStyle=opt.color||"#111"; x.textAlign=opt.align||"left"; x.fillText(str(s),px,py); x.textAlign="left"; }
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
function row(x,py,cells,size){
  size=size||24; var lh=Math.round(size*1.45), pad=12, lines=cells.map(function(c){ var L=wrap(x,c.t,c.w-2*pad,size,c.bold||c.label); return c.maxLines&&L.length>c.maxLines?L.slice(0,c.maxLines-1).concat([fit(x,L.slice(c.maxLines-1).join(""),c.w-2*pad,size)]):L; });
  var h=Math.max.apply(null,lines.map(function(L){ return L.length; }))*lh+2*pad, px=M;
  cells.forEach(function(c,i){ rect(x,px,py,c.w,h,c.label?"#eef1f3":null); lines[i].forEach(function(l,k){ text(x,l,px+pad,py+pad+k*lh,size,{bold:c.bold||c.label}); }); px+=c.w; });
  return py+h;
}
function dataBytes(url){ var d=url.split(",")[1], b=atob(d), u=new Uint8Array(b.length); for(var i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return u; }
function toJpeg(cv){ return dataBytes(cv.c.toDataURL("image/jpeg",0.8)); }
function pgRange(a,n){ return n>1?a+"～"+(a+n-1):String(a); }

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
var TOC_COLS=[["序",50],["頁碼",70],["項次",80],["品名",270],["廠牌",140],["型號",250],["數量",90],["型錄頁",130]];
function tocPage(o,start,pageIdx,pageCnt){
  var cv=mkCanvas(), x=cv.x;
  text(x,"送審目錄"+(pageCnt>1?"（"+(pageIdx+1)+"/"+pageCnt+"）":""),W/2,M,40,{bold:true,align:"center"});
  var y=M+80, px=M;
  TOC_COLS.forEach(function(c){ rect(x,px,y,c[1],50,"#e8ecef"); text(x,c[0],px+c[1]/2,y+12,22,{bold:true,align:"center"}); px+=c[1]; });
  y+=50;
  o.items.slice(start,start+TOC_ROWS).forEach(function(it,k){
    var i=start+k, cat=it.catPages&&it.catPages.length?"p."+it.catPages.join("、"):"待附";
    var v=[i+1,it.sheetPage,disp(it.no),it.name,it.brand,it.model,str(it.qty)+" "+str(it.unit),cat];
    px=M;
    TOC_COLS.forEach(function(c,j){ var ctr=j<3||j===6; rect(x,px,y,c[1],46,null); text(x,fit(x,v[j],c[1]-14,20),ctr?px+c[1]/2:px+7,y+12,20,{align:ctr?"center":"left",color:j===7&&cat==="待附"?"#b45309":"#111"}); px+=c[1]; });
    y+=46;
  });
  return cv;
}
function sheetPage(o,it,i){
  var cv=mkCanvas(), x=cv.x, L=180, V=360, ALL=TW-L;
  text(x,"材 料 送 審 資 料 表",W/2,M,40,{bold:true,align:"center"});
  var y=M+80;
  y=row(x,y,[{t:"工程名稱",w:L,label:true},{t:o.project,w:ALL}]);
  y=row(x,y,[{t:"系統",w:L,label:true},{t:it.section,w:V},{t:"報價項次",w:L,label:true},{t:disp(it.no)+"（送審頁序 "+(i+1)+"）",w:V}]);
  y=row(x,y,[{t:"品名",w:L,label:true},{t:it.name,w:ALL,bold:true}]);
  y=row(x,y,[{t:"送審廠牌",w:L,label:true},{t:it.brand,w:V},{t:"型號",w:L,label:true},{t:it.model,w:V,bold:true}]);
  y=row(x,y,[{t:"數量",w:L,label:true},{t:str(it.qty)+" "+str(it.unit),w:V},{t:"估價廠牌",w:L,label:true},{t:it.quoteBrand||"—",w:V}]);
  y=row(x,y,[{t:"送審規格",w:L,label:true},{t:it.spec||"依送審廠牌原廠規格，詳附原廠型錄。",w:ALL,maxLines:8}],22);
  var att=it.attachLines&&it.attachLines.length?it.attachLines.join("\n"):"待附原廠型錄";
  if(it.failed&&it.failed.length) att+="\n無法併入（請另附）："+it.failed.join("、");
  y=row(x,y,[{t:"原廠型錄",w:L,label:true},{t:att,w:ALL,maxLines:6}],22);
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
  text(x,"本表依估價單「"+disp(it.no)+"」自動產生。",M,y,20,{color:"#555"});
  return cv;
}

/* ---------- 型錄載入 ---------- */
function kindOf(f){ var m=str(f.mime).toLowerCase(), n=str(f.title).toLowerCase();
  if(m==="application/pdf"||/\.pdf$/.test(n)) return "pdf";
  if(/jpe?g$/.test(m)||/\.jpe?g$/.test(n)) return "jpg";
  if(/png$/.test(m)||/\.png$/.test(n)) return "png";
  return ""; }
function cleanTitle(t){ return str(t).replace(/\.(pdf|jpe?g|png)$/i,""); }

/* pdf.js：找型號在型錄上的位置 */
function loadPdfjs(){
  if(root.__subPdfjs) return root.__subPdfjs;
  var base=(root.document&&document.baseURI)||"";
  var url=root.SUBMITTAL_PDFJS_URL||new URL("pdfjs/pdf.min.mjs",base).href, wk=root.SUBMITTAL_PDFJS_WORKER||new URL("pdfjs/pdf.worker.min.mjs",base).href;
  var dir=url.replace(/[^\/]*$/,"");
  root.__subPdfjs=import(url).then(function(m){ m.GlobalWorkerOptions.workerSrc=wk; return {getDocument:function(x){ return m.getDocument(x); },__opt:{cMapUrl:dir+"cmaps/",cMapPacked:true,standardFontDataUrl:dir+"standard_fonts/",wasmUrl:dir+"wasm/",isEvalSupported:false,stopAtErrors:false,verbosity:0}}; }).catch(function(e){ if(root.console) console.warn("pdf.js 載入失敗，型錄只標示項次",e); return null; });
  return root.__subPdfjs;
}
function norm(s){ return str(s).toUpperCase().replace(/[\s\-_－–—.．·/]/g,""); }
/* 搜尋字：型號中含數字的英數代碼（MDE-1800、NB-980S、VK4690G…）＋型錄庫關鍵字 */
function termsOf(it){
  var out=[], add=function(t){ var n=norm(t); if(n.length>=3&&out.indexOf(n)<0) out.push(n); };
  (str(it.model).replace(/[（(][^）)]*[）)]/g," ").match(/[A-Za-z0-9][A-Za-z0-9\-_.\/]*[A-Za-z0-9]/g)||[]).forEach(function(t){ if(/\d/.test(t)&&t.length>=3) add(t); });
  (it.keys||[]).forEach(function(k){ if(/[^\x00-\x7f]/.test(k)){ var n=norm(k); if(n.length>=2&&out.indexOf(n)<0) out.push(n); } else if(k.length>=3) add(k); });
  out.sort(function(a,b){ return b.length-a.length; });
  return out;
}
function findHits(pdfjs,bytes,terms){
  if(!pdfjs||!terms.length) return Promise.resolve(null);
  var task=pdfjs.getDocument(Object.assign({data:bytes.slice()},pdfjs.__opt));
  return task.promise.then(function(doc){
    var n=Math.min(doc.numPages,SEARCH_PAGES), best=null, p=1;
    function scan(pg){
      return pg.getTextContent().then(function(tc){
        var items=tc.items.filter(function(i){ return i.str&&i.str.trim(); }).map(function(i){ var t=i.transform, h=Math.abs(i.height)||Math.hypot(t[2],t[3])||Math.abs(t[3]); return {s:i.str,x:t[4],y:t[5],w:i.width,h:h}; });
        /* 同一行的文字併成一串，避免型號被拆成多段 */
        var lines=[]; items.forEach(function(it){ var L=lines.filter(function(l){ return Math.abs(l.y-it.y)<Math.max(2,it.h*0.4); })[0]; if(!L){ L={y:it.y,items:[]}; lines.push(L); } L.items.push(it); });
        lines.forEach(function(L){
          L.items.sort(function(a,b){ return a.x-b.x; });
          var joined="", map=[];
          L.items.forEach(function(it,k){ var s=norm(it.s); for(var c=0;c<s.length;c++) map.push({k:k,c:c,len:s.length}); joined+=s; });
          terms.forEach(function(t,ti){
            var at=joined.indexOf(t); if(at<0) return;
            var a=map[at], b=map[at+t.length-1], ia=L.items[a.k], ib=L.items[b.k];
            var x0=ia.x+ia.w*(a.c/a.len), x1=ib.x+ib.w*((b.c+1)/b.len);
            var h=Math.max(ia.h,ib.h), cand={page:pg.pageNumber-1,x:x0,y:Math.min(ia.y,ib.y)-h*0.2,w:Math.max(4,x1-x0),h:h*1.2,score:(terms.length-ti)*0.01+h+(pg.pageNumber===1?2:0)};
            if(!best||cand.score>best.score) best=cand;
          });
        });
      });
    }
    function next(){ if(p>n) return best; return doc.getPage(p++).then(scan).then(next); }
    return next().then(function(r){ try{ doc.destroy(); }catch(e){} return r; });
  }).catch(function(){ return null; });
}

/* 加密（有權限密碼）的型錄：pdf-lib 無法解密，改用 pdf.js 轉成影像頁 */
function renderPdf(pdfjs,bytes,progress,title){
  return pdfjs.getDocument(Object.assign({data:bytes.slice()},pdfjs.__opt)).promise.then(function(doc){
    var pages=[], p=1;
    function next(){
      if(p>doc.numPages){ try{ doc.destroy(); }catch(e){} return pages; }
      progress("轉換加密型錄「"+title+"」第 "+p+"/"+doc.numPages+" 頁");
      return doc.getPage(p++).then(function(pg){
        var vp1=pg.getViewport({scale:1}), s=Math.min(2,2200/Math.max(vp1.width,vp1.height)), vp=pg.getViewport({scale:s});
        var c=document.createElement("canvas"); c.width=Math.ceil(vp.width); c.height=Math.ceil(vp.height);
        var x=c.getContext("2d"); x.fillStyle="#fff"; x.fillRect(0,0,c.width,c.height);
        return pg.render({canvasContext:x,viewport:vp}).promise.then(function(){
          pages.push({jpg:dataBytes(c.toDataURL("image/jpeg",0.8)),w:vp1.width,h:vp1.height,view:pg.view,rot:pg.rotate%360});
          c.width=c.height=1;
        });
      }).then(next);
    }
    return next();
  });
}

/* ---------- 註解（Acrobat 可移動、調整） ---------- */
function labelImage(doc,label){
  var size=34, pad=6, cv=mkCanvas(10,10); font(cv.x,size,true); var w=Math.ceil(cv.x.measureText(label).width)+pad*2, h=size+pad*2;
  cv=mkCanvas(w,h); cv.x.clearRect(0,0,w,h); cv.x.fillStyle="rgba(255,255,255,0.85)"; cv.x.fillRect(0,0,w,h); text(cv.x,label,pad,pad,size,{bold:true,color:"rgb(220,20,20)"});
  return doc.embedPng(dataBytes(cv.c.toDataURL("image/png"))).then(function(img){ return {img:img,w:w*0.36,h:h*0.36}; });  /* 約 12pt 字 */
}
function addAnnot(doc,page,dict,stream){
  var P=root.PDFLib, ctx=doc.context, r=dict.Rect;
  var ap=ctx.flateStream(stream.content,{Type:"XObject",Subtype:"Form",BBox:r,Resources:stream.res||{}});
  dict.Type="Annot"; dict.F=4; dict.T=P.PDFHexString.fromText("送審標示"); dict.AP={N:ctx.register(ap)};
  if(dict.Contents) dict.Contents=P.PDFHexString.fromText(dict.Contents);
  page.node.addAnnot(ctx.register(ctx.obj(dict)));
}
function f2(n){ return (Math.round(n*100)/100).toString(); }
function markPage(doc,page,hit,label){
  var mb=page.getMediaBox(), X0=mb.x, Y0=mb.y, PW=mb.width, PH=mb.height, c=RED.join(" ");
  return labelImage(doc,label).then(function(L){
    var lx, ly;
    if(hit&&page.__rot) hit=null;                       /* 旋轉頁：只標示項次 */
    if(hit&&page.__off) hit={x:hit.x-page.__off[0],y:hit.y-page.__off[1],w:hit.w,h:hit.h};
    if(hit&&page.getRotation&&page.getRotation().angle%360) hit=null;
    if(hit){
      var b=[hit.x-3,hit.y-3,hit.x+hit.w+3,hit.y+hit.h+3];
      addAnnot(doc,page,{Subtype:"Square",Rect:b,C:RED,BS:{W:1.5},Contents:"項次 "+label},
        {content:c+" RG 1.5 w "+[b[0]+0.75,b[1]+0.75,b[2]-b[0]-1.5,b[3]-b[1]-1.5].map(f2).join(" ")+" re S"});
      /* 標籤放右下→左下→右上→左上，取第一個在頁面內的位置 */
      var opts=[[b[2]+18,b[1]-28-L.h],[b[0]-18-L.w,b[1]-28-L.h],[b[2]+18,b[3]+28],[b[0]-18-L.w,b[3]+28]];
      var ok=opts.filter(function(o){ return o[0]>=X0+4&&o[0]+L.w<=X0+PW-4&&o[1]>=Y0+4&&o[1]+L.h<=Y0+PH-4; })[0]||[Math.min(Math.max(X0+4,b[2]+10),X0+PW-L.w-4),Math.max(Y0+4,b[1]-L.h-30)];
      lx=ok[0]; ly=ok[1];
      /* 箭頭：從標籤指向框（箭頭在框這端） */
      var tx=Math.min(Math.max(lx+L.w/2,b[0]),b[2]), ty=ly>b[3]?b[3]:b[1];
      var sx=lx+L.w/2, sy=ly>b[3]?ly:ly+L.h, ang=Math.atan2(sy-ty,sx-tx), al=7;
      var a1=[tx+al*Math.cos(ang+0.45),ty+al*Math.sin(ang+0.45)], a2=[tx+al*Math.cos(ang-0.45),ty+al*Math.sin(ang-0.45)];
      var lr=[Math.min(tx,sx)-8,Math.min(ty,sy)-8,Math.max(tx,sx)+8,Math.max(ty,sy)+8];
      addAnnot(doc,page,{Subtype:"Line",Rect:lr,L:[tx,ty,sx,sy],LE:["OpenArrow","None"],C:RED,BS:{W:1.2}},
        {content:c+" RG 1.2 w "+f2(tx)+" "+f2(ty)+" m "+f2(sx)+" "+f2(sy)+" l S "+f2(a1[0])+" "+f2(a1[1])+" m "+f2(tx)+" "+f2(ty)+" l "+f2(a2[0])+" "+f2(a2[1])+" l S"});
    } else { lx=X0+PW-L.w-24; ly=Y0+PH-L.h-20; }
    var lr2=[lx,ly,lx+L.w,ly+L.h];
    addAnnot(doc,page,{Subtype:"Stamp",Name:"Approved",Rect:lr2,Contents:"項次 "+label},
      {content:"q "+f2(L.w)+" 0 0 "+f2(L.h)+" "+f2(lx)+" "+f2(ly)+" cm /Lb Do Q",res:{XObject:{Lb:L.img.ref}}});
  });
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
 * o = {project, client, contractor, date, mark(預設 true), items:[{no,section,name,brand,model,keys,qty,unit,quoteBrand,spec,note,
 *        files:[{id,title,mime,bytes:Uint8Array}]}]}
 * progress(text) 可省略。回傳 Promise<Uint8Array>
 */
function build(o,progress){
  var P=root.PDFLib; if(!P) return Promise.reject(new Error("PDF 元件未載入"));
  progress=progress||function(){};
  var items=o.items||[], FILES={}, order=[], mark=o.mark!==false;
  o.scope=o.scope||items.map(function(it){ return it.section; }).filter(function(s,i,a){ return s&&a.indexOf(s)===i; }).join("、");
  var out, outline=[], pdfjs=null;
  /* 1. 載入型錄（同一檔只載一次） */
  var loadAll=items.reduce(function(pr,it,i){ return pr.then(function(){
    progress("讀取型錄 "+(i+1)+"/"+items.length);
    it.fileKeys=[]; it.failed=it.failed||[];
    return (it.files||[]).reduce(function(p2,f){ return p2.then(function(){
      var key=f.id||(f.title+"#"+(f.bytes?f.bytes.length:0)), name=cleanTitle(f.title), k=kindOf(f);
      if(FILES[key]){ if(FILES[key].ok){ it.fileKeys.push(key); FILES[key].users.push(i); } else it.failed.push(name); return; }
      var rec=FILES[key]={key:key,title:name,kind:k,users:[i],ok:false};
      if(!k||!f.bytes){ it.failed.push(name+(k?"":"（格式不支援，請轉 PDF）")); return; }
      if(k==="pdf"){
        rec.bytes=f.bytes;
        var asRaster=function(){ return loadPdfjs().then(function(pj){ if(!pj) throw new Error("enc"); return renderPdf(pj,f.bytes,progress,name); })
          .then(function(img){ if(!img.length) throw new Error("empty"); rec.kind="raster"; rec.raster=img; rec.n=img.length; rec.ok=true; order.push(key); it.fileKeys.push(key); }); };
        return P.PDFDocument.load(f.bytes,{ignoreEncryption:true,updateMetadata:false})
          .then(function(d){ var n=d.getPageCount(); if(!n) throw new Error("empty"); return {d:d,n:n}; }, function(){ return null; })
          .catch(function(){ return null; })
          .then(function(x){
            if(x&&!x.d.isEncrypted){ rec.doc=x.d; rec.n=x.n; rec.ok=true; order.push(key); it.fileKeys.push(key); return; }
            return asRaster();          /* 加密或 pdf-lib 讀不了：改用 pdf.js 轉影像頁 */
          })
          .catch(function(){ it.failed.push(name+"（PDF 無法讀取）"); });
      }
      rec.bytes=f.bytes; rec.n=1; rec.ok=true; order.push(key); it.fileKeys.push(key);
    }); },Promise.resolve());
  }); },Promise.resolve());
  return loadAll
  /* 2. 找型號位置 */
  .then(function(){ return mark?loadPdfjs():null; })
  .then(function(m){
    pdfjs=m; if(!mark) return;
    return order.reduce(function(pr,key,i){ return pr.then(function(){
      var r=FILES[key]; r.hits={};
      if((r.kind!=="pdf"&&r.kind!=="raster")||!pdfjs) return;
      progress("尋找型號位置 "+(i+1)+"/"+order.length);
      return r.users.reduce(function(p2,ui){ return p2.then(function(){ return findHits(pdfjs,r.bytes,termsOf(items[ui])).then(function(h){ r.hits[ui]=h; }); }); },Promise.resolve());
    }); },Promise.resolve());
  })
  /* 3. 頁碼配置 */
  .then(function(){
    var tocN=Math.max(1,Math.ceil(items.length/TOC_ROWS)), p=1+tocN+1;
    items.forEach(function(it){
      it.sheetPage=p; p+=1;
      it.fileKeys.forEach(function(k){ var r=FILES[k]; if(r.start===undefined&&r.owner===undefined){ r.owner=it; r.start=p; p+=r.n; } });
    });
    items.forEach(function(it){
      it.catPages=[]; it.attachLines=[]; it.pages=0;
      it.fileKeys.forEach(function(k){ var r=FILES[k], rng=pgRange(r.start,r.n);
        it.catPages.push(rng); it.pages+=r.n;
        var others=r.users.filter(function(u){ return items[u]!==it; }).map(function(u){ return disp(items[u].no); });
        it.attachLines.push((r.owner===it?"附於第 ":"同第 ")+rng+" 頁："+r.title+(others.length?"（共用：" +others.join("、")+"）":""));
      });
    });
    o._tocN=tocN;
    return P.PDFDocument.create();
  })
  /* 4. 組版 */
  .then(function(doc){
    out=doc;
    var addCanvas=function(cv){ return doc.embedJpg(toJpeg(cv)).then(function(img){ var pg=doc.addPage(A4); pg.drawImage(img,{x:0,y:0,width:A4[0],height:A4[1]}); }); };
    var chain=addCanvas(coverPage(o)).then(function(){ outline.push({title:"封面",page:0}); outline.push({title:"送審目錄",page:1}); });
    for(var t=0;t<o._tocN;t++) (function(t){ chain=chain.then(function(){ return addCanvas(tocPage(o,t*TOC_ROWS,t,o._tocN)); }); })(t);
    items.forEach(function(it,i){
      chain=chain.then(function(){
        progress("排版 "+(i+1)+"/"+items.length+"："+it.name);
        outline.push({title:disp(it.no)+" "+it.name+"（"+it.model+"）",page:doc.getPageCount()});
        return addCanvas(sheetPage(o,it,i));
      });
      it.fileKeys.forEach(function(k){
        var r=FILES[k]; if(r.owner!==it) return;
        chain=chain.then(function(){
          r.pages=[];
          if(r.kind==="raster") return r.raster.reduce(function(p3,im){ return p3.then(function(){ return doc.embedJpg(im.jpg).then(function(img){
              var pg=doc.addPage([im.w,im.h]); pg.drawImage(img,{x:0,y:0,width:im.w,height:im.h}); pg.__off=[im.view[0],im.view[1]]; pg.__rot=im.rot; r.pages.push(pg); }); }); },Promise.resolve());
          if(r.kind==="pdf") return doc.copyPages(r.doc,r.doc.getPageIndices()).then(function(ps){ ps.forEach(function(pg){ r.pages.push(doc.addPage(pg)); }); });
          return (r.kind==="png"?doc.embedPng(r.bytes):doc.embedJpg(r.bytes)).then(function(img){
            var land=img.width>img.height*1.15, size=land?[A4[1],A4[0]]:A4, s=Math.min((size[0]-40)/img.width,(size[1]-60)/img.height);
            var pg=doc.addPage(size); pg.drawImage(img,{x:(size[0]-img.width*s)/2,y:(size[1]-img.height*s)/2+10,width:img.width*s,height:img.height*s}); r.pages.push(pg);
          }).catch(function(){ var pg=doc.addPage(A4); pg.drawText("Image error",{x:40,y:800,size:10}); r.pages.push(pg); });
        });
      });
    });
    return chain;
  })
  /* 5. 框選＋標示項次 */
  .then(function(){
    if(!mark) return;
    progress("框選型號、標示項次…");
    return order.reduce(function(pr,key){ return pr.then(function(){
      var r=FILES[key]; if(!r.pages||!r.pages.length) return;
      var groups={}, none=[];
      r.users.forEach(function(ui){ var h=r.hits&&r.hits[ui]; if(h&&r.pages[h.page]){ var g=h.page+":"+Math.round(h.x/8)+":"+Math.round(h.y/8); (groups[g]=groups[g]||{h:h,nos:[]}).nos.push(disp(items[ui].no)); } else none.push(disp(items[ui].no)); });
      var jobs=Object.keys(groups).map(function(g){ return [r.pages[groups[g].h.page],groups[g].h,groups[g].nos]; });
      if(none.length) jobs.push([r.pages[0],null,none]);
      return jobs.reduce(function(p2,j){ return p2.then(function(){ return markPage(out,j[0],j[1],j[2].join("、")); }); },Promise.resolve());
    }); },Promise.resolve());
  })
  /* 6. 頁碼（封面以外，右下紅字） */
  .then(function(){ return out.embedFont(P.StandardFonts.HelveticaBold); })
  .then(function(fnt){
    out.getPages().forEach(function(pg,i){
      if(i===0) return;
      var mb=pg.getMediaBox(), s=String(i+1), sz=12, w=fnt.widthOfTextAtSize(s,sz);
      pg.drawText(s,{x:mb.x+mb.width/2-w/2,y:mb.y+14,size:sz,font:fnt,color:P.rgb(RED[0],RED[1],RED[2])});
    });
    addOutline(out,outline);
    out.setTitle(str(o.project)+" 材料送審型錄"); out.setCreator("弱電專案平台"); out.setProducer("弱電專案平台 / pdf-lib");
    progress("產生檔案中…");
    return out.save({useObjectStreams:true});
  });
}

root.SUBMITTAL_PDF={build:build, kindOf:kindOf, termsOf:termsOf};
})(typeof self!=="undefined"?self:this);
