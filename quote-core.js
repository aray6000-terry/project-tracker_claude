/* 估價單解析與成本審查（公司標準估價單格式）。純函式，瀏覽器與 Node 測試共用。 */
(function (root) {
"use strict";
var CN = "一二三四五六七八九十";
function isCnNo(v) { return typeof v === "string" && /^[一二三四五六七八九十]{1,3}$/.test(v.trim()); }
function cnVal(s) { s = str(s); if (s === "十") return 10; var m = /^([一二三四五六七八九])?(十)?([一二三四五六七八九])?$/.exec(s); if (!m) return 0;
  return m[2] ? (m[1] ? CN.indexOf(m[1]) + 1 : 1) * 10 + (m[3] ? CN.indexOf(m[3]) + 1 : 0) : CN.indexOf(m[1] || m[3]) + 1; }
function itemNo(v) { if (typeof v === "number") return v; var t = str(v); return /^\d+([-.]\d+)*$/.test(t) ? t : null; }
function num(v) { if (typeof v === "number") return isFinite(v) ? v : null; if (typeof v === "string" && /^-?[\d,.]+$/.test(v.trim())) return Number(v.replace(/,/g, "")); return null; }
function str(v) { return v === null || v === undefined ? "" : String(v).trim(); }
function norm(s) { return str(s).replace(/\s+/g, ""); }

var SEC_RULES = [
  ["bms", /中央監控/], ["intercom", /對講/], ["cctv", /錄影|監視|攝影/], ["access", /門禁/], ["parking", /停車/],
  ["energy.meter", /能源/], ["media", /佈告|布告|多媒體/], ["visitor", /訪客/], ["air", /空氣/]
];
function secSys(name) { for (var i = 0; i < SEC_RULES.length; i++) if (SEC_RULES[i][1].test(name)) return SEC_RULES[i][0]; return "other"; }

/** sheets: [{name, rows}] → 估價單結構 */
function parse(sheets) {
  var sh = null, hr = -1, col = null;
  for (var s = 0; s < sheets.length && !sh; s++) {
    var rows = sheets[s].rows;
    for (var r = 0; r < Math.min(rows.length, 60); r++) {
      var row = rows[r] || [], c = {};
      row.forEach(function (v, i) {
        var t = norm(v);
        if (t === "項次") c.no = i;
        else if (/^(工程項目|品名|項目|品名規格)$/.test(t)) c.name = i;
        else if (t === "單位") c.unit = i;
        else if (t === "數量") c.qty = i;
        else if (t === "單價") c.price = i;
        else if (/^(合計|複價|金額)$/.test(t)) c.amount = i;
        else if (/^(備註|廠牌)$/.test(t)) c.note = i;
      });
      if (c.no !== undefined && c.name !== undefined && c.qty !== undefined && c.price !== undefined) { sh = sheets[s]; hr = r; col = c; break; }
    }
  }
  if (!sh) throw new Error("找不到估價單表頭（需有：項次、工程項目、單位、數量、單價）");
  if (col.amount === undefined) col.amount = col.price + 1;
  if (col.note === undefined) col.note = col.amount + 1;
  var o = col.note;
  col.margin = o + 1; col.cost = o + 2; col.costAmt = o + 3; col.brand = o + 4; col.wire = o + 5; col.pull = o + 7; col.install = o + 9;
  var rows = sh.rows, meta = {}, households = null;
  for (var r0 = 0; r0 < rows.length; r0++) (rows[r0] || []).forEach(function (v, i) {
    var t = str(v), m;
    if ((m = /業主名稱[：:]\s*(.*)/.exec(t))) meta.client = m[1].trim();
    if ((m = /案件名稱[：:]\s*(.*)/.exec(t))) meta.project = m[1].trim();
    if ((m = /日期[：:]\s*([\d\/.-]+)/.exec(t))) meta.date = m[1];
    if (/估價單|報價單/.test(t) && !meta.company) meta.company = t.replace(/工程?估價單|報價單/g, "").trim();
    if (/^戶數$/.test(norm(t))) { var hv = num((rows[r0] || [])[i + 1]); if (hv) households = hv; }
  });
  var summary = [], sections = [], cur = null, seenDetail = false;
  for (var r = hr + 1; r < rows.length; r++) {
    var row = rows[r] || [], no = row[col.no], name = str(row[col.name]), qty = num(row[col.qty]), unit = str(row[col.unit]);
    if (!name) continue;
    if (isCnNo(no)) {
      if (!seenDetail && qty !== null && unit) { summary.push({ no: str(no), name: name, price: num(row[col.amount]) || 0, cost: num(row[col.cost]) || 0, margin: num(row[col.margin]) }); continue; }
      if (seenDetail && cur && cnVal(no) <= cnVal(cur.no)) { cur.groups = (cur.groups || []).concat(name); continue; }   /* 子分項（例如 十二 之下的 一、二） */
      seenDetail = true;
      cur = { no: str(no), name: name, sys: secSys(name), items: [], subtotal: null };
      sections.push(cur); continue;
    }
    if (!cur) continue;
    if (/^小\s*計$/.test(name.replace(/\s/g, "")) || /小\s*計/.test(name) && no === null) { cur.subtotal = { price: num(row[col.amount]), cost: num(row[col.costAmt]) }; continue; }
    if (itemNo(no) === null) { if (cur.items.length) cur.items[cur.items.length - 1].spec = (cur.items[cur.items.length - 1].spec ? cur.items[cur.items.length - 1].spec + "\n" : "") + name; continue; }
    var price = num(row[col.price]), cost = num(row[col.cost]);
    var it = { no: itemNo(no), group: cur.groups ? cur.groups[cur.groups.length - 1] : "", name: name, unit: unit, qty: qty || 0, price: price || 0, amount: num(row[col.amount]) || (qty || 0) * (price || 0),
      brandSpec: str(row[col.note]), cost: cost || 0, costAmt: num(row[col.costAmt]) || (qty || 0) * (cost || 0), brand: str(row[col.brand]),
      wire: num(row[col.wire]) || 0, pull: num(row[col.pull]) || 0, install: num(row[col.install]) || 0, row: r + 1 };
    it.margin = it.amount ? (it.amount - it.costAmt) / it.amount : null;
    it.kind = /線材|五金|另料/.test(name) ? "material" : /工資|安裝$|施工|製作$|佈線$/.test(name) ? "labor" : /測試|調整|編寫|設計|設定|美工|教育訓練|申請|授權費?$|建檔/.test(name) ? "service" : "device";
    cur.items.push(it);
  }
  sections.forEach(function (s) {
    var p = 0, c = 0, w = 0, pu = 0, ins = 0;
    s.items.forEach(function (it) { p += it.amount; c += it.costAmt; if (it.kind === "device") { w += it.wire * it.qty; pu += it.pull * it.qty; ins += it.install * it.qty; } });
    s.itemPrice = p; s.itemCost = c;
    if (s.subtotal && s.subtotal.price) { s.price = s.subtotal.price; s.cost = s.subtotal.cost !== null ? s.subtotal.cost : c; } else { s.price = p; s.cost = c; }
    s.margin = s.price ? (s.price - s.cost) / s.price : null; s.wire = w; s.pullLabor = pu; s.installLabor = ins;
  });
  var tp = 0, tc = 0; sections.forEach(function (s) { tp += s.price; tc += s.cost; });
  return { meta: meta, households: households, sheet: sh.name, sections: sections, summary: summary,
    total: { price: tp, cost: tc, margin: tp ? (tp - tc) / tp : null, perHousehold: households ? tp / households : null } };
}

/* ---------- 名稱比對 ---------- */
var STOP = /(IP)?網路型|200萬畫素|彩色|專用|含[^)）]*|\(.*?\)|（.*?）|\s|系統|設備/g;
function key(s) { var t = str(s), pub = /公共/.test(t); t = t.replace(STOP, "").replace(/公共/g, ""); return { t: t, pub: pub }; }
function bigrams(s) { var a = {}; for (var i = 0; i < s.length - 1; i++) a[s.substr(i, 2)] = (a[s.substr(i, 2)] || 0) + 1; if (s.length === 1) a[s] = 1; return a; }
function dice(a, b) {
  var A = bigrams(a), B = bigrams(b), inter = 0, na = 0, nb = 0, k;
  for (k in A) { na += A[k]; if (B[k]) inter += Math.min(A[k], B[k]); }
  for (k in B) nb += B[k];
  return na + nb ? 2 * inter / (na + nb) : 0;
}
function similarity(x, y) {
  var a = key(x), b = key(y);
  if (!a.t || !b.t) return 0;
  var s = a.t === b.t ? 1 : dice(a.t, b.t);
  if (a.t.indexOf(b.t) >= 0 || b.t.indexOf(a.t) >= 0) s = Math.max(s, 0.75);
  var tail = function (x) { return x.length >= 4 ? x.slice(-4) : null; };   /* 主要名詞相同（例如「錄影主機」） */
  if (tail(a.t) && b.t.indexOf(tail(a.t)) >= 0 || tail(b.t) && a.t.indexOf(tail(b.t)) >= 0) s = Math.max(s, 0.62);
  if (a.pub !== b.pub) s *= 0.6;
  return s;
}
/** 預設對照：圖面名稱 → 估價單常見名稱（可由使用者確認後擴充） */
var ALIASES = [
  [/影視對講門口子機|住戶門口機/, /住戶門口機|門口子機/],
  [/智慧家庭自動化主機/, /室內對講主機/],
  [/感應式電子門鎖/, /電子門鎖|電子鎖/],
  [/室內型網路攝影機/, /紅外線攝影機|室內.*攝影機/],
  [/室外型網路攝影機/, /吊桿式攝影機|室外.*攝影機/],
  [/旋轉警示燈/, /閃光警示燈|警示燈/],
  [/LED紅綠燈/, /紅綠燈/],
  [/感應線圈/, /車道線圈/],
  [/陽極電鎖/, /陽極鎖/],
  [/緊急求救押扣/, /緊急求救壓扣|緊急求救押扣/],
  [/液位開關/, /液位偵測開關/], [/水箱蓋微動開關/, /水箱蓋偵測開關/], [/漏水感知器/, /漏水偵測器/], [/一氧化碳/, /一氧化碳/],
  [/求救對講感應讀卡機|緊急對講感應讀卡機/, /緊急對講機/],
  [/Smart ?Key讀卡機|感應式讀卡機/i, /門禁感應讀卡機/],
  [/電梯樓層管制感應讀卡機/, /電梯感應讀卡機/]
];
/** 圖面數量（dxf analyze 結果的 items）與估價單比對 */
function compareDrawing(items, quote, confirmed) {
  confirmed = confirmed || {};
  var all = [];
  quote.sections.forEach(function (s) { s.items.forEach(function (it) { if (it.kind === "device") all.push({ sec: s, it: it }); }); });
  var used = {};
  var out = items.filter(function (d) { return d.total > 0; }).map(function (d) {
    var best = null, bs = 0;
    if (confirmed[d.name]) { all.forEach(function (q) { if (q.sec.no + "-" + q.it.no === confirmed[d.name]) { best = q; bs = 1; } }); }
    if (!best && confirmed[d.name] !== "-") all.forEach(function (q) {
      var s = similarity(d.name, q.it.name);
      ALIASES.forEach(function (a) { if (a[0].test(d.name) && a[1].test(q.it.name)) s = Math.max(s, 0.8 * (/公共/.test(d.name) === /公共/.test(q.it.name) ? 1 : 0.6)); });
      if (s > bs) { bs = s; best = q; }
    });
    var row = { name: d.name, sys: d.sys, drawing: d.total, floors: d.floors };
    if (best && bs >= 0.5) {
      var k = best.sec.no + "-" + best.it.no;
      row.quote = { key: k, section: best.sec.name, name: best.it.name, qty: best.it.qty, row: best.it.row };
      row.score = Math.round(bs * 100) / 100;
      used[k] = (used[k] || 0) + d.total;
    }
    return row;
  });
  out.forEach(function (r) {
    if (!r.quote) { r.status = "missing"; return; }
    var sum = used[r.quote.key];   /* 多個圖面項目可能對到同一報價項（例如公共＋住戶） */
    r.shared = sum !== r.drawing;
    r.status = r.quote.qty === r.drawing || r.quote.qty === sum ? "ok" : (r.quote.qty < (r.shared ? sum : r.drawing) ? "short" : "over");
  });
  return out;
}

/** 成本審查 */
function review(q, opt) {
  opt = opt || {};
  var std = opt.standard || null, th = opt.thresholds || {};
  var itemMin = th.itemMin !== undefined ? th.itemMin : 0.25, secMin = th.secMin !== undefined ? th.secMin : 0.35, totalMin = th.totalMin !== undefined ? th.totalMin : 0.40;
  var issues = [];
  function add(level, where, msg, ref) { issues.push({ level: level, where: where, msg: msg, row: ref || null }); }
  var stdIdx = {};
  if (std) std.sections.forEach(function (s) { s.items.forEach(function (it) { stdIdx[norm(it.name)] = { it: it, sec: s }; }); });
  if (q.total.margin !== null && q.total.margin < totalMin) add("bad", "整案", "整案毛利 " + pct(q.total.margin) + "，低於標準 " + pct(totalMin));
  q.sections.forEach(function (s) {
    if (s.subtotal && s.subtotal.price && Math.abs(s.subtotal.price - s.itemPrice) > 1) add("warn", s.name, "小計 " + money(s.subtotal.price) + " 與明細加總 " + money(s.itemPrice) + " 不符，請檢查公式");
    if (s.margin !== null && s.margin < secMin) add("warn", s.name, "系統毛利 " + pct(s.margin) + "，低於標準 " + pct(secMin));
    s.items.forEach(function (it) {
      var w = s.name + "／" + it.name;
      if (it.amount > 0 && !it.cost && it.kind !== "service" && !/授權|編輯|建檔/.test(it.name)) add("warn", w, "沒有填成本", it.row);
      else if (it.margin !== null && it.amount > 0 && it.margin < itemMin) add("warn", w, "毛利 " + pct(it.margin) + "，低於 " + pct(itemMin), it.row);
      if (it.margin !== null && it.margin < 0) add("bad", w, "售價低於成本（虧損）", it.row);
      var sd = stdIdx[norm(it.name)];
      if (sd) {
        if (it.price && sd.it.price && it.price < sd.it.price * 0.97) add("warn", w, "單價 " + money(it.price) + " 低於範本 " + money(sd.it.price), it.row);
        if (it.cost && sd.it.cost && it.cost < sd.it.cost * 0.97) add("info", w, "成本 " + money(it.cost) + " 低於範本 " + money(sd.it.cost) + "，請確認是否低估", it.row);
        if (it.kind === "device" && sd.it.install && it.install < sd.it.install) add("info", w, "安裝工資 " + money(it.install) + " 低於範本 " + money(sd.it.install), it.row);
      }
    });
    if (std) {
      var ss = std.sections.filter(function (x) { return x.sys === s.sys && x.sys !== "other" || x.name === s.name; })[0];
      if (ss) ss.items.forEach(function (si) {
        if (si.kind !== "device") return;
        var has = s.items.some(function (it) { return norm(it.name) === norm(si.name) || similarity(it.name, si.name) > 0.8; });
        if (!has) add("info", s.name, "範本有「" + si.name + "」，這份估價單沒有，請確認是否漏列");
      });
    }
  });
  if (opt.devices) {
    var db = opt.devices;
    q.sections.forEach(function (s) { s.items.forEach(function (it) {
      if (it.kind !== "device" || !it.brand || !it.cost) return;
      var hit = db.filter(function (d) { return d.price && str(d.brand).toUpperCase().indexOf(it.brand.toUpperCase().slice(0, 4)) >= 0 && similarity(d.name, it.name) >= 0.7; });
      if (hit.length) { var mn = Math.min.apply(null, hit.map(function (d) { return d.price; }));
        if (it.cost < mn * 0.97) add("info", s.name + "／" + it.name, "成本 " + money(it.cost) + " 低於資料庫業務價 " + money(mn) + "（" + hit[0].model + "）", it.row); }
    }); });
  }
  var order = { bad: 0, warn: 1, info: 2 };
  issues.sort(function (a, b) { return order[a.level] - order[b.level]; });
  return issues;
}
function pct(x) { return (Math.round(x * 1000) / 10) + "%"; }
function money(n) { return "$" + Math.round(n).toLocaleString(); }


/* ---------- 設備型號對應（估價項目 ↔ 設備單價資料庫） ---------- */
var SHEET_OF = { bms: /中央監控/, access: /門禁|電子鎖/, intercom: /對講/, parking: /停管/, cctv: /攝影/, media: /多媒體/, visitor: /訪客/ };
function brandTokens(s) { return str(s).toUpperCase().split(/[.,、，\/\s]+|或同等品|同等品/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length >= 2; }); }
function brandHit(dbBrand, tokens) {
  var b = str(dbBrand).toUpperCase(); if (!b) return false;
  return tokens.some(function (t) { return b.indexOf(t) >= 0 || (t.length >= 4 && b.indexOf(t.slice(0, 4)) >= 0); });
}
function matchModels(quote, db, chosen) {
  chosen = chosen || {};
  var out = [];
  quote.sections.forEach(function (s) {
    s.items.forEach(function (it) {
      if (it.kind !== "device" || !it.qty) return;
      var key = s.no + "-" + it.no, actual = brandTokens(it.brand), spec = brandTokens(it.brandSpec);
      var sheetRe = SHEET_OF[s.sys];
      var cands = db.map(function (d) {
        var sim = similarity(it.name, d.name), sc = sim;
        if (sc < 0.45) return null;
        if (sheetRe && sheetRe.test(d.sheet)) sc += 0.08;
        var bh = actual.length ? brandHit(d.brand, actual) : false, bs = brandHit(d.brand, spec);
        if (bh) sc += 0.3; else if (bs) sc += 0.15;
        return { d: d, score: Math.round(sc * 100) / 100, sim: sim, brandOk: bh || bs, brandActual: bh };
      }).filter(Boolean).sort(function (a, b) { return b.score - a.score; }).slice(0, 5);
      var pick = chosen[key] || null, status;
      if (pick) status = pick.model === "-" ? "skip" : "chosen";
      else if (cands.length && cands[0].brandActual && cands[0].sim >= 0.75 && (!cands[1] || cands[1].score < cands[0].score - 0.05)) { pick = cands[0].d; status = "auto"; }
      else status = cands.length ? "suggest" : "none";
      out.push({ key: key, section: s.name, sys: s.sys, name: it.name, qty: it.qty, unit: it.unit, brand: it.brand, brandSpec: it.brandSpec, cost: it.cost, price: it.price, candidates: cands, pick: pick, status: status });
    });
  });
  return out;
}

var api = { matchModels: matchModels, parse: parse, review: review, compareDrawing: compareDrawing, similarity: similarity, secSys: secSys };
if (typeof module === "object" && module.exports) module.exports = api; else root.QUOTE = api;
})(typeof self !== "undefined" ? self : this);
