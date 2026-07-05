import React, { useState } from "react";
import { signIn, signUp, signInWithGoogle } from "./firebase.js";

export default function AuthScreen({ styles }) {
  const [mode, setMode] = useState("signin"); // 'signin' | 'signup'
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(ev) {
    ev.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUp(email.trim(), password, name.trim());
      } else {
        await signIn(email.trim(), password);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.lockScreen}>
      <div style={styles.lockCard}>
        <h2 style={styles.lockTitle}>{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
        <p style={styles.lockSub}>
          {mode === "signup" ? "Your own log, targets, and weekly view." : "Sign in to see your log."}
        </p>

        <form onSubmit={handleSubmit} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
          {mode === "signup" && (
            <input
              style={styles.textInput}
              placeholder="Your name"
              value={name}
              onChange={(ev) => setName(ev.target.value)}
            />
          )}
          <input
            style={styles.textInput}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            required
          />
          <input
            style={styles.textInput}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            minLength={6}
            required
          />
          <div style={styles.lockErrorSlot}>{error && <p style={styles.lockError}>{error}</p>}</div>
          <button
            type="submit"
            style={{ ...styles.lockUnlockBtn, ...(busy ? { opacity: 0.6 } : {}) }}
            disabled={busy}
          >
            {mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <button style={styles.lockForgot} onClick={handleGoogle} disabled={busy}>
          or continue with Google
        </button>

        <button
          style={styles.lockForgot}
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError("");
          }}
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </div>
    </div>
  );
}

function friendlyError(e) {
  const code = e && e.code ? e.code : "";
  if (code.includes("email-already-in-use")) return "That email's already registered — try signing in instead.";
  if (code.includes("invalid-credential") || code.includes("wrong-password")) return "Wrong email or password.";
  if (code.includes("user-not-found")) return "No account found with that email.";
  if (code.includes("weak-password")) return "Password needs to be at least 6 characters.";
  if (code.includes("invalid-email")) return "That doesn't look like a valid email.";
  return "Something went wrong — try again.";
}
