/* 弱電專案平台 — IP／IO 標註回原始 DXF
 * 1. labels()：依圖面分析的平面圖設備位置（plans[].devs），把 IP 編表、IO 點位對應到圖上每一個設備符號；
 *    圖上找不到位置的設備列在該平面圖右側「待配置」清單。
 * 2. write()：把標註（單行文字＋引線＋圓圈）寫進原始 DXF 的模型空間，另存新檔；原圖內容一個位元組都不改，只在 ENTITIES 尾端與圖層表追加。
 *    2007 以後（UTF-8）的 DXF 直接寫中文；更舊的版本寫成 \U+XXXX。文字樣式 WV-ZH 使用微軟正黑體。 */
(function (root) {
"use strict";

var LAYERS = {
  mgmt: ["WV-IP-MGMT", 8, "網管（交換器、AP）"], cctv: ["WV-IP-CCTV", 1, "影像監視"], intercom: ["WV-IP-INTERCOM", 3, "對講"],
  access: ["WV-IP-ACCESS", 5, "門禁"], bms: ["WV-IP-BMS", 6, "中央監控／IO 模組"], parking: ["WV-IP-PARKING", 30, "停車管理"],
  energy: ["WV-IP-ENERGY", 40, "能源／IoT"], media: ["WV-IP-MEDIA", 4, "多媒體／平台"], voice: ["WV-IP-VOICE", 2, "電話"],
  io: ["WV-IO", 6, "中央監控 IO 點位"], pending: ["WV-PENDING", 1, "待配置清單"]
};
var ALL_LAYER = ["WV-ANNOT", 2, "IP／IO 標註"];

function baseName(s) { return String(s || "").replace(/\s*#\d+$/, "").trim(); }
function splitNames(n) { return String(n || "").split("／").map(function (x) { return x.trim(); }).filter(Boolean); }
function readingOrder(a, b) { return (b.y - a.y) || (a.x - b.x); }   /* 由上而下、由左而右 */
function nameHit(devN, want) {
  var ns = splitNames(devN); if (ns.indexOf(want) >= 0) return 2;
  var w = want.replace(/[（(].*?[)）]/g, "");
  return ns.some(function (n) { var m = n.replace(/[（(].*?[)）]/g, ""); return m && w && (m.indexOf(w) >= 0 || w.indexOf(m) >= 0); }) ? 1 : 0;
}
function floorText(fs) { return fs.length > 2 ? fs[0] + "～" + fs[fs.length - 1] : fs.join("、"); }

/** 對應標註。dr：圖面分析（plans、items）；P：DESIGN.plan 的結果；opt：{ systems:{cctv:true…,io:true}, scale } */
function labels(dr, P, opt) {
  opt = opt || {};
  var want = opt.systems || null, out = [], pend = [], stat = { ip: 0, ipPending: 0, io: 0, ioPending: 0, plans: 0 };
  var plans = (dr.plans || []).filter(function (p) { return p.devs && p.devs.length && p.box; });
  var covered = {};
  plans.forEach(function (pl) { (pl.floors || []).forEach(function (f) { covered[f] = covered[f] || pl; }); });
  var ipRows = (P.ip && P.ip.rows) || [];
  var ioRows = [];
  ((P.io && P.io.panels) || []).forEach(function (pn) { pn.rows.forEach(function (r) { if (r.key && r.name !== "預留") ioRows.push({ r: r, panel: pn }); }); });

  plans.forEach(function (pl) {
    var fs = pl.floors && pl.floors.length ? pl.floors : [], w = pl.box[2] - pl.box[0];
    var h = Math.max(w / 220, 1) * (Number(opt.scale) || 1);
    var used = {}, pendHere = [];
    stat.plans++;
    function posFor(name) {
      var exact = pl.devs.filter(function (d) { return nameHit(d.n, name) === 2; });
      var list = exact.length ? exact : pl.devs.filter(function (d) { return nameHit(d.n, name) === 1; });
      return list.slice().sort(readingOrder);
    }
    function addLabel(d, layerKey, lines) {
      var k = d.x + "," + d.y, n = used[k] = (used[k] || 0) + 1;
      out.push({ x: d.x, y: d.y, tx: d.x + h * 1.2, ty: d.y + h * (1.2 + (n - 1) * (lines.length + 0.6)), h: h, layer: layerKey, lines: lines });
    }
    /* IP：同一平面代表多層（9-17F）時，每個符號列出各層的設備名稱與 IP */
    if (fs.length) {
      var byDev = {};
      ipRows.forEach(function (r) {
        if (fs.indexOf(r.floor) < 0 || (want && !want[r.key])) return;
        var k = r.device; (byDev[k] = byDev[k] || {}); (byDev[k][r.floor] = byDev[k][r.floor] || []).push(r);
      });
      Object.keys(byDev).forEach(function (dev) {
        var pos = posFor(dev), perF = byDev[dev], max = 0;
        fs.forEach(function (f) { max = Math.max(max, (perF[f] || []).length); });
        for (var i = 0; i < max; i++) {
          var rs = fs.map(function (f) { return (perF[f] || [])[i]; }).filter(Boolean); if (!rs.length) continue;
          var lines = rs.length <= 3 ? rs.map(function (r) { return r.name + " " + r.ip; }) : [rs[0].name + " " + rs[0].ip, "…", rs[rs.length - 1].name + " " + rs[rs.length - 1].ip + "（共 " + rs.length + " 層）"];
          if (pos[i]) { addLabel(pos[i], rs[0].key, lines); stat.ip += rs.length; }
          else { rs.forEach(function (r) { pendHere.push({ layer: r.key, text: r.name + " " + r.ip + "（" + r.device + "，" + r.floor + "）" }); stat.ipPending++; }); }
        }
      });
    }
    /* IO：同一台設備的點合成一個標註（模組端子＋點位內容） */
    if (fs.length && (!want || want.io)) {
      var devs = {};
      ioRows.forEach(function (x) {
        var kf = x.r.key.split("|")[0]; if (fs.indexOf(kf) < 0) return;
        var dk = x.r.dev; (devs[dk] = devs[dk] || {}); (devs[dk][kf] = devs[dk][kf] || []).push(x.r);
      });
      var seqOf = function (dev) { var m = /#(\d+)$/.exec(dev); return m ? +m[1] : 1; };
      var groups = {};
      Object.keys(devs).forEach(function (dk) { var b = baseName(dk); (groups[b] = groups[b] || []).push(dk); });
      Object.keys(groups).forEach(function (b) {
        var pos = posFor(b);
        groups[b].sort(function (a, c) { return seqOf(a) - seqOf(c); }).forEach(function (dk) {
          var perF = devs[dk], idx = seqOf(dk) - 1, rs = [];
          fs.forEach(function (f) { (perF[f] || []).forEach(function (r) { rs.push(r); }); });
          var tagOf = function (r) { return r.pending ? "待配置" : r.tag; };
          var lines = [dk + (fs.length > 1 ? "（" + floorText(fs.filter(function (f) { return perF[f]; })) + "）" : "")]
            .concat(rs.slice(0, fs.length > 1 ? 4 : 8).map(function (r) { return tagOf(r) + " " + (r.point || ""); }));
          if (rs.length > (fs.length > 1 ? 4 : 8)) lines.push("…共 " + rs.length + " 點，詳 IO 接線編表");
          if (pos[idx]) { addLabel(pos[idx], "io", lines); stat.io += rs.length; }
          else { rs.forEach(function (r) { pendHere.push({ layer: "io", text: tagOf(r) + " " + r.dev + " " + (r.point || "") + "（" + r.key.split("|")[0] + "）" }); stat.ioPending++; }); }
        });
      });
      /* 監控箱（IO 模組）：標在「中央監控系統配電箱」符號旁 */
      ((P.io && P.io.panels) || []).forEach(function (pn) {
        if (fs.indexOf(pn.floor) < 0 || !pn.modules.length) return;
        var box = pl.devs.filter(function (d) { return /監控系統配電箱|監控箱/.test(d.n); }).sort(readingOrder)[0];
        var lines = [pn.panel].concat(pn.modules.map(function (m) { return m.id + " " + m.type + (m.ip ? " " + m.ip : ""); }));
        if (box) addLabel(box, "io", lines);
        else pendHere.push({ layer: "io", text: pn.panel + "（" + pn.modules.map(function (m) { return m.id; }).join("、") + "）：圖上找不到監控箱位置" });
      });
    }
    if (pendHere.length) pend.push({ x: pl.box[2] + h * 3, y: pl.box[3], h: h, title: "待配置（" + pl.title + "，圖上找不到位置）", items: pendHere });
  });
  /* 圖面上沒有平面圖的樓層（交換器、主機、沒有畫在平面圖的設備）：列在第一張平面圖左側 */
  var orphan = [];
  ipRows.forEach(function (r) { if (!covered[r.floor] && (!want || want[r.key])) { orphan.push({ layer: r.key, text: r.name + " " + r.ip + "（" + r.device + "，" + r.floor + "）" }); stat.ipPending++; } });
  if (!want || want.io) ioRows.forEach(function (x) { var kf = x.r.key.split("|")[0]; if (!covered[kf]) { orphan.push({ layer: "io", text: (x.r.pending ? "待配置" : x.r.tag) + " " + x.r.dev + " " + (x.r.point || "") + "（" + kf + "）" }); stat.ioPending++; } });
  if (orphan.length) {
    var p0 = plans[0], hh = p0 ? Math.max((p0.box[2] - p0.box[0]) / 220, 1) * (Number(opt.scale) || 1) : 50;
    pend.push({ x: p0 ? p0.box[0] : 0, y: p0 ? p0.box[1] - hh * 4 : 0, h: hh, title: "待配置（圖面沒有平面圖的樓層或設備）", items: orphan });
  }
  /* 選擇「附完整編表」：IP 編表與 IO 接線編表以文字表格放在最右邊平面圖的右側，每欄 60 行 */
  if (opt.table && plans.length) {
    var right = plans.reduce(function (m, p) { return Math.max(m, p.box[2]); }, -Infinity), top = plans.reduce(function (m, p) { return Math.max(m, p.box[3]); }, -Infinity);
    var th = Math.max((plans[0].box[2] - plans[0].box[0]) / 220, 1) * (Number(opt.scale) || 1), colW = th * 42, x = right + th * 30;
    var put = function (title, layer, rowsTxt) {
      for (var i = 0; i < rowsTxt.length; i += 60) {
        pend.push({ x: x, y: top, h: th, title: title + (rowsTxt.length > 60 ? "（" + (i / 60 + 1) + "）" : ""), items: rowsTxt.slice(i, i + 60).map(function (t) { return { layer: layer, text: t }; }) });
        x += colW;
      }
    };
    var ipT = ipRows.filter(function (r) { return !want || want[r.key]; }).map(function (r) { return "VLAN" + r.vlan + "  " + r.ip + "  " + r.name + "  " + r.floor + "  " + r.device; });
    if (ipT.length) put("IP 編表", "pending", ipT);
    if (!want || want.io) {
      var ioT = [];
      ((P.io && P.io.panels) || []).forEach(function (pn) { pn.rows.forEach(function (r) { if (r.ch === "COM") return; ioT.push(pn.floor + "  " + (r.pending ? "待配置" : r.tag) + "  " + (r.name === "預留" ? "預留" : r.dev + " " + (r.point || ""))); }); });
      if (ioT.length) put("IO 接線編表", "io", ioT);
    }
  }
  return { labels: out, pending: pend, stat: stat };
}

/* ---------- DXF 寫入 ---------- */
function enc(s, utf8) {   /* 文字內容：去控制字元；UTF-8 檔（2007 以後）直接寫中文，舊版寫成 \U+XXXX */
  var o = "";
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i), ch = s[i];
    if (c >= 0xd800 && c <= 0xdbff) { i++; o += "?"; continue; }
    if (c < 32) o += " ";
    else if (c > 126 && !utf8) o += "\\U+" + ("000" + c.toString(16).toUpperCase()).slice(-4);
    else o += ch;
  }
  return o;
}
function ascii(s) { var u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0x7f; return u; }
function utf8Bytes(s) { return new TextEncoder().encode(s); }
function find(u8, str, from) {
  var p = ascii(str), n = p.length, last = u8.length - n;
  outer: for (var i = from || 0; i <= last; i++) { for (var j = 0; j < n; j++) if (u8[i + j] !== p[j]) continue outer; return i; }
  return -1;
}
function readLine(u8, i) { var e = i; while (e < u8.length && u8[e] !== 10) e++; var s = ""; for (var k = i; k < e; k++) s += String.fromCharCode(u8[k]); return { s: s.replace(/\r$/, ""), next: e + 1 }; }
/** 從位置 i 開始讀 group code/value 配對，直到 pred 成立 */
function scanPairs(u8, i, pred, limit) {
  var n = 0;
  while (i < u8.length && n++ < (limit || 5000000)) {
    var c = readLine(u8, i), v = readLine(u8, c.next);
    var r = pred(c.s.trim(), v.s, i, v.next); if (r) return r;
    i = v.next;
  }
  return null;
}

function write(bytes, ann, opt) {
  opt = opt || {};
  var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  var head = ""; for (var q = 0; q < Math.min(u8.length, 3000); q++) head += String.fromCharCode(u8[q]);
  var verM = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*AC(\d{4})/.exec(head), ver = verM ? +verM[1] : 1015, modern = ver >= 1015;
  var NL = find(u8, "\r\n", 0) >= 0 && find(u8, "\r\n", 0) < 200 ? "\r\n" : "\n";
  /* 1. 位置：ENTITIES 的 ENDSEC、LAYER 表的 ENDTAB、$HANDSEED、模型空間 BLOCK_RECORD */
  var entSec = scanPairs(u8, 0, function (c, v, at, nx) { return c === "2" && v.trim() === "ENTITIES" ? nx : null; });
  if (!entSec) throw new Error("找不到 DXF 的 ENTITIES 段，檔案可能不完整");
  /* ENTITIES 結尾：從段首往後找「0／ENDSEC」（大檔逐對掃描太慢，直接找位元組） */
  var entEnd = null, from = entSec;
  while (entEnd === null) {
    var e = find(u8, "ENDSEC", from); if (e < 0) break;
    var ls = e - 1; if (u8[ls - 1] === 13) ls--;                       /* 上一行行尾 */
    var ps = ls - 1; while (ps > 0 && u8[ps - 1] !== 10) ps--;          /* 上一行行首 */
    var codeLine = readLine(u8, ps).s.trim();
    if (codeLine === "0" && (u8[e + 6] === 10 || u8[e + 6] === 13)) entEnd = ps; else from = e + 6;
  }
  if (entEnd === null) throw new Error("找不到 ENTITIES 段結尾");
  var seed = null, layTab = null, layEnd = null, msOwner = null, zeroRef = {};
  if (modern) {
    seed = scanPairs(u8, 0, function (c, v, at, nx) {
      if (c === "9" && v.trim() === "$HANDSEED") { var c2 = readLine(u8, nx), v2 = readLine(u8, c2.next); return { at: c2.next, end: v2.next, hex: v2.s.trim() }; }
      if (c === "0" && v.trim() === "ENDSEC") return { none: true };
      return null;
    });
    if (seed && seed.none) seed = null;
    var tabStart = scanPairs(u8, 0, function (c, v, at, nx) {
      if (c === "0" && v.trim() === "TABLE") { var c2 = readLine(u8, nx), v2 = readLine(u8, c2.next); if (c2.s.trim() === "2" && v2.s.trim() === "LAYER") return { nx: v2.next }; }
      if (c === "2" && /^(BLOCKS|ENTITIES)$/.test(v.trim())) return { none: true };
      return null;
    });
    if (tabStart && !tabStart.none) {
      scanPairs(u8, tabStart.nx, function (c, v, at) { if (c === "5" && layTab === null) layTab = v.trim(); if (c === "0") return true; return null; });
      /* 新圖層照抄圖層「0」的出圖樣式（390）、材質（347）等參照：AutoCAD 讀到缺這些參照的圖層會整份放棄載入 */
      var inZero = false;
      layEnd = scanPairs(u8, tabStart.nx, function (c, v, at) {
        if (c === "0") { inZero = false; if (v.trim() === "ENDTAB") return at; }
        if (c === "2") inZero = v.trim() === "0";
        if (inZero && /^(390|347|348)$/.test(c)) zeroRef[c] = v.trim();
        return null;
      });
    }
    scanPairs(u8, 0, function (c, v, at, nx) {
      if (c === "0" && v.trim() === "BLOCK_RECORD") {
        var h = null, name = null;
        scanPairs(u8, nx, function (c2, v2) { if (c2 === "5" && h === null) h = v2.trim(); if (c2 === "2" && name === null) name = v2.trim(); return c2 === "0" ? true : null; });
        if (name && /^\*model_space$/i.test(name)) { msOwner = h; return true; }
      }
      if (c === "2" && /^(BLOCKS|ENTITIES)$/.test(v.trim())) return true;
      return null;
    });
  }
  var styTab = null, styEnd = null, hasStyle = false;
  var styStart = scanPairs(u8, 0, function (c, v, at, nx) {
    if (c === "0" && v.trim() === "TABLE") { var c2 = readLine(u8, nx), v2 = readLine(u8, c2.next); if (c2.s.trim() === "2" && v2.s.trim() === "STYLE") return { nx: v2.next }; }
    if (c === "2" && /^(BLOCKS|ENTITIES)$/.test(v.trim())) return { none: true };
    return null;
  });
  if (styStart && !styStart.none) {
    scanPairs(u8, styStart.nx, function (c, v) { if (c === "5" && styTab === null) styTab = v.trim(); return c === "0" ? true : null; });
    styEnd = scanPairs(u8, styStart.nx, function (c, v, at) { if (c === "2" && v.trim() === "WV-ZH") hasStyle = true; return c === "0" && v.trim() === "ENDTAB" ? at : null; });
  }
  var hNext = seed && /^[0-9A-Fa-f]+$/.test(seed.hex) ? parseInt(seed.hex, 16) : 0x7f000000;
  function handle() { return (hNext++).toString(16).toUpperCase(); }
  function pair(c, v) { return (c < 10 ? "  " : c < 100 ? " " : "") + c + NL + v + NL; }
  /* 2. 圖層 */
  var one = opt.mode === "single", layersUsed = {};
  function layerOf(k) { var L = one ? ALL_LAYER : (LAYERS[k] || LAYERS.pending); layersUsed[L[0]] = L; return L[0]; }
  /* 3. 實體：引線＋單行文字（TEXT，各家 CAD 與檢視器都支援；字型用新增的文字樣式 WV-ZH＝微軟正黑體） */
  var utf8 = ver >= 1021, STYLE = "WV-ZH";
  var ents = "";
  function ent(type, layer, body, sub) {
    var s = pair(0, type);
    if (modern) { s += pair(5, handle()); if (msOwner) s += pair(330, msOwner); s += pair(100, "AcDbEntity"); }
    s += pair(8, layer);
    if (modern && sub) s += pair(100, sub);
    return s + body;
  }
  function mtext(layer, x, y, h, lines) {   /* 多行：每行一個 TEXT，行距 1.5 倍字高 */
    lines.forEach(function (ln, i) {
      var body = pair(10, x.toFixed(3)) + pair(20, (y - i * h * 1.5).toFixed(3)) + pair(30, "0.0") + pair(40, h.toFixed(3)) + pair(1, enc(ln, utf8)) + pair(7, STYLE);
      if (modern) body += pair(100, "AcDbText");
      ents += ent("TEXT", layer, body, "AcDbText");
    });
  }
  function line(layer, x1, y1, x2, y2) {
    ents += ent("LINE", layer, pair(10, x1.toFixed(3)) + pair(20, y1.toFixed(3)) + pair(30, "0.0") + pair(11, x2.toFixed(3)) + pair(21, y2.toFixed(3)) + pair(31, "0.0"), "AcDbLine");
  }
  function circle(layer, x, y, r) { ents += ent("CIRCLE", layer, pair(10, x.toFixed(3)) + pair(20, y.toFixed(3)) + pair(30, "0.0") + pair(40, r.toFixed(3)), "AcDbCircle"); }
  ann.labels.forEach(function (l) {
    var L = layerOf(l.layer);
    circle(L, l.x, l.y, l.h * 0.6);
    line(L, l.x, l.y, l.tx, l.ty);
    mtext(L, l.tx, l.ty + l.h * 1.2 * l.lines.length, l.h, l.lines);
  });
  ann.pending.forEach(function (p) {
    var byL = {};
    p.items.forEach(function (it) { var L = layerOf(it.layer); (byL[L] = byL[L] || []).push(it.text); });
    var y = p.y, L0 = layerOf("pending");
    mtext(L0, p.x, y, p.h * 1.3, [p.title]); y -= p.h * 3;
    Object.keys(byL).forEach(function (L) {
      var arr = byL[L];
      for (var i = 0; i < arr.length; i += 40) { var chunk = arr.slice(i, i + 40); mtext(L, p.x, y, p.h, chunk); y -= p.h * 1.7 * chunk.length + p.h * 2; }
    });
  });
  /* 4. 圖層表記錄 */
  var layRec = "";
  Object.keys(layersUsed).forEach(function (n) {
    var L = layersUsed[n];
    if (find(u8, NL + n + NL, 0) >= 0 && layEnd !== null && find(u8, NL + n + NL, 0) < layEnd) return;   /* 已有同名圖層 */
    layRec += pair(0, "LAYER");
    if (modern) { layRec += pair(5, handle()); if (layTab) layRec += pair(330, layTab); layRec += pair(100, "AcDbSymbolTableRecord") + pair(100, "AcDbLayerTableRecord"); }
    layRec += pair(2, n) + pair(70, "0") + pair(62, String(L[1])) + pair(6, "Continuous");
    if (modern) { layRec += pair(370, "-3"); ["390", "347", "348"].forEach(function (k) { if (zeroRef[k]) layRec += pair(+k, zeroRef[k]); }); }
  });
  var styRec = "";
  if (styEnd !== null && !hasStyle) {
    styRec += pair(0, "STYLE");
    if (modern) { styRec += pair(5, handle()); if (styTab) styRec += pair(330, styTab); styRec += pair(100, "AcDbSymbolTableRecord") + pair(100, "AcDbTextStyleTableRecord"); }
    styRec += pair(2, "WV-ZH") + pair(70, "0") + pair(40, "0.0") + pair(41, "1.0") + pair(50, "0.0") + pair(71, "0") + pair(42, "2.5") + pair(3, "msjh.ttc") + pair(4, "");
  }
  /* 5. 組合：依位置由後往前插入，前面的位移才不會影響 */
  var toB = function (x) { return utf8 ? utf8Bytes(x) : ascii(x); };
  var edits = [{ at: entEnd, data: toB(ents) }];
  if (layRec && layEnd !== null) edits.push({ at: layEnd, data: ascii(layRec) });
  if (styRec) edits.push({ at: styEnd, data: ascii(styRec) });
  if (seed) edits.push({ at: seed.at, end: seed.end, data: ascii(hNext.toString(16).toUpperCase() + NL) });
  edits.sort(function (a, b) { return b.at - a.at; });
  var parts = [], cursor = u8.length;
  edits.forEach(function (e) {
    var tailStart = e.end !== undefined ? e.end : e.at;
    parts.unshift(u8.subarray(tailStart, cursor));
    parts.unshift(e.data);
    cursor = e.at;
  });
  parts.unshift(u8.subarray(0, cursor));
  var total = parts.reduce(function (s, p) { return s + p.length; }, 0), outB = new Uint8Array(total), o = 0;
  parts.forEach(function (p) { outB.set(p, o); o += p.length; });
  return { bytes: outB, count: ann.labels.length, layers: Object.keys(layersUsed), version: "AC" + ver };
}

/** 只輸出標註的獨立 DXF（R12 格式，最單純、各版 AutoCAD 都能開）：座標與原圖相同，
    在 AutoCAD 打開原圖後用「插入」（插入點 0,0、比例 1）或「外部參考」疊上去即可。中文寫成 \U+XXXX。 */
function writeStandalone(ann, opt) {
  opt = opt || {};
  var NL = "\r\n", one = opt.mode === "single", used = {}, out = [];
  function pair(c, v) { out.push((c < 10 ? "  " : c < 100 ? " " : "") + c, String(v)); }
  function layerOf(k) { var L = one ? ALL_LAYER : (LAYERS[k] || LAYERS.pending); used[L[0]] = L; return L[0]; }
  var ents = [];
  function text(L, x, y, h, lines) { lines.forEach(function (ln, i) { ents.push(["TEXT", L, x, y - i * h * 1.5, h, enc(ln, false)]); }); }
  ann.labels.forEach(function (l) {
    var L = layerOf(l.layer);
    ents.push(["CIRCLE", L, l.x, l.y, l.h * 0.6]);
    ents.push(["LINE", L, l.x, l.y, l.tx, l.ty]);
    text(L, l.tx, l.ty + l.h * 1.2 * l.lines.length, l.h, l.lines);
  });
  ann.pending.forEach(function (p) {
    var byL = {};
    p.items.forEach(function (it) { var L = layerOf(it.layer); (byL[L] = byL[L] || []).push(it.text); });
    var y = p.y; text(layerOf("pending"), p.x, y, p.h * 1.3, [p.title]); y -= p.h * 3;
    Object.keys(byL).forEach(function (L) { var arr = byL[L]; for (var i = 0; i < arr.length; i += 40) { var ch = arr.slice(i, i + 40); text(L, p.x, y, p.h, ch); y -= p.h * 1.7 * ch.length + p.h * 2; } });
  });
  var f = function (v) { return (+v).toFixed(3); };
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  ents.forEach(function (e) { x0 = Math.min(x0, e[2]); y0 = Math.min(y0, e[3]); x1 = Math.max(x1, e[2]); y1 = Math.max(y1, e[3]); });
  if (!isFinite(x0)) { x0 = y0 = 0; x1 = y1 = 100; }
  pair(0, "SECTION"); pair(2, "HEADER");
  pair(9, "$ACADVER"); pair(1, "AC1009");
  pair(9, "$DWGCODEPAGE"); pair(3, "ANSI_950");
  pair(9, "$EXTMIN"); pair(10, f(x0)); pair(20, f(y0)); pair(30, "0.0");
  pair(9, "$EXTMAX"); pair(10, f(x1)); pair(20, f(y1)); pair(30, "0.0");
  pair(0, "ENDSEC");
  pair(0, "SECTION"); pair(2, "TABLES");
  pair(0, "TABLE"); pair(2, "LTYPE"); pair(70, 1);
  pair(0, "LTYPE"); pair(2, "CONTINUOUS"); pair(70, 0); pair(3, "Solid line"); pair(72, 65); pair(73, 0); pair(40, "0.0");
  pair(0, "ENDTAB");
  var ls = Object.keys(used);
  pair(0, "TABLE"); pair(2, "LAYER"); pair(70, ls.length + 1);
  pair(0, "LAYER"); pair(2, "0"); pair(70, 0); pair(62, 7); pair(6, "CONTINUOUS");
  ls.forEach(function (n) { pair(0, "LAYER"); pair(2, n); pair(70, 0); pair(62, used[n][1]); pair(6, "CONTINUOUS"); });
  pair(0, "ENDTAB");
  pair(0, "TABLE"); pair(2, "STYLE"); pair(70, 2);
  pair(0, "STYLE"); pair(2, "STANDARD"); pair(70, 0); pair(40, "0.0"); pair(41, "1.0"); pair(50, "0.0"); pair(71, 0); pair(42, "2.5"); pair(3, "txt"); pair(4, "");
  pair(0, "STYLE"); pair(2, "WV-ZH"); pair(70, 0); pair(40, "0.0"); pair(41, "1.0"); pair(50, "0.0"); pair(71, 0); pair(42, "2.5"); pair(3, "msjh.ttc"); pair(4, "");
  pair(0, "ENDTAB");
  pair(0, "ENDSEC");
  pair(0, "SECTION"); pair(2, "ENTITIES");
  ents.forEach(function (e) {
    pair(0, e[0]); pair(8, e[1]);
    if (e[0] === "TEXT") { pair(10, f(e[2])); pair(20, f(e[3])); pair(30, "0.0"); pair(40, f(e[4])); pair(1, e[5]); pair(7, "WV-ZH"); }
    else if (e[0] === "LINE") { pair(10, f(e[2])); pair(20, f(e[3])); pair(30, "0.0"); pair(11, f(e[4])); pair(21, f(e[5])); pair(31, "0.0"); }
    else { pair(10, f(e[2])); pair(20, f(e[3])); pair(30, "0.0"); pair(40, f(e[4])); }
  });
  pair(0, "ENDSEC"); pair(0, "EOF");
  return { bytes: ascii(out.join(NL) + NL), count: ann.labels.length, layers: ls, version: "AC1009" };
}
var api = { labels: labels, write: write, writeStandalone: writeStandalone, LAYERS: LAYERS, enc: enc };
if (typeof module === "object" && module.exports) module.exports = api; else root.DXF_ANNOT = api;
})(typeof self !== "undefined" ? self : this);
