/* 輕量 .xlsx 讀取器：只讀取儲存格的值（公式取 Excel 存檔時的計算結果）。
 * 在瀏覽器本機解析，不需外部程式庫，檔案不會上傳到第三方。 */
(function (root) {
"use strict";
function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

function inflate(data) {
  var ds = new DecompressionStream("deflate-raw");
  var w = ds.writable.getWriter(); w.write(data); w.close();
  return new Response(ds.readable).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
}
/** 讀取 zip 中央目錄，回傳 { 檔名: () => Promise<Uint8Array> } */
function unzip(buf) {
  var b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  var eocd = -1;
  for (var i = b.length - 22; i >= Math.max(0, b.length - 70000); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("不是有效的 Excel（.xlsx）檔案");
  var n = u16(b, eocd + 10), off = u32(b, eocd + 16), files = {}, dec = new TextDecoder("utf-8");
  for (var k = 0; k < n; k++) {
    if (u32(b, off) !== 0x02014b50) break;
    var method = u16(b, off + 10), csize = u32(b, off + 20), nlen = u16(b, off + 28), xlen = u16(b, off + 30), clen = u16(b, off + 32), lho = u32(b, off + 42);
    var name = dec.decode(b.subarray(off + 46, off + 46 + nlen));
    (function (method, csize, lho) {
      files[name] = function () {
        var start = lho + 30 + u16(b, lho + 26) + u16(b, lho + 28), raw = b.subarray(start, start + csize);
        return method === 0 ? Promise.resolve(raw) : method === 8 ? inflate(raw) : Promise.reject(new Error("不支援的壓縮格式"));
      };
    })(method, csize, lho);
    off += 46 + nlen + xlen + clen;
  }
  return files;
}
function unesc(s) {
  return s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, function (m, e) {
    return e === "lt" ? "<" : e === "gt" ? ">" : e === "amp" ? "&" : e === "quot" ? '"' : e === "apos" ? "'" : e[1] === "x" ? String.fromCodePoint(parseInt(e.slice(2), 16)) : String.fromCodePoint(+e.slice(1));
  });
}
function textOf(xml) { var out = "", re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, m; while ((m = re.exec(xml))) out += m[1]; return unesc(out); }
function colIdx(ref) { var m = /^([A-Z]+)/.exec(ref), n = 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + m[1].charCodeAt(i) - 64; return n - 1; }

/** 回傳 Promise<[{ name, rows: 二維陣列 }]> */
function read(buf) {
  var files = unzip(buf), dec = new TextDecoder("utf-8");
  function txt(p) { return files[p] ? files[p]().then(function (u) { return dec.decode(u); }) : Promise.resolve(""); }
  return Promise.all([txt("xl/workbook.xml"), txt("xl/_rels/workbook.xml.rels"), txt("xl/sharedStrings.xml")]).then(function (r) {
    var rels = {}, m, re = /<Relationship\b[^>]*>/g;
    while ((m = re.exec(r[1]))) { var id = /Id="([^"]+)"/.exec(m[0]), tg = /Target="([^"]+)"/.exec(m[0]); if (id && tg) rels[id[1]] = tg[1].replace(/^\/?xl\//, "").replace(/^\//, ""); }
    var ss = [], sre = /<si>([\s\S]*?)<\/si>/g; while ((m = sre.exec(r[2]))) ss.push(textOf(m[1]));
    var sheets = [], shre = /<sheet\b[^>]*>/g;
    while ((m = shre.exec(r[0]))) {
      var nm = /name="([^"]*)"/.exec(m[0]), rid = /r:id="([^"]+)"/.exec(m[0]) || /\bid="([^"]+)"/.exec(m[0]);
      if (nm && rid && rels[rid[1]]) sheets.push({ name: unesc(nm[1]), path: "xl/" + rels[rid[1]] });
    }
    return Promise.all(sheets.map(function (s) {
      return txt(s.path).then(function (x) {
        var rows = [], cre = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, c;
        while ((c = cre.exec(x))) {
          var attrs = c[1], body = c[2] || "", ref = /r="([A-Z]+)(\d+)"/.exec(attrs);
          if (!ref) continue;
          var t = (/t="([^"]+)"/.exec(attrs) || [])[1], v = /<v>([\s\S]*?)<\/v>/.exec(body), val = null;
          if (t === "s") val = v ? ss[+v[1]] : null;
          else if (t === "inlineStr") val = textOf(body);
          else if (t === "str" || t === "e") val = v ? unesc(v[1]) : null;
          else if (t === "b") val = v ? v[1] === "1" : null;
          else val = v ? Number(v[1]) : null;
          var ri = +ref[2] - 1, ci = colIdx(ref[1]);
          (rows[ri] = rows[ri] || [])[ci] = val;
        }
        for (var i = 0; i < rows.length; i++) rows[i] = rows[i] || [];
        return { name: s.name, rows: rows };
      });
    }));
  });
}
var api = { read: read, unzip: unzip };
if (typeof module === "object" && module.exports) module.exports = api; else root.XLSX_LITE = api;
})(typeof self !== "undefined" ? self : this);
