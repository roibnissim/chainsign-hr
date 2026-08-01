/** Feature flags for staged Firebase migration */

function envFlag(name: string, fallback = false): boolean {
  const v = import.meta.env[name];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

/** Master switch — enables auth + Firestore + Storage cutover */
export function isFirebaseEnabled(): boolean {
  return envFlag('VITE_USE_FIREBASE', false);
}

export function useFirebaseAuth(): boolean {
  return isFirebaseEnabled() || envFlag('VITE_USE_FIREBASE_AUTH', false);
}

export function useFirestore(): boolean {
  return isFirebaseEnabled() || envFlag('VITE_USE_FIRESTORE', false);
}

export function useFirebaseStorage(): boolean {
  return isFirebaseEnabled() || envFlag('VITE_USE_FIREBASE_STORAGE', false);
}

/** When true, HR data must not be written to localStorage */
export function disableLocalHrStorage(): boolean {
  return useFirestore();
}
