// Logo 双击触发加载动画 - 通用脚本
(function() {
  var clickCount = 0;
  var clickTimer = null;

  function findLogo() {
    return document.getElementById('logo-link') ||
           document.querySelector('a[href="/shop"] h1') ||
           document.querySelector('header h1') ||
           document.querySelector('.logo-glow') ||
           document.querySelector('h1');
  }

  var logo = findLogo();
  if (!logo) return;

  var clickTarget = logo.closest('a') || logo;
  clickTarget.style.cursor = 'pointer';

  clickTarget.addEventListener('click', function(e) {
    clickCount++;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(function() {
      if (clickCount >= 2 && window.AppLoader) {
        e.preventDefault ? e.preventDefault() : null;
        AppLoader.show('KDX丨ZHX');
        setTimeout(function() { AppLoader.hide(); }, 2000);
      }
      clickCount = 0;
    }, 800);
  });
})();