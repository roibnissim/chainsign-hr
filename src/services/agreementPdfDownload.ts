import { SalaryAgreement, Employee, AgreementTemplate } from '../types';
import { generateAgreementPdf, downloadPdfFile as downloadGeneratedPdf } from './pdfGenerator';
import { downloadPdfFile, resolveAgreementPdfBytes } from './fillTemplatePdf';
import { getAgreementPdf, getTemplatePdf } from './templatePdfStorage';

/** Prefer filled template PDF; fall back to canvas generator for legacy docs. */
export async function getDownloadableAgreementPdf(
  agreement: SalaryAgreement,
  employee: Employee | null | undefined,
  templates: AgreementTemplate[] = []
): Promise<Uint8Array> {
  const template = agreement.templateId
    ? templates.find((t) => t.id === agreement.templateId)
    : undefined;

  const fromTemplate = await resolveAgreementPdfBytes(
    agreement,
    template,
    employee,
    getTemplatePdf,
    getAgreementPdf
  );
  if (fromTemplate) return fromTemplate;

  return generateAgreementPdf(agreement, { employee });
}

export { downloadPdfFile, downloadGeneratedPdf };
