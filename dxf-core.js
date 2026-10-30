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
  var blocks = {}, inserts = [], texts = [], oles = [], segs = [], bases = {}, tableIns = [];
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
      if (s) texts.push({ s: s, x: +e.v["10"] || 0, y: +e.v["20"] || 0, h: +(e.v["40"] || 0) });
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
  return { blocks: blocks, inserts: inserts, texts: texts, oles: oles, segs: segs };
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
  var k = cnFloor(key).replace(/\s/g, "").toUpperCase().replace(/[～〜至]/g, "~");
  if (k === "RF") return ["RF"];
  var m = /^(B|R|RF)?(\d+)F?(?:~(B|R|RF)?(\d+)F?)?$/.exec(k);
  if (!m) return [key];
  var p = m[1] === "RF" ? "R" : (m[1] || ""), a = +m[2], b = m[4] ? +m[4] : a, out = [];
  if (b < a) { var t = a; a = b; b = t; }
  for (var i = a; i <= b && out.length < 200; i++) out.push(p + i + "F");
  return out;
}
function floorRank(f) {
  var m = /^(B|R)?(\d+)F$/.exec(f); if (!m) return 5000;
  return m[1] === "B" ? 1000 - +m[2] : m[1] === "R" ? 3000 + +m[2] : 2000 + +m[2];
}

