# Netlify Deployment Guide

## ✅ Netlify Build Settings

Since this is a **static PWA** with no build process, configure Netlify as follows:

### Required Settings:

1. **Branch to deploy:** `main` ✅

2. **Base directory:** 
   - Leave **EMPTY** (or `.`)
   - The root directory is where your files are

3. **Build command:**
   - Leave **EMPTY**
   - No build process needed (this is a static site)

4. **Publish directory:**
   - Enter: `.` (dot = root directory)
   - Or: `/` (forward slash = root)
   - This tells Netlify where `index.html` is located

5. **Functions directory:**
   - Leave as default: `netlify/functions`
   - Or leave empty (you don't need functions)

### Summary:
```
Branch to deploy:     main
Base directory:       [empty]
Build command:        [empty]
Publish directory:    .
Functions directory:  netlify/functions (or empty)
```

## 🚀 Quick Deploy Steps

### Option 1: Deploy via Netlify UI

1. Go to [Netlify](https://app.netlify.com)
2. Click **"Add new site"** → **"Import an existing project"**
3. Choose **"GitHub"** and authenticate
4. Select your repository: `Numzn/NUMZSCAN-APP`
5. Configure build settings as shown above
6. Click **"Deploy site"**

### Option 2: Use `netlify.toml` (Recommended)

I've created a `netlify.toml` file in your project. With this file, Netlify will automatically use the correct settings!

Just deploy and Netlify will read the config file automatically.

## 🔧 Environment Variables

You don't need any environment variables for this PWA. Leave this section empty.

## ✅ After Deployment

1. Netlify will assign a URL like: `https://random-name-123.netlify.app`
2. You can customize it in **Site settings** → **Change site name**
3. Your PWA will be accessible at that URL
4. HTTPS is automatically enabled (required for PWA)

## 🔄 Auto-Deploy on Git Push

Netlify automatically:
- Detects new commits to `main` branch
- Triggers a new deployment
- Updates your live site

## 📱 PWA Considerations

After deployment, verify:
- ✅ Service Worker works (check in DevTools → Application → Service Workers)
- ✅ Manifest loads correctly (check in DevTools → Application → Manifest)
- ✅ Icons display properly
- ✅ App works offline after first visit

## 🐛 Troubleshooting

If deployment fails:
1. Check **Deploy logs** in Netlify dashboard
2. Verify `index.html` is in the root directory
3. Ensure all files are pushed to GitHub
4. Clear Netlify cache: **Site settings** → **Build & deploy** → **Clear cache and retry deploy**

## 📝 Custom Domain (Optional)

1. Go to **Site settings** → **Domain management**
2. Add your custom domain
3. Follow DNS configuration instructions
4. Netlify will handle SSL automatically

