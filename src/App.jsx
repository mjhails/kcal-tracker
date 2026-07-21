import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  Search,
  Settings2,
  Trash2,
  Loader2,
  Barcode,
  BookOpen,
  LogOut,
  Flashlight,
  FlashlightOff,
  Weight,
} from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  auth,
  watchAuth,
  signOutUser,
  getUserTargets,
  setUserTargets,
  getDay,
  setDay,
  getSharedLibrary,
  setSharedLibrary,
  getReminderSettings,
  setReminderTime,
  setPushSubscription,
  getWeightLog,
  setWeightLog,
  setStartingWeight,
} from "./firebase.js";
import AuthScreen from "./AuthScreen.jsx";

// ---------------------------------------------------------------------------
// USDA FOOD DATA CENTRAL (second barcode lookup source)
// ---------------------------------------------------------------------------
// Ships using the public shared "DEMO_KEY", which works with no signup — but
// it's capped at just 10 requests/hour (shared with everyone else on your
// network using it), so it'll run out fast on a real shopping trip. Get your
// own free key for a 1,000/hour limit instead:
// 1. Go to https://fdc.nal.usda.gov/api-key-signup — fill in name + email, free.
// 2. You'll get a key (on screen and/or by email). Paste it below, replacing
//    DEMO_KEY.
// ---------------------------------------------------------------------------
const USDA_API_KEY = "DEMO_KEY";

