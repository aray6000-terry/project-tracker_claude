/* 弱電圖面 DXF 分析核心：讀出各樓層「監控設備數量表」，並以圖塊符號數量交叉驗證。
 * 純函式，瀏覽器（Web Worker）與 Node 測試共用。不會把圖面傳到任何地方。 */
(function (root) {
"use strict";

/* ---------- 解碼 ---------- */
function decode(buf) {
  var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  var head = new TextDecoder("latin1").decode(u8.subarray(0, 4000));
  var m = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*AC(\d{4})/.exec(head);
  var ver = m ? +m[1] : 1027;
  var enc = ver >= 1021 ? "utf-8" : "big5";   /* 2007 版以後為 UTF-8，之前依代碼頁（繁中為 Big5） */
  var txt;
  try { txt = new TextDecoder(enc).decode(u8); } catch (e) { txt = new TextDecoder("utf-8").decode(u8); }
  return { text: txt, version: "AC" + ver, encoding: enc };
}
function uni(s) { return s.indexOf("\\U+") < 0 ? s : s.replace(/\\U\+([0-9A-Fa-f]{4})/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); }); }
function cleanMtext(s) {
  return s.replace(/\\P/g, " ").replace(/\{\\[^;{}]*;/g, "").replace(/\\[A-Za-z][^;\\{}]*;/g, "").replace(/[{}]/g, "").replace(/%%[UuOo]/g, "").replace(/\s+/g, " ").trim();
}

/* ---------- 解析 ---------- */
function parse(text, onProgress) {
  var lines = text.split(/\r?\n/), n = lines.length;
  var sec = null, blk = null, cur = null, expectSec = false;
  var blocks = {}, inserts = [], texts = [], oles = [], segs = [], bases = {}, tableIns = [], poly = null;
  function flush() {
    if (!cur) return;
    var e = cur; cur = null;
    if (sec === "BLOCKS") {
      if (e.t === "BLOCK") { blk = e.v["2"] || ""; blocks[blk] = []; bases[blk] = [+e.v["10"] || 0, +e.v["20"] || 0]; return; }
      if (e.t === "ENDBLK") { blk = null; return; }
      if (blk !== null) blocks[blk].push(e);
      return;
    }
    if (sec !== "ENTITIES" || e.v["67"] === "1") return;     /* 只看模型空間 */
    if (e.t === "POLYLINE") { poly = { layer: e.v["8"] || "", closed: (+e.v["70"] || 0) & 1, pts: [] }; return; }
    if (e.t === "VERTEX") { if (poly) poly.pts.push([+e.v["10"] || 0, +e.v["20"] || 0]); return; }
    if (e.t === "SEQEND") { if (poly) pushPoly(segs, poly.layer, poly.pts, poly.closed); poly = null; return; }
    if (e.t === "INSERT") inserts.push({ name: e.v["2"] || "", layer: e.v["8"] || "", x: +e.v["10"] || 0, y: +e.v["20"] || 0,
      sx: e.v["41"] ? +e.v["41"] : 1, sy: e.v["42"] ? +e.v["42"] : (e.v["41"] ? +e.v["41"] : 1), rot: +(e.v["50"] || 0) });
    else if (e.t === "LINE") segs.push([e.v["8"] || "", +e.v["10"] || 0, +e.v["20"] || 0, +e.v["11"] || 0, +e.v["21"] || 0]);
    else if (e.t === "LWPOLYLINE" && e.pts.length > 1) {
      for (var k = 1; k < e.pts.length; k++) segs.push([e.v["8"] || "", e.pts[k - 1][0], e.pts[k - 1][1], e.pts[k][0], e.pts[k][1]]);
      if ((+e.v["70"] || 0) & 1) segs.push([e.v["8"] || "", e.pts[e.pts.length - 1][0], e.pts[e.pts.length - 1][1], e.pts[0][0], e.pts[0][1]]);
    }
    else if (e.t === "OLE2FRAME" && e.hex) oles.push({ x: +e.v["10"] || 0, y: +e.v["20"] || 0, type: e.v["3all"] || "", hex: e.hex });
    else if (e.t === "ACAD_TABLE") tableIns.push({ name: e.v["2"] || "", x: +e.v["10"] || 0, y: +e.v["20"] || 0, sx: 1, sy: 1, rot: 0 });
    else if (e.t === "TEXT" || e.t === "MTEXT" || e.t === "ATTRIB") {
      var s = e.t === "MTEXT" ? cleanMtext((e.v["3all"] || "") + (e.v["1"] || "")) : (e.v["1"] || "").trim();
      if (s) texts.push({ s: s, x: +e.v["10"] || 0, y: +e.v["20"] || 0, h: +(e.v["40"] || 0), attr: e.t === "ATTRIB" || undefined });
    }
    else if (e.t === "ATTDEF") {   /* 模型空間裡被炸開的圖框屬性：AutoCAD 顯示的是標籤（例：「地下五層」「強波器配置平面圖」） */
      var tg = (e.v["2"] || "").trim();
      if (tg && /[一-鿿]/.test(tg)) texts.push({ s: tg, x: +e.v["10"] || 0, y: +e.v["20"] || 0, h: +(e.v["40"] || 0), att: true });
    }
  }
  for (var i = 0; i + 1 < n; i += 2) {
    var code = lines[i].trim(), val = lines[i + 1];
    if (code === "0") {
      flush();
      if (val === "SECTION") { expectSec = true; continue; }
      if (val === "ENDSEC") { sec = null; continue; }
      cur = { t: val, v: {}, pts: [] };
      continue;
    }
    if (expectSec && code === "2") { sec = val.trim(); expectSec = false; continue; }
    if (!cur) continue;
    if (sec === "BLOCKS" && cur.t !== "BLOCK") {
      if (code === "10") cur.pts.push([+val, 0]);
      else if (code === "20" && cur.pts.length) cur.pts[cur.pts.length - 1][1] = +val;
      else if (code === "11") cur.p2 = [+val, cur.p2 ? cur.p2[1] : 0];
      else if (code === "21" && cur.p2) cur.p2[1] = +val;
      else if (code === "3") cur.v["3all"] = (cur.v["3all"] || "") + uni(val);
      else if (!(code in cur.v)) cur.v[code] = code === "1" || code === "2" ? uni(val) : val;
      continue;
    }
    if (cur.t === "LWPOLYLINE" && sec === "ENTITIES" && (code === "10" || code === "20")) {
      if (code === "10") cur.pts.push([+val, 0]); else if (cur.pts.length) cur.pts[cur.pts.length - 1][1] = +val;
      continue;
    }
    if (code === "310" && cur.t === "OLE2FRAME") (cur.hex = cur.hex || []).push(val.trim());
    else if (code === "3") cur.v["3all"] = (cur.v["3all"] || "") + uni(val);
    else if (!(code in cur.v)) cur.v[code] = code === "1" || code === "2" ? uni(val) : val;
    if (onProgress && (i & 0x3ffff) === 0) onProgress(i / n);
  }
  flush();
  explodeTexts(blocks, bases, inserts.concat(tableIns), texts);
  explodeSegs(blocks, bases, inserts, segs);
  return { blocks: blocks, inserts: inserts, texts: texts, oles: oles, segs: segs, bases: bases };
}

function pushPoly(out, layer, pts, closed) {
  for (var k = 1; k < pts.length; k++) out.push([layer, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]]);
  if (closed && pts.length > 2) out.push([layer, pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1]]);
}

/* ---------- 圖塊內的線條（建築平面的牆、柱多半畫在圖塊或外部參考綁定的圖塊裡） ---------- */
var SEG_CAP = 800000, BLOCK_SEG_CAP = 60000;
function explodeSegs(blocks, bases, ins, out) {
  var memo = {};
  /* 圖塊內的線段，以圖塊基準點為原點；圖層 "0" 的線段沿用插入時的圖層 */
  function local(name, depth) {
    if (name in memo) return memo[name];
    memo[name] = [];
    var b = bases[name] || [0, 0], list = [], poly = null;
    (blocks[name] || []).some(function (e) {
      var L = e.v["8"] || "0";
      if (e.t === "LINE" && e.pts[0] && e.p2) list.push([L, e.pts[0][0] - b[0], e.pts[0][1] - b[1], e.p2[0] - b[0], e.p2[1] - b[1]]);
      else if (e.t === "LWPOLYLINE" && e.pts.length > 1) pushPoly(list, L, e.pts.map(function (p) { return [p[0] - b[0], p[1] - b[1]]; }), (+e.v["70"] || 0) & 1);
      else if (e.t === "POLYLINE") poly = { layer: L, closed: (+e.v["70"] || 0) & 1, pts: [] };
      else if (e.t === "VERTEX") { if (poly && e.pts[0]) poly.pts.push([e.pts[0][0] - b[0], e.pts[0][1] - b[1]]); }
      else if (e.t === "SEQEND") { if (poly) pushPoly(list, poly.layer, poly.pts, poly.closed); poly = null; }
      else if (e.t === "INSERT" && depth < 4 && e.pts[0]) {
        var s2 = e.v["41"] ? +e.v["41"] : 1, s3 = e.v["42"] ? +e.v["42"] : s2;
        place(local(e.v["2"] || "", depth + 1), e.pts[0][0] - b[0], e.pts[0][1] - b[1], s2, s3, +(e.v["50"] || 0), L, list);
      }
      return list.length > BLOCK_SEG_CAP;
    });
    return (memo[name] = list);
  }
  function place(src, x, y, sx, sy, rot, layer, dst) {
    if (!src.length) return;
    var a = rot * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    for (var i = 0; i < src.length; i++) {
      var g = src[i], ax = g[1] * sx, ay = g[2] * sy, bx = g[3] * sx, by = g[4] * sy;
      dst.push([g[0] === "0" ? layer : g[0], x + ax * c - ay * sn, y + ax * sn + ay * c, x + bx * c - by * sn, y + bx * sn + by * c]);
    }
  }
  for (var i = 0; i < ins.length && out.length < SEG_CAP; i++) {
    var s = ins[i];
    if (blocks[s.name]) place(local(s.name, 0), s.x, s.y, s.sx, s.sy, s.rot, s.layer || "0", out);
  }
}

