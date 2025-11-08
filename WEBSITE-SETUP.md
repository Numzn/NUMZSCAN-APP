# Website Setup for Ticket URLs

Your QR codes point to `https://program-pro-1.onrender.com/t/TICKET-ID`, but your website needs to handle these URLs.

## Solution Options

### Option 1: Static HTML with Client-Side Routing (Simplest)

If your website is a static site (HTML/CSS/JS), you can use one of these methods:

#### Method A: Single HTML Page with JavaScript Routing

1. **Create a file** `ticket-page.html` (already created for you in this project)
2. **Configure your web server** to serve this file for `/t/*` routes

**For Render (Static Site):**
- Upload `ticket-page.html` to your Render static site
- Configure redirects in `_redirects` file or Render dashboard:
  ```
  /t/*  /ticket-page.html  200
  ```

#### Method B: Netlify (if using Netlify)

Create `_redirects` file in your public folder:
```
/t/*  /ticket-page.html  200
```

### Option 2: Server-Side Routing

If you have a backend server (Node.js, Python, etc.), add a route:

#### Node.js/Express Example:
```javascript
app.get('/t/:ticketId', (req, res) => {
  const ticketId = req.params.ticketId;
  // Render ticket page with ticketId
  res.render('ticket', { ticketId });
  // Or serve static HTML with ticketId injected
});
```

#### Python/Flask Example:
```python
@app.route('/t/<ticket_id>')
def show_ticket(ticket_id):
    return render_template('ticket.html', ticket_id=ticket_id)
```

#### Python/FastAPI Example:
```python
@app.get("/t/{ticket_id}")
async def show_ticket(ticket_id: str):
    return {"ticket_id": ticket_id, "status": "valid"}
```

### Option 3: React/Next.js (if using React)

```javascript
// pages/t/[id].js (Next.js)
export default function TicketPage({ ticketId }) {
  return (
    <div>
      <h1>Ticket: {ticketId}</h1>
      {/* Your ticket display component */}
    </div>
  );
}

export async function getServerSideProps({ params }) {
  return {
    props: {
      ticketId: params.id
    }
  };
}
```

## Quick Setup for Render Static Site

1. **Upload `ticket-page.html`** to your Render static site project
2. **Rename it to `index.html`** if it's your main page, OR
3. **Configure Render redirects:**
   - Go to Render Dashboard → Your Site → Settings → Redirects/Rewrites
   - Add: `/t/* → /ticket-page.html` (Status: 200)

## Testing

After setup, test:
- `https://program-pro-1.onrender.com/t/LHG-TK01-TEST`
- Should display the ticket page with the ticket ID

## Customization

Edit `ticket-page.html` to:
- Match your event branding
- Fetch ticket details from an API
- Display event-specific information
- Show ticket status (valid/used/expired)

## Need Help?

If you share:
1. What framework/platform your website uses (React, Node.js, Python, static HTML, etc.)
2. Where your website code is hosted

I can provide specific setup instructions for your setup!