// ---------------------------------------------------------------------------
// DAILY REMINDER PUSH NOTIFICATIONS
// ---------------------------------------------------------------------------
// 1. Generate a key pair: `npx web-push generate-vapid-keys` (needs no setup,
//    just Node installed). It prints a Public Key and a Private Key.
// 2. Paste the Public Key below, replacing the placeholder.
// 3. The Private Key (plus the Public Key again and a contact email) go into
//    GitHub repo secrets — see Scripts/send-reminders for what the scheduled
//    job that actually sends the notifications needs.
// If you leave the placeholder in place, the "Daily reminder" toggle in
// Settings stays disabled with an explanation, and nothing else breaks.
// ---------------------------------------------------------------------------
const VAPID_PUBLIC_KEY = "YOUR_VAPID_PUBLIC_KEY";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// ---------- Local UK-style food reference (CoFID-flavoured, per 100g) ----------
const FOOD_DB = [
  { name: "Baked beans, in tomato sauce", kcal: 75, protein: 4.8, carbs: 13, fat: 0.4, sat: 0.1, sugar: 5.3, unit: { grams: 200, label: "half tin" } },
  { name: "Wholemeal bread", kcal: 215, protein: 9.4, carbs: 39.7, fat: 2.5, sat: 0.5, sugar: 3.3, unit: { grams: 40, label: "slice" } },
  { name: "White bread", kcal: 235, protein: 8.4, carbs: 46.1, fat: 1.6, sat: 0.3, sugar: 3.4, unit: { grams: 36, label: "slice" } },
  { name: "Chicken breast, grilled", kcal: 165, protein: 31, carbs: 0, fat: 3.6, sat: 1, sugar: 0, unit: { grams: 150, label: "breast fillet" } },
  { name: "Basmati rice, boiled", kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, sat: 0.1, sugar: 0.1, unit: { grams: 180, label: "portion" } },
  { name: "Basmati rice, dried (uncooked)", kcal: 349, protein: 7.9, carbs: 79.1, fat: 1.4, sat: 0.3, sugar: 0.1, unit: { grams: 75, label: "portion (dry)" } },
  { name: "Semi-skimmed milk", kcal: 47, protein: 3.4, carbs: 4.8, fat: 1.7, sat: 1.1, sugar: 4.8, unit: { grams: 30, label: "splash (cereal/tea)" } },
  { name: "Cheddar cheese", kcal: 416, protein: 25.4, carbs: 0.1, fat: 34.9, sat: 21.7, sugar: 0.1, unit: { grams: 30, label: "slice" } },
  { name: "Porridge oats, made with water", kcal: 50, protein: 1.7, carbs: 8.6, fat: 1.1, sat: 0.2, sugar: 0.3, unit: { grams: 200, label: "bowl" } },
  { name: "Porridge oats, dry (uncooked)", kcal: 375, protein: 11.2, carbs: 60.4, fat: 8.7, sat: 1.5, sugar: 1, unit: { grams: 40, label: "portion (dry)" } },
  { name: "Egg, boiled", kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.9, sat: 3.1, sugar: 0.7, unit: { grams: 50, label: "egg" } },
  { name: "Salmon fillet, baked", kcal: 197, protein: 24, carbs: 0, fat: 11, sat: 2.1, sugar: 0, unit: { grams: 130, label: "fillet" } },
  { name: "Broccoli, boiled", kcal: 24, protein: 2.4, carbs: 1.1, fat: 0.5, sat: 0.1, sugar: 0.9, unit: { grams: 80, label: "portion" } },
  { name: "Potato, baked (with skin)", kcal: 136, protein: 3.9, carbs: 31.7, fat: 0.2, sat: 0, sugar: 1.2, unit: { grams: 180, label: "potato" } },
  { name: "Pasta, plain, boiled", kcal: 131, protein: 4.7, carbs: 25, fat: 1.1, sat: 0.2, sugar: 0.6, unit: { grams: 200, label: "portion" } },
  { name: "Pasta, dried (uncooked)", kcal: 349, protein: 12, carbs: 70.9, fat: 1.6, sat: 0.3, sugar: 2.6, unit: { grams: 75, label: "portion (dry)" } },
  { name: "Greek yoghurt, plain", kcal: 133, protein: 5.7, carbs: 4.3, fat: 10.2, sat: 6.5, sugar: 4.3, unit: { grams: 150, label: "pot" } },
  { name: "Peanut butter, smooth", kcal: 623, protein: 25.1, carbs: 13.1, fat: 51.5, sat: 10.1, sugar: 8.7, unit: { grams: 15, label: "tbsp" } },
  { name: "Weetabix", kcal: 362, protein: 12, carbs: 69, fat: 2.7, sat: 0.5, sugar: 4.4, unit: { grams: 19, label: "biscuit" } },
  { name: "Baked beans on wholemeal toast", kcal: 158, protein: 7.4, carbs: 22.6, fat: 1.6, sat: 0.4, sugar: 4.5, unit: { grams: 250, label: "portion" } },
  { name: "Fish and chips (takeaway)", kcal: 234, protein: 9.5, carbs: 24, fat: 11.6, sat: 1.9, sugar: 0.4, unit: { grams: 450, label: "regular portion" } },
  { name: "Sausage roll", kcal: 337, protein: 8, carbs: 26.5, fat: 22.3, sat: 8.9, sugar: 1.9, unit: { grams: 60, label: "roll" } },
  { name: "Digestive biscuit", kcal: 471, protein: 6.3, carbs: 66.5, fat: 20.9, sat: 9, sugar: 16.3, unit: { grams: 15, label: "biscuit" } },
  { name: "Bacon rasher, grilled", kcal: 287, protein: 24.9, carbs: 0, fat: 21.2, sat: 7.2, sugar: 0, unit: { grams: 23, label: "rasher" } },
  { name: "Baked bean stew with sausages", kcal: 128, protein: 6.9, carbs: 12, fat: 6, sat: 2, sugar: 3.6, unit: { grams: 350, label: "portion" } },
  { name: "Avocado", kcal: 160, protein: 2, carbs: 8.5, fat: 14.7, sat: 2.1, sugar: 0.7, unit: { grams: 150, label: "avocado" } },
  { name: "Spinach, raw", kcal: 23, protein: 2.9, carbs: 1.6, fat: 0.4, sat: 0.1, sugar: 0.4, unit: { grams: 30, label: "handful" } },
  { name: "Cheese & onion crisps", kcal: 519, protein: 6, carbs: 51, fat: 32.6, sat: 3.1, sugar: 3.4, unit: { grams: 25, label: "bag" } },
  { name: "Apple", kcal: 47, protein: 0.4, carbs: 11.8, fat: 0.1, sat: 0, sugar: 11.8, unit: { grams: 100, label: "apple" } },
  { name: "Banana", kcal: 95, protein: 1.2, carbs: 23.2, fat: 0.3, sat: 0.1, sugar: 21, unit: { grams: 118, label: "banana" } },
  // ---- Common meat/poultry cuts and staples not otherwise covered above ----
  { name: "Chicken leg/drumstick, roasted", kcal: 191, protein: 23.4, carbs: 0, fat: 10.2, sat: 2.7, sugar: 0, unit: { grams: 60, label: "drumstick" } },
  { name: "Chicken wing, roasted", kcal: 254, protein: 23.8, carbs: 0, fat: 16.9, sat: 5, sugar: 0, unit: { grams: 30, label: "wing" } },
  { name: "Chicken liver, fried", kcal: 165, protein: 24, carbs: 3.9, fat: 5.4, sat: 1.6, sugar: 0.3, unit: { grams: 100, label: "portion" } },
  { name: "Gammon steak, grilled", kcal: 174, protein: 27, carbs: 1.3, fat: 6.6, sat: 2.2, sugar: 1.1, unit: { grams: 130, label: "steak" } },
  { name: "Duck breast, grilled (skin removed)", kcal: 140, protein: 22, carbs: 0, fat: 5.5, sat: 1.8, sugar: 0, unit: { grams: 150, label: "breast" } },
  { name: "Pork belly, roasted", kcal: 460, protein: 13, carbs: 0, fat: 44, sat: 15.8, sugar: 0, unit: { grams: 100, label: "portion" } },
  { name: "Mackerel, grilled", kcal: 262, protein: 23.8, carbs: 0, fat: 17.8, sat: 4.2, sugar: 0, unit: { grams: 100, label: "fillet" } },
  { name: "Sardines, tinned in tomato sauce", kcal: 185, protein: 20.9, carbs: 0.5, fat: 10.4, sat: 2.7, sugar: 0.5, unit: { grams: 100, label: "half tin" } },
  { name: "Trout, baked", kcal: 160, protein: 23, carbs: 0, fat: 7, sat: 1.6, sugar: 0, unit: { grams: 150, label: "fillet" } },
  // ---- Store cupboard / cooking staples ----
  { name: "Crème fraîche", kcal: 305, protein: 2.2, carbs: 3, fat: 30, sat: 20, sugar: 3, unit: { grams: 30, label: "tbsp" } },
  { name: "Stilton cheese", kcal: 410, protein: 23, carbs: 0.1, fat: 35, sat: 22, sugar: 0.1, unit: { grams: 30, label: "slice" } },
  { name: "Sugar, granulated", kcal: 400, protein: 0, carbs: 100, fat: 0, sat: 0, sugar: 100, unit: { grams: 4, label: "tsp" } },
  { name: "Breadcrumbs, dried", kcal: 395, protein: 13, carbs: 73, fat: 5, sat: 1, sugar: 4, unit: { grams: 30, label: "portion" } },
  { name: "Worcestershire sauce", kcal: 78, protein: 0, carbs: 19.5, fat: 0, sat: 0, sugar: 15, unit: { grams: 5, label: "tsp" } },
  { name: "Pearl barley, cooked", kcal: 123, protein: 2.3, carbs: 28.2, fat: 0.4, sat: 0.1, sugar: 0.3, unit: { grams: 180, label: "portion" } },
  { name: "Bulgur wheat, cooked", kcal: 83, protein: 3.1, carbs: 18.6, fat: 0.2, sat: 0, sugar: 0.1, unit: { grams: 180, label: "portion" } },
  { name: "Black beans, tinned (drained)", kcal: 132, protein: 8.9, carbs: 23.7, fat: 0.5, sat: 0.1, sugar: 0.3, unit: { grams: 200, label: "half tin" } },
  // ---- Drinks — hot/cold non-alcoholic staples ----
  { name: "Apple juice", kcal: 46, protein: 0.1, carbs: 11.3, fat: 0.1, sat: 0, sugar: 11, unit: { grams: 200, label: "glass" } },
  { name: "Green tea", kcal: 1, protein: 0, carbs: 0, fat: 0, sat: 0, sugar: 0, unit: { grams: 200, label: "cup" } },
  // Drinks — kcal/units given per single standard serving (grams:100 = 1 serving)
  { name: "Real ale, pint (~4.2% ABV)", kcal: 32, protein: 0, carbs: 2.5, fat: 0, sat: 0, sugar: 0, units: 0.42, unit: { grams: 568, label: "pint" } },
  { name: "Lager, pint (~4% ABV)", kcal: 38, protein: 0, carbs: 2.1, fat: 0, sat: 0, sugar: 0, units: 0.41, unit: { grams: 568, label: "pint" } },
  { name: "Cider, pint (~4.5% ABV)", kcal: 38, protein: 0, carbs: 3.9, fat: 0, sat: 0, sugar: 3.7, units: 0.46, unit: { grams: 568, label: "pint" } },
  { name: "Red or white wine, glass (175ml, 13%)", kcal: 91, protein: 0, carbs: 2.5, fat: 0, sat: 0, sugar: 0.8, units: 1.31, unit: { grams: 175, label: "glass" } },
  { name: "Prosecco, glass (125ml, 12%)", kcal: 71, protein: 0, carbs: 2, fat: 0, sat: 0, sugar: 0.8, units: 1.2, unit: { grams: 125, label: "glass" } },
  { name: "Spirit & mixer, single (25ml spirit + mixer, 40%)", kcal: 54, protein: 0, carbs: 4.6, fat: 0, sat: 0, sugar: 4.6, units: 0.57, unit: { grams: 175, label: "single with mixer" } },
  // Aldi own-brand (typical values — check the pack, exact figures vary by product/pack size)
  { name: "Aldi Four Seasons Cheese & Tomato Pizza", kcal: 250, protein: 10, carbs: 28, fat: 10, sat: 5, sugar: 3, unit: { grams: 200, label: "half pizza" } },
  { name: "Aldi Specially Selected Chicken Tikka Masala (ready meal)", kcal: 140, protein: 8, carbs: 16, fat: 4.5, sat: 1.2, sugar: 3, unit: { grams: 400, label: "whole pack" } },
  { name: "Aldi Specially Selected Beef Lasagne (ready meal)", kcal: 150, protein: 8, carbs: 13, fat: 7.5, sat: 3.8, sugar: 3, unit: { grams: 400, label: "whole pack" } },
  { name: "Aldi Harvest Morn Granola", kcal: 450, protein: 9, carbs: 60, fat: 18, sat: 3, sugar: 20, unit: { grams: 45, label: "bowl" } },
  { name: "Aldi Harvest Morn Fruit & Fibre Cereal", kcal: 360, protein: 8, carbs: 72, fat: 3, sat: 0.5, sugar: 20, unit: { grams: 40, label: "bowl" } },
  { name: "Aldi Moser Roth Dark Chocolate (70%)", kcal: 570, protein: 7, carbs: 35, fat: 40, sat: 24, sugar: 28, unit: { grams: 20, label: "square" } },
  { name: "Aldi Emporium Mature Cheddar", kcal: 410, protein: 25, carbs: 0.1, fat: 34, sat: 21, sugar: 0.1, unit: { grams: 30, label: "slice" } },
  { name: "Aldi Snackrite Ready Salted Crisps", kcal: 520, protein: 6, carbs: 50, fat: 33, sat: 3, sugar: 0.5, unit: { grams: 25, label: "bag" } },
  { name: "Aldi Belgian Bun", kcal: 300, protein: 5, carbs: 55, fat: 7, sat: 3, sugar: 30, unit: { grams: 80, label: "bun" } },
  { name: "Aldi Jumbo Sausage Roll", kcal: 330, protein: 8, carbs: 25, fat: 22, sat: 9, sugar: 2, unit: { grams: 110, label: "roll" } },
  { name: "Aldi Chicken & Bacon Meal Deal Sandwich", kcal: 250, protein: 16, carbs: 28, fat: 8, sat: 2, sugar: 3, unit: { grams: 180, label: "pack" } },
  { name: "Aldi High Protein Natural Yogurt", kcal: 65, protein: 10, carbs: 4, fat: 0.3, sat: 0.1, sugar: 4, unit: { grams: 150, label: "pot" } },
  { name: "Aldi Free Range Eggs", kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.9, sat: 3.1, sugar: 0.7, unit: { grams: 50, label: "egg" } },
  { name: "Aldi Semi-Skimmed Milk", kcal: 47, protein: 3.4, carbs: 4.8, fat: 1.7, sat: 1.1, sugar: 4.8, unit: { grams: 30, label: "splash (cereal/tea)" } },
  { name: "Aldi British Chicken Breast Fillets", kcal: 165, protein: 31, carbs: 0, fat: 3.6, sat: 1, sugar: 0, unit: { grams: 150, label: "fillet" } },
  // Aldi own-brand, batch 2 — real sub-brand names confirmed via product listings/reviews.
  // Brooklea, Village Bakery and Ashfields figures are sourced from published pack data; the rest are typical estimates for the product type.
  { name: "Aldi Brooklea 0% Fat Greek Yogurt", kcal: 62, protein: 5.9, carbs: 9.1, fat: 0.2, sat: 0.1, sugar: 7.7, unit: { grams: 150, label: "pot" } },
  { name: "Aldi Village Bakery Wholemeal Bread (slice)", kcal: 215, protein: 9.4, carbs: 39.7, fat: 2.5, sat: 0.5, sugar: 3.3, unit: { grams: 40, label: "slice" } },
  { name: "Aldi Village Bakery Wholemeal Roll", kcal: 247, protein: 11.7, carbs: 46.7, fat: 3, sat: 0.7, sugar: 3.3, unit: { grams: 60, label: "roll" } },
  { name: "Aldi Ashfields Extra Lean Beef Mince (5% fat)", kcal: 109, protein: 22, carbs: 0, fat: 2.4, sat: 1, sugar: 0, unit: { grams: 100, label: "portion" } },
  { name: "Aldi Ashfield Farm Wafer Thin Roast Chicken", kcal: 105, protein: 22, carbs: 1, fat: 1.5, sat: 0.4, sugar: 1, unit: { grams: 25, label: "slice" } },
  { name: "Aldi The Deli Classic Frankfurters", kcal: 260, protein: 11, carbs: 3, fat: 23, sat: 8, sugar: 1, unit: { grams: 35, label: "frankfurter" } },
  { name: "Aldi The Deli Creamy Coleslaw", kcal: 150, protein: 1, carbs: 8, fat: 13, sat: 1.5, sugar: 6, unit: { grams: 80, label: "portion" } },
  { name: "Aldi Specially Selected Wood Fired Pizza (meat)", kcal: 260, protein: 12, carbs: 27, fat: 11, sat: 5, sugar: 3, unit: { grams: 200, label: "half pizza" } },
  { name: "Aldi Crestwood Protein Chicken Satay Skewers", kcal: 180, protein: 25, carbs: 4, fat: 7, sat: 2, sugar: 3, unit: { grams: 100, label: "pack" } },
  { name: "Aldi Carlos Takeaway Fries", kcal: 155, protein: 2, carbs: 24, fat: 5, sat: 0.5, sugar: 0.5, unit: { grams: 150, label: "portion" } },
  // ---- More bakery & bread ----
  { name: "Baguette", kcal: 262, protein: 9, carbs: 52, fat: 1.7, sat: 0.3, sugar: 2, unit: { grams: 125, label: "half baguette" } },
  { name: "Ciabatta roll", kcal: 271, protein: 9.5, carbs: 51, fat: 3, sat: 0.5, sugar: 2, unit: { grams: 100, label: "roll" } },
  { name: "Sourdough bread", kcal: 289, protein: 11.4, carbs: 56.9, fat: 1.9, sat: 0.3, sugar: 2.5, unit: { grams: 50, label: "slice" } },
  { name: "Rye bread", kcal: 219, protein: 7.6, carbs: 44.7, fat: 1.1, sat: 0.2, sugar: 2.9, unit: { grams: 30, label: "slice" } },
  { name: "Brioche roll", kcal: 372, protein: 9, carbs: 50, fat: 15, sat: 7, sugar: 9, unit: { grams: 60, label: "roll" } },
  { name: "Hot cross bun", kcal: 296, protein: 7.6, carbs: 55, fat: 5.6, sat: 1.7, sugar: 21, unit: { grams: 70, label: "bun" } },
  { name: "Teacake", kcal: 280, protein: 7.9, carbs: 54, fat: 4.6, sat: 1, sugar: 15, unit: { grams: 65, label: "teacake" } },
  { name: "Malt loaf", kcal: 283, protein: 8, carbs: 60, fat: 2, sat: 0.5, sugar: 26, unit: { grams: 40, label: "slice" } },
  { name: "Garlic bread", kcal: 350, protein: 7.7, carbs: 42, fat: 17, sat: 6, sugar: 2, unit: { grams: 60, label: "portion (2-3 slices)" } },
  { name: "Yorkshire pudding", kcal: 227, protein: 7, carbs: 27, fat: 10, sat: 2.6, sugar: 1.5, unit: { grams: 35, label: "pudding" } },
  { name: "Breadsticks", kcal: 408, protein: 12, carbs: 73, fat: 8, sat: 1.2, sugar: 3, unit: { grams: 8, label: "breadstick" } },
  // ---- British classics & savoury pastry ----
  { name: "Cornish pasty", kcal: 254, protein: 6.5, carbs: 24, fat: 15, sat: 6.5, sugar: 1.5, unit: { grams: 227, label: "pasty" } },
  { name: "Pork pie", kcal: 376, protein: 10.5, carbs: 24, fat: 27, sat: 10, sugar: 1, unit: { grams: 145, label: "pie" } },
  { name: "Scotch egg", kcal: 260, protein: 12.5, carbs: 12, fat: 18, sat: 5, sugar: 1, unit: { grams: 120, label: "egg" } },
  { name: "Steak pie", kcal: 250, protein: 9, carbs: 20, fat: 15, sat: 6, sugar: 1.5, unit: { grams: 250, label: "portion" } },
  { name: "Chicken kiev", kcal: 260, protein: 15, carbs: 14, fat: 16, sat: 4, sugar: 1, unit: { grams: 150, label: "kiev" } },
  { name: "Quiche Lorraine", kcal: 302, protein: 9, carbs: 18, fat: 22, sat: 10, sugar: 2, unit: { grams: 120, label: "slice" } },
  { name: "Cottage pie", kcal: 115, protein: 7, carbs: 10, fat: 5, sat: 2, sugar: 1.5, unit: { grams: 300, label: "portion" } },
  { name: "Toad in the hole", kcal: 240, protein: 10, carbs: 18, fat: 14, sat: 5, sugar: 1.5, unit: { grams: 250, label: "portion" } },
  { name: "Bubble and squeak", kcal: 130, protein: 3, carbs: 15, fat: 6, sat: 2, sugar: 2, unit: { grams: 150, label: "portion" } },
  { name: "Black pudding, fried", kcal: 305, protein: 13, carbs: 15, fat: 22, sat: 8, sugar: 1, unit: { grams: 60, label: "slice" } },
  { name: "Haggis, cooked", kcal: 310, protein: 10.7, carbs: 19.5, fat: 21.1, sat: 8, sugar: 0.5, unit: { grams: 150, label: "portion" } },
  { name: "Welsh rarebit", kcal: 290, protein: 13, carbs: 15, fat: 20, sat: 11, sugar: 2, unit: { grams: 150, label: "portion (1 slice)" } },
  // ---- Takeaway & fast food ----
  { name: "Chow mein, chicken", kcal: 140, protein: 8, carbs: 15, fat: 5, sat: 1, sugar: 3, unit: { grams: 350, label: "portion" } },
  { name: "Egg fried rice", kcal: 163, protein: 4, carbs: 25, fat: 5, sat: 0.8, sugar: 0.5, unit: { grams: 250, label: "portion" } },
  { name: "Prawn crackers", kcal: 509, protein: 0.9, carbs: 58, fat: 29, sat: 6, sugar: 0.5, unit: { grams: 20, label: "handful" } },
  { name: "Spring roll, vegetable", kcal: 195, protein: 4, carbs: 22, fat: 10, sat: 1.2, sugar: 2, unit: { grams: 50, label: "roll" } },
  { name: "Onion bhaji", kcal: 260, protein: 6, carbs: 20, fat: 17, sat: 1.8, sugar: 3, unit: { grams: 50, label: "bhaji" } },
  { name: "Samosa, vegetable", kcal: 262, protein: 5, carbs: 28, fat: 15, sat: 1.8, sugar: 2, unit: { grams: 60, label: "samosa" } },
  { name: "Poppadom", kcal: 368, protein: 18, carbs: 48, fat: 12, sat: 1.5, sugar: 2, unit: { grams: 10, label: "poppadom" } },
  { name: "Chicken nuggets", kcal: 250, protein: 14, carbs: 15, fat: 15, sat: 2.5, sugar: 1, unit: { grams: 20, label: "nugget" } },
  { name: "Onion rings, battered", kcal: 275, protein: 3.5, carbs: 30, fat: 16, sat: 2, sugar: 3, unit: { grams: 80, label: "portion (5-6 rings)" } },
  { name: "Curly fries", kcal: 280, protein: 3.5, carbs: 36, fat: 14, sat: 2, sugar: 0.5, unit: { grams: 150, label: "portion" } },
  { name: "Pizza, takeaway pepperoni (slice)", kcal: 280, protein: 12, carbs: 30, fat: 12, sat: 5, sugar: 3, unit: { grams: 110, label: "slice" } },
  { name: "Fish fingers, grilled", kcal: 220, protein: 12.6, carbs: 18, fat: 11, sat: 1.5, sugar: 1, unit: { grams: 28, label: "finger" } },
  // ---- Soups ----
  { name: "Tomato soup", kcal: 51, protein: 0.9, carbs: 8.5, fat: 1.7, sat: 0.3, sugar: 5.5, unit: { grams: 300, label: "bowl" } },
  { name: "Chicken soup", kcal: 40, protein: 2.5, carbs: 4.5, fat: 1.3, sat: 0.4, sugar: 1, unit: { grams: 300, label: "bowl" } },
  { name: "Minestrone soup", kcal: 34, protein: 1.5, carbs: 5.5, fat: 0.8, sat: 0.1, sugar: 2, unit: { grams: 300, label: "bowl" } },
  // ---- Dairy & desserts ----
  { name: "Single cream", kcal: 198, protein: 2.6, carbs: 4.1, fat: 19.1, sat: 12, sugar: 4.1, unit: { grams: 15, label: "tbsp" } },
  { name: "Clotted cream", kcal: 586, protein: 1.6, carbs: 2.3, fat: 63.5, sat: 40, sugar: 2.3, unit: { grams: 15, label: "tbsp" } },
  { name: "Custard", kcal: 117, protein: 3.7, carbs: 17.6, fat: 3.7, sat: 2.1, sugar: 12, unit: { grams: 150, label: "serving" } },
  { name: "Rice pudding", kcal: 89, protein: 3.4, carbs: 14.7, fat: 2.5, sat: 1.5, sugar: 10.5, unit: { grams: 200, label: "pot" } },
  { name: "Trifle", kcal: 160, protein: 2.6, carbs: 20, fat: 7.5, sat: 4, sugar: 15, unit: { grams: 150, label: "portion" } },
  // ---- Condiments & spreads ----
  { name: "Marmite", kcal: 231, protein: 39.7, carbs: 22.8, fat: 0.1, sat: 0, sugar: 1.2, unit: { grams: 8, label: "thin spread" } },
  { name: "Chocolate hazelnut spread", kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, sat: 10.6, sugar: 56.3, unit: { grams: 15, label: "tbsp" } },
  { name: "Marmalade", kcal: 261, protein: 0.3, carbs: 69.5, fat: 0, sat: 0, sugar: 69.5, unit: { grams: 15, label: "tbsp" } },
  { name: "English mustard", kcal: 190, protein: 7.1, carbs: 14, fat: 11, sat: 0.6, sugar: 7, unit: { grams: 5, label: "tsp" } },
  { name: "Salad cream", kcal: 348, protein: 1.8, carbs: 20.5, fat: 27.6, sat: 2.4, sugar: 12, unit: { grams: 15, label: "tbsp" } },
  { name: "Gravy, made with granules", kcal: 35, protein: 0.7, carbs: 5.5, fat: 1.3, sat: 0.6, sugar: 0.4, unit: { grams: 100, label: "serving" } },
  { name: "Balsamic vinegar", kcal: 88, protein: 0.5, carbs: 17, fat: 0, sat: 0, sugar: 15, unit: { grams: 15, label: "tbsp" } },
  // ---- Confectionery & snacks ----
  { name: "Flapjack", kcal: 449, protein: 5.4, carbs: 59, fat: 22, sat: 10, sugar: 33, unit: { grams: 70, label: "flapjack" } },
  { name: "Fudge", kcal: 425, protein: 1.7, carbs: 75, fat: 14, sat: 8.5, sugar: 70, unit: { grams: 20, label: "piece" } },
  { name: "Wine gums", kcal: 325, protein: 4.6, carbs: 75, fat: 0.1, sat: 0, sugar: 45, unit: { grams: 15, label: "few sweets" } },
  { name: "Fruit pastilles", kcal: 333, protein: 4.4, carbs: 78, fat: 0, sat: 0, sugar: 55, unit: { grams: 15, label: "few sweets" } },
  { name: "Mint imperials", kcal: 394, protein: 0, carbs: 98, fat: 0.2, sat: 0, sugar: 98, unit: { grams: 10, label: "few mints" } },
  // ---- More drinks ----
  { name: "Hot chocolate, made with milk", kcal: 87, protein: 3.4, carbs: 11, fat: 3.3, sat: 2, sugar: 10, unit: { grams: 250, label: "mug" } },
  { name: "Squash, diluted", kcal: 5, protein: 0, carbs: 1.2, fat: 0, sat: 0, sugar: 1.2, unit: { grams: 250, label: "glass" } },
  { name: "Sparkling water", kcal: 0, protein: 0, carbs: 0, fat: 0, sat: 0, sugar: 0, unit: { grams: 250, label: "glass" } },
  { name: "Smoothie, fruit", kcal: 48, protein: 0.6, carbs: 11, fat: 0.2, sat: 0, sugar: 10.5, unit: { grams: 250, label: "glass" } },
  // ---- More veg ----
  { name: "Pak choi, steamed", kcal: 13, protein: 1.5, carbs: 1.2, fat: 0.2, sat: 0, sugar: 1, unit: { grams: 80, label: "portion" } },
  { name: "Chard, boiled", kcal: 20, protein: 1.8, carbs: 2.1, fat: 0.2, sat: 0, sugar: 1.1, unit: { grams: 80, label: "portion" } },
  { name: "Turnip, boiled", kcal: 12, protein: 0.6, carbs: 2, fat: 0.2, sat: 0, sugar: 2, unit: { grams: 80, label: "portion" } },
  // ---- More grains ----
  { name: "Long grain white rice, dried (uncooked)", kcal: 353, protein: 6.5, carbs: 79, fat: 0.6, sat: 0.1, sugar: 0.1, unit: { grams: 75, label: "portion (dry)" } },
  { name: "Long grain white rice, boiled", kcal: 138, protein: 2.6, carbs: 30.9, fat: 0.3, sat: 0.1, sugar: 0.1, unit: { grams: 180, label: "portion" } },
  { name: "Aldi Bramwells Baked Beans", kcal: 75, protein: 4.8, carbs: 13, fat: 0.4, sat: 0.1, sugar: 5.3, unit: { grams: 200, label: "half tin" } },
  { name: "Aldi Bramwells Strawberry Jam", kcal: 258, protein: 0.6, carbs: 69, fat: 0, sat: 0, sugar: 69, unit: { grams: 15, label: "tbsp" } },
  { name: "Aldi Corale Premium Baked Beans", kcal: 78, protein: 5, carbs: 13.5, fat: 0.4, sat: 0.1, sugar: 5.5, unit: { grams: 200, label: "half tin" } },
  // ---- Aldi batch 3: deeper coverage of confirmed real sub-brands ----
  { name: "Aldi Brooklea Salted Butter", kcal: 717, protein: 0.6, carbs: 0.1, fat: 81, sat: 51, sugar: 0.1, unit: { grams: 10, label: "spread (per slice)" } },
  { name: "Aldi Brooklea Semi Skimmed Milk", kcal: 47, protein: 3.4, carbs: 4.8, fat: 1.7, sat: 1.1, sugar: 4.8, unit: { grams: 30, label: "splash (cereal/tea)" } },
  { name: "Aldi Brooklea Natural Yogurt", kcal: 61, protein: 4.8, carbs: 4.7, fat: 3.3, sat: 1.9, sugar: 4.7, unit: { grams: 150, label: "pot" } },
  { name: "Aldi Bramwells Wholegrain Mustard", kcal: 140, protein: 7.4, carbs: 8, fat: 8, sat: 0.6, sugar: 3, unit: { grams: 5, label: "tsp" } },
  { name: "Aldi Bramwells Tomato Ketchup", kcal: 100, protein: 1.4, carbs: 24.6, fat: 0.1, sat: 0, sugar: 22.8, unit: { grams: 15, label: "tbsp" } },
  { name: "Aldi Bramwells Cornflakes", kcal: 378, protein: 7, carbs: 84, fat: 0.9, sat: 0.2, sugar: 8, unit: { grams: 30, label: "bowl" } },
  { name: "Aldi Village Bakery White Bloomer", kcal: 235, protein: 8.4, carbs: 46, fat: 1.6, sat: 0.3, sugar: 3.4, unit: { grams: 45, label: "slice" } },
  { name: "Aldi Village Bakery Bagels", kcal: 275, protein: 10.5, carbs: 54, fat: 1.7, sat: 0.3, sugar: 5.5, unit: { grams: 90, label: "bagel" } },
  { name: "Aldi Ashfields Pork Sausages", kcal: 279, protein: 13.7, carbs: 11.7, fat: 21.1, sat: 7.3, sugar: 1, unit: { grams: 50, label: "sausage" } },
  { name: "Aldi Ashfield Farm Chicken Thighs, grilled", kcal: 185, protein: 25.4, carbs: 0, fat: 9.2, sat: 2.6, sugar: 0, unit: { grams: 100, label: "thigh" } },
  { name: "Aldi The Deli Wafer Thin Ham", kcal: 92, protein: 17.4, carbs: 1.6, fat: 1.9, sat: 0.6, sugar: 1, unit: { grams: 25, label: "slice" } },
  { name: "Aldi The Deli Garlic & Herb Soft Cheese", kcal: 245, protein: 5.5, carbs: 3.5, fat: 23, sat: 15, sugar: 3, unit: { grams: 30, label: "spread (2 tbsp)" } },
  { name: "Aldi Specially Selected Belgian Chocolate Cheesecake", kcal: 350, protein: 4.5, carbs: 32, fat: 23, sat: 13, sugar: 24, unit: { grams: 100, label: "slice" } },
  { name: "Aldi Specially Selected Beef Burgers", kcal: 250, protein: 18, carbs: 2, fat: 19, sat: 8, sugar: 1, unit: { grams: 113, label: "burger" } },
  { name: "Aldi Harvest Morn Bran Flakes", kcal: 321, protein: 10, carbs: 67, fat: 2, sat: 0.4, sugar: 17, unit: { grams: 40, label: "bowl" } },
  { name: "Aldi Harvest Morn Muesli", kcal: 355, protein: 10, carbs: 62, fat: 7, sat: 1.2, sugar: 20, unit: { grams: 50, label: "bowl" } },
  { name: "Aldi Moser Roth Milk Chocolate", kcal: 545, protein: 7.5, carbs: 56, fat: 32, sat: 19, sugar: 55, unit: { grams: 20, label: "square" } },
  { name: "Aldi Emporium Brie", kcal: 334, protein: 20.8, carbs: 0.5, fat: 28, sat: 17.8, sugar: 0.5, unit: { grams: 30, label: "slice" } },
  { name: "Aldi Snackrite Tortilla Chips", kcal: 459, protein: 7, carbs: 63, fat: 20, sat: 2.5, sugar: 2, unit: { grams: 30, label: "handful" } },
  { name: "Aldi Four Seasons Fish Fingers", kcal: 220, protein: 12.6, carbs: 18, fat: 11, sat: 1.5, sugar: 1, unit: { grams: 28, label: "finger" } },
  { name: "Aldi Carlos Nacho Chips", kcal: 480, protein: 7, carbs: 65, fat: 21, sat: 3, sugar: 2, unit: { grams: 30, label: "handful" } },
  { name: "Aldi Carlos Salsa Dip", kcal: 45, protein: 1, carbs: 9, fat: 0.3, sat: 0, sugar: 7, unit: { grams: 30, label: "2 tbsp" } },
  { name: "Aldi Farm Select Bananas", kcal: 95, protein: 1.2, carbs: 23.2, fat: 0.3, sat: 0.1, sugar: 21, unit: { grams: 118, label: "banana" } },
  { name: "Aldi Farm Select Braeburn Apples", kcal: 47, protein: 0.4, carbs: 11.8, fat: 0.1, sat: 0, sugar: 11.8, unit: { grams: 100, label: "apple" } },
  { name: "Aldi Crestwood High Protein Pasta", kcal: 335, protein: 25, carbs: 45, fat: 3, sat: 0.5, sugar: 2, unit: { grams: 75, label: "portion (dry)" } },
  // ---- National brands (condiments, bread, cereal — the ones people search by name) ----
  { name: "Hellmann's Real Mayonnaise", kcal: 711, protein: 1, carbs: 1, fat: 78, sat: 6.5, sugar: 1, unit: { grams: 15, label: "tbsp" } },
  { name: "Hellmann's Light Mayonnaise", kcal: 288, protein: 1, carbs: 8, fat: 28, sat: 2.2, sugar: 5, unit: { grams: 15, label: "tbsp" } },
  { name: "Heinz Tomato Ketchup", kcal: 119, protein: 1.3, carbs: 27.4, fat: 0.1, sat: 0, sugar: 24.9, unit: { grams: 15, label: "tbsp" } },
  { name: "Heinz Salad Cream", kcal: 313, protein: 1.5, carbs: 22, fat: 24, sat: 1.8, sugar: 12, unit: { grams: 15, label: "tbsp" } },
  { name: "Heinz Baked Beans", kcal: 73, protein: 4.8, carbs: 12.6, fat: 0.2, sat: 0.1, sugar: 4.9, unit: { grams: 200, label: "half tin" } },
  { name: "Branston Baked Beans", kcal: 78, protein: 4.9, carbs: 13.7, fat: 0.4, sat: 0.1, sugar: 5.5, unit: { grams: 200, label: "half tin" } },
  { name: "Colman's English Mustard", kcal: 190, protein: 8, carbs: 15, fat: 11, sat: 0.6, sugar: 8, unit: { grams: 5, label: "tsp" } },
  { name: "HP Brown Sauce", kcal: 105, protein: 1.2, carbs: 25, fat: 0.1, sat: 0, sugar: 20.9, unit: { grams: 15, label: "tbsp" } },
  { name: "Bisto Gravy Granules, made up", kcal: 35, protein: 0.6, carbs: 5.5, fat: 1.3, sat: 0.5, sugar: 0.5, unit: { grams: 100, label: "serving" } },
  { name: "Lurpak Butter", kcal: 745, protein: 0.5, carbs: 0.5, fat: 82, sat: 54, sugar: 0.5, unit: { grams: 10, label: "spread (per slice)" } },
  { name: "Flora Original Spread", kcal: 530, protein: 0.2, carbs: 1, fat: 59, sat: 15, sugar: 1, unit: { grams: 10, label: "spread (per slice)" } },
  { name: "Nutella", kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, sat: 10.6, sugar: 56.3, unit: { grams: 15, label: "tbsp" } },
  { name: "Warburtons Toastie White Bread", kcal: 253, protein: 8.9, carbs: 47.1, fat: 2.5, sat: 0.6, sugar: 3.6, unit: { grams: 39, label: "slice" } },
  { name: "Kingsmill 50/50 Bread", kcal: 219, protein: 9.6, carbs: 39, fat: 2.5, sat: 0.5, sugar: 3, unit: { grams: 38, label: "slice" } },
  { name: "Hovis Wholemeal Bread", kcal: 215, protein: 9.9, carbs: 38, fat: 2.5, sat: 0.5, sugar: 2.8, unit: { grams: 40, label: "slice" } },
  { name: "Kellogg's Corn Flakes", kcal: 378, protein: 7, carbs: 84, fat: 0.9, sat: 0.2, sugar: 8, unit: { grams: 30, label: "bowl" } },
  { name: "Kellogg's Coco Pops", kcal: 384, protein: 4.5, carbs: 85, fat: 2.5, sat: 1.5, sugar: 30, unit: { grams: 30, label: "bowl" } },
  { name: "Robinsons Squash, diluted", kcal: 5, protein: 0, carbs: 1.2, fat: 0, sat: 0, sugar: 1.2, unit: { grams: 250, label: "glass" } },
  { name: "Ribena, diluted", kcal: 22, protein: 0, carbs: 5.4, fat: 0, sat: 0, sugar: 5.3, unit: { grams: 250, label: "glass" } },
  { name: "Cadbury Dairy Milk", kcal: 534, protein: 7.3, carbs: 56.5, fat: 30.7, sat: 18.5, sugar: 56.5, unit: { grams: 45, label: "bar" } },
  { name: "Walkers Ready Salted Crisps", kcal: 532, protein: 6.1, carbs: 50.3, fat: 34, sat: 3, sugar: 0.6, unit: { grams: 25, label: "bag" } },
  // ---- National brands: meat & meat-free ----
  { name: "Richmond Thick Pork Sausages", kcal: 264, protein: 10.9, carbs: 12, fat: 20.5, sat: 7.3, sugar: 0.9, unit: { grams: 52, label: "sausage" } },
  { name: "Richmond 50% Less Fat Sausages", kcal: 199, protein: 12.5, carbs: 14, fat: 10.5, sat: 3.8, sugar: 1, unit: { grams: 50, label: "sausage" } },
  { name: "Bernard Matthews Turkey Drummers", kcal: 216, protein: 12, carbs: 14, fat: 12.5, sat: 2, sugar: 1, unit: { grams: 45, label: "drummer" } },
  { name: "Peperami Original", kcal: 503, protein: 22, carbs: 1.5, fat: 46, sat: 18, sugar: 0.5, unit: { grams: 25, label: "stick" } },
  { name: "Fridge Raiders Chicken Bites", kcal: 155, protein: 22, carbs: 5, fat: 5, sat: 1.5, sugar: 3, unit: { grams: 70, label: "pack" } },
  { name: "Quorn Mince", kcal: 89, protein: 12.5, carbs: 4.5, fat: 2.5, sat: 0.5, sugar: 0.9, unit: { grams: 100, label: "portion" } },
  { name: "Quorn Sausages", kcal: 168, protein: 13, carbs: 11, fat: 8, sat: 1.3, sugar: 1.5, unit: { grams: 47, label: "sausage" } },
  { name: "Linda McCartney Vegetarian Sausages", kcal: 189, protein: 15, carbs: 13, fat: 8.5, sat: 1, sugar: 1.5, unit: { grams: 42, label: "sausage" } },
  { name: "Linda McCartney Vegetarian Mince", kcal: 105, protein: 13, carbs: 6, fat: 3.2, sat: 0.4, sugar: 1, unit: { grams: 100, label: "portion" } },
  // ---- Fruit: named varieties (how people actually search fresh produce) + real brands ----
  { name: "Pink Lady Apple", kcal: 52, protein: 0.3, carbs: 12.8, fat: 0.2, sat: 0, sugar: 12.4, unit: { grams: 100, label: "apple" } },
  { name: "Gala Apple", kcal: 48, protein: 0.3, carbs: 11.6, fat: 0.1, sat: 0, sugar: 11.4, unit: { grams: 100, label: "apple" } },
  { name: "Granny Smith Apple", kcal: 44, protein: 0.3, carbs: 10.5, fat: 0.2, sat: 0, sugar: 9.8, unit: { grams: 100, label: "apple" } },
  // ---- More: plant milks, protein bars, meat cuts, veg, sandwich fillings, world food ----
  { name: "Oatly Oat Milk (Original)", kcal: 47, protein: 1, carbs: 6.7, fat: 1.5, sat: 0.2, sugar: 4.1, unit: { grams: 30, label: "splash (cereal/tea)" } },
  { name: "Alpro Almond Milk (Unsweetened)", kcal: 13, protein: 0.4, carbs: 0.3, fat: 1.1, sat: 0.1, sugar: 0.1, unit: { grams: 30, label: "splash (cereal/tea)" } },
  { name: "Soya milk, sweetened", kcal: 43, protein: 3.3, carbs: 2.9, fat: 2.1, sat: 0.3, sugar: 2.9, unit: { grams: 30, label: "splash (cereal/tea)" } },
  { name: "Grenade Carb Killa Protein Bar", kcal: 393, protein: 27, carbs: 34, fat: 15, sat: 9, sugar: 3, unit: { grams: 60, label: "bar" } },
  { name: "Quest Protein Bar", kcal: 350, protein: 33, carbs: 26, fat: 12, sat: 5, sugar: 1, unit: { grams: 60, label: "bar" } },
  { name: "Granola bar", kcal: 471, protein: 7, carbs: 64, fat: 20, sat: 8, sugar: 27, unit: { grams: 21, label: "bar" } },
  { name: "Pork loin steak, grilled", kcal: 184, protein: 31.5, carbs: 0, fat: 6.5, sat: 2.2, sugar: 0, unit: { grams: 150, label: "steak" } },
  { name: "Lamb chops, grilled", kcal: 226, protein: 27, carbs: 0, fat: 13, sat: 5.8, sugar: 0, unit: { grams: 80, label: "chop" } },
  { name: "Beef mince, 20% fat, cooked", kcal: 250, protein: 24, carbs: 0, fat: 17, sat: 7.3, sugar: 0, unit: { grams: 100, label: "portion" } },
  { name: "Pain au chocolat", kcal: 414, protein: 7.5, carbs: 41, fat: 24, sat: 14, sugar: 12, unit: { grams: 70, label: "pastry" } },
  { name: "Mushrooms, fried in butter", kcal: 157, protein: 2.4, carbs: 0.4, fat: 16.2, sat: 8, sugar: 0.4, unit: { grams: 80, label: "portion" } },
  { name: "Cauliflower rice, cooked", kcal: 25, protein: 2, carbs: 3, fat: 0.6, sat: 0.1, sugar: 2.4, unit: { grams: 80, label: "portion" } },
  { name: "Butternut squash soup", kcal: 48, protein: 1, carbs: 8, fat: 1.3, sat: 0.2, sugar: 4, unit: { grams: 300, label: "bowl" } },
  { name: "Tuna mayo (sandwich filling)", kcal: 190, protein: 17, carbs: 1, fat: 13, sat: 1.8, sugar: 1, unit: { grams: 60, label: "sandwich portion" } },
  { name: "Egg mayo (sandwich filling)", kcal: 240, protein: 9, carbs: 1, fat: 22, sat: 3.5, sugar: 1, unit: { grams: 60, label: "sandwich portion" } },
  { name: "Coronation chicken (sandwich filling)", kcal: 210, protein: 14, carbs: 6, fat: 15, sat: 2, sugar: 4, unit: { grams: 60, label: "sandwich portion" } },
  { name: "Falafel", kcal: 333, protein: 13.3, carbs: 31.8, fat: 17.8, sat: 2.4, sugar: 3.6, unit: { grams: 17, label: "ball" } },
  { name: "Halloumi, grilled", kcal: 321, protein: 21.7, carbs: 2, fat: 25, sat: 17, sugar: 1, unit: { grams: 100, label: "portion" } },
  { name: "Weetabix Protein", kcal: 358, protein: 16, carbs: 55, fat: 6.5, sat: 1.2, sugar: 4, unit: { grams: 24, label: "biscuit" } },
  // ---- Myprotein — figures from Myprotein's own product pages (scoop/bar totals), converted to per-100g ----
  { name: "Myprotein Impact Whey Protein (Unflavoured)", kcal: 456, protein: 84, carbs: 7.2, fat: 7.6, sat: 3.5, sugar: 1.5, unit: { grams: 25, label: "scoop" } },
  { name: "Myprotein Clear Whey Isolate", kcal: 360, protein: 80, carbs: 8, fat: 0, sat: 0, sugar: 0, unit: { grams: 25, label: "scoop" } },
  { name: "Myprotein Impact Vegan Protein", kcal: 390, protein: 80, carbs: 10, fat: 6, sat: 1, sugar: 3, unit: { grams: 30, label: "scoop" } },
  { name: "Myprotein Layered Protein Bar", kcal: 383, protein: 33.3, carbs: 32, fat: 15.7, sat: 4, sugar: 4, unit: { grams: 60, label: "bar" } },
  { name: "Myprotein Oat Protein Flapjack", kcal: 405, protein: 25, carbs: 40, fat: 13.8, sat: 6.9, sugar: 25, unit: { grams: 80, label: "bar" } },
  { name: "Garlic naan bread", kcal: 310, protein: 8.5, carbs: 47, fat: 10, sat: 3.8, sugar: 4, unit: { grams: 140, label: "naan" } },
  { name: "Chicken shish kebab (grilled, no bread)", kcal: 172, protein: 25, carbs: 2, fat: 7, sat: 1.8, sugar: 1, unit: { grams: 150, label: "skewer" } },
  { name: "Tzatziki", kcal: 85, protein: 3.8, carbs: 3.5, fat: 6.5, sat: 4, sugar: 3.3, unit: { grams: 30, label: "2 tbsp" } },
  { name: "Conference Pear", kcal: 42, protein: 0.3, carbs: 10.6, fat: 0.1, sat: 0, sugar: 10.6, unit: { grams: 170, label: "pear" } },
  { name: "Chiquita Banana", kcal: 95, protein: 1.2, carbs: 23.2, fat: 0.3, sat: 0.1, sugar: 21, unit: { grams: 118, label: "banana" } },
  { name: "Del Monte Pineapple Chunks in Juice", kcal: 55, protein: 0.5, carbs: 13.5, fat: 0.1, sat: 0, sugar: 13, unit: { grams: 100, label: "half tin (drained)" } },
  { name: "Del Monte Peach Slices in Juice", kcal: 48, protein: 0.5, carbs: 11.5, fat: 0.1, sat: 0, sugar: 11, unit: { grams: 100, label: "half tin (drained)" } },
  { name: "Innocent Smoothie", kcal: 48, protein: 0.6, carbs: 10.8, fat: 0.2, sat: 0, sugar: 10.5, unit: { grams: 250, label: "glass" } },
  // ---- Veg: real brands ----
  { name: "Birds Eye Garden Peas", kcal: 70, protein: 5.6, carbs: 8.5, fat: 0.9, sat: 0.2, sugar: 3, unit: { grams: 80, label: "portion" } },
  { name: "Birds Eye Sweetcorn", kcal: 92, protein: 3.3, carbs: 18, fat: 1.2, sat: 0.2, sugar: 3, unit: { grams: 80, label: "portion" } },
  { name: "Green Giant Sweetcorn", kcal: 76, protein: 2.6, carbs: 14.5, fat: 1, sat: 0.2, sugar: 4, unit: { grams: 80, label: "portion (drained)" } },
  { name: "Batchelors Marrowfat Mushy Peas", kcal: 81, protein: 5.8, carbs: 13, fat: 0.6, sat: 0.1, sugar: 2, unit: { grams: 150, label: "portion" } },
  // ---- Supermarket own-brand versions, with full-fat/light pairs where they genuinely exist ----
  { name: "Aldi Bramwells Mayonnaise", kcal: 705, protein: 1, carbs: 2, fat: 76, sat: 6, sugar: 2, unit: { grams: 15, label: "tbsp" } },
  { name: "Aldi Bramwells Light Mayonnaise", kcal: 285, protein: 1, carbs: 8, fat: 27, sat: 2, sugar: 5, unit: { grams: 15, label: "tbsp" } },
  { name: "Tesco Mayonnaise", kcal: 700, protein: 1.1, carbs: 2.5, fat: 75, sat: 6, sugar: 2.3, unit: { grams: 15, label: "tbsp" } },
  { name: "Tesco Light Mayonnaise", kcal: 280, protein: 1.2, carbs: 8.5, fat: 26, sat: 2, sugar: 5.5, unit: { grams: 15, label: "tbsp" } },
  { name: "Sainsbury's Mayonnaise", kcal: 702, protein: 1, carbs: 2.2, fat: 75.5, sat: 6, sugar: 2, unit: { grams: 15, label: "tbsp" } },
  { name: "Sainsbury's Light Mayonnaise", kcal: 283, protein: 1.1, carbs: 8.2, fat: 26.5, sat: 2, sugar: 5.3, unit: { grams: 15, label: "tbsp" } },
  { name: "Asda Mayonnaise", kcal: 698, protein: 1.1, carbs: 2.4, fat: 74.8, sat: 5.9, sugar: 2.2, unit: { grams: 15, label: "tbsp" } },
  { name: "Asda Light Mayonnaise", kcal: 279, protein: 1.2, carbs: 8.3, fat: 25.8, sat: 2, sugar: 5.4, unit: { grams: 15, label: "tbsp" } },
  { name: "Morrisons Mayonnaise", kcal: 700, protein: 1, carbs: 2.3, fat: 75, sat: 6, sugar: 2.1, unit: { grams: 15, label: "tbsp" } },
  { name: "Morrisons Light Mayonnaise", kcal: 281, protein: 1.1, carbs: 8.4, fat: 26.2, sat: 2, sugar: 5.2, unit: { grams: 15, label: "tbsp" } },
  { name: "Tesco Baked Beans", kcal: 75, protein: 4.8, carbs: 13, fat: 0.3, sat: 0.1, sugar: 5.2, unit: { grams: 200, label: "half tin" } },
  { name: "Sainsbury's Baked Beans", kcal: 74, protein: 4.9, carbs: 12.8, fat: 0.3, sat: 0.1, sugar: 5.1, unit: { grams: 200, label: "half tin" } },
  { name: "Asda Baked Beans", kcal: 74, protein: 4.7, carbs: 13.2, fat: 0.3, sat: 0.1, sugar: 5.3, unit: { grams: 200, label: "half tin" } },
  { name: "Morrisons Baked Beans", kcal: 75, protein: 4.8, carbs: 13, fat: 0.3, sat: 0.1, sugar: 5.2, unit: { grams: 200, label: "half tin" } },
  { name: "Tesco Tomato Ketchup", kcal: 115, protein: 1.3, carbs: 26.5, fat: 0.1, sat: 0, sugar: 24, unit: { grams: 15, label: "tbsp" } },
  { name: "Sainsbury's Tomato Ketchup", kcal: 114, protein: 1.2, carbs: 26.2, fat: 0.1, sat: 0, sugar: 23.8, unit: { grams: 15, label: "tbsp" } },
  { name: "Asda Tomato Ketchup", kcal: 113, protein: 1.2, carbs: 26, fat: 0.1, sat: 0, sugar: 23.5, unit: { grams: 15, label: "tbsp" } },
  { name: "Morrisons Tomato Ketchup", kcal: 114, protein: 1.3, carbs: 26.3, fat: 0.1, sat: 0, sugar: 23.9, unit: { grams: 15, label: "tbsp" } },
  { name: "Heinz Light Salad Cream", kcal: 186, protein: 1.6, carbs: 21, fat: 10.5, sat: 0.9, sugar: 11.5, unit: { grams: 15, label: "tbsp" } },
  { name: "Lurpak Lighter Spreadable", kcal: 396, protein: 0.5, carbs: 0.8, fat: 42, sat: 21, sugar: 0.8, unit: { grams: 10, label: "spread (per slice)" } },
  { name: "Flora Light Spread", kcal: 292, protein: 0.2, carbs: 1.5, fat: 32, sat: 6, sugar: 1.5, unit: { grams: 10, label: "spread (per slice)" } },
  { name: "Cathedral City Mature Cheddar", kcal: 416, protein: 25, carbs: 0.1, fat: 34.9, sat: 22, sugar: 0.1, unit: { grams: 30, label: "slice" } },
  { name: "Cathedral City Reduced Fat Mature Cheddar", kcal: 261, protein: 32, carbs: 0.3, fat: 15, sat: 9.5, sugar: 0.3, unit: { grams: 30, label: "slice" } },
  { name: "Aldi The Deli Light Coleslaw", kcal: 95, protein: 1.2, carbs: 9, fat: 5.5, sat: 0.6, sugar: 6.5, unit: { grams: 80, label: "portion" } },
  { name: "Walkers Baked Reduced Fat Crisps", kcal: 396, protein: 8.5, carbs: 73, fat: 8, sat: 0.8, sugar: 3, unit: { grams: 25, label: "bag" } },
  // ---- General expansion: meat & fish ----
  { name: "Turkey breast, roasted", kcal: 155, protein: 29, carbs: 0, fat: 3.6, sat: 1, sugar: 0, unit: { grams: 100, label: "portion" } },
  { name: "Beef steak, lean, grilled", kcal: 183, protein: 27, carbs: 0, fat: 8, sat: 3.3, sugar: 0, unit: { grams: 200, label: "steak" } },
  { name: "Pork chop, grilled, lean", kcal: 184, protein: 28, carbs: 0, fat: 8, sat: 2.7, sugar: 0, unit: { grams: 150, label: "chop" } },
  { name: "Lamb, roast, lean", kcal: 203, protein: 26, carbs: 0, fat: 11, sat: 4.7, sugar: 0, unit: { grams: 100, label: "portion" } },
  { name: "Tuna, canned in brine, drained", kcal: 99, protein: 23.5, carbs: 0, fat: 0.6, sat: 0.2, sugar: 0, unit: { grams: 145, label: "can" } },
  { name: "Tuna, canned in oil, drained", kcal: 189, protein: 24, carbs: 0, fat: 9.8, sat: 1.8, sugar: 0, unit: { grams: 145, label: "can" } },
  { name: "Prawns, cooked", kcal: 71, protein: 17.6, carbs: 0.4, fat: 0.5, sat: 0.1, sugar: 0, unit: { grams: 100, label: "handful" } },
  { name: "Cod, baked", kcal: 96, protein: 21.4, carbs: 0, fat: 1.2, sat: 0.2, sugar: 0, unit: { grams: 150, label: "fillet" } },
  { name: "Haddock, battered, fried (chip shop)", kcal: 199, protein: 15.5, carbs: 8.5, fat: 12, sat: 1.4, sugar: 0.3, unit: { grams: 200, label: "piece" } },
  { name: "Ham, sliced (deli)", kcal: 107, protein: 18.4, carbs: 1.3, fat: 3.3, sat: 1.1, sugar: 0.7, unit: { grams: 25, label: "slice" } },
  { name: "Turkey mince, cooked", kcal: 176, protein: 28, carbs: 0, fat: 7, sat: 2, sugar: 0, unit: { grams: 100, label: "portion" } },
  { name: "Beef burger, grilled (100% beef)", kcal: 264, protein: 20, carbs: 0.1, fat: 20, sat: 8.5, sugar: 0, unit: { grams: 113, label: "burger" } },
  // ---- Dairy & eggs ----
  { name: "Whole milk", kcal: 64, protein: 3.3, carbs: 4.6, fat: 3.6, sat: 2.3, sugar: 4.6, unit: { grams: 30, label: "splash (cereal/tea)" } },
  { name: "Skimmed milk", kcal: 34, protein: 3.4, carbs: 5, fat: 0.1, sat: 0.1, sugar: 5, unit: { grams: 30, label: "splash (cereal/tea)" } },
  { name: "Butter", kcal: 717, protein: 0.6, carbs: 0.1, fat: 81, sat: 51, sugar: 0.1, unit: { grams: 10, label: "spread (per slice)" } },
  { name: "Margarine / low-fat spread", kcal: 530, protein: 0.2, carbs: 1, fat: 59, sat: 15, sugar: 1, unit: { grams: 10, label: "spread (per slice)" } },
  { name: "Cream cheese, full fat", kcal: 342, protein: 3.1, carbs: 4.1, fat: 34, sat: 21, sugar: 3.6, unit: { grams: 30, label: "spread (2 tbsp)" } },
  { name: "Mozzarella cheese", kcal: 280, protein: 22, carbs: 0.7, fat: 21, sat: 13, sugar: 0.7, unit: { grams: 125, label: "ball" } },
  { name: "Feta cheese", kcal: 264, protein: 14.2, carbs: 1.5, fat: 22.4, sat: 15, sugar: 1.5, unit: { grams: 100, label: "portion" } },
  { name: "Cottage cheese, plain", kcal: 98, protein: 11, carbs: 3.1, fat: 4.3, sat: 2.7, sugar: 3.1, unit: { grams: 150, label: "pot" } },
  { name: "Double cream", kcal: 449, protein: 1.7, carbs: 2.7, fat: 48, sat: 30, sugar: 2.7, unit: { grams: 15, label: "tbsp" } },
  // ---- Grains, bread & carbs ----
  { name: "Brown rice, boiled", kcal: 123, protein: 2.6, carbs: 25.9, fat: 1, sat: 0.2, sugar: 0.4, unit: { grams: 180, label: "portion" } },
  { name: "Couscous, cooked", kcal: 112, protein: 3.8, carbs: 23.2, fat: 0.2, sat: 0, sugar: 0.2, unit: { grams: 180, label: "portion" } },
  { name: "Quinoa, cooked", kcal: 120, protein: 4.4, carbs: 21.3, fat: 1.9, sat: 0.2, sugar: 0.9, unit: { grams: 180, label: "portion" } },
  { name: "Egg noodles, boiled", kcal: 62, protein: 2.2, carbs: 13, fat: 0.5, sat: 0.1, sugar: 0.4, unit: { grams: 180, label: "portion" } },
  { name: "Bagel, plain", kcal: 275, protein: 10.5, carbs: 54, fat: 1.7, sat: 0.3, sugar: 5.5, unit: { grams: 90, label: "bagel" } },
  { name: "Pitta bread, white", kcal: 268, protein: 9.1, carbs: 55.7, fat: 1.2, sat: 0.2, sugar: 2.8, unit: { grams: 75, label: "pitta" } },
  { name: "Naan bread", kcal: 336, protein: 9.1, carbs: 50.3, fat: 11, sat: 4.5, sugar: 4.4, unit: { grams: 160, label: "naan" } },
  { name: "Tortilla wrap", kcal: 310, protein: 8.5, carbs: 50, fat: 8, sat: 1.8, sugar: 2.5, unit: { grams: 60, label: "wrap" } },
  { name: "Crumpet", kcal: 197, protein: 6.5, carbs: 43.5, fat: 1, sat: 0.2, sugar: 2, unit: { grams: 50, label: "crumpet" } },
  { name: "Croissant", kcal: 406, protein: 8.2, carbs: 45.9, fat: 21, sat: 12.4, sugar: 6.5, unit: { grams: 60, label: "croissant" } },
  { name: "Bran flakes", kcal: 321, protein: 10, carbs: 67, fat: 2, sat: 0.4, sugar: 17, unit: { grams: 40, label: "bowl" } },
  { name: "Cornflakes", kcal: 378, protein: 7, carbs: 84, fat: 0.9, sat: 0.2, sugar: 8, unit: { grams: 30, label: "bowl" } },
  { name: "Muesli, no added sugar", kcal: 355, protein: 10, carbs: 62, fat: 7, sat: 1.2, sugar: 20, unit: { grams: 50, label: "bowl" } },
  // ---- Fruit & veg ----
  { name: "Orange", kcal: 47, protein: 1.1, carbs: 8.5, fat: 0.1, sat: 0, sugar: 8.5, unit: { grams: 160, label: "orange" } },
  { name: "Strawberries", kcal: 33, protein: 0.8, carbs: 6.2, fat: 0.1, sat: 0, sugar: 6.2, unit: { grams: 80, label: "handful (portion)" } },
  { name: "Blueberries", kcal: 57, protein: 0.7, carbs: 12.3, fat: 0.3, sat: 0, sugar: 10, unit: { grams: 80, label: "handful (portion)" } },
  { name: "Grapes", kcal: 69, protein: 0.6, carbs: 16.1, fat: 0.2, sat: 0, sugar: 16.1, unit: { grams: 80, label: "handful (portion)" } },
  { name: "Pear", kcal: 42, protein: 0.3, carbs: 10.6, fat: 0.1, sat: 0, sugar: 10.6, unit: { grams: 170, label: "pear" } },
  { name: "Mango", kcal: 60, protein: 0.8, carbs: 14.1, fat: 0.2, sat: 0, sugar: 13.7, unit: { grams: 160, label: "portion" } },
  { name: "Pineapple", kcal: 50, protein: 0.5, carbs: 12.3, fat: 0.2, sat: 0, sugar: 12.3, unit: { grams: 80, label: "slice" } },
  { name: "Carrots, raw", kcal: 41, protein: 0.6, carbs: 9.6, fat: 0.2, sat: 0, sugar: 4.7, unit: { grams: 80, label: "portion" } },
  { name: "Peas, boiled", kcal: 79, protein: 6.7, carbs: 11.3, fat: 0.9, sat: 0.2, sugar: 2.7, unit: { grams: 80, label: "portion" } },
  { name: "Sweetcorn, boiled", kcal: 96, protein: 3.3, carbs: 19, fat: 1.4, sat: 0.2, sugar: 3.2, unit: { grams: 80, label: "portion" } },
  { name: "Cauliflower, boiled", kcal: 28, protein: 2.9, carbs: 2.1, fat: 0.9, sat: 0.1, sugar: 2, unit: { grams: 80, label: "portion" } },
  { name: "Cucumber", kcal: 10, protein: 0.7, carbs: 1.5, fat: 0.1, sat: 0, sugar: 1.5, unit: { grams: 30, label: "few slices" } },
  { name: "Tomato", kcal: 18, protein: 0.9, carbs: 3.1, fat: 0.2, sat: 0, sugar: 2.6, unit: { grams: 123, label: "tomato" } },
  { name: "Onion, raw", kcal: 40, protein: 1.2, carbs: 9.3, fat: 0.2, sat: 0, sugar: 4.2, unit: { grams: 75, label: "small onion" } },
  { name: "Mushrooms, raw", kcal: 22, protein: 1.8, carbs: 2.3, fat: 0.5, sat: 0.1, sugar: 1.5, unit: { grams: 80, label: "portion (handful)" } },
  { name: "Bell pepper", kcal: 33, protein: 1, carbs: 6.6, fat: 0.3, sat: 0, sugar: 5.2, unit: { grams: 120, label: "pepper" } },
  { name: "Sweet potato, baked", kcal: 115, protein: 2, carbs: 27.9, fat: 0.3, sat: 0, sugar: 8.6, unit: { grams: 180, label: "potato" } },
  { name: "Green beans, boiled", kcal: 25, protein: 1.9, carbs: 3.2, fat: 0.5, sat: 0.1, sugar: 3, unit: { grams: 80, label: "portion" } },
  // ---- Legumes & plant protein ----
  { name: "Chickpeas, canned, drained", kcal: 115, protein: 7.2, carbs: 16.1, fat: 2.1, sat: 0.2, sugar: 2.9, unit: { grams: 120, label: "portion" } },
  { name: "Lentils, cooked", kcal: 116, protein: 8.8, carbs: 17.5, fat: 0.4, sat: 0.1, sugar: 0.8, unit: { grams: 120, label: "portion" } },
  { name: "Kidney beans, canned", kcal: 100, protein: 6.9, carbs: 17.8, fat: 0.5, sat: 0.1, sugar: 0.5, unit: { grams: 120, label: "portion" } },
  { name: "Tofu, firm", kcal: 125, protein: 13.7, carbs: 0.9, fat: 7.3, sat: 1.1, sugar: 0.4, unit: { grams: 100, label: "portion" } },
  { name: "Hummus", kcal: 187, protein: 7.6, carbs: 11.6, fat: 12.6, sat: 1.5, sugar: 0.6, unit: { grams: 30, label: "2 tbsp" } },
  // ---- Nuts & seeds ----
  { name: "Almonds", kcal: 612, protein: 21.1, carbs: 6.9, fat: 55.8, sat: 4.4, sugar: 4.2, unit: { grams: 30, label: "handful" } },
  { name: "Cashews", kcal: 573, protein: 18, carbs: 26, fat: 46, sat: 9.2, sugar: 5.9, unit: { grams: 30, label: "handful" } },
  { name: "Mixed nuts", kcal: 607, protein: 20, carbs: 13, fat: 54, sat: 7, sugar: 4, unit: { grams: 30, label: "handful" } },
  { name: "Peanuts, salted", kcal: 602, protein: 24.5, carbs: 8.6, fat: 50, sat: 8.9, sugar: 3.9, unit: { grams: 30, label: "handful" } },
  { name: "Chia seeds", kcal: 486, protein: 17, carbs: 42, fat: 31, sat: 3.3, sugar: 0, unit: { grams: 15, label: "tbsp" } },
  // ---- Takeaway & fast food ----
  { name: "McDonald's Big Mac", kcal: 232, protein: 11.9, carbs: 19.2, fat: 11.4, sat: 4.6, sugar: 4.1, unit: { grams: 219, label: "burger" } },
  { name: "McDonald's medium fries", kcal: 296, protein: 3.1, carbs: 38.6, fat: 13.6, sat: 1.7, sugar: 0.3, unit: { grams: 114, label: "medium fries" } },
  { name: "KFC Original Recipe chicken breast", kcal: 242, protein: 24.2, carbs: 6.2, fat: 8.7, sat: 1.6, sugar: 0, unit: { grams: 161, label: "piece" } },
  { name: "Doner kebab, meat, pitta, salad & sauce", kcal: 250, protein: 12, carbs: 20, fat: 14, sat: 4, sugar: 3, unit: { grams: 350, label: "regular kebab" } },
  { name: "Chinese takeaway, sweet & sour chicken with rice", kcal: 165, protein: 8, carbs: 22, fat: 5, sat: 1, sugar: 8, unit: { grams: 400, label: "portion" } },
  { name: "Indian takeaway, chicken korma with rice", kcal: 195, protein: 8, carbs: 18, fat: 10.5, sat: 4.5, sugar: 3, unit: { grams: 400, label: "portion" } },
  // ---- Snacks & treats ----
  { name: "Milk chocolate bar", kcal: 534, protein: 7.3, carbs: 56.5, fat: 30.7, sat: 18.5, sugar: 56.5, unit: { grams: 45, label: "bar" } },
  { name: "Custard cream biscuit", kcal: 493, protein: 5.5, carbs: 68, fat: 22, sat: 10, sugar: 28, unit: { grams: 13, label: "biscuit" } },
  { name: "Rich tea biscuit", kcal: 450, protein: 7, carbs: 75, fat: 15, sat: 6.5, sugar: 24, unit: { grams: 8, label: "biscuit" } },
  { name: "Ice cream, vanilla", kcal: 197, protein: 3.5, carbs: 24.4, fat: 9.8, sat: 6, sugar: 21.2, unit: { grams: 60, label: "scoop" } },
  { name: "Jaffa cakes", kcal: 375, protein: 4, carbs: 71, fat: 8, sat: 3, sugar: 51, unit: { grams: 12, label: "cake" } },
  { name: "Scone with jam & clotted cream", kcal: 370, protein: 5.4, carbs: 47, fat: 17, sat: 9, sugar: 20, unit: { grams: 120, label: "scone with toppings" } },
  // ---- Drinks (non-alcoholic) ----
  { name: "Coca-Cola (regular)", kcal: 42, protein: 0, carbs: 10.6, fat: 0, sat: 0, sugar: 10.6, unit: { grams: 330, label: "can" } },
  { name: "Diet Coke", kcal: 0.3, protein: 0, carbs: 0, fat: 0, sat: 0, sugar: 0, unit: { grams: 330, label: "can" } },
  { name: "Orange juice", kcal: 45, protein: 0.5, carbs: 10.7, fat: 0.1, sat: 0, sugar: 10.4, unit: { grams: 150, label: "glass" } },
  { name: "Coffee, black", kcal: 1, protein: 0.1, carbs: 0, fat: 0, sat: 0, sugar: 0, unit: { grams: 200, label: "cup" } },
  { name: "Coffee with semi-skimmed milk", kcal: 15, protein: 0.9, carbs: 1.3, fat: 0.6, sat: 0.4, sugar: 1.3, unit: { grams: 200, label: "cup" } },
  { name: "Tea with semi-skimmed milk", kcal: 13, protein: 0.6, carbs: 1, fat: 0.6, sat: 0.4, sugar: 1, unit: { grams: 200, label: "cup" } },
  { name: "Energy drink", kcal: 45, protein: 0, carbs: 11, fat: 0, sat: 0, sugar: 11, unit: { grams: 250, label: "can" } },
  // ---- Sauces, condiments & oils ----
  { name: "Olive oil", kcal: 824, protein: 0, carbs: 0, fat: 91.6, sat: 13.8, sugar: 0, unit: { grams: 15, label: "tbsp" } },
  { name: "Mayonnaise", kcal: 680, protein: 1.1, carbs: 1.7, fat: 75.6, sat: 6, sugar: 1.3, unit: { grams: 15, label: "tbsp" } },
  { name: "Tomato ketchup", kcal: 100, protein: 1.4, carbs: 24.6, fat: 0.1, sat: 0, sugar: 22.8, unit: { grams: 15, label: "tbsp" } },
  { name: "Brown sauce", kcal: 98, protein: 1.1, carbs: 24, fat: 0.1, sat: 0, sugar: 20.9, unit: { grams: 15, label: "tbsp" } },
  { name: "Soy sauce", kcal: 43, protein: 5.6, carbs: 6, fat: 0, sat: 0, sugar: 1.3, unit: { grams: 10, label: "tbsp" } },
  { name: "Honey", kcal: 288, protein: 0.3, carbs: 76.4, fat: 0, sat: 0, sugar: 76.4, unit: { grams: 15, label: "tbsp" } },
  { name: "Strawberry jam", kcal: 258, protein: 0.6, carbs: 69, fat: 0, sat: 0, sugar: 69, unit: { grams: 15, label: "tbsp" } },
  // ---- Cafe items ----
  { name: "Latte, medium (semi-skimmed)", kcal: 130, protein: 7.9, carbs: 12.4, fat: 5.8, sat: 3.6, sugar: 12.4, unit: { grams: 340, label: "medium cup" } },
  { name: "Cappuccino, medium", kcal: 90, protein: 5.4, carbs: 8.5, fat: 3.9, sat: 2.4, sugar: 8.5, unit: { grams: 340, label: "medium cup" } },
  { name: "Flat white", kcal: 130, protein: 7.5, carbs: 9.5, fat: 6.8, sat: 4.2, sugar: 9.5, unit: { grams: 230, label: "cup" } },
  { name: "Chicken & pesto panini", kcal: 320, protein: 22, carbs: 30, fat: 13, sat: 4, sugar: 2, unit: { grams: 200, label: "panini" } },
  // ---- More fruit ----
  { name: "Raspberries", kcal: 25, protein: 1.4, carbs: 4.6, fat: 0.3, sat: 0, sugar: 4.6, unit: { grams: 80, label: "handful (portion)" } },
  { name: "Blackberries", kcal: 25, protein: 1.3, carbs: 4.4, fat: 0.2, sat: 0, sugar: 4.1, unit: { grams: 80, label: "handful (portion)" } },
  { name: "Watermelon", kcal: 31, protein: 0.6, carbs: 7.1, fat: 0.2, sat: 0, sugar: 6.2, unit: { grams: 150, label: "slice" } },
  { name: "Melon (cantaloupe)", kcal: 34, protein: 0.6, carbs: 8.3, fat: 0.1, sat: 0, sugar: 8, unit: { grams: 150, label: "slice" } },
  { name: "Kiwi fruit", kcal: 61, protein: 1.1, carbs: 10.6, fat: 0.5, sat: 0, sugar: 9, unit: { grams: 76, label: "kiwi" } },
  { name: "Peach", kcal: 39, protein: 1, carbs: 8.7, fat: 0.1, sat: 0, sugar: 8.4, unit: { grams: 150, label: "peach" } },
  { name: "Plum", kcal: 36, protein: 0.6, carbs: 8.6, fat: 0.1, sat: 0, sugar: 8.6, unit: { grams: 66, label: "plum" } },
  { name: "Cherries", kcal: 63, protein: 1.1, carbs: 14.6, fat: 0.2, sat: 0, sugar: 13.1, unit: { grams: 80, label: "handful (portion)" } },
  { name: "Nectarine", kcal: 40, protein: 1.1, carbs: 9, fat: 0.1, sat: 0, sugar: 8.4, unit: { grams: 140, label: "nectarine" } },
  { name: "Satsuma / clementine", kcal: 37, protein: 0.9, carbs: 8.3, fat: 0.1, sat: 0, sugar: 8.3, unit: { grams: 70, label: "satsuma" } },
  { name: "Grapefruit", kcal: 30, protein: 0.8, carbs: 6.8, fat: 0.1, sat: 0, sugar: 6.8, unit: { grams: 230, label: "grapefruit" } },
  { name: "Pomegranate", kcal: 83, protein: 1.7, carbs: 18.7, fat: 1.2, sat: 0.1, sugar: 13.9, unit: { grams: 87, label: "portion (half)" } },
  { name: "Dried apricots", kcal: 158, protein: 4, carbs: 36.5, fat: 0.6, sat: 0.1, sugar: 36.5, unit: { grams: 30, label: "handful (portion)" } },
  { name: "Raisins", kcal: 299, protein: 2.1, carbs: 69.3, fat: 0.4, sat: 0.1, sugar: 69.3, unit: { grams: 30, label: "handful (portion)" } },
  { name: "Dates, dried", kcal: 270, protein: 2, carbs: 68, fat: 0.4, sat: 0.1, sugar: 63, unit: { grams: 30, label: "3 dates" } },
  { name: "Figs, fresh", kcal: 43, protein: 1.3, carbs: 9.5, fat: 0.3, sat: 0, sugar: 9.5, unit: { grams: 50, label: "fig" } },
  { name: "Lemon", kcal: 19, protein: 1, carbs: 3.2, fat: 0.3, sat: 0, sugar: 2.5, unit: { grams: 60, label: "lemon" } },
  { name: "Lime", kcal: 20, protein: 0.7, carbs: 3, fat: 0.2, sat: 0, sugar: 1.7, unit: { grams: 44, label: "lime" } },
  { name: "Rhubarb, stewed (no added sugar)", kcal: 7, protein: 0.9, carbs: 0.9, fat: 0.1, sat: 0, sugar: 0.9, unit: { grams: 80, label: "portion" } },
  // ---- More vegetables ----
  { name: "Courgette, boiled", kcal: 19, protein: 2, carbs: 2, fat: 0.4, sat: 0.1, sugar: 2, unit: { grams: 80, label: "portion" } },
  { name: "Aubergine, grilled", kcal: 33, protein: 1.2, carbs: 2.6, fat: 2.1, sat: 0.3, sugar: 2.5, unit: { grams: 80, label: "portion" } },
  { name: "Leeks, boiled", kcal: 21, protein: 1.2, carbs: 2.9, fat: 0.7, sat: 0.1, sugar: 2.8, unit: { grams: 80, label: "portion" } },
  { name: "Celery, raw", kcal: 7, protein: 0.5, carbs: 0.9, fat: 0.2, sat: 0, sugar: 0.9, unit: { grams: 40, label: "stick" } },
  { name: "Cabbage, boiled", kcal: 16, protein: 1, carbs: 2.2, fat: 0.4, sat: 0.1, sugar: 2.2, unit: { grams: 80, label: "portion" } },
  { name: "Brussels sprouts, boiled", kcal: 35, protein: 2.9, carbs: 3.5, fat: 1.3, sat: 0.2, sugar: 3, unit: { grams: 80, label: "portion (6-7 sprouts)" } },
  { name: "Kale, raw", kcal: 49, protein: 4.3, carbs: 4.4, fat: 0.9, sat: 0.1, sugar: 0.8, unit: { grams: 80, label: "portion" } },
  { name: "Butternut squash, roasted", kcal: 45, protein: 1.4, carbs: 10, fat: 0.3, sat: 0.1, sugar: 3.4, unit: { grams: 80, label: "portion" } },
  { name: "Parsnips, roasted", kcal: 87, protein: 1.6, carbs: 13, fat: 3.4, sat: 0.4, sugar: 4.9, unit: { grams: 80, label: "portion" } },
  { name: "Beetroot, cooked", kcal: 46, protein: 1.7, carbs: 9.5, fat: 0.1, sat: 0, sugar: 9.5, unit: { grams: 80, label: "portion" } },
  { name: "Radish, raw", kcal: 12, protein: 0.7, carbs: 1.9, fat: 0.2, sat: 0, sugar: 1.9, unit: { grams: 40, label: "few radishes" } },
  { name: "Asparagus, boiled", kcal: 26, protein: 3.1, carbs: 1.9, fat: 0.6, sat: 0.1, sugar: 1.5, unit: { grams: 80, label: "portion (5-6 spears)" } },
  { name: "Runner beans, boiled", kcal: 18, protein: 1.4, carbs: 2.3, fat: 0.4, sat: 0.1, sugar: 1.9, unit: { grams: 80, label: "portion" } },
  { name: "Swede, boiled", kcal: 11, protein: 0.5, carbs: 2.3, fat: 0.1, sat: 0, sugar: 2.3, unit: { grams: 80, label: "portion" } },
  { name: "Garlic, raw", kcal: 98, protein: 7.9, carbs: 16.3, fat: 0.6, sat: 0.1, sugar: 1, unit: { grams: 3, label: "clove" } },
  { name: "Spring onion, raw", kcal: 23, protein: 2, carbs: 3, fat: 0.5, sat: 0.1, sugar: 2.3, unit: { grams: 15, label: "2 onions" } },
  { name: "Lettuce, iceberg", kcal: 13, protein: 0.7, carbs: 1.9, fat: 0.2, sat: 0, sugar: 1.9, unit: { grams: 30, label: "handful" } },
  { name: "Rocket", kcal: 25, protein: 2.6, carbs: 2, fat: 0.7, sat: 0.1, sugar: 2, unit: { grams: 20, label: "handful" } },
  { name: "Watercress", kcal: 22, protein: 3, carbs: 0.4, fat: 1, sat: 0.2, sugar: 0.4, unit: { grams: 20, label: "handful" } },
  { name: "Butter beans, canned", kcal: 77, protein: 5.9, carbs: 11.6, fat: 0.5, sat: 0.1, sugar: 1.3, unit: { grams: 120, label: "portion" } },
  { name: "Broad beans, boiled", kcal: 81, protein: 7.9, carbs: 11.7, fat: 0.6, sat: 0.1, sugar: 1.9, unit: { grams: 80, label: "portion" } },
  { name: "Edamame beans, boiled", kcal: 121, protein: 11.9, carbs: 8.9, fat: 5.2, sat: 0.6, sugar: 2.2, unit: { grams: 80, label: "portion" } },
  { name: "Celeriac, boiled", kcal: 15, protein: 0.8, carbs: 2, fat: 0.2, sat: 0, sugar: 1.6, unit: { grams: 80, label: "portion" } },
  { name: "Fennel, raw", kcal: 12, protein: 0.9, carbs: 1.8, fat: 0.2, sat: 0, sugar: 1.8, unit: { grams: 80, label: "portion" } },
  // ---- More nuts & seeds ----
  { name: "Walnuts", kcal: 688, protein: 14.7, carbs: 6.8, fat: 68.5, sat: 5.6, sugar: 2.6, unit: { grams: 30, label: "handful" } },
  { name: "Pistachios", kcal: 601, protein: 20.6, carbs: 8.2, fat: 53.5, sat: 6.1, sugar: 7.7, unit: { grams: 30, label: "handful" } },
  { name: "Brazil nuts", kcal: 682, protein: 14.1, carbs: 3.1, fat: 68.2, sat: 15.1, sugar: 2.3, unit: { grams: 30, label: "handful" } },
  { name: "Pecans", kcal: 691, protein: 9.2, carbs: 5.8, fat: 72, sat: 6.2, sugar: 4, unit: { grams: 30, label: "handful" } },
  { name: "Hazelnuts", kcal: 650, protein: 14.9, carbs: 6, fat: 63.5, sat: 4.7, sugar: 4.3, unit: { grams: 30, label: "handful" } },
  { name: "Macadamia nuts", kcal: 748, protein: 7.9, carbs: 5.2, fat: 76, sat: 12, sugar: 4.6, unit: { grams: 30, label: "handful" } },
  { name: "Pine nuts", kcal: 673, protein: 13.7, carbs: 4.5, fat: 68.6, sat: 4.9, sugar: 3.6, unit: { grams: 15, label: "tbsp" } },
  { name: "Sunflower seeds", kcal: 581, protein: 19.8, carbs: 18.8, fat: 47.3, sat: 4.5, sugar: 2.6, unit: { grams: 15, label: "tbsp" } },
  { name: "Pumpkin seeds", kcal: 559, protein: 24.5, carbs: 10.7, fat: 45.8, sat: 8.7, sugar: 1.4, unit: { grams: 15, label: "tbsp" } },
  { name: "Sesame seeds", kcal: 573, protein: 17.7, carbs: 11.6, fat: 49.7, sat: 7, sugar: 0.3, unit: { grams: 15, label: "tbsp" } },
  { name: "Flaxseed / linseed", kcal: 534, protein: 18.3, carbs: 1.6, fat: 42.2, sat: 3.7, sugar: 1.6, unit: { grams: 15, label: "tbsp" } },
  { name: "Desiccated coconut", kcal: 604, protein: 5.6, carbs: 6.4, fat: 62, sat: 53.9, sugar: 6.4, unit: { grams: 15, label: "tbsp" } },
  // ---- Recipe base ingredients ----
  { name: "Beef mince, lean (5% fat), cooked", kcal: 174, protein: 26.1, carbs: 0, fat: 7.6, sat: 3.2, sugar: 0, unit: { grams: 100, label: "portion" } },
  { name: "Lamb mince, lean, cooked", kcal: 234, protein: 24, carbs: 0, fat: 15, sat: 6.7, sugar: 0, unit: { grams: 100, label: "portion" } },
  { name: "Pork sausage, grilled", kcal: 279, protein: 13.7, carbs: 11.7, fat: 21.1, sat: 7.3, sugar: 1, unit: { grams: 50, label: "sausage" } },
  { name: "Chopped tomatoes, canned", kcal: 32, protein: 1.2, carbs: 5.5, fat: 0.3, sat: 0.1, sugar: 5, unit: { grams: 200, label: "half tin" } },
  { name: "Parmesan cheese, grated", kcal: 431, protein: 38.5, carbs: 0.9, fat: 29.7, sat: 20, sugar: 0.9, unit: { grams: 10, label: "tbsp" } },
  { name: "Coconut milk, canned", kcal: 187, protein: 1.8, carbs: 2.8, fat: 19.6, sat: 17.3, sugar: 2.8, unit: { grams: 200, label: "half tin" } },
  { name: "Curry paste", kcal: 150, protein: 3, carbs: 12, fat: 10, sat: 1.5, sugar: 4, unit: { grams: 20, label: "tbsp" } },
  { name: "Plain flour", kcal: 341, protein: 9.4, carbs: 77.7, fat: 1.3, sat: 0.2, sugar: 1.5, unit: { grams: 30, label: "2 tbsp" } },
  { name: "Soured cream", kcal: 198, protein: 2.9, carbs: 3.8, fat: 19.9, sat: 12.6, sugar: 3.8, unit: { grams: 15, label: "tbsp" } },
];

