import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAvB0Y92_L2-ncMad5lTReOn_yUik7e3eY",
  authDomain: "codelab252.firebaseapp.com",
  projectId: "codelab252",
  storageBucket: "codelab252.firebasestorage.app",
  messagingSenderId: "1025977357546",
  appId: "1:1025977357546:web:f25580e771fa6a45ce3393",
  measurementId: "G-ZC327N04W8"
};

const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
const auth = getAuth(app);
const db = getFirestore(app);

export { app, analytics, auth, db };
