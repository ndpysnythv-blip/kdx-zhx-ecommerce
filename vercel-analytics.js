// Vercel Web Analytics - Official Vanilla JavaScript Integration
// Documentation: https://vercel.com/docs/analytics/quickstart
(function() {
    // Initialize the global va function with a queue system
    window.va = window.va || function () { 
        (window.vaq = window.vaq || []).push(arguments); 
    };
    
    // Create and inject the official Vercel Analytics script
    var script = document.createElement('script');
    script.defer = true;
    // Use the official CDN endpoint as per latest documentation
    script.src = 'https://cdn.vercel-insights.com/v1/script.js';
    
    // Append to document head or body
    (document.head || document.body).appendChild(script);
    
    // Log successful initialization in development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('✅ Vercel Analytics initialized (development mode)');
    }
})();
