import type { AgreementTemplate, SalaryAgreement } from '../types';

/** מחלץ סכום שכר חודשי מהשדה השמור, או מתגיות salary בפורמט */
export function resolveAgreementMonthlySalary(
  agreement: Pick<SalaryAgreement, 'monthlySalary' | 'fieldValues' | 'templateId'>,
  templates: Pick<AgreementTemplate, 'id' | 'fields'>[] = []
): number {
  const direct = Number(agreement.monthlySalary);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const values = agreement.fieldValues || {};
  const template =
    (agreement.templateId && templates.find((t) => t.id === agreement.templateId)) || null;

  if (template) {
    let sum = 0;
    for (const field of template.fields || []) {
      if (field.kind !== 'salary') continue;
      const n = Number(String(values[field.id] ?? '').replace(/[^\d.]/g, ''));
      if (Number.isFinite(n) && n > 0) sum += n;
    }
    if (sum > 0) return sum;
  }

  return Number.isFinite(direct) && direct > 0 ? direct : 0;
}
