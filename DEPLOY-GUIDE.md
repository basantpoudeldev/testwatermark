# Deploying Proofmark with GitHub + Render — a complete walkthrough

This guide assumes no prior experience with GitHub or Render. Follow it top to bottom.

**Total time:** about 20–30 minutes, plus some waiting while things upload/build.

---

## Before you start: the one file that needs special handling

Almost everything in this project is small. One file isn't: `vendor/ffmpeg-core/ffmpeg-core.wasm` is about 24MB (it's the video-processing engine). GitHub's website has a per-file upload limit that this file sits uncomfortably close to, so **don't use GitHub's "drag and drop files" web page** for the initial upload. Instead, use **GitHub Desktop**, a free application that avoids this limit entirely. Step 2 below covers installing it.

---

## Part 1 — Get your files ready

1. Download all the Proofmark files Claude gave you into a single folder on your computer. Keep the folder structure exactly as given — in particular, the `vendor` folder and everything inside it must stay together, in the same relative positions.
2. The main file is already named `index.html` — this is what makes it your site's homepage; no renaming needed on your end.
3. There's also a file called `render.yaml`. Leave it exactly where it is, at the top level alongside `index.html`. Render reads this automatically and configures itself — it removes the need to manually type settings into Render's dashboard in Part 5.

---

## Part 2 — Create a GitHub account and repository

GitHub is where your website's files will live. Render will connect to it and publish whatever's there.

