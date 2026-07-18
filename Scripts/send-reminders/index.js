// Runs on a schedule via GitHub Actions (see .github/workflows/send-reminders.yml).
// Checks every signed-up user's chosen reminder time against the current time in
// the UK, and sends a push notification to anyone whose time has come round and
// who hasn't already been reminded today.

const admin = require("firebase-admin");
const webpush = require("web-push");

function getEnvOrExit(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

// ---- Set up Firebase Admin using the service account secret ----
const serviceAccount = JSON.parse(getEnvOrExit("FIREBASE_SERVICE_ACCOUNT"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ---- Set up web-push using the VAPID key pair secrets ----
webpush.setVapidDetails(
  getEnvOrExit("VAPID_SUBJECT"), // e.g. "mailto:you@example.com"
  getEnvOrExit("VAPID_PUBLIC_KEY"),
  getEnvOrExit("VAPID_PRIVATE_KEY")
);

// Current time in the UK (handles BST/GMT automatically)
function nowInUK() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return { hh: get("hour"), mm: get("minute") };
}

function todayInUK() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date()); // YYYY-MM-DD
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

async function main() {
  const { hh, mm } = nowInUK();
  const nowMinutes = toMinutes(`${hh}:${mm}`);
  const today = todayInUK();

  const snap = await db.collection("users").get();
  let sent = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const { reminderTime, pushSubscription, lastReminderSent } = data;
    if (!reminderTime || !pushSubscription) continue;
    if (lastReminderSent === today) continue; // already reminded today

    const targetMinutes = toMinutes(reminderTime);
    // Send if we're within a 10-minute window after the target time — generous
    // enough to cover the odd delayed run without spamming or missing anyone.
    const withinWindow = nowMinutes >= targetMinutes && nowMinutes < targetMinutes + 10;
    if (!withinWindow) continue;

    try {
      await webpush.sendNotification(
        pushSubscription,
        JSON.stringify({
          title: "Kcal Tracker",
          body: "Don't forget to log today's food.",
        })
      );
      await doc.ref.set({ lastReminderSent: today }, { merge: true });
      sent++;
      console.log(`Sent reminder to ${doc.id}`);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        // Subscription is no longer valid (e.g. they removed the home screen app) — clear it
        await doc.ref.set({ pushSubscription: null }, { merge: true });
        console.log(`Cleared expired subscription for ${doc.id}`);
      } else {
        console.error(`Failed to send to ${doc.id}:`, err.message);
      }
    }
  }

  console.log(`Done. Sent ${sent} reminder(s) at ${hh}:${mm} UK time.`);
}

main().catch((err) => {
  console.error("Reminder job failed:", err);
  process.exit(1);
});