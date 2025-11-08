# Fix: QR Codes Not Containing URLs

## Problem
QR codes are being generated but they don't contain the URL - they only show the ticket ID.

## Root Cause
The service worker is caching the old `script.js` file, so the browser is using the cached version instead of the updated one with URL support.

## Solution

### Option 1: Clear Cache and Reload (Quickest)
1. **Open your app in the browser**
2. **Open Developer Tools** (F12 or Right-click → Inspect)
3. **Go to Application tab** (Chrome) or **Storage tab** (Firefox)
4. **Click "Clear storage"** or **"Clear site data"**
5. **Check all boxes** (Cache, Service Workers, Local Storage, etc.)
6. **Click "Clear site data"**
7. **Reload the page** (Ctrl+R or Cmd+R)
8. **Generate new tickets** - they should now contain URLs

### Option 2: Update Service Worker (Already Done)
I've updated the service worker cache version to `v3`. Now:
1. **Hard refresh the page** (Ctrl+Shift+R or Cmd+Shift+R)
2. **Wait a few seconds** for the service worker to update
3. **Generate new tickets** - they should now contain URLs

### Option 3: Manual Service Worker Update
1. **Open Developer Tools** (F12)
2. **Go to Application tab** → **Service Workers**
3. **Click "Unregister"** next to the service worker
4. **Reload the page**
5. **Generate new tickets**

## Verification

### Check if URLs are in QR codes:
1. **Open your app**
2. **Generate a test ticket**
3. **Open Developer Tools Console** (F12 → Console)
4. **Look for log messages** like: `[QR] Generating QR for ticket LHG-TK01-XXXX: https://program-pro-1.onrender.com?ticket=LHG-TK01-XXXX`
5. **Scan the QR code** with your phone camera - it should open the URL

### Test QR Code Content:
1. **Open `debug-qr-content.html`** in your browser
2. **Check the configuration** - it should show URL mode enabled
3. **Generate a test QR** - verify it contains the URL

## What Was Fixed

1. ✅ Updated `script.js` to use URL format: `https://program-pro-1.onrender.com?ticket=TICKET-ID`
2. ✅ Updated service worker cache version to `v3` to force refresh
3. ✅ Added debug logging to verify QR content
4. ✅ QR codes now generate with URLs when `USE_URL_IN_QR = true`

## Important Notes

- **Existing tickets** generated before this fix will still have only ticket IDs
- **You need to generate NEW tickets** after clearing the cache
- **Service worker cache** needs to be cleared for the changes to take effect
- **Browser cache** might also need to be cleared

## After Fixing

1. ✅ Clear cache and reload
2. ✅ Generate new test tickets
3. ✅ Check console logs to verify URLs in QR codes
4. ✅ Scan QR code with phone camera - should open URL
5. ✅ Test with app scanner - should extract ticket ID correctly

## Still Not Working?

If QR codes still don't contain URLs after clearing cache:

1. **Check browser console** for errors
2. **Verify `USE_URL_IN_QR` is `true`** in script.js
3. **Verify `TICKET_BASE_URL`** is set correctly
4. **Check if service worker is still using old cache**
5. **Try in incognito/private mode** to bypass cache
6. **Check network tab** to see which script.js is being loaded
