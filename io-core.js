/* 中央監控「I/O 管理點數表」：讀取圖面內嵌的點數表，或依公司範本＋圖面數量產生；
 * 並把「數位訊號」（IO 整合）設備的 DI／DO 點分配到各樓層監控箱。純函式。 */
(function (root) {
"use strict";
var GROUPS = [["di", /數位輸入/], ["ai", /類比輸入/], ["do", /數位輸出/], ["comm", /通信協定|通訊協定/], ["sys", /系統設定|系統功能/]];
function str(v) { return v === null || v === undefined ? "" : String(v).trim(); }
function num(v) { if (typeof v === "number") return v; var t = str(v); return /^-?\d+(\.\d+)?$/.test(t) ? +t : 0; }
function isCn(v) { return /^[一二三四五六七八九十]{1,3}$/.test(str(v)); }

/** 從工作表列資料讀出點數表；找不到時回傳 null */
function parse(rows) { var t = parseRaw(rows); return t ? finishKeyed(t) : null; }

/* ---------- 公司範本（力馥 BA1-16 I/O 管理點數表，每台設備的點數） ---------- */
/* 預設範本：力馥土城案圖面 BA1-16「大樓自動化 I/O 管理點數表」，per＝每台設備的點數 */
var TEMPLATE = {"columns":[{"group":"di","label":"運轉/停止狀態"},{"group":"di","label":"信號傳輸線路檢測連線狀態"},{"group":"di","label":"水位過高"},{"group":"di","label":"水位過低"},{"group":"di","label":"過載/故障/跳脫"},{"group":"di","label":"警報監視"},{"group":"di","label":"住家保全警報"},{"group":"di","label":"油箱低油位"},{"group":"di","label":"門位狀態"},{"group":"di","label":"濃度過度警報"},{"group":"di","label":"求救訊號"},{"group":"di","label":"燈具開啟/關閉(回路數)"},{"group":"di","label":"防盜警報"},{"group":"di","label":"消防警報"},{"group":"di","label":"水箱蓋警報"},{"group":"ai","label":"電力數值顯示"},{"group":"ai","label":"水量數值顯示"},{"group":"ai","label":"室內溫度數值顯示"},{"group":"ai","label":"室內濕度數值顯示"},{"group":"ai","label":"土壤濕度數值顯示"},{"group":"do","label":"排風機啟動/停止"},{"group":"do","label":"開/關機"},{"group":"do","label":"連動電梯叫車"},{"group":"do","label":"卸載開關控制"},{"group":"do","label":"空調控制"},{"group":"do","label":"燈具開啟/關閉(回路數)"},{"group":"comm","label":"用水度數"},{"group":"comm","label":"電流"},{"group":"comm","label":"電壓"},{"group":"comm","label":"有效電力(瓩)"},{"group":"comm","label":"功率因數"},{"group":"comm","label":"無效電力"},{"group":"comm","label":"電力度"},{"group":"comm","label":"曲線圖"},{"group":"sys","label":"彩色圖形動態畫面"},{"group":"sys","label":"時間程序控制"},{"group":"sys","label":"CCTV子系統連動功能"},{"group":"sys","label":"系統連動功能"},{"group":"sys","label":"直接數位控制"},{"group":"sys","label":"行動電話手機訊號通報"},{"group":"sys","label":"設備累計運轉小時數"},{"group":"sys","label":"用電需量管理"},{"group":"sys","label":"用電設備卸載"},{"group":"sys","label":"火警連動"},{"group":"sys","label":"狀態顯示及變化紀錄"},{"group":"sys","label":"曲線圖"},{"group":"sys","label":"歷史紀錄"},{"group":"sys","label":"信號傳輸線路故障顯示功能"},{"group":"sys","label":"警報顯示列表"}],"sections":[{"no":"一","name":"電力系統","format":"TCP通訊整合","rows":[{"no":"1","name":"數位電錶(動力)","format":"MODBUS通訊整合","per":{"電力數值顯示@ai":1,"電流@comm":3,"電壓@comm":3,"有效電力(瓩)@comm":1,"功率因數@comm":1,"無效電力@comm":1,"電力度@comm":1,"曲線圖@comm":1,"彩色圖形動態畫面@sys":1,"用電需量管理@sys":1,"用電設備卸載@sys":1,"狀態顯示及變化紀錄@sys":1,"曲線圖@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":4},{"no":"2","name":"數位電錶(插座)","format":"MODBUS通訊整合","per":{"電力數值顯示@ai":1,"電流@comm":3,"電壓@comm":3,"有效電力(瓩)@comm":1,"功率因數@comm":1,"無效電力@comm":1,"電力度@comm":1,"曲線圖@comm":1,"彩色圖形動態畫面@sys":1,"用電需量管理@sys":1,"用電設備卸載@sys":1,"狀態顯示及變化紀錄@sys":1,"曲線圖@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":1},{"no":"3","name":"數位電錶(空調)","format":"MODBUS通訊整合","per":{"電力數值顯示@ai":1,"電流@comm":3,"電壓@comm":3,"有效電力(瓩)@comm":1,"功率因數@comm":1,"無效電力@comm":1,"電力度@comm":1,"曲線圖@comm":1,"彩色圖形動態畫面@sys":1,"用電需量管理@sys":1,"用電設備卸載@sys":1,"狀態顯示及變化紀錄@sys":1,"曲線圖@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":1},{"no":"4","name":"數位電錶(照明)","format":"MODBUS通訊整合","per":{"電力數值顯示@ai":1,"電流@comm":3,"電壓@comm":3,"有效電力(瓩)@comm":1,"功率因數@comm":1,"無效電力@comm":1,"電力度@comm":1,"曲線圖@comm":1,"彩色圖形動態畫面@sys":1,"用電需量管理@sys":1,"用電設備卸載@sys":1,"狀態顯示及變化紀錄@sys":1,"曲線圖@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":2},{"no":"5","name":"發電機","format":"數位訊號","per":{"運轉/停止狀態@di":1,"過載/故障/跳脫@di":1,"彩色圖形動態畫面@sys":1,"設備累計運轉小時數@sys":1,"狀態顯示及變化紀錄@sys":1,"曲線圖@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":1},{"no":"6","name":"電瓶電壓過低","format":"數位訊號","per":{"警報監視@di":1,"彩色圖形動態畫面@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":1},{"no":"7","name":"油箱油位過低","format":"數位訊號","per":{"油箱低油位@di":1,"彩色圖形動態畫面@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":1},{"no":"8","name":"RCSW","format":"數位訊號","per":{"卸載開關控制@do":1,"彩色圖形動態畫面@sys":1,"系統連動功能@sys":1,"直接數位控制@sys":1,"用電設備卸載@sys":1,"火警連動@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":1},{"no":"9","name":"ATS台電測","format":"數位訊號","per":{"運轉/停止狀態@di":1,"彩色圖形動態畫面@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":1},{"no":"10","name":"ATS發電機測","format":"數位訊號","per":{"運轉/停止狀態@di":1,"彩色圖形動態畫面@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":1}]},{"no":"二","name":"空調系統","format":"TCP通訊整合","rows":[{"no":"1","name":"空調設備","format":"數位訊號","per":{"運轉/停止狀態@di":1,"過載/故障/跳脫@di":1,"卸載開關控制@do":1,"空調控制@do":1,"彩色圖形動態畫面@sys":1,"系統連動功能@sys":1,"直接數位控制@sys":1,"設備累計運轉小時數@sys":1,"用電需量管理@sys":1,"用電設備卸載@sys":1,"火警連動@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":4}]},{"no":"三","name":"排風系統","format":"TCP通訊整合","rows":[{"no":"1","name":"排風機","format":"數位訊號","per":{"運轉/停止狀態@di":1,"過載/故障/跳脫@di":1,"排風機啟動/停止@do":1,"卸載開關控制@do":1,"彩色圖形動態畫面@sys":1,"時間程序控制@sys":1,"系統連動功能@sys":1,"直接數位控制@sys":1,"設備累計運轉小時數@sys":1,"用電需量管理@sys":1,"用電設備卸載@sys":1,"火警連動@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":3},{"no":"2","name":"導流風機","format":"數位訊號","per":{"運轉/停止狀態@di":1,"過載/故障/跳脫@di":1,"排風機啟動/停止@do":1,"卸載開關控制@do":1,"彩色圖形動態畫面@sys":1,"時間程序控制@sys":1,"系統連動功能@sys":1,"直接數位控制@sys":1,"設備累計運轉小時數@sys":1,"用電需量管理@sys":1,"用電設備卸載@sys":1,"火警連動@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":3}]},{"no":"四","name":"衛生給排水系統","format":"TCP通訊整合","rows":[{"no":"1","name":"數位水錶","format":"MODBUS通訊整合","per":{"水量數值顯示@ai":1,"用水度數@comm":1,"曲線圖@comm":1,"彩色圖形動態畫面@sys":1,"狀態顯示及變化紀錄@sys":1,"曲線圖@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":1},{"no":"2","name":"水箱","format":"數位訊號","per":{"水位過高@di":0.33,"水位過低@di":0.33,"水箱蓋警報@di":0.33,"彩色圖形動態畫面@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":3},{"no":"3","name":"蓄水池","format":"數位訊號","per":{"水位過高@di":0.25,"水位過低@di":0.25,"水箱蓋警報@di":0.5,"彩色圖形動態畫面@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":4},{"no":"4","name":"蓄水池","format":"數位訊號","per":{"水位過高@di":1,"水位過低@di":1,"水箱蓋警報@di":1,"彩色圖形動態畫面@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":0},{"no":"5","name":"揚水泵浦(動力)","format":"數位訊號","per":{"運轉/停止狀態@di":1,"過載/故障/跳脫@di":1,"卸載開關控制@do":1,"彩色圖形動態畫面@sys":1,"系統連動功能@sys":1,"直接數位控制@sys":1,"設備累計運轉小時數@sys":1,"用電設備卸載@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":2},{"no":"6","name":"廢水泵(動力)","format":"數位訊號","per":{"運轉/停止狀態@di":1,"過載/故障/跳脫@di":1,"彩色圖形動態畫面@sys":1,"設備累計運轉小時數@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":2},{"no":"7","name":"雨水廢水泵(動力)","format":"數位訊號","per":{"運轉/停止狀態@di":1,"過載/故障/跳脫@di":1,"彩色圖形動態畫面@sys":1,"設備累計運轉小時數@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":3},{"no":"8","name":"廢水池","format":"數位訊號","per":{"水位過高@di":1,"彩色圖形動態畫面@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":1},{"no":"9","name":"雨水廢水池","format":"數位訊號","per":{"水位過高@di":1,"彩色圖形動態畫面@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":1}]},{"no":"五","name":"電梯系統","format":"TCP通訊整合","rows":[{"no":"1","name":"電梯(動力)","format":"MODBUS通訊整合","per":{"運轉/停止狀態@di":1,"過載/故障/跳脫@di":1,"彩色圖形動態畫面@sys":1,"設備累計運轉小時數@sys":1,"火警連動@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":2}]},{"no":"六","name":"消防系統","format":"TCP通訊整合","rows":[{"no":"1","name":"消防設備主機","format":"MODBUS通訊整合","per":{"消防警報@di":1,"行動電話手機訊號通報@sys":1},"refQty":20},{"no":"2","name":"撒水泵浦","format":"數位訊號","per":{"運轉/停止狀態@di":1,"過載/故障/跳脫@di":1,"彩色圖形動態畫面@sys":1,"設備累計運轉小時數@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":1},{"no":"3","name":"消防泵浦","format":"數位訊號","per":{"運轉/停止狀態@di":1,"過載/故障/跳脫@di":1,"彩色圖形動態畫面@sys":1,"設備累計運轉小時數@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":1},{"no":"4","name":"消防水箱","format":"數位訊號","per":{"水位過高@di":0.5,"水位過低@di":0.5,"彩色圖形動態畫面@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":2}]},{"no":"七","name":"門禁系統","format":"TCP通訊整合","rows":[{"no":"1","name":"感應式讀卡機","format":"MODBUS通訊整合","per":{"信號傳輸線路檢測連線狀態@di":1,"連動電梯叫車@do":1,"彩色圖形動態畫面@sys":1,"系統連動功能@sys":1,"直接數位控制@sys":1,"火警連動@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":1},{"no":"2","name":"感應式讀卡機","format":"MODBUS通訊整合","per":{"信號傳輸線路檢測連線狀態@di":1,"彩色圖形動態畫面@sys":1,"系統連動功能@sys":1,"直接數位控制@sys":1,"火警連動@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":2},{"no":"3","name":"感應式讀卡機","format":"MODBUS通訊整合","per":{"信號傳輸線路檢測連線狀態@di":1,"彩色圖形動態畫面@sys":1,"系統連動功能@sys":1,"直接數位控制@sys":1,"火警連動@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":1},{"no":"4","name":"感應式讀卡機","format":"MODBUS通訊整合","per":{"信號傳輸線路檢測連線狀態@di":1,"連動電梯叫車@do":1,"彩色圖形動態畫面@sys":1,"系統連動功能@sys":1,"直接數位控制@sys":1,"火警連動@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":1},{"no":"5","name":"感應式讀卡機","format":"MODBUS通訊整合","per":{"信號傳輸線路檢測連線狀態@di":1,"彩色圖形動態畫面@sys":1,"系統連動功能@sys":1,"直接數位控制@sys":1,"火警連動@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":1},{"no":"6","name":"感應式讀卡機","format":"MODBUS通訊整合","per":{"信號傳輸線路檢測連線狀態@di":1,"彩色圖形動態畫面@sys":1,"系統連動功能@sys":1,"直接數位控制@sys":1,"火警連動@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":1},{"no":"7","name":"感應式讀卡機-電梯","format":"MODBUS通訊整合","per":{"信號傳輸線路檢測連線狀態@di":1,"彩色圖形動態畫面@sys":1,"直接數位控制@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":2}]},{"no":"八","name":"安全防災系統","format":"TCP通訊整合","rows":[{"no":"1","name":"公設緊急求救按鈕","format":"數位訊號","per":{"求救訊號@di":1.09,"彩色圖形動態畫面@sys":1,"CCTV子系統連動功能@sys":1,"系統連動功能@sys":1,"行動電話手機訊號通報@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":54},{"no":"2","name":"公設門門位偵測","format":"數位訊號","per":{"門位狀態@di":0.8,"彩色圖形動態畫面@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":10},{"no":"3","name":"機房門門位偵測","format":"數位訊號","per":{"門位狀態@di":1.5,"彩色圖形動態畫面@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":6},{"no":"4","name":"安全防火門門位偵測","format":"數位訊號","per":{"門位狀態@di":0.94,"彩色圖形動態畫面@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":33},{"no":"5","name":"防火鐵捲門","format":"數位訊號","per":{"門位狀態@di":1,"彩色圖形動態畫面@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":2},{"no":"6","name":"玻璃破碎偵測器","format":"數位訊號","per":{"信號傳輸線路檢測連線狀態@di":1,"警報監視@di":1,"防盜警報@di":1,"彩色圖形動態畫面@sys":1,"CCTV子系統連動功能@sys":1,"系統連動功能@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"信號傳輸線路故障顯示功能@sys":1,"警報顯示列表@sys":1},"refQty":6},{"no":"7","name":"360°熱感應紅外線偵測器","format":"數位訊號","per":{"信號傳輸線路檢測連線狀態@di":1,"警報監視@di":1,"防盜警報@di":1,"彩色圖形動態畫面@sys":1,"CCTV子系統連動功能@sys":1,"系統連動功能@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"信號傳輸線路故障顯示功能@sys":1,"警報顯示列表@sys":1},"refQty":2},{"no":"8","name":"淹水偵測器","format":"數位訊號","per":{"水位過高@di":0.5,"水位過低@di":0.5,"警報監視@di":1,"彩色圖形動態畫面@sys":1,"CCTV子系統連動功能@sys":1,"系統連動功能@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":2},{"no":"9","name":"漏水偵測器","format":"數位訊號","per":{"警報監視@di":1,"彩色圖形動態畫面@sys":1,"CCTV子系統連動功能@sys":1,"系統連動功能@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":6},{"no":"10","name":"公共緊急求救對講機","format":"TCP通訊整合","per":{"求救訊號@di":0.88,"彩色圖形動態畫面@sys":1,"CCTV子系統連動功能@sys":1,"系統連動功能@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":8},{"no":"11","name":"語音播報器","format":"數位訊號","per":{"警報監視@di":1,"彩色圖形動態畫面@sys":1,"CCTV子系統連動功能@sys":1,"系統連動功能@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":6}]},{"no":"九","name":"智慧家庭自動化系統","format":"TCP通訊整合","rows":[{"no":"1","name":"智慧家庭自動化主機","format":"TCP通訊整合","per":{"信號傳輸線路檢測連線狀態@di":1,"連動電梯叫車@do":1,"彩色圖形動態畫面@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":93},{"no":"2","name":"各戶防盜警報","format":"數位訊號","per":{"住家保全警報@di":1,"防盜警報@di":1,"彩色圖形動態畫面@sys":1,"行動電話手機訊號通報@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":93},{"no":"3","name":"各戶緊急求救警報","format":"數位訊號","per":{"求救訊號@di":1,"彩色圖形動態畫面@sys":1,"行動電話手機訊號通報@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":93}]},{"no":"十","name":"環境品質系統","format":"TCP通訊整合","rows":[{"no":"1","name":"一氧化碳偵測器","format":"數位訊號","per":{"濃度過度警報@di":1,"排風機啟動/停止@do":1,"彩色圖形動態畫面@sys":1,"系統連動功能@sys":1,"設備累計運轉小時數@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1},"refQty":6},{"no":"2","name":"溫溼度偵測器","format":"MODBUS通訊整合","per":{"室內溫度數值顯示@ai":1,"室內濕度數值顯示@ai":1,"空調控制@do":1,"彩色圖形動態畫面@sys":1,"系統連動功能@sys":1,"設備累計運轉小時數@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1},"refQty":1},{"no":"3","name":"土壤偵測器","format":"MODBUS通訊整合","per":{"土壤濕度數值顯示@ai":0.4,"彩色圖形動態畫面@sys":1,"系統連動功能@sys":1,"設備累計運轉小時數@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1},"refQty":5},{"no":"4","name":"地震感知器","format":"數位訊號","per":{"警報監視@di":1,"彩色圖形動態畫面@sys":1,"系統連動功能@sys":1,"設備累計運轉小時數@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1},"refQty":1}]},{"no":"十一","name":"CCTV閉路監視系統","format":"TCP通訊整合","rows":[{"no":"1","name":"攝影機","format":"TCP通訊整合","per":{"信號傳輸線路檢測連線狀態@di":1,"彩色圖形動態畫面@sys":1,"CCTV子系統連動功能@sys":1,"系統連動功能@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":39}]},{"no":"十二","name":"照明燈控系統","format":"TCP通訊整合","rows":[{"no":"1","name":"景觀燈","format":"數位訊號","per":{"燈具開啟/關閉(回路數)@di":1,"卸載開關控制@do":1,"燈具開啟/關閉(回路數)@do":1,"彩色圖形動態畫面@sys":1,"時間程序控制@sys":1,"系統連動功能@sys":1,"直接數位控制@sys":1,"設備累計運轉小時數@sys":1,"用電需量管理@sys":1,"用電設備卸載@sys":1,"火警連動@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":2}]},{"no":"十三","name":"電子佈告欄系統","format":"","rows":[{"no":"1","name":"電子佈告欄","format":"MODBUS通訊整合","per":{"求救訊號@di":1,"消防警報@di":1,"室內溫度數值顯示@ai":1,"室內濕度數值顯示@ai":1,"彩色圖形動態畫面@sys":1,"系統連動功能@sys":1,"狀態顯示及變化紀錄@sys":1,"歷史紀錄@sys":1,"警報顯示列表@sys":1},"refQty":4}]}]};
function setTemplate(t) { TEMPLATE = t; }

/* 點數表項目 ↔ 圖面設備 的對照 */
var DRAW_ALIAS = [
  [/各戶防盜/, /^隱藏式磁簧開關$/], [/各戶緊急求救/, /^緊急求救押扣$/], [/公設緊急求救/, /緊急求救押扣\(公共\)/],
  [/公設門|機房門|防火門|門位/, /隱藏式磁簧開關\(公共\)/], [/防火鐵捲門|鐵捲門/, /鐵捲門磁簧/],
  [/智慧家庭/, /智慧家庭自動化主機/], [/玻璃破碎/, /玻璃破碎/], [/360|紅外線/, /紅外線偵測/], [/淹水/, /淹水/], [/漏水/, /漏水/],
  [/語音播報/, /語音播報/], [/一氧化碳/, /一氧化碳/], [/溫溼度|溫濕度/, /溫濕度/], [/土壤/, /土壤/], [/地震/, /地震/],
  [/^攝影機$/, /攝影機/], [/電子佈告欄/, /佈告欄/], [/緊急求救對講/, /緊急對講|求救對講/], [/水箱$/, /水箱蓋/], [/數位水錶/, /水錶|水表/],
  [/感應式讀卡機-電梯/, /電梯樓層管制感應讀卡機/], [/^感應式讀卡機$/, /^感應式讀卡機$|Smart ?Key讀卡機/i]
];
var CORES = [/磁簧/, /求救(按鈕|押扣|鈕)/, /紅外線/, /柵欄機/, /玻璃破碎/, /鐵捲門/, /液位|水位/, /一氧化碳/, /漏水/, /淹水/, /地震/, /感應線圈/];
var QUALS = ["公共", "安全梯", "梯廳", "電梯", "店鋪", "社福", "機房", "無障礙"];
function drawMatch(name, items) {
  var hits = [];
  DRAW_ALIAS.forEach(function (a) { if (a[0].test(name)) items.forEach(function (it) { if (a[1].test(it.name) && hits.indexOf(it) < 0) hits.push(it); }); });
  if (hits.length) return hits;
  /* 通用比對：設備關鍵字相同、且「公共／安全梯／店鋪…」等附註一致（「公共磁簧(安全梯)」↔「隱藏式磁簧(公共)(安全梯)」） */
  var q = function (s) { s = String(s).replace(/公設/g, "公共").replace(/店舖/g, "店鋪"); if (/店鋪|社福/.test(s)) s = s.replace(/公共/g, ""); return QUALS.filter(function (w) { return s.indexOf(w) >= 0; }).sort().join(); };
  CORES.forEach(function (c) {
    if (!c.test(name)) return;
    items.forEach(function (it) { if (c.test(it.name) && q(it.name) === q(name) && hits.indexOf(it) < 0) hits.push(it); });
  });
  return hits;
}
function floorsFromLoc(loc, known) {
  var out = [], re = /(B|R)?(\d{1,2})F(?:\s*[~～-]\s*(B|R)?(\d{1,2})F)?/gi, m;
  while ((m = re.exec(loc))) {
    var p = (m[1] || "").toUpperCase(), a = +m[2], b = m[4] ? +m[4] : a;
    if (b < a) { var x = a; a = b; b = x; }
    for (var i = a; i <= b; i++) { var f = p + i + "F"; if (out.indexOf(f) < 0) out.push(f); }
  }
  if (/RF/i.test(loc) && out.indexOf("R1F") < 0 && known.indexOf("R1F") >= 0) out.push("R1F");
  return out;
}

/** 決定點數表：圖面內嵌優先，否則依範本＋圖面數量＋手動數量產生 */
function build(dr, P) {
  var emb = null;
  (dr.embedded || []).some(function (e) { return e.sheets.some(function (s) { var t = parse(s.rows); if (t) { emb = t; emb.sheet = s.name; } return !!t; }); });
  if (emb) { emb.source = "embedded"; return emb; }
  if (!TEMPLATE) return null;
  var items = dr.items || [], qtyOver = P.ioQty || {}, used = {};
  var t = { source: "template", columns: TEMPLATE.columns, sections: TEMPLATE.sections.map(function (s) {
    return { no: s.no, name: s.name, format: s.format, rows: mergeSame(s.rows).map(function (r) {
      var m = drawMatch(r.name, items), q, key = m.map(function (it) { return it.name; }).sort().join("|"), dup = m.length && used[key];
      if (m.length) used[key] = 1;
      if (qtyOver[r.name] !== undefined && qtyOver[r.name] !== "") q = +qtyOver[r.name];
      else if (m.length && !dup) q = m.reduce(function (a, it) { return a + it.total; }, 0);
      else q = 0;
      var pts = {}; Object.keys(r.per).forEach(function (k) { pts[k] = /@sys$/.test(k) ? 1 : Math.round(r.per[k] * q); });
      return { no: r.no, name: r.name, loc: "", format: r.format, qty: q, pts: q ? pts : {}, auto: !!m.length && !dup && qtyOver[r.name] === undefined, from: m.map(function (it) { return it.name; }), merged: !!dup };
    }) };
  }) };
  return finishKeyed(t);
}

/* 範本中同名的列（例如各位置的讀卡機）合併成一列 */
function mergeSame(rows) {
  var out = [], idx = {};
  rows.forEach(function (r) {
    if (idx[r.name] === undefined) { idx[r.name] = out.length; out.push({ no: r.no, name: r.name, format: r.format, per: Object.assign({}, r.per), refQty: r.refQty || 0, n: 1 }); return; }
    var o = out[idx[r.name]], a = o.refQty, b = r.refQty || 0;
    Object.keys(Object.assign({}, o.per, r.per)).forEach(function (k) { o.per[k] = /@sys$/.test(k) ? 1 : (a + b ? Math.round(((o.per[k] || 0) * a + (r.per[k] || 0) * b) / (a + b) * 100) / 100 : (o.per[k] || r.per[k])); });
    o.refQty = a + b;
  });
  return out;
}

/** 位置欄的盤名（「PS-1」「PWA,PWB」）→ 單線圖分析得到的盤所在樓層 */
function panelFloors(loc, map) {
  var out = []; if (!loc || !map) return out;
  String(loc).split(/[,，、.\/\s]+/).forEach(function (k) { k = k.trim().toUpperCase(); var f = k && map[k]; if (f && out.indexOf(f) < 0) out.push(f); });
  return out;
}
/** 沒有任何樓層資訊時，依設備種類推定：泵浦、水池在最底層地下室；發電機、ATS 在地下一層電氣室；屋頂水箱在最高的屋突層 */
function guessFloor(name, known) {
  var ks = (known || []).filter(function (f) { return /^(B|R)?\d+F$|^RF$/.test(f); });
  var bs = ks.filter(function (f) { return /^B\d+F$/.test(f); }).sort(function (a, b) { return +b.slice(1, -1) - +a.slice(1, -1); });
  var rs = ks.filter(function (f) { return /^R\d+F$|^RF$/.test(f); }).sort(function (a, b) { return (a === "RF" ? 99 : +a.slice(1, -1)) - (b === "RF" ? 99 : +b.slice(1, -1)); });
  if (/屋頂|屋突|高架水塔|高置水箱/.test(name) && rs.length) return { floor: rs[rs.length - 1], why: "屋頂設備在最高屋突層" };
  if (/發電機|油箱|油位|ATS|電瓶|變電|配電|受電|電氣室|台電/i.test(name) && bs.length)
    return { floor: bs[bs.length - 1], why: "電力設備在地下一層電氣室" };
  if (/泵|幫浦|水池|蓄水|污泥|污水|廢水|放流|調節池|雨水|筏基|集水|消防水|水箱|機房/.test(name) && bs.length)
    return { floor: bs[0], why: "泵浦與水池在最底層地下室" };
  return null;
}
/** 把「數位訊號」項目的點分配到各樓層，回傳 {floor: [{type:'DI'|'DO', name, label}]} */
function distribute(t, dr, P, floorsKnown) {
  var items = dr.items || [], out = {};
  function add(f, type, name, label, n, loc) { var a = out[f] = out[f] || []; for (var i = 0; i < n; i++) a.push({ type: type, name: name, label: label, loc: loc || "" }); }
  t.sections.forEach(function (s) { s.rows.forEach(function (r) {
    if (!r.hw || !(r.sum.di + r.sum.do)) return;
    var share = {}, m = drawMatch(r.name, items), tot = 0, by = "";
    r.fkey = r.name + (r.loc ? "｜" + r.loc : "");
    var fs = (P.ioFloor && P.ioFloor[r.fkey]) ? [P.ioFloor[r.fkey]] : [];
    if (fs.length) by = "手動指定";
    if (!fs.length) { fs = floorsFromLoc(r.loc, floorsKnown); if (fs.length) by = "位置欄"; }
    if (!fs.length) { fs = floorsFromLoc(r.name, floorsKnown).filter(function (f) { return floorsKnown.indexOf(f) >= 0; }); if (fs.length) by = "設備名稱"; }   /* 「R2F水箱」 */
    if (!fs.length) { fs = panelFloors(r.loc, P.panelFloors); if (fs.length) by = "單線圖盤位"; }                                      /* 位置寫盤名（PS-1、PWA）→ 單線圖上該盤的樓層 */
    if (fs.length) fs.forEach(function (f) { share[f] = 1; tot++; });
    if (!tot && m.length) { m.forEach(function (it) { Object.keys(it.floors).forEach(function (f) { if (!(it.floors[f] > 0)) return; share[f] = (share[f] || 0) + it.floors[f]; tot += it.floors[f]; }); }); if (tot) by = "圖面數量"; }
    if (!tot) { var g = guessFloor(r.name, floorsKnown); if (g) { share[g.floor] = 1; tot = 1; by = "推定（" + g.why + "）"; } }
    if (!tot) { share[P.coreFloor || "1F"] = 1; tot = 1; by = "中央監控室（無樓層資訊）"; }
    r.at = { floors: Object.keys(share), by: by };
    var fsList = Object.keys(share);
    t.columns.forEach(function (c) {
      if (c.group !== "di" && c.group !== "do") return;
      var n = r.pts[c.label + "@" + c.group]; if (!n) return;
      var left = n, acc = 0;
      fsList.forEach(function (f, i) {   /* 依比例累計取整，總數不會遺漏 */
        acc += share[f];
        var k = i === fsList.length - 1 ? left : Math.round(n * acc / tot) - (n - left);
        k = Math.max(0, Math.min(k, left)); left -= k;
        add(f, c.group === "di" ? "DI" : "DO", r.name, c.label, k, r.loc);
      });
    });
  }); });
  return out;
}

/* 點位以「標籤@群組」為鍵（「燈具開啟/關閉(回路數)」同時出現在數位輸入與數位輸出） */
function parseRaw(rows) {
  var hr = -1;
  for (var r = 0; r < Math.min(rows.length, 15) && hr < 0; r++) {
    var row = rows[r] || [];
    if (row.some(function (v) { return /數位輸入/.test(str(v)); }) && row.some(function (v) { return /數位輸出/.test(str(v)); })) hr = r;
  }
  if (hr < 0) return null;
  var head = rows[hr], sub = rows[hr + 1] || [], col = {};
  head.forEach(function (v, i) {
    var t = str(v).replace(/\s/g, "");
    if (/^項目|^項次/.test(t)) col.no = i; else if (/設備名稱|名稱/.test(t)) col.name = i; else if (/位置|盤名/.test(t)) col.loc = i;
    else if (/通訊格式|格式/.test(t)) col.format = i; else if (/^數量$/.test(t)) col.qty = i;
  });
  var starts = [];
  head.forEach(function (v, i) { GROUPS.forEach(function (g) { if (g[1].test(str(v))) starts.push({ key: g[0], i: i }); }); });
  starts.sort(function (a, b) { return a.i - b.i; });
  var maxCol = Math.max.apply(null, rows.map(function (r) { return (r || []).length; }));
  var columns = [];
  starts.forEach(function (s, k) {
    var end = k + 1 < starts.length ? starts[k + 1].i : maxCol;
    for (var c = s.i; c < end; c++) { var lb = str(sub[c]); if (lb) columns.push({ c: c, group: s.key, label: lb }); }
  });
  var sections = [], cur = null;
  for (var i = hr + 2; i < rows.length; i++) {
    var rw = rows[i] || [], no = rw[col.no], name = str(rw[col.name]);
    if (!name || /小計|總計|合計/.test(name)) continue;
    if (isCn(no)) { cur = { no: str(no), name: name, format: str(rw[col.format]), rows: [] }; sections.push(cur); continue; }
    if (!cur) { cur = { no: "", name: "其他", format: "", rows: [] }; sections.push(cur); }
    var pts = {};
    columns.forEach(function (c) { var v = rw[c.c], k = c.label + "@" + c.group; if (c.group === "sys") { if (str(v)) pts[k] = 1; } else { var n = num(v); if (n) pts[k] = n; } });
    cur.rows.push({ no: str(no), name: name, loc: str(rw[col.loc]), format: str(rw[col.format]), qty: num(rw[col.qty]), pts: pts });
  }
  return { columns: columns.map(function (c) { return { group: c.group, label: c.label }; }), sections: sections };
}
/** 住戶的防盜保全（各戶防盜、住家保全警報、戶內求救、住戶磁簧）接到戶內對講保全主機，經通訊協定上傳，不接實體 IO */
var UNIT_RE = /各戶|住戶|住家|戶內|每戶|宅內/, PUBLIC_RE = /公共|公設|安全梯|梯廳|店鋪|店舖|社福|機房|管委|大廳|門廳|停車|車道|屋頂|地下/;
function isUnit(name, pts) {
  name = String(name || "");
  if (PUBLIC_RE.test(name)) return false;
  if (UNIT_RE.test(name)) return true;
  return Object.keys(pts || {}).some(function (k) { return /^住家保全警報@/.test(k); });
}
/** 佔不佔 IO 模組：寫「數位訊號／接點」→ 佔；寫 TCP／MODBUS／通訊整合等 → 軟體點不佔；
    通訊格式沒填（設計單位點數表常留白）→ 有 DI／DO 點就視為實體接點，佔模組 */
function isHw(format, g) {
  var f = String(format || "").replace(/\s/g, "");
  if (/數位訊號|接點|^DI|^DO|硬體/i.test(f)) return true;
  if (/TCP|MODBUS|BACNET|通訊|通信|協定|RS-?485|網路|軟體/i.test(f)) return false;
  return (g.di + g.do) > 0;
}
function finishKeyed(t) {
  var tot = { di: 0, ai: 0, do: 0, comm: 0, hwDi: 0, hwDo: 0 };
  t.sections.forEach(function (s) { s.rows.forEach(function (r) {
    var g = { di: 0, ai: 0, do: 0, comm: 0 };
    Object.keys(r.pts).forEach(function (k) { var grp = k.split("@").pop(); if (g[grp] !== undefined) g[grp] += r.pts[k]; });
    r.sum = g; r.unit = isUnit(r.name, r.pts); r.hw = !r.unit && isHw(r.format, g);
    tot.di += g.di; tot.ai += g.ai; tot.do += g.do; tot.comm += g.comm;
    if (r.hw) { tot.hwDi += g.di; tot.hwDo += g.do; }
  }); });
  t.totals = tot;
  return t;
}
/** 由一份點數表產生範本（每台點數） */
function toTemplate(t) {
  return { columns: t.columns, sections: t.sections.map(function (s) { return { no: s.no, name: s.name, format: s.format, rows: s.rows.map(function (r) {
    var per = {}; Object.keys(r.pts).forEach(function (k) { per[k] = /@sys$/.test(k) ? 1 : (r.qty ? Math.round(r.pts[k] / r.qty * 100) / 100 : r.pts[k]); });
    return { no: r.no, name: r.name, format: r.format, per: per, refQty: r.qty };
  }) }; }) };
}

var api = { isUnit: isUnit, parse: parse, build: build, distribute: distribute, toTemplate: toTemplate, setTemplate: setTemplate, drawMatch: drawMatch, floorsFromLoc: floorsFromLoc };
if (typeof module === "object" && module.exports) module.exports = api; else root.IOCORE = api;
})(typeof self !== "undefined" ? self : this);
