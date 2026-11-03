/* 自動生成報價單核心：依勾選的系統、廠牌、智慧建築版本，從報價範本庫挑出各系統的範本段落，
 * 再以圖面（DXF）數量帶入設備數量。純函式，瀏覽器與 Node 測試共用。 */
(function (root) {
"use strict";
var Q = root.QUOTE || (typeof require === "function" ? require("./quote-core.js") : null);

/* 報價系統（順序＝報價單項次順序）；re 用來判斷範本段落屬於哪個系統 */
var SYSTEMS = [
  { k: "bms", n: "中央監控系統", re: /中央監控|BA/, brands: ["CAMTI", "ADVANTECH 研華", "SIEMENS", "SONAS", "FATEK"] },
  { k: "intercom", n: "對講系統", re: /對講/, brands: ["VIA", "NOBEL", "SAMPO", "TSM", "KCA", "AIPHONE", "PANASONIC", "TONNET"] },
  { k: "cctv", n: "攝影系統", re: /錄影|監視|攝影|閉路/, brands: ["SAMPO", "HS", "AVTECH", "LI-LIN", "VIVOTEK", "Hikvision", "Dahua"] },
  { k: "access", n: "門禁系統", re: /門禁/, brands: ["SOYAL", "TSM", "Hundure 漢軍", "VITEC", "卓茂"] },
  { k: "mailbox", n: "電子信箱", re: /信箱/, brands: ["TSM", "IMDSP", "SOYAL", "VITEC"] },
  { k: "parking", n: "停車管理", re: /停車|車道/, brands: ["TSM", "VITEC", "Hikvision", "Dahua", "ZKTeco"] },
  { k: "network", n: "網路系統", re: /無線網路|資訊網路|網路系統工程|網路系統$/, brands: ["ZYXEL", "Cisco", "HPE Aruba", "D-Link", "TP-LINK", "SAMPO"] },
  { k: "media", n: "多媒體系統", re: /佈告|布告|多媒體/, brands: ["SAMSUNG", "LG", "SONY", "IMDSP"] },
  { k: "fiber", n: "光纖骨幹系統", re: /光纖/, brands: ["CommScope", "康寧 Corning", "LEVITON", "大同"] },
  { k: "visitor", n: "訪客系統", re: /訪客/, brands: ["TSM", "NOBEL", "SOYAL", "ZKTeco"] },
  { k: "ev", n: "汽車充電系統", re: /充電/, brands: ["CAMTI", "IMDSP", "Seculink", "台達電", "飛宏"] },
  { k: "energy", n: "能源管理系統", re: /能源管理/, brands: ["CAMTI", "ADVANTECH 研華", "士林電機", "中興電工"] },
  { k: "property", n: "物業／社區雲端管理", re: /物業|雲端管理|社區雲端/, brands: ["IMDSP", "TSM", "SOYAL"] },
  { k: "pbx", n: "電話交換機系統", re: /交換機/, brands: ["Panasonic", "Yeastar", "大同", "東訊 SAMPO"] },
  { k: "mobile", n: "行動強波系統", re: /強波/, brands: [] },
  { k: "lighting", n: "燈控系統", re: /燈控/, brands: ["Panasonic", "Lutron", "Philips"] },
  { k: "health", n: "健康照護系統", re: /健康照護/, brands: [] },
  { k: "site", n: "工地人員管理系統", re: /工地人員/, brands: [] }
];
var SYS_BY = {}; SYSTEMS.forEach(function (s) { SYS_BY[s.k] = s; });
var GRADES = ["合格級", "銅級", "銀級", "黃金級", "鑽石級"];
var BASE_NOTES = [
  "以上報價不含配管及聯接盒/聯接箱/單聯無孔蓋板設備及安裝費用",
  "不含機電/空調/消防設備提供中央監控所需監視及控制接點",
  "不含電梯承包商提供感應讀卡樓層管制接點",
  "不含住戶大門及公共門用埋入磁簧開關門扇開孔",
  "不含公共門用埋入陽極鎖門扇開孔",
  "不含大樓網路申請費用及電話"
];

function str(v) { return v === null || v === undefined ? "" : String(v).trim(); }
function classify(name) {
  var n = str(name);
  if (/對講/.test(n)) return "intercom";          /* 「IP網路型…對講」先判斷，避免歸到網路 */
  if (/信箱/.test(n)) return "mailbox";
  if (/光纖/.test(n)) return "fiber";
  if (/充電/.test(n)) return "ev";
  for (var i = 0; i < SYSTEMS.length; i++) if (SYSTEMS[i].re.test(n)) return SYSTEMS[i].k;
  return null;
}
/** 範本的智慧建築版本：2016、2024、smart（未標版本）、none */
function smartOf(q) {
  var t = [q.meta && q.meta.project, q.fileName].concat((q.meta && q.meta.notes) || []).join(" ");
  if (/2024/.test(t) && /智慧建築/.test(t)) return "2024";
  if (/2016/.test(t) && /智慧建築/.test(t)) return "2016";
  if (/智慧建築/.test(t)) return "smart";
  var any = (q.sections || []).some(function (s) { return /智慧建築/.test(s.name) || s.items.some(function (it) { return /智慧建築/.test(it.name); }); });
  return any ? "smart" : "none";
}
/** 範本庫中某系統可用的段落（排序：最符合智慧建築版本者優先） */
function candidates(lib, k, smart) {
  var out = [];
  (lib || []).forEach(function (t) {
    var secs = (t.data.sections || []).filter(function (s) { return classify(s.name) === k && s.items.length; });
    if (!secs.length) return;
    var ts = t.smart || smartOf(t.data), rank;
    if (smart === "none") rank = ts === "none" ? 0 : 2;
    else rank = ts === smart ? 0 : ts === "smart" ? 1 : ts === "none" ? 3 : 2;
    out.push({ id: t.id, tname: t.name, smart: ts, rank: rank, secs: secs, at: t.savedAt || "", n: secs.reduce(function (a, s) { return a + s.items.length; }, 0) });
  });
  out.sort(function (a, b) { return a.rank - b.rank || (b.at > a.at ? 1 : b.at < a.at ? -1 : 0) || b.n - a.n; });
  return out;
}

var LUMP = /^(式|套|批|組式|項)$/;
function isSmartItem(name) { return /智慧建築/.test(name); }
function stripSmart(name) { return str(name).replace(/\s*[（(]\s*(20(16|24))?\s*智慧建築[^)）]*[)）]/g, "").replace(/20(16|24)\s*智慧建築/g, "").replace(/智慧建築/g, "").replace(/\s{2,}/g, " ").trim(); }
function brandTokens(s) { return str(s).toUpperCase().split(/[.,、，\/\s]+/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length >= 2; }); }
function lumpOf(it) { return LUMP.test(str(it.unit)); }

