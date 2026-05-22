// 加载器工具类 - 用于智能客服回复等待动画
var AppLoader = {
  show: function(message) {
    message = message || '加载中...';
    var loader = document.getElementById('appLoader');
    var status = document.getElementById('loaderStatus');

    if (loader) {
      loader.classList.add('loader-visible');
    }

    if (status) {
      status.innerHTML = message + '<span class="loader-dots"><span></span><span></span><span></span></span>';
    }

    console.log('AppLoader shown with message:', message);
  },

  hide: function() {
    var loader = document.getElementById('appLoader');

    if (loader) {
      loader.classList.remove('loader-visible');
    }

    console.log('AppLoader hidden');
  },

  updateStatus: function(message) {
    var status = document.getElementById('loaderStatus');

    if (status) {
      status.innerHTML = message + '<span class="loader-dots"><span></span><span></span><span></span></span>';
    }
  }
};

window.AppLoader = AppLoader;