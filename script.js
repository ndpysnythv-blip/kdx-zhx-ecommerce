function openApp(appName) {
    const apps = {
        'shop': './shop/shop.html'
    };

    const url = apps[appName];
    if (url) {
        window.location.href = url;
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const appCards = document.querySelectorAll('.app-card');
    
    appCards.forEach(card => {
        card.addEventListener('click', function(e) {
            if (e.target.closest('.app-button')) {
                return;
            }
            
            const appName = this.getAttribute('data-app');
            if (appName && appName !== 'add' && !this.classList.contains('coming-soon')) {
                openApp(appName);
            }
        });
    });

    const addCard = document.querySelector('.app-card.add-new');
    if (addCard) {
        addCard.addEventListener('click', function() {
            console.log('添加新应用功能待实现');
        });
    }
});
