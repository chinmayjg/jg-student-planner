// ============================================================
// firebase-config.js — JG Lucknow Study Planner
// ============================================================
// HOW TO SET UP FIREBASE:
// 1. Go to https://console.firebase.google.com/
// 2. Click "Add project" → enter project name → Continue
// 3. Disable Google Analytics (optional) → Create project
// 4. Click "Web" icon (</>)  in Project Overview
// 5. Register app with a nickname → Copy the firebaseConfig object
// 6. Replace the placeholder values below with your actual config
// 7. In Firebase console → Authentication → Get Started → Enable Email/Password
// 8. In Firebase console → Firestore Database → Create database → Start in test mode
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ⚠️ REPLACE these values with your actual Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyANEuLrhnIgsYGDzUwbaDUl7Ys86dxLYCU",
  authDomain: "jg-lucknow-study-planner.firebaseapp.com",
  projectId: "jg-lucknow-study-planner",
  storageBucket: "jg-lucknow-study-planner.firebasestorage.app",
  messagingSenderId: "933835045526",
  appId: "1:933835045526:web:8d5d01f4621ad312faa0b7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export auth and firestore instances for use across the app
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
