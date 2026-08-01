import { useEffect, useRef } from 'react';
import {
  INITIAL_AGREEMENTS,
  INITIAL_EMPLOYEES,
  INITIAL_TEMPLATES,
  INITIAL_EMPLOYEE_DOCS,
} from '../data/mockData';
import {
  disableLocalHrStorage,
  useFirestore,
} from '../config/featureFlags';
import {
  BrandingSettings,
  loadBranding,
  saveBranding,
} from '../config/branding';
import {
  loadRoles,
  saveRoles,
  DEFAULT_ROLES,
} from '../config/roles';
import {
  clearActivityLogLocal,
  dedupeActivityEvents,
} from '../config/activityLog';
import type {
  AgreementTemplate,
  Employee,
  EmployeeFileDocument,
  ManagerActivityEvent,
  RoleType,
  SalaryAgreement,
} from '../types';
import {
  subscribeAgreements,
  subscribeBranding,
  subscribeEmployees,
  subscribeFileDocuments,
  subscribeRoles,
  subscribeTemplates,
  upsertAgreements,
  upsertEmployees,
  upsertFileDocuments,
  upsertTemplates,
  saveBrandingRemote,
  saveRolesRemote,
} from './firestore/hrStore';
import { isFirebaseConfigured } from '../lib/firebase';
import { subscribeActivityEventsViaApi } from './activityLogStore';
import { clearLocalHrStorage } from './migrateLocal';

type Setters = {
  setEmployees: (v: Employee[] | ((p: Employee[]) => Employee[])) => void;
  setAgreements: (v: SalaryAgreement[] | ((p: SalaryAgreement[]) => SalaryAgreement[])) => void;
  setTemplates: (v: AgreementTemplate[] | ((p: AgreementTemplate[]) => AgreementTemplate[])) => void;
  setFileDocuments: (
    v: EmployeeFileDocument[] | ((p: EmployeeFileDocument[]) => EmployeeFileDocument[])
  ) => void;
  setBranding: (v: BrandingSettings | ((p: BrandingSettings) => BrandingSettings)) => void;
  setRoles: (v: RoleType[] | ((p: RoleType[]) => RoleType[])) => void;
  setActivityEvents: (
    v: ManagerActivityEvent[] | ((p: ManagerActivityEvent[]) => ManagerActivityEvent[])
  ) => void;
};

type EchoKey =
  | 'employees'
  | 'agreements'
  | 'templates'
  | 'fileDocuments'
  | 'branding'
  | 'roles';

/**
 * When Firestore is enabled: subscribe to remote HR collections and persist local changes.
 * When disabled: keep legacy localStorage writes.
 *
 * חשוב: לא כותבים חזרה ל-Firestore את מה שזה עתה הגיע מ-onSnapshot
 * (מונע לולאת Write שגורמת ל-400 ב-WebChannel).
 */
