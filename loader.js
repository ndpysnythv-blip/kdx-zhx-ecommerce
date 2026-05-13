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
    
    init() {
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

// 页面加载完成后自动隐藏加载器
document.addEventListener('DOMContentLoaded', () => {
    AppLoader.init();
    
    // 页面加载完成后延迟隐藏
    setTimeout(() => {
        AppLoader.hide();
    }, 1500);
});