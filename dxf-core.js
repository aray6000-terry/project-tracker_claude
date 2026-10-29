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
  var blocks = {}, inserts = [], texts = [], oles = [];
  function flush() {
    if (!cur) return;
    var e = cur; cur = null;
    if (sec === "BLOCKS") {
      if (e.t === "BLOCK") { blk = e.v["2"] || ""; blocks[blk] = []; return; }
      if (e.t === "ENDBLK") { blk = null; return; }
      if (blk !== null) blocks[blk].push(e);
      return;
    }
    if (sec !== "ENTITIES" || e.v["67"] === "1") return;     /* 只看模型空間 */
    if (e.t === "INSERT") inserts.push({ name: e.v["2"] || "", layer: e.v["8"] || "", x: +e.v["10"] || 0, y: +e.v["20"] || 0,
      sx: e.v["41"] ? +e.v["41"] : 1, sy: e.v["42"] ? +e.v["42"] : (e.v["41"] ? +e.v["41"] : 1), rot: +(e.v["50"] || 0) });
    else if (e.t === "OLE2FRAME" && e.hex) oles.push({ x: +e.v["10"] || 0, y: +e.v["20"] || 0, type: e.v["3all"] || "", hex: e.hex });
    else if (e.t === "TEXT" || e.t === "MTEXT") {
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
      else if (!(code in cur.v)) cur.v[code] = val;
      continue;
    }
    if (code === "310" && cur.t === "OLE2FRAME") (cur.hex = cur.hex || []).push(val.trim());
    else if (code === "3") cur.v["3all"] = (cur.v["3all"] || "") + uni(val);
    else if (!(code in cur.v)) cur.v[code] = code === "1" || code === "2" ? uni(val) : val;
    if (onProgress && (i & 0x3ffff) === 0) onProgress(i / n);
  }
  flush();
  return { blocks: blocks, inserts: inserts, texts: texts, oles: oles };
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
  return function (ins) {
    var b = bb(ins.name, 0);
    if (!b) return [ins.x, ins.y];
    var cx = (b[0] + b[2]) / 2 * ins.sx, cy = (b[1] + b[3]) / 2 * ins.sy, a = ins.rot * Math.PI / 180;
    return [ins.x + cx * Math.cos(a) - cy * Math.sin(a), ins.y + cx * Math.sin(a) + cy * Math.cos(a)];
  };
}

/* ---------- 樓層 ---------- */
var CN = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10 };
function cnNum(s) {
  if (/^\d+$/.test(s)) return +s;
  if (s === "十") return 10;
  var m = /^([一二三四五六七八九])?十([一二三四五六七八九])?$/.exec(s);
  if (m) return (m[1] ? CN[m[1]] : 1) * 10 + (m[2] ? CN[m[2]] : 0);
  return CN[s] || NaN;
}
/** 「3F~5F」「B1F」「R2F」「6F～13F」→ 樓層清單 */
function floorsOf(key) {
  var k = key.replace(/\s/g, "").toUpperCase().replace(/[～〜至]/g, "~");
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
  var embedded = [];
  if (opt.xls) d.oles.forEach(function (o) {
    if (!/Excel/i.test(o.type)) return;
    try {
      var hx = o.hex.join(""), u = new Uint8Array(hx.length / 2);
      for (var i = 0; i < u.length; i++) u[i] = parseInt(hx.substr(i * 2, 2), 16);
      var sh = opt.xls.read(u);
      embedded.push({ x: o.x, y: o.y, sheets: sh.filter(function (x) { return x.rows.length; }) });
    } catch (e) { warnings.push("圖面內嵌的 Excel 表無法讀取：" + e.message); }
  });
  var center = makeBBox(d.blocks);
  var T = d.texts;

  /* 1. 數量表 */
  var tables = [];
  T.forEach(function (h) {
    var mm = /^(.*?)\s*(?:監控)?(?:設備)?數量表$/.exec(h.s);
    if (!mm || !mm[1]) return;
    var hh = h.h || 50, near = T.filter(function (t) { return t !== h && t.x > h.x - hh * 3 && t.x < h.x + hh * 40 && t.y < h.y && t.y > h.y - hh * 4; });
    var qh = near.filter(function (t) { return /數\s*量/.test(t.s) && t.s.length < 8; })[0];
    var dh = near.filter(function (t) { return /說\s*明|名\s*稱|品\s*名|項\s*目/.test(t.s) && t.s.length < 10; })[0];
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
    var key = mm[1].trim();
    var tb = { key: key, floors: floorsOf(key), x: h.x, y: h.y, box: box, rows: [] };
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
    t.table = best && bd < t.h * 60 ? best : null;
    if (!t.table) warnings.push("平面圖「" + t.s + "」附近找不到數量表，該圖符號未納入核對");
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
    titles.forEach(function (t) {
      var dx = Math.abs(s.cx - t.x), dy = s.cy - t.y;
      if (dy < -t.h * 2 || dy > t.h * 60 || dx > t.h * 30) return;
      var sc = dx + 0.5 * Math.max(dy, 0);
      if (sc < bs) { bs = sc; best = t; }
    });
    if (!best || !best.table) return;
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
  if (!tables.length) warnings.push("圖面中找不到「數量表」。請確認平面圖有附「XF 監控設備數量表」。");
  return {
    tables: tables.map(function (t) { return { key: t.key, floors: t.floors, rows: t.rows.map(function (r) { return { name: r.name, qty: r.qty, raw: r.raw, block: r.block }; }) }; }),
    floors: floorList, items: list, checks: checks, warnings: warnings, embedded: embedded,
    stats: { inserts: d.inserts.length, texts: T.length, blocks: Object.keys(d.blocks).length, titles: titles.map(function (t) { return t.s + "→" + (t.table ? t.table.key : "?"); }) }
  };
}

var api = { decode: decode, parse: parse, analyze: analyze, floorsOf: floorsOf, floorRank: floorRank, sysOf: sysOf, SYS_RULES: SYS_RULES, cnNum: cnNum };
if (typeof module === "object" && module.exports) module.exports = api;
else root.DXF = api;
})(typeof self !== "undefined" ? self : this);
