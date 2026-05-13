// 通用加载器工具
window.AppLoader = {
    statusTexts: [
        '正在处理...',
        '正在加载资源...',
        '正在连接服务器...',
        '正在获取数据...',
        '即将完成...'
    ],
    
    statusIndex: 0,
    statusInterval: null,
    statusElement: null,
    loaderContainer: null,
    autoHideOnLoad: true, // 默认自动隐藏
    
    init() {
        // 优先读取全局配置
        if (window.AppLoaderConfig && typeof window.AppLoaderConfig.autoHideOnLoad !== 'undefined') {
            this.autoHideOnLoad = window.AppLoaderConfig.autoHideOnLoad;
        }
        
        this.loaderContainer = document.getElementById('appLoader');
        this.statusElement = document.getElementById('loaderStatus');
        
        if (this.loaderContainer && this.statusElement) {
            this.startStatusRotation();
        }
    },
    
    startStatusRotation() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }
        
        this.statusInterval = setInterval(() => {
            this.statusIndex = (this.statusIndex + 1) % this.statusTexts.length;
            if (this.statusElement) {
                this.statusElement.textContent = this.statusTexts[this.statusIndex];
            }
        }, 1200);
    },
    
    show(message) {
        if (this.loaderContainer) {
            this.loaderContainer.classList.remove('hidden');
            if (message && this.statusElement) {
                this.statusElement.textContent = message;
                clearInterval(this.statusInterval);
            } else {
                this.startStatusRotation();
            }
        }
    },
    
    hide() {
        if (this.loaderContainer) {
            this.loaderContainer.classList.add('hidden');
            clearInterval(this.statusInterval);
        }
    },
    
    setMessage(message) {
        if (this.statusElement) {
            this.statusElement.textContent = message;
            clearInterval(this.statusInterval);
        }
    },
    
    hideAfter(delay) {
        setTimeout(() => {
            this.hide();
        }, delay);
    }
};

// 页面加载完成后初始化加载器
document.addEventListener('DOMContentLoaded', () => {
  AppLoader.init();
  
  // 稍微延迟一下执行，确保配置已经设置完成
  setTimeout(() => {
    // 只有当 autoHideOnLoad 为 true 时才自动隐藏
    if (AppLoader.autoHideOnLoad) {
      // 页面加载完成后延迟隐藏
      setTimeout(() => {
        AppLoader.hide();
      }, 1500);
    } else {
      // 如果不自动隐藏，则确保初始状态是隐藏的
      AppLoader.hide();
    }
  }, 50);
});