/**
 * opt: { systems:[k], brands:{k:"廠牌"}, smart:"none"|"2016"|"2024", grade, sources:{k:"tid:secIdx"}, meta:{...}, drawing:[items], mapping }
 * lib: [{ id, name, smart, savedAt, data: 解析後的估價單 }]
 */
function build(opt, lib) {
  var smart = opt.smart || "none", secs = [], missing = [];
  var sel = SYSTEMS.filter(function (s) { return (opt.systems || []).indexOf(s.k) >= 0; });
  sel.forEach(function (S) {
    var cands = candidates(lib, S.k, smart), pick = null;
    if (opt.sources && opt.sources[S.k]) pick = cands.filter(function (c) { return c.id === opt.sources[S.k]; })[0] || null;
    if (!pick) pick = cands[0] || null;
    if (!pick) { missing.push(S.n); secs.push({ sys: S.k, name: S.n + "工程", source: null, options: [], items: [], empty: true }); return; }
    var brand = str((opt.brands || {})[S.k]);
    pick.secs.forEach(function (src) {
      /* 主要廠牌欄：段落中最常出現的廠牌清單 */
      var freq = {}; src.items.forEach(function (it) { var b = str(it.brandSpec); if (b && /[A-Za-z]/.test(b)) freq[b] = (freq[b] || 0) + 1; });
      var main = Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; })[0] || "", mainTok = brandTokens(main);
      var items = [];
      src.items.forEach(function (it) {
        if (smart === "none" && isSmartItem(it.name)) return;
        var nm = smart === "none" ? stripSmart(it.name) : it.name;
        var spec = str(it.brandSpec), b = spec;
        if (brand && it.kind === "device" && spec && brandTokens(spec).some(function (t) { return mainTok.indexOf(t) >= 0; })) b = brand;
        items.push({ name: nm, spec: it.spec || "", unit: it.unit, tqty: it.qty || 0, qty: it.qty || 0, price: it.price || 0, cost: it.cost || 0, brandSpec: b, kind: it.kind, flag: "" });
      });
      var name = src.name;
      if (smart === "none") name = stripSmart(name);
      else if (smart !== "smart") name = name.replace(/20(16|24)/g, smart);
      secs.push({ sys: S.k, name: name || S.n + "工程", source: { id: pick.id, tname: pick.tname, smart: pick.smart }, options: cands.map(function (c) { return { id: c.id, label: c.tname }; }), brand: brand, items: items });
    });
  });
  var q = finalize({ sections: secs, meta: opt.meta || {} });
  var unmatched = applyDrawing(q, opt.drawing || [], opt.mapping || {});
  scaleLumps(q);
  finalize(q);
  q.notes = notesFor(opt, lib);
  q.missing = missing; q.unmatched = unmatched; q.smart = smart; q.grade = opt.grade || "";
  return q;
}

