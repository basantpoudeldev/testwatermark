// Lightweight cookie consent banner. Shown once until the visitor makes a
// choice. Analytics (GA) and ads (AdSense) only load after "Accept" — if
// the visitor rejects or hasn't decided yet, window.__proofmarkLoadTracking()
// (defined in ga-loader.js) is simply never called.
(function(){
  var CONSENT_KEY = 'proofmark_cookie_consent'; // "accepted" | "rejected"

  function injectStyles(){
    var css = `
      #pm-consent-banner{
        position:fixed; left:16px; right:16px; bottom:16px; z-index:9999;
        max-width:560px; margin:0 auto;
        background:#171b24; border:1px solid #2a3040; border-radius:10px;
        padding:18px 20px; color:#f2efe7;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
        font-size:13px; line-height:1.5;
        box-shadow:0 8px 30px rgba(0,0,0,0.4);
      }
      #pm-consent-banner p{margin:0 0 12px; color:#d9d5cb;}
      #pm-consent-banner a{color:#c9a15a;}
      #pm-consent-banner .pm-actions{display:flex; gap:10px; flex-wrap:wrap;}
      #pm-consent-banner button{
        font-family:inherit; font-size:13px; font-weight:600; cursor:pointer;
        padding:9px 16px; border-radius:6px; border:1px solid #2a3040;
      }
      #pm-consent-accept{background:#c9a15a; color:#161616; border:none;}
      #pm-consent-reject{background:transparent; color:#9aa1b0;}
    `;
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  function showBanner(){
    injectStyles();
    var el = document.createElement('div');
    el.id = 'pm-consent-banner';
    el.innerHTML =
      '<p>This site uses optional cookies for analytics and ads to help keep the tool free. ' +
      'Your uploaded files are never affected by this choice — they never leave your browser either way. ' +
      '<a href="/privacy.html">Learn more</a>.</p>' +
      '<div class="pm-actions">' +
        '<button id="pm-consent-accept">Accept</button>' +
        '<button id="pm-consent-reject">Reject</button>' +
      '</div>';
    document.body.appendChild(el);

    document.getElementById('pm-consent-accept').addEventListener('click', function(){
      localStorage.setItem(CONSENT_KEY, 'accepted');
      el.remove();
      if(window.__proofmarkLoadTracking) window.__proofmarkLoadTracking();
    });
    document.getElementById('pm-consent-reject').addEventListener('click', function(){
      localStorage.setItem(CONSENT_KEY, 'rejected');
      el.remove();
    });
  }

  function init(){
    var choice = null;
    try{ choice = localStorage.getItem(CONSENT_KEY); }catch(e){}
    if(choice === 'accepted'){
      if(window.__proofmarkLoadTracking) window.__proofmarkLoadTracking();
    } else if(choice === 'rejected'){
      // do nothing — tracking stays off
    } else {
      showBanner();
    }
  }

  // exposed so a future "Cookie settings" link in the footer can reopen the choice
  window.__proofmarkOpenCookieSettings = function(){
    try{ localStorage.removeItem(CONSENT_KEY); }catch(e){}
    var existing = document.getElementById('pm-consent-banner');
    if(existing) existing.remove();
    showBanner();
  };

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
