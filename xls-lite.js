/* 輕量 Excel 97-2003（.xls，BIFF8）讀取器：讀 OLE 複合文件中的 Workbook 串流，取出儲存格的值。
 * 用於讀取 DXF 圖面裡嵌入的 Excel 表（例如「I/O 管理點數表」）。純函式。 */
(function (root) {
"use strict";
function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
function i32(b, o) { return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24); }

/* ---------- OLE 複合文件（CFB） ---------- */
function cfb(b) {
  var sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], start = -1;
  for (var s = 0; s < Math.min(b.length - 8, 4096) && start < 0; s++) { var ok = true; for (var k = 0; k < 8; k++) if (b[s + k] !== sig[k]) { ok = false; break; } if (ok) start = s; }
  if (start < 0) throw new Error("不是 Excel 97-2003 檔");
  if (start) b = b.subarray(start);
  var ssz = 1 << u16(b, 30), mssz = 1 << u16(b, 32), nfat = u32(b, 44), dirStart = u32(b, 48), cutoff = u32(b, 56),
    minifatStart = u32(b, 60), difStart = u32(b, 68), ndif = u32(b, 72);
  function sec(i) { return 512 + i * ssz; }   /* 標頭固定 512 bytes（v3） */
  if (ssz === 4096) sec = function (i) { return (i + 1) * 4096; };
  var fatSecs = [];
  for (var i = 0; i < 109 && fatSecs.length < nfat; i++) fatSecs.push(u32(b, 76 + i * 4));
  var d = difStart;
  while (fatSecs.length < nfat && d < 0xfffffffa && ndif-- > 0) {
    for (var j = 0; j < ssz / 4 - 1 && fatSecs.length < nfat; j++) fatSecs.push(u32(b, sec(d) + j * 4));
    d = u32(b, sec(d) + ssz - 4);
  }
  var fat = [];
  fatSecs.forEach(function (fs) { for (var j = 0; j < ssz / 4; j++) fat.push(u32(b, sec(fs) + j * 4)); });
  function chain(st) { var out = [], guard = 0; while (st < 0xfffffffa && guard++ < 1e6) { out.push(st); st = fat[st]; } return out; }
  function read(st, size) {
    var c = chain(st), out = new Uint8Array(c.length * ssz);
    c.forEach(function (x, k) { out.set(b.subarray(sec(x), sec(x) + ssz), k * ssz); });
    return size !== undefined ? out.subarray(0, size) : out;
  }
  var dir = read(dirStart), ents = [];
  for (var o = 0; o + 128 <= dir.length; o += 128) {
    var nl = u16(dir, o + 64), name = "";
    for (var q = 0; q < nl / 2 - 1; q++) name += String.fromCharCode(u16(dir, o + q * 2));
    ents.push({ name: name, type: dir[o + 66], start: u32(dir, o + 116), size: u32(dir, o + 120) });
  }
  var rootE = ents[0], ministream = rootE ? read(rootE.start, rootE.size) : new Uint8Array(0);
  var minifat = minifatStart < 0xfffffffa ? (function () { var m = read(minifatStart), a = []; for (var k = 0; k < m.length / 4; k++) a.push(u32(m, k * 4)); return a; })() : [];
  function readMini(st, size) {
    var out = new Uint8Array(size), p = 0, guard = 0;
    while (st < 0xfffffffa && p < size && guard++ < 1e6) { var n = Math.min(mssz, size - p); out.set(ministream.subarray(st * mssz, st * mssz + n), p); p += n; st = minifat[st]; }
    return out;
  }
  return {
    entries: ents,
    stream: function (name) {
      var e = ents.filter(function (x) { return x.type === 2 && x.name.toLowerCase() === name.toLowerCase(); })[0];
      if (!e) return null;
      return e.size < cutoff ? readMini(e.start, e.size) : read(e.start, e.size);
    }
  };
}

