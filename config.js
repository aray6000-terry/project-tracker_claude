/* 部署設定：填入 Google OAuth 用戶端 ID 與 Apps Script 網頁應用程式網址（兩者都不是機密資訊） */
window.APP_CONFIG = {
  CLIENT_ID: "請填入OAuth用戶端ID.apps.googleusercontent.com",
  API_URL: "https://script.google.com/macros/s/請填入部署ID/exec",
  IDLE_MINUTES: 30   /* 閒置多久自動登出 */
};