/* ---------- 圖塊內的文字（數量表做成圖塊或 AutoCAD 表格時，文字在圖塊裡） ---------- */
function explodeTexts(blocks, bases, ins, out) {
  var has = {};
  function hasQty(name, depth) {
    if (name in has) return has[name];
    has[name] = false;
    var r = (blocks[name] || []).some(function (e) {
      if (e.t === "TEXT" || e.t === "MTEXT") return /數\s*量/.test(e.t === "MTEXT" ? cleanMtext((e.v["3all"] || "") + (e.v["1"] || "")) : (e.v["1"] || ""));
      return e.t === "INSERT" && depth < 3 && hasQty(e.v["2"], depth + 1);
    });
    return (has[name] = r);
  }
  function walk(name, x, y, sx, sy, rot, depth) {
    var b = bases[name] || [0, 0], a = rot * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    (blocks[name] || []).forEach(function (e) {
      var p = e.pts[0]; if (!p) return;
      var lx = (p[0] - b[0]) * sx, ly = (p[1] - b[1]) * sy, wx = x + lx * c - ly * sn, wy = y + lx * sn + ly * c;
      if (e.t === "TEXT" || e.t === "MTEXT") {
        var s = e.t === "MTEXT" ? cleanMtext((e.v["3all"] || "") + (e.v["1"] || "")) : (e.v["1"] || "").trim();
        if (s) out.push({ s: s, x: wx, y: wy, h: +(e.v["40"] || 0) * Math.abs(sy) });
      } else if (e.t === "INSERT" && depth < 3) {
        var s2 = e.v["41"] ? +e.v["41"] : 1, s3 = e.v["42"] ? +e.v["42"] : s2;
        walk(e.v["2"], wx, wy, sx * s2, sy * s3, rot + (+(e.v["50"] || 0)), depth + 1);
      }
    });
  }
  ins.forEach(function (i) { if (blocks[i.name] && hasQty(i.name, 0)) walk(i.name, i.x, i.y, i.sx, i.sy, i.rot, 0); });
}

/* ---------- 圖塊外框與中心 ---------- */
function makeBBox(blocks) {
  var memo = {};
  function bb(name, depth) {
    if (name in memo) return memo[name];
    memo[name] = null;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    function add(x, y) { if (isFinite(x) && isFinite(y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    (blocks[name] || []).forEach(function (e) {
      if (e.t === "INSERT") {
        if (depth > 4) return;
        var b = bb(e.v["2"], depth + 1); if (!b || !e.pts[0]) return;
        var sx = e.v["41"] ? +e.v["41"] : 1, sy = e.v["42"] ? +e.v["42"] : sx;
        add(e.pts[0][0] + b[0] * sx, e.pts[0][1] + b[1] * sy); add(e.pts[0][0] + b[2] * sx, e.pts[0][1] + b[3] * sy);
        return;
      }
      if (e.t === "ATTDEF" || e.t === "ATTRIB") return;
      var r = (e.t === "CIRCLE" || e.t === "ARC") ? +(e.v["40"] || 0) : 0;
      e.pts.forEach(function (p) { add(p[0] - r, p[1] - r); add(p[0] + r, p[1] + r); });
      if (e.p2) add(e.p2[0], e.p2[1]);
    });
    memo[name] = isFinite(x0) ? [x0, y0, x1, y1] : null;
    return memo[name];
  }
  var center = function (ins) {
    var b = bb(ins.name, 0);
    if (!b) return [ins.x, ins.y];
    var cx = (b[0] + b[2]) / 2 * ins.sx, cy = (b[1] + b[3]) / 2 * ins.sy, a = ins.rot * Math.PI / 180;
    return [ins.x + cx * Math.cos(a) - cy * Math.sin(a), ins.y + cx * Math.sin(a) + cy * Math.cos(a)];
  };
  center.box = function (ins) { var b = bb(ins.name, 0); if (!b) return null; return [ins.x + b[0] * ins.sx, ins.y + b[1] * ins.sy, ins.x + b[2] * ins.sx, ins.y + b[3] * ins.sy]; };
  return center;
}

/* ---------- 樓層 ---------- */
var CN = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10 };
var CN_FORMAL = { "壹": "一", "貳": "二", "贰": "二", "參": "三", "叁": "三", "肆": "四", "伍": "五", "陸": "六", "柒": "七", "捌": "八", "玖": "九", "拾": "十", "兩": "二" };
/** 「地下壹層」「參層至拾壹層」「屋突貳層」「屋頂」→「B1F」「3F~11F」「R2F」「RF」；不是樓層字樣則原樣回傳 */
function cnFloor(s) {
  var t = String(s).replace(/[壹貳贰參叁肆伍陸柒捌玖拾兩]/g, function (c) { return CN_FORMAL[c]; }).replace(/\s/g, "");
  t = t.replace(/(中央)?(監控)?(系統)?(設備)?(平面圖|數量.*)$/, "");
  function one(x) {
    var m = /^(地下|屋突)?([一二三四五六七八九十\d]+)[層樓F]?$/.exec(x);
    if (m) { var n = cnNum(m[2]); if (!isFinite(n)) return null; return (m[1] === "地下" ? "B" : m[1] === "屋突" ? "R" : "") + n + "F"; }
    if (/^(屋頂|屋頂層|RF)$/.test(x)) return "RF";
    return null;
  }
  var parts = t.split(/至|~|～|〜|-/);
  if (parts.length === 2) { var a = one(parts[0]), b = one(parts[1].replace(/^(地下|屋突)?/, function (p) { return p || (/^地下/.test(parts[0]) ? "地下" : /^屋突/.test(parts[0]) ? "屋突" : ""); })); if (a && b) return a + "~" + b; }
  return one(t) || s;
}
function cnNum(s) {
  if (/^\d+$/.test(s)) return +s;
  if (s === "十") return 10;
  var m = /^([一二三四五六七八九])?十([一二三四五六七八九])?$/.exec(s);
  if (m) return (m[1] ? CN[m[1]] : 1) * 10 + (m[2] ? CN[m[2]] : 0);
  return CN[s] || NaN;
}
/** 「3F~5F」「B1F」「R2F」「6F～13F」→ 樓層清單 */
function floorsOf(key) {
  if (/[、,，\/]|及/.test(String(key))) { var lst = floorList(key); return lst || [key]; }   /* 「4、6F」「8、10、12F」「四層,六層」 */
  var k = cnFloor(key).replace(/\s/g, "").toUpperCase().replace(/[～〜至]/g, "~");
  if (k === "RF") return ["RF"];
  var m = /^(B|R|RF)?(\d+)F?(?:~(B|R|RF)?(\d+)F?)?$/.exec(k);
  if (!m) return [key];
  var p = m[1] === "RF" ? "R" : (m[1] || ""), a = +m[2], b = m[4] ? +m[4] : a, out = [];
  if (b < a) { var t = a; a = b; b = t; }
  for (var i = a; i <= b && out.length < 200; i++) out.push(p + i + "F");
  return out;
}
var FLOOR_RE = /^(B|R)?\d+F$|^RF$/;
/** 「4F,6~9F,11~13F」「四層、六至九層」「屋突三層至屋頂層」→ 樓層清單；有任何一段不是樓層就回傳 null */
function floorList(s) {
  var out = [], parts = String(s).replace(/\s/g, "").split(/[、,，\/]|及/);
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].replace(/^-|-$/g, ""); if (!p) continue;
    if (/^(B|R)?\d+$/i.test(p)) p += "F";   /* 「4、6F」的「4」沿用後面的 F */
    var toRoof = /^(.+?)(?:至|~|～)(?:屋頂層?|RF)$/i.exec(p);   /* 「屋突三層至屋頂層」 */
    if (toRoof) { var a0 = FLOOR_RE.test(toRoof[1].toUpperCase()) ? toRoof[1].toUpperCase() : cnFloor(toRoof[1]); if (!FLOOR_RE.test(a0)) return null; out.push(a0, "RF"); continue; }
    var c = FLOOR_RE.test(p.toUpperCase()) ? p.toUpperCase() : cnFloor(p);
    if (FLOOR_RE.test(c)) { out.push(c); continue; }
    var m = /^((?:B|R)?\d+F)~((?:B|R)?\d+F|RF)$/.exec(String(c).toUpperCase());
    if (!m) return null;
    if (m[2] === "RF") { out.push(m[1], "RF"); continue; }
    var f = floorsOf(m[1] + "~" + m[2]); if (!f.every(function (x) { return FLOOR_RE.test(x); })) return null;
    out = out.concat(f);
  }
  return out.length ? out : null;
}
/** 「A棟-3F」「B2F」「A棟四層、六至九層設備平面圖」→ { bld:"A", floors:[…] } */
function bldFloors(s) {
  var t = String(s).replace(/\s/g, "").replace(/(中央)?(監控)?(系統)?(設備)?(配置)?平面圖$/, "");
  var m = /^([A-Za-z])棟-?(.*)$/.exec(t), bld = m ? m[1].toUpperCase() : "";
  var fl = floorList(m ? m[2] : t);
  return fl ? { bld: bld, floors: fl } : null;
}
function floorRank(f) {
  var m = /^(B|R)?(\d+)F$/.exec(f); if (!m) return 5000;
  return m[1] === "B" ? 1000 - +m[2] : m[1] === "R" ? 3000 + +m[2] : 2000 + +m[2];
}

/* ---------- 系統分類（可由呼叫端覆寫） ---------- */
var SYS_RULES = [
  ["other", /接地|避雷/],   /* 「接地測試箱，內附接地監視器」不是監視系統 */
  ["parking", /線圈|車道|柵欄|紅綠燈|警示燈|閃光燈|車牌|E-?TAG|出車|字幕機|車輛偵測/i],
  ["cctv", /攝影機|CCTV|錄影|監視/i],
  ["intercom", /對講|門口機|門口子機|管理總機|智慧家庭|門鈴/],
  ["access", /讀卡機|讀碼機|陽極|電鎖|門鎖|開門按鈕|開門按扭|門禁|Smart ?Key|感應卡/i],
  ["energy.meter", /電錶|電表/], ["energy.water", /水錶|水表/], ["energy.solar", /太陽能/],
  ["air", /溫濕度|空氣品質|CO2|PM2\.5/i],
  ["media", /佈告欄|布告欄|遊戲機|學習平台|生活服務平台|多媒體|血壓計/],
  ["bms", /磁簧|押扣|壓扣|求救|偵測|感知器|感測器|液位|油位|水箱|開關|端末器|叫車面板|配電箱|監控|一氧化碳|瓦斯/],
];
function sysOf(name, rules) {
  rules = rules || SYS_RULES;
  for (var i = 0; i < rules.length; i++) if (rules[i][1].test(name)) return rules[i][0];
  return "other";
}