/* ---------- BIFF8 ---------- */
function rk(v) {
  var n = (v & 2) ? (v >> 2) : (function () { var buf = new DataView(new ArrayBuffer(8)); buf.setUint32(4, v & 0xfffffffc, true); buf.setUint32(0, 0, true); return buf.getFloat64(0, true); })();
  return (v & 1) ? n / 100 : n;
}
function readStr(data, o, cch, flags) {   /* 回傳 [字串, 新位移] ；flags bit0=UTF-16 */
  var s = "";
  if (flags & 1) { for (var i = 0; i < cch; i++) s += String.fromCharCode(u16(data, o + i * 2)); return [s, o + cch * 2]; }
  for (var j = 0; j < cch; j++) s += String.fromCharCode(data[o + j]);
  return [s, o + cch];
}
function read(buf) {
  var b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  var doc = cfb(b), wb = doc.stream("Workbook") || doc.stream("Book");
  if (!wb) throw new Error("找不到 Workbook 串流");
  /* 先切出所有記錄 */
  var recs = [];
  for (var o = 0; o + 4 <= wb.length;) { var t = u16(wb, o), l = u16(wb, o + 2); recs.push({ t: t, d: wb.subarray(o + 4, o + 4 + l), off: o }); o += 4 + l; }
  var sst = [], sheets = [], cur = null, offIdx = {};
  for (var r = 0; r < recs.length; r++) {
    var R = recs[r], d = R.d;
    if (R.t === 0x0085) {   /* BOUNDSHEET */
      var pos = u32(d, 0), cch = d[6], fl = d[7], nm = readStr(d, 8, cch, fl)[0];
      sheets.push({ name: nm, pos: pos, rows: [] }); offIdx[pos] = sheets[sheets.length - 1];
    } else if (R.t === 0x00fc) {   /* SST（可能跨 CONTINUE） */
      var parts = [d], k = r + 1; while (k < recs.length && recs[k].t === 0x003c) { parts.push(recs[k].d); k++; }
      var total = u32(d, 4), pi = 0, data = parts[0], p = 8;
      for (var n = 0; n < total; n++) {
        if (p >= data.length) { pi++; data = parts[pi]; p = 0; if (!data) break; }
        var len = u16(data, p), flags = data[p + 2]; p += 3;
        var rich = flags & 8 ? u16(data, p) : 0; if (flags & 8) p += 2;
        var ext = flags & 4 ? u32(data, p) : 0; if (flags & 4) p += 4;
        var str = "", left = len, wide = flags & 1;
        while (left > 0) {
          var avail = wide ? Math.floor((data.length - p) / 2) : data.length - p, take = Math.min(left, avail);
          var rs = readStr(data, p, take, wide); str += rs[0]; p = rs[1]; left -= take;
          if (left > 0) { pi++; data = parts[pi]; if (!data) break; wide = data[0] & 1; p = 1; }
        }
        p += rich * 4 + ext;
        while (p > data.length && parts[pi + 1]) { p -= data.length; pi++; data = parts[pi]; }
        sst.push(str);
      }
    } else if (R.t === 0x0809) {   /* BOF */
      cur = offIdx[R.off] || null;
    } else if (cur) {
      var set = function (row, col, v) { (cur.rows[row] = cur.rows[row] || [])[col] = v; };
      if (R.t === 0x00fd) set(u16(d, 0), u16(d, 2), sst[u32(d, 6)]);
      else if (R.t === 0x0203) set(u16(d, 0), u16(d, 2), new DataView(d.buffer, d.byteOffset + 6, 8).getFloat64(0, true));
      else if (R.t === 0x027e) set(u16(d, 0), u16(d, 2), rk(i32(d, 6)));
      else if (R.t === 0x00bd) { var row = u16(d, 0), c0 = u16(d, 2), cnt = (d.length - 6) / 6; for (var c = 0; c < cnt; c++) set(row, c0 + c, rk(i32(d, 6 + c * 6))); }
      else if (R.t === 0x0204) { var cc = u16(d, 6); set(u16(d, 0), u16(d, 2), readStr(d, 9, cc, d[8])[0]); }
      else if (R.t === 0x0006) {   /* FORMULA：取計算結果 */
        var row2 = u16(d, 0), col2 = u16(d, 2);
        if (u16(d, 12) !== 0xffff) set(row2, col2, new DataView(d.buffer, d.byteOffset + 6, 8).getFloat64(0, true));
        else if (d[6] === 0 && recs[r + 1] && recs[r + 1].t === 0x0207) { var sd = recs[r + 1].d; set(row2, col2, readStr(sd, 3, u16(sd, 0), sd[2])[0]); }
      }
      else if (R.t === 0x000a) cur = null;   /* EOF */
    }
  }
  sheets.forEach(function (s) { for (var i = 0; i < s.rows.length; i++) s.rows[i] = s.rows[i] || []; });
  return sheets.map(function (s) { return { name: s.name, rows: s.rows }; });
}
var api = { read: read, cfb: cfb };
if (typeof module === "object" && module.exports) module.exports = api; else root.XLS_LITE = api;
})(typeof self !== "undefined" ? self : this);
