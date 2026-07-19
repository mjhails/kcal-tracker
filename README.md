# Kcal Tracker

A UK nutrition tracker for two people — separate logs, targets, and weekly
views per account, with a shared meal library between you both.

## What's in here

- `src/App.jsx` — the whole app (food database, recipes, barcode scanning, etc.)
- `src/firebase.js` — Firebase config + all the database read/write helpers
- `src/AuthScreen.jsx` — the sign in / sign up screen
- `firestore.rules.txt` — security rules to paste into Firebase (see below)

## 1. Set up Firebase (one-time, ~10 minutes)

1. Go to https://console.firebase.google.com and create a new project
   (the free "Spark" plan is plenty for two people).
2. In your project: **Build → Authentication → Get started**.
   Enable **Email/Password**. Also enable **Google** if you want the
   "continue with Google" button to work.
3. In your project: **Build → Firestore Database → Create database**.
   Choose "start in production mode" (any region is fine).
4. Once created, go to the **Rules** tab and replace the contents with
   what's in `firestore.rules.txt` in this project, then click **Publish**.
5. Back on the project overview page, click the **</> (Web)** icon to
   register a new web app. Give it any nickname. It'll show you a
   `firebaseConfig` object — copy it.
6. Open `src/firebase.js` and paste your real values over the placeholder
   `firebaseConfig` object near the top of the file.

## 2. Run it locally

```bash
npm install
npm run dev
```

This opens the app at `http://localhost:5173`. Create an account with each
of your emails to test that logging, targets, and the shared meal library
all work as expected.

## 3. Deploy to GitHub Pages

1. Create a new GitHub repo (e.g. `kcal-tracker`) and push this project to it.
2. Open `vite.config.js` and make sure `base` matches your repo name exactly
   — e.g. if your repo is `github.com/yourname/kcal-tracker`, base should
   be `/kcal-tracker/`.
3. Install the deploy helper and publish:
   ```bash
   npm install --save-dev gh-pages
   npm run deploy
   ```
4. In your GitHub repo settings → **Pages**, set the source to the
   `gh-pages` branch (the deploy script creates this automatically).
5. Your app will be live at `https://yourname.github.io/kcal-tracker/`
   within a couple of minutes.

GitHub Pages serves everything over HTTPS automatically, which is required
for the camera-based barcode scanner to work on phones.

## 4. Add it to your home screen (optional but recommended)

Once it's live, open the URL on your phone in Safari/Chrome and use
"Add to Home Screen". It'll behave like a normal app icon from then on.

## 5. Set up daily reminder notifications (optional)

A "Daily reminder" toggle in Settings can push a notification to your phone
if you haven't logged anything by a time you pick. It needs a small amount
of one-time setup:

1. Generate a VAPID key pair (needs Node installed, no account or signup):
   ```bash
   npx web-push generate-vapid-keys
   ```
   This prints a Public Key and a Private Key.
2. Open `src/App.jsx` and paste the Public Key over the placeholder
   `VAPID_PUBLIC_KEY` near the top of the file.
3. In your GitHub repo settings → **Secrets and variables → Actions**, add:
   - `FIREBASE_SERVICE_ACCOUNT` — a Firebase service account key JSON.
     Get one from **Project settings → Service accounts → Generate new
     private key** in the Firebase console, then paste the whole file
     contents in as the secret value.
   - `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` — from step 1.
   - `VAPID_SUBJECT` — `mailto:` followed by your email address.
4. That's it — `.github/workflows/send-reminders.yml` runs every 5 minutes
   and pings anyone whose reminder time has come round and who hasn't been
   reminded yet today (see `Scripts/send-reminders/index.js`).

If you skip this, the "Daily reminder" toggle in Settings stays visible but
explains it isn't set up yet — nothing else in the app is affected.

## Notes on the data model

- Each signed-in user's personal data (daily log, water, activity, targets)
  lives under `users/{their-uid}/...` in Firestore — completely private to
  them, enforced by the security rules.
- Combos (saved quick meals) and any custom foods either of you types in
  live in one shared document (`shared/library`), visible to both of you.
  This is intentionally simple for a two-person household; if you ever
  wanted to open this app up to more people, that part would need a proper
  household/invite system instead of one shared document.
- The built-in food database and recipes (in `App.jsx`) aren't stored in
  Firestore at all — they're just part of the app code, so they load
  instantly and don't cost you any database reads.