/* ---------- 主分析 ---------- */
function analyze(text, opt) {
  opt = opt || {};
  var d = parse(text, opt.onProgress);
  var warnings = [];
  /* 圖面內嵌的 Excel 表（例如「I/O 管理點數表」） */
  var embedded = [], pendingXlsx = [];
  if (opt.xls) d.oles.forEach(function (o) {
    if (!/Excel/i.test(o.type)) return;
    try {
      var hx = o.hex.join(""), u = new Uint8Array(hx.length / 2);
      for (var i = 0; i < u.length; i++) u[i] = parseInt(hx.substr(i * 2, 2), 16);
      var sh = opt.xls.read(u);
      embedded.push({ x: o.x, y: o.y, sheets: sh.filter(function (x) { return x.rows.length; }) });
    } catch (e) {
      if (e.pkg) pendingXlsx.push({ x: o.x, y: o.y, pkg: e.pkg });   /* .xlsx 需非同步解壓，交給呼叫端 */
      else warnings.push("圖面內嵌的 Excel 表無法讀取：" + e.message);
    }
  });
  var center = makeBBox(d.blocks);
  var T = d.texts;

  /* 1. 數量表 */
  var MULQ = /^(\d+)\s*[xX×*＊]\s*(\d+)\s*[=＝]\s*(\d+)$/;
  var tables = [], usedD = [], noTableSym = {}, noTableTitles = [];
  function isFloorKey(s) { var f = floorsOf(String(s)); return f.length > 0 && f.every(function (x) { return /^(B|R)?\d+F$|^RF$/.test(x); }); }
  /* 方式一：有「XF 監控設備數量表」標題 */
  T.forEach(function (h) {
    var mm = /^(.*?)\s*(?:中央)?(?:監控)?(?:系統)?(?:設備)?(?:器材)?\s*數\s*量\s*(?:統計|一覽|明細)?\s*表?$/.exec(h.s);
    if (!mm || !/表|統計/.test(h.s) || h.s.length > 30) return;
    var hh = h.h || 50, near = T.filter(function (t) { return t !== h && t.x > h.x - hh * 3 && t.x < h.x + hh * 40 && t.y < h.y && t.y > h.y - hh * 4; });
    var qh = near.filter(function (t) { return /數\s*量|合\s*計|小\s*計|總\s*計/.test(t.s) && t.s.length < 8 && !/表|統計/.test(t.s); })[0];
    var dh = near.filter(function (t) { return /說\s*明|名\s*稱|品\s*名|項\s*目|設\s*備|器\s*材|規\s*格/.test(t.s) && t.s.length < 10; })[0];
    if (!qh || !dh) { warnings.push("找到「" + h.s + "」但讀不到欄位標題（需有「說明」與「數量」欄）"); return; }
    usedD.push(dh);
    buildTable(h, dh, qh, mm[1]);
  });
  /* 方式三：圖例表上方標「A棟-3F」「B2F」，數量欄分棟（A棟｜B棟｜C棟）或分戶型（公共｜一房型(×5)…），
     各欄數字是該欄所列樓層的合計：樓層數量＝各欄加總 ÷ 層數（太武安居社宅格式） */
  T.forEach(function (g) {
    if (!/^圖\s*例$/.test(g.s)) return;
    var hh = g.h || 50;
    var lab = null;
    T.forEach(function (t) {
      if (lab || t.y - g.y < hh * 1.2 || t.y - g.y > hh * 4 || t.x - g.x < -hh * 4 || t.x - g.x > hh * 2 || t.s.length > 30) return;
      var bf = bldFloors(t.s); if (bf) lab = { t: t, bf: bf };
    });
    if (!lab) return;
    var dh = T.filter(function (t) { return /^(說\s*明|名\s*稱|品\s*名|設備名稱)$/.test(t.s) && usedD.indexOf(t) < 0 && Math.abs(t.y - g.y) < hh * 0.6 && t.x > g.x && t.x < g.x + hh * 20; })[0];
    if (!dh) return;
    var stop = Infinity;
    var hdr = T.filter(function (t) { return t !== dh && t.x > dh.x + hh && t.x < dh.x + hh * 50 && t.y - dh.y > -hh * 1.2 && t.y - dh.y < hh * 1.6 && !/^[-－—\d\s.]+$/.test(t.s); });
    hdr.forEach(function (t) { if (/^(代\s*號|管\s*徑)$/.test(t.s)) stop = Math.min(stop, t.x); });
    hdr = hdr.filter(function (t) { return t.x < stop - hh; });
    var cols = hdr.filter(function (t) { return t.y - dh.y > -hh * 0.6 && t.s.length < 16; }).sort(function (a, b) { return a.x - b.x; });
    if (!cols.length || cols.some(function (c) { return isFloorKey(c.s); })) return;   /* 數量欄直接寫樓層（廣昱平鎮格式）交給方式二 */
    var low = hdr.reduce(function (m, t) { return Math.min(m, t.y); }, Math.min(dh.y, cols[0].y));   /* 表頭可能有兩行（棟別＋箱體代號） */
    usedD.push(dh);
    buildTable(g, dh, cols[0], lab.t.s.replace(/\s/g, ""), true, { cols: cols, top: low, bld: lab.bf.bld, floors: lab.bf.floors });
  });
  /* 方式二：沒有標題的圖例表「圖例｜說明｜B1F」（數量欄直接寫樓層）或「圖例｜說明｜數量」 */
  T.forEach(function (dh) {
    if (!/^(說\s*明|名\s*稱|品\s*名|設備名稱)$/.test(dh.s) || usedD.indexOf(dh) >= 0) return;
    var hh = dh.h || 50;
    var row = T.filter(function (t) { return t !== dh && Math.abs(t.y - dh.y) < hh * 0.6 && t.x > dh.x && t.x < dh.x + hh * 40; }).sort(function (a, b) { return a.x - b.x; });
    var qh = row.filter(function (t) { return t.s.length < 12 && (/^數\s*量$/.test(t.s) || isFloorKey(t.s)); })[0];
    if (!qh) return;
    var lg = T.filter(function (t) { return /^圖\s*例$/.test(t.s) && Math.abs(t.y - dh.y) < hh * 0.6 && t.x < dh.x && t.x > dh.x - hh * 20; })[0];
    usedD.push(dh);
    buildTable(lg || dh, dh, qh, isFloorKey(qh.s) ? qh.s : "", true);
  });
  /* 方式四：設備在欄、樓層／盤體在列的「轉置」數量表（Philips 燈控格式）：
     表頭左上「區域」，往右每欄一種設備（欄上方有廠商、型號、名稱），每列一個盤（樓層＋盤名），最後一列「合計」 */
  var anchors = T.filter(function (t) { return /^區\s*域$/.test(t.s); }).sort(function (a, b) { return b.y - a.y; });
  anchors.forEach(function (a, ai) {
    var hh = a.h || 50;
    var below = anchors.filter(function (o) { return o !== a && o.y < a.y && Math.abs(o.x - a.x) < hh * 20; })[0];
    var yStop = below ? below.y + hh * 3 : a.y - hh * 200;
    var box = T.filter(function (t) { return t.x > a.x - hh * 3 && t.x < a.x + hh * 80 && t.y < a.y + hh * 4 && t.y > yStop; });
    var labelX = box.filter(function (t) { return t.y < a.y - hh * 0.3 && /[A-Za-z一-鿿]/.test(t.s) && t.x < a.x + hh * 8; });
    var seenN = {};
    var nums = box.filter(function (t) {
      if (!/^\d+$/.test(t.s.trim()) || t.y >= a.y + hh * 0.5) return false;
      var k = t.s.trim() + "@" + Math.round(t.x) + "," + Math.round(t.y); if (seenN[k]) return false; seenN[k] = 1; return true;   /* 圖上重疊的重複文字只算一次 */
    });
    if (nums.length < 2) return;
    /* 依 y 分列 */
    nums.sort(function (p, q) { return q.y - p.y || p.x - q.x; });
    var rws = [];
    nums.forEach(function (t) { var r = rws[rws.length - 1]; if (r && Math.abs(r.y - t.y) < hh * 0.5) r.cells.push(t); else rws.push({ y: t.y, cells: [t] }); });
    /* 每列的列名（左側文字）；列名是「合計」者為合計列 */
    rws.forEach(function (r) {
      var minX = Math.min.apply(null, r.cells.map(function (c) { return c.x; }));
      r.minX = minX;
      r.labels = labelX.filter(function (t) { return Math.abs(t.y - r.y) < hh * 0.6 && t.x < minX - hh * 0.5; }).sort(function (p, q) { return p.x - q.x; });
      r.total = r.labels.some(function (t) { return /^合\s*計$|^總\s*計$/.test(t.s); });
    });
    rws = rws.filter(function (r) { return r.labels.length; });
    if (!rws.length) return;
    var firstColX = Math.min.apply(null, rws.map(function (r) { return r.minX; }));
    /* 連續的資料列（列距穩定），遇到合計列為止 */
    var data = [], tot = null, gap = 0;
    for (var i = 0; i < rws.length; i++) {
      var r = rws[i], prevY = data.length ? data[data.length - 1].y : a.y;
      if (!data.length && prevY - r.y > hh * 12) break;
      if (data.length >= 2 && gap && prevY - r.y > gap * 3.5) break;
      if (r.total) { tot = r; break; }
      if (data.length === 1) gap = prevY - r.y;
      data.push(r);
    }
    if (!data.length) return;
    var topData = data[0].y;
    /* 欄：數字的 x 分群 */
    var colsX = [];
    data.concat(tot ? [tot] : []).forEach(function (r) { r.cells.forEach(function (c) { if (!colsX.some(function (x) { return Math.abs(x - c.x) < hh * 2; })) colsX.push(c.x); }); });
    colsX.sort(function (p, q) { return p - q; });
    var hdrT = box.filter(function (t) { return t.y > topData + hh * 0.5 && t.y < a.y + hh * 4 && t.x > firstColX - hh * 4; });
    var cols = colsX.map(function (x) {
      var near = hdrT.filter(function (t) {
        var nx = colsX.reduce(function (m, c) { return Math.abs(c - t.x) < Math.abs(m - t.x) ? c : m; }, colsX[0]);
        return nx === x && Math.abs(t.x - x) < hh * 6;
      });
      var cn = near.filter(function (t) { return /[一-鿿]/.test(t.s) && !/^(廠\s*商|型\s*號|區\s*域|備\s*註|數\s*量|品\s*牌)$/.test(t.s); }).sort(function (p, q) { return p.y - q.y; });
      var model = near.filter(function (t) { return !/[一-鿿]/.test(t.s) && !/^(Philips|PHILIPS|Lutron|Panasonic)$/i.test(t.s.trim()); })[0];
      return { x: x, name: cn.length ? cn[0].s.replace(/\s+/g, " ").replace(/^(\S+) (\S+)$/, function (m, p, q) { return /[一-鿿]$/.test(p) && /^[一-鿿]/.test(q) ? p + q : m; }).trim() : "", model: model ? model.s.trim() : "" };
    });
    cols = cols.filter(function (c) { return c.name; });
    if (!cols.length) return;
    function colOf(t) { var b = null, bd = hh * 2; cols.forEach(function (c) { var dd = Math.abs(c.x - t.x); if (dd < bd) { bd = dd; b = c; } }); return b; }
    /* 列 → 樓層：左側文字中最接近的樓層字（合併儲存格的樓層字會在兩列之間） */
    var flLabels = labelX.filter(function (t) { return t.x < firstColX - hh * 0.5 && isFloorKey(cnFloor(t.s.replace(/\s/g, ""))); });
    var lim = (gap || hh * 2) * 0.8;
    var ctx = T.filter(function (t) { return Math.abs(t.x - a.x) < hh * 400 && Math.abs(t.y - a.y) < hh * 400 && /燈控|照明|電驛|調光|Dynalite|DyNet/i.test(t.s); }).length;
    var sysK = ctx ? "lighting" : null;
    var byFloor = {}, order = [];
    data.forEach(function (r) {
      var fb = null, fd = Infinity;
      flLabels.forEach(function (t) { var dd = Math.abs(t.y - r.y); if (dd <= lim && dd < fd) { fd = dd; fb = t; } });
      var fk = fb ? cnFloor(fb.s.replace(/\s/g, "")) : "";
      var key = fk || "未分層";
      if (!byFloor[key]) { byFloor[key] = { key: key, floors: fk ? floorsOf(fk) : [], q: {}, panels: [] }; order.push(key); }
      var g = byFloor[key];
      g.panels.push(r.labels.map(function (t) { return t.s.replace(/\s/g, ""); }).filter(function (s) { return s !== fk; }).join("/"));
      r.cells.forEach(function (c) { var col = colOf(c); if (col) g.q[col.name] = (g.q[col.name] || 0) + (+c.s); });
    });
    order.forEach(function (k) {
      var g = byFloor[k];
      var tb = { key: g.key === "未分層" ? "未分層（" + g.panels.join("、") + "）" : g.key, floors: g.floors.length ? g.floors : [g.key === "未分層" ? "未分層" : g.key], needFloor: false, x: a.x, y: a.y, box: [a.x - hh * 3, (tot || data[data.length - 1]).y - hh, colsX[colsX.length - 1] + hh * 4, a.y + hh * 4], rows: [], transposed: true };
      cols.forEach(function (c) { if (g.q[c.name]) tb.rows.push({ name: c.name, qty: g.q[c.name], raw: String(g.q[c.name]), y: a.y, block: null, dev: true, sys: sysK, model: c.model }); });
      if (tb.rows.length) tables.push(tb);
    });
    if (tot) cols.forEach(function (c) {
      var tc = tot.cells.filter(function (t) { return colOf(t) === c; })[0], sum = 0;
      order.forEach(function (k) { sum += byFloor[k].q[c.name] || 0; });
      if (tc && +tc.s !== sum) warnings.push("數量表的「" + c.name + "」各列加總 " + sum + "，與表上合計 " + tc.s + " 不同，請確認");
    });
  });
  function buildTable(h, dh, qh, keyRaw, legend, multi) {
    var hh = h.h || 50;
    var top = multi ? multi.top : Math.min(qh.y, dh.y);
    var col = T.filter(function (t) { return t.x > h.x + (dh.x - h.x) * (legend ? 0.25 : 0.5) && t.x < qh.x - hh && t.y < top - hh * 0.3 && t.y > top - hh * 120 && (!legend || !t.h || t.h >= dh.h * 0.75) && !/^[-－—\d\s.]+$/.test(t.s) && !MULQ.test(t.s); })   /* 數量欄比樓層標題靠左時，數字不能算進品名 */
      .sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var rows = [], last = top, gap = 0;
    for (var i = 0; i < col.length; i++) {
      var dy = last - col[i].y;
      if (rows.length && Math.abs(col[i].y - rows[rows.length - 1].y) < hh * 0.5) {   /* 同列被拆成多段文字 → 依 x 接起來 */
        var rr = rows[rows.length - 1]; rr.parts.push(col[i]); continue;
      }
      if (rows.length >= 2 && gap && dy > gap * 2.6) break;
      if (rows.length < 2 && dy > hh * 6) break;
      if (rows.length === 1) gap = dy;
      rows.push({ s: col[i].s, x: col[i].x, y: col[i].y, parts: [col[i]] }); last = col[i].y;
    }
    rows.forEach(function (r) { r.s = r.parts.sort(function (a, b) { return a.x - b.x; }).map(function (p) { return p.s; }).join("").replace(/\s+/g, " ").trim(); });
    if (!rows.length) return;
    var ylow = rows[rows.length - 1].y;
    if (multi) return buildMulti(h, qh, keyRaw, multi, rows, top, ylow, hh);
    var nums = T.filter(function (t) { return Math.abs(t.x - qh.x) < hh * 4 && t.y < top - hh * 0.3 && t.y > ylow - hh * 1.5 && (/^[-－—\d\s.]+$/.test(t.s) || MULQ.test(t.s)); });
    var box = [h.x - hh * 4, ylow - hh * 1.6, qh.x + hh * 6, h.y + hh * 1.2];
    var key = String(keyRaw || "").trim(), fl = key ? floorsOf(key) : [];
    var okFloor = fl.length && fl.every(function (f) { return /^(B|R)?\d+F$|^RF$/.test(f); });
    var tb = { key: okFloor ? cnFloor(key) : "表" + (tables.length + 1), floors: okFloor ? fl : [], needFloor: !okFloor, x: h.x, y: h.y, box: box, rows: [] };
    rows.forEach(function (r) {
      var best = null, bd = Infinity;
      nums.forEach(function (t) { var dd = Math.abs(t.y - r.y); if (dd < bd) { bd = dd; best = t; } });
      var q = best && bd < hh * 0.9 ? best.s.trim() : "";
      var mq = MULQ.exec(q), qty = /^\d+$/.test(q) ? +q : 0;
      if (mq) qty = tb.floors.length && +mq[3] % tb.floors.length === 0 ? +mq[3] / tb.floors.length : +mq[1];   /* 「8x9=72」：表是多層合計，換成每層 */
      tb.rows.push({ name: r.s, qty: qty, raw: q, y: r.y, block: null });
    });
    tables.push(tb);
  }
  function buildMulti(h, qh, key, mt, rows, top, ylow, hh) {
    var cols = mt.cols, n = mt.floors.length, lastX = cols[cols.length - 1].x;
    var box = [h.x - hh * 4, ylow - hh * 1.6, lastX + hh * 6, h.y + hh * 1.2];
    var cells = cols.map(function () { return []; });
    T.forEach(function (t) {
      if (t.y >= top - hh * 0.3 || t.y < ylow - hh * 1.5 || t.x < qh.x - hh * 3 || t.x > lastX + hh * 5 || !/^[-－—\d\s.]+$/.test(t.s)) return;
      var bi = -1, bd = hh * 4;
      cols.forEach(function (c, i) { var dd = Math.abs(t.x - c.x); if (dd < bd) { bd = dd; bi = i; } });
      if (bi >= 0) cells[bi].push(t);
    });
    var tb = { key: key, floors: mt.floors, bld: mt.bld, needFloor: false, x: h.x, y: h.y, box: box, rows: [], cols: cols.map(function (c) { return c.s; }) };
    rows.forEach(function (r) {
      var vals = cells.map(function (cs) {
        var best = null, bd = Infinity;
        cs.forEach(function (t) { var dd = Math.abs(t.y - r.y); if (dd < bd) { bd = dd; best = t; } });
        return best && bd < hh * 0.9 ? best.s.trim() : "";
      });
      var sum = 0, any = false;
      vals.forEach(function (v) { if (/^\d+$/.test(v)) { sum += +v; any = true; } else if (v) any = true; });
      var qty = sum / n;
      if (sum % n) { qty = Math.round(qty * 100) / 100; warnings.push("數量表「" + key + "」的「" + r.s + "」合計 " + sum + " 無法平均分到 " + n + " 層，每層以 " + qty + " 計，請確認"); }
      tb.rows.push({ name: r.s, qty: qty, raw: any ? vals.map(function (v) { return v || "-"; }).join("+") + (n > 1 ? "（" + n + "層合計）" : "") : "", y: r.y, block: null });
    });
    tables.push(tb);
  }

  /* 2. 把表內符號對應到列（得到 圖塊 → 設備名稱） */
  var inTable = [];
  var blockNames = {};
  d.inserts.forEach(function (s) {
    var c = center(s); s.cx = c[0]; s.cy = c[1];
    for (var i = 0; i < tables.length; i++) {
      var b = tables[i].box;
      if (s.cx >= b[0] && s.cx <= b[2] && s.cy >= b[1] && s.cy <= b[3]) { s.table = tables[i]; inTable.push(s); return; }
    }
  });
  inTable.forEach(function (s) {
    var tb = s.table, best = null, bd = Infinity;
    tb.rows.forEach(function (r) { var dd = Math.abs(s.cy - r.y); if (dd < bd) { bd = dd; best = r; } });
    if (best && !best.block && s.cx < best.name && true) { /* noop */ }
    if (best && !best.block) { best.block = s.name; (blockNames[s.name] = blockNames[s.name] || {})[best.name] = 1; }
  });

  /* 3. 平面圖標題 → 數量表 */
  T.forEach(function (t) {   /* 「A棟三層設備平面圖 A1=S:1/100 A3=S:1/200」→ 去掉比例 */
    var m = /^(.*平面圖)\s*(?:A\d\s*[=＝]|S\s*[:：=＝]\s*1\s*\/|1\s*[:：\/]\s*\d).*$/.exec(t.s);
    if (m) { t.s = m[1].trim(); t.scaled = true; }
  });
  var cands = T.filter(function (t) { return /平面圖$/.test(t.s) && !/配置圖/.test(t.s); });
  var hmax = cands.reduce(function (m, t) { return Math.max(m, t.h); }, 0);
  var titles = cands.filter(function (t) { return t.h >= hmax * 0.6 || t.scaled; });
  var all0 = titles; titles = titles.filter(function (t) {            /* 先去掉圖說「圖紙目錄」裡一行一行列出的圖名 */
    return all0.filter(function (o) { return o !== t && Math.abs(o.x - t.x) < t.h && Math.abs(o.y - t.y) < t.h * 4; }).length < 2;
  });
  titles = titles.filter(function (t) {            /* 去掉「屋突二層至屋頂層」這類群組總標題 */
    var above = titles.filter(function (o) { return o !== t && Math.abs(o.x - t.x) < t.h * 20 && o.y > t.y && o.y - t.y < t.h * 60; });
    return above.length < 2;
  });
  /* 圖框（大型圖塊）：同一張圖紙內的符號才歸給該圖紙上的平面圖 */
  var frames = [];
  d.inserts.forEach(function (s) {
    if (s.rot) return;
    var b = center.box(s); if (!b) return;
    var w = b[2] - b[0], h = b[3] - b[1];
    if (w > 0 && h > 0 && w / h > 1.2 && w / h < 1.6 && titles.some(function (t) { return t.x > b[0] && t.x < b[2] && t.y > b[1] && t.y < b[3] && w > t.h * 40; })) frames.push(b);
  });
  function frameOf(x, y) { for (var i = 0; i < frames.length; i++) { var b = frames[i]; if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) return i; } return -1; }
  titles.forEach(function (t) { t.frame = frameOf(t.x, t.y); });
  tables.forEach(function (tb) { tb.frame = frameOf(tb.x, tb.y); });
  titles.forEach(function (t) {
    var bf = bldFloors(t.s);   /* 先找同棟、樓層有重疊的表（「A棟三層…平面圖」↔「A棟-3F」） */
    if (bf) {
      var hit = null, hd = Infinity;
      tables.forEach(function (tb) {
        if ((tb.bld || "") !== bf.bld || !tb.floors.some(function (f) { return bf.floors.indexOf(f) >= 0; })) return;
        var dd = Math.hypot(tb.x - t.x, tb.y - t.y); if (dd < hd) { hd = dd; hit = tb; }
      });
      if (hit) { t.table = hit; return; }
    }
  });
  titles.forEach(function (t) {
    if (t.table) return;
    var best = null, bd = Infinity, tf = cnFloor(t.s), sameFloor = isFloorKey(tf) ? floorsOf(tf).join() : "";
    /* 先找同樓層的表（標題寫「地下壹層…」、表頭寫「B1F」），找不到才用最近的表 */
    if (sameFloor) tables.forEach(function (tb) { if (tb.floors.join() !== sameFloor) return; var dd = Math.hypot(tb.x - t.x, tb.y - t.y); if (dd < bd) { bd = dd; best = tb; } });
    if (best && bd < t.h * 400) { t.table = best; return; }
    best = null; bd = Infinity;
    tables.forEach(function (tb) { var dd = Math.hypot(tb.x - t.x, tb.y - t.y); if (dd < bd) { bd = dd; best = tb; } });
    var sameSheet = best && t.frame >= 0 && best.frame === t.frame;   /* 同一張圖紙上的表（例如「屋突參層至屋頂」共用一張表） */
    t.table = best && bd < t.h * 100 && (!sameFloor || best.needFloor || sameSheet) ? best : null;
    if (!t.table) { noTableTitles.push(t); return; }
    if (t.table.needFloor) {   /* 表名沒寫樓層 → 用旁邊平面圖的樓層 */
      var fk = cnFloor(t.s), ff = floorsOf(fk);
      if (ff.every(function (f) { return /^(B|R)?\d+F$|^RF$/.test(f); })) { t.table.key = fk; t.table.floors = ff; t.table.needFloor = false; }
    }
  });


  /* 4. 平面圖上的符號歸屬 */
  var sym = {};   /* tableKey -> block -> count */
  var notes = T.filter(function (t) { return t.s.length >= 8 && (/^\s*(\d+\s*[.、．]|註|※)/.test(t.s) || /\u3000\u3000|\s{3,}/.test(t.s)); });
  function inNote(s) {
    for (var i = 0; i < notes.length; i++) { var t = notes[i], h2 = t.h || 30;
      if (s.cx >= t.x - h2 && s.cx <= t.x + t.s.length * h2 && Math.abs(s.cy - t.y - h2 / 2) < h2 * 1.5) return true; }
    return false;
  }
  d.inserts.forEach(function (s) {
    if (s.table || !blockNames[s.name] || inNote(s)) return;
    var best = null, bs = Infinity;
    var fr = frames.length ? frameOf(s.cx, s.cy) : -1;
    var own = fr >= 0 ? titles.filter(function (t) { return t.frame === fr && bldFloors(t.s); }) : [];
    if (own.length === 1) best = own[0];   /* 一張圖紙只有一個平面圖：圖紙內的符號都歸它（平面圖可能比標題寬很多） */
    else titles.forEach(function (t) {
      if (fr >= 0 && t.frame >= 0 && t.frame !== fr) return;
      var dx = Math.abs(s.cx - t.x), dy = s.cy - t.y;
      if (dy < -t.h * 2 || dy > t.h * 60 || dx > t.h * 30) return;
      var sc = dx + 0.5 * Math.max(dy, 0);
      if (sc < bs) { bs = sc; best = t; }
    });
    if (!best) return;
    if (!best.table) {   /* 這層沒有數量表：用其他層表上學到的「符號→設備」直接數圖上符號 */
      var nf = cnFloor(best.s);
      if (isFloorKey(nf)) { var bucket = noTableSym[nf] = noTableSym[nf] || {}; bucket[s.name] = (bucket[s.name] || 0) + 1; (best.devs = best.devs || []).push(s); }
      return;
    }
    (best.devs = best.devs || []).push(s);
    var k = best.table.key; sym[k] = sym[k] || {}; sym[k][s.name] = (sym[k][s.name] || 0) + 1;
  });

  /* 5. 彙整 */
  var floors = {}, items = {}, checks = [], knownName = {}, noCheck = [];
  tables.forEach(function (tb) { tb.rows.forEach(function (r) { if (r.block) knownName[r.name] = 1; }); });
  tables.forEach(function (tb) {
    var byBlock = {};
    tb.rows.forEach(function (r) {
      if (!r.block && !r.dev && (!r.raw || (!knownName[r.name] && sysOf(r.name, opt.rules) === "other"))) return;   /* 不像設備列（圖面註記、地名等） */
      var it = items[r.name] = items[r.name] || { name: r.name, sys: r.sys || sysOf(r.name, opt.rules), block: r.block, total: 0, floors: {} };
      if (r.model && !it.model) it.model = r.model;
      tb.floors.forEach(function (f) { it.floors[f] = (it.floors[f] || 0) + r.qty; it.total += r.qty; floors[f] = 1; });
      if (r.block) byBlock[r.block] = (byBlock[r.block] || 0) + r.qty;
    });
    var got = sym[tb.key] || {}, want = 0, seen = 0;
    Object.keys(byBlock).forEach(function (b) { want += byBlock[b]; seen += Math.min(got[b] || 0, byBlock[b]); });
    if (want && seen < want * 0.2) { noCheck.push(tb.key); return; }   /* 圖上幾乎抓不到符號：多半畫在戶型圖塊裡，不逐項報不一致 */
    Object.keys(byBlock).forEach(function (b) {
      var n = got[b] || 0;
      if (n !== byBlock[b]) checks.push({ table: tb.key, block: b, names: Object.keys(blockNames[b] || {}), table_qty: byBlock[b], symbols: n });
    });
  });
  /* 沒有數量表的樓層：以符號數量列入，並提示 */
  var countedFloors = {};
  Object.keys(noTableSym).forEach(function (fk) {
    var fls = floorsOf(fk), parts = [];
    Object.keys(noTableSym[fk]).forEach(function (b) {
      var nm = Object.keys(blockNames[b] || {}); if (nm.length !== 1) return;   /* 同一符號對應多種設備時不猜 */
      var n = noTableSym[fk][b], name = nm[0];
      var it = items[name] = items[name] || { name: name, sys: sysOf(name, opt.rules), block: b, total: 0, floors: {} };
      fls.forEach(function (f) { it.floors[f] = (it.floors[f] || 0) + n; it.total += n; floors[f] = 1; });
      parts.push(name + " " + n);
    });
    countedFloors[fk] = parts;
  });
  var anyFloorTitle = titles.some(function (t) { return bldFloors(t.s); });
  noTableTitles.forEach(function (t) {
    if (anyFloorTitle && !bldFloors(t.s)) return;   /* 圖框標題欄的系統名稱（例如「行動通訊改善系統配置平面圖」）不是某一層的平面圖 */
    var fk = cnFloor(t.s);
    if (countedFloors[fk] && countedFloors[fk].length) {
      if (countedFloors[fk].shown) return; countedFloors[fk].shown = 1;
      warnings.push(fk + "（" + t.s + "）沒有數量表，已改用圖上符號計數：" + countedFloors[fk].join("、") + "。請確認數量是否正確");
    } else if (!countedFloors[fk] || !countedFloors[fk].shown) {
      if (countedFloors[fk]) countedFloors[fk].shown = 1;
      warnings.push("平面圖「" + t.s + "」附近找不到數量表，圖上也沒有可辨識的設備符號");
    }
  });
  if (tables.some(function (tb) { return tb.transposed; })) warnings = warnings.filter(function (w) { return !/讀不到欄位標題/.test(w); });
  var legendInfo = null;
  /* 沒有數量表，或讀到的「表」都不是設備（綜合水電圖裡給排水的管件小表）：依圖例數符號 */
  if ((!tables.length || !Object.keys(items).length) && !opt.noLegend) {
    var sheetFrames = [];   /* 圖框圖塊：給圖例計數劃分圖紙範圍 */
    var planTxt = T.filter(function (t) { return /平面圖$/.test(t.s) && t.s.length <= 30; });
    d.inserts.forEach(function (s) {
      if (s.rot) return;
      var b = center.box(s); if (!b) return;
      var w = b[2] - b[0], h = b[3] - b[1];
      if (w > 0 && h > 0 && w / h > 1.2 && w / h < 1.6 && planTxt.some(function (t) { return t.x > b[0] && t.x < b[2] && t.y > b[1] && t.y < b[3] && w > t.h * 40; })) sheetFrames.push(b);
    });
    legendInfo = legendCount(T, d.inserts, opt, d.blocks, d.segs, sheetFrames);
    if (legendInfo) {
      legendInfo.items.forEach(function (it) { if (!items[it.name]) items[it.name] = it; });
      legendInfo.floors.forEach(function (f) { floors[f] = 1; });
      warnings = warnings.filter(function (w) { return !/附近找不到數量表|沒有數量表，已改用圖上符號計數|讀不到欄位標題/.test(w); }).concat(legendInfo.warnings);
      if (tables.length) tables = [];   /* 非設備的小表不列出，也不提示「看不出是哪一層」 */
    }
  }
  var floorList = Object.keys(floors).sort(function (a, b) { return floorRank(a) - floorRank(b); });
  var list = Object.keys(items).map(function (k) { return items[k]; }).sort(function (a, b) { return a.sys < b.sys ? -1 : a.sys > b.sys ? 1 : b.total - a.total; });
  if (noCheck.length) warnings.push("以下數量表的平面圖上找不到可核對的設備符號（符號可能畫在戶型等圖塊裡），數量以表為準，未逐項核對圖面：" + noCheck.join("、"));
  tables.forEach(function (tb) { if (tb.needFloor) warnings.push("數量表「" + tb.key + "」看不出是哪一層，數量未計入樓層"); });
  if (!tables.length && !legendInfo) {
    var seen = T.filter(function (t) { return /數\s*量/.test(t.s); }).map(function (t) { return t.s.slice(0, 20); });
    seen = seen.filter(function (x, i) { return seen.indexOf(x) === i; }).slice(0, 8);
    warnings.push("圖面中找不到「數量表」。請確認平面圖有附「XF 監控設備數量表」。" + (seen.length ? "（圖上含「數量」的文字：" + seen.join("、") + "）" : "（圖上沒有任何含「數量」的文字，數量表可能是圖片、外部參考或 OLE 物件）"));
  }
  var plans = opt.noPlans ? [] : buildPlans(titles, d.segs, blockNames, frames);
  return {
    tables: tables.map(function (t) { return { key: t.key, floors: t.floors, rows: t.rows.map(function (r) { return { name: r.name, qty: r.qty, raw: r.raw, block: r.block }; }) }; }),
    floors: floorList, items: list, checks: checks, warnings: warnings, embedded: embedded, pendingXlsx: pendingXlsx, plans: plans,
    unitM: guessUnit(plans), planVer: 2,
    stats: { frames: frames.length, inserts: d.inserts.length, texts: T.length, blocks: Object.keys(d.blocks).length, titles: titles.map(function (t) { return t.s + "→" + (t.table ? t.table.key : "?"); }) }
  };
}

