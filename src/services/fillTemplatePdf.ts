import { PDFDocument } from 'pdf-lib';
import {
  AgreementTemplate,
  Employee,
  FieldSignature,
  TemplateField,
} from '../types';
import { salaryAmountInWords } from './hebrewAmountInWords';
import {
  formatAgreementDateDay,
  formatAgreementDateMonth,
  formatAgreementDateYear,
} from './agreementDateFields';

function valueForField(
  field: TemplateField,
  employee: Employee | null | undefined,
  fieldValues: Record<string, string>,
  allFields: TemplateField[] = [],
  agreementDateIso?: string
): string {
  if (field.kind === 'signature') return '';

  if (field.kind === 'salary_words') {
    if (fieldValues[field.id] != null && fieldValues[field.id] !== '') {
      return fieldValues[field.id];
    }
    const linkedId = field.linkedSalaryFieldId;
    const linkedRaw = linkedId ? fieldValues[linkedId] : '';
    if (linkedRaw) return salaryAmountInWords(linkedRaw);
    const firstSalary = allFields.find((f) => f.kind === 'salary');
    if (firstSalary && fieldValues[firstSalary.id]) {
      return salaryAmountInWords(fieldValues[firstSalary.id]);
    }
    return '';
  }

  if (field.kind === 'date_day' || field.kind === 'date_month' || field.kind === 'date_year') {
    if (fieldValues[field.id] != null && fieldValues[field.id] !== '') {
      return fieldValues[field.id];
    }
    const iso = agreementDateIso || '';
    if (!iso) return '';
    if (field.kind === 'date_day') return formatAgreementDateDay(iso);
    if (field.kind === 'date_month') {
      return formatAgreementDateMonth(iso, field.monthFormat || 'hebrew');
    }
    return formatAgreementDateYear(iso);
  }

  if (fieldValues[field.id] != null && fieldValues[field.id] !== '') {
    return fieldValues[field.id];
  }
  if (!employee) return '';
  switch (field.kind) {
    case 'employee_name':
      return employee.name;
    case 'id_number':
      return employee.idNumber;
    case 'phone':
      return employee.phone || '';
    case 'address':
      return employee.address || '';
    case 'email':
      return employee.email;
    default:
      return '';
  }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Canvas יחיד לשימוש חוזר — חוסך הקצאות בטפסים עם עשרות שדות */
let sharedCanvas: HTMLCanvasElement | null = null;
const textImageCache = new Map<string, Uint8Array>();

function getSharedCanvas(): HTMLCanvasElement {
  if (!sharedCanvas) sharedCanvas = document.createElement('canvas');
  return sharedCanvas;
}

/**
 * רינדור טקסט RTL לתמונה.
 * JPEG + scale נמוך — מהיר בהרבה מ-PNG×2 לכל שדה.
 */
function renderTextFieldImage(
  text: string,
  widthPt: number,
  heightPt: number,
  fontSizePt: number
): Uint8Array {
  const scale = 1.25;
  const w = Math.max(2, Math.ceil(widthPt * scale));
  const h = Math.max(2, Math.ceil(heightPt * scale));
  const cacheKey = `${text}\0${w}x${h}@${fontSizePt}`;
  const cached = textImageCache.get(cacheKey);
  if (cached) return cached;

  const canvas = getSharedCanvas();
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0f172a';
  const px = fontSizePt * scale;
  ctx.font = `500 ${px}px Heebo, Arial, sans-serif`;
  ctx.fillText(text, w - 2 * scale, h / 2, w - 4 * scale);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  const bytes = dataUrlToBytes(dataUrl);
  if (textImageCache.size > 200) textImageCache.clear();
  textImageCache.set(cacheKey, bytes);
  return bytes;
}

export interface FillTemplateOptions {
  template: AgreementTemplate;
  sourcePdfBytes: Uint8Array;
  employee?: Employee | null;
  fieldValues: Record<string, string>;
  /** ISO date (YYYY-MM-DD) for date_day / date_month / date_year fields */
  agreementDate?: string;
  signatureImages?: Record<string, string>;
  fieldSignatures?: FieldSignature[];
}

export async function fillTemplatePdf(options: FillTemplateOptions): Promise<Uint8Array> {
  const {
    template,
    sourcePdfBytes,
    employee,
    fieldValues,
    agreementDate,
    signatureImages = {},
  } = options;

  const pdfDoc = await PDFDocument.load(
    sourcePdfBytes instanceof Uint8Array
      ? sourcePdfBytes.slice()
      : new Uint8Array(sourcePdfBytes),
    { ignoreEncryption: true }
  );
  const pages = pdfDoc.getPages();

  // שלב 1: הכן את כל תמונות הטקסט (סינכרוני ומהיר) — בלי await לכל שדה
  type PendingText = {
    field: TemplateField;
    jpegBytes: Uint8Array;
  };
  const pendingText: PendingText[] = [];
  let processed = 0;

  for (const field of template.fields) {
    if (field.kind === 'signature') continue;
    const page = pages[field.pageIndex];
    if (!page) continue;
    const raw = valueForField(
      field,
      employee,
      fieldValues,
      template.fields,
      agreementDate
    );
    if (!raw) continue;
    const fontSize = field.fontSize || Math.max(8, Math.min(14, field.height * 0.55));
    try {
      pendingText.push({
        field,
        jpegBytes: renderTextFieldImage(raw, field.width, field.height, fontSize),
      });
    } catch (err) {
      console.warn('Failed to render text field', field.id, err);
    }
    processed += 1;
    // שחרור ה-UI כל 12 שדות — מונע "תקיעה" של הדפדפן
    if (processed % 12 === 0) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  // שלב 2: הטמעת JPEG ל-PDF (מהיר משמעותית מ-PNG)
  const jpegEmbedCache = new WeakMap<Uint8Array, Awaited<ReturnType<typeof pdfDoc.embedJpg>>>();

  for (let i = 0; i < pendingText.length; i++) {
    const item = pendingText[i];
    const page = pages[item.field.pageIndex];
    if (!page) continue;
    try {
      let image = jpegEmbedCache.get(item.jpegBytes);
      if (!image) {
        image = await pdfDoc.embedJpg(item.jpegBytes);
        jpegEmbedCache.set(item.jpegBytes, image);
      }
      page.drawImage(image, {
        x: item.field.x,
        y: item.field.y,
        width: item.field.width,
        height: item.field.height,
      });
    } catch (err) {
      console.warn('Failed to draw text field', item.field.id, err);
    }
    if ((i + 1) % 20 === 0) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  for (const field of template.fields) {
    if (field.kind !== 'signature') continue;
    const page = pages[field.pageIndex];
    if (!page) continue;
    const imgUrl =
      signatureImages[field.id] ||
      options.fieldSignatures?.find((fs) => fs.fieldId === field.id)?.signature
        .signatureImageBase64;
    if (!imgUrl) continue;
    try {
      const imgBytes = dataUrlToBytes(imgUrl);
      const isJpg = imgUrl.includes('image/jpeg') || imgUrl.includes('/9j/');
      const image = isJpg
        ? await pdfDoc.embedJpg(imgBytes)
        : await pdfDoc.embedPng(imgBytes);
      const maxW = field.width;
      const maxH = field.height;
      const scale = Math.min(maxW / image.width, maxH / image.height);
      const drawW = image.width * scale;
      const drawH = image.height * scale;
      const x = field.x + (maxW - drawW) / 2;
      const y = field.y + (maxH - drawH) / 2;
      page.drawImage(image, { x, y, width: drawW, height: drawH });
    } catch (err) {
      console.warn('Failed to embed signature', field.id, err);
    }
  }

  // useObjectStreams מאיץ שמירה במסמכים גדולים
  return pdfDoc.save({ useObjectStreams: true });
}

export function buildEmployeeFieldValues(
  template: AgreementTemplate,
  employee: Employee
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of template.fields) {
    switch (field.kind) {
      case 'employee_name':
        values[field.id] = employee.name;
        break;
      case 'id_number':
        values[field.id] = employee.idNumber;
        break;
      case 'phone':
        values[field.id] = employee.phone || '';
        break;
      case 'address':
        values[field.id] = employee.address || '';
        break;
      case 'email':
        values[field.id] = employee.email;
        break;
      default:
        break;
    }
  }
  return values;
}

/** Auto-fill date_day / date_month / date_year from an ISO agreement date. */
export function buildAgreementDateFieldValues(
  template: AgreementTemplate,
  agreementDateIso: string
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of template.fields) {
    if (field.kind === 'date_day') {
      values[field.id] = formatAgreementDateDay(agreementDateIso);
    } else if (field.kind === 'date_month') {
      values[field.id] = formatAgreementDateMonth(
        agreementDateIso,
        field.monthFormat || 'hebrew'
      );
    } else if (field.kind === 'date_year') {
      values[field.id] = formatAgreementDateYear(agreementDateIso);
    }
  }
  return values;
}

export function downloadPdfFile(pdfBytes: Uint8Array, fileName: string) {
  const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function resolveAgreementPdfBytes(
  agreement: {
    id: string;
    pdfUrl?: string;
    templateId?: string;
    fieldValues?: Record<string, string>;
    fieldSignatures?: FieldSignature[];
    signature?: { signatureImageBase64?: string };
    effectiveDate?: string;
  },
  template: AgreementTemplate | null | undefined,
  employee: Employee | null | undefined,
  getTemplatePdfFn: (id: string) => Promise<Uint8Array | null>,
  getAgreementPdfFn: (id: string) => Promise<Uint8Array | null>
): Promise<Uint8Array | null> {
  if (agreement.pdfUrl?.startsWith('data:')) {
    return dataUrlToBytes(agreement.pdfUrl);
  }

  const stored = await getAgreementPdfFn(agreement.id);
  if (stored) return stored;

  if (agreement.templateId && template) {
    const source = await getTemplatePdfFn(agreement.templateId);
    if (!source) return null;
    const signatureImages: Record<string, string> = {};
    for (const fs of agreement.fieldSignatures || []) {
      if (fs.signature.signatureImageBase64) {
        signatureImages[fs.fieldId] = fs.signature.signatureImageBase64;
      }
    }
    if (agreement.signature?.signatureImageBase64) {
      for (const f of template.fields.filter(
        (x) => x.kind === 'signature' && x.signerRole !== 'club'
      )) {
        if (!signatureImages[f.id]) {
          signatureImages[f.id] = agreement.signature.signatureImageBase64;
        }
      }
    }
    return fillTemplatePdf({
      template,
      sourcePdfBytes: source,
      employee,
      fieldValues: agreement.fieldValues || {},
      agreementDate: agreement.effectiveDate,
      signatureImages,
      fieldSignatures: agreement.fieldSignatures,
    });
  }

  return null;
}