/* ---------- 圖面項目 ↔ 範本項目 比對 ---------- */
var SYN = [[/防盜主機|保全主機|室內對講主機|室內機|影視對講主機|對講保全主機/g, "住戶主機"], [/門口子機|防盜子機|感應防盜子機|智慧型住戶門口機|住戶門口機/g, "門口子機"], [/線圈檢知器|線圈偵測器/g, "線圈控制器"], [/大門口機|門廳.*?門口機|大廳門口機/g, "大門口機"],
  [/押扣|壓扣/g, "按鈕"], [/閃光燈|警示燈|旋轉警示燈|閃光警示燈/g, "警示燈"], [/檢知器|偵測器|感知器|檢測器|偵測開關/g, "偵測"], [/電子鎖|電鎖|陽極鎖/g, "陽極鎖"],
  [/讀卡機|感應讀卡器|讀取器/g, "讀卡機"], [/攝影機|攝像機/g, "攝影機"], [/柵欄機|閘門機/g, "柵欄機"], [/E-?TAG/gi, "ETAG"], [/QR ?CODE/gi, "QR"], [/對講管理總機|櫃台對講|管理總機/g, "管理總機"]];
var FEAT = ["住戶主機", "門口子機", "大門口機", "管理總機", "緊急對講", "攝影機", "半球", "槍型", "吊桿", "室外", "室內", "電梯", "讀卡機", "陽極鎖", "開門按鈕", "按鈕", "磁簧", "緊急求救", "瓦斯", "遮斷",
  "液位", "油位", "水箱", "微動", "漏水", "一氧化碳", "柵欄機", "車道", "線圈", "紅綠燈", "警示燈", "ETAG", "車牌", "信箱", "QR", "樓層管制", "住戶", "公共", "偵測", "配電箱", "主機", "門鎖"];