/* ---------- 沒有數量表的圖面：依「圖例」數圖上符號（行動強波等格式） ----------
   1. 圖例表：「圖例｜說明」，每列左邊是符號（圖塊或「2W」「DC」這類代號文字），右邊是設備名稱；沒有符號的列（線材）略過。
   2. 圖紙：標題（含模型空間的圖框屬性）「地下五層」＋「強波器配置平面圖」／「…昇位圖」，依圖紙排列間距劃分範圍。
   3. 數量以各層平面圖為準（可分樓層）；只畫在昇位圖的設備才用昇位圖數量。昇位圖排版常與平面圖不同，只作核對提示。 */
/** 圖塊外形簽章：圖元種類＋正規化座標（不同名稱但畫法相同的圖塊視為同一符號） */
function blockSig(blocks, name) {
  var es = blocks[name]; if (!es || !es.length || es.length > 60) return null;
  var pts = [];
  es.forEach(function (e) {
    if (e.t === "INSERT") return;
    e.pts.forEach(function (p) { pts.push([e.t, p[0], p[1]]); });
    if (e.p2) pts.push([e.t + "2", e.p2[0], e.p2[1]]);
    if (e.t === "CIRCLE" && e.pts[0]) pts.push(["R", e.pts[0][0] + (+e.v["40"] || 0), e.pts[0][1]]);
  });
  if (pts.length < 2) return null;
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  pts.forEach(function (p) { x0 = Math.min(x0, p[1]); y0 = Math.min(y0, p[2]); x1 = Math.max(x1, p[1]); y1 = Math.max(y1, p[2]); });
  var sz = Math.max(x1 - x0, y1 - y0); if (!sz) return null;
  return es.map(function (e) { return e.t; }).sort().join(",") + "|" + pts.map(function (p) { return p[0] + ":" + Math.round((p[1] - x0) / sz * 20) + "," + Math.round((p[2] - y0) / sz * 20); }).sort().join(";");
}
function legendCount(T, inserts, opt, blocks, segs, frames) {
  var warnings = [];
  /* 圖例表頭：「圖例」或分開寫的「圖」「例」 */
  var heads = [];
  T.forEach(function (t) {
    var hh = t.h || 50;
    if (/^圖\s*例$/.test(t.s)) heads.push(t);
    else if (t.s === "圖" && T.some(function (o) { return o.s === "例" && Math.abs(o.y - t.y) < hh * 0.5 && o.x > t.x && o.x - t.x < hh * 4; })) heads.push(t);
  });
  var legend = [];
  heads.forEach(function (g) {
    var hh = g.h || 50;
    var ds = T.filter(function (t) { return (/^說\s*明$/.test(t.s) || t.s === "說") && Math.abs(t.y - g.y) < hh * 0.6 && t.x > g.x && t.x < g.x + hh * 30; })[0];
    if (!ds) return;
    var nm = T.filter(function (t) { return t.y < g.y - hh * 0.6 && t.y > g.y - hh * 80 && t.x > g.x + hh * 1.5 && t.x < ds.x + hh * 4 && /[一-鿿]/.test(t.s) && t.s.length >= 2 && t.s.length <= 40 && !/^\(|^（|^\d+[.、]/.test(t.s); })
      .sort(function (a, b) { return b.y - a.y; });
    var rows = [], last = g.y, gap = 0;
    for (var i = 0; i < nm.length; i++) {
      var dy = last - nm[i].y;
      if (rows.length && Math.abs(nm[i].y - rows[rows.length - 1].y) < hh * 0.5) continue;
      if (rows.length >= 2 && gap && dy > gap * 3) break;
      if (rows.length === 1) gap = dy;
      rows.push(nm[i]); last = nm[i].y;
    }
    var rh = gap || hh * 2;
    rows.forEach(function (r) {
      var code = T.filter(function (t) { return t !== r && Math.abs(t.y - r.y) < rh * 0.45 && t.x < r.x && t.x > g.x - hh * 3 && /^[A-Za-z0-9\-]{1,5}$/.test(t.s.trim()); })[0];
      var blk = inserts.filter(function (s) { return Math.abs(s.y - r.y) < rh * 0.6 && s.x < r.x + hh && s.x > g.x - hh * 3; })[0];
      if (!code && !blk) return;
      legend.push({ name: r.s.replace(/\s+/g, " ").trim(), code: code ? code.s.trim() : null, codeAt: code ? [code.x, code.y, rh] : null, block: blk ? blk.name : null, box: [g.x - hh * 4, r.y - rh * 0.6, ds.x + hh * 30, g.y + hh], gx: g.x, gy: g.y });
    });
  });
  if (!legend.length) return null;
  var lboxes = legend.map(function (l) { return l.box; });
  function inLegend(x, y) { return lboxes.some(function (b) { return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]; }); }
  /* 圖紙標題 */
  var kinds = T.filter(function (t) { return /(配置平面圖|設備平面圖|平面圖|昇位圖|升位圖|系統圖)$/.test(t.s.trim()) && t.s.length <= 30; });
  var titles = [];
  kinds.forEach(function (t) {
    var hh = t.h || 50, s = t.s.trim(), fl = "";
    var fm = /^(.*?[層樓F])\s*(?:\S{0,8})?(配置平面圖|設備平面圖|平面圖)$/.exec(s);
    if (fm) fl = fm[1];
    else if (/平面圖$/.test(s)) {   /* 樓層寫在上一行（圖框屬性「地下五層」） */
      var up = T.filter(function (o) { return o !== t && Math.abs(o.x - t.x) < hh && o.y > t.y && o.y - t.y < hh * 2.5 && /層|樓|^[BR]?\d+F$/.test(o.s) && o.s.length <= 10; })[0];
      if (up) fl = up.s.trim();
    }
    titles.push({ t: t, x: t.x, y: t.y, h: hh, s: (fl && s.indexOf(fl) < 0 ? fl : "") + s, riser: /昇位圖|升位圖|系統圖/.test(s), floor: fl });
  });
  /* 去掉圖紙目錄一行行列出的圖名：同一欄、行距小於 4 字高、連續 3 行以上 */
  var idx = [];
  titles.forEach(function (a) {
    var grp = [a], grew = true;
    while (grew) { grew = false; titles.forEach(function (o) { if (grp.indexOf(o) < 0 && grp.some(function (g) { return Math.abs(o.x - g.x) < a.h && Math.abs(o.y - g.y) < a.h * 4; })) { grp.push(o); grew = true; } }); }
    if (grp.length >= 3) idx.push(a);
  });
  titles = titles.filter(function (a) { return idx.indexOf(a) < 0 && (a.riser || a.floor); });
  var WEAK = /弱電|監控|對講|門禁|保全|監視|CCTV/i, mixed = false;
  /* 「公共天線」「同軸」也出現在一般弱電圖例：圖名有弱電字樣時不算行動強波圖 */
  var isMobile = legend.some(function (l) { return /強波|分路器/.test(l.name); }) || (legend.some(function (l) { return /天線|同軸/.test(l.name); }) && !titles.some(function (t) { return WEAK.test(t.s); }));
  if (isMobile && titles.some(function (t) { return /強波|行動/.test(t.s); })) titles = titles.filter(function (t) { return /強波|行動/.test(t.s); });   /* 綜合弱電圖：只看本系統的圖紙 */
  /* 綜合水電圖（給排水、電氣、通風、弱電同一檔）：只看弱電系統的圖紙 */
  if (!isMobile && titles.some(function (t) { return WEAK.test(t.s); }) && !titles.every(function (t) { return WEAK.test(t.s); })) {
    titles = titles.filter(function (t) { return WEAK.test(t.s); }); mixed = true;
  }
  var hMax = titles.reduce(function (m, t) { return Math.max(m, t.h); }, 0);
  /* 圖紙內的小字註記（「電信系統詳昇位圖」）不是圖紙標題；各層平面圖比例不同時字高也不同，平面圖標題放寬 */
  titles = titles.filter(function (t) { return t.h >= hMax * 0.8 || (!t.riser && t.floor && t.h >= hMax * 0.5); });
  if (!titles.length) return null;
  /* 有圖框圖塊時，以圖框為圖紙範圍 */
  if (mixed && frames && frames.length) titles.forEach(function (t) {
    var best = null, ba = Infinity;
    frames.forEach(function (b) { if (t.x > b[0] && t.x < b[2] && t.y > b[1] && t.y < b[3]) { var a = (b[2] - b[0]) * (b[3] - b[1]); if (a < ba) { ba = a; best = b; } } });
    t.box = best;
  });
  /* 圖紙間距（圖紙排成格狀時，標題在每張圖紙的同一個位置） */
  var W = Infinity, H = Infinity;
  titles.forEach(function (a) { titles.forEach(function (b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    if (dx > a.h * 20 && Math.abs(dy) < a.h * 2) W = Math.min(W, dx);
    if (dy > a.h * 20 && Math.abs(dx) < a.h * 2) H = Math.min(H, dy);
  }); });
  if (!isFinite(W)) W = isFinite(H) ? H * 1.414 : Infinity;
  if (!isFinite(H)) H = isFinite(W) ? W / 1.414 : Infinity;
  /* 每張圖紙的範圍：找標題右方最近的長直線（圖框右緣）與下方最近的長橫線（圖框下緣）；找不到就用估計值 */
  titles.forEach(function (t) {
    var R = Infinity, B = -Infinity;
    if (isFinite(W) && isFinite(H) && segs) segs.forEach(function (g) {
      var vx = Math.abs(g[1] - g[3]) < t.h * 0.2, hz = Math.abs(g[2] - g[4]) < t.h * 0.2;
      if (vx && Math.abs(g[2] - g[4]) > H * 0.7 && g[1] > t.x && g[1] < t.x + W * 0.3 && Math.min(g[2], g[4]) < t.y && Math.max(g[2], g[4]) > t.y) R = Math.min(R, g[1]);
      if (hz && Math.abs(g[1] - g[3]) > W * 0.7 && g[2] < t.y && g[2] > t.y - H * 0.3 && Math.min(g[1], g[3]) < t.x && Math.max(g[1], g[3]) > t.x) B = Math.max(B, g[2]);
    });
    t.R = isFinite(R) ? R : t.x + W * 0.12; t.B = isFinite(B) ? B : t.y - H * 0.15;
  });
  function sheetOf(x, y) {
    if (titles.length === 1 && !mixed) return titles[0];
    var inBox = titles.filter(function (t) { var b = t.box; return b && x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]; });
    if (inBox.length === 1) return inBox[0];
    if (inBox.length > 1) {   /* 一張圖紙有多個平面圖：歸給最近的標題（符號多在標題上方） */
      var bs = Infinity, bt = null;
      inBox.forEach(function (t) { var sc = Math.abs(x - t.x) + 0.5 * Math.max(y - t.y, 0) + 3 * Math.max(t.y - y, 0); if (sc < bs) { bs = sc; bt = t; } });
      return bt;
    }
    if (mixed) return null;   /* 綜合圖：不在弱電圖紙內的符號不算 */
    var best = null;
    titles.forEach(function (t) { if (!best && !t.box && x <= t.R && x >= t.R - W && y >= t.B && y <= t.B + H) best = t; });
    return best;
  }
  if (mixed) {   /* 只用弱電圖紙上的圖例 */
    legend = legend.filter(function (l) { return sheetOf(l.gx, l.gy); });
    lboxes = legend.map(function (l) { return l.box; });
    if (!legend.length) return null;
  }
  /* 圖例的圖塊在平面圖上沒出現時，找外形相同的其他圖塊（複製時被改成匿名圖塊） */
  var used = {}; inserts.forEach(function (s) { if (!inLegend(s.cx !== undefined ? s.cx : s.x, s.cy !== undefined ? s.cy : s.y)) used[s.name] = (used[s.name] || 0) + 1; });
  var sigCache = {};
  function sigOf(n) { if (!(n in sigCache)) sigCache[n] = blocks ? blockSig(blocks, n) : null; return sigCache[n]; }
  var taken = {}; legend.forEach(function (l) { if (l.block) taken[l.block] = 1; });
  legend.forEach(function (l) {
    l.blocks = l.block ? [l.block] : [];
    if (!l.block || used[l.block]) return;
    var sg = sigOf(l.block); if (!sg) return;
    Object.keys(used).forEach(function (n) { if (!taken[n] && sigOf(n) === sg) { l.blocks.push(n); taken[n] = 1; } });
  });
  /* 同名設備的圖例（每張圖紙各附一份）合併成一列，避免同一個符號被數好幾次 */
  var merged = [], byName = {};
  legend.forEach(function (l) {
    var m = byName[l.name];
    if (!m) { m = byName[l.name] = { name: l.name, block: l.block, blocks: [], codes: [], codeAt: {} }; merged.push(m); }
    if (l.code && l.codeAt && !m.codeAt[l.code]) m.codeAt[l.code] = l.codeAt;
    l.blocks.forEach(function (b) { if (m.blocks.indexOf(b) < 0) m.blocks.push(b); });
    if (l.code && m.codes.indexOf(l.code) < 0) m.codes.push(l.code);
    if (!m.block && l.block) m.block = l.block;
  });
  legend = merged;
  /* 圖例用「線條＋代號文字」畫、平面圖用「內含同樣代號文字的圖塊」畫（例：IC 室內機、D 讀卡機、K 電子門鎖） */
  var codeBlk = {}, edgesOf = {}, legBlk = {};
  legend.forEach(function (l) { l.blocks.forEach(function (b) { legBlk[b] = 1; }); });
  if (blocks) Object.keys(blocks).forEach(function (n) {
    var es = blocks[n]; if (!es || es.length > 8 || legBlk[n]) return;   /* 已是其他圖例列的圖塊不重複對應 */
    var txt = [], bad = false, edges = 0;
    es.forEach(function (e) {
      if (e.t === "INSERT" || /電氣|給水|排水|消防|空調|通風/.test(e.v["8"] || "")) bad = true;   /* 巢狀圖塊、其他系統圖層 */
      else if (e.t === "TEXT" || e.t === "MTEXT") txt.push(String(e.v["1"] || "").trim());
      else if (e.t === "LINE") edges++;
      else if (e.t === "LWPOLYLINE" && e.pts.length > 1) edges += e.pts.length - 1 + ((+e.v["70"] || 0) & 1);
    });
    if (bad || txt.length !== 1 || !txt[0]) return;   /* 只含一個代號文字的符號 */
    (codeBlk[txt[0]] = codeBlk[txt[0]] || []).push(n); edgesOf[n] = edges;
  });
  legend.forEach(function (l) {
    l.codeBlocks = [];
    l.codes.forEach(function (c) {
      var cand = isMobile ? [] : (codeBlk[c] || []).filter(function (n) { return used[n]; });   /* 行動強波圖維持原本以代號文字計數（已與亞泰報價核對） */
      var at = l.codeAt[c];
      if (cand.length > 1 && at && segs) {   /* 多個候選：挑線條數最接近圖例符號的 */
        var rh = at[2], le = segs.filter(function (g) { return Math.min(g[1], g[3]) > at[0] - rh && Math.max(g[1], g[3]) < at[0] + rh * 1.2 && Math.min(g[2], g[4]) > at[1] - rh * 0.5 && Math.max(g[2], g[4]) < at[1] + rh * 0.6; }).length;
        if (le <= 20) { var bd = Math.min.apply(null, cand.map(function (n) { return Math.abs(edgesOf[n] - le); })); cand = cand.filter(function (n) { return Math.abs(edgesOf[n] - le) === bd; }); }
      }
      cand.forEach(function (n) { if (l.blocks.indexOf(n) < 0 && l.codeBlocks.indexOf(n) < 0) l.codeBlocks.push(n); });
    });
  });
  /* 同一個圖塊被兩列圖例抓到（列距小、符號跨列）：有代號的列只用代號 */
  var claim = {}; legend.forEach(function (l) { l.blocks.forEach(function (b) { claim[b] = (claim[b] || 0) + 1; }); });
  legend.forEach(function (l) { if (l.codes.length) l.blocks = l.blocks.filter(function (b) { return claim[b] < 2; }); });
  /* 數符號 */
  var cnt = {};   /* name -> sheetIdx -> n */
  /* 詳圖（「各戶 IC接線詳圖」）裡的示意符號不算：詳圖畫在標題上方 */
  var details = T.filter(function (t) { return /(詳圖|大樣圖?)$/.test(t.s.trim()) && t.s.length <= 20; });
  function inDetail(x, y) { for (var i = 0; i < details.length; i++) { var t = details[i], h2 = t.h || 50; if (x > t.x - h2 * 25 && x < t.x + h2 * 25 && y > t.y - h2 && y < t.y + h2 * 12) return true; } return false; }
  function add(l, x, y) { if (inLegend(x, y) || inDetail(x, y)) return; var sh = sheetOf(x, y); if (!sh) return; var k = titles.indexOf(sh); var c = cnt[l.name] = cnt[l.name] || {}; c[k] = (c[k] || 0) + 1; }
  legend.forEach(function (l) {
    if (l.blocks.length) inserts.forEach(function (s) { if (l.blocks.indexOf(s.name) >= 0 && !inLegend(s.x, s.y)) add(l, s.cx !== undefined ? s.cx : s.x, s.cy !== undefined ? s.cy : s.y); });   /* 圖形中心偏離插入點的圖塊：插入點在圖例內也不算 */
    if (l.codeBlocks.length) inserts.forEach(function (s) { if (l.codeBlocks.indexOf(s.name) >= 0 && !inLegend(s.x, s.y)) add(l, s.cx !== undefined ? s.cx : s.x, s.cy !== undefined ? s.cy : s.y); });
    /* 代號已對應到平面圖上的圖塊時，散落的同字文字（標註、詳圖說明）不再重複數；圖塊屬性值（MP）不算 */
    if (l.codes.length && !l.codeBlocks.length) T.forEach(function (t) { if (!t.att && !(t.attr && !isMobile) && l.codes.indexOf(t.s.trim()) >= 0) add(l, t.x, t.y); });
  });
  var anyRiser = titles.some(function (t) { return t.riser; });
  var items = [], floors = {}, mism = [], onlyRiser = [];
  legend.forEach(function (l) {
    var c = cnt[l.name]; if (!c) return;
    var rTot = 0, pTot = 0, pf = {};
    Object.keys(c).forEach(function (k) {
      var t = titles[k];
      if (t.riser) rTot += c[k];
      else {
        var f = cnFloor(t.floor.replace(/\s/g, "")); f = /夾層/.test(t.floor) ? cnFloor(t.floor.replace(/夾層/, "")) + "夾層" : f;
        var fl = floorsOf(f); if (!fl.length || !fl.every(function (x) { return FLOOR_RE.test(x); })) fl = [f];   /* 「三至十層」標準層平面：每層各一份 */
        fl.forEach(function (x) { pTot += c[k]; pf[x] = (pf[x] || 0) + c[k]; });
      }
    });
    var it = { name: l.name, sys: isMobile ? "mobile" : sysOf(l.name, opt && opt.rules), block: l.block, total: 0, floors: {}, fromLegend: true };
    if (pTot) { it.total = pTot; it.floors = pf; if (rTot && rTot !== pTot) mism.push(l.name + "（平面圖 " + pTot + "、昇位圖 " + rTot + "）"); }
    else if (rTot) { it.total = rTot; it.floors = { "昇位圖": rTot }; onlyRiser.push(l.name); }
    if (!it.total) return;
    Object.keys(it.floors).forEach(function (f) { floors[f] = 1; });
    items.push(it);
  });
  if (!items.length) return null;
  warnings.push("圖面沒有數量表，已依「圖例」符號數各層平面圖（" + items.length + " 種設備）。線材長度、接頭請依圖面另計，數量請工務複核");
  if (onlyRiser.length) warnings.push("以下設備只畫在昇位圖，以昇位圖數量列入、不分樓層：" + onlyRiser.join("、"));
  return { items: items, floors: Object.keys(floors), warnings: warnings, legend: legend, sheets: titles.map(function (t) { return t.s; }) };
}

