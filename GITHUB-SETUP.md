# GitHub Repository Setup Guide

## ✅ Step 1: Create Repository on GitHub

1. Go to [GitHub.com](https://github.com) and sign in
2. Click the **"+"** icon in top right → **"New repository"**
3. Fill in:
   - **Repository name:** `OfflineQRApp` (or your preferred name)
   - **Description:** `Offline QR Ticket System - Generate, Print, Scan, Track tickets as a PWA`
   - **Visibility:** Choose Public or Private
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
4. Click **"Create repository"**

## ✅ Step 2: Connect Local Repository to GitHub

After creating the repository, GitHub will show you commands. Use these:

```bash
# Add GitHub remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/OfflineQRApp.git

# Or if you prefer SSH:
git remote add origin git@github.com:YOUR_USERNAME/OfflineQRApp.git

# Rename branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

## ✅ Step 3: Verify

1. Refresh your GitHub repository page
2. You should see all your files
3. The README.md will display automatically

## 📝 Optional: Enable GitHub Pages (Free Hosting!)

1. Go to your repository on GitHub
2. Click **Settings** tab
3. Scroll to **Pages** section (left sidebar)
4. Under **Source**, select **"Deploy from a branch"**
5. Select **"main"** branch and **"/ (root)"** folder
6. Click **Save**
7. Wait a few minutes, then visit: `https://YOUR_USERNAME.github.io/OfflineQRApp/`

## 🔄 Future Updates

To push changes later:

```bash
git add .
git commit -m "Description of your changes"
git push
```

## 📋 Repository Structure

Your repository should include:
- ✅ `index.html` - Main app
- ✅ `style.css` - Styles
- ✅ `script.js` - Logic
- ✅ `manifest.json` - PWA manifest
- ✅ `service-worker.js` - Service worker
- ✅ `icon-192.png` & `icon-512.png` - Icons
- ✅ `qrcode.min.js` & `html5-qrcode.min.js` - Libraries
- ✅ `README.md` - Documentation
- ✅ `.gitignore` - Git ignore rules
- ✅ `start-server.bat` & `start-server.sh` - Server scripts

## 🎯 Repository is Ready!

Your local repository is initialized and ready to push. Just create the GitHub repo and follow Step 2 above!






