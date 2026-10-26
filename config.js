/* 部署設定：Google OAuth 用戶端 ID 與 Apps Script 網頁應用程式網址（兩者都不是機密資訊） */
window.APP_CONFIG = {
  CLIENT_ID: "252501394297-elpeg01gsms1lurbnfld1mgqqs7hk467.apps.googleusercontent.com",
  API_URL: "https://script.google.com/macros/s/AKfycbyxPTgrN5uDiSR19yKEh1qik0LwcZPmtsVQJKGCqClijOcWymZLHqUF2u9C4Yi2G-BK/exec",
  /* 手機整頁登入後的返回網址，必須與 Google Cloud「已授權的重新導向 URI」完全一致 */
  REDIRECT_URI: "https://aray6000-terry.github.io/project-tracker_claude/",
  IDLE_MINUTES: 30   /* 閒置多久自動登出 */
};