function feats(name) {
  var t = str(name).replace(/\(預留管[路線]\)|（預留管[路線]）/g, "");
  SYN.forEach(function (r) { t = t.replace(r[0], r[1]); });
  var f = {}; FEAT.forEach(function (k) { if (t.indexOf(k) >= 0) f[k] = 1; });
  if (f["住戶主機"] || f["門口子機"]) f["住戶"] = 1;
  return { t: t, f: f };
}
function matchScore(d, q) {
  var a = feats(d), b = feats(q), ka = Object.keys(a.f), kb = Object.keys(b.f), inter = ka.filter(function (k) { return b.f[k]; });
  var jac = ka.length + kb.length ? inter.length / (ka.length + kb.length - inter.length) : 0;
  var core = ["住戶主機", "門口子機", "大門口機", "管理總機", "緊急對講", "攝影機", "讀卡機", "陽極鎖", "按鈕", "磁簧", "瓦斯", "液位", "油位", "水箱", "漏水", "一氧化碳", "柵欄機", "線圈", "紅綠燈", "警示燈", "ETAG", "信箱", "配電箱", "遮斷"];
  var coreA = core.filter(function (k) { return a.f[k]; }), coreHit = coreA.length && coreA.every(function (k) { return b.f[k]; });
  if (coreA.length && !coreHit) return 0;                        /* 主要名詞不同就不配對 */
  if ((a.f["公共"] && b.f["住戶"]) || (a.f["住戶"] && b.f["公共"])) return 0;
  if (["預埋盒", "電源", "變壓器", "控制器", "支架", "收納盒", "費用"].some(function (k) { return (a.t.indexOf(k) >= 0) !== (b.t.indexOf(k) >= 0); })) return 0;   /* 配件與主設備分開 */
  var s = Math.max(Q.similarity(a.t, b.t), 0.4 * (coreHit ? 1 : 0) + 0.6 * jac);
  return s;
}
var DSYS = { access: ["access", "intercom", "mailbox", "parking"], cctv: ["cctv"], intercom: ["intercom", "access"], bms: ["bms", "intercom", "access"], parking: ["parking"], visitor: ["visitor", "access"], media: ["media"] };
/** 以圖面數量帶入：比對到的設備用圖面數量；同段落中與它範本數量相同的配件（電源、預埋盒…）跟著調整 */
function applyDrawing(q, drawing, mapping) {
  var items = drawing.filter(function (d) { return d.total > 0; }), all = [];
  q.sections.forEach(function (s) { s.items.forEach(function (it) { if (it.kind === "device" && str(it.unit)) all.push({ s: s, it: it, got: 0, hit: false }); }); });
  var unmatched = [];
  items.forEach(function (d) {
    var key = mapping[d.name], best = null, bs = 0;
    if (key === "-") { unmatched.push({ name: d.name, sys: d.sys, qty: d.total, skipped: true }); return; }
    all.forEach(function (c) {
      if (key) { if (c.s.no + "-" + c.it.no === key || c.it.name === key) { best = c; bs = 9; } return; }
      var sc = matchScore(d.name, c.it.name);
      if (sc && c.s.sys === d.sys) sc += 0.08; else if (sc && DSYS[d.sys] && DSYS[d.sys].indexOf(c.s.sys) < 0) sc *= 0.7;
      if (sc > bs) { bs = sc; best = c; }
    });
    var need = Object.keys(feats(d.name).f).length ? 0.45 : 0.7;   /* 沒有可辨識主名詞的圖面項目要更相近才配對 */
    if (best && bs >= need) { best.got += d.total; best.hit = true; (best.from = best.from || []).push(d.name); }
    else unmatched.push({ name: d.name, sys: d.sys, qty: d.total });
  });
  q.sections.forEach(function (s) {
    var mine = all.filter(function (c) { return c.s === s; }), hits = mine.filter(function (c) { return c.hit; });
    mine.forEach(function (c) {
      var it = c.it;
      if (c.hit) { it.qty = c.got; it.flag = "圖面：" + c.from.join("、"); return; }
      if (lumpOf(it) || it.tqty <= 2) { it.flag = ""; return; }
      var acc = /電源|變壓器|預埋盒|固定架|收納盒|支架|APP|每戶/.test(it.name);
      var sib = (acc || it.tqty >= 20) ? hits.filter(function (h) { return h.it.tqty === it.tqty; })[0] : null;
      if (sib) { it.qty = sib.it.qty; it.flag = "比照「" + sib.it.name + "」"; return; }
      it.flag = "範本數量，請依本案確認";
    });
  });
  return unmatched;
}
/* 以長度計價的線材、管材（「1/2"同軸電纜 米」）：圖面沒有長度，依設備規模估算 */
var LENGTH_UNIT = /^(米|M|m|公尺|捲|卷|箱|條|尺)$/;
var LENGTH_NAME = /電纜|纜線|線材|網路線|光纖|同軸|控制線|電源線|訊號線|CAT\.?\s*\d|配管|線槽|EMT|PVC/i;
/* 不隨規模變動的固定費用 */
var FIXED_FEE = /授權|申請|教育訓練|設計費|美工|建檔|保固|運費|管理費/;
var ACCESSORY = /接頭|夾具|吊架|固定架|支架|伸縮架|端子|標示/;
/** 線材、工資、設定測試等項目：依設備數量相對範本的比例調整（以圖面對到的設備計；上限 10 倍，超過 3 倍時提示）。
    用數量而不用金額：一台高價主機會讓金額比例失真（耕薪行動強波以數量估算，線長、工資與實際報價差 5% 內） */
