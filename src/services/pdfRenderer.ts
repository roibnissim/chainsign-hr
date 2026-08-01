/**
 * Loads PDF pages as canvas images via pdf.js for template field editing / preview.
 */
import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface RenderedPdfPage {
  pageIndex: number;
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
  canvas: HTMLCanvasElement;
  dataUrl: string;
}

/** עותק עצמאי שלא יינתק כש-pdf.js מעביר Buffer ל-worker */
function toStandaloneBytes(pdfBytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(pdfBytes.byteLength);
  copy.set(pdfBytes);
  return copy;
}

export async function renderPdfPages(
  pdfBytes: Uint8Array,
  maxDisplayWidth = 720,
  options?: {
    /** JPEG מקטין זיכרון בתצוגה מקדימה של מסמכים ארוכים */
    imageFormat?: 'png' | 'jpeg';
    jpegQuality?: number;
    onPage?: (page: RenderedPdfPage, index: number, total: number) => void;
    signal?: AbortSignal;
  }
): Promise<RenderedPdfPage[]> {
  const imageFormat = options?.imageFormat || 'png';
  const jpegQuality = options?.jpegQuality ?? 0.72;
  const data = toStandaloneBytes(pdfBytes);
  const loadingTask = pdfjs.getDocument({ data });
  if (options?.signal) {
    const onAbort = () => {
      try {
        loadingTask.destroy();
      } catch {
        // ignore
      }
    };
    if (options.signal.aborted) onAbort();
    else options.signal.addEventListener('abort', onAbort, { once: true });
  }

  const pdf = await loadingTask.promise;
  const pages: RenderedPdfPage[] = [];
  const total = pdf.numPages;

  for (let i = 1; i <= total; i++) {
    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.5, maxDisplayWidth / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas unavailable');
    // רקע לבן — מונע שקיפות כבדה ב-JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    const dataUrl =
      imageFormat === 'jpeg'
        ? canvas.toDataURL('image/jpeg', jpegQuality)
        : canvas.toDataURL('image/png');

    const rendered: RenderedPdfPage = {
      pageIndex: i - 1,
      width: base.width,
      height: base.height,
      displayWidth: canvas.width,
      displayHeight: canvas.height,
      canvas,
      dataUrl,
    };
    pages.push(rendered);
    options?.onPage?.(rendered, i - 1, total);
  }

  return pages;
}

/** Convert display (top-left) rect to PDF points (bottom-left origin). */
export function displayRectToPdf(
  display: { x: number; y: number; w: number; h: number },
  page: { width: number; height: number; displayWidth: number; displayHeight: number }
): { x: number; y: number; width: number; height: number } {
  const sx = page.width / page.displayWidth;
  const sy = page.height / page.displayHeight;
  const pdfW = display.w * sx;
  const pdfH = display.h * sy;
  const pdfX = display.x * sx;
  const pdfYFromTop = display.y * sy;
  const pdfY = page.height - pdfYFromTop - pdfH;
  return { x: pdfX, y: pdfY, width: pdfW, height: pdfH };
}

/** Convert PDF rect to display (top-left) coordinates. */
export function pdfRectToDisplay(
  field: { x: number; y: number; width: number; height: number },
  page: { width: number; height: number; displayWidth: number; displayHeight: number }
): { x: number; y: number; w: number; h: number } {
  const sx = page.displayWidth / page.width;
  const sy = page.displayHeight / page.height;
  return {
    x: field.x * sx,
    y: (page.height - field.y - field.height) * sy,
    w: field.width * sx,
    h: field.height * sy,
  };
}