/* ---------- 系統分類（可由呼叫端覆寫） ---------- */
var SYS_RULES = [
  ["parking", /線圈|車道|柵欄|紅綠燈|警示燈|閃光燈|車牌|E-?TAG|出車|字幕機|車輛偵測/i],
  ["cctv", /攝影機|CCTV|錄影|監視/i],
  ["intercom", /對講|門口機|門口子機|管理總機|智慧家庭|門鈴/],
  ["access", /讀卡機|讀碼機|陽極|電鎖|門鎖|開門按鈕|門禁|Smart ?Key|感應卡/i],
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
  var tables = [];
  T.forEach(function (h) {
    var mm = /^(.*?)\s*(?:中央)?(?:監控)?(?:系統)?(?:設備)?(?:器材)?\s*數\s*量\s*(?:統計|一覽|明細)?\s*表?$/.exec(h.s);
    if (!mm || !/表|統計/.test(h.s) || h.s.length > 30) return;
    var hh = h.h || 50, near = T.filter(function (t) { return t !== h && t.x > h.x - hh * 3 && t.x < h.x + hh * 40 && t.y < h.y && t.y > h.y - hh * 4; });
    var qh = near.filter(function (t) { return /數\s*量|合\s*計|小\s*計|總\s*計/.test(t.s) && t.s.length < 8 && !/表|統計/.test(t.s); })[0];
    var dh = near.filter(function (t) { return /說\s*明|名\s*稱|品\s*名|項\s*目|設\s*備|器\s*材|規\s*格/.test(t.s) && t.s.length < 10; })[0];
    if (!qh || !dh) { warnings.push("找到「" + h.s + "」但讀不到欄位標題（需有「說明」與「數量」欄）"); return; }
    var top = Math.min(qh.y, dh.y);
    var col = T.filter(function (t) { return t.x > h.x + (dh.x - h.x) * 0.5 && t.x < qh.x - hh && t.y < top - hh * 0.3 && t.y > top - hh * 120; })
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
    var nums = T.filter(function (t) { return Math.abs(t.x - qh.x) < hh * 4 && t.y < top - hh * 0.3 && t.y > ylow - hh * 1.5 && /^[-－—\d\s.]+$/.test(t.s); });
    var box = [h.x - hh * 4, ylow - hh * 1.6, qh.x + hh * 6, h.y + hh * 1.2];
    var key = mm[1].trim(), fl = key ? floorsOf(key) : [];
    var okFloor = fl.length && fl.every(function (f) { return /^(B|R)?\d+F$|^RF$/.test(f); });
    var tb = { key: okFloor ? cnFloor(key) : "表" + (tables.length + 1), floors: okFloor ? fl : [], needFloor: !okFloor, x: h.x, y: h.y, box: box, rows: [] };
    rows.forEach(function (r) {
      var best = null, bd = Infinity;
      nums.forEach(function (t) { var dd = Math.abs(t.y - r.y); if (dd < bd) { bd = dd; best = t; } });
      var q = best && bd < hh * 0.9 ? best.s.trim() : "";
      tb.rows.push({ name: r.s, qty: /^\d+$/.test(q) ? +q : 0, raw: q, y: r.y, block: null });
    });
    tables.push(tb);
  });

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
  var cands = T.filter(function (t) { return /平面圖$/.test(t.s) && !/配置圖/.test(t.s); });
  var hmax = cands.reduce(function (m, t) { return Math.max(m, t.h); }, 0);
  var titles = cands.filter(function (t) { return t.h >= hmax * 0.6; });
  titles = titles.filter(function (t) {            /* 去掉「屋突二層至屋頂層」這類群組總標題 */
    var above = titles.filter(function (o) { return o !== t && Math.abs(o.x - t.x) < t.h * 20 && o.y > t.y && o.y - t.y < t.h * 60; });
    return above.length < 2;
  });
  titles.forEach(function (t) {
    var best = null, bd = Infinity;
    tables.forEach(function (tb) { var dd = Math.hypot(tb.x - t.x, tb.y - t.y); if (dd < bd) { bd = dd; best = tb; } });
    t.table = best && bd < t.h * 100 ? best : null;
    if (!t.table) { warnings.push("平面圖「" + t.s + "」附近找不到數量表，該圖符號未納入核對"); return; }
    if (t.table.needFloor) {   /* 表名沒寫樓層 → 用旁邊平面圖的樓層 */
      var fk = cnFloor(t.s), ff = floorsOf(fk);
      if (ff.every(function (f) { return /^(B|R)?\d+F$|^RF$/.test(f); })) { t.table.key = fk; t.table.floors = ff; t.table.needFloor = false; }
    }
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
    titles.forEach(function (t) {
      if (fr >= 0 && t.frame >= 0 && t.frame !== fr) return;
      var dx = Math.abs(s.cx - t.x), dy = s.cy - t.y;
      if (dy < -t.h * 2 || dy > t.h * 60 || dx > t.h * 30) return;
      var sc = dx + 0.5 * Math.max(dy, 0);
      if (sc < bs) { bs = sc; best = t; }
    });
    if (!best || !best.table) return;
    (best.devs = best.devs || []).push(s);
    var k = best.table.key; sym[k] = sym[k] || {}; sym[k][s.name] = (sym[k][s.name] || 0) + 1;
  });

  /* 5. 彙整 */
  var floors = {}, items = {}, checks = [], knownName = {};
  tables.forEach(function (tb) { tb.rows.forEach(function (r) { if (r.block) knownName[r.name] = 1; }); });
  tables.forEach(function (tb) {
    var byBlock = {};
    tb.rows.forEach(function (r) {
      if (!r.block && (!r.raw || (!knownName[r.name] && sysOf(r.name, opt.rules) === "other"))) return;   /* 不像設備列（圖面註記、地名等） */
      var it = items[r.name] = items[r.name] || { name: r.name, sys: sysOf(r.name, opt.rules), block: r.block, total: 0, floors: {} };
      tb.floors.forEach(function (f) { it.floors[f] = (it.floors[f] || 0) + r.qty; it.total += r.qty; floors[f] = 1; });
      if (r.block) byBlock[r.block] = (byBlock[r.block] || 0) + r.qty;
    });
    var got = sym[tb.key] || {};
    Object.keys(byBlock).forEach(function (b) {
      var n = got[b] || 0;
      if (n !== byBlock[b]) checks.push({ table: tb.key, block: b, names: Object.keys(blockNames[b] || {}), table_qty: byBlock[b], symbols: n });
    });
  });
  var floorList = Object.keys(floors).sort(function (a, b) { return floorRank(a) - floorRank(b); });
  var list = Object.keys(items).map(function (k) { return items[k]; }).sort(function (a, b) { return a.sys < b.sys ? -1 : a.sys > b.sys ? 1 : b.total - a.total; });
  tables.forEach(function (tb) { if (tb.needFloor) warnings.push("數量表「" + tb.key + "」看不出是哪一層，數量未計入樓層"); });
  if (!tables.length) {
    var seen = T.filter(function (t) { return /數\s*量/.test(t.s); }).map(function (t) { return t.s.slice(0, 20); });
    seen = seen.filter(function (x, i) { return seen.indexOf(x) === i; }).slice(0, 8);
    warnings.push("圖面中找不到「數量表」。請確認平面圖有附「XF 監控設備數量表」。" + (seen.length ? "（圖上含「數量」的文字：" + seen.join("、") + "）" : "（圖上沒有任何含「數量」的文字，數量表可能是圖片、外部參考或 OLE 物件）"));
  }
  var plans = opt.noPlans ? [] : buildPlans(titles, d.segs, blockNames);
  return {
    tables: tables.map(function (t) { return { key: t.key, floors: t.floors, rows: t.rows.map(function (r) { return { name: r.name, qty: r.qty, raw: r.raw, block: r.block }; }) }; }),
    floors: floorList, items: list, checks: checks, warnings: warnings, embedded: embedded, pendingXlsx: pendingXlsx, plans: plans,
    unitM: guessUnit(plans),
    stats: { inserts: d.inserts.length, texts: T.length, blocks: Object.keys(d.blocks).length, titles: titles.map(function (t) { return t.s + "→" + (t.table ? t.table.key : "?"); }) }
  };
}

