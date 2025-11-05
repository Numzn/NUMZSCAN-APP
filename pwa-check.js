// PWA Installation Checker - Run this in browser console
console.log('=== PWA Installation Checker ===');

// Check 1: Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistration().then(reg => {
    if (reg) {
      console.log('✅ Service Worker: Registered', reg.scope);
    } else {
      console.log('❌ Service Worker: NOT registered');
    }
  });
} else {
  console.log('❌ Service Worker: Not supported');
}

// Check 2: Manifest
const manifestLink = document.querySelector('link[rel="manifest"]');
if (manifestLink) {
  fetch(manifestLink.href)
    .then(r => r.json())
    .then(manifest => {
      console.log('✅ Manifest: Found', manifest);
      console.log('   - Icons:', manifest.icons?.length || 0);
      console.log('   - Start URL:', manifest.start_url);
      console.log('   - Display:', manifest.display);
    })
    .catch(e => console.log('❌ Manifest: Error', e));
} else {
  console.log('❌ Manifest: Not found');
}

// Check 3: HTTPS/Localhost
const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
console.log(isSecure ? '✅ HTTPS/Localhost: Yes' : '❌ HTTPS/Localhost: No', location.href);

// Check 4: Already installed
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
console.log(isStandalone ? '✅ Already installed: Yes' : 'ℹ️ Already installed: No');

// Check 5: Icons
const icons = ['icon-192.png', 'icon-512.png'];
icons.forEach(icon => {
  fetch(icon, { method: 'HEAD' })
    .then(r => console.log(r.ok ? `✅ Icon: ${icon} exists` : `❌ Icon: ${icon} missing`))
    .catch(() => console.log(`❌ Icon: ${icon} error`));
});

// Check 6: beforeinstallprompt support
if ('onbeforeinstallprompt' in window) {
  console.log('✅ beforeinstallprompt: Supported');
} else {
  console.log('❌ beforeinstallprompt: Not supported in this browser');
}

console.log('=== End Check ===');

