# 弱電專案進度追蹤（多人登入版）

依《專案工程師養成計畫》的 8 個施工時間結點，追蹤弱電監控專案的完成事項、查驗關卡與產出表單。

- 以 Google 帳號登入，帳號需由管理員開通。
- 每位工程師只看得到自己負責或被分享的專案；分享可設「可編輯」或「僅檢視」。
- 資料存放在管理員的 Google Drive（每個專案一個資料夾），由 Google Apps Script 後端驗證身分與權限後讀寫。
- 本儲存庫只有網頁程式，不含任何專案資料或密鑰；`config.js` 內的用戶端 ID 與後端網址屬公開資訊。

## 檔案

| 檔案 | 用途 |
| --- | --- |
| `index.html` | 畫面與樣式（含 Content-Security-Policy） |
| `app.js` | 登入、專案列表、專案頁、分享、權限管理、舊資料匯入 |
| `config.js` | `CLIENT_ID`（Google OAuth 用戶端 ID）、`API_URL`（Apps Script 網址） |
| `submittal-pdf.js` | 送審型錄 PDF 合併（封面、送審目錄、送審資料表＋原廠型錄，瀏覽器端產生） |
| `catalog-seed.js` | 內建型錄庫清單（雲端「廠牌型號」資料夾的型錄檔 ID 與型號關鍵字） |
| `pdf-lib.min.js` | PDF 合併元件 pdf-lib 1.17.1（MIT 授權） |
| `pdfjs/` | pdf.js 6.2.108（Apache-2.0）：讀型錄文字找型號位置（框選、標示項次），並把加密型錄轉成影像頁 |

後端程式（Code.gs）與完整的部署、資安說明存放於管理員的 Google Drive。

## 修改結點內容

結點名稱與勾選項目定義在 `app.js` 的 `NODES` 陣列；建議日期推算天數在 `OFFSETS`（以交屋日為 0）。後端 `Code.gs` 的 `NODE_COUNT` 需與結點數一致。