/* ---------- 平面圖（佈線圖用）：各層簡化線條與設備位置 ---------- */
var SKIP_LAYER = /TEXT|TXET|DIM|標註|尺寸|HATCH|填充|圖框|傢配|家具|門窗編號|戶編|文字|中心線|軸線|AXIS|DEFPOINTS/i;
function buildPlans(titles, segs, blockNames) {
  var out = [];
  titles.forEach(function (t) {
    if (!t.table || !t.devs || !t.devs.length) return;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    t.devs.forEach(function (s) { x0 = Math.min(x0, s.cx); x1 = Math.max(x1, s.cx); y0 = Math.min(y0, s.cy); y1 = Math.max(y1, s.cy); });
    var mx = Math.max((x1 - x0) * 0.15, t.h * 3), my = Math.max((y1 - y0) * 0.15, t.h * 3);
    x0 -= mx; x1 += mx; y0 -= my; y1 += my;
    var q = Math.max(1, Math.round((x1 - x0) / 1500));   /* 座標取整單位，控制資料量 */
    var inb = function (x, y) { return x >= x0 && x <= x1 && y >= y0 && y <= y1; };
    var list = [];
    for (var i = 0; i < segs.length; i++) {
      var g = segs[i];
      if (SKIP_LAYER.test(g[0]) || !inb(g[1], g[2]) || !inb(g[3], g[4])) continue;
      var len = Math.abs(g[3] - g[1]) + Math.abs(g[4] - g[2]);
      if (len < q * 4) continue;
      list.push([len, g[1], g[2], g[3], g[4]]);
    }
    list.sort(function (a, b) { return b[0] - a[0]; });
    list = list.slice(0, 2500);
    var r = function (v) { return Math.round(v / q) * q; };
    out.push({ title: t.s, table: t.table.key, floors: t.table.floors, box: [r(x0), r(y0), r(x1), r(y1)],
      segs: list.map(function (g) { return [r(g[1]), r(g[2]), r(g[3]), r(g[4])]; }),
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

var api = { decode: decode, parse: parse, analyze: analyze, floorsOf: floorsOf, floorRank: floorRank, sysOf: sysOf, SYS_RULES: SYS_RULES, cnNum: cnNum };
if (typeof module === "object" && module.exports) module.exports = api;
else root.DXF = api;
})(typeof self !== "undefined" ? self : this);
