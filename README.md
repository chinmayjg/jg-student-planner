# JG Lucknow Study Planner

A comprehensive study planner for Judicial Services (PCS-J / HJS) aspirants.

---

## 📁 Project Structure

```
jg-study-planner/
├── index.html          # Main app (all sections, modals, UI)
├── style.css           # Complete styling (dark/light mode, responsive)
├── app.js              # All application logic (auth, CRUD, charts, SWOT)
├── firebase-config.js  # Firebase configuration (edit with your project keys)
└── README.md           # This file
```

---

## 🔥 Step 1: Set Up Firebase

### 1.1 Create Firebase Project
1. Go to [https://console.firebase.google.com/](https://console.firebase.google.com/)
2. Click **"Add project"** → Enter project name (e.g. `jg-study-planner`) → Continue
3. Disable Google Analytics if not needed → **Create project**

### 1.2 Register Web App
1. In Project Overview, click the **Web icon** (`</>`)
2. Enter a nickname (e.g. `study-planner-web`) → **Register app**
3. Copy the `firebaseConfig` object shown — you'll paste it in the next step

### 1.3 Enable Authentication
1. Left sidebar → **Authentication** → **Get Started**
2. Under **Sign-in method** → Enable **Email/Password**
3. Save

### 1.4 Create Firestore Database
1. Left sidebar → **Firestore Database** → **Create database**
2. Select **"Start in test mode"** (allows read/write for 30 days — secure later)
3. Choose a region close to India (e.g. `asia-south1`) → Done

### 1.5 Add Your Config to the App
Open `firebase-config.js` and replace the placeholder values:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
```

---

## 🖥️ Step 2: Run Locally

Since the app uses ES Modules (Firebase SDK), you **cannot open index.html directly** in a browser (it will show a CORS error). You need a local server.

### Option A — VS Code Live Server (Easiest)
1. Install the **Live Server** extension in VS Code
2. Right-click `index.html` → **"Open with Live Server"**
3. App opens at `http://127.0.0.1:5500`

### Option B — Python (No install required)
```bash
cd jg-study-planner
python3 -m http.server 5500
# Open http://localhost:5500
```

### Option C — Node.js (npx)
```bash
cd jg-study-planner
npx serve .
# Open the URL shown in terminal
```

---

## 🚀 Step 3: Deploy on Netlify (Free)

### Method A — Drag & Drop (No account needed for basic)
1. Go to [https://app.netlify.com/](https://app.netlify.com/) → Sign up (free)
2. Drag and drop the `jg-study-planner/` folder onto the Netlify dashboard
3. Your app is live in 30 seconds! You'll get a URL like `https://quirky-name-123.netlify.app`

### Method B — GitHub + Netlify (Recommended for updates)
1. Push your project to GitHub
2. In Netlify: **New site from Git** → Connect GitHub → Select repo
3. Build settings: Leave blank (no build command needed for plain HTML)
4. Publish directory: `/` (root)
5. **Deploy site**

### Netlify Custom Domain (Optional)
- In Site settings → Domain management → Add custom domain

---

## 🚀 Deploy on Vercel (Alternative)

```bash
npm install -g vercel
cd jg-study-planner
vercel
# Follow prompts — your site goes live
```

---

## 🔒 Securing Firestore (After Testing)

Replace test mode rules with these production rules in Firebase Console → Firestore → Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## 🗂️ Firestore Data Structure

```
users/
  {userId}/
    ├── (user profile document)
    ├── schedules/         ← Daily/Weekly/Monthly tasks
    ├── exams/             ← Upcoming judiciary exams
    ├── prelims_tests/     ← Prelims mock test scores
    └── mains_tests/       ← Mains subject scores
```

---

## ✨ Features Summary

| Feature | Status |
|---|---|
| Email/Password Authentication | ✅ |
| Private per-user dashboard | ✅ |
| Daily/Weekly/Monthly schedule planner | ✅ |
| Task completion with checkbox | ✅ |
| Edit/Delete tasks | ✅ |
| Upcoming exam tracker with countdown | ✅ |
| Prelims mock test score tracker | ✅ |
| Mains subject score tracker | ✅ |
| Subject-wise performance bar chart | ✅ |
| Monthly progress line chart | ✅ |
| Auto SWOT Analysis | ✅ |
| Study streak counter | ✅ |
| Dark/Light mode toggle | ✅ |
| Mobile responsive design | ✅ |
| Export progress as PDF | ✅ |
| Motivational daily quote | ✅ |
| Firebase Firestore real-time sync | ✅ |
| Local storage backup | ✅ |

---

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3 (custom properties, flexbox, grid), Vanilla JS (ES Modules)
- **Backend/DB**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Charts**: Chart.js v4
- **PDF Export**: jsPDF
- **Fonts**: Google Fonts (Playfair Display + DM Sans)
- **Hosting**: Netlify / Vercel

---

## 📱 Browser Support

Works on: Chrome, Firefox, Edge, Safari (desktop + mobile)

---

Made with ❤️ for Judiciary Aspirants of Lucknow
