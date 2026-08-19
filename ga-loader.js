// This no longer runs automatically on page load. consent.js calls
// window.__proofmarkLoadTracking() only after the visitor accepts cookies,
// or immediately on future visits if they already accepted before.
window.__proofmarkLoadTracking = function(){
  var cfg = window.SITE_CONFIG || {};

  if(cfg.GA_MEASUREMENT_ID){
    var gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + cfg.GA_MEASUREMENT_ID;
    document.head.appendChild(gaScript);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', cfg.GA_MEASUREMENT_ID);
  }

  if(cfg.ADSENSE_CLIENT_ID){
    var adScript = document.createElement('script');
    adScript.async = true;
    adScript.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + cfg.ADSENSE_CLIENT_ID;
    adScript.crossOrigin = 'anonymous';
    document.head.appendChild(adScript);
  }
};
