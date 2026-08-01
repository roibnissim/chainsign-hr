import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

let app: FirebaseApp | null = null;
let authInst: Auth | null = null;
let dbInst: Firestore | null = null;
let storageInst: FirebaseStorage | null = null;
let functionsInst: Functions | null = null;
let emulatorsConnected = false;

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured — set VITE_FIREBASE_* env vars');
  }
  if (!app) {
    app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
  }
  return app;
}

function maybeConnectEmulators() {
  if (emulatorsConnected) return;
  if (import.meta.env.VITE_USE_FIREBASE_EMULATORS !== 'true') return;
  if (!authInst || !dbInst || !storageInst || !functionsInst) return;
  connectAuthEmulator(authInst, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(dbInst, '127.0.0.1', 8080);
  connectStorageEmulator(storageInst, '127.0.0.1', 9199);
  connectFunctionsEmulator(functionsInst, '127.0.0.1', 5001);
  emulatorsConnected = true;
}

export function getFirebaseAuth(): Auth {
  if (!authInst) authInst = getAuth(getFirebaseApp());
  maybeConnectEmulators();
  return authInst;
}

export function getFirebaseFirestore(): Firestore {
  if (!dbInst) dbInst = getFirestore(getFirebaseApp());
  maybeConnectEmulators();
  return dbInst;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storageInst) storageInst = getStorage(getFirebaseApp());
  maybeConnectEmulators();
  return storageInst;
}

export function getFirebaseFunctions(): Functions {
  if (!functionsInst) functionsInst = getFunctions(getFirebaseApp(), 'europe-west1');
  maybeConnectEmulators();
  return functionsInst;
}