1. Go to **github.com** and click **Sign up**. Follow the prompts (email, username, password). It's free.
2. Once logged in, click the **+** icon in the top-right corner, then **New repository**.
3. Give it a name — e.g. `proofmark-site`. No spaces; use hyphens instead.
4. Set it to **Public** (Render's free tier works with public repos without extra setup; you can make it private later if you want, but that requires a few extra steps).
5. Leave everything else as default. Do **not** check "Add a README file" — you want an empty repository.
6. Click **Create repository**. You'll land on an empty repo page with some setup instructions — you can ignore those, since you'll use GitHub Desktop instead.

---

## Part 3 — Install GitHub Desktop and upload your files

1. Go to **desktop.github.com** and download GitHub Desktop for your operating system. Install it and open it.
2. Sign in with the same GitHub account from Part 2.
3. In GitHub Desktop, go to **File → Clone Repository**. Find the repository you just created (`proofmark-site`) in the list and click **Clone**. Choose a location on your computer — this creates an empty folder linked to your GitHub repository.
4. Open that new folder in your file explorer (Finder on Mac, File Explorer on Windows).
5. Copy **all** of your Proofmark files and folders into this folder — including the renamed `index.html`, all the other `.html` pages, `app.js`, `pdftools.js`, `site.css`, the entire `vendor` folder, everything.
6. Switch back to GitHub Desktop. It will automatically detect all the new files and list them, ready to be uploaded (in GitHub terms, this is called a "commit").
7. At the bottom-left, type a short message describing this, e.g. `Initial upload of Proofmark site`.
8. Click **Commit to main**.
9. Click **Push origin** at the top (this is the actual upload step — it may take a few minutes because of the large file).
10. Once it finishes, go back to your repository page on github.com and refresh — you should see all your files listed there.

---

## Part 4 — Create a Render account and connect GitHub

1. Go to **render.com** and click **Get Started**. Choose **Sign up with GitHub** — this is the simplest option and automatically links the two accounts.
2. Authorize Render when GitHub asks for permission.

---

## Part 5 — Create the Static Site

Since your files now include a `render.yaml` file, the easiest and most reliable way to set this up is via Render's **Blueprint** flow, which reads that file and configures everything automatically — no manual settings to type in and get wrong.

**If you already created a Static Site on Render before and it showed "Not Found":** the cleanest fix is to delete that service and start fresh this way, rather than trying to fix its settings by hand.
1. In the Render dashboard, open that existing service, go to **Settings**, scroll to the bottom, and click **Delete Web Service**.
2. Continue with the steps below.

**Creating it fresh:**
1. In the Render dashboard, click **New +** (top right), then choose **Blueprint** (not "Static Site").
2. Render will show your connected GitHub repositories — select `proofmark-site`.
3. Render scans the repo, finds `render.yaml`, and shows you a preview of what it's about to create (a static site named `proofmark`). You don't need to type anything into Build Command or Publish Directory — the file already specifies them.
4. Click **Apply** (or **Create New Resources**, wording varies slightly).

Render will now fetch your files and publish them — this usually takes 1–3 minutes for a static site. You'll see a build log; when it says your deploy is live, you're done. Render gives you a free address that looks like `https://proofmark.onrender.com`.

*(If for any reason you'd rather not use the Blueprint flow, the manual "New → Static Site" approach still works — just be extra careful that Build Command is left blank and Publish Directory is exactly a single period: `.`)*

**A note on environment variables, either way:** you won't be asked for any, and that's correct — leave that section empty if you see it. This site has no build step, so there's nothing for an environment variable to configure at build time. Its two configurable values (Google Analytics ID and AdSense ID) live in the plain, editable `site-config.js` file instead — see Part 7.

---

## Part 6 — Test it

Open your new Render URL and click through the actual tool:
- Upload a photo and add a watermark
- Try the PDF Tools tab — merge or watermark a PDF
- Try a short video in the Video tab (this is the one that uses that large file — good to confirm it actually loads)

If anything looks broken, it's almost always one of two things: a file that didn't upload (double-check the `vendor` folder made it into GitHub), or a typo in the Publish Directory field (should be exactly `.`).

---

## Part 7 — Add your real Google Analytics and AdSense IDs

1. On your repository page on github.com, click on the file `site-config.js`.
2. Click the pencil (✏️) icon to edit it directly in your browser.
3. Replace the empty quotes with your real IDs, e.g.:
   ```
   GA_MEASUREMENT_ID: "G-ABC1234XYZ",
   ADSENSE_CLIENT_ID: "ca-pub-1234567890123456",
   ```
4. Scroll down, add a short commit message like "Add real analytics IDs," and click **Commit changes** directly on the `main` branch.
5. That's it — **Render automatically notices the change and redeploys your site within a minute or two**, no extra steps needed. This auto-redeploy-on-change is true for any future edit you make on GitHub, not just this one.
6. Also update `ads.txt` the same way — open it on GitHub, edit it, replace the placeholder with your real AdSense publisher ID (without the `ca-` prefix this time), and commit.

---

## Part 8 (optional) — Use your own domain name

If you own a domain (e.g. from Namecheap, GoDaddy, etc.):

1. In your Render static site's dashboard, go to **Settings → Custom Domains**.
2. Click **Add Custom Domain** and type your domain.
3. Render will show you a DNS record to add — go to wherever you manage your domain's DNS settings and add exactly what Render shows you.
4. This can take anywhere from a few minutes to a few hours to fully activate. Render automatically provides free HTTPS (the padlock icon) once it's verified.

---

## Making future updates

Any time you want to change something:
1. Either edit the file directly on github.com (small text-based tweaks), or edit it on your computer and use GitHub Desktop's Commit → Push flow again (for bigger changes or new files).
2. Render redeploys automatically. No need to touch the Render dashboard again unless you're changing settings like the custom domain.

---

## Quick troubleshooting

| Problem | Likely cause |
|---|---|
| Site loads but tool looks broken/unstyled | The `vendor` folder or `site.css` didn't fully upload — check they're present in your GitHub repo |
| Video tool doesn't work | `ffmpeg-core.wasm` (the large file) may not have uploaded correctly — re-check via GitHub Desktop, not the website uploader |
| Changing `site-config.js` doesn't seem to do anything | Make sure you committed directly to the `main` branch, and give Render a minute or two to redeploy — check the "Events" tab on your Render service to confirm a new deploy actually ran |
| AdSense ads aren't showing | This is expected at first — Google needs to review and approve your site before ads actually serve, which can take anywhere from hours to a couple of days |
| Site shows "Not Found" | Almost always means the files ended up nested inside an extra subfolder in your GitHub repo instead of sitting directly at the top level — check that `index.html` appears immediately when you open your repo on github.com, not after clicking into another folder first. This is the single most common mistake when copying files into the GitHub Desktop folder in Part 3. |
