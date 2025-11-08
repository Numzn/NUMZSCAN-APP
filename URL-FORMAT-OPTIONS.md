# URL Format Options for QR Codes

I've updated your QR codes to use query parameters, but you can change the format if needed.

## Current Format (Query Parameter)
```
https://program-pro-1.onrender.com?ticket=LHG-TK01-XXXX
```
✅ **Pros:** Works with any existing page, no routing needed  
✅ **Pros:** Opens directly on your program page  
❌ **Cons:** URL shows the parameter in address bar

## Alternative Format Options

### Option 1: Hash/Fragment (Clean URL, no page reload)
```javascript
// In script.js, change line 11 to:
const TICKET_BASE_URL = "https://program-pro-1.onrender.com#";
```
**Result:** `https://program-pro-1.onrender.com#LHG-TK01-XXXX`
✅ **Pros:** Clean URL, works with single-page apps  
✅ **Pros:** No page reload  
❌ **Cons:** Not sent to server (client-side only)

### Option 2: Path-based (If you add routing later)
```javascript
// In script.js, change line 11 to:
const TICKET_BASE_URL = "https://program-pro-1.onrender.com/t/";
```
**Result:** `https://program-pro-1.onrender.com/t/LHG-TK01-XXXX`
✅ **Pros:** Clean, SEO-friendly URLs  
❌ **Cons:** Requires routing setup on your website

### Option 3: Different Query Parameter Name
```javascript
// In script.js, change line 11 to:
const TICKET_BASE_URL = "https://program-pro-1.onrender.com?id=";
// or
const TICKET_BASE_URL = "https://program-pro-1.onrender.com?t=";
```
**Result:** `https://program-pro-1.onrender.com?id=LHG-TK01-XXXX`

## How to Read Ticket ID on Your Website

### Using Query Parameter (Current Setup)
Add this to your website's JavaScript:

```javascript
// Get ticket ID from URL
const urlParams = new URLSearchParams(window.location.search);
const ticketId = urlParams.get('ticket');

if (ticketId) {
  console.log('Ticket ID:', ticketId);
  // Do something with the ticket ID
  // Show ticket info, validate, etc.
}
```

### Using Hash/Fragment
```javascript
// Get ticket ID from hash
const ticketId = window.location.hash.substring(1); // Remove the #

if (ticketId) {
  console.log('Ticket ID:', ticketId);
}
```

### Using Path-based
```javascript
// Get ticket ID from path
const pathParts = window.location.pathname.split('/');
const ticketId = pathParts[pathParts.length - 1]; // Last segment

if (ticketId) {
  console.log('Ticket ID:', ticketId);
}
```

## Recommendation

**Use Query Parameter (current setup)** if:
- You want it to work immediately without website changes
- Your website already exists and you don't want to modify routing
- You want the ticket ID accessible on any page

**Use Hash/Fragment** if:
- Your website is a single-page app (React, Vue, etc.)
- You want clean URLs without page reloads
- The ticket ID is only needed client-side

**Use Path-based** if:
- You want SEO-friendly URLs
- You're planning to add server-side ticket validation
- You want dedicated ticket pages

## Test Your Setup

1. Generate a ticket in your app
2. Scan the QR code with a normal camera
3. Check if it opens: `https://program-pro-1.onrender.com?ticket=TICKET-ID`
4. Add the JavaScript snippet above to read the ticket ID
5. Verify the ticket ID is detected correctly