/* ---------- 圖面內嵌 Excel 的設備數量表（Philips 燈控「材料表」格式） ----------
   表頭：樓層｜盤名｜(受控迴路)｜12迴路電驛模組｜4迴路電驛模組…；樓層是合併儲存格（只填第一列）；最後一列「總計」。
   讀到就把數量併入 r.items / r.floors（圖面文字已有同名設備時不重複加）。回傳併入的設備數。 */
function mergeSheetTables(r, sheets) {
  var added = 0, LABEL = /樓\s*層|盤\s*名|區\s*域|受控迴路|迴路數|備\s*註|編\s*號|項\s*次/, TOT = /^(總\s*計|合\s*計|小\s*計)$/;
  (sheets || []).forEach(function (sh) {
    var rows = sh.rows || [], hi = -1;
    if (rows.slice(0, 10).some(function (rw) { return (rw || []).some(function (v) { return /點數表/.test(String(v || "")); }); })) return;   /* I/O 管理點數表交給設計・編表 */
    for (var i = 0; i < Math.min(rows.length, 15); i++) {
      var rw = (rows[i] || []).map(function (v) { return String(v === null || v === undefined ? "" : v).replace(/\s+/g, ""); });
      if (rw.some(function (v) { return /^樓層|樓層$|^區域/.test(v); }) && rw.filter(function (v) { return /[一-鿿]/.test(v) && !LABEL.test(v); }).length >= 2) { hi = i; break; }
    }
    if (hi < 0) return;
    var head = rows[hi].map(function (v) { return String(v === null || v === undefined ? "" : v).replace(/\s+/g, " ").trim(); });
    var fc = head.findIndex(function (v) { return /樓\s*層|區\s*域/.test(v) && !/盤\s*名/.test(v); });
    var dev = [];
    head.forEach(function (v, j) { if (v && /[一-鿿]/.test(v) && !LABEL.test(v)) dev.push(j); });
    if (!dev.length) return;
    var sysK = head.some(function (v) { return /電驛|燈控|照明|情境|調光|DyNet/i.test(v); }) ? "lighting" : null;
    var floor = "", got = {}, tot = null, tables = [];
    for (var k = hi + 1; k < rows.length; k++) {
      var row = rows[k] || [], first = String(row[0] === null || row[0] === undefined ? "" : row[0]).replace(/\s+/g, "");
      if (TOT.test(first) || (fc >= 0 && TOT.test(String(row[fc] || "").replace(/\s+/g, "")))) { tot = row; break; }
      if (!row.some(function (v) { return v !== null && v !== undefined && v !== ""; })) continue;
      if (fc >= 0 && row[fc] !== null && row[fc] !== undefined && String(row[fc]).trim()) floor = cnFloor(String(row[fc]).replace(/\s+/g, ""));
      var fk = floor && floorsOf(floor).length ? floor : "未分層";
      dev.forEach(function (j) { var n = Number(row[j]); if (n > 0) { var g = got[fk] = got[fk] || {}; g[head[j]] = (g[head[j]] || 0) + n; } });
    }
    var have = {}; (r.items || []).forEach(function (it) { have[it.name] = it; });
    var fls = {}; (r.floors || []).forEach(function (f) { fls[f] = 1; });
    var sum = {};
    Object.keys(got).forEach(function (fk) {
      var ff = fk === "未分層" ? ["未分層"] : floorsOf(fk);
      Object.keys(got[fk]).forEach(function (name) {
        var q = got[fk][name]; sum[name] = (sum[name] || 0) + q;
        var it = have[name];
        if (it && !it.fromSheet) return;   /* 圖面文字已讀到同名設備 */
        if (!it) { it = have[name] = { name: name, sys: sysK || sysOf(name), block: null, total: 0, floors: {}, fromSheet: true }; r.items.push(it); added++; }
        ff.forEach(function (f) { it.floors[f] = (it.floors[f] || 0) + q; it.total += q; fls[f] = 1; });
      });
      tables.push({ key: fk, floors: ff, rows: Object.keys(got[fk]).map(function (n) { return { name: n, qty: got[fk][n], raw: String(got[fk][n]), block: null }; }), source: "embedded" });
    });
    if (tot) dev.forEach(function (j) { var t = Number(tot[j]); if (t && sum[head[j]] !== undefined && t !== sum[head[j]]) (r.warnings = r.warnings || []).push("圖面內嵌數量表的「" + head[j] + "」各列加總 " + sum[head[j]] + "，與表上總計 " + t + " 不同，請確認"); });
    if (tables.length) {
      r.tables = (r.tables || []).concat(tables);
      r.floors = Object.keys(fls).sort(function (a, b) { return floorRank(a) - floorRank(b); });
    }
  });
  if (added) {
    r.warnings = (r.warnings || []).filter(function (w) { return !/找不到「數量表」|讀不到欄位標題/.test(w); });
    r.warnings.push("設備數量取自圖面內嵌的 Excel 數量表（" + added + " 種設備）");
    r.items.sort(function (a, b) { return a.sys < b.sys ? -1 : a.sys > b.sys ? 1 : b.total - a.total; });
  }
  return added;
}

