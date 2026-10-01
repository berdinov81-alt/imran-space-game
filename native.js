(()=>{'use strict';
const native=window.Capacitor?.isNativePlatform?.();
document.addEventListener('imran:haptic',event=>{if(!ImranCampaign.profile.state.settings.vibration||native)return;try{navigator.vibrate?.(event.detail?.kind==='damage'?[25,30,45]:18)}catch(error){}});
// Browser install caches only the game's public static assets. Native builds bundle all assets.
if(!native&&'serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