// ---------- Built-in recipes: standard one-person amounts, all editable before logging ----------
const RECIPES = [
  {
    name: "Spaghetti Bolognese",
    defaultMeal: "dinner",
    items: [
      { food: "Pasta, dried (uncooked)", grams: 90 },
      { food: "Beef mince, lean (5% fat), cooked", grams: 125 },
      { food: "Chopped tomatoes, canned", grams: 200 },
      { food: "Onion, raw", grams: 50 },
      { food: "Garlic, raw", grams: 5 },
      { food: "Olive oil", grams: 5 },
      { food: "Parmesan cheese, grated", grams: 10 },
    ],
  },
  {
    name: "Carbonara",
    defaultMeal: "dinner",
    items: [
      { food: "Pasta, dried (uncooked)", grams: 90 },
      { food: "Bacon rasher, grilled", grams: 60 },
      { food: "Egg, boiled", grams: 100 },
      { food: "Parmesan cheese, grated", grams: 20 },
      { food: "Double cream", grams: 30 },
    ],
  },
  {
    name: "Chicken Curry with rice",
    defaultMeal: "dinner",
    items: [
      { food: "Chicken breast, grilled", grams: 150 },
      { food: "Basmati rice, boiled", grams: 180 },
      { food: "Onion, raw", grams: 50 },
      { food: "Coconut milk, canned", grams: 100 },
      { food: "Curry paste", grams: 20 },
      { food: "Olive oil", grams: 5 },
    ],
  },
  {
    name: "Chilli Con Carne with rice",
    defaultMeal: "dinner",
    items: [
      { food: "Beef mince, lean (5% fat), cooked", grams: 125 },
      { food: "Kidney beans, canned", grams: 100 },
      { food: "Chopped tomatoes, canned", grams: 200 },
      { food: "Basmati rice, boiled", grams: 180 },
      { food: "Onion, raw", grams: 50 },
      { food: "Olive oil", grams: 5 },
    ],
  },
  {
    name: "Shepherd's Pie",
    defaultMeal: "dinner",
    items: [
      { food: "Lamb mince, lean, cooked", grams: 150 },
      { food: "Potato, baked (with skin)", grams: 250 },
      { food: "Onion, raw", grams: 40 },
      { food: "Carrots, raw", grams: 50 },
      { food: "Butter", grams: 10 },
      { food: "Whole milk", grams: 30 },
    ],
  },
  {
    name: "Chicken Stir Fry",
    defaultMeal: "dinner",
    items: [
      { food: "Chicken breast, grilled", grams: 150 },
      { food: "Egg noodles, boiled", grams: 150 },
      { food: "Bell pepper", grams: 50 },
      { food: "Broccoli, boiled", grams: 50 },
      { food: "Soy sauce", grams: 15 },
      { food: "Olive oil", grams: 5 },
    ],
  },
  {
    name: "Fish Pie",
    defaultMeal: "dinner",
    items: [
      { food: "Cod, baked", grams: 150 },
      { food: "Prawns, cooked", grams: 50 },
      { food: "Potato, baked (with skin)", grams: 250 },
      { food: "Whole milk", grams: 50 },
      { food: "Butter", grams: 10 },
      { food: "Cheddar cheese", grams: 20 },
    ],
  },
  {
    name: "Full English Breakfast",
    defaultMeal: "breakfast",
    items: [
      { food: "Bacon rasher, grilled", grams: 46 },
      { food: "Pork sausage, grilled", grams: 100 },
      { food: "Egg, boiled", grams: 50 },
      { food: "Baked beans, in tomato sauce", grams: 100 },
      { food: "Mushrooms, raw", grams: 50 },
      { food: "White bread", grams: 36 },
      { food: "Tomato", grams: 60 },
    ],
  },
  {
    name: "Chicken Fajitas",
    defaultMeal: "dinner",
    items: [
      { food: "Chicken breast, grilled", grams: 150 },
      { food: "Tortilla wrap", grams: 120 },
      { food: "Bell pepper", grams: 80 },
      { food: "Onion, raw", grams: 50 },
      { food: "Olive oil", grams: 10 },
      { food: "Cheddar cheese", grams: 20 },
      { food: "Soured cream", grams: 20 },
    ],
  },
  {
    name: "Macaroni Cheese",
    defaultMeal: "dinner",
    items: [
      { food: "Pasta, dried (uncooked)", grams: 90 },
      { food: "Cheddar cheese", grams: 60 },
      { food: "Whole milk", grams: 100 },
      { food: "Butter", grams: 15 },
      { food: "Plain flour", grams: 15 },
    ],
  },
  {
    name: "Sausage & Mash",
    defaultMeal: "dinner",
    items: [
      { food: "Pork sausage, grilled", grams: 150 },
      { food: "Potato, baked (with skin)", grams: 250 },
      { food: "Butter", grams: 10 },
      { food: "Whole milk", grams: 30 },
      { food: "Onion, raw", grams: 30 },
    ],
  },
  {
    name: "Thai Green Curry",
    defaultMeal: "dinner",
    items: [
      { food: "Chicken breast, grilled", grams: 150 },
      { food: "Coconut milk, canned", grams: 150 },
      { food: "Basmati rice, boiled", grams: 180 },
      { food: "Bell pepper", grams: 50 },
      { food: "Curry paste", grams: 25 },
      { food: "Olive oil", grams: 5 },
    ],
  },
  {
    name: "BLT Sandwich",
    defaultMeal: "lunch",
    items: [
      { food: "White bread", grams: 72 },
      { food: "Bacon rasher, grilled", grams: 69 },
      { food: "Lettuce, iceberg", grams: 15 },
      { food: "Tomato", grams: 40 },
      { food: "Mayonnaise", grams: 15 },
    ],
  },
  {
    name: "Cheese Omelette",
    defaultMeal: "breakfast",
    items: [
      { food: "Egg, boiled", grams: 150 },
      { food: "Cheddar cheese", grams: 30 },
      { food: "Butter", grams: 5 },
    ],
  },
];
function findFood(name, extra) {
  return FOOD_DB.find((f) => f.name === name) || (extra || []).find((f) => f.name === name);
}