/* ---------- 平面圖（佈線圖用）：各層簡化線條與設備位置 ---------- */
var SKIP_LAYER = /TEXT|TXET|DIM|標註|尺寸|HATCH|填充|圖框|傢配|家具|門窗編號|戶編|文字|中心線|軸線|AXIS|DEFPOINTS/i;
function buildPlans(titles, segs, blockNames, frames) {
  var out = [];
  var ps = titles.filter(function (t) { return t.table && t.devs && t.devs.length; }).map(function (t) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    t.devs.forEach(function (s) { x0 = Math.min(x0, s.cx); x1 = Math.max(x1, s.cx); y0 = Math.min(y0, s.cy); y1 = Math.max(y1, s.cy); });
    /* 設備多集中在核心，平面外牆常在設備範圍外：往外找 60%（不超過圖框） */
    var mx = Math.max((x1 - x0) * 1.2, t.h * 25), my = Math.max((y1 - y0) * 1.2, t.h * 25);
    var fb = t.frame >= 0 && frames ? frames[t.frame] : null;
    var sx0 = x0 - mx, sx1 = x1 + mx, sy0 = y0 - my, sy1 = y1 + my;
    if (fb) { var ix = (fb[2] - fb[0]) * 0.03, iy = (fb[3] - fb[1]) * 0.03;   /* 內縮避開圖框邊線 */
      sx0 = Math.max(sx0, fb[0] + ix); sy0 = Math.max(sy0, fb[1] + iy); sx1 = Math.min(sx1, fb[2] - ix); sy1 = Math.min(sy1, fb[3] - iy); }
    return { t: t, dev: [x0, y0, x1, y1], search: [sx0, sy0, sx1, sy1], list: [] };
  });
  if (!ps.length) return out;
  function overlap(a, b) { return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]; }
  function dist(b, x, y) { var dx = Math.max(b[0] - x, 0, x - b[2]), dy = Math.max(b[1] - y, 0, y - b[3]); return dx * dx + dy * dy; }
  /* 每條線段歸給離它最近的平面（避免同一張圖紙上相鄰平面的線混進來） */
  for (var i = 0; i < segs.length; i++) {
    var g = segs[i];
    if (SKIP_LAYER.test(g[0])) continue;
    var cx = (g[1] + g[3]) / 2, cy = (g[2] + g[4]) / 2, best = null, bd = Infinity, cand = [];
    for (var k = 0; k < ps.length; k++) {
      var p = ps[k], b = p.search;
      if (cx < b[0] || cx > b[2] || cy < b[1] || cy > b[3]) continue;
      cand.push(p);
      var dd = dist(p.dev, cx, cy); if (dd < bd) { bd = dd; best = p; }
    }
    /* 同一張平面（設備範圍重疊，例如「壹層平面圖」與「壹層中央監控系統平面圖」）共用線條 */
    if (best) cand.forEach(function (p) { if (p === best || overlap(p.dev, best.dev)) p.list.push(g); });
  }
  ps.forEach(function (p) {
    var t = p.t, x0 = p.dev[0], y0 = p.dev[1], x1 = p.dev[2], y1 = p.dev[3], sb = p.search;
    var clip = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
    p.list.forEach(function (g) {
      for (var e = 1; e <= 3; e += 2) {
        var x = clip(g[e], sb[0], sb[2]), y = clip(g[e + 1], sb[1], sb[3]);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    });
    var pad = Math.max(x1 - x0, y1 - y0) * 0.03;
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    var q = Math.max(1, Math.round((x1 - x0) / 2000));   /* 座標取整單位，控制資料量 */
    var list = [];
    p.list.forEach(function (g) {
      var len = Math.abs(g[3] - g[1]) + Math.abs(g[4] - g[2]);
      if (len >= q * 3) list.push([len, g[1], g[2], g[3], g[4]]);
    });
    list.sort(function (a, b) { return b[0] - a[0]; });
    list = list.slice(0, 4000);
    var r = function (v) { return Math.round(v / q) * q; };
    out.push({ title: t.s, table: t.table.key, floors: t.table.floors, box: [r(x0), r(y0), r(x1), r(y1)],
      segs: list.map(function (g) { return [r(g[1]), r(g[2]), r(g[3]), r(g[4])]; }).filter(function (g) { return g[0] !== g[2] || g[1] !== g[3]; }),
      devs: t.devs.map(function (s) { return { n: Object.keys(blockNames[s.name] || {}).join("／"), x: r(s.cx), y: r(s.cy) }; }) });
  });
  return out;
}
/** 依平面寬度推測圖面單位（公尺／單位） */
function guessUnit(plans) {
  var ws = plans.map(function (p) { return p.box[2] - p.box[0]; }).sort(function (a, b) { return a - b; });
  if (!ws.length) return 0.01;
  var w = ws[Math.floor(ws.length / 2)];
  return w > 20000 ? 0.001 : w > 200 ? 0.01 : 1;
}

var api = { decode: decode, parse: parse, analyze: analyze, mergeSheetTables: mergeSheetTables, floorsOf: floorsOf, floorRank: floorRank, sysOf: sysOf, SYS_RULES: SYS_RULES, cnNum: cnNum };
if (typeof module === "object" && module.exports) module.exports = api;
else root.DXF = api;
})(typeof self !== "undefined" ? self : this);
