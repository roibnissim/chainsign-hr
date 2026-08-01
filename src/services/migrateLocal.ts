import {
  upsertAgreements,
  upsertEmployees,
  upsertFileDocuments,
  upsertTemplates,
  saveBrandingRemote,
  saveRolesRemote,
} from './firestore/hrStore';
import type { BrandingSettings } from '../config/branding';
import { ROLES_STORAGE_KEY } from '../config/roles';
import { ACTIVITY_LOG_STORAGE_KEY } from '../config/activityLog';
import type {
  AgreementTemplate,
  Employee,
  EmployeeFileDocument,
  SalaryAgreement,
} from '../types';

const HR_KEYS = [
  'blocksalary_employees',
  'blocksalary_agreements',
  'blocksalary_employee_docs',
  'club_agreement_templates_v4',
  'club_branding_settings',
  ROLES_STORAGE_KEY,
  ACTIVITY_LOG_STORAGE_KEY,
] as const;

function parse<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Upload current browser localStorage HR data into Firestore, then clear local keys. */
export async function migrateLocalStorageToFirestore(): Promise<{
  employees: number;
  agreements: number;
  templates: number;
  docs: number;
}> {
  const employees = parse<Employee[]>('blocksalary_employees', []);
  const agreements = parse<SalaryAgreement[]>('blocksalary_agreements', []);
  const templates = parse<AgreementTemplate[]>('club_agreement_templates_v4', []);
  const docs = parse<EmployeeFileDocument[]>('blocksalary_employee_docs', []);
  const branding = parse<BrandingSettings | null>('club_branding_settings', null);
  const jobRoles = parse<string[] | null>(ROLES_STORAGE_KEY, null);

  await upsertEmployees(employees);
  await upsertAgreements(agreements);
  await upsertTemplates(templates);
  await upsertFileDocuments(docs);
  if (branding) await saveBrandingRemote(branding);
  if (jobRoles && jobRoles.length > 0) await saveRolesRemote(jobRoles);
  // לוג פעילות — Firestore בלבד; לא מייבאים מ-localStorage

  clearLocalHrStorage();
  return {
    employees: employees.length,
    agreements: agreements.length,
    templates: templates.length,
    docs: docs.length,
  };
}

export function clearLocalHrStorage(): void {
  for (const key of HR_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}
