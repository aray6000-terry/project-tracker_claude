/* 弱電專案平台 — 合約內容辨識（瀏覽器端，純文字規則）
 * 從合約全文找出：合約編號、合約金額（含阿拉伯數字與國字大寫）、簽約日、付款方式、請款期別與比例、保留款、保固、工期。
 * 結果一律交給使用者確認後才儲存；辨識不到的欄位留空。 */
(function (root) {
"use strict";
function str(v) { return v === null || v === undefined ? "" : String(v); }
var CN_DIG = { "零": 0, "〇": 0, "○": 0, "壹": 1, "一": 1, "貳": 2, "贰": 2, "二": 2, "兩": 2, "參": 3, "叁": 3, "三": 3, "肆": 4, "四": 4, "伍": 5, "五": 5, "陸": 6, "六": 6, "柒": 7, "七": 7, "捌": 8, "八": 8, "玖": 9, "九": 9 };
var CN_UNIT = { "拾": 10, "十": 10, "佰": 100, "百": 100, "仟": 1000, "千": 1000 };
var CN_BIG = { "萬": 1e4, "万": 1e4, "億": 1e8, "亿": 1e8 };
/** 國字數字（壹仟貳佰參拾萬元整、百分之三十）→ 數字；無法解析回傳 null */
function cnNum(s) {
  s = str(s).replace(/[元圓正整\s]/g, "");
  if (!s) return null;
  var total = 0, section = 0, digit = null, any = false;
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (CN_DIG[ch] !== undefined) { digit = CN_DIG[ch]; any = true; }
    else if (CN_UNIT[ch]) { section += (digit === null ? 1 : digit) * CN_UNIT[ch]; digit = null; any = true; }
    else if (CN_BIG[ch]) { section += digit || 0; total += section * CN_BIG[ch]; section = 0; digit = null; any = true; }
    else if (/\d/.test(ch)) { var m = /^\d+/.exec(s.slice(i)); digit = +m[0]; i += m[0].length - 1; any = true; }
    else return null;
  }
  return any ? total + section + (digit || 0) : null;
}
function money(s) { var n = Number(str(s).replace(/[,，\s]/g, "")); return isFinite(n) ? n : null; }
function rocDate(y, m, d) {
  y = +y; if (y < 1911) y += 1911;
  if (!(y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return "";
  return y + "-" + ("0" + m).slice(-2) + "-" + ("0" + d).slice(-2);
}
/* 全形轉半形、統一標點，方便比對 */
function normalize(t) {
  return str(t).replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/　/g, " ").replace(/[ \t]+/g, " ").replace(/\r/g, "");
}
var TRIGGERS = [
  [0, /簽約|訂金|定金|預付|簽訂|簽定|訂約|立約|合約成立|契約成立|開立訂單/],
  [1, /進場|開工|材料.{0,4}(進場|到場|到貨)|設備.{0,4}(進場|到貨|到場|到廠)/],
  [2, /配管|預埋|上樑|結構/],
  [3, /佈線|穿線|拉線|配線|消防/],
  [4, /使照|使用執照/],
  [5, /安裝完成|完工|測試|試車|機櫃/],
  [6, /驗收|交屋|點交|移交/],
  [7, /保固|保留款|尾款|保證金/]
];
function triggerOf(t) { for (var i = TRIGGERS.length - 1; i >= 0; i--) if (TRIGGERS[i][1].test(t)) return TRIGGERS[i][0]; return -1; }
var TERM_NAMES = [[/保留款|保固金|尾款/, "尾款／保留款"], [/驗收|交屋|點交/, "驗收款"], [/完工|安裝完成|測試/, "完工款"], [/佈線|穿線|配線/, "佈線款"], [/配管|預埋/, "配管款"],
  [/進場|到貨|到場|材料/, "設備進場款"], [/開工/, "開工款"], [/簽約|簽訂|簽定|訂約|立約|訂金|定金|預付/, "簽約訂金"]];
function termName(t, i) {
  var m = /第\s*([一二三四五六七八九十\d]+)\s*期/.exec(t);
  for (var k = 0; k < TERM_NAMES.length; k++) if (TERM_NAMES[k][0].test(t)) return (m ? "第" + m[1] + "期 " : "") + TERM_NAMES[k][1];
  return m ? "第" + m[1] + "期" : "第" + (i + 1) + "期";
}
/** 找出付款／請款章節（關鍵字附近的一段文字） */
function paySection(lines) {
  var idx = [];
  lines.forEach(function (l, i) { if (/付款|計價|請款|給付|撥付|支付/.test(l)) idx.push(i); });
  if (!idx.length) return [];
  var out = [], seen = {};
  idx.forEach(function (i) { for (var j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 14); j++) if (!seen[j]) { seen[j] = 1; out.push({ i: j, t: lines[j] }); } });
  return out;
}
var PCT_RE = /(\d{1,3}(?:\.\d+)?)\s*[%％]|百分之\s*([零〇一二三四五六七八九十百\d.]+)|([一二三四五六七八九])\s*成(?![本品績立])/g;
function pctsIn(t) {
  var out = [], m; PCT_RE.lastIndex = 0;
  while ((m = PCT_RE.exec(t))) {
    var v = m[1] ? +m[1] : m[2] ? (/^\d/.test(m[2]) ? +m[2] : cnNum(m[2])) : cnNum(m[3]) * 10;
    if (v > 0 && v <= 100) out.push({ v: v, at: m.index });
  }
  return out;
}
/** 把付款章節拆成期別：每個百分比一期，條件取該句 */
function parseTerms(lines) {
  var sec = paySection(lines), terms = [];
  sec.forEach(function (x) {
    if (/稅|罰|違約|逾期|利息|遲延|保險|履約保證|押標/.test(x.t) && !/期|款/.test(x.t)) return;
    var ps = pctsIn(x.t);
    if (!ps.length) return;
    /* 一行多個百分比時，用 ；，、 切開各自成一期 */
    var parts = ps.length > 1 ? x.t.split(/[；;。]|[，,](?=[^，,]*?(?:\d{1,3}\s*[%％]|百分之|[一二三四五六七八九]\s*成))/).filter(function (s) { return pctsIn(s).length; }) : [x.t];
    parts.forEach(function (seg) {
      var p = pctsIn(seg)[0]; if (!p) return;
      if (/稅|違約|罰|逾期|利息/.test(seg) && !/期|款|付/.test(seg)) return;
      var cond = seg.replace(/^\s*[\(（]?[一二三四五六七八九十\d]+[\)）、.]\s*/, "").trim();
      terms.push({ name: termName(seg, terms.length), pct: p.v, amount: 0, cond: cond.slice(0, 160), trigger: triggerOf(seg) });
    });
  });
  /* 重複的句子（同條件同比例）只留一次 */
  var seen = {}; terms = terms.filter(function (t) { var k = t.pct + "|" + t.cond; if (seen[k]) return false; seen[k] = 1; return true; });
  /* 總和超過 100% 時，可能混入其他百分比（如稅率、罰則），只取加總最接近 100 的連續段 */
  var sum = terms.reduce(function (s, t) { return s + t.pct; }, 0);
  if (sum > 100.5 && terms.length > 1) {
    var best = null;
    for (var a = 0; a < terms.length; a++) { var s = 0; for (var b = a; b < terms.length; b++) { s += terms[b].pct; if (Math.abs(s - 100) < 0.51) { if (!best || b - a > best[1] - best[0]) best = [a, b]; } } }
    if (best) terms = terms.slice(best[0], best[1] + 1);
  }
  return terms;
}
function first(re, text, f) { var m = re.exec(text); return m ? (f ? f(m) : m[1]) : ""; }
function parse(raw) {
  var text = normalize(raw), lines = text.split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean), flat = lines.join("\n");
  var out = { contractNo: "", title: "", party: "", signDate: "", amount: 0, amountTaxIncl: false, tax: 0, payMethod: "", retentionPct: 0, warranty: "", period: "", penalty: "", terms: [], warnings: [] };
  out.contractNo = first(/(?:合約|契約|工程)\s*編\s*號\s*[:：]?\s*([A-Za-z0-9\-_\/()（）]{3,40})/, flat);
  out.title = first(/(?:工程|合約|契約)\s*名\s*稱\s*[:：]\s*([^\n]{2,60})/, flat) || first(/^([^\n]{4,40}(?:工程)?(?:合約書|契約書|承攬合約))\s*$/m, flat);
  out.party = first(/(?:甲\s*方|定作人|業\s*主)\s*[:：]\s*([^\n，,（(]{2,40})/, flat);
  /* 金額：先找阿拉伯數字，再找國字大寫 */
  var am = /(?:總\s*價|總\s*金\s*額|合\s*約\s*(?:總)?\s*(?:價|金額)|契\s*約\s*(?:總)?\s*(?:價|金額)|承\s*攬\s*(?:總)?\s*(?:價|金額)|工\s*程\s*(?:總)?\s*(?:價|款|金額))[^\n\d]{0,30}?(?:NT\$|NTD|新[臺台]幣|\$)?\s*([\d,，]{4,})\s*元?/.exec(flat);
  if (am) out.amount = money(am[1]) || 0;
  var cn = /新[臺台]幣\s*([零〇壹貳參叁肆伍陸柒捌玖拾佰仟萬億一二三四五六七八九十百千]{2,})\s*元/.exec(flat);
  if (cn) { var v = cnNum(cn[1]); if (v && (!out.amount || Math.abs(v - out.amount) / Math.max(v, 1) > 0.001)) { if (!out.amount) out.amount = v; else out.warnings.push("國字金額 " + v.toLocaleString() + " 與數字金額 " + out.amount.toLocaleString() + " 不同，請確認"); } }
  if (out.amount) {
    var ctx = flat.slice(Math.max(0, (am ? am.index : cn.index) - 40), (am ? am.index : cn.index) + 120);
    out.amountTaxIncl = /含\s*(?:\d+\s*[%％]\s*)?(?:營業)?稅|稅\s*內\s*含|稅金在內/.test(ctx) && !/未\s*稅|不\s*含\s*稅|稅\s*外\s*加/.test(ctx);
  }
  var tx = /(?:營業)?稅\s*(?:額|金)\s*[:：]?\s*(?:NT\$|新[臺台]幣)?\s*([\d,]{3,})/.exec(flat); if (tx) out.tax = money(tx[1]) || 0;
  /* 簽約日：中華民國 115 年 1 月 2 日／2026-01-02 */
  var d1 = /中\s*華\s*民\s*國\s*(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g, m, last = null;
  while ((m = d1.exec(flat))) last = m;   /* 合約末尾的立約日期通常是最後一個 */
  if (last) out.signDate = rocDate(last[1], +last[2], +last[3]);
  if (!out.signDate) { var d2 = /(?:簽約|立約|訂約)[^\n]{0,10}?(\d{4})[.\/\-年](\d{1,2})[.\/\-月](\d{1,2})/.exec(flat); if (d2) out.signDate = rocDate(d2[1], +d2[2], +d2[3]); }
  out.retentionPct = +first(/保\s*留\s*款[^\n%％]{0,30}?(\d{1,2}(?:\.\d+)?)\s*[%％]/, flat) || +first(/(\d{1,2}(?:\.\d+)?)\s*[%％]\s*(?:為|作為|列為|做為)?\s*保\s*留\s*款/, flat) || 0;
  out.warranty = first(/保\s*固\s*(?:期\s*(?:間|限)?)?[^\n\d一二三四五六七八九十]{0,12}((?:\d+|[一二三四五六七八九十]+)\s*(?:年|個月|月))/, flat);
  out.period = first(/工\s*期[^\n\d]{0,12}((?:\d+|[一二三四五六七八九十百]+)\s*(?:個)?(?:日曆天|工作天|天|個月|月))/, flat);
  out.penalty = first(/(逾期[^\n。]{0,60}(?:千分之|萬分之|[%％])[^\n。]{0,30})/, flat);
  var pm = /(?:付款|支付|給付)\s*方\s*式\s*[:：]?\s*([^\n]{2,80})/.exec(flat) || /((?:現金|匯款|即期支票|支票|期票)[^\n]{0,40}(?:\d+\s*天)?)/.exec(flat);
  if (pm) out.payMethod = pm[1].trim();
  out.terms = parseTerms(lines);
  out.terms.forEach(function (t) { if (out.amount) t.amount = Math.round(out.amount * t.pct / 100); });
  var sum = out.terms.reduce(function (s, t) { return s + t.pct; }, 0);
  if (out.terms.length && Math.abs(sum - 100) > 0.5) out.warnings.push("請款比例合計 " + (Math.round(sum * 100) / 100) + "%，不是 100%，請確認");
  if (!out.terms.length) out.warnings.push("找不到請款比例，請手動填寫期別");
  if (!out.amount) out.warnings.push("找不到合約金額");
  out.textLength = text.length;
  return out;
}

/* ---------- 取出全文 ---------- */
function docxText(buf) {
  var Z = root.XLSX_LITE; if (!Z) return Promise.reject(new Error("缺少 ZIP 元件"));
  var files = Z.unzip(buf), f = files["word/document.xml"];
  if (!f) return Promise.reject(new Error("不是有效的 Word（.docx）檔"));
  return f().then(function (u) {
    var xml = new TextDecoder("utf-8").decode(u);
    xml = xml.replace(/<w:tab\/>/g, "\t").replace(/<\/w:tc>/g, "\t").replace(/<w:br[^>]*\/>/g, "\n").replace(/<\/w:p>/g, "\n");
    var t = xml.replace(/<[^>]+>/g, "");
    return t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  });
}
function xlsxText(buf) {
  return root.XLSX_LITE.read(buf).then(function (sheets) {
    return sheets.map(function (s) { return (s.rows || []).map(function (r) { return (r || []).map(str).join("\t"); }).join("\n"); }).join("\n");
  });
}
var pdfjsP = null;
function loadPdfjs() {
  if (pdfjsP) return pdfjsP;
  var base = (root.document && document.baseURI) || "", url, wk;
  try { url = new URL("pdfjs/pdf.min.mjs", base).href; wk = new URL("pdfjs/pdf.worker.min.mjs", base).href; } catch (e) { return (pdfjsP = Promise.reject(new Error("PDF 元件無法載入"))); }
  var dir = url.replace(/[^\/]*$/, "");
  pdfjsP = import(url).then(function (m) { m.GlobalWorkerOptions.workerSrc = wk; return { lib: m, opt: { cMapUrl: dir + "cmaps/", cMapPacked: true, standardFontDataUrl: dir + "standard_fonts/", wasmUrl: dir + "wasm/", isEvalSupported: false, verbosity: 0 } }; });
  return pdfjsP;
}
function pdfText(bytes) {
  return loadPdfjs().then(function (pj) {
    return pj.lib.getDocument(Object.assign({ data: bytes.slice() }, pj.opt)).promise.then(function (doc) {
      var pages = [], p = 1;
      function next() {
        if (p > Math.min(doc.numPages, 80)) { try { doc.destroy(); } catch (e) {} return pages.join("\n"); }
        return doc.getPage(p++).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
          var lines = [], cur = null;
          tc.items.forEach(function (it) {
            var y = Math.round(it.transform[5]);
            if (!cur || Math.abs(cur.y - y) > 2) { cur = { y: y, t: "" }; lines.push(cur); }
            cur.t += it.str + (it.hasEOL ? "" : "");
          });
          pages.push(lines.map(function (l) { return l.t; }).join("\n"));
        }).then(next);
      }
      return next();
    });
  });
}
/** 依檔名取出全文；圖片、舊版 .doc 不支援（回傳 null 由畫面提示手動填） */
function extract(name, bytes) {
  var ext = (/\.([a-z0-9]+)$/i.exec(name || "") || [])[1];
  ext = ext ? ext.toLowerCase() : "";
  var buf = bytes.buffer ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes;
  if (ext === "pdf") return pdfText(bytes);
  if (ext === "docx") return docxText(buf);
  if (ext === "xlsx") return xlsxText(buf);
  return Promise.resolve(null);
}

var api = { parse: parse, cnNum: cnNum, extract: extract, triggerOf: triggerOf };
if (typeof module === "object" && module.exports) module.exports = api; else root.CONTRACT = api;
})(typeof self !== "undefined" ? self : this);
