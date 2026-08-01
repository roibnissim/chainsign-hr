import { PDFDocument } from 'pdf-lib';
import { Employee, SalaryAgreement } from '../types';
import { BrandingSettings, DEFAULT_BRANDING, loadBranding } from '../config/branding';
import { buildAthleteAgreementClauses, CLUB_LEGAL_DEFAULTS, splitClauseItems } from '../data/clubAthleteAgreement';

export interface PdfGenOptions {
  employee?: Employee | null;
  branding?: BrandingSettings;
  /** סעיפים מתבנית; אם חסרים — סעיפי הסכם ספורטאי סטנדרטי */
  clauses?: { title: string; content: string }[];
}

const PAGE_W = 1240;
const PAGE_H = 1754;
const MARGIN = 70;
const CONTENT_W = PAGE_W - MARGIN * 2;

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function createPageCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  return { canvas, ctx };
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  pageIndex: number,
  totalPages: number,
  docNumber: string,
  clubName: string
) {
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(0, PAGE_H - 70, PAGE_W, 70);
  ctx.strokeStyle = '#CBD5E1';
  ctx.beginPath();
  ctx.moveTo(MARGIN, PAGE_H - 70);
  ctx.lineTo(PAGE_W - MARGIN, PAGE_H - 70);
  ctx.stroke();
  ctx.fillStyle = '#64748B';
  ctx.font = '14px Heebo, Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${clubName} · הסכם העסקה · ${docNumber}`, PAGE_W - MARGIN, PAGE_H - 35);
  ctx.textAlign = 'left';
  ctx.fillText(`עמוד ${pageIndex} מתוך ${totalPages}`, MARGIN, PAGE_H - 35);
  ctx.textAlign = 'right';
}

/**
 * PDF בסגנון הסכם ספורטאי של המועדון (מבנה משפטי פורמלי)
 */