export function useHrPersistence(params: {
  enabled: boolean;
  employees: Employee[];
  agreements: SalaryAgreement[];
  templates: AgreementTemplate[];
  fileDocuments: EmployeeFileDocument[];
  branding: BrandingSettings;
  roles: RoleType[];
  activityEvents: ManagerActivityEvent[];
} & Setters) {
  const {
    enabled,
    employees,
    agreements,
    templates,
    fileDocuments,
    branding,
    roles,
    setEmployees,
    setAgreements,
    setTemplates,
    setFileDocuments,
    setBranding,
    setRoles,
    setActivityEvents,
  } = params;

  const persistMeta = useRef({
    skipRemoteWrite: true,
    echo: {
      employees: false,
      agreements: false,
      templates: false,
      fileDocuments: false,
      branding: false,
      roles: false,
    } as Record<EchoKey, boolean>,
  });
  const firestoreOn = enabled && useFirestore() && isFirebaseConfigured();

  useEffect(() => {
    if (!firestoreOn) return;
    clearLocalHrStorage();
  }, [firestoreOn]);

  useEffect(() => {
    if (!firestoreOn) return;
    persistMeta.current.skipRemoteWrite = true;
    let gotEmployees = false;
    let gotDocs = false;
    const maybeReady = () => {
      if (gotEmployees && gotDocs) persistMeta.current.skipRemoteWrite = false;
    };

    const fromRemote = (key: EchoKey, apply: () => void) => {
      persistMeta.current.echo[key] = true;
      apply();
    };

    const unsubs = [
      subscribeEmployees((rows) => {
        fromRemote('employees', () => setEmployees(rows));
        gotEmployees = true;
        maybeReady();
      }),
      subscribeAgreements((rows) => {
        fromRemote('agreements', () => setAgreements(rows));
      }),
      subscribeTemplates((rows) => {
        fromRemote('templates', () => setTemplates(rows));
      }),
      subscribeFileDocuments((rows) => {
        fromRemote('fileDocuments', () => setFileDocuments(rows));
        gotDocs = true;
        maybeReady();
      }),
      subscribeBranding((remote) => {
        if (remote) fromRemote('branding', () => setBranding(remote));
      }),
      subscribeRoles((remote) => {
        if (remote) fromRemote('roles', () => setRoles(remote));
      }),
      subscribeActivityEventsViaApi((rows) => {
        setActivityEvents(dedupeActivityEvents(rows));
      }),
    ];
    const t = window.setTimeout(() => {
      persistMeta.current.skipRemoteWrite = false;
    }, 2500);
    return () => {
      unsubs.forEach((u) => u());
      window.clearTimeout(t);
    };
  }, [
    firestoreOn,
    setEmployees,
    setAgreements,
    setTemplates,
    setFileDocuments,
    setBranding,
    setRoles,
    setActivityEvents,
  ]);

  const shouldWrite = (key: EchoKey): boolean => {
    if (!firestoreOn) return false;
    if (persistMeta.current.skipRemoteWrite) return false;
    if (persistMeta.current.echo[key]) {
      persistMeta.current.echo[key] = false;
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (firestoreOn) {
      if (!shouldWrite('employees')) return;
      void upsertEmployees(employees).catch(console.error);
      return;
    }
    if (disableLocalHrStorage()) return;
    localStorage.setItem('blocksalary_employees', JSON.stringify(employees));
  }, [employees, firestoreOn]);

  useEffect(() => {
    if (firestoreOn) {
      if (!shouldWrite('agreements')) return;
      void upsertAgreements(agreements).catch(console.error);
      return;
    }
    if (disableLocalHrStorage()) return;
    localStorage.setItem('blocksalary_agreements', JSON.stringify(agreements));
  }, [agreements, firestoreOn]);

  useEffect(() => {
    if (firestoreOn) {
      if (!shouldWrite('templates')) return;
      void upsertTemplates(templates).catch(console.error);
      return;
    }
    if (disableLocalHrStorage()) return;
    localStorage.setItem('club_agreement_templates_v4', JSON.stringify(templates));
  }, [templates, firestoreOn]);

  useEffect(() => {
    if (firestoreOn) {
      if (!shouldWrite('fileDocuments')) return;
      void upsertFileDocuments(fileDocuments).catch(console.error);
      return;
    }
    if (disableLocalHrStorage()) return;
    localStorage.setItem('blocksalary_employee_docs', JSON.stringify(fileDocuments));
  }, [fileDocuments, firestoreOn]);

  useEffect(() => {
    if (firestoreOn) {
      if (!shouldWrite('branding')) return;
      void saveBrandingRemote(branding).catch(console.error);
      return;
    }
    if (disableLocalHrStorage()) return;
    saveBranding(branding);
  }, [branding, firestoreOn]);

  useEffect(() => {
    if (firestoreOn) {
      if (!shouldWrite('roles')) return;
      void saveRolesRemote(roles).catch(console.error);
      return;
    }
    if (disableLocalHrStorage()) return;
    saveRoles(roles);
  }, [roles, firestoreOn]);
}

export function initialEmployees(): Employee[] {
  if (useFirestore() && isFirebaseConfigured()) {
    clearLocalHrStorage();
    return [];
  }
  const saved = localStorage.getItem('blocksalary_employees');
  return saved ? JSON.parse(saved) : INITIAL_EMPLOYEES;
}

export function initialAgreements(): SalaryAgreement[] {
  if (useFirestore() && isFirebaseConfigured()) return [];
  const saved = localStorage.getItem('blocksalary_agreements');
  return saved ? JSON.parse(saved) : INITIAL_AGREEMENTS;
}

export function initialTemplates(): AgreementTemplate[] {
  if (useFirestore() && isFirebaseConfigured()) return [];
  const saved = localStorage.getItem('club_agreement_templates_v4');
  if (saved) {
    try {
      return JSON.parse(saved) as AgreementTemplate[];
    } catch {
      return INITIAL_TEMPLATES;
    }
  }
  localStorage.removeItem('club_agreement_templates_v3');
  return INITIAL_TEMPLATES;
}

export function initialFileDocuments(): EmployeeFileDocument[] {
  if (useFirestore() && isFirebaseConfigured()) return [];
  const saved = localStorage.getItem('blocksalary_employee_docs');
  return saved ? JSON.parse(saved) : INITIAL_EMPLOYEE_DOCS;
}

export function initialBranding(): BrandingSettings {
  return loadBranding();
}

export function initialRoles(): RoleType[] {
  if (useFirestore() && isFirebaseConfigured()) return [...DEFAULT_ROLES];
  return loadRoles();
}

export function initialActivityEvents(): ManagerActivityEvent[] {
  clearActivityLogLocal();
  return [];
}