function scaleLumps(q) {
  q.sections.forEach(function (s) {
    var t = 0, n = 0;
    s.items.forEach(function (it) { if (it.kind === "device" && !isLength(it) && /^圖面/.test(it.flag || "")) { t += it.tqty; n += it.qty; } });
    if (!t) s.items.forEach(function (it) { if (it.kind === "device" && !isLength(it)) { t += it.tqty * it.price; n += it.qty * it.price; } });
    if (!t) return;
    var raw = n / t, r = Math.max(0.1, Math.min(10, raw));
    if (Math.abs(r - 1) < 0.02) return;
    var tag = "（×" + (Math.round(r * 100) / 100) + (raw > 10 ? "，已達上限" : "") + "）";
    s.items.forEach(function (it) {
      if (FIXED_FEE.test(it.name)) return;
      if ((it.kind === "material" || it.kind === "labor" || it.kind === "service") && lumpOf(it) && it.qty === 1 && it.price) {
        it.price = Math.round(it.price * r / 100) * 100; it.cost = Math.round(it.cost * r / 100) * 100;
        it.flag = "依設備規模比例調整" + tag;
      } else if (isLength(it) && !/^圖面/.test(it.flag || "") && it.tqty) {
        it.qty = Math.max(1, Math.round(it.tqty * r));
        it.flag = "長度依設備規模估算" + tag + "，請依圖面計算";
      } else if (it.kind === "device" && ACCESSORY.test(it.name) && !/^圖面/.test(it.flag || "") && it.tqty > 2) {
        it.qty = Math.max(1, Math.round(it.tqty * r));
        it.flag = "配件依設備規模估算" + tag;
      }
    });
    if (r > 3) s.scaleNote = "本系統設備數量為範本的 " + (Math.round(raw * 10) / 10) + " 倍，線材、工資、設定測試已依比例放大" + (raw > 10 ? "（以 10 倍計）" : "") + "，請依本案複核";
  });
}
function isLength(it) { return LENGTH_UNIT.test(str(it.unit)) && (LENGTH_NAME.test(it.name) || it.kind === "material"); }
function notesFor(opt, lib) {
  var notes = null;
  (lib || []).forEach(function (t) { var n = t.data.meta && t.data.meta.notes; if (n && n.length && (!notes || n.length > notes.length)) notes = n; });
  notes = (notes || BASE_NOTES).filter(function (n) { return !/智慧建築/.test(n); });
  if (opt.smart && opt.smart !== "none") notes = notes.concat(["本案智慧建築適用" + (opt.smart === "smart" ? "" : opt.smart + "年") + "版，並須配合業主及智慧建築顧問公司取得智慧建築" + (opt.grade || "") + "候選及正式標章證書"]);
  return notes;
}
var CN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
function cnNo(n) { return n <= 10 ? CN[n] : n < 20 ? "十" + CN[n - 10] : CN[Math.floor(n / 10)] + "十" + CN[n % 10]; }
/** 重新編號、計算金額（結構與 QUOTE.parse 相同，可直接存成本案估價單） */
function finalize(q) {
  var tp = 0, tc = 0, i = 0;
  q.sections.forEach(function (s) {
    i++; s.no = cnNo(i);
    var p = 0, c = 0;
    s.items.forEach(function (it, j) {
      it.no = j + 1; it.qty = Number(it.qty) || 0; it.price = Number(it.price) || 0; it.cost = Number(it.cost) || 0;
      it.amount = it.qty * it.price; it.costAmt = it.qty * it.cost; it.margin = it.amount ? (it.amount - it.costAmt) / it.amount : null;
      it.brand = it.brand || "";
      if (it.model === undefined) { var mm = /型號\s*[:：]?\s*([A-Za-z0-9][\w\-\/.()]*)/.exec(String(it.spec || "") + " " + String(it.brandSpec || "")); it.model = mm ? mm[1] : ""; } it.wire = it.wire || 0; it.pull = it.pull || 0; it.install = it.install || 0; it.row = null;
      p += it.amount; c += it.costAmt;
    });
    s.itemPrice = p; s.itemCost = c; s.price = p; s.cost = c; s.margin = p ? (p - c) / p : null; s.subtotal = { price: p, cost: c };
    tp += p; tc += c;
  });
  q.summary = q.sections.map(function (s) { return { no: s.no, name: s.name, price: s.price, cost: s.cost, margin: s.margin }; });
  q.total = { price: tp, cost: tc, margin: tp ? (tp - tc) / tp : null, tax: Math.round(tp * 0.05), gross: tp + Math.round(tp * 0.05), perHousehold: null };
  return q;
}

