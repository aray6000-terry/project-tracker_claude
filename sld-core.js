/* 單線圖分析：從電氣單線圖（負載表）找出各配電盤／箱與迴路，判斷哪些負載要接中央監控、用 IO 還是通訊整合，
 * 並從電力幹線／電氣配佈平面圖找出盤體所在樓層，產生「盤體監控點編表」。純函式，可在 Web Worker 或 Node 執行。
 * 輸入：DXF.parse() 的 texts（{s,x,y,h}）。 */
(function (root) {
"use strict";
var DXF = root.DXF || (typeof require === "function" ? require("./dxf-core.js") : null);

function norm(s) { return String(s || "").replace(/%%[cC]/g, "φ").replace(/%%[oOuUdDpP]/g, "").replace(/\\P/g, " ").replace(/∮/g, "φ").replace(/\s+/g, " ").trim(); }
var CTRL = /^(MS|MC|T\.?M\.?|C\.?S\.?|PB|PL|ATS\w*|RCSW|M|SS|COS|OL|THR)$/;
var NOT_NAME = /^(MS|MC|PB|PL|GB|NB|KS|TM|CS|ELB|ELCB\w*|NFB\w*|MCCB|ATS\w*|CT\w*|DPM|APFR|SC|CU|BUS|PVC|EMT|SPARE|SPACE|TOTAL|M|N|E|R|S|T|NO|NC)$/;
var NAME_RE = /^[A-Z0-9][A-Za-z0-9\-]{0,14}$/;
/* 住戶（宅內）、表箱、充電車的單線圖：不屬中央監控範圍，只列出不計點 */
var UNIT_SHEET = /住宅|住戶|表箱|充電車/;

/* 負載 → 監控方式（依公司點位規則：只有 IO 整合的才佔 DI/DO；電表、消防、空調、電梯屬通訊整合） */
var LOAD_RULES = [
  { re: /SPARE|SPACE/, skip: "備用" },
  { re: /電容器|插座|充電|WIFI|WI-FI|變壓器|TR\./i, skip: "非監控負載" },
  { re: /泵|幫浦|PUMP/i, cat: "泵浦", di: 2, diL: ["運轉", "故障"] },
  { re: /風機|排風|送風|鼓風|排煙|進風|FAN/i, cat: "風機", di: 2, diL: ["運轉", "故障"] },
  { re: /發電機/, cat: "發電機", di: 2, diL: ["運轉", "故障"] },
  { re: /景觀\s*燈|梯\s*間\s*燈|燈\s*具\s*迴\s*路|照明迴路|公共照明|車道燈|路燈|庭園燈|投光燈|燈光/, cat: "燈光迴路", di: 1, do: 1, diL: ["狀態"], doL: ["控制"] },
  { re: /鐵捲門/, cat: "鐵捲門", di: 1, diL: ["門位"] },
  { re: /受信總機|火警|消防/, cat: "消防", comm: 1, proto: "消防主機通訊" },
  { re: /電梯|昇降機/, cat: "電梯", comm: 1, proto: "電梯通訊" },
  { re: /空調|冷氣|ACMP|AC主機/i, cat: "空調", comm: 1, proto: "空調通訊" },
  { re: /電表|電錶|KWH/i, cat: "電表", comm: 1, proto: "數位電表 MODBUS" }
];
/* 只有代號時（例：PEFB1、PS-1）的常見意義 */
var CODE_RULES = [
  [/^P?EF/i, "排風機"], [/^PS/i, "泵浦（污水／揚水）"], [/^WP|^SP/i, "泵浦"], [/^PF/i, "消防泵浦"], [/^AC/i, "空調"], [/^EL/i, "電梯"]
];

function classify(text) {
  for (var i = 0; i < LOAD_RULES.length; i++) if (LOAD_RULES[i].re.test(text)) return LOAD_RULES[i];
  return null;
}

function analyze(texts, opt) {
  opt = opt || {};
  var T = texts.map(function (t) { return { s: norm(t.s), x: t.x, y: t.y, h: t.h || 0 }; }).filter(function (t) { return t.s; });
  var warnings = [];
  /* 1. 單線圖圖紙（標題含「單線圖」） */
  var sheets = T.filter(function (t) { return /單線圖[一二三四五六七八九十\d]*$/.test(t.s) && t.s.length <= 30 && t.h >= 40 && !/~|～/.test(t.s); });
  var hmax = sheets.reduce(function (m, t) { return Math.max(m, t.h); }, 0);
  sheets = sheets.filter(function (t) { return t.h >= hmax * 0.8; });
  var sheetW = 9000, sheetH = 6400;
  function sheetOf(x, y) {
    for (var i = 0; i < sheets.length; i++) { var t = sheets[i]; if (x > t.x - sheetW && x < t.x + 700 && y > t.y - 400 && y < t.y + sheetH) return t; }
    return null;
  }
  /* 2. 盤名：「FROM "上游"」正下方 */
  var froms = T.filter(function (t) { return /^FROM\s*"/.test(t.s); });
  var names = [];
  froms.forEach(function (f) {
    var c = T.filter(function (t) { return Math.abs(t.y - (f.y - 173 * (f.h / 36 || 1))) < 30 && t.x < f.x + 60 && t.x > f.x - 1150 && NAME_RE.test(t.s) && !NOT_NAME.test(t.s); })
      .sort(function (a, b) { return (f.x - a.x) - (f.x - b.x); });
    if (c.length) names.push({ s: c[0].s, x: c[0].x, y: c[0].y, from: f.s.replace(/^FROM\s*"|"\s*$/g, "").trim() });
  });
  /* 3. 負載表（CKT NO. … TOTAL） */
  var ck = T.filter(function (t) { return /^CKT\s*NO\.?$/i.test(t.s); });
  var tot = T.filter(function (t) { return /^TOTAL$/i.test(t.s); });
  var panels = [];
  ck.forEach(function (c) {
    var hh = c.h || 30;
    if (tot.some(function (t) { return Math.abs(t.y - c.y) < hh * 0.6 && c.x - t.x > 0 && c.x - t.x < hh * 16; })) return;   /* 表格右側的欄名 */
    if (sheets.length && !sheetOf(c.x, c.y)) return;
    var end = tot.filter(function (t) { return Math.abs(t.y - c.y) < hh * 0.6 && t.x > c.x; }).sort(function (a, b) { return a.x - b.x; })[0];
    if (!end) return;
    var cols = T.filter(function (t) { return Math.abs(t.y - c.y) < hh * 0.6 && t.x > c.x && t.x < end.x && /^\d{1,3}$/.test(t.s); }).sort(function (a, b) { return a.x - b.x; });
    if (!cols.length) return;
    var nm = names.filter(function (n) { return Math.abs(n.x - c.x) < hh * 9 && n.y > c.y + hh * 10 && n.y < c.y + hh * 130; }).sort(function (a, b) { return a.y - b.y; })[0];
    if (!nm) {   /* 沒有 FROM 標示：取表格正上方的代號 */
      var alt = T.filter(function (t) { return t.y > c.y + hh * 20 && t.y < c.y + hh * 110 && Math.abs(t.x - c.x) < hh * 6 && NAME_RE.test(t.s) && !NOT_NAME.test(t.s) && !/^\d+$|AF$|AT$/.test(t.s); }).sort(function (a, b) { return a.y - b.y; })[0];
      if (alt) nm = { s: alt.s, from: "", x: alt.x, y: alt.y };
    }
    var top = nm ? nm.y : c.y + hh * 80;
    var sh = sheetOf(c.x, c.y);
    var meters = T.filter(function (t) { return /^KWH$/i.test(t.s) && t.x > c.x - hh * 30 && t.x < end.x && t.y > c.y && t.y < top; }).length;
    var circuits = cols.map(function (col) {
      var band = T.filter(function (t) { return Math.abs(t.x - col.x) < hh * 3 && t !== col && !/^FROM\s*"/.test(t.s); });
      var below = band.filter(function (t) { return t.y < c.y - hh * 9 && t.y > c.y - hh * 24 && !/^(LOAD NAME|CAPACITY|CURRENT)/.test(t.s); }).sort(function (a, b) { return b.y - a.y || a.x - b.x; })
        .map(function (t) { return t.s; }).filter(function (s) { return !/^[\d.]+$/.test(s); });
      var above = band.filter(function (t) { return t.y > c.y + hh && t.y < top - hh * 2; }).sort(function (a, b) { return b.y - a.y; }).map(function (t) { return t.s; });
      var ctrl = above.filter(function (s) { return CTRL.test(s); }).filter(function (s, i, a) { return a.indexOf(s) === i; });
      var desc = above.filter(function (s) { return /[一-鿿]/.test(s) && !/屬.*工程|不列入/.test(s); });
      return { no: +col.s, name: below.join(" ").replace(/\s+/g, " ").trim(), desc: desc.join(" "), ctrl: ctrl };
    }).sort(function (a, b) { return a.no - b.no; });
    var unit = !!(sh && UNIT_SHEET.test(sh.s)) || /集中電表|表箱/.test(nm ? nm.from : "");
    panels.push({ name: nm ? nm.s : "（未命名）", from: nm ? nm.from : "", sheet: sh ? sh.s : "", x: c.x, y: c.y, meters: meters, circuits: circuits, unit: unit });
  });
  /* 同名盤（同一盤畫在兩張圖）合併 */
  var byName = {};
  panels = panels.filter(function (p) {
    if (p.name === "（未命名）" || !byName[p.name]) { byName[p.name] = p; return true; }
    var q = byName[p.name]; q.circuits = q.circuits.concat(p.circuits); q.meters += p.meters; return false;
  });
  var panelNames = {}; panels.forEach(function (p) { panelNames[p.name] = 1; });
  /* 4. 盤體所在樓層：在電力幹線／電氣配佈平面圖上找盤名 */
  var plans = T.filter(function (t) { return /(電力幹線|電氣|動力|電燈)配佈平面圖$|(電力|電氣)平面圖$/.test(t.s) && t.h >= 40; });
  function floorOf(name) {
    var votes = {};
    T.forEach(function (t) {
      if (t.s !== name && t.s !== name + "盤" && t.s !== '"' + name + '"') return;
      var best = null, bd = Infinity;
      plans.forEach(function (pt) { var dx = t.x - pt.x, dy = t.y - pt.y; if (dx < -sheetW || dx > 800 || dy < -400 || dy > sheetH) return; var d = Math.abs(dx) + Math.abs(dy); if (d < bd) { bd = d; best = pt; } });
      if (!best) return;
      var key = best.s.replace(/(電力幹線|電氣|動力|電燈)?配佈平面圖$|(電力|電氣)平面圖$/, "");
      var fk = DXF ? DXF.floorsOf(key).join("~") : key;
      votes[fk] = (votes[fk] || 0) + (/電力幹線/.test(best.s) ? 3 : 1);
    });
    var ks = Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a]; });
    return ks[0] || "";
  }
  panels.forEach(function (p) { p.floor = p.name !== "（未命名）" ? floorOf(p.name) : ""; });
  /* 5. 迴路判斷 */
  var points = [], unknown = [];
  panels.forEach(function (p) {
    if (p.unit && !opt.includeUnits) return;
    if (p.meters) points.push({ panel: p.name, floor: p.floor, no: "", load: "盤內電表 ×" + p.meters, cat: "電表", method: "通訊", di: 0, do: 0, comm: p.meters, label: "數位電表 MODBUS" });
    p.circuits.forEach(function (c) {
      var text = (c.name + " " + c.desc).trim();
      var code = (c.name.match(/^[A-Z][A-Za-z0-9\-]{0,12}$/) || [])[0];
      if (code && panelNames[code]) { c.feeds = code; return; }   /* 分盤幹線：點位算在分盤 */
      var r = classify(text);
      if (!r && code) { for (var i = 0; i < CODE_RULES.length; i++) if (CODE_RULES[i][0].test(code)) { r = classify(CODE_RULES[i][1]); c.guess = CODE_RULES[i][1]; break; } }
      if (!r && c.ctrl.indexOf("M") >= 0) { unknown.push({ panel: p.name, floor: p.floor, no: c.no, load: text }); return; }
      var ctrlOn = c.ctrl.some(function (k) { return /^(MS|MC|T\.?M\.?|C\.?S\.?)$/.test(k); });
      if (r && !r.skip && /預留/.test(text) && !ctrlOn) { c.skip = "預留電源（無控制元件）"; return; }
      if (!r && /預留/.test(text)) { c.skip = "預留電源"; return; }
      if (!r || r.skip) { c.skip = r ? r.skip : ""; return; }
      if (r.cat === "燈光迴路" && !ctrlOn && !/景觀|梯\s*間|迴\s*路/.test(text)) { c.skip = "一般燈具出線口"; return; }
      var pt = { panel: p.name, floor: p.floor, no: c.no, load: text + (c.guess ? "（" + c.guess + "）" : ""), reserve: /預留/.test(text), cat: r.cat, method: r.comm ? "通訊" : "IO",
        di: r.di || 0, do: r.do || 0, comm: r.comm || 0, label: r.comm ? r.proto : [].concat((r.diL || []).map(function (x) { return "DI " + x; }), (r.doL || []).map(function (x) { return "DO " + x; })).join("、"), ctrl: c.ctrl.join(" ") };
      c.point = pt; points.push(pt);
    });
  });
  /* 6. 樓層／盤體彙總 */
  var byFloor = {}, byPanel = {};
  points.forEach(function (pt) {
    var f = pt.floor || "未定位", b = byFloor[f] = byFloor[f] || { floor: f, di: 0, do: 0, comm: 0, panels: {} };
    b.di += pt.di; b.do += pt.do; b.comm += pt.comm; b.panels[pt.panel] = 1;
    var q = byPanel[pt.panel] = byPanel[pt.panel] || { panel: pt.panel, floor: pt.floor, di: 0, do: 0, comm: 0, n: 0 };
    q.di += pt.di; q.do += pt.do; q.comm += pt.comm; q.n++;
  });
  if (!sheets.length) warnings.push("圖面中找不到標題含「單線圖」的圖紙，已分析全部負載表");
  if (!panels.length) warnings.push("讀不到負載表（需有「CKT NO.」與「TOTAL」欄）");
  var units = panels.filter(function (p) { return p.unit; }).length;
  if (units && !opt.includeUnits) warnings.push("住宅、表箱、充電車單線圖的 " + units + " 個盤不列入中央監控點位（只列出）");
  var noFloor = panels.filter(function (p) { return !p.floor && byPanel[p.name]; }).map(function (p) { return p.name; });
  if (noFloor.length) warnings.push("以下盤體在平面圖上找不到位置，請手動指定樓層：" + noFloor.join("、"));
  var rank = DXF ? DXF.floorRank : function () { return 0; };
  return {
    sheets: sheets.map(function (t) { return t.s; }),
    panels: panels.map(function (p) { return { name: p.name, from: p.from, floor: p.floor, sheet: p.sheet, meters: p.meters, unit: p.unit,
      circuits: p.circuits.map(function (c) { return { no: c.no, name: c.name, desc: c.desc, ctrl: c.ctrl, feeds: c.feeds || "", skip: c.skip || "", guess: c.guess || "", point: !!c.point }; }) }; }),
    points: points, unknown: unknown,
    byFloor: Object.keys(byFloor).sort(function (a, b) { return rank(a.split("~")[0]) - rank(b.split("~")[0]); }).map(function (k) { var b = byFloor[k]; return { floor: b.floor, di: b.di, do: b.do, comm: b.comm, panels: Object.keys(b.panels) }; }),
    byPanel: Object.keys(byPanel).map(function (k) { return byPanel[k]; }),
    totals: points.reduce(function (a, p) { a.di += p.di; a.do += p.do; a.comm += p.comm; return a; }, { di: 0, do: 0, comm: 0 }),
    warnings: warnings
  };
}

/** 轉成「設計・編表 → IO 模組表」的額外點位（extraIo）：同盤同類合併 */
function toExtraIo(res) {
  var m = {};
  res.points.forEach(function (p) {
    if (p.method !== "IO") return;
    var floor = (p.floor || "").split("~")[0]; if (!/^(B|R)?\d+F$|^RF$/.test(floor)) return;
    var nm = { 泵浦: "泵浦", 風機: "排風機", 發電機: "發電機", 燈光迴路: "公共區燈光迴路", 鐵捲門: "鐵捲門磁簧" }[p.cat] || p.cat;
    var k = floor + "|" + nm + "（" + p.panel + "）";
    m[k] = (m[k] || 0) + 1;
  });
  return Object.keys(m).map(function (k) { var a = k.split("|"); return { floor: a[0], name: "單線圖：" + a[1], n: m[k] }; });
}

var api = { analyze: analyze, toExtraIo: toExtraIo, LOAD_RULES: LOAD_RULES };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SLD = api;
})(typeof self !== "undefined" ? self : this);
