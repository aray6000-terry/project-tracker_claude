/* 在背景執行緒分析 DXF，避免大檔讓畫面卡住 */
importScripts("xlsx-lite.js", "xls-lite.js", "dxf-core.js");
self.onmessage = function (ev) {
  var buf = ev.data.buf, name = String(ev.data.name || "").toLowerCase();
  var send = function (m) { self.postMessage(m); };
  var get = /\.zip$/.test(name)
    ? (function () {
        var files = XLSX_LITE.unzip(buf), keys = Object.keys(files).filter(function (k) { return /\.dxf$/i.test(k); });
        if (!keys.length) return Promise.reject(new Error("壓縮檔裡沒有 .dxf 檔"));
        send({ type: "progress", text: "解壓縮「" + keys[0] + "」…" });
        return files[keys[0]]();
      })()
    : Promise.resolve(new Uint8Array(buf));
  get.then(function (u8) {
    send({ type: "progress", text: "讀取圖面文字（" + (u8.length / 1048576).toFixed(1) + " MB）…" });
    var d = DXF.decode(u8);
    send({ type: "progress", text: "分析圖塊、數量表與平面圖…" });
    var r = DXF.analyze(d.text, { xls: XLS_LITE, onProgress: function (p) { send({ type: "progress", text: "解析中 " + Math.round(p * 100) + "%" }); } });
    r.version = d.version;
    send({ type: "done", result: r });
  }).catch(function (e) { send({ type: "error", message: e && e.message ? e.message : String(e) }); });
};
