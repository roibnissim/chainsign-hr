import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const isAuthEnabled = import.meta.env.VITE_USE_FIREBASE_AUTH === "true";
export const isFirestoreEnabled = import.meta.env.VITE_USE_FIRESTORE === "true";
export const isStorageEnabled = import.meta.env.VITE_USE_FIREBASE_STORAGE === "true";

const app = initializeApp(firebaseConfig);

export const auth = isAuthEnabled ? getAuth(app) : null;
export const db = isFirestoreEnabled ? getFirestore(app) : null;
export const storage = isStorageEnabled ? getStorage(app) : null;

export default app;