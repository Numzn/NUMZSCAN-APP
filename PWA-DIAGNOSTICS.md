# PWA Installation Diagnostics

## Quick Fix Steps

### 1. **Check Browser Console (F12)**
Open browser console and look for:
- `[SW] Service Worker registered successfully`
- `[PWA] ✅ beforeinstallprompt event fired!`
- Any error messages

### 2. **Verify Requirements**

The PWA install prompt **REQUIRES**:

✅ **HTTPS or localhost** - Must be `http://localhost` or `https://...`
❌ File protocol won't work: `file:///` 

✅ **Service Worker registered** - Check console for registration
✅ **Valid manifest.json** - Check Application tab → Manifest
✅ **Valid icons** - icon-192.png and icon-512.png must load
✅ **Modern browser** - Chrome/Edge 89+, Firefox 78+, Safari 14+

### 3. **Common Issues & Fixes**

#### Issue: "beforeinstallprompt not firing"
**Fix:**
- Must use `localhost` or HTTPS (not `file://`)
- Clear browser cache
- Hard refresh (Ctrl+Shift+R)
- Check service worker is registered

#### Issue: "Service Worker not registering"
**Fix:**
- Use localhost: `http://localhost:8000` (not file://)
- Check browser console for errors
- Verify service-worker.js exists
- Clear service workers: Application → Service Workers → Unregister

#### Issue: "Install button not showing"
**Fix:**
- Check Dashboard → Settings tab
- Open browser console (F12)
- Look for `[PWA] ✅ beforeinstallprompt event fired!`
- If not shown, check requirements above

#### Issue: "Already installed"
**Fix:**
- If already installed, button won't show
- Check: Application → Service Workers → Unregister
- Clear site data and reload

### 4. **Manual Installation (If prompt doesn't appear)**

**Chrome/Edge Desktop:**
- Look for install icon (⊕) in address bar
- Or: Menu (⋮) → Install "Offline QR Ticket System"

**Chrome Android:**
- Menu (⋮) → Install app
- Or: Menu → Add to Home screen

**Safari iOS:**
- Share button (square with arrow) → Add to Home Screen

### 5. **Test Checklist**

Run these checks in browser console (F12):

```javascript
// Check 1: Service Worker
navigator.serviceWorker.getRegistration().then(r => 
  console.log('SW:', r ? 'Registered' : 'Not registered')
);

// Check 2: HTTPS/Localhost
console.log('Secure:', location.protocol === 'https:' || 
  location.hostname === 'localhost');

// Check 3: Manifest
fetch('manifest.json').then(r => r.json()).then(m => 
  console.log('Manifest:', m)
);

// Check 4: Icons
['icon-192.png', 'icon-512.png'].forEach(icon => 
  fetch(icon).then(r => console.log(icon, r.ok ? 'OK' : 'MISSING'))
);
```

### 6. **Force Reset (Nuclear Option)**

If nothing works:

1. **Open DevTools (F12)**
2. **Application tab:**
   - Service Workers → Unregister all
   - Cache Storage → Delete all
   - Storage → Clear site data
3. **Close browser completely**
4. **Restart browser**
5. **Open `http://localhost:8000`**
6. **Check console for errors**

### 7. **Still Not Working?**

Check these:
- ✅ Using `localhost` or HTTPS?
- ✅ Service worker registered?
- ✅ Manifest valid? (Application → Manifest)
- ✅ Icons loading? (check Network tab)
- ✅ Modern browser? (Chrome/Edge recommended)
- ✅ Not already installed?

If all checks pass but still no prompt:
- Browser may have dismissed prompt before
- Try different browser
- Try incognito/private mode
- Use manual installation method

