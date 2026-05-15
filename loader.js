// 加载器工具类
const AppLoader = {
  show: function(message = '加载中...') {
    const loader = document.getElementById('appLoader');
    const status = document.getElementById('loaderStatus');
    
    if (loader) {
      loader.classList.remove('hidden');
      loader.style.opacity = '1';
      loader.style.visibility = 'visible';
      loader.style.display = 'flex';
    }
    
    if (status) {
      status.innerHTML = message + '<span class="loader-dots"><span></span><span></span><span></span></span>';
    }
    
    console.log('AppLoader shown with message:', message);
  },
  
  hide: function() {
    const loader = document.getElementById('appLoader');
    
    if (loader) {
      loader.classList.add('hidden');
      loader.style.opacity = '0';
      loader.style.visibility = 'hidden';
      loader.style.display = 'none';
    }
    
    console.log('AppLoader hidden');
  },
  
  updateStatus: function(message) {
    const status = document.getElementById('loaderStatus');
    
    if (status) {
      status.innerHTML = message + '<span class="loader-dots"><span></span><span></span><span></span></span>';
    }
  }
};

// 暴露到全局
window.AppLoader = AppLoader;
