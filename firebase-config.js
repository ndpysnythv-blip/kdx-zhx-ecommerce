// Firebase 配置文件
// 请从 Firebase 控制台获取你的实际配置并替换下面的内容

const firebaseConfig = {
  // 请替换为你自己的 Firebase 配置
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

// Firebase 初始化检查
function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== "YOUR_API_KEY";
}

// 如果还没有配置，显示提示
if (!isFirebaseConfigured()) {
  console.warn(
    "⚠️ Firebase 未配置！请按以下步骤配置：\n" +
    "1. 访问 https://console.firebase.google.com\n" +
    "2. 创建新项目或选择现有项目\n" +
    "3. 进入项目设置 -> 常规 -> 添加应用 -> Web应用\n" +
    "4. 复制配置信息替换 firebase-config.js 中的内容"
  );
}

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
  module.exports = firebaseConfig;
}
