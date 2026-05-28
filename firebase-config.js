import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "paste-your-apiKey-here",
  authDomain: "paste-your-authDomain-here",
  projectId: "paste-your-projectId-here",
  storageBucket: "paste-your-storageBucket-here",
  messagingSenderId: "paste-your-messagingSenderId-here",
  appId: "paste-your-appId-here"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;