// Edit distance between two strings — used below to tolerate typos in search.
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

// How many edits a word is allowed to be off by and still count as a typo of
// another word. Kept tight — with 1,000+ distinct words across the food list,
// even 2 edits on a short word starts colliding with unrelated words by pure
// coincidence ("bread" ~ "breast"/"spread" are both 2 edits away).
function maxEditDistance(len) {
  if (len <= 6) return 1;
  if (len <= 10) return 2;
  return 3;
}

// Score for how well a single query word matches a single target word — lower is
// better, null means no match at all.
function wordMatchScore(qw, tw) {
  if (tw === qw) return 0;
  if (tw.startsWith(qw)) return 1;
  if (tw.includes(qw)) return 2;
  if (qw[0] !== tw[0]) return null; // typos essentially never change the first letter
  const maxDist = maxEditDistance(qw.length);
  if (Math.abs(tw.length - qw.length) > maxDist) return null; // too different in length to be a typo
  const d = levenshtein(qw, tw);
  return d <= maxDist ? 3 + d : null;
}

// How well `text` matches `query` — lower is better, null means no match at all.
// Tries the whole query as one phrase first (cheapest, and what most correctly-
// ordered searches hit), then falls back to matching each query word independently
// against the target's words, in any order — so "grilled chicken" still finds
// "Chicken breast, grilled", and small spelling mistakes ("chiken", "bananna")
// still work. Every query word has to match something, or the whole query fails.
// Strips accents (é -> e, î -> i, etc.) so "creme fraiche" matches "Crème fraîche",
// and so the word-splitting regex below doesn't treat accented letters as delimiters.
function stripAccents(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function matchRank(query, text) {
  const q = stripAccents(query.trim().toLowerCase());
  if (!q) return null;
  const t = stripAccents(text.toLowerCase());
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (t.includes(q)) return 2;

  const queryWords = q.split(/[^a-z0-9]+/).filter(Boolean);
  const textWords = t.split(/[^a-z0-9]+/).filter(Boolean);
  if (queryWords.length === 0) return null;

  let total = 0;
  for (const qw of queryWords) {
    let best = null;
    for (const tw of textWords) {
      const s = wordMatchScore(qw, tw);
      if (s !== null && (best === null || s < best)) best = s;
    }
    if (best === null) return null; // this query word matched nothing — whole query fails
    total += best;
  }
  return 3 + total;
}

// Filters + ranks a list of named items against a query, worst matches dropped entirely.
function searchByName(query, items, nameOf) {
  return items
    .map((item) => ({ item, rank: matchRank(query, nameOf(item)) }))
    .filter((x) => x.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.item);
}

const DEFAULT_TARGETS = { kcal: 2200, protein: 130, carbs: 250, fat: 75, sat: 22, sugar: 65, water: 2.5, weeklyUnits: 14 };
const NUTRIENT_LABELS = { kcal: "kcal", protein: "protein", carbs: "carbs", fat: "fat", sat: "saturates", sugar: "sugar", water: "water", weeklyUnits: "weekly alcohol units" };
const UNIT = { kcal: "kcal", protein: "g", carbs: "g", fat: "g", sat: "g", sugar: "g", water: "L", weeklyUnits: "units" };
const MEALS = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snack", label: "Snacks" },
  { key: "drinks", label: "Drinks" },
];
const DEVICES = [
  { key: "apple_health", name: "Apple Health" },
  { key: "google_fit", name: "Google Fit" },
  { key: "fitbit", name: "Fitbit" },
  { key: "garmin", name: "Garmin" },
  { key: "samsung_health", name: "Samsung Health" },
];
function defaultMealForNow() {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 19) return "snack";
  return "dinner";
}
const LIQUID_UNIT_LABELS = ["pint", "glass", "single", "can", "bottle", "cup", "medium cup", "shot"];
function guessWeightUnit(food, mealVal) {
  if (!food) return mealVal === "drinks" ? "ml" : "g";
  if (food.units !== undefined) return "ml"; // alcoholic drinks
  if (food.unit && LIQUID_UNIT_LABELS.includes(food.unit.label)) return "ml";
  if (mealVal === "drinks") return "ml";
  return "g";
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00");
  const today = isoDate(new Date());
  const yest = isoDate(new Date(Date.now() - 86400000));
  if (iso === today) return "Today";
  if (iso === yest) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
// ---- Body weight: stored internally as kg, displayed as kg or stone/lb ----
const KG_PER_LB = 0.45359237;
const LB_PER_STONE = 14;
function kgToStoneLb(kg) {
  const totalLb = Math.round((kg / KG_PER_LB) * 10) / 10;
  const stone = Math.floor(totalLb / LB_PER_STONE);
  const lb = Math.round((totalLb - stone * LB_PER_STONE) * 10) / 10;
  return { stone, lb };
}
function stoneLbToKg(stone, lb) {
  return (stone * LB_PER_STONE + lb) * KG_PER_LB;
}
function displayWeight(kg, unit) {
  if (unit === "kg") return `${kg.toFixed(1)} kg`;
  const { stone, lb } = kgToStoneLb(kg);
  return `${stone}st ${lb.toFixed(1)}lb`;
}

function WeightSparkline({ entries, width = 280, height = 70 }) {
  if (entries.length < 2) return null;
  const kgs = entries.map((e) => e.kg);
  const min = Math.min(...kgs);
  const max = Math.max(...kgs);
  const range = max - min || 1;
  const pad = 8;
  const points = entries.map((e, i) => {
    const x = pad + (i / (entries.length - 1)) * (width - pad * 2);
    const y = height - pad - ((e.kg - min) / range) * (height - pad * 2);
    return [x, y];
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", margin: "8px 0" }}>
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="var(--sage-deep)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map(([x, y], i) => (
        <circle key={entries[i].date} cx={x} cy={y} r="2.5" fill="var(--sage-deep)" />
      ))}
    </svg>
  );
}

