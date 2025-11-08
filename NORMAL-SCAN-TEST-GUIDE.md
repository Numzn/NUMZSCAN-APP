# Normal Camera Scan Test Guide

## Overview
This guide helps you verify that QR codes work correctly when scanned by normal phone cameras (not the app scanner).

## Complete Test Flow

### Step 1: Generate a Ticket in Your App
1. Open your QR ticket app
2. Go to the "Generate" tab
3. Generate 1 test ticket
4. The QR code should contain: `https://program-pro-1.onrender.com?ticket=LHG-TK01-XXXX`

### Step 2: Test with Test Page
1. Open `test-normal-scan.html` in your browser
2. It will automatically generate a test QR code
3. Verify the URL format is correct
4. Click "Test URL" to verify it opens

### Step 3: Test with Your Phone Camera
1. Open `test-normal-scan.html` on your computer
2. Open your phone's **camera app** (NOT a QR scanner app)
3. Point the camera at the QR code on your screen
4. Your phone should detect the QR code and show a notification
5. Tap the notification to open the URL
6. Your browser should open: `https://program-pro-1.onrender.com?ticket=LHG-TK01-TEST`

### Step 4: Verify Website Can Read Ticket
1. Open `simulate-website.html` in your browser
2. Add `?ticket=LHG-TK01-TEST` to the URL
3. The page should detect and display the ticket ID
4. This simulates what your actual website should do

### Step 5: Test with Actual Website
1. Make sure your website at `program-pro-1.onrender.com` has the ticket reading code
2. Scan a QR code with your phone camera
3. It should open your website with the ticket parameter
4. Your website should detect and handle the ticket ID

## Expected Behavior

### ✅ When Scanned by Normal Camera:
- Phone camera detects QR code
- Shows notification/link
- Opens browser automatically
- Navigates to: `https://program-pro-1.onrender.com?ticket=TICKET-ID`
- Your program website loads
- Website can read the ticket ID from URL

### ✅ When Scanned by App Scanner:
- App scanner reads QR code
- Extracts ticket ID from URL: `LHG-TK01-XXXX`
- Verifies ticket in local database
- Marks ticket as used if valid
- Works completely offline

## Verification Checklist

- [ ] QR codes generate with correct URL format
- [ ] URL uses query parameter: `?ticket=ID`
- [ ] Normal camera can detect QR code
- [ ] Browser opens automatically when QR is scanned
- [ ] URL opens correctly in browser
- [ ] Website can read ticket parameter from URL
- [ ] App scanner can extract ticket ID from URL
- [ ] App scanner verifies ticket correctly

## Troubleshooting

### Problem: QR code doesn't open in browser
**Solution:** 
- Make sure QR code contains a valid URL
- Check that the URL format is correct
- Verify your phone's camera has QR code detection enabled

### Problem: Website doesn't detect ticket
**Solution:**
- Add the ticket reading code to your website
- Check browser console for errors
- Verify URL parameter name matches: `?ticket=`

### Problem: App scanner can't extract ticket ID
**Solution:**
- Verify scanner code handles query parameters
- Check that URL format matches expected format
- Test with different URL formats

## Code for Your Website

Add this to your `program-pro-1.onrender.com` website:

```javascript
// Read ticket ID from URL
const urlParams = new URLSearchParams(window.location.search);
const ticketId = urlParams.get('ticket');

if (ticketId) {
  console.log('Ticket ID:', ticketId);
  // Display ticket info, validate, etc.
  // Your custom code here
}
```

## Test Files

- `test-normal-scan.html` - Comprehensive test page with QR code generator
- `simulate-website.html` - Simulates your website receiving a ticket
- `website-ticket-handler.js` - Ready-to-use code for your website

## Next Steps

1. ✅ Verify QR codes generate correctly
2. ✅ Test with phone camera
3. ✅ Add ticket reading code to your website
4. ✅ Test end-to-end flow
5. ✅ Deploy and test with real tickets
