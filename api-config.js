// API 配置 - 前后端分离部署
const API_CONFIG = {
    // 后端 API 地址（Vercel 部署）
    baseUrl: window.location.origin,
  
  // 获取完整的 API 地址
  getApiUrl: function(endpoint) {
    // 如果是完整的 URL，直接返回
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }
    // 否则拼接基础 URL
    return this.baseUrl + endpoint;
  }
};

// 如果是浏览器环境，暴露到全局
if (typeof window !== 'undefined') {
  window.API_CONFIG = API_CONFIG;
}

// 如果是 Node.js 环境，导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API_CONFIG;
}
