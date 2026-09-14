# Offline QR Ticket System

A Progressive Web App (PWA) for generating, printing, scanning, and tracking QR code tickets - fully offline capable.

## NumzLab platform deployment

This app now runs as a NumzLab platform service (`/srv/projects/numzscan-app`), not as a static Netlify/Render site. A small Express API (`api/`) serves both the frontend and a `/api/*` sync backend, backed by this platform's shared `infra-postgres` — replacing the Supabase integration this repo originally shipped with (see "Cloud Sync" below).

```bash
cp .env.example .env   # fill in NUMZSCAN_DB_PASSWORD and NUMZSCAN_GATEWAY_BIND_IP
docker compose up -d --build
curl http://127.0.0.1:3210/api/health
```

Registered in the Platform Registry (`infrastructure/platform-registry/registry.yaml`, key `numzscan`) and routed at `numzscan.lab.numz.site` via the NumzLab Gateway. Not yet published to OCI/public DNS — internal-only until that's decided.

## 📦 Package Contents

```
numzscan-app/
├── index.html          # Ticket app shell (generate/scan/dashboard tabs)
├── main.js             # Ticket app logic (ES module)
├── modules/             # Ticket app modules (db, ui, scanner, sync bridge, ...)
├── sync.js              # Cloud sync client — talks to this app's own api/, not Supabase
├── fundraising.html     # Fundraising/OBS-overlay app shell
├── fundraising-main.js  # Fundraising app logic
├── modules/fundraising/ # Fundraising app modules
├── api/                  # Express + Postgres backend (serves both apps + /api/*)
├── style.css / manifest.json / service-worker.js
├── icon-192.png / icon-512.png
└── qrcode.min.js / html5-qrcode.min.js
```

## 🚀 Installation & Usage

### Option 1: Local Development Server (Recommended)

1. **Extract all files** to a folder on your computer
2. **Open a terminal/command prompt** in that folder
3. **Run a local server:**

   **Python 3:**
   ```bash
   python -m http.server 8000
   ```

   **Python 2:**
   ```bash
   python -m SimpleHTTPServer 8000
   ```

   **Node.js:**
   ```bash
   npx http-server -p 8000
   ```

   **PHP:**
   ```bash
   php -S localhost:8000
   ```

4. **Open in browser:** `http://localhost:8000`
5. **Install as PWA:** Click the "Install App" button in Settings, or use browser menu

### Option 2: Host on Web Server (HTTPS Required)

1. **Upload all files** to your web server (via FTP, cPanel, etc.)
2. **Ensure HTTPS is enabled** (required for PWA install prompt)
3. **Access via:** `https://yourdomain.com/path/to/app`
4. **Install as PWA:** Browser will show install prompt automatically

### Option 3: Desktop Distribution (Windows/Mac/Linux)

For distributing to users who may not have a web server:

1. **Create a ZIP file** with all files
2. **Include installation instructions:**
   - Extract ZIP file
   - Run `start-server.bat` (Windows) or `start-server.sh` (Mac/Linux)
   - Open browser to `http://localhost:8000`
   - Install as PWA

## 📋 System Requirements

- **Modern web browser:**
  - Chrome/Edge 89+ (recommended)
  - Firefox 78+
  - Safari 14+ (iOS 14+)
  - Opera 75+
- **For QR scanning:** Device with camera (mobile or webcam)
- **For printing:** Printer connected to device

## 🎯 Features

- ✅ **Generate QR Tickets** - Create unique ticket IDs (LHG-TK01-XXXX format)
- ✅ **Print QR Codes** - Generate printable sheets with QR codes
- ✅ **Scan & Validate** - Use device camera to scan and validate tickets
- ✅ **Track Status** - Dashboard shows used/unused ticket counts
- ✅ **Export/Import** - CSV export and JSON import for backup
- ✅ **Cloud CSV Import** - Import existing ticket IDs and sync through Supabase
- ✅ **Fully Offline** - Works without internet after first load
- ✅ **PWA Installable** - Install as native app on mobile/desktop

## 📱 Mobile Installation

### Android (Chrome/Edge)
1. Open the app in Chrome/Edge
2. Tap the menu (3 dots) → "Install app" or "Add to Home screen"
3. Or use the "Install App" button in Settings

### iOS (Safari)
1. Open the app in Safari
2. Tap the Share button → "Add to Home Screen"
3. The app will appear on your home screen

### Desktop (Chrome/Edge)
1. Look for install icon in address bar
2. Click it and follow prompts
3. Or use "Install App" button in Settings

## 🔧 Troubleshooting

### Service Worker Not Registering
- Ensure you're using `localhost` or HTTPS
- Check browser console for errors
- Clear browser cache and reload

### Icons Not Loading
- Verify `icon-192.png` and `icon-512.png` exist
- Check browser console for 404 errors
- Clear cache and hard refresh (Ctrl+Shift+R)

### Install Prompt Not Showing
- Ensure service worker is registered (check console)
- Verify manifest.json is valid
- Must be on HTTPS or localhost
- Clear browser data and try again

### QR Codes Not Generating
- Check browser console for library errors
- Ensure `qrcode.min.js` is loaded
- Try refreshing the page

### Camera Not Working
- Grant camera permissions when prompted
- Use HTTPS for production (required for camera)
- Check browser/device camera settings

## 📦 Distribution Checklist

When distributing this app:

- [ ] All 9 files included (see Package Contents above)
- [ ] Test on local server first
- [ ] Verify service worker registration
- [ ] Test install prompt functionality
- [ ] Test offline functionality (disconnect internet)
- [ ] Test QR generation and scanning
- [ ] Test print functionality
- [ ] Include README.md with instructions
- [ ] For ZIP distribution, include start scripts

## 🔐 Security Notes

- App runs entirely client-side (no server needed)
- Data stored in browser localStorage
- No data sent to external servers
- Works completely offline after first load

## ☁️ Cloud Sync

Multi-device sync no longer uses Supabase. An earlier version of this repo shipped a live Supabase `service_role` key committed to `supabase-config.js` — that file, `supabase-sync.js`, and `supabase-schema.sql` have been deleted, and the key should be rotated in the Supabase dashboard if it hasn't been already (it was exposed in a public repo).

Sync now goes through this platform's own API (`api/`, backed by `infra-postgres`) via `sync.js`, which the app's `main.js` uses through the same offline queue/retry design as before — no external dependency, and the client only ever gets access to a handful of ticket-scoped endpoints (create/update/scan a ticket), not raw database credentials.

Toggle it from the Dashboard tab's Cloud Sync card once the app is deployed behind the platform (see above) — nothing to configure client-side.

### CSV Import (Cloud Sync)

- Prepare a CSV file with a header row; only `id` is required. Optional columns: `active`, `created_at`, `used_at`, `created_by`, `notes`.
- In the Generator tab, click **Import CSV (Cloud)** and select the file.
- New tickets are saved locally and queued to Supabase; duplicates are skipped automatically.
- Imports work offline—the queue flushes once the device reconnects.

## 📝 License

This is a complete, self-contained PWA application.

## 🆘 Support

If you encounter issues:
1. Check browser console (F12) for errors
2. Verify all files are present
3. Ensure using localhost or HTTPS
4. Try clearing browser cache
5. Check browser compatibility

