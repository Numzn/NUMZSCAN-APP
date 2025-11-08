# 🚨 QUICK FIX: QR Codes Not Showing URLs

## The Problem
QR codes are only showing ticket IDs instead of URLs because the browser is using a cached version of `script.js`.

## The Fix (3 Steps)

### Step 1: Clear Browser Cache
1. Open your app in browser
2. Press **F12** to open Developer Tools
3. Right-click the **refresh button** → Click **"Empty Cache and Hard Reload"**
   - OR go to **Application tab** → **Clear storage** → **Clear site data**

### Step 2: Wait for Service Worker Update
1. The service worker will automatically update (cache version changed to v3)
2. Wait 5-10 seconds after reload
3. Check the console for: `[SW] Service worker activated`

### Step 3: Generate NEW Tickets
1. **Delete old tickets** (or just generate new ones)
2. **Generate new tickets** - they will now contain URLs
3. **Check the console** - you should see: `[QR] Generating QR for ticket...`

## Verify It Works

1. **Generate a ticket**
2. **Open browser console** (F12 → Console)
3. **Look for**: `[QR] Generating QR for ticket LHG-TK01-XXXX: https://program-pro-1.onrender.com?ticket=LHG-TK01-XXXX`
4. **Scan QR code** with phone camera - should open the URL

## Still Not Working?

Try this:
1. Open app in **Incognito/Private mode** (bypasses cache)
2. Generate a ticket
3. Check if QR code contains URL

If it works in incognito, the cache is the issue - clear it again.

## What Was Changed

✅ Service worker cache version: `v2` → `v3` (forces refresh)  
✅ Added debug logging to verify QR content  
✅ QR codes now generate with: `https://program-pro-1.onrender.com?ticket=TICKET-ID`

## Test File

Open `debug-qr-content.html` to verify the configuration is correct.
