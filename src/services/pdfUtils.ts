import { PDFDocument, PDFPage, rgb, StandardFonts } from 'pdf-lib';

/** Returns page count for a PDF bytes buffer. */
export async function getPdfPageCount(pdfBytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

export async function getPdfPageSizes(
  pdfBytes: Uint8Array
): Promise<{ width: number; height: number }[]> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  return doc.getPages().map((p: PDFPage) => {
    const { width, height } = p.getSize();
    return { width, height };
  });
}

/** Heuristic: reverse runs of Hebrew/Arabic letters for visual RTL in pdf-lib. */
export function prepareRtlText(text: string): string {
  if (!text) return '';
  // Keep numbers/Latin as-is; reverse contiguous Hebrew runs
  const hebrew = /[\u0590-\u05FF]+/g;
  return text.replace(hebrew, (run) => [...run].reverse().join(''));
}

export { PDFDocument, rgb, StandardFonts };
