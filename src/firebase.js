// ---------------------------------------------------------------------------
// FIREBASE SETUP
// ---------------------------------------------------------------------------
// 1. Go to https://console.firebase.google.com, create a project (free tier
//    is plenty for this).
// 2. In the project, click "Add app" -> Web (</>), register the app.
// 3. Copy the firebaseConfig object it gives you and paste it below,
//    replacing the placeholder values.
// 4. In the Firebase console: Build > Authentication > Get started > enable
//    "Email/Password" (and "Google" if you want that sign-in option too).
// 5. In the Firebase console: Build > Firestore Database > Create database >
//    start in production mode. Then go to the "Rules" tab and paste in the
//    rules from firestore.rules.txt in this project (see that file for why).
// ---------------------------------------------------------------------------

import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  updateProfile,
} from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentSingleTabManager, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCPpBWC7Nz-a7QiIA6iHGCrgKjiEKu88Ng",
  authDomain: "kcal-tracker-1adb3.firebaseapp.com",
  projectId: "kcal-tracker-1adb3",
  storageBucket: "kcal-tracker-1adb3.firebasestorage.app",
  messagingSenderId: "268027025012",
  appId: "1:268027025012:web:e2be0adca398d0d96ca321"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Persistent local cache: lets you view (and even edit — synced once back online)
// your log without a signal, since data is cached on-device automatically.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
});

// ---- Auth helpers ----
export function signUp(email, password, displayName) {
  return createUserWithEmailAndPassword(auth, email, password).then((cred) => {
    if (displayName) return updateProfile(cred.user, { displayName }).then(() => cred);
    return cred;
  });
}
export function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}
export function signInWithGoogle() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}
export function signOutUser() {
  return signOut(auth);
}
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

// ---- Personal data (scoped to the signed-in user) ----
export async function getUserTargets(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data().targets : null;
}
export async function setUserTargets(uid, targets) {
  await setDoc(doc(db, "users", uid), { targets }, { merge: true });
}

export async function getDay(uid, date) {
  const snap = await getDoc(doc(db, "users", uid, "days", date));
  return snap.exists() ? snap.data() : null; // { entries, water, activity }
}
export async function setDay(uid, date, data) {
  await setDoc(doc(db, "users", uid, "days", date), data, { merge: true });
}

// ---- Shared household data (combos + personal food library) ----
// NOTE: this is intentionally a single shared document, not per-household —
// fine for two people sharing one app. If you ever open this up to more
// people, you'd want a proper household/invite system instead.
export async function getSharedLibrary() {
  const snap = await getDoc(doc(db, "shared", "library"));
  return snap.exists() ? snap.data() : { combos: [], customFoods: [] };
}
export async function setSharedLibrary(data) {
  await setDoc(doc(db, "shared", "library"), data, { merge: true });
}