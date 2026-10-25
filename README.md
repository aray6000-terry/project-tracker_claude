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

後端程式（Code.gs）與完整的部署、資安說明存放於管理員的 Google Drive。

## 修改結點內容

結點名稱與勾選項目定義在 `app.js` 的 `NODES` 陣列；建議日期推算天數在 `OFFSETS`（以交屋日為 0）。後端 `Code.gs` 的 `NODE_COUNT` 需與結點數一致。