/* ---------- 匯出 Excel（公司報價單格式）；internal=true 時加上毛利率、成本欄（欄位與估價單解析相容） ---------- */
function toSheets(q, opt) {
  opt = opt || {};
  var m = q.meta || {}, internal = !!opt.internal, W = internal ? 11 : 7, last = internal ? "K" : "G";
  var noteOf = function (it) { var b = it.brandSpec || ""; return it.model ? b + (b ? "\n" : "") + "型號：" + it.model : b; };
  var rows = [], merges = [];
  function push(r) { rows.push(r); return rows.length; }
  push([{ v: (m.company || "") + "報價單", s: 1 }]); merges.push("A1:" + last + "1");
  push([{ v: "業主：" + (m.client || ""), s: 11 }, "", "", "", { v: (m.tel ? "電話：" + m.tel + "　" : "") + "日期：" + (m.date || ""), s: 11 }]); merges.push("A2:D2", "E2:" + last + "2");
  push([{ v: "案件名稱：" + (m.project || ""), s: 11 }, "", "", "", { v: (m.fax ? "傳真：" + m.fax + "　" : "") + (m.contact ? "承辦人：" + m.contact : ""), s: 11 }]); merges.push("A3:D3", "E3:" + last + "3");
  var head = ["項次", "名　　稱", "單位", "數量", "單　價", "複　價", "備　　註"].concat(internal ? ["毛利率", "成本單價", "成本複價", "毛　利"] : []);
  push(head.map(function (h) { return { v: h, s: 2 }; }));
  var sumStart = rows.length + 1, sumRows = [];
  q.sections.forEach(function (sec) { sumRows.push(push([{ v: sec.no, s: 9 }, { v: sec.name, s: 3 }, { v: "式", s: 9 }, { v: 1, s: 12 }, { v: sec.price, s: 4 }, { v: sec.price, s: 4, f: "D{r}*E{r}" }, { v: "", s: 3 }].concat(internal ? [{ v: sec.margin, s: 8 }, { v: sec.cost, s: 4 }, { v: sec.cost, s: 4 }, { v: sec.price - sec.cost, s: 4, f: "F{r}-J{r}" }] : []))); });
  var sumEnd = rows.length;
  var tRow = push(["", { v: "合　　計", s: 5 }, "", "", "", { v: q.total.price, s: 6, f: "SUM(F" + sumStart + ":F" + sumEnd + ")" }]
    .concat(internal ? ["", { v: q.total.margin, s: 8, f: "IF(F{r}=0,\"\",(F{r}-J{r})/F{r})" }, "", { v: q.total.cost, s: 6, f: "SUM(J" + sumStart + ":J" + sumEnd + ")" }, { v: q.total.price - q.total.cost, s: 6, f: "F{r}-J{r}" }] : []));
  var xRow = push(["", { v: "稅金（5%）", s: 5 }, "", "", "", { v: q.total.tax, s: 6, f: "ROUND(F" + tRow + "*0.05,0)" }]);
  push(["", { v: "總　　計", s: 5 }, "", "", "", { v: q.total.gross, s: 6, f: "F" + tRow + "+F" + xRow }]);
  push([]);
  (q.notes || []).forEach(function (n, i) { var r = push([{ v: i ? "" : "註：", s: 11 }, { v: (i + 1) + "." + n, s: 7 }]); merges.push("B" + r + ":" + last + r); });
  push([]);
  q.sections.forEach(function (sec, si) {
    push([{ v: sec.no, s: 5 }, { v: sec.name + (sec.brand ? "（廠牌：" + sec.brand + "）" : ""), s: 5 }, { v: "", s: 3 }, { v: "", s: 3 }, { v: "", s: 3 }, { v: "", s: 3 }, { v: "", s: 3 }].concat(internal ? [{ v: "", s: 3 }, { v: "", s: 3 }, { v: "", s: 3 }, { v: "", s: 3 }] : []));
    var a = rows.length + 1;
    sec.items.forEach(function (it) {
      var nm = it.name + (it.spec ? "\n" + it.spec : "");
      push([{ v: it.no, s: 9 }, { v: nm, s: 3 }, { v: it.unit || "", s: 9 }, { v: it.qty, s: 12 }, { v: it.price || "", s: 4 }, { v: it.amount, s: 4, f: "D{r}*E{r}" }, { v: noteOf(it), s: 3 }]
        .concat(internal ? [{ v: it.margin, s: 8, f: "IF(F{r}=0,\"\",(F{r}-J{r})/F{r})" }, { v: it.cost || "", s: 4 }, { v: it.costAmt, s: 4, f: "D{r}*I{r}" }, { v: it.amount - it.costAmt, s: 4, f: "F{r}-J{r}" }] : []));
    });
    var b = rows.length;
    var st = push(["", { v: "小　　計", s: 5 }, { v: "", s: 3 }, { v: "", s: 3 }, { v: "", s: 3 }, { v: sec.price, s: 6, f: "SUM(F" + a + ":F" + b + ")" }, { v: "", s: 3 }]
      .concat(internal ? [{ v: sec.margin, s: 8, f: "IF(F{r}=0,\"\",(F{r}-J{r})/F{r})" }, { v: "", s: 3 }, { v: sec.cost, s: 6, f: "SUM(J" + a + ":J" + b + ")" }, { v: sec.price - sec.cost, s: 6, f: "F{r}-J{r}" }] : []));
    rows[sumRows[si] - 1][4] = { v: sec.price, s: 4, f: "F" + st };
    if (internal) { rows[sumRows[si] - 1][8] = { v: sec.cost, s: 4, f: "J" + st }; rows[sumRows[si] - 1][9] = { v: sec.cost, s: 4, f: "D{r}*I{r}" }; rows[sumRows[si] - 1][7] = { v: sec.margin, s: 8, f: "IF(F{r}=0,\"\",(F{r}-J{r})/F{r})" }; }
    push([]);
  });
  rows.forEach(function (r, i) { r.forEach(function (c) { if (c && typeof c === "object" && c.f) c.f = c.f.replace(/\{r\}/g, i + 1); }); });
  return [{ name: internal ? "報價單（內部成本）" : "報價單", cols: [6, 46, 6, 8, 12, 14, 30].concat(internal ? [9, 12, 14, 14] : []), rows: rows, merges: merges, freeze: 4 }];
}

