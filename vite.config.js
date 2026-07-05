import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: change "kcal-tracker" below to match your GitHub repo name exactly.
// If your repo is github.com/yourname/kcal-tracker, base should be "/kcal-tracker/".
// If you're deploying to a custom domain (not github.io/reponame), set base to "/".
export default defineConfig({
  plugins: [react()],
  base: "/kcal-tracker/",
});