function trafficColor(pct) {
  if (pct <= 0.9) return "var(--green)";
  if (pct <= 1.1) return "var(--amber)";
  return "var(--red)";
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function last7Dates() {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    out.push(isoDate(new Date(Date.now() - i * 86400000)));
  }
  return out;
}
function weeklyTone(units, target) {
  if (target <= 0) return { color: "var(--sage-deep)", msg: "No weekly limit set." };
  const pct = units / target;
  if (pct <= 0.5) return { color: "var(--sage-deep)", msg: "Plenty of room if you fancy one." };
  if (pct <= 0.9) return { color: "var(--sage-deep)", msg: "Right on track for the week." };
  if (pct <= 1.0) return { color: "var(--amber)", msg: "Within guidelines — enjoy the weekend." };
  return { color: "var(--red)", msg: "A little over this week — no drama, just notice it." };
}
function weeklyKcalTone(consumed, target) {
  if (target <= 0) return { color: "var(--sage-deep)", msg: "No weekly target set." };
  const pct = consumed / target;
  if (pct <= 0.9) return { color: "var(--sage-deep)", msg: "Under for the week — a bigger meal today won't undo anything." };
  if (pct <= 1.05) return { color: "var(--sage-deep)", msg: "Right on track for the week." };
  if (pct <= 1.15) return { color: "var(--amber)", msg: "A touch over this week's average." };
  return { color: "var(--red)", msg: "Noticeably over this week — worth keeping an eye on, not a big deal though." };
}

function Logo({ size = 38 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="#276661" />
      <path
        d="M20 7a13 13 0 1 1-9.19 3.81"
        stroke="#FFFFFF"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
        opacity="0.92"
      />
      <circle cx="20" cy="20" r="4.5" fill="#FFFFFF" />
    </svg>
  );
}