/* ---------- 依成本與利潤率訂價 ----------
   mode "margin"（毛利率，預設）：售價＝成本 ÷ (1 − 利潤率)；mode "markup"（加成率）：售價＝成本 × (1 + 利潤率)
   售價 1,000 以上取整到 10 元，以下取整到 1 元。沒有成本的項目不動。 */
function roundPrice(p) { return p >= 1000 ? Math.round(p / 10) * 10 : Math.round(p); }
function priceFromCost(cost, pct, mode) {
  cost = Number(cost) || 0; pct = Number(pct);
  if (!(cost >= 1) || !isFinite(pct)) return null;   /* 成本小於 1 元多半是範本裡的比率欄，不當成本 */
  if (mode === "markup") return pct < -99 ? null : roundPrice(cost * (1 + pct / 100));
  return pct >= 100 || pct <= -100 ? null : roundPrice(cost / (1 - pct / 100));
}
function profitOf(it, mode) {
  var c = Number(it.cost) || 0, p = Number(it.price) || 0;
  if (!(c >= 1) || !(p > 0)) return null;
  return mode === "markup" ? (p - c) / c * 100 : (p - c) / p * 100;
}
/** 套用利潤率：secIdx 省略＝全部系統；回傳改了幾項 */
function applyProfit(q, pct, mode, secIdx) {
  var n = 0;
  q.sections.forEach(function (s, i) {
    if (secIdx !== undefined && secIdx !== null && i !== secIdx) return;
    s.profitPct = pct;
    s.items.forEach(function (it) { var p = priceFromCost(it.cost, pct, mode); if (p !== null) { it.price = p; it.profitPct = pct; n++; } });
  });
  finalize(q);
  return n;
}
var api = { priceFromCost: priceFromCost, profitOf: profitOf, applyProfit: applyProfit, toSheets: toSheets, matchScore: matchScore, SYSTEMS: SYSTEMS, GRADES: GRADES, classify: classify, smartOf: smartOf, candidates: candidates, build: build, finalize: finalize, stripSmart: stripSmart };
if (typeof module === "object" && module.exports) module.exports = api; else root.QUOTEGEN = api;
})(typeof self !== "undefined" ? self : this);