export async function generateAgreementPdf(
  agreement: SalaryAgreement,
  options: PdfGenOptions = {}
): Promise<Uint8Array> {
  const branding = options.branding || loadBranding() || DEFAULT_BRANDING;
  const employee = options.employee;
  const clubName = branding.clubName || DEFAULT_BRANDING.clubName;
  const clauses =
    options.clauses && options.clauses.length > 0
      ? options.clauses
      : buildAthleteAgreementClauses({
          sportLabel: agreement.role.includes('התעמלות') ? 'התעמלות' : agreement.role.includes('כדורמים') ? 'כדורמים' : 'ספורט',
        });

  const signedDate = agreement.signature
    ? new Date(agreement.signature.signatureDate)
    : new Date(agreement.effectiveDate || agreement.createdAt);

  const day = signedDate.getDate().toString();
  const month = (signedDate.getMonth() + 1).toString();
  const year = signedDate.getFullYear().toString();

  // ---- Build content blocks as text lines with styling metadata ----
  type Block =
    | { type: 'title'; text: string }
    | { type: 'subtitle'; text: string }
    | { type: 'center'; text: string }
    | { type: 'body'; text: string }
    | { type: 'bold'; text: string }
    | { type: 'spacer'; h: number }
    | { type: 'line' }
    | { type: 'clauseTitle'; text: string }
    | { type: 'salaryBox' }
    | { type: 'signatures' }
    | { type: 'blockchain' };

  const blocks: Block[] = [
    { type: 'title', text: agreement.title || 'הסכם העסקה לשחקן / ספורטאי' },
    {
      type: 'subtitle',
      text: 'והודעה לעובד על תנאי עבודה לפי חוק הודעה לעובד (תנאי עבודה והליכי מיון וקבלה לעבודה), תשס״ב-2002',
    },
    { type: 'spacer', h: 18 },
    {
      type: 'center',
      text: `שנערך ונחתם בתל־אביב ביום ${day} לחודש ${month} שנת ${year}`,
    },
    { type: 'spacer', h: 22 },
    { type: 'bold', text: 'בין:' },
    { type: 'body', text: clubName },
    { type: 'body', text: `(ע.ר. ${CLUB_LEGAL_DEFAULTS.associationNumber})` },
    { type: 'body', text: `מכתובת: ${CLUB_LEGAL_DEFAULTS.address}` },
    { type: 'body', text: '(להלן: "המועדון" או "הקבוצה")                          מצד אחד;' },
    { type: 'spacer', h: 14 },
    { type: 'bold', text: 'לבין:' },
    { type: 'body', text: `שם: ${agreement.employeeName}` },
    {
      type: 'body',
      text: `ת.ז.: ${employee?.idNumber || agreement.signature?.signerIdNumber || '________________'}`,
    },
    { type: 'body', text: `מכתובת: ${employee?.address || '________________'}` },
    { type: 'body', text: `טלפון: ${employee?.phone || '________________'}` },
    {
      type: 'body',
      text: `דוא״ל: ${employee?.email || agreement.signature?.signerEmail || '________________'}`,
    },
    { type: 'body', text: '(להלן: "השחקן")                                                          מצד שני;' },
    { type: 'spacer', h: 16 },
    { type: 'line' },
    { type: 'spacer', h: 12 },
    {
      type: 'body',
      text: `הואיל והשחקן הינו ספורטאי/שחקן המעוניין לפעול במסגרת המועדון בתפקיד ${agreement.role};`,
    },
    {
      type: 'body',
      text: 'והואיל והשחקן מצהיר ומאשר כי הוא כשיר, בריא ובכושר גופני מתאים לביצוע התפקיד;',
    },
    {
      type: 'body',
      text: 'והואיל והצדדים מעוניינים להסדיר את היחסים ביניהם באופן כולל, ממצה וסופי, באופן שהסכם זה יהווה מסמך בלעדי וממצה לעניין תנאי ההתקשרות ביניהם;',
    },
    { type: 'spacer', h: 10 },
    { type: 'bold', text: 'לפיכך הוצהר, הותנה והוסכם בין הצדדים כדלקמן;' },
    { type: 'spacer', h: 18 },
  ];

  for (const c of clauses) {
    blocks.push({ type: 'clauseTitle', text: c.title });
    for (const item of splitClauseItems(c.content)) {
      blocks.push({ type: 'body', text: item });
      blocks.push({ type: 'spacer', h: 8 });
    }
    blocks.push({ type: 'spacer', h: 10 });
  }

  blocks.push({ type: 'salaryBox' });
  blocks.push({ type: 'spacer', h: 20 });
  blocks.push({ type: 'bold', text: 'ולראייה באו הצדדים על החתום:' });
  blocks.push({ type: 'spacer', h: 16 });
  blocks.push({ type: 'signatures' });

  if (agreement.status === 'SIGNED' && agreement.blockchain) {
    blocks.push({ type: 'spacer', h: 24 });
    blocks.push({ type: 'blockchain' });
  }

  // Measure & paginate
  const measureCtx = createPageCanvas().ctx;
  const lineHeight = 28;
  const pages: Block[][] = [];
  let current: Block[] = [];
  let y = 90;

  const pushPage = () => {
    pages.push(current);
    current = [];
    y = 90;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_H - 100) {
      pushPage();
    }
  };

  for (const block of blocks) {
    if (block.type === 'spacer') {
      ensureSpace(block.h);
      current.push(block);
      y += block.h;
      continue;
    }
    if (block.type === 'line') {
      ensureSpace(20);
      current.push(block);
      y += 20;
      continue;
    }
    if (block.type === 'salaryBox') {
      ensureSpace(120);
      current.push(block);
      y += 120;
      continue;
    }
    if (block.type === 'signatures') {
      ensureSpace(160);
      current.push(block);
      y += 160;
      continue;
    }
    if (block.type === 'blockchain') {
      ensureSpace(140);
      current.push(block);
      y += 140;
      continue;
    }

    let font = '18px Heebo, Arial, sans-serif';
    if (block.type === 'title') font = 'bold 34px Heebo, Arial, sans-serif';
    if (block.type === 'subtitle') font = '16px Heebo, Arial, sans-serif';
    if (block.type === 'center') font = '18px Heebo, Arial, sans-serif';
    if (block.type === 'bold' || block.type === 'clauseTitle') font = 'bold 18px Heebo, Arial, sans-serif';

    measureCtx.font = font;
    const maxW = block.type === 'title' || block.type === 'subtitle' || block.type === 'center' ? CONTENT_W : CONTENT_W;
    const lines = wrapText(measureCtx, block.text, maxW);
    const blockH = lines.length * (block.type === 'title' ? 40 : lineHeight) + (block.type === 'title' ? 8 : 4);
    ensureSpace(blockH);
    current.push(block);
    y += blockH;
  }
  if (current.length) pages.push(current);

  const totalPages = Math.max(pages.length, 1);
  const pdfDoc = await PDFDocument.create();

  for (let pi = 0; pi < pages.length; pi++) {
    const { canvas, ctx } = createPageCanvas();
    let cy = 90;

    // thin brand top line
    ctx.fillStyle = branding.primaryColor || '#0088CC';
    ctx.fillRect(0, 0, PAGE_W, 8);

    for (const block of pages[pi]) {
      if (block.type === 'spacer') {
        cy += block.h;
        continue;
      }
      if (block.type === 'line') {
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(MARGIN, cy);
        ctx.lineTo(PAGE_W - MARGIN, cy);
        ctx.stroke();
        cy += 20;
        continue;
      }
      if (block.type === 'salaryBox') {
        ctx.fillStyle = '#F0F9FF';
        ctx.strokeStyle = branding.primaryColor || '#0088CC';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(MARGIN, cy, CONTENT_W, 100, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 20px Heebo, Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('סעיף התמורה — שכר חודשי ברוטו (סעיף 6.1)', PAGE_W - MARGIN - 16, cy + 36);
        ctx.font = 'bold 28px Heebo, Arial, sans-serif';
        ctx.fillStyle = branding.primaryColor || '#0066A1';
        ctx.fillText(`₪${agreement.monthlySalary.toLocaleString()}`, PAGE_W - MARGIN - 16, cy + 72);
        if (agreement.bonusDetails) {
          ctx.font = '15px Heebo, Arial, sans-serif';
          ctx.fillStyle = '#334155';
          const bonusLines = wrapText(ctx, agreement.bonusDetails, CONTENT_W - 40);
          ctx.fillText(bonusLines[0], PAGE_W - MARGIN - 16, cy + 92);
        }
        cy += 120;
        continue;
      }
      if (block.type === 'signatures') {
        const colW = (CONTENT_W - 40) / 2;
        ctx.strokeStyle = '#94A3B8';
        ctx.beginPath();
        ctx.moveTo(MARGIN + 20, cy + 80);
        ctx.lineTo(MARGIN + colW - 20, cy + 80);
        ctx.moveTo(PAGE_W - MARGIN - colW + 20, cy + 80);
        ctx.lineTo(PAGE_W - MARGIN - 20, cy + 80);
        ctx.stroke();

        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 18px Heebo, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`המועדון (${clubName})`, MARGIN + colW / 2, cy + 110);
        ctx.fillText('השחקן', PAGE_W - MARGIN - colW / 2, cy + 110);

        if (agreement.signature?.signatureImageBase64) {
          try {
            const img = new Image();
            img.src = agreement.signature.signatureImageBase64;
            ctx.drawImage(img, PAGE_W - MARGIN - colW + 40, cy, colW - 80, 70);
          } catch {
            /* ignore */
          }
        } else if (agreement.signature) {
          ctx.font = 'italic bold 22px Heebo, Arial, sans-serif';
          ctx.fillText(agreement.signature.signedBy, PAGE_W - MARGIN - colW / 2, cy + 50);
        }

        ctx.textAlign = 'right';
        cy += 160;
        continue;
      }
      if (block.type === 'blockchain' && agreement.blockchain) {
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.roundRect(MARGIN, cy, CONTENT_W, 120, 8);
        ctx.fill();
        ctx.fillStyle = '#34D399';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('BLOCKCHAIN ATTESTATION', MARGIN + 20, cy + 30);
        ctx.fillStyle = '#E2E8F0';
        ctx.font = '14px monospace';
        ctx.fillText(`Block: ${agreement.blockchain.blockNumber}`, MARGIN + 20, cy + 55);
        ctx.fillText(`Tx: ${agreement.blockchain.txHash.slice(0, 42)}…`, MARGIN + 20, cy + 78);
        ctx.fillText(`Hash: ${agreement.fileHash.slice(0, 42)}…`, MARGIN + 20, cy + 101);
        ctx.textAlign = 'right';
        cy += 140;
        continue;
      }

      let font = '18px Heebo, Arial, sans-serif';
      let color = '#1E293B';
      let lh = lineHeight;
      let align: CanvasTextAlign = 'right';

      if (block.type === 'title') {
        font = 'bold 34px Heebo, Arial, sans-serif';
        color = '#0F172A';
        lh = 40;
        align = 'center';
      } else if (block.type === 'subtitle') {
        font = '16px Heebo, Arial, sans-serif';
        color = '#475569';
        align = 'center';
      } else if (block.type === 'center') {
        font = '18px Heebo, Arial, sans-serif';
        align = 'center';
      } else if (block.type === 'bold' || block.type === 'clauseTitle') {
        font = 'bold 18px Heebo, Arial, sans-serif';
        color = '#0F172A';
      }

      ctx.font = font;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      const lines = wrapText(ctx, 'text' in block ? block.text : '', CONTENT_W);
      for (const line of lines) {
        if (align === 'center') {
          ctx.fillText(line, PAGE_W / 2, cy);
        } else {
          ctx.fillText(line, PAGE_W - MARGIN, cy);
        }
        cy += lh;
      }
      cy += 4;
      ctx.textAlign = 'right';
    }

    drawFooter(ctx, pi + 1, totalPages, agreement.docNumber, clubName);

    const dataUrl = canvas.toDataURL('image/png');
    const pngImageBytes = await fetch(dataUrl).then(res => res.arrayBuffer());
    const pngImage = await pdfDoc.embedPng(pngImageBytes);
    const page = pdfDoc.addPage([595.28, 841.89]);
    page.drawImage(pngImage, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }

  return await pdfDoc.save();
}

export function downloadPdfFile(pdfBytes: Uint8Array, fileName: string) {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
