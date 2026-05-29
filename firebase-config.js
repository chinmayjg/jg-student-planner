// firebase-config.js — JG Lucknow Study Planner

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ⚠️ REPLACE these values with your actual Firebase project config
// Firebase Console → Project Settings → Your Apps → Web App → Config
const firebaseConfig = {
  apiKey: "AIzaSyANEuLrhnIgsYGDzUwbaDUl7Ys86dxLYCU",
  authDomain: "jg-lucknow-study-planner.firebaseapp.com",
  projectId: "jg-lucknow-study-planner",
  storageBucket: "jg-lucknow-study-planner.firebasestorage.app",
  messagingSenderId: "933835045526",
  appId: "1:933835045526:web:8d5d01f4621ad312faa0b7"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