export default function App() {
  const [date, setDate] = useState(isoDate(new Date()));
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [entries, setEntries] = useState([]);
  const [targets, setTargets] = useState(DEFAULT_TARGETS);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMealLibrary, setShowMealLibrary] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(null);
  const [grams, setGrams] = useState(100);
  const [customMode, setCustomMode] = useState(false);
  const [customFood, setCustomFood] = useState({ name: "", kcal: "", protein: "", carbs: "", fat: "", sat: "", sugar: "", units: "", barcode: "" });
  const [meal, setMeal] = useState(defaultMealForNow());
  const [water, setWater] = useState(0);
  const [activity, setActivity] = useState(0);
  const [deviceMsg, setDeviceMsg] = useState("");
  const [showWaterCelebration, setShowWaterCelebration] = useState(false);
  const [amountMode, setAmountMode] = useState("grams"); // 'grams' | 'count'
  const [weightUnit, setWeightUnit] = useState("g"); // 'g' | 'ml'
  const [count, setCount] = useState(1);
  const [unitWeight, setUnitWeight] = useState(100);
  const [otherDaysUnits, setOtherDaysUnits] = useState(0);
  const [otherDaysKcal, setOtherDaysKcal] = useState(0);
  const [combos, setCombos] = useState([]);
  const [customFoods, setCustomFoods] = useState([]);
  const [sessionAdds, setSessionAdds] = useState([]);
  const [savingCombo, setSavingCombo] = useState(false);
  const [comboName, setComboName] = useState("");
  const [recipe, setRecipe] = useState(null);
  const [recipeServings, setRecipeServings] = useState(1);
  const [recipeGrams, setRecipeGrams] = useState({});
  const [barcodeMode, setBarcodeMode] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [reminderTimeInput, setReminderTimeInput] = useState("");
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [reminderMsg, setReminderMsg] = useState("");
  const [reminderBusy, setReminderBusy] = useState(false);
  const [showWeight, setShowWeight] = useState(false);
  const [weightLog, setWeightLogState] = useState([]);
  const [bodyWeightUnit, setBodyWeightUnit] = useState("kg");
  const [weightKgInput, setWeightKgInput] = useState("");
  const [weightStoneInput, setWeightStoneInput] = useState("");
  const [weightLbInput, setWeightLbInput] = useState("");
  const [weightMsg, setWeightMsg] = useState("");
  const [weightSaving, setWeightSaving] = useState(false);
  const [startingWeightKg, setStartingWeightKgState] = useState(null);
  const [startingWeightDate, setStartingWeightDate] = useState(null);
  const [startingWeightInput, setStartingWeightInput] = useState("");
  const [startingWeightStoneInput, setStartingWeightStoneInput] = useState("");
  const [startingWeightLbInput, setStartingWeightLbInput] = useState("");
  const [startingWeightDateInput, setStartingWeightDateInput] = useState("");
  const [weightEntryDate, setWeightEntryDate] = useState("");
  const [showWeightCelebration, setShowWeightCelebration] = useState(false);
  const [weightCelebrationText, setWeightCelebrationText] = useState("");
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const trackRef = useRef(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const cameraSupported =
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function";

  const refreshOtherDays = useCallback(async () => {
    if (!user) return;
    const dates = last7Dates().filter((d) => d !== date);
    let units = 0;
    let kcal = 0;
    for (const d of dates) {
      try {
        const dayDoc = await getDay(user.uid, d);
        if (dayDoc && dayDoc.entries) {
          for (const e of dayDoc.entries) {
            units += e.units ? (e.units * e.grams) / 100 : 0;
            kcal += (e.kcal * e.grams) / 100;
          }
        }
      } catch (e) {
        /* no entries that day */
      }
    }
    setOtherDaysUnits(units);
    setOtherDaysKcal(kcal);
  }, [date, user]);

  // Watch Firebase Auth — this replaces the old PIN-switcher entirely.
  // Each person signs in once on their own device/browser and just sees their own data.
  useEffect(() => {
    const unsubscribe = watchAuth((u) => {
      setUser(u);
      setAuthChecked(true);
    });
    return unsubscribe;
  }, []);

  function handleSignOut() {
    signOutUser().catch((e) => console.error("Sign out failed", e));
  }

  async function enableReminders() {
    if (!reminderTimeInput) {
      setReminderMsg("Pick a time first.");
      return;
    }
    if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY === "YOUR_VAPID_PUBLIC_KEY") {
      setReminderMsg("Push notifications aren't set up yet — see the comment above VAPID_PUBLIC_KEY in App.jsx.");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setReminderMsg("This browser doesn't support push notifications.");
      return;
    }
    setReminderBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setReminderMsg("Notification permission was denied — enable it in your browser/phone settings to use reminders.");
        return;
      }
      const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
      const readyRegistration = await navigator.serviceWorker.ready;
      const subscription =
        (await readyRegistration.pushManager.getSubscription()) ||
        (await readyRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));
      await setPushSubscription(user.uid, subscription.toJSON());
      await setReminderTime(user.uid, reminderTimeInput);
      setPushSubscribed(true);
      setReminderMsg("Reminders are on.");
    } catch (e) {
      console.error("Failed to enable reminders", e);
      setReminderMsg("Couldn't turn reminders on — try again.");
    } finally {
      setReminderBusy(false);
    }
  }

  async function disableReminders() {
    setReminderBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration(`${import.meta.env.BASE_URL}sw.js`);
      const subscription = registration && (await registration.pushManager.getSubscription());
      if (subscription) await subscription.unsubscribe();
      await setPushSubscription(user.uid, null);
      setPushSubscribed(false);
      setReminderMsg("Reminders are off.");
    } catch (e) {
      console.error("Failed to disable reminders", e);
      setReminderMsg("Couldn't turn reminders off — try again.");
    } finally {
      setReminderBusy(false);
    }
  }

  function handleReminderTimeChange(time) {
    setReminderTimeInput(time);
    if (pushSubscribed && user) {
      setReminderTime(user.uid, time).catch((e) => console.error("Failed to save reminder time", e));
    }
  }

  // Fills the weigh-in inputs from whatever's already logged for `forDate`, or clears them.
  // Takes the log explicitly (rather than always reading the `weightLog` state) so callers
  // that just computed a new array — like a delete that hasn't re-rendered yet — stay in sync.
  function loadWeightInputsForDate(forDate, log = weightLog) {
    const entry = log.find((w) => w.date === forDate);
    if (entry) {
      setWeightKgInput(String(entry.kg));
      const { stone, lb } = kgToStoneLb(entry.kg);
      setWeightStoneInput(String(stone));
      setWeightLbInput(String(lb));
    } else {
      setWeightKgInput("");
      setWeightStoneInput("");
      setWeightLbInput("");
    }
  }

  function openWeightScreen() {
    const today = isoDate(new Date());
    setWeightEntryDate(today);
    loadWeightInputsForDate(today);
    if (startingWeightKg) {
      setStartingWeightInput(String(startingWeightKg));
      const { stone, lb } = kgToStoneLb(startingWeightKg);
      setStartingWeightStoneInput(String(stone));
      setStartingWeightLbInput(String(lb));
    } else {
      setStartingWeightInput("");
      setStartingWeightStoneInput("");
      setStartingWeightLbInput("");
    }
    setStartingWeightDateInput(startingWeightDate || today);
    setWeightMsg("");
    setShowWeight(true);
  }

  function handleWeightEntryDateChange(newDate) {
    setWeightEntryDate(newDate);
    loadWeightInputsForDate(newDate);
    setWeightMsg("");
  }

  // How much has been lost (positive) or gained (negative) as of the most recent entry
  function lostSoFar(log, startKg) {
    if (!startKg || log.length === 0) return null;
    const latest = [...log].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-1)[0];
    return Math.round((startKg - latest.kg) * 10) / 10;
  }

  // Celebrates crossing a new round-number milestone (every 5kg, or every stone if
  // that's the unit currently in view) — only fires forward, never on a step back.
  function checkWeightMilestone(prevLostKg, newLostKg) {
    const stepKg = bodyWeightUnit === "st" ? LB_PER_STONE * KG_PER_LB : 5;
    const prevMilestone = Math.floor((prevLostKg ?? 0) / stepKg);
    const newMilestone = Math.floor(newLostKg / stepKg);
    if (newMilestone > prevMilestone && newMilestone >= 1) {
      const amount = newMilestone * stepKg;
      const label =
        bodyWeightUnit === "st" ? `${newMilestone} stone` : `${Math.round(amount)}kg`;
      setWeightCelebrationText(`You've lost ${label} — amazing work.`);
      setShowWeightCelebration(true);
    }
  }

  async function saveWeightEntry() {
    const kg =
      bodyWeightUnit === "kg"
        ? parseFloat(weightKgInput)
        : stoneLbToKg(parseFloat(weightStoneInput) || 0, parseFloat(weightLbInput) || 0);
    if (!kg || isNaN(kg) || kg <= 0) {
      setWeightMsg("Enter a weight first.");
      return;
    }
    if (!weightEntryDate) {
      setWeightMsg("Pick a date first.");
      return;
    }
    setWeightSaving(true);
    const prevLost = lostSoFar(weightLog, startingWeightKg);
    const next = weightLog.filter((w) => w.date !== weightEntryDate);
    next.push({ date: weightEntryDate, kg: Math.round(kg * 10) / 10 });
    next.sort((a, b) => (a.date < b.date ? -1 : 1));
    setWeightLogState(next);
    try {
      await setWeightLog(user.uid, next);
      setWeightMsg("Saved.");
      const newLost = lostSoFar(next, startingWeightKg);
      if (startingWeightKg && newLost != null) checkWeightMilestone(prevLost, newLost);
    } catch (e) {
      console.error("Failed to save weight", e);
      setWeightMsg("Couldn't save — try again.");
    } finally {
      setWeightSaving(false);
    }
  }

  async function deleteWeightEntry(dateToDelete) {
    const next = weightLog.filter((w) => w.date !== dateToDelete);
    setWeightLogState(next);
    if (dateToDelete === weightEntryDate) loadWeightInputsForDate(weightEntryDate, next);
    try {
      await setWeightLog(user.uid, next);
    } catch (e) {
      console.error("Failed to delete weight entry", e);
    }
  }

  async function saveStartingWeightEntry() {
    const kg =
      bodyWeightUnit === "kg"
        ? parseFloat(startingWeightInput)
        : stoneLbToKg(parseFloat(startingWeightStoneInput) || 0, parseFloat(startingWeightLbInput) || 0);
    if (!kg || isNaN(kg) || kg <= 0) {
      setWeightMsg("Enter a starting weight first.");
      return;
    }
    const rounded = Math.round(kg * 10) / 10;
    const entryDate = startingWeightDateInput || isoDate(new Date());
    setStartingWeightKgState(rounded);
    setStartingWeightDate(entryDate);
    try {
      await setStartingWeight(user.uid, { kg: rounded, date: entryDate });
      setWeightMsg("Starting weight saved.");
    } catch (e) {
      console.error("Failed to save starting weight", e);
      setWeightMsg("Couldn't save — try again.");
    }
  }

  // Load the shared household library (combos + personal food entries) once signed in
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const lib = await getSharedLibrary();
        if (cancelled) return;
        setCombos(lib.combos || []);
        setCustomFoods(lib.customFoods || []);
      } catch (e) {
        console.error("Failed to load shared library", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const saveCombos = useCallback(async (next) => {
    setCombos(next);
    try {
      await setSharedLibrary({ combos: next });
    } catch (e) {
      console.error("Failed to save combos", e);
    }
  }, []);

  const saveCustomFoods = useCallback(async (next) => {
    setCustomFoods(next);
    try {
      await setSharedLibrary({ customFoods: next });
    } catch (e) {
      console.error("Failed to save custom foods", e);
    }
  }, []);

  // Load targets + today's entries whenever the signed-in user or viewed date changes
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const t = await getUserTargets(user.uid);
        if (!cancelled) setTargets(t ? { ...DEFAULT_TARGETS, ...t } : DEFAULT_TARGETS);
      } catch (e) {
        if (!cancelled) setTargets(DEFAULT_TARGETS);
      }
      try {
        const dayDoc = await getDay(user.uid, date);
        if (!cancelled) {
          setEntries(dayDoc && dayDoc.entries ? dayDoc.entries : []);
          setWater(dayDoc && dayDoc.water ? dayDoc.water : 0);
          setActivity(dayDoc && dayDoc.activity ? dayDoc.activity : 0);
        }
      } catch (e) {
        if (!cancelled) {
          setEntries([]);
          setWater(0);
          setActivity(0);
        }
      }
      if (!cancelled) setLoading(false);
    }
    load();
    refreshOtherDays();
    return () => {
      cancelled = true;
    };
  }, [date, user, refreshOtherDays]);

  // Load reminder settings once per signed-in user (not tied to the viewed date)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getReminderSettings(user.uid).then(({ reminderTime, pushSubscription }) => {
      if (cancelled) return;
      setReminderTimeInput(reminderTime || "");
      setPushSubscribed(!!pushSubscription);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Load body weight log once per signed-in user — private to them, like reminder settings
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getWeightLog(user.uid).then(({ weights, startingWeight }) => {
      if (cancelled) return;
      setWeightLogState(weights || []);
      setStartingWeightKgState(startingWeight ? startingWeight.kg : null);
      setStartingWeightDate(startingWeight ? startingWeight.date : null);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const saveEntries = useCallback(
    async (next) => {
      setEntries(next);
      if (!user) return;
      try {
        await setDay(user.uid, date, { entries: next });
      } catch (e) {
        console.error("Failed to save entries", e);
      }
    },
    [date, user]
  );

  const saveTargets = useCallback(
    async (next) => {
      setTargets(next);
      if (!user) return;
      try {
        await setUserTargets(user.uid, next);
      } catch (e) {
        console.error("Failed to save targets", e);
      }
    },
    [user]
  );

  const saveWater = useCallback(
    async (next) => {
      const clamped = Math.max(0, Math.round(next * 10) / 10);
      const crossedGoal = targets.water > 0 && water < targets.water && clamped >= targets.water;
      setWater(clamped);
      if (user) {
        try {
          await setDay(user.uid, date, { water: clamped });
        } catch (e) {
          console.error("Failed to save water", e);
        }
      }
      if (crossedGoal) setShowWaterCelebration(true);
    },
    [date, water, targets.water, user]
  );

  const saveActivity = useCallback(
    async (next) => {
      const clamped = Math.max(0, Math.round(next));
      setActivity(clamped);
      if (!user) return;
      try {
        await setDay(user.uid, date, { activity: clamped });
      } catch (e) {
        console.error("Failed to save activity", e);
      }
    },
    [date, user]
  );

  const totals = useMemo(() => {
    const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, sat: 0, sugar: 0 };
    for (const e of entries) {
      const f = e.grams / 100;
      t.kcal += e.kcal * f;
      t.protein += e.protein * f;
      t.carbs += e.carbs * f;
      t.fat += e.fat * f;
      t.sat += e.sat * f;
      t.sugar += e.sugar * f;
    }
    return t;
  }, [entries]);

  const weeklyUnits = useMemo(() => {
    const withinWindow = last7Dates().includes(date);
    const liveTodayUnits = withinWindow
      ? entries.reduce((s, e) => s + (e.units ? (e.units * e.grams) / 100 : 0), 0)
      : 0;
    return Math.round((otherDaysUnits + liveTodayUnits) * 10) / 10;
  }, [otherDaysUnits, entries, date]);

  const weeklyKcal = useMemo(() => {
    const withinWindow = last7Dates().includes(date);
    const liveTodayKcal = withinWindow ? totals.kcal : 0;
    return Math.round(otherDaysKcal + liveTodayKcal);
  }, [otherDaysKcal, totals, date]);

  useEffect(() => {
    if (!showWaterCelebration) return;
    const t = setTimeout(() => setShowWaterCelebration(false), 2800);
    return () => clearTimeout(t);
  }, [showWaterCelebration]);

  useEffect(() => {
    if (!showWeightCelebration) return;
    const t = setTimeout(() => setShowWeightCelebration(false), 3400);
    return () => clearTimeout(t);
  }, [showWeightCelebration]);


  const results = useMemo(() => {
    if (!query.trim()) return [];
    const barcodeHit = customFoods.filter((f) => f.barcode && f.barcode === query.trim());
    const mine = searchByName(query, customFoods, (f) => f.name).map((f) => ({ ...f, mine: true }));
    const stock = searchByName(query, FOOD_DB, (f) => f.name);
    // De-dupe in case a custom food's barcode happened to also match by name
    const mineNames = new Set(mine.map((f) => f.name));
    const extraBarcodeHits = barcodeHit.filter((f) => !mineNames.has(f.name)).map((f) => ({ ...f, mine: true }));
    return [...extraBarcodeHits, ...mine, ...stock].slice(0, 25);
  }, [query, customFoods]);

  const recipeResults = useMemo(() => searchByName(query, RECIPES, (r) => r.name), [query]);

  const comboResults = useMemo(() => searchByName(query, combos, (c) => c.name), [query, combos]);

  const libraryCombos = useMemo(() => {
    if (!libraryQuery.trim()) return combos;
    return searchByName(libraryQuery, combos, (c) => c.name);
  }, [libraryQuery, combos]);

  const libraryRecipes = useMemo(() => {
    if (!libraryQuery.trim()) return RECIPES;
    return searchByName(libraryQuery, RECIPES, (r) => r.name);
  }, [libraryQuery]);

  const sortedWeightLog = useMemo(() => [...weightLog].sort((a, b) => (a.date < b.date ? -1 : 1)), [weightLog]);

  const weightTrend = useMemo(() => {
    if (startingWeightKg && sortedWeightLog.length >= 1) {
      const last = sortedWeightLog[sortedWeightLog.length - 1];
      return {
        last,
        baselineLabel: startingWeightDate ? `you started (${fmtDate(startingWeightDate)})` : "your starting weight",
        deltaKg: Math.round((last.kg - startingWeightKg) * 10) / 10,
      };
    }
    if (sortedWeightLog.length < 2) return null;
    const first = sortedWeightLog[0];
    const last = sortedWeightLog[sortedWeightLog.length - 1];
    return {
      last,
      baselineLabel: `your first entry (${fmtDate(first.date)})`,
      deltaKg: Math.round((last.kg - first.kg) * 10) / 10,
    };
  }, [sortedWeightLog, startingWeightKg, startingWeightDate]);

  const groupedByMeal = useMemo(() => {
    const g = { breakfast: [], lunch: [], dinner: [], snack: [], drinks: [] };
    for (const e of entries) {
      const k = g[e.meal] ? e.meal : "snack";
      g[k].push(e);
    }
    return g;
  }, [entries]);

  const effectiveGrams = amountMode === "count" ? (parseFloat(count) || 0) * (parseFloat(unitWeight) || 0) : parseFloat(grams) || 0;

  function openAdd() {
    setShowAdd(true);
    setQuery("");
    setPicked(null);
    setGrams(100);
    setCustomMode(false);
    setCustomFood({ name: "", kcal: "", protein: "", carbs: "", fat: "", sat: "", sugar: "", units: "", barcode: "" });
    setMeal(defaultMealForNow());
    setAmountMode("grams");
    setCount(1);
    setUnitWeight(100);
    setSessionAdds([]);
    setSavingCombo(false);
    setComboName("");
    setRecipe(null);
    setRecipeServings(1);
    setRecipeGrams({});
    setBarcodeMode(false);
    setBarcodeInput("");
    setWeightUnit("g");
  }

  function selectRecipe(r) {
    setRecipe(r);
    setRecipeServings(1);
    const g = {};
    r.items.forEach((it, i) => {
      g[i] = it.grams;
    });
    setRecipeGrams(g);
    if (r.defaultMeal) setMeal(r.defaultMeal);
  }

  function openRecipeFromLibrary(r) {
    setPicked(null);
    setCustomMode(false);
    setBarcodeMode(false);
    setQuery("");
    selectRecipe(r);
    setShowMealLibrary(false);
    setShowAdd(true);
  }

  function scaleRecipeServings(next) {
    const s = Math.max(0.5, Math.round(next * 2) / 2);
    setRecipeServings(s);
    const g = {};
    recipe.items.forEach((it, i) => {
      g[i] = Math.round(it.grams * s * 10) / 10;
    });
    setRecipeGrams(g);
  }

  async function confirmRecipe() {
    if (!recipe) return;
    const newEntries = recipe.items
      .map((it) => findFood(it.food, customFoods))
      .map((food, i) => (food ? { ...food, id: uid(), grams: parseFloat(recipeGrams[i]) || 0, meal } : null))
      .filter(Boolean);
    if (newEntries.length === 0) return;
    await saveEntries([...entries, ...newEntries]);
    setSessionAdds((prev) => [...prev, ...newEntries]);
    setRecipe(null);
    resetPickerForNextItem();
  }

  function selectFood(f) {
    setPicked(f);
    setWeightUnit(guessWeightUnit(f, meal));
    if (f.unit) {
      setAmountMode("count");
      setCount(1);
      setUnitWeight(f.unit.grams);
      setGrams(f.unit.grams);
    } else {
      setAmountMode("grams");
      setGrams(100);
    }
  }

  async function fetchOpenFoodFacts(code) {
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,nutriments,serving_quantity,serving_size`
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (data.status !== 1 || !data.product) return null;
      const n = data.product.nutriments || {};
      const name = [data.product.brands, data.product.product_name].filter(Boolean).join(" — ") || "Scanned item";

      // Prefer proper per-100g/ml figures when the database has them
      let kcal = n["energy-kcal_100g"];
      let protein = n.proteins_100g;
      let carbs = n.carbohydrates_100g;
      let fat = n.fat_100g;
      let sat = n["saturated-fat_100g"];
      let sugar = n.sugars_100g;

      // Fall back to per-serving figures and compute our own per-100g conversion —
      // common for small servings (sauces, spices) where the database has the label
      // numbers but the serving is too small for it to auto-compute a per-100g value.
      if (kcal === undefined && n["energy-kcal_serving"] !== undefined) {
        const servingGrams = parseFloat(data.product.serving_quantity) || null;
        if (servingGrams && servingGrams > 0) {
          const scale = 100 / servingGrams;
          kcal = n["energy-kcal_serving"] * scale;
          protein = (n.proteins_serving ?? 0) * scale;
          carbs = (n.carbohydrates_serving ?? 0) * scale;
          fat = (n.fat_serving ?? 0) * scale;
          sat = (n["saturated-fat_serving"] ?? 0) * scale;
          sugar = (n.sugars_serving ?? 0) * scale;
        }
      }

      if (kcal === undefined || kcal === null) return null; // still nothing usable

      return {
        name,
        kcal: Math.round(kcal),
        protein: Math.round((protein ?? 0) * 10) / 10,
        carbs: Math.round((carbs ?? 0) * 10) / 10,
        fat: Math.round((fat ?? 0) * 10) / 10,
        sat: Math.round((sat ?? 0) * 10) / 10,
        sugar: Math.round((sugar ?? 0) * 10) / 10,
      };
    } catch (e) {
      return null; // offline, API down, or blocked — fall back to manual entry
    }
  }

  async function fetchUSDA(code) {
    if (!USDA_API_KEY) return null; // key cleared out — lookup simply skipped
    try {
      const res = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(
          code
        )}&dataType=Branded&pageSize=5`
      );
      if (!res.ok) return null;
      const data = await res.json();
      const foods = data.foods || [];
      if (foods.length === 0) return null;

      // Prefer an exact barcode match; otherwise fall back to the top search result
      const stripLeadingZeros = (s) => (s || "").replace(/^0+/, "");
      const match =
        foods.find((f) => stripLeadingZeros(f.gtinUpc) === stripLeadingZeros(code)) || foods[0];

      const nutrients = match.foodNutrients || [];
      const findNutrient = (name) => {
        const n = nutrients.find((x) => x.nutrientName === name);
        return n ? n.value : undefined;
      };

      const kcal = findNutrient("Energy");
      if (kcal === undefined) return null;

      const name = [match.brandOwner, match.description].filter(Boolean).join(" — ") || "Scanned item";
      return {
        name,
        kcal: Math.round(kcal),
        protein: findNutrient("Protein") ?? 0,
        carbs: findNutrient("Carbohydrate, by difference") ?? 0,
        fat: findNutrient("Total lipid (fat)") ?? 0,
        sat: findNutrient("Fatty acids, total saturated") ?? 0,
        sugar: findNutrient("Sugars, total including NLEA") ?? findNutrient("Sugars, total") ?? 0,
      };
    } catch (e) {
      return null; // offline, API down, key not set up, or rate-limited
    }
  }

  async function lookupBarcode(codeOverride) {
    const code = (codeOverride || barcodeInput).trim();
    if (!code) return;
    setBarcodeInput("");

    const match = customFoods.find((f) => f.barcode && f.barcode === code);
    if (match) {
      setBarcodeMode(false);
      selectFood(match);
      return;
    }

    setBarcodeLoading(true);
    const found = (await fetchOpenFoodFacts(code)) || (await fetchUSDA(code));
    setBarcodeLoading(false);
    setBarcodeMode(false);
    setCustomMode(true);
    setAmountMode("grams");
    setGrams(100);
    setCount(1);
    setUnitWeight(100);
    setWeightUnit(meal === "drinks" ? "ml" : "g");

    if (found) {
      setCustomFood({
        name: found.name,
        kcal: String(found.kcal),
        protein: String(found.protein),
        carbs: String(found.carbs),
        fat: String(found.fat),
        sat: String(found.sat),
        sugar: String(found.sugar),
        units: "",
        barcode: code,
      });
    } else {
      setCustomFood({ name: "", kcal: "", protein: "", carbs: "", fat: "", sat: "", sugar: "", units: "", barcode: code });
    }
  }

  function stopScan() {
    setScanning(false);
  }

  function startScan() {
    setScanError("");
    if (!cameraSupported) {
      setScanError("Camera scanning isn't supported in this browser — type the number below instead.");
      return;
    }
    setScanning(true);
  }

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(!torchOn);
    } catch (e) {
      // Some browsers report torch support but reject the constraint anyway — ignore.
    }
  }

  // Runs only after React has actually mounted the <video> element for `scanning === true`.
  // We handle getUserMedia + play() ourselves (the same proven pattern that turns on the
  // camera), and only hand the *already playing* video to the scanning library — this
  // removes any dependence on how that library chooses to manage the stream internally.
  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    let stream = null;
    let controlsLocal = null;

    (async () => {
      try {
        // Ask for a decent resolution and continuous autofocus — low-res, unfocused
        // frames are the biggest reason a real barcode fails to decode. Both go in
        // `ideal`/`advanced` so unsupported cameras just ignore them instead of failing.
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: "continuous" }],
          },
        });
        if (cancelled || !videoRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        setTorchSupported(!!(track && track.getCapabilities && track.getCapabilities().torch));

        const video = videoRef.current;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true"); // belt-and-braces for iOS autoplay
        await video.play();
        if (cancelled) return;

        const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        // Retail food/drink barcodes are always one of these — restricting to just
        // them (instead of ZXing's default of every format, including 2D ones like
        // QR/PDF417) makes each frame decode faster and cuts down false negatives.
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.ITF,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const codeReader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 100, // default is 500ms — far too sluggish for a handheld scan
          delayBetweenScanSuccess: 500,
        });
        const controls = await codeReader.decodeFromVideoElement(video, (result) => {
          if (result && !cancelled) {
            const value = result.getText();
            setScanning(false);
            setBarcodeInput(value);
            lookupBarcode(value);
          }
          // decode errors on frames with no barcode are normal and ignored
        });
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsLocal = controls;
        readerRef.current = controls;
      } catch (e) {
        if (!cancelled) {
          setScanError("Couldn't access the camera — check permissions, or type the number below instead.");
          setScanning(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (controlsLocal) {
        try {
          controlsLocal.stop();
        } catch (e) {
          /* already stopped */
        }
      }
      readerRef.current = null;
      trackRef.current = null;
      setTorchSupported(false);
      setTorchOn(false);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [scanning]);

  useEffect(() => {
    if (!barcodeMode) stopScan();
    return () => stopScan();
  }, [barcodeMode]);

  function resetPickerForNextItem() {
    setQuery("");
    setPicked(null);
    setCustomMode(false);
    setCustomFood({ name: "", kcal: "", protein: "", carbs: "", fat: "", sat: "", sugar: "", units: "", barcode: "" });
    setAmountMode("grams");
    setCount(1);
    setUnitWeight(100);
    setGrams(100);
    setRecipe(null);
    setBarcodeMode(false);
    setBarcodeInput("");
    setWeightUnit(meal === "drinks" ? "ml" : "g");
  }

  function confirmAdd() {
    const base = customMode
      ? {
          name: customFood.name || "Custom food",
          kcal: parseFloat(customFood.kcal) || 0,
          protein: parseFloat(customFood.protein) || 0,
          carbs: parseFloat(customFood.carbs) || 0,
          fat: parseFloat(customFood.fat) || 0,
          sat: parseFloat(customFood.sat) || 0,
          sugar: parseFloat(customFood.sugar) || 0,
          units: parseFloat(customFood.units) || 0,
          barcode: customFood.barcode ? customFood.barcode.trim() : "",
        }
      : picked;
    if (!base) return;
    const unitLabel = amountMode === "grams" ? weightUnit : "g";
    const entry = { id: uid(), ...base, grams: Math.round(effectiveGrams * 10) / 10, meal, unitLabel };
    saveEntries([...entries, entry]);
    setSessionAdds((prev) => [...prev, entry]);
    if (customMode) {
      const exists = customFoods.some((f) => f.name.toLowerCase() === base.name.toLowerCase());
      if (!exists) {
        const { units, ...rest } = base;
        const libraryItem = units > 0 ? base : rest;
        saveCustomFoods([...customFoods, libraryItem]);
      }
    }
    resetPickerForNextItem();
  }

  function closeAdd() {
    stopScan();
    setShowAdd(false);
  }

  async function logCombo(combo, mealOverride) {
    const targetMeal = mealOverride || meal;
    const newEntries = combo.items.map((it) => ({ ...it, id: uid(), meal: targetMeal }));
    await saveEntries([...entries, ...newEntries]);
    setSessionAdds((prev) => [...prev, ...newEntries]);
  }

  function handleSaveCombo() {
    if (!comboName.trim() || sessionAdds.length === 0) return;
    const combo = {
      id: uid(),
      name: comboName.trim(),
      items: sessionAdds.map(({ id, meal: m, ...rest }) => rest),
    };
    saveCombos([...combos, combo]);
    setSavingCombo(false);
    setComboName("");
  }

  function deleteCombo(id) {
    saveCombos(combos.filter((c) => c.id !== id));
  }

  function removeEntry(id) {
    saveEntries(entries.filter((e) => e.id !== id));
    setSessionAdds((prev) => prev.filter((e) => e.id !== id));
  }

  function shiftDate(days) {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + days);
    setDate(isoDate(d));
  }

  const budgetKcal = targets.kcal + activity;
  const kcalPct = budgetKcal ? totals.kcal / budgetKcal : 0;
  const ringColor = trafficColor(kcalPct);
  const ringDeg = Math.min(kcalPct, 1) * 360;
  const remaining = Math.round(budgetKcal - totals.kcal);

  if (!authChecked) {
    return (
      <div style={styles.app}>
        <style>{FONT_IMPORT}</style>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={styles.app}>
        <style>{FONT_IMPORT}</style>
        <AuthScreen styles={styles} />
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <style>{FONT_IMPORT}</style>

      {showWaterCelebration && (
        <div style={styles.celebrationToast} className="celebrate-toast">
          <span style={styles.celebrationEmoji}>💧</span>
          <div>
            <div style={styles.celebrationTitle}>Water goal hit!</div>
            <div style={styles.celebrationSub}>Nice one — {targets.water}L done for today.</div>
          </div>
        </div>
      )}
      {showWeightCelebration && (
        <div style={styles.celebrationToast} className="celebrate-toast">
          <span style={styles.celebrationEmoji}>🎉</span>
          <div>
            <div style={styles.celebrationTitle}>Milestone reached!</div>
            <div style={styles.celebrationSub}>{weightCelebrationText}</div>
          </div>
        </div>
      )}
      <div style={styles.shell}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.headerTop}>
            <span style={styles.eyebrow}>NUTRITION TRACKER</span>
            <div style={styles.headerActions}>
              <button style={styles.profilePill} onClick={handleSignOut} aria-label="Sign out">
                <span style={styles.profileDot} />
                {user.displayName || user.email}
                <LogOut size={13} strokeWidth={2} style={{ marginLeft: 2, opacity: 0.6 }} />
              </button>
              <button
                style={styles.iconBtn}
                onClick={() => {
                  setShowMealLibrary(true);
                  setLibraryQuery("");
                }}
                aria-label="Meal library"
              >
                <BookOpen size={18} strokeWidth={1.75} />
              </button>
              <button style={styles.iconBtn} onClick={openWeightScreen} aria-label="Weight tracker">
                <Weight size={18} strokeWidth={1.75} />
              </button>
              <button
                style={styles.iconBtn}
                onClick={() => {
                  setShowSettings(true);
                  setDeviceMsg("");
                }}
                aria-label="Targets settings"
              >
                <Settings2 size={18} strokeWidth={1.75} />
              </button>
            </div>
          </div>
          <div style={styles.brandRow}>
            <Logo size={38} />
            <h1 style={styles.title}>Kcal Tracker</h1>
          </div>
          <p style={styles.tagline}>Log what fits. No perfect days required.</p>
          <button style={styles.heroAddBtn} onClick={openAdd}>
            <Plus size={18} strokeWidth={2.25} /> Add food
          </button>
        </header>

        {/* Date nav */}
        <div style={styles.dateNav}>
          <button style={styles.navBtn} onClick={() => shiftDate(-1)} aria-label="Previous day">
            <ChevronLeft size={18} />
          </button>
          <span style={styles.dateLabel}>{fmtDate(date)}</span>
          <button style={styles.navBtn} onClick={() => shiftDate(1)} aria-label="Next day">
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Ring + macros */}
        <div style={styles.card}>
          <div style={styles.ringRow}>
            <div style={styles.ringCol}>
              <div
                style={{
                  ...styles.ring,
                  background: `conic-gradient(${ringColor} ${ringDeg}deg, rgba(20,20,15,0.07) 0deg)`,
                }}
              >
                <div style={styles.ringInner}>
                  <span style={styles.ringNum}>{Math.abs(remaining)}</span>
                  <span style={styles.ringUnit}>{remaining >= 0 ? "left today" : "over today"}</span>
                </div>
              </div>
              <span style={styles.ringCaption}>
                {Math.round(totals.kcal)} of {budgetKcal}
                {activity > 0 ? ` (${targets.kcal} + ${activity} earned)` : ""} kcal
              </span>
            </div>
            <div style={styles.macroList}>
              {["protein", "carbs", "fat", "sat", "sugar"].map((k) => {
                const pct = targets[k] ? totals[k] / targets[k] : 0;
                return (
                  <div key={k} style={styles.macroRow}>
                    <span style={styles.macroLabel}>{NUTRIENT_LABELS[k]}</span>
                    <div style={styles.macroBarTrack}>
                      <div
                        style={{
                          ...styles.macroBarFill,
                          width: `${Math.min(pct, 1) * 100}%`,
                          background: trafficColor(pct),
                        }}
                      />
                    </div>
                    <span style={styles.macroVal}>
                      {Math.round(totals[k])}
                      <span style={styles.macroUnit}>{UNIT[k]}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* This week's calories — a lighter day banks room for a bigger one */}
        <div style={styles.waterCard}>
          <div style={styles.waterTop}>
            <span style={styles.sectionLabel}>THIS WEEK</span>
            <span style={styles.waterReading}>
              {weeklyKcal.toLocaleString()}
              <span style={styles.macroUnit}> / {(targets.kcal * 7).toLocaleString()} kcal</span>
            </span>
          </div>
          <div style={styles.macroBarTrack}>
            <div
              style={{
                ...styles.macroBarFill,
                width: `${Math.min(targets.kcal ? weeklyKcal / (targets.kcal * 7) : 0, 1) * 100}%`,
                background: weeklyKcalTone(weeklyKcal, targets.kcal * 7).color,
              }}
            />
          </div>
          <p style={styles.drinksTone}>
            {targets.kcal * 7 - weeklyKcal >= 0
              ? `${(targets.kcal * 7 - weeklyKcal).toLocaleString()} kcal spare across the week.`
              : `${Math.abs(targets.kcal * 7 - weeklyKcal).toLocaleString()} kcal over across the week.`}
          </p>
          <p style={styles.drinksCaption}>{weeklyKcalTone(weeklyKcal, targets.kcal * 7).msg}</p>
        </div>

        {/* Water */}
        <div style={styles.waterCard}>
          <div style={styles.waterTop}>
            <span style={styles.sectionLabel}>WATER</span>
            <span style={styles.waterReading}>
              {water.toFixed(1)}
              <span style={styles.macroUnit}> / {targets.water.toFixed(1)} L</span>
            </span>
          </div>
          <div style={styles.macroBarTrack}>
            <div
              style={{
                ...styles.macroBarFill,
                width: `${Math.min(targets.water ? water / targets.water : 0, 1) * 100}%`,
                background: "var(--sage)",
              }}
            />
          </div>
          <div style={styles.waterBtnRow}>
            <button style={styles.waterBtn} onClick={() => saveWater(water - 0.25)}>
              − 250ml
            </button>
            <button style={styles.waterBtn} onClick={() => saveWater(water + 0.25)}>
              + 250ml
            </button>
            <button style={styles.waterBtn} onClick={() => saveWater(water + 0.5)}>
              + 500ml
            </button>
          </div>
        </div>

        {/* Drinks — weekly, not daily, so a weekend drink doesn't read as a bad day */}
        <div style={styles.waterCard}>
          <div style={styles.waterTop}>
            <span style={styles.sectionLabel}>DRINKS THIS WEEK</span>
            <span style={styles.waterReading}>
              {weeklyUnits}
              <span style={styles.macroUnit}> / {targets.weeklyUnits} units</span>
            </span>
          </div>
          <div style={styles.macroBarTrack}>
            <div
              style={{
                ...styles.macroBarFill,
                width: `${Math.min(targets.weeklyUnits ? weeklyUnits / targets.weeklyUnits : 0, 1) * 100}%`,
                background: weeklyTone(weeklyUnits, targets.weeklyUnits).color,
              }}
            />
          </div>
          <p style={styles.drinksTone}>{weeklyTone(weeklyUnits, targets.weeklyUnits).msg}</p>
          <p style={styles.drinksCaption}>Rolling 7 days — a Saturday pint doesn't undo your week.</p>
        </div>

        {/* Log */}
        <div style={styles.logHeaderRow}>
          <span style={styles.sectionLabel}>LOGGED</span>
          <button style={styles.addBtn} onClick={openAdd}>
            <Plus size={16} strokeWidth={2} /> Add food
          </button>
        </div>

        {loading ? (
          <div style={styles.emptyState}>
            <Loader2 size={18} className="spin" />
          </div>
        ) : entries.length === 0 ? (
          <div style={styles.emptyState}>Nothing logged yet — add your first item for {fmtDate(date).toLowerCase()}.</div>
        ) : (
          MEALS.map(({ key, label }) => {
            const list = groupedByMeal[key];
            const mealKcal = list.reduce((s, e) => s + (e.kcal * e.grams) / 100, 0);
            const mealUnits = list.reduce((s, e) => s + (e.units ? (e.units * e.grams) / 100 : 0), 0);
            return (
              <div key={key} style={styles.mealSection}>
                <div style={styles.mealHeaderRow}>
                  <span style={styles.mealTitle}>{label}</span>
                  {list.length > 0 && (
                    <span style={styles.mealKcal}>
                      {Math.round(mealKcal)} kcal{mealUnits > 0 ? ` · ${Math.round(mealUnits * 10) / 10} units` : ""}
                    </span>
                  )}
                </div>
                {list.length === 0 ? (
                  <div style={styles.mealEmpty}>No items logged</div>
                ) : (
                  <div style={styles.log}>
                    {list.map((e) => (
                      <div key={e.id} style={styles.receiptRow}>
                        <div style={styles.receiptMain}>
                          <span style={styles.receiptName}>{e.name}</span>
                          <span style={styles.receiptGrams}>
                            {e.grams}
                            {e.unitLabel || "g"}
                            {e.units ? ` · ${Math.round((e.units * e.grams * 10) / 100) / 10} units` : ""}
                          </span>
                        </div>
                        <span style={styles.receiptKcal}>{Math.round((e.kcal * e.grams) / 100)} kcal</span>
                        <button style={styles.trashBtn} onClick={() => removeEntry(e.id)} aria-label="Remove entry">
                          <Trash2 size={15} strokeWidth={1.75} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}

        {combos.length > 0 && (
          <div style={styles.quickAddsSection}>
            <span style={styles.sectionLabel}>QUICK ADDS</span>
            <div style={styles.quickAddsList}>
              {combos.map((c) => {
                const ck = Math.round(c.items.reduce((s, it) => s + (it.kcal * it.grams) / 100, 0));
                return (
                  <div key={c.id} style={styles.quickAddRow}>
                    <button
                      style={styles.quickAddMain}
                      onClick={() => logCombo(c, defaultMealForNow())}
                      aria-label={`Add ${c.name}`}
                    >
                      <span style={styles.quickAddPlus}>
                        <Plus size={15} strokeWidth={2.25} />
                      </span>
                      <span style={styles.quickAddText}>
                        <span style={styles.quickAddName}>{c.name}</span>
                        <span style={styles.quickAddMeta}>
                          {c.items.length} items · {ck} kcal
                        </span>
                      </span>
                    </button>
                    <button style={styles.trashBtn} onClick={() => deleteCombo(c.id)} aria-label={`Delete ${c.name}`}>
                      <Trash2 size={15} strokeWidth={1.75} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Add food panel */}
      {showAdd && (
        <div style={styles.overlay} onClick={closeAdd}>
          <div style={styles.sheet} onClick={(ev) => ev.stopPropagation()}>
            <div style={styles.sheetHeader}>
              <span style={styles.sheetTitle}>{customMode ? "Custom food" : recipe ? recipe.name : "Add food"}</span>
              <button style={styles.iconBtn} onClick={closeAdd}>
                <X size={18} />
              </button>
            </div>

            <div style={styles.mealChipRow}>
              {MEALS.map((m) => (
                <button
                  key={m.key}
                  style={{ ...styles.mealChip, ...(meal === m.key ? styles.mealChipActive : {}) }}
                  onClick={() => setMeal(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {!customMode && !picked && !recipe && sessionAdds.length > 0 && (
              <div style={styles.sessionBox}>
                <span style={styles.sessionLabel}>Added just now</span>
                <div style={styles.sessionList}>
                  {sessionAdds.map((e) => (
                    <div key={e.id} style={styles.sessionChip}>
                      <span>
                        {e.name} · {Math.round((e.kcal * e.grams) / 100)} kcal
                      </span>
                      <button onClick={() => removeEntry(e.id)} aria-label={`Remove ${e.name}`}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                {sessionAdds.length >= 2 && !savingCombo && (
                  <button style={styles.customLink} onClick={() => setSavingCombo(true)}>
                    + Save these {sessionAdds.length} as a quick meal
                  </button>
                )}
                {savingCombo && (
                  <div style={styles.saveComboRow}>
                    <input
                      autoFocus
                      style={styles.textInput}
                      placeholder="e.g. Chicken & rice bowl"
                      value={comboName}
                      onChange={(ev) => setComboName(ev.target.value)}
                    />
                    <button style={styles.primaryBtnSmall} onClick={handleSaveCombo}>
                      Save
                    </button>
                  </div>
                )}
                <button style={styles.doneBtn} onClick={closeAdd}>
                  Done — back to log
                </button>
              </div>
            )}

            {!customMode && !picked && !recipe && (
              <>
                {barcodeMode ? (
                  <div style={styles.barcodePanel}>
                    <div style={styles.barcodePanelHeader}>
                      <Barcode size={18} color="var(--sage-deep)" />
                      <span style={styles.fieldLabelSmall}>Scan or enter a barcode</span>
                    </div>

                    {cameraSupported && (
                      <>
                        {scanning ? (
                          <div style={styles.scanFrame}>
                            <video ref={videoRef} style={styles.scanVideo} muted playsInline />
                            <div style={styles.scanReticle} />
                            {torchSupported && (
                              <button style={styles.scanTorchBtn} onClick={toggleTorch} aria-label="Toggle flashlight">
                                {torchOn ? <FlashlightOff size={17} /> : <Flashlight size={17} />}
                              </button>
                            )}
                            <button style={styles.scanCancelBtn} onClick={stopScan}>
                              Cancel scan
                            </button>
                          </div>
                        ) : (
                          <button style={styles.scanStartBtn} onClick={startScan}>
                            <Barcode size={16} /> Scan with camera
                          </button>
                        )}
                      </>
                    )}

                    {scanError && <p style={styles.scanError}>{scanError}</p>}

                    <div style={styles.orDivider}>
                      <span style={styles.orDividerLine} />
                      <span style={styles.orDividerText}>{cameraSupported ? "or type it" : "type the number"}</span>
                      <span style={styles.orDividerLine} />
                    </div>

                    <input
                      autoFocus={!cameraSupported}
                      type="text"
                      inputMode="numeric"
                      style={styles.gramsInput}
                      placeholder="e.g. 5000169005806"
                      value={barcodeInput}
                      onChange={(ev) => setBarcodeInput(ev.target.value.replace(/[^0-9]/g, ""))}
                      onKeyDown={(ev) => ev.key === "Enter" && !barcodeLoading && lookupBarcode()}
                    />
                    <p style={styles.barcodeHint}>
                      Checks foods you've saved before, then two live product databases if it's new. Still nothing?
                      You'll land in custom food entry to fill it in yourself.
                    </p>
                    <div style={styles.sheetActions}>
                      <button
                        style={styles.secondaryBtn}
                        onClick={() => {
                          setBarcodeMode(false);
                          setBarcodeInput("");
                          setScanError("");
                        }}
                        disabled={barcodeLoading}
                      >
                        Cancel
                      </button>
                      <button
                        style={{ ...styles.primaryBtn, ...(barcodeLoading ? { opacity: 0.6 } : {}) }}
                        onClick={() => lookupBarcode()}
                        disabled={barcodeLoading}
                      >
                        {barcodeLoading ? "Looking up…" : "Look up"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={styles.searchRow}>
                      <div style={styles.searchBox}>
                        <Search size={16} color="var(--muted)" />
                        <input
                          autoFocus
                          style={styles.searchInput}
                          placeholder="Search foods or recipes…"
                          value={query}
                          onChange={(ev) => setQuery(ev.target.value)}
                        />
                      </div>
                      <button
                        style={styles.iconBtn}
                        onClick={() => {
                          setBarcodeMode(true);
                          setBarcodeInput("");
                        }}
                        aria-label="Scan barcode"
                      >
                        <Barcode size={18} strokeWidth={1.75} />
                      </button>
                    </div>

                    {comboResults.length > 0 && (
                      <div style={styles.recipeResultsList}>
                        {comboResults.map((c) => {
                          const ck = Math.round(c.items.reduce((s, it) => s + (it.kcal * it.grams) / 100, 0));
                          return (
                            <button key={c.id} style={styles.recipeResultRow} onClick={() => logCombo(c)}>
                              <span style={styles.recipeResultName}>{c.name}</span>
                              <span style={styles.recipeResultMeta}>
                                <span style={styles.comboTag}>Your meal</span> {c.items.length} items · {ck} kcal
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {recipeResults.length > 0 && (
                      <div style={styles.recipeResultsList}>
                        {recipeResults.map((r) => (
                          <button key={r.name} style={styles.recipeResultRow} onClick={() => selectRecipe(r)}>
                            <span style={styles.recipeResultName}>{r.name}</span>
                            <span style={styles.recipeResultMeta}>
                              <span style={styles.recipeTag}>Recipe</span> {r.items.length} ingredients
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div style={styles.resultsList}>
                      {results.map((f) => (
                        <div key={f.name} style={styles.resultRowWrap}>
                          <button style={styles.resultRow} onClick={() => selectFood(f)}>
                            <span>
                              {f.name}
                              {f.mine ? <span style={styles.mineTag}> · yours</span> : null}
                            </span>
                            <span style={styles.resultKcal}>{f.kcal} kcal /100g</span>
                          </button>
                          {f.mine && (
                            <button
                              style={styles.comboDelete}
                              onClick={() => saveCustomFoods(customFoods.filter((c) => c.name !== f.name))}
                              aria-label={`Remove ${f.name} from your foods`}
                            >
                              <Trash2 size={13} strokeWidth={1.75} />
                            </button>
                          )}
                        </div>
                      ))}
                      {query.trim() && results.length === 0 && recipeResults.length === 0 && comboResults.length === 0 && (
                        <div style={styles.noResults}>No match. You can add it as a custom food instead.</div>
                      )}
                    </div>
                    <button
                      style={styles.customLink}
                      onClick={() => {
                        setCustomMode(true);
                        setAmountMode("grams");
                        setGrams(100);
                        setCount(1);
                        setUnitWeight(100);
                        setWeightUnit(meal === "drinks" ? "ml" : "g");
                      }}
                    >
                      + Enter a custom food
                    </button>
                  </>
                )}
              </>
            )}

            {!customMode && picked && !recipe && (
              <div style={styles.pickedPanel}>
                <div style={styles.pickedName}>{picked.name}</div>

                <div style={styles.mealChipRow}>
                  <button
                    style={{ ...styles.mealChip, ...(amountMode === "count" ? styles.mealChipActive : {}) }}
                    onClick={() => setAmountMode("count")}
                  >
                    By quantity
                  </button>
                  <button
                    style={{ ...styles.mealChip, ...(amountMode === "grams" ? styles.mealChipActive : {}) }}
                    onClick={() => setAmountMode("grams")}
                  >
                    By weight
                  </button>
                </div>

                {amountMode === "count" ? (
                  <>
                    <label style={styles.fieldLabel}>
                      Number of {picked.unit ? picked.unit.label + (count === 1 ? "" : "s") : "items"}
                    </label>
                    <input
                      type="number"
                      style={styles.gramsInput}
                      value={count}
                      min="0"
                      step="1"
                      onChange={(ev) => setCount(ev.target.value)}
                    />
                    <label style={styles.fieldLabelSmall}>
                      Weight per {picked.unit ? picked.unit.label : "item"} (g)
                    </label>
                    <input
                      type="number"
                      style={styles.textInput}
                      value={unitWeight}
                      onChange={(ev) => setUnitWeight(ev.target.value)}
                    />
                  </>
                ) : (
                  <>
                    <div style={styles.amountLabelRow}>
                      <label style={styles.fieldLabel}>Amount</label>
                      <div style={styles.unitToggle}>
                        <button
                          style={{ ...styles.unitToggleBtn, ...(weightUnit === "g" ? styles.unitToggleBtnActive : {}) }}
                          onClick={() => setWeightUnit("g")}
                        >
                          g
                        </button>
                        <button
                          style={{ ...styles.unitToggleBtn, ...(weightUnit === "ml" ? styles.unitToggleBtnActive : {}) }}
                          onClick={() => setWeightUnit("ml")}
                        >
                          ml
                        </button>
                      </div>
                    </div>
                    <input
                      type="number"
                      style={styles.gramsInput}
                      value={grams}
                      onChange={(ev) => setGrams(ev.target.value)}
                    />
                  </>
                )}

                <div style={styles.pickedPreview}>
                  {Math.round((picked.kcal * effectiveGrams) / 100)} kcal ({Math.round(effectiveGrams)}
                  {weightUnit} total) · P{" "}
                  {Math.round((picked.protein * effectiveGrams) / 100)}g · C{" "}
                  {Math.round((picked.carbs * effectiveGrams) / 100)}g · F{" "}
                  {Math.round((picked.fat * effectiveGrams) / 100)}g
                  {picked.units ? (
                    <span style={styles.unitsPreview}>
                      {" "}
                      · {Math.round((picked.units * effectiveGrams * 10) / 100) / 10} units
                    </span>
                  ) : null}
                </div>
                <div style={styles.sheetActions}>
                  <button style={styles.secondaryBtn} onClick={() => setPicked(null)}>
                    Back
                  </button>
                  <button style={styles.primaryBtn} onClick={confirmAdd}>
                    Add to log
                  </button>
                </div>
              </div>
            )}

            {recipe && (
              <div style={styles.pickedPanel}>
                <div style={styles.pickedName}>{recipe.name}</div>

                <div style={styles.servingsRow}>
                  <span style={styles.fieldLabelSmall}>Servings</span>
                  <div style={styles.servingsStepper}>
                    <button style={styles.stepperBtn} onClick={() => scaleRecipeServings(recipeServings - 0.5)}>
                      −
                    </button>
                    <span style={styles.servingsVal}>{recipeServings}</span>
                    <button style={styles.stepperBtn} onClick={() => scaleRecipeServings(recipeServings + 0.5)}>
                      +
                    </button>
                  </div>
                </div>

                <div style={styles.ingredientList}>
                  {recipe.items.map((it, i) => {
                    const food = findFood(it.food, customFoods);
                    if (!food) return null;
                    const g = recipeGrams[i] ?? it.grams;
                    const kcalHere = Math.round((food.kcal * g) / 100);
                    return (
                      <div key={it.food} style={styles.ingredientRow}>
                        <div style={styles.ingredientMain}>
                          <span style={styles.ingredientName}>{it.food}</span>
                          <span style={styles.ingredientKcal}>{kcalHere} kcal</span>
                        </div>
                        <div style={styles.ingredientAmountRow}>
                          <input
                            type="number"
                            style={styles.ingredientInput}
                            value={g}
                            onChange={(ev) => setRecipeGrams({ ...recipeGrams, [i]: ev.target.value })}
                          />
                          <span style={styles.ingredientUnit}>g</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={styles.pickedPreview}>
                  {Math.round(
                    recipe.items.reduce((s, it, i) => {
                      const food = findFood(it.food, customFoods);
                      const g = recipeGrams[i] ?? it.grams;
                      return s + (food ? (food.kcal * g) / 100 : 0);
                    }, 0)
                  )}{" "}
                  kcal total for this recipe
                </div>
                <div style={styles.sheetActions}>
                  <button style={styles.secondaryBtn} onClick={() => setRecipe(null)}>
                    Back
                  </button>
                  <button style={styles.primaryBtn} onClick={confirmRecipe}>
                    Add all to log
                  </button>
                </div>
              </div>
            )}

            {customMode && (
              <div style={styles.customForm}>
                {customFood.barcode && (
                  <div style={styles.barcodeBanner}>
                    <Barcode size={14} color="var(--sage-deep)" />
                    <span>
                      {customFood.kcal
                        ? `Found it! Check the numbers below, then save — barcode ${customFood.barcode} is remembered from now on.`
                        : `Couldn't find barcode ${customFood.barcode} online — fill it in once and it's saved for next time.`}
                    </span>
                  </div>
                )}
                <input
                  style={styles.textInput}
                  placeholder="Food name"
                  value={customFood.name}
                  onChange={(ev) => setCustomFood({ ...customFood, name: ev.target.value })}
                />
                <div>
                  <label style={styles.fieldLabelSmall}>Barcode (optional)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    style={styles.textInput}
                    placeholder="e.g. 5000169005806"
                    value={customFood.barcode}
                    onChange={(ev) => setCustomFood({ ...customFood, barcode: ev.target.value.replace(/[^0-9]/g, "") })}
                  />
                </div>
                <div style={styles.customGrid}>
                  {["kcal", "protein", "carbs", "fat", "sat", "sugar"].map((k) => (
                    <div key={k}>
                      <label style={styles.fieldLabelSmall}>{NUTRIENT_LABELS[k]} /100g</label>
                      <input
                        type="number"
                        style={styles.textInput}
                        value={customFood[k]}
                        onChange={(ev) => setCustomFood({ ...customFood, [k]: ev.target.value })}
                      />
                    </div>
                  ))}
                  <div>
                    <label style={styles.fieldLabelSmall}>alcohol units (optional)</label>
                    <input
                      type="number"
                      style={styles.textInput}
                      placeholder="0"
                      value={customFood.units}
                      onChange={(ev) => setCustomFood({ ...customFood, units: ev.target.value })}
                    />
                  </div>
                </div>
                <label style={styles.fieldLabel}>Amount</label>
                <div style={styles.mealChipRow}>
                  <button
                    style={{ ...styles.mealChip, ...(amountMode === "count" ? styles.mealChipActive : {}) }}
                    onClick={() => setAmountMode("count")}
                  >
                    By quantity
                  </button>
                  <button
                    style={{ ...styles.mealChip, ...(amountMode === "grams" ? styles.mealChipActive : {}) }}
                    onClick={() => setAmountMode("grams")}
                  >
                    By weight
                  </button>
                </div>
                {amountMode === "count" ? (
                  <>
                    <label style={styles.fieldLabelSmall}>Number of items</label>
                    <input
                      type="number"
                      style={styles.textInput}
                      value={count}
                      min="0"
                      step="1"
                      onChange={(ev) => setCount(ev.target.value)}
                    />
                    <label style={styles.fieldLabelSmall}>Weight per item (g)</label>
                    <input
                      type="number"
                      style={styles.textInput}
                      value={unitWeight}
                      onChange={(ev) => setUnitWeight(ev.target.value)}
                    />
                  </>
                ) : (
                  <>
                    <div style={styles.amountLabelRow}>
                      <span style={styles.fieldLabelSmall}>Amount</span>
                      <div style={styles.unitToggle}>
                        <button
                          style={{ ...styles.unitToggleBtn, ...(weightUnit === "g" ? styles.unitToggleBtnActive : {}) }}
                          onClick={() => setWeightUnit("g")}
                        >
                          g
                        </button>
                        <button
                          style={{ ...styles.unitToggleBtn, ...(weightUnit === "ml" ? styles.unitToggleBtnActive : {}) }}
                          onClick={() => setWeightUnit("ml")}
                        >
                          ml
                        </button>
                      </div>
                    </div>
                    <input
                      type="number"
                      style={styles.gramsInput}
                      value={grams}
                      onChange={(ev) => setGrams(ev.target.value)}
                    />
                  </>
                )}
                <div style={styles.pickedPreview}>
                  {Math.round(effectiveGrams)}
                  {amountMode === "grams" ? weightUnit : "g"} total
                </div>
                <div style={styles.sheetActions}>
                  <button style={styles.secondaryBtn} onClick={() => setCustomMode(false)}>
                    Back
                  </button>
                  <button style={styles.primaryBtn} onClick={confirmAdd}>
                    Add to log
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div style={styles.overlay} onClick={() => setShowSettings(false)}>
          <div style={styles.sheet} onClick={(ev) => ev.stopPropagation()}>
            <div style={styles.sheetHeader}>
              <span style={styles.sheetTitle}>Daily targets</span>
              <button style={styles.iconBtn} onClick={() => setShowSettings(false)}>
                <X size={18} />
              </button>
            </div>
            <div style={styles.customGrid}>
              {Object.keys(DEFAULT_TARGETS).map((k) => (
                <div key={k}>
                  <label style={styles.fieldLabelSmall}>
                    {NUTRIENT_LABELS[k]} ({UNIT[k]})
                  </label>
                  <input
                    type="number"
                    style={styles.textInput}
                    value={targets[k]}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      setTargets({ ...targets, [k]: v === "" ? "" : parseFloat(v) || 0 });
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={styles.sheetActions}>
              <button
                style={styles.primaryBtn}
                onClick={() => {
                  const sanitized = {};
                  Object.keys(DEFAULT_TARGETS).forEach((k) => {
                    const v = parseFloat(targets[k]);
                    sanitized[k] = isNaN(v) ? DEFAULT_TARGETS[k] : v;
                  });
                  saveTargets(sanitized);
                  setShowSettings(false);
                }}
              >
                Save targets
              </button>
            </div>

            <div style={styles.deviceSection}>
              <span style={styles.sessionLabel}>ACCOUNT</span>
              <p style={styles.barcodeHint}>
                Signed in as {user.email}. Your targets, log, and weekly view are yours alone — meals you save and foods
                you add are shared with the other person using this app.
              </p>
              <div style={styles.deviceRow}>
                <span style={styles.deviceName}>{user.displayName || user.email}</span>
                <button style={styles.deviceConnectBtn} onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            </div>

            <div style={styles.deviceSection}>
              <span style={styles.sessionLabel}>DAILY REMINDER</span>
              <p style={styles.barcodeHint}>
                Get a push notification if you haven't logged anything by a set time. Add this app to your home
                screen first for the most reliable delivery.
              </p>
              <input
                type="time"
                style={styles.textInput}
                value={reminderTimeInput}
                onChange={(ev) => handleReminderTimeChange(ev.target.value)}
              />
              <div style={styles.deviceRow}>
                <span style={styles.deviceName}>{pushSubscribed ? "Reminders are on" : "Reminders are off"}</span>
                <button
                  style={styles.deviceConnectBtn}
                  disabled={reminderBusy}
                  onClick={() => (pushSubscribed ? disableReminders() : enableReminders())}
                >
                  {reminderBusy ? "…" : pushSubscribed ? "Turn off" : "Turn on"}
                </button>
              </div>
              {reminderMsg && <p style={styles.deviceMsg}>{reminderMsg}</p>}
            </div>

            <div style={styles.deviceSection}>
              <span style={styles.sessionLabel}>CONNECTED DEVICES</span>
              <div style={styles.deviceList}>
                {DEVICES.map((d) => (
                  <div key={d.key} style={styles.deviceRow}>
                    <span style={styles.deviceName}>{d.name}</span>
                    <button
                      style={styles.deviceConnectBtn}
                      onClick={() =>
                        setDeviceMsg(
                          `Connecting ${d.name} needs a real backend and that app's own login — not something this preview can do. Log activity manually above for now; this button is ready to wire up once the app's properly deployed.`
                        )
                      }
                    >
                      Connect
                    </button>
                  </div>
                ))}
              </div>
              {deviceMsg && <p style={styles.deviceMsg}>{deviceMsg}</p>}
            </div>
          </div>
        </div>
      )}

      {showWeight && (
        <div style={styles.overlay} onClick={() => setShowWeight(false)}>
          <div style={styles.sheet} onClick={(ev) => ev.stopPropagation()}>
            <div style={styles.sheetHeader}>
              <span style={styles.sheetTitle}>Weight tracker</span>
              <button style={styles.iconBtn} onClick={() => setShowWeight(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={styles.amountLabelRow}>
              <label style={styles.fieldLabel}>Log a weigh-in</label>
              <div style={styles.unitToggle}>
                <button
                  style={{ ...styles.unitToggleBtn, ...(bodyWeightUnit === "kg" ? styles.unitToggleBtnActive : {}) }}
                  onClick={() => setBodyWeightUnit("kg")}
                >
                  kg
                </button>
                <button
                  style={{ ...styles.unitToggleBtn, ...(bodyWeightUnit === "st" ? styles.unitToggleBtnActive : {}) }}
                  onClick={() => setBodyWeightUnit("st")}
                >
                  st
                </button>
              </div>
            </div>

            <input
              type="date"
              style={styles.textInput}
              value={weightEntryDate}
              max={isoDate(new Date())}
              onChange={(ev) => handleWeightEntryDateChange(ev.target.value)}
            />

            {bodyWeightUnit === "kg" ? (
              <input
                type="number"
                inputMode="decimal"
                style={styles.gramsInput}
                placeholder="e.g. 82.3"
                value={weightKgInput}
                onChange={(ev) => setWeightKgInput(ev.target.value)}
              />
            ) : (
              <div style={styles.customGrid}>
                <div>
                  <label style={styles.fieldLabelSmall}>Stone</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    style={styles.textInput}
                    placeholder="e.g. 12"
                    value={weightStoneInput}
                    onChange={(ev) => setWeightStoneInput(ev.target.value)}
                  />
                </div>
                <div>
                  <label style={styles.fieldLabelSmall}>Pounds</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    style={styles.textInput}
                    placeholder="e.g. 7"
                    value={weightLbInput}
                    onChange={(ev) => setWeightLbInput(ev.target.value)}
                  />
                </div>
              </div>
            )}

            <div style={styles.sheetActions}>
              <button style={styles.primaryBtn} onClick={saveWeightEntry} disabled={weightSaving}>
                {weightSaving ? "Saving…" : `Save weigh-in for ${fmtDate(weightEntryDate)}`}
              </button>
            </div>
            {weightMsg && <p style={styles.deviceMsg}>{weightMsg}</p>}

            <div style={styles.deviceSection}>
              <span style={styles.sessionLabel}>STARTING WEIGHT</span>
              <p style={styles.barcodeHint}>
                {startingWeightKg
                  ? "Set once so progress is measured against where you began, not just your first log entry."
                  : "Set this to track how much you've lost overall, rather than just since your first entry."}
              </p>
              <label style={styles.fieldLabelSmall}>Date you started</label>
              <input
                type="date"
                style={styles.textInput}
                value={startingWeightDateInput}
                max={isoDate(new Date())}
                onChange={(ev) => setStartingWeightDateInput(ev.target.value)}
              />
              {bodyWeightUnit === "kg" ? (
                <input
                  type="number"
                  inputMode="decimal"
                  style={styles.gramsInput}
                  placeholder="e.g. 90"
                  value={startingWeightInput}
                  onChange={(ev) => setStartingWeightInput(ev.target.value)}
                />
              ) : (
                <div style={styles.customGrid}>
                  <div>
                    <label style={styles.fieldLabelSmall}>Stone</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      style={styles.textInput}
                      placeholder="e.g. 14"
                      value={startingWeightStoneInput}
                      onChange={(ev) => setStartingWeightStoneInput(ev.target.value)}
                    />
                  </div>
                  <div>
                    <label style={styles.fieldLabelSmall}>Pounds</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      style={styles.textInput}
                      placeholder="e.g. 2"
                      value={startingWeightLbInput}
                      onChange={(ev) => setStartingWeightLbInput(ev.target.value)}
                    />
                  </div>
                </div>
              )}
              <div style={styles.sheetActions}>
                <button style={styles.secondaryBtn} onClick={saveStartingWeightEntry}>
                  {startingWeightKg ? "Update starting weight" : "Save starting weight"}
                </button>
              </div>
            </div>

            {sortedWeightLog.length > 0 && (
              <div style={styles.deviceSection}>
                <span style={styles.sessionLabel}>PROGRESS</span>

                {weightTrend && weightTrend.deltaKg !== 0 && (
                  <div style={styles.weightHeroCard}>
                    <div style={styles.weightHeroNumber}>
                      {displayWeight(Math.abs(weightTrend.deltaKg), bodyWeightUnit)}
                    </div>
                    <div style={styles.weightHeroLabel}>
                      {weightTrend.deltaKg > 0 ? "gained" : "lost"} since {weightTrend.baselineLabel}
                    </div>
                  </div>
                )}
                {weightTrend && weightTrend.deltaKg === 0 && (
                  <p style={styles.barcodeHint}>No change since {weightTrend.baselineLabel}.</p>
                )}

                <WeightSparkline entries={sortedWeightLog.slice(-20)} />
                <div style={styles.resultsList}>
                  {[...sortedWeightLog].reverse().map((w) => (
                    <div key={w.date} style={styles.deviceRow}>
                      <span style={styles.deviceName}>{fmtDate(w.date)}</span>
                      <span style={styles.deviceName}>{displayWeight(w.kg, bodyWeightUnit)}</span>
                      <button
                        style={styles.trashBtn}
                        onClick={() => deleteWeightEntry(w.date)}
                        aria-label={`Remove weight entry for ${fmtDate(w.date)}`}
                      >
                        <Trash2 size={15} strokeWidth={1.75} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showMealLibrary && (
        <div style={styles.overlay} onClick={() => setShowMealLibrary(false)}>
          <div style={styles.sheet} onClick={(ev) => ev.stopPropagation()}>
            <div style={styles.sheetHeader}>
              <span style={styles.sheetTitle}>Meal library</span>
              <button style={styles.iconBtn} onClick={() => setShowMealLibrary(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={styles.searchBox}>
              <Search size={16} color="var(--muted)" />
              <input
                autoFocus
                style={styles.searchInput}
                placeholder="Search your meals or recipes…"
                value={libraryQuery}
                onChange={(ev) => setLibraryQuery(ev.target.value)}
              />
            </div>

            <span style={{ ...styles.sessionLabel, marginTop: 16, display: "block" }}>YOUR SAVED MEALS</span>
            {combos.length === 0 ? (
              <p style={styles.barcodeHint}>
                Nothing saved yet — log 2+ items in one go from Add food, then "Save as a quick meal" to see it here.
              </p>
            ) : libraryCombos.length === 0 ? (
              <p style={styles.barcodeHint}>No saved meals match "{libraryQuery}".</p>
            ) : (
              <div style={styles.quickAddsList}>
                {libraryCombos.map((c) => {
                  const ck = Math.round(c.items.reduce((s, it) => s + (it.kcal * it.grams) / 100, 0));
                  return (
                    <div key={c.id} style={styles.quickAddRow}>
                      <button
                        style={styles.quickAddMain}
                        onClick={() => {
                          logCombo(c, defaultMealForNow());
                          setShowMealLibrary(false);
                        }}
                        aria-label={`Add ${c.name}`}
                      >
                        <span style={styles.quickAddPlus}>
                          <Plus size={15} strokeWidth={2.25} />
                        </span>
                        <span style={styles.quickAddText}>
                          <span style={styles.quickAddName}>{c.name}</span>
                          <span style={styles.quickAddMeta}>
                            {c.items.length} items · {ck} kcal
                          </span>
                        </span>
                      </button>
                      <button style={styles.trashBtn} onClick={() => deleteCombo(c.id)} aria-label={`Delete ${c.name}`}>
                        <Trash2 size={15} strokeWidth={1.75} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <span style={{ ...styles.sessionLabel, marginTop: 22, display: "block" }}>BUILT-IN RECIPES</span>
            {libraryRecipes.length === 0 ? (
              <p style={styles.barcodeHint}>No recipes match "{libraryQuery}".</p>
            ) : (
              <div style={styles.quickAddsList}>
                {libraryRecipes.map((r) => (
                  <button key={r.name} style={styles.libraryRecipeRow} onClick={() => openRecipeFromLibrary(r)}>
                    <span style={styles.quickAddPlus}>
                      <BookOpen size={14} />
                    </span>
                    <span style={styles.quickAddText}>
                      <span style={styles.quickAddName}>{r.name}</span>
                      <span style={styles.quickAddMeta}>{r.items.length} ingredients · tap to adjust & add</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=IBM+Plex+Mono:wght@500&display=swap');
:root {
  --bg: #FFFFFF;
  --bg-card: #F5F6F3;
  --paper: #14140F;
  --muted: #7C8177;
  --sage: #4F9C96;
  --sage-deep: #276661;
  --sage-tint: #E1F1EF;
  --green: #276661;
  --amber: #B8923A;
  --red: #B25848;
  --line: rgba(20,20,15,0.12);
  --glass: rgba(255,255,255,0.5);
  --glass-strong: rgba(255,255,255,0.72);
  --glass-border: rgba(255,255,255,0.65);
}
*, *::before, *::after { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { overflow-x: hidden; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes toastIn {
  0% { transform: translate(-50%, -16px) scale(0.96); opacity: 0; }
  12% { transform: translate(-50%, 0) scale(1); opacity: 1; }
  88% { transform: translate(-50%, 0) scale(1); opacity: 1; }
  100% { transform: translate(-50%, -10px) scale(0.98); opacity: 0; }
}
.celebrate-toast { animation: toastIn 2.8s ease forwards; }
input:focus, button:focus-visible { outline: 2px solid var(--sage-deep); outline-offset: 2px; }
input, select, textarea { font-size: 16px; }
button { touch-action: manipulation; }
`;

const styles = {
  celebrationToast: {
    position: "fixed",
    top: "max(20px, env(safe-area-inset-top))",
    left: "50%",
    zIndex: 200,
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "var(--glass-strong)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    border: `1px solid var(--glass-border)`,
    borderRadius: 18,
    padding: "12px 18px",
    boxShadow: "0 8px 24px rgba(20,20,15,0.15)",
    maxWidth: "calc(100% - 32px)",
    pointerEvents: "none",
  },
  celebrationEmoji: { fontSize: 22, flexShrink: 0 },
  celebrationTitle: { fontSize: 14, fontWeight: 700, color: "var(--paper)" },
  celebrationSub: { fontSize: 12, color: "var(--muted)", marginTop: 1 },
  lockScreen: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 24px",
  },
  lockCard: {
    width: "100%",
    maxWidth: 300,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    textAlign: "center",
    background: "var(--glass)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    border: `1px solid var(--glass-border)`,
    borderRadius: 28,
    padding: "36px 28px 28px",
    boxShadow: "0 1px 2px rgba(20,20,15,0.04), 0 16px 32px rgba(20,20,15,0.08)",
  },
  lockTitle: { fontFamily: "'Manrope', sans-serif", fontWeight: 800, fontSize: 22, margin: "10px 0 0" },
  lockSub: { fontSize: 13, color: "var(--muted)", margin: "0 0 4px", lineHeight: 1.4 },
  lockInput: {
    background: "var(--bg)",
    border: `1px solid var(--line)`,
    borderRadius: 14,
    padding: "14px 0",
    color: "var(--paper)",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 24,
    letterSpacing: "0.4em",
    textAlign: "center",
    width: "100%",
    boxSizing: "border-box",
  },
  lockErrorSlot: { minHeight: 18, display: "flex", alignItems: "center", justifyContent: "center" },
  lockError: { fontSize: 12.5, color: "var(--red)", margin: 0 },
  lockUnlockBtn: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--sage-deep)",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 14,
    padding: "13px 0",
    minHeight: 46,
    fontSize: 14.5,
    fontWeight: 700,
    cursor: "pointer",
  },
  lockForgot: {
    background: "none",
    border: "none",
    color: "var(--muted)",
    fontSize: 12,
    marginTop: 4,
    cursor: "pointer",
    textDecoration: "underline",
  },
  app: {
    minHeight: "100vh",
    width: "100%",
    background:
      "radial-gradient(at 12% 8%, rgba(79,156,150,0.30) 0, transparent 42%), " +
      "radial-gradient(at 88% 4%, rgba(225,241,239,0.9) 0, transparent 48%), " +
      "radial-gradient(at 82% 55%, rgba(39,102,97,0.16) 0, transparent 42%), " +
      "radial-gradient(at 8% 62%, rgba(184,146,58,0.10) 0, transparent 40%), " +
      "radial-gradient(at 50% 100%, rgba(79,156,150,0.14) 0, transparent 45%), " +
      "#FDFDFB",
    backgroundAttachment: "fixed",
    color: "var(--paper)",
    fontFamily: "'Manrope', sans-serif",
    padding: "max(20px, env(safe-area-inset-top)) 16px 80px",
    overflowX: "hidden",
  },
  shell: { width: "100%", maxWidth: 480, margin: "0 auto" },
  header: { display: "flex", flexDirection: "column", marginBottom: 4 },
  headerTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  headerActions: { display: "flex", alignItems: "center", gap: 8 },
  profilePill: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    background: "var(--glass)",
    backdropFilter: "blur(16px) saturate(180%)",
    WebkitBackdropFilter: "blur(16px) saturate(180%)",
    border: `1px solid var(--glass-border)`,
    borderRadius: 999,
    padding: "0 14px",
    height: 44,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--paper)",
    cursor: "pointer",
  },
  profileDot: { width: 8, height: 8, borderRadius: "50%", background: "var(--sage-deep)", flexShrink: 0 },
  brandRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  eyebrow: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: "var(--muted)" },
  title: {
    fontFamily: "'Manrope', sans-serif",
    fontWeight: 800,
    fontSize: "clamp(24px, 7.5vw, 34px)",
    margin: 0,
    letterSpacing: "-0.02em",
    lineHeight: 1.05,
  },
  tagline: { fontSize: 13.5, color: "var(--muted)", margin: "6px 0 18px" },
  heroAddBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    background: "var(--sage-deep)",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 18,
    padding: "15px 0",
    minHeight: 52,
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(20,20,15,0.06), 0 14px 28px rgba(39,102,97,0.28)",
  },
  iconBtn: {
    background: "var(--glass)",
    backdropFilter: "blur(16px) saturate(180%)",
    WebkitBackdropFilter: "blur(16px) saturate(180%)",
    border: `1px solid var(--glass-border)`,
    boxShadow: "0 1px 2px rgba(20,20,15,0.05), 0 8px 20px rgba(20,20,15,0.06)",
    borderRadius: 16,
    width: 44,
    height: 44,
    minWidth: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--paper)",
    cursor: "pointer",
    flexShrink: 0,
  },
  dateNav: { display: "flex", alignItems: "center", gap: 8, margin: "18px 0 16px" },
  navBtn: {
    background: "none",
    border: "none",
    color: "var(--muted)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    flexShrink: 0,
  },
  dateLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    letterSpacing: "0.04em",
    flex: 1,
    textAlign: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  card: {
    background: "var(--glass)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    border: `1px solid var(--glass-border)`,
    boxShadow: "0 1px 2px rgba(20,20,15,0.04), 0 16px 32px rgba(20,20,15,0.06)",
    borderRadius: 28,
    padding: "24px 22px",
  },
  ringRow: { display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" },
  ringCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0 },
  ringCaption: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap" },
  ring: {
    width: 100,
    height: 100,
    borderRadius: "50%",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.4s ease",
  },
  ringInner: {
    width: 80,
    height: 80,
    borderRadius: "50%",
    background: "var(--glass-strong)",
    boxShadow: "inset 0 0 0 1px var(--glass-border)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  ringNum: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 21, fontWeight: 500 },
  ringUnit: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "var(--muted)", marginTop: 2, textAlign: "center" },
  macroList: { flex: "1 1 180px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 },
  macroRow: { display: "flex", alignItems: "center", gap: 8 },
  macroLabel: { width: 62, flexShrink: 0, fontSize: 11.5, color: "var(--muted)", textTransform: "capitalize" },
  macroBarTrack: { flex: 1, minWidth: 0, height: 6, borderRadius: 3, background: "rgba(20,20,15,0.07)", overflow: "hidden" },
  macroBarFill: { height: "100%", borderRadius: 3, transition: "width 0.3s ease, background 0.3s ease" },
  macroVal: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, width: 42, flexShrink: 0, textAlign: "right" },
  macroUnit: { color: "var(--muted)", marginLeft: 1 },
  waterCard: {
    background: "var(--glass)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    border: `1px solid var(--glass-border)`,
    boxShadow: "0 1px 2px rgba(20,20,15,0.04), 0 12px 26px rgba(20,20,15,0.05)",
    borderRadius: 24,
    padding: "20px 20px",
    marginTop: 16,
  },
  waterTop: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, gap: 8 },
  waterReading: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, whiteSpace: "nowrap" },
  waterBtnRow: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 },
  drinksTone: { fontSize: 13, marginTop: 12, marginBottom: 2 },
  drinksCaption: { fontSize: 11.5, color: "var(--muted)", marginTop: 2 },
  waterBtn: {
    flex: "1 1 90px",
    minHeight: 40,
    background: "var(--sage-tint)",
    border: "none",
    borderRadius: 999,
    color: "var(--sage-deep)",
    fontSize: 12.5,
    padding: "8px 4px",
    cursor: "pointer",
  },
  mealSection: { marginBottom: 22 },
  quickAddsSection: { marginTop: 8, marginBottom: 24, display: "flex", flexDirection: "column", gap: 10 },
  quickAddsList: { display: "flex", flexDirection: "column", gap: 8 },
  quickAddRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "var(--glass)",
    backdropFilter: "blur(16px) saturate(180%)",
    WebkitBackdropFilter: "blur(16px) saturate(180%)",
    border: `1px solid var(--glass-border)`,
    borderRadius: 16,
    padding: "6px 8px 6px 6px",
  },
  quickAddMain: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "none",
    border: "none",
    textAlign: "left",
    padding: "6px 4px",
    cursor: "pointer",
    minHeight: 44,
  },
  quickAddPlus: {
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "var(--sage-deep)",
    color: "#FFFFFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  quickAddText: { display: "flex", flexDirection: "column", gap: 1, minWidth: 0 },
  quickAddName: { fontSize: 13.5, fontWeight: 600, overflowWrap: "break-word" },
  quickAddMeta: { fontSize: 11, color: "var(--muted)", fontFamily: "'IBM Plex Mono', monospace" },
  libraryRecipeRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "var(--bg-card)",
    border: "none",
    borderRadius: 16,
    padding: "10px 12px",
    textAlign: "left",
    cursor: "pointer",
    minHeight: 44,
    width: "100%",
  },
  mealHeaderRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, gap: 8 },
  mealTitle: { fontFamily: "'Manrope', sans-serif", fontSize: 16, fontWeight: 700 },
  mealKcal: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" },
  mealEmpty: { fontSize: 12, color: "var(--muted)", padding: "6px 4px 14px" },
  mealChipRow: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  mealChip: {
    flex: "1 1 90px",
    minHeight: 40,
    background: "var(--bg-card)",
    border: "none",
    borderRadius: 999,
    color: "var(--muted)",
    fontSize: 12.5,
    padding: "8px 4px",
    cursor: "pointer",
  },
  mealChipActive: {
    background: "var(--sage-deep)",
    color: "#FFFFFF",
    fontWeight: 600,
  },
  logHeaderRow: { display: "flex", justifyContent: "space-between", alignItems: "center", margin: "26px 0 10px", gap: 8, flexWrap: "wrap" },
  sectionLabel: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: "var(--muted)" },
  addBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "var(--sage-deep)",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 999,
    padding: "10px 16px",
    minHeight: 40,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  log: { display: "flex", flexDirection: "column", gap: 1 },
  emptyState: {
    padding: "28px 4px",
    color: "var(--muted)",
    fontSize: 13,
    textAlign: "center",
    display: "flex",
    justifyContent: "center",
  },
  receiptRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 4px",
    minHeight: 44,
    borderBottom: `1px solid var(--line)`,
  },
  receiptMain: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" },
  receiptName: { fontSize: 14, overflowWrap: "break-word" },
  receiptGrams: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--muted)" },
  receiptKcal: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, whiteSpace: "nowrap" },
  trashBtn: {
    background: "none",
    border: "none",
    color: "var(--muted)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    flexShrink: 0,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,20,17,0.6)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 50,
  },
  sheet: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "88dvh",
    overflowY: "auto",
    background: "rgba(253,253,251,0.96)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    borderRadius: "28px 28px 0 0",
    padding: "20px 20px calc(20px + env(safe-area-inset-bottom))",
    border: "none",
    boxShadow: "0 -8px 30px rgba(20,20,15,0.10)",
  },
  sheetHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sessionBox: {
    background: "var(--sage-tint)",
    borderRadius: 18,
    padding: "14px 16px",
    marginBottom: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  sessionLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10.5,
    letterSpacing: "0.1em",
    color: "var(--sage-deep)",
    textTransform: "uppercase",
  },
  sessionList: { display: "flex", flexDirection: "column", gap: 4 },
  sessionChip: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 13,
    color: "var(--paper)",
    background: "rgba(255,255,255,0.6)",
    borderRadius: 10,
    padding: "8px 10px",
  },
  saveComboRow: { display: "flex", gap: 8, marginTop: 2 },
  primaryBtnSmall: {
    background: "var(--sage-deep)",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 10,
    padding: "0 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    minHeight: 42,
  },
  doneBtn: {
    marginTop: 4,
    background: "var(--sage-deep)",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 999,
    padding: "11px 0",
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
    minHeight: 44,
  },
  comboSection: { marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 },
  comboRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  comboChip: {
    display: "flex",
    alignItems: "stretch",
    background: "var(--bg-card)",
    borderRadius: 14,
    overflow: "hidden",
  },
  comboChipMain: {
    background: "none",
    border: "none",
    textAlign: "left",
    padding: "10px 12px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 120,
  },
  comboName: { fontSize: 13, fontWeight: 600, color: "var(--paper)" },
  comboMeta: { fontSize: 11, color: "var(--muted)", fontFamily: "'IBM Plex Mono', monospace" },
  comboDelete: {
    background: "none",
    border: "none",
    color: "var(--muted)",
    cursor: "pointer",
    padding: "0 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: { fontFamily: "'Manrope', sans-serif", fontSize: 20, fontWeight: 700 },
  searchRow: { display: "flex", alignItems: "center", gap: 8 },
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "var(--bg-card)",
    border: "none",
    borderRadius: 16,
    padding: "12px 14px",
    flex: 1,
    minWidth: 0,
  },
  searchInput: { background: "none", border: "none", color: "var(--paper)", fontSize: 16, flex: 1, outline: "none", minWidth: 0 },
  barcodePanel: { display: "flex", flexDirection: "column", gap: 10 },
  scanStartBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    background: "var(--sage-deep)",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 14,
    padding: "13px 0",
    minHeight: 46,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  scanFrame: {
    position: "relative",
    width: "100%",
    aspectRatio: "4 / 3",
    borderRadius: 16,
    overflow: "hidden",
    background: "#000",
  },
  scanVideo: { width: "100%", height: "100%", objectFit: "cover" },
  scanReticle: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "72%",
    height: "34%",
    border: "2px solid rgba(255,255,255,0.85)",
    borderRadius: 10,
    boxShadow: "0 0 0 999px rgba(0,0,0,0.28)",
    pointerEvents: "none",
  },
  scanCancelBtn: {
    position: "absolute",
    bottom: 12,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(20,20,15,0.65)",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 999,
    padding: "8px 16px",
    fontSize: 12.5,
    cursor: "pointer",
  },
  scanTorchBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    background: "rgba(20,20,15,0.65)",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 999,
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  scanError: { fontSize: 12, color: "var(--red)", margin: 0 },
  orDivider: { display: "flex", alignItems: "center", gap: 10, margin: "2px 0" },
  orDividerLine: { flex: 1, height: 1, background: "var(--line)" },
  orDividerText: { fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" },
  barcodePanelHeader: { display: "flex", alignItems: "center", gap: 8 },
  barcodeHint: { fontSize: 11.5, color: "var(--muted)", lineHeight: 1.4, margin: 0 },
  barcodeBanner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "var(--sage-tint)",
    color: "var(--sage-deep)",
    fontSize: 12,
    borderRadius: 12,
    padding: "10px 12px",
  },
  resultsList: { marginTop: 10, display: "flex", flexDirection: "column", gap: 2, maxHeight: 260, overflowY: "auto" },
  resultRowWrap: { display: "flex", alignItems: "center", gap: 2 },
  resultRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    background: "none",
    border: "none",
    color: "var(--paper)",
    textAlign: "left",
    padding: "12px 6px",
    minHeight: 44,
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13.5,
    width: "100%",
    flex: 1,
    minWidth: 0,
  },
  mineTag: { color: "var(--sage-deep)", fontSize: 11, fontWeight: 600 },
  recipeResultsList: { display: "flex", flexDirection: "column", gap: 2, marginTop: 10 },
  recipeResultRow: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    background: "var(--sage-tint)",
    border: "none",
    textAlign: "left",
    padding: "12px 14px",
    minHeight: 44,
    borderRadius: 14,
    cursor: "pointer",
    width: "100%",
  },
  recipeResultName: { fontSize: 14, fontWeight: 700, color: "var(--paper)" },
  recipeResultMeta: { fontSize: 11.5, color: "var(--sage-deep)", display: "flex", alignItems: "center", gap: 6 },
  recipeTag: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 9.5,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    background: "var(--sage-deep)",
    color: "#FFFFFF",
    borderRadius: 999,
    padding: "2px 8px",
  },
  comboTag: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 9.5,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    background: "var(--amber)",
    color: "#FFFFFF",
    borderRadius: 999,
    padding: "2px 8px",
  },
  servingsRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  servingsStepper: { display: "flex", alignItems: "center", gap: 12 },
  stepperBtn: {
    background: "var(--bg-card)",
    border: "none",
    borderRadius: 10,
    width: 32,
    height: 32,
    fontSize: 16,
    fontWeight: 700,
    color: "var(--paper)",
    cursor: "pointer",
  },
  servingsVal: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, minWidth: 20, textAlign: "center" },
  ingredientList: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 },
  ingredientRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderBottom: `1px solid var(--line)`,
    paddingBottom: 10,
  },
  ingredientMain: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 },
  ingredientName: { fontSize: 13.5, overflowWrap: "break-word" },
  ingredientKcal: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--muted)" },
  ingredientAmountRow: { display: "flex", alignItems: "center", gap: 4, flexShrink: 0 },
  ingredientInput: {
    background: "var(--bg-card)",
    border: "none",
    borderRadius: 10,
    padding: "8px 8px",
    color: "var(--paper)",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 14,
    width: 64,
    textAlign: "right",
  },
  ingredientUnit: { fontSize: 12, color: "var(--muted)" },
  resultKcal: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", flexShrink: 0 },
  noResults: { fontSize: 12.5, color: "var(--muted)", padding: "10px 6px" },
  customLink: {
    marginTop: 14,
    background: "none",
    border: "none",
    color: "var(--sage-deep)",
    fontSize: 13,
    cursor: "pointer",
    padding: "8px 0",
    minHeight: 40,
  },
  pickedPanel: { display: "flex", flexDirection: "column", gap: 4 },
  pickedName: { fontSize: 15, marginBottom: 8 },
  fieldLabel: { fontSize: 12, color: "var(--muted)", marginTop: 8, marginBottom: 6, display: "block" },
  amountLabelRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, marginBottom: 6 },
  unitToggle: { display: "flex", gap: 4, background: "var(--bg)", borderRadius: 999, padding: 3 },
  unitToggleBtn: {
    background: "none",
    border: "none",
    borderRadius: 999,
    padding: "4px 12px",
    fontSize: 12,
    color: "var(--muted)",
    cursor: "pointer",
    minHeight: 26,
  },
  unitToggleBtnActive: { background: "var(--sage-deep)", color: "#FFFFFF", fontWeight: 600 },
  fieldLabelSmall: { fontSize: 10.5, color: "var(--muted)", marginBottom: 4, display: "block", textTransform: "capitalize" },
  gramsInput: {
    background: "var(--bg-card)",
    border: "none",
    borderRadius: 14,
    padding: "12px 14px",
    color: "var(--paper)",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 16,
    width: "100%",
    boxSizing: "border-box",
  },
  pickedPreview: { fontSize: 12, color: "var(--muted)", marginTop: 10, fontFamily: "'IBM Plex Mono', monospace" },
  unitsPreview: { color: "var(--sage-deep)", fontWeight: 600 },
  sheetActions: { display: "flex", gap: 10, marginTop: 18 },
  secondaryBtn: {
    flex: 1,
    minHeight: 44,
    background: "var(--bg-card)",
    border: "none",
    borderRadius: 14,
    padding: "11px 0",
    color: "var(--paper)",
    cursor: "pointer",
    fontSize: 13.5,
  },
  primaryBtn: {
    flex: 2,
    minHeight: 44,
    background: "var(--sage-deep)",
    border: "none",
    borderRadius: 14,
    padding: "11px 0",
    color: "#FFFFFF",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 13.5,
  },
  customForm: { display: "flex", flexDirection: "column", gap: 10 },
  customGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginTop: 6 },
  deviceSection: { marginTop: 26, paddingTop: 18, borderTop: `1px solid var(--line)`, display: "flex", flexDirection: "column", gap: 10 },
  weightHeroCard: {
    textAlign: "center",
    padding: "22px 16px",
    background: "linear-gradient(135deg, var(--sage-tint), var(--bg-card))",
    borderRadius: 16,
  },
  weightHeroNumber: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 34, fontWeight: 700, color: "var(--sage-deep)" },
  weightHeroLabel: { fontSize: 13, color: "var(--muted)", marginTop: 4 },
  deviceList: { display: "flex", flexDirection: "column", gap: 8 },
  deviceRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "var(--bg-card)",
    borderRadius: 14,
    padding: "12px 14px",
  },
  deviceName: { fontSize: 13.5 },
  deviceConnectBtn: {
    background: "var(--sage-tint)",
    color: "var(--sage-deep)",
    border: "none",
    borderRadius: 999,
    padding: "8px 16px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    minHeight: 36,
  },
  deviceMsg: { fontSize: 12, color: "var(--muted)", lineHeight: 1.5, margin: "2px 2px 0" },
  textInput: {
    background: "var(--bg-card)",
    border: "none",
    borderRadius: 14,
    padding: "11px 14px",
    color: "var(--paper)",
    fontSize: 16,
    width: "100%",
    boxSizing: "border-box",
  },
};
