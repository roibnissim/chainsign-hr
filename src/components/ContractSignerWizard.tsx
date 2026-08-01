import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  SalaryAgreement,
  Employee,
  RoleType,
  AgreementTemplate,
  TemplateField,
  FieldSignature,
  TEMPLATE_FIELD_KIND_LABELS,
} from '../types';
import {
  UserCheck,
  DollarSign,
  PenTool,
  CheckCircle2,
  Eraser,
  ArrowRight,
  ArrowLeft,
  Layers,
  Keyboard,
  Eye,
  FileText,
  Copy,
  MessageCircle,
  Link2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { PageBanner, fieldClass, fieldClassXs } from './ui/PageBanner';
import { getTemplatePdf, saveAgreementPdf, getAgreementPdf } from '../services/templatePdfStorage';
import {
  buildEmployeeFieldValues,
  buildAgreementDateFieldValues,
  fillTemplatePdf,
} from '../services/fillTemplatePdf';
import { salaryAmountInWords } from '../services/hebrewAmountInWords';
import { calculateSHA256, anchorAgreementToBlockchain } from '../services/blockchain';
import {
  createSigningInvite,
  buildSigningWhatsAppUrl,
} from '../services/signingInvite';

interface ContractSignerWizardProps {
  employees: Employee[];
  roles: RoleType[];
  templates?: AgreementTemplate[];
  initialTemplate?: AgreementTemplate | null;
  pendingAgreementToSign?: SalaryAgreement | null;
  onAgreementCreatedOrSigned: (agreement: SalaryAgreement) => void;
  onCancel: () => void;
}

type WizardStep = 1 | 2 | 3 | 4 | 5;

function typedSignatureToDataUrl(text: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 140;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'italic 42px "Segoe Script", "Comic Sans MS", cursive';
  ctx.fillText(text || 'חתימה', canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL('image/png');
}

export const ContractSignerWizard: React.FC<ContractSignerWizardProps> = ({
  employees,
  roles,
  templates = [],
  initialTemplate,
  pendingAgreementToSign,
  onAgreementCreatedOrSigned,
  onCancel,
}) => {
  const pdfTemplates = templates.filter((t) => t.sourceFileName);

  const employeeAlreadySigned = Boolean(
    pendingAgreementToSign?.employeeSignedAt ||
      pendingAgreementToSign?.fieldSignatures?.some((fs) => fs.signerRole === 'employee')
  );

  const [step, setStep] = useState<WizardStep>(() => {
    if (pendingAgreementToSign) return 4;
    return 1;
  });
  /** שלב 4: שליחת קישור לעובד / חתימת מועדון / המתנה */
  const [step4Mode, setStep4Mode] = useState<'sendLink' | 'clubSign' | 'waiting'>(() => {
    if (pendingAgreementToSign && employeeAlreadySigned) return 'clubSign';
    if (pendingAgreementToSign && pendingAgreementToSign.status === 'PENDING_SIGNATURE') {
      return 'sendLink';
    }
    return 'sendLink';
  });
  const [signLink, setSignLink] = useState<string | null>(null);
  const [signLinkBusy, setSignLinkBusy] = useState(false);
  const [pendingAgreementId, setPendingAgreementId] = useState<string | null>(
    pendingAgreementToSign?.id || null
  );
  const [sharePhone, setSharePhone] = useState(
    () =>
      employees.find((e) => e.id === pendingAgreementToSign?.employeeId)?.phone ||
      employees[0]?.phone ||
      ''
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    initialTemplate?.id || pendingAgreementToSign?.templateId || pdfTemplates[0]?.id || ''
  );
  const selectedTemplate = useMemo(
    () =>
      pdfTemplates.find((t) => t.id === selectedTemplateId) ||
      templates.find((t) => t.id === selectedTemplateId) ||
      null,
    [pdfTemplates, templates, selectedTemplateId]
  );

  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    pendingAgreementToSign?.employeeId || employees[0]?.id || ''
  );
  const [selectedRole, setSelectedRole] = useState<RoleType>(
    pendingAgreementToSign?.role ||
      initialTemplate?.recommendedRole ||
      roles[0] ||
      'שחקן/ית כדורמים'
  );
  const [title, setTitle] = useState(
    pendingAgreementToSign?.title || initialTemplate?.name || 'הסכם העסקה'
  );
  const [effectiveDate, setEffectiveDate] = useState(
    pendingAgreementToSign?.effectiveDate || ''
  );
  const [endDate, setEndDate] = useState(pendingAgreementToSign?.endDate || '');
  const [tagsInput, setTagsInput] = useState(
    pendingAgreementToSign?.tags?.join(', ') || 'הסכם שכר, חתימה דיגיטלית'
  );
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    pendingAgreementToSign?.fieldValues || {}
  );

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const filledPdfRef = useRef<Uint8Array | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const revokePreviewUrl = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  };

  useEffect(() => {
    return () => {
      previewAbortRef.current?.abort();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  // Signature state — walk signature fields one role-group at a time
  const signatureFields = useMemo(
    () =>
      (selectedTemplate?.fields || [])
        .filter((f) => f.kind === 'signature')
        .sort((a, b) => a.pageIndex - b.pageIndex || a.y - b.y),
    [selectedTemplate]
  );

  const employeeSigFields = signatureFields.filter((f) => f.signerRole !== 'club');
  const clubSigFields = signatureFields.filter((f) => f.signerRole === 'club');

  const [, setSigPhase] = useState<'employee' | 'club' | 'done'>(() =>
    employeeAlreadySigned || !employeeSigFields.length ? 'club' : 'employee'
  );
  const [applyToAllSameRole, setApplyToAllSameRole] = useState(true);
  const [currentSigIndex, setCurrentSigIndex] = useState(0);
  const [collectedSignatures, setCollectedSignatures] = useState<Record<string, string>>(
    {}
  );

  const [signatureType, setSignatureType] = useState<'draw' | 'type'>('draw');
  const [typedSignature, setTypedSignature] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerIdNumber, setSignerIdNumber] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId) || null;

  const fillableFields = useMemo(
    () =>
      (selectedTemplate?.fields || []).filter(
        (f) => f.kind === 'salary' || f.kind === 'text'
      ),
    [selectedTemplate]
  );

  const employeeAutoFields = useMemo(
    () =>
      (selectedTemplate?.fields || []).filter((f) =>
        ['employee_name', 'id_number', 'phone', 'address', 'email'].includes(f.kind)
      ),
    [selectedTemplate]
  );

  const dateAutoFields = useMemo(
    () =>
      (selectedTemplate?.fields || []).filter((f) =>
        ['date_day', 'date_month', 'date_year'].includes(f.kind)
      ),
    [selectedTemplate]
  );

  useEffect(() => {
    if (initialTemplate) {
      setSelectedTemplateId(initialTemplate.id);
      setTitle(initialTemplate.name);
      setSelectedRole(initialTemplate.recommendedRole);
    }
  }, [initialTemplate]);

  useEffect(() => {
    if (!pendingAgreementToSign || !selectedTemplate) return;
    if (employeeAlreadySigned && clubSigFields.length > 0) {
      setSigPhase('club');
      setStep4Mode('clubSign');
      setCurrentSigIndex(0);
      setSignerName('נציג המועדון');
    } else if (clubSigFields.length > 0 && employeeSigFields.length === 0) {
      setSigPhase('club');
      setStep4Mode('clubSign');
    }
  }, [pendingAgreementToSign?.id, selectedTemplate?.id, employeeAlreadySigned]);

  useEffect(() => {
    if (!pendingAgreementToSign) return;
    if (pendingAgreementToSign.effectiveDate) {
      setEffectiveDate(pendingAgreementToSign.effectiveDate);
    }
    if (pendingAgreementToSign.endDate) {
      setEndDate(pendingAgreementToSign.endDate);
    }
  }, [pendingAgreementToSign?.id]);

  useEffect(() => {
    const emp = selectedEmployee;
    if (!emp) return;
    if (step4Mode !== 'clubSign') {
      setSignerName(emp.name);
      setSignerIdNumber(emp.idNumber);
      setSignerEmail(emp.email);
    }
    if (!pendingAgreementToSign) setSelectedRole(emp.role);
    setSharePhone((prev) => prev || emp.phone || '');
    if (selectedTemplate && !pendingAgreementToSign) {
      setFieldValues((prev) => ({
        ...buildEmployeeFieldValues(selectedTemplate, emp),
        ...buildAgreementDateFieldValues(selectedTemplate, effectiveDate),
        ...Object.fromEntries(
          Object.entries(prev).filter(([id]) => {
            const field = selectedTemplate.fields.find((f) => f.id === id);
            return field && (field.kind === 'salary' || field.kind === 'text');
          })
        ),
      }));
    }
  }, [selectedEmployeeId, selectedTemplate?.id, employees, pendingAgreementToSign, effectiveDate, step4Mode]);

  // פתיחה מחדש של הסכם ממתין — חידוש/שחזור קישור חתימה
  useEffect(() => {
    if (step !== 4 || step4Mode === 'clubSign' || signLink || !selectedEmployee) return;
    const agreementId = pendingAgreementId || pendingAgreementToSign?.id;
    if (!agreementId || employeeAlreadySigned) return;
    let cancelled = false;
    (async () => {
      try {
        const invite = await createSigningInvite({
          agreementId,
          employeeId: selectedEmployee.id,
          employeeName: selectedEmployee.name,
          phone: sharePhone || selectedEmployee.phone,
          docNumber: pendingAgreementToSign?.docNumber || title,
          title,
        });
        if (!cancelled) {
          setSignLink(`${window.location.origin}${invite.signPath}`);
        }
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, step4Mode, pendingAgreementId, pendingAgreementToSign?.id, selectedEmployee?.id]);

  useEffect(() => {
    if (selectedTemplate) {
      setTitle(selectedTemplate.name);
      setSelectedRole(selectedTemplate.recommendedRole);
    }
  }, [selectedTemplateId]);

  const activeSigList = clubSigFields;
  const activeSigField: TemplateField | null = activeSigList[currentSigIndex] || null;

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasDrawnSignature(false);
      }
    }
  };

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0F172A';
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
    setHasDrawnSignature(true);
  };

  const stopDrawing = () => setIsDrawing(false);

  const captureSignatureImage = (): string | null => {
    if (signatureType === 'draw' && canvasRef.current && hasDrawnSignature) {
      return canvasRef.current.toDataURL('image/png');
    }
    if (signatureType === 'type' && typedSignature.trim()) {
      return typedSignatureToDataUrl(typedSignature.trim());
    }
    return null;
  };

  const goToPreview = async () => {
    if (!selectedTemplate) {
      alert('נא לבחור פורמט PDF');
      return;
    }
    previewAbortRef.current?.abort();
    const abort = new AbortController();
    previewAbortRef.current = abort;

    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewReady(false);
    filledPdfRef.current = null;
    revokePreviewUrl();
    setStep(3);

    try {
      const source = await getTemplatePdf(selectedTemplate.id);
      if (abort.signal.aborted) return;
      if (!source) {
        setPreviewError('קובץ ה-PDF של הפורמט לא נמצא. ערוך את הפורמט והעלה מחדש.');
        setPreviewReady(false);
        return;
      }

      // מניעת חסימת UI בזמן מילוי שדות רבים
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      const filled = await fillTemplatePdf({
        template: selectedTemplate,
        sourcePdfBytes: source,
        employee: selectedEmployee,
        fieldValues: {
          ...fieldValues,
          ...buildAgreementDateFieldValues(selectedTemplate, effectiveDate),
        },
        agreementDate: effectiveDate,
      });
      if (abort.signal.aborted) return;

      const filledCopy = new Uint8Array(filled.byteLength);
      filledCopy.set(filled);
      filledPdfRef.current = filledCopy;
      setPreviewReady(true);

      // תצוגה מקדימה מיידית דרך צופה ה-PDF של הדפדפן (בלי רינדור עמוד-עמוד)
      const blob = new Blob([filledCopy], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error(err);
      if (filledPdfRef.current) {
        setPreviewError('התצוגה המקדימה נכשלה, אך ניתן להמשיך לחתימה.');
      } else {
        setPreviewError('שגיאה בהכנת המסמך הממולא. חזרו לשלב הקודם ונסו שוב.');
        setPreviewReady(false);
      }
    } finally {
      if (!abort.signal.aborted) setPreviewLoading(false);
    }
  };

  const validateContractDates = (): boolean => {
    const start = effectiveDate || pendingAgreementToSign?.effectiveDate || '';
    const end = endDate || pendingAgreementToSign?.endDate || '';
    if (!start || !end) {
      alert('נא למלא תאריך התחלת החוזה ותאריך סיום החוזה');
      return false;
    }
    if (end < start) {
      alert('תאריך הסיום חייב להיות שווה או מאוחר לתאריך ההתחלה');
      return false;
    }
    return true;
  };

  const startSigning = async () => {
    if (!previewReady && !filledPdfRef.current) {
      alert('המסמך עדיין לא מוכן. המתינו לסיום ההכנה או חזרו אחורה ונסו שוב.');
      return;
    }
    if (!selectedTemplate || !selectedEmployee) {
      alert('חסר פורמט או עובד');
      return;
    }
    if (!validateContractDates()) return;
    previewAbortRef.current?.abort();

    // אין שדות חתימת עובד — מעבר ישיר לחתימת מועדון / סיום
    if (employeeSigFields.length === 0) {
      setCollectedSignatures({});
      setCurrentSigIndex(0);
      clearCanvas();
      if (clubSigFields.length > 0) {
        setSigPhase('club');
        setStep4Mode('clubSign');
        setSignerName('נציג המועדון');
        setStep(4);
      } else {
        void finalizeAgreement({});
      }
      return;
    }

    setSignLinkBusy(true);
    try {
      const filled = filledPdfRef.current;
      if (!filled) throw new Error('missing_filled_pdf');

      const dateValues = buildAgreementDateFieldValues(selectedTemplate, effectiveDate);
      const mergedFieldValues = { ...fieldValues, ...dateValues };
      const fileHash = await calculateSHA256(filled);
      const agreementId = pendingAgreementId || pendingAgreementToSign?.id || `doc-${Date.now()}`;
      const docNumber =
        pendingAgreementToSign?.docNumber ||
        `SAL-2026-${Math.floor(100 + Math.random() * 900)}`;

      await saveAgreementPdf(agreementId, filled);

      const firstSalary = selectedTemplate.fields.find((f) => f.kind === 'salary');
      const monthlySalary = firstSalary
        ? Number(String(fieldValues[firstSalary.id] || '').replace(/[^\d.]/g, '')) || 0
        : 0;

      const pendingAgreement: SalaryAgreement = {
        id: agreementId,
        docNumber,
        title,
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.name,
        role: selectedRole,
        department: selectedEmployee.department,
        monthlySalary,
        bonusDetails: fillableFields
          .filter((f) => f.kind === 'text')
          .map((f) => `${f.label}: ${fieldValues[f.id] || ''}`)
          .filter((s) => !s.endsWith(': '))
          .join(' | '),
        effectiveDate,
        endDate: endDate || pendingAgreementToSign?.endDate || '',
        createdAt: pendingAgreementToSign?.createdAt || new Date().toISOString(),
        status: 'PENDING_SIGNATURE',
        fileHash,
        templateId: selectedTemplate.id,
        fieldValues: mergedFieldValues,
        fieldSignatures: pendingAgreementToSign?.fieldSignatures,
        tags: tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        version: (pendingAgreementToSign?.version || 0) + 1,
      };

      setPendingAgreementId(agreementId);
      onAgreementCreatedOrSigned(pendingAgreement);

      const invite = await createSigningInvite({
        agreementId,
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.name,
        phone: sharePhone || selectedEmployee.phone,
        docNumber,
        title,
      });
      const absolute = `${window.location.origin}${invite.signPath}`;
      setSignLink(absolute);
      setSharePhone(sharePhone || selectedEmployee.phone || '');
      setStep4Mode('sendLink');
      setStep(4);
    } catch (err) {
      console.error(err);
      alert('יצירת הסכם ממתין לחתימה נכשלה. ודא שהשרת רץ ושיש טלפון לעובד.');
    } finally {
      setSignLinkBusy(false);
    }
  };

  const acceptCurrentSignature = async () => {
    const img = captureSignatureImage();
    if (!img) {
      alert('נא לחתום (ציור או הקלדה) לפני המשך');
      return;
    }

    const nextCollected = { ...collectedSignatures };

    if (applyToAllSameRole) {
      for (const f of activeSigList) {
        nextCollected[f.id] = img;
      }
      setCollectedSignatures(nextCollected);
      clearCanvas();
      setTypedSignature('');
      setHasDrawnSignature(false);
      await finalizeAgreement(nextCollected);
      return;
    }

    if (!activeSigField) return;
    nextCollected[activeSigField.id] = img;
    setCollectedSignatures(nextCollected);
    clearCanvas();
    setTypedSignature('');
    setHasDrawnSignature(false);

    if (currentSigIndex + 1 < activeSigList.length) {
      setCurrentSigIndex(currentSigIndex + 1);
      return;
    }
    await finalizeAgreement(nextCollected);
  };

  const finalizeAgreement = async (signatureImages: Record<string, string>) => {
    if (!selectedTemplate || !selectedEmployee) {
      alert('חסר פורמט או עובד');
      return;
    }
    if (!validateContractDates()) return;
    setCommitting(true);
    setStep(5);
    try {
      const dateValues = buildAgreementDateFieldValues(selectedTemplate, effectiveDate);
      const mergedFieldValues = {
        ...(pendingAgreementToSign?.fieldValues || fieldValues),
        ...dateValues,
      };

      const agreementId =
        pendingAgreementId || pendingAgreementToSign?.id || `doc-${Date.now()}`;

      // PDF שכבר כולל מילוי + חתימת עובד (אם קיים) — מוסיפים רק חתימות מועדון
      const existingSigned = await getAgreementPdf(agreementId);
      const templateBytes = existingSigned || (await getTemplatePdf(selectedTemplate.id));
      if (!templateBytes) throw new Error('PDF missing');

      const clubOnlyTemplate: AgreementTemplate = {
        ...selectedTemplate,
        fields: selectedTemplate.fields.filter((f) => f.kind === 'signature' && f.signerRole === 'club'),
      };

      const filledBytes = await fillTemplatePdf({
        template: existingSigned ? clubOnlyTemplate : selectedTemplate,
        sourcePdfBytes: templateBytes,
        employee: selectedEmployee,
        fieldValues: existingSigned ? {} : mergedFieldValues,
        agreementDate: effectiveDate,
        signatureImages,
      });

      const fileHash = await calculateSHA256(filledBytes);
      const signatureDate = new Date().toISOString();
      const docNumber =
        pendingAgreementToSign?.docNumber ||
        `SAL-2026-${Math.floor(100 + Math.random() * 900)}`;

      const signatureHash = await calculateSHA256(
        `${signerName}:${signatureDate}:${fileHash}`
      );

      const clubFieldSignatures: FieldSignature[] = Object.entries(signatureImages).map(
        ([fieldId, signatureImageBase64]) => ({
          fieldId,
          signerRole: 'club' as const,
          signature: {
            signedBy: 'נציג המועדון',
            signerEmail: '',
            signerIdNumber: '',
            signatureDate,
            signatureImageBase64,
            signatureType,
            ipAddress: '82.102.141.90',
            deviceInfo: 'Verified Mobile/Desktop Web Client',
            signatureHash,
          },
        })
      );

      const priorEmployeeSigs = (pendingAgreementToSign?.fieldSignatures || []).filter(
        (fs) => fs.signerRole === 'employee'
      );

      const firstSalary = selectedTemplate.fields.find((f) => f.kind === 'salary');
      const monthlySalary = firstSalary
        ? Number(
            String(
              (pendingAgreementToSign?.fieldValues || fieldValues)[firstSalary.id] || ''
            ).replace(/[^\d.]/g, '')
          ) || 0
        : 0;

      await saveAgreementPdf(agreementId, filledBytes);

      const newAgreement: SalaryAgreement = {
        id: agreementId,
        docNumber,
        title,
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.name,
        role: selectedRole,
        department: selectedEmployee.department,
        monthlySalary,
        effectiveDate: effectiveDate || pendingAgreementToSign?.effectiveDate || '',
        endDate: endDate || pendingAgreementToSign?.endDate || '',
        createdAt: pendingAgreementToSign?.createdAt || new Date().toISOString(),
        status: 'SIGNED',
        fileHash,
        templateId: selectedTemplate.id,
        fieldValues: mergedFieldValues,
        fieldSignatures: [...priorEmployeeSigs, ...clubFieldSignatures],
        employeeSignedAt: pendingAgreementToSign?.employeeSignedAt,
        disclosureAcceptedAt: pendingAgreementToSign?.disclosureAcceptedAt,
        tags: tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        version: (pendingAgreementToSign?.version || 0) + 1,
        signature: {
          signedBy: selectedEmployee.name,
          signerEmail: selectedEmployee.email,
          signerIdNumber: selectedEmployee.idNumber,
          signatureDate,
          signatureType,
          ipAddress: '82.102.141.90',
          deviceInfo: 'Verified Mobile/Desktop Web Client',
          signatureHash,
        },
      };

      newAgreement.blockchain = await anchorAgreementToBlockchain(newAgreement);

      try {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      } catch {
        // ignore
      }

      onAgreementCreatedOrSigned(newAgreement);
    } catch (err) {
      console.error(err);
      alert('שגיאה בשמירת ההסכם החתום');
      setStep(4);
    } finally {
      setCommitting(false);
    }
  };

  const datesValid =
    Boolean(effectiveDate && endDate) && endDate >= effectiveDate;
  const canProceedStep1 = Boolean(selectedTemplateId && selectedEmployeeId && datesValid);
  const missingSalary = fillableFields.some(
    (f) => f.kind === 'salary' && !String(fieldValues[f.id] || '').trim()
  );

  return (
    <div className="max-w-4xl mx-auto my-6 space-y-4">
      <PageBanner
        icon={PenTool}
        title={
          pendingAgreementToSign
            ? `חתימה על הסכם: ${pendingAgreementToSign.docNumber}`
            : 'מילוי והחתמת הסכם מפורמט PDF'
        }
        subtitle="בחירת פורמט מעורך הדין → השלמת שדות → חתימה בכל המיקומים (כולל נספחים)"
        action={
          <button
            onClick={onCancel}
            className="text-xs text-white/80 hover:text-white px-3 py-1.5 rounded-xl border border-white/30 hover:bg-white/10 transition-colors shrink-0"
          >
            ביטול
          </button>
        }
      />

      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden">
        <div className="px-6 sm:px-8 pt-5">
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all ${step >= s ? '' : 'bg-slate-200'}`}
                style={step >= s ? { backgroundColor: 'var(--brand)' } : undefined}
              />
            ))}
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {step === 1 && (
            <div className="space-y-5">
              <h3 className="font-bold text-slate-900 text-base flex items-center border-b border-slate-100 pb-2">
                <UserCheck className="w-5 h-5 ml-2 text-[var(--brand)]" />
                שלב 1: פורמט PDF ועובד
              </h3>

              {pdfTemplates.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900 font-medium">
                  אין פורמטי PDF במערכת. עבור ללשונית הפורמטים והעלה הסכם מעורך הדין.
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center">
                    <Layers className="w-4 h-4 ml-1.5 text-[var(--brand)]" />
                    פורמט PDF
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className={fieldClass}
                  >
                    {pdfTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.pageCount} עמ׳ · {t.fields.length} שדות)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">עובד</label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className={fieldClass}
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {e.idNumber} · {e.role}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">כותרת מסמך</label>
                  <input
                    className={fieldClass}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">תפקיד בתיוג</label>
                  <select
                    className={fieldClass}
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as RoleType)}
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700">תגיות</label>
                  <input
                    className={fieldClass}
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-2xl border-2 border-[var(--brand)]/25 bg-[var(--brand-light)]/60 p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">תקופת החוזה (חובה)</h4>
                  <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                    הזן תאריך התחלה ותאריך סיום בנפרד. תאריך ההתחלה יכול להיות מאוחר ממועד
                    החתימה — למשל חתימה היום והעסקה שמתחילה בעוד חודשים.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800">
                      תאריך התחלת החוזה
                    </label>
                    <input
                      type="date"
                      className={fieldClass}
                      value={effectiveDate}
                      onChange={(e) => setEffectiveDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800">
                      תאריך סיום החוזה
                    </label>
                    <input
                      type="date"
                      className={fieldClass}
                      value={endDate}
                      min={effectiveDate || undefined}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                    />
                  </div>
                </div>
                {(!effectiveDate || !endDate) && (
                  <p className="text-[11px] font-bold text-amber-800">
                    יש למלא את שני התאריכים לפני המשך החתימה.
                  </p>
                )}
                {effectiveDate && endDate && endDate < effectiveDate && (
                  <p className="text-[11px] font-bold text-rose-700">
                    תאריך הסיום חייב להיות באותו יום או אחרי תאריך ההתחלה.
                  </p>
                )}
              </div>

              {selectedTemplate && employeeAutoFields.length > 0 && selectedEmployee && (
                <div className="bg-[var(--brand-light)] rounded-2xl p-4 border border-slate-200 text-xs space-y-1">
                  <p className="font-bold text-slate-800 mb-2">יושלם אוטומטית מכרטיס העובד:</p>
                  {employeeAutoFields.map((f) => (
                    <div key={f.id} className="flex justify-between gap-2">
                      <span className="text-slate-500">{f.label}</span>
                      <span className="font-semibold text-slate-800 truncate">
                        {fieldValues[f.id] || '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {selectedTemplate && dateAutoFields.length > 0 && (
                <div className="bg-sky-50 rounded-2xl p-4 border border-sky-100 text-xs space-y-1">
                  <p className="font-bold text-slate-800 mb-2">
                    יושלם אוטומטית מתאריך התחלת החוזה (ביום / לחודש / שנת):
                  </p>
                  {dateAutoFields.map((f) => (
                    <div key={f.id} className="flex justify-between gap-2">
                      <span className="text-slate-500">{f.label}</span>
                      <span className="font-semibold text-slate-800 truncate">
                        {fieldValues[f.id] || '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={!canProceedStep1}
                  onClick={() => setStep(2)}
                  className="px-5 py-2.5 text-white font-bold rounded-xl text-sm disabled:opacity-40 flex items-center"
                  style={{ backgroundColor: 'var(--brand)' }}
                >
                  המשך למילוי שדות
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h3 className="font-bold text-slate-900 text-base flex items-center border-b border-slate-100 pb-2">
                <DollarSign className="w-5 h-5 ml-2 text-[var(--brand)]" />
                שלב 2: השלמת סכומי שכר ושדות נוספים
              </h3>

              {fillableFields.length === 0 ? (
                <p className="text-sm text-slate-600">
                  בפורמט זה לא סומנו שדות שכר/טקסט. ניתן להמשיך לתצוגה מקדימה וחתימה.
                </p>
              ) : (
                <div className="space-y-3">
                  {fillableFields.map((f) => {
                    const linkedWords = (selectedTemplate?.fields || []).filter(
                      (w) => w.kind === 'salary_words' && w.linkedSalaryFieldId === f.id
                    );
                    const wordsPreview =
                      f.kind === 'salary' && fieldValues[f.id]
                        ? salaryAmountInWords(fieldValues[f.id])
                        : '';
                    return (
                      <label key={f.id} className="block space-y-1.5">
                        <span className="text-xs font-bold text-slate-700">
                          {f.label}
                          <span className="text-slate-400 font-medium mr-1">
                            ({TEMPLATE_FIELD_KIND_LABELS[f.kind]} · עמ׳ {f.pageIndex + 1})
                          </span>
                        </span>
                        <input
                          className={fieldClass}
                          value={fieldValues[f.id] || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setFieldValues((prev) => {
                              const next = { ...prev, [f.id]: value };
                              if (f.kind === 'salary' && selectedTemplate) {
                                const words = salaryAmountInWords(value);
                                for (const w of selectedTemplate.fields) {
                                  if (
                                    w.kind === 'salary_words' &&
                                    (w.linkedSalaryFieldId === f.id ||
                                      (!w.linkedSalaryFieldId &&
                                        selectedTemplate.fields.find((x) => x.kind === 'salary')
                                          ?.id === f.id))
                                  ) {
                                    next[w.id] = words;
                                  }
                                }
                              }
                              return next;
                            });
                          }}
                          placeholder={f.kind === 'salary' ? 'למשל 1200' : 'הזן ערך'}
                          inputMode={f.kind === 'salary' ? 'decimal' : 'text'}
                        />
                        {f.kind === 'salary' && wordsPreview && (
                          <p className="text-[11px] text-slate-500 font-medium">
                            במילים: <span className="text-slate-800 font-bold">{wordsPreview}</span>
                            {linkedWords.length > 0 && (
                              <span className="text-slate-400">
                                {' '}
                                · יוזן אוטומטית ל־{linkedWords.length} שדה/ות במסמך
                              </span>
                            )}
                          </p>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs flex items-center"
                >
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                  חזרה
                </button>
                <button
                  type="button"
                  disabled={missingSalary}
                  onClick={() => void goToPreview()}
                  className="px-5 py-2.5 text-white font-bold rounded-xl text-sm disabled:opacity-40 flex items-center"
                  style={{ backgroundColor: 'var(--brand)' }}
                >
                  תצוגה מקדימה
                  <Eye className="w-4 h-4 mr-1.5" />
                </button>
              </div>
              {missingSalary && (
                <p className="text-xs text-rose-600 font-bold">נא למלא את כל סכומי השכר</p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h3 className="font-bold text-slate-900 text-base flex items-center border-b border-slate-100 pb-2">
                <FileText className="w-5 h-5 ml-2 text-[var(--brand)]" />
                שלב 3: תצוגה מקדימה של המסמך הממולא
              </h3>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs flex flex-wrap gap-x-6 gap-y-1">
                <span>
                  <span className="text-slate-500">התחלת חוזה: </span>
                  <strong className="text-slate-900">{effectiveDate || '—'}</strong>
                </span>
                <span>
                  <span className="text-slate-500">סיום חוזה: </span>
                  <strong className="text-slate-900">{endDate || '—'}</strong>
                </span>
              </div>
              {previewError && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">
                  {previewError}
                </div>
              )}
              {previewLoading && !previewUrl ? (
                <p className="text-sm text-slate-500 py-10 text-center">ממלא שדות ומכין מסמך...</p>
              ) : previewUrl ? (
                <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-100">
                  <iframe
                    title="תצוגה מקדימה של ההסכם"
                    src={previewUrl}
                    className="w-full h-[55vh] bg-white"
                  />
                </div>
              ) : !previewLoading ? (
                <p className="text-sm text-slate-500 py-8 text-center">
                  {previewReady
                    ? 'המסמך מוכן — ניתן להמשיך לחתימה גם ללא תצוגה.'
                    : 'אין תצוגה להצגה.'}
                </p>
              ) : null}
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    previewAbortRef.current?.abort();
                    revokePreviewUrl();
                    setStep(2);
                  }}
                  className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs flex items-center"
                >
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                  חזרה
                </button>
                <button
                  type="button"
                  disabled={!previewReady || signLinkBusy}
                  onClick={() => void startSigning()}
                  className="px-5 py-2.5 text-white font-bold rounded-xl text-sm flex items-center disabled:opacity-40"
                  style={{ backgroundColor: 'var(--brand)' }}
                >
                  {signLinkBusy
                    ? 'יוצר קישור...'
                    : previewReady
                      ? employeeSigFields.length === 0
                        ? 'המשך לחתימת מועדון'
                        : 'שלח לחתימת עובד'
                      : previewLoading
                        ? 'מכין מסמך...'
                        : 'שלח לחתימת עובד'}
                  <Link2 className="w-4 h-4 mr-1.5" />
                </button>
              </div>
            </div>
          )}

          {step === 4 && step4Mode !== 'clubSign' && (
            <div className="space-y-5">
              <h3 className="font-bold text-slate-900 text-base flex items-center border-b border-slate-100 pb-2">
                <MessageCircle className="w-5 h-5 ml-2 text-[var(--brand)]" />
                שלב 4: שליחה לחתימת עובד
              </h3>

              <div className="bg-sky-50 border border-sky-100 rounded-2xl px-4 py-4 text-sm text-sky-950 space-y-2">
                <p className="font-extrabold text-base">ההסכם ממתין לחתימת העובד</p>
                <p className="text-xs font-medium text-sky-800">
                  נשלח קישור חד־פעמי עם אימות OTP. לאחר חתימת העובד תוכלו לפתוח מחדש מהארכיון ולהשלים חתימת מועדון.
                </p>
              </div>

              <label className="block text-xs font-bold text-slate-600 space-y-1">
                טלפון לשליחה (וואטסאפ)
                <input
                  className={fieldClass}
                  value={sharePhone}
                  onChange={(e) => setSharePhone(e.target.value)}
                  placeholder="05xxxxxxxx"
                  dir="ltr"
                />
              </label>

              {signLink ? (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2 text-[11px] font-mono text-slate-600 break-all dir-ltr text-left">
                  {signLink}
                </div>
              ) : (
                <p className="text-xs text-slate-500 font-medium">מכין קישור חתימה...</p>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <a
                  href={
                    signLink && selectedEmployee
                      ? buildSigningWhatsAppUrl(
                          sharePhone || selectedEmployee.phone || '',
                          selectedEmployee.name,
                          signLink,
                          title
                        )
                      : undefined
                  }
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    if (!signLink || !selectedEmployee) {
                      e.preventDefault();
                      return;
                    }
                    setStep4Mode('waiting');
                  }}
                  className={`flex-1 px-4 py-3 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 ${
                    signLink ? '' : 'pointer-events-none opacity-40'
                  }`}
                  style={{ backgroundColor: '#25D366' }}
                >
                  <MessageCircle className="w-4 h-4" />
                  שלח בוואטסאפ
                </a>
                <button
                  type="button"
                  disabled={!signLink}
                  onClick={async () => {
                    if (!signLink) return;
                    try {
                      await navigator.clipboard.writeText(signLink);
                      setStep4Mode('waiting');
                      alert('הקישור הועתק');
                    } catch {
                      alert('העתקה נכשלה — העתיקו ידנית מהשדה למעלה');
                    }
                  }}
                  className="flex-1 px-4 py-3 bg-slate-900 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Copy className="w-4 h-4" />
                  העתק קישור
                </button>
              </div>

              <div className="flex justify-between pt-2">
                {!pendingAgreementToSign && (
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs flex items-center"
                  >
                    <ArrowRight className="w-4 h-4 ml-1.5" />
                    חזרה
                  </button>
                )}
                <button
                  type="button"
                  onClick={onCancel}
                  className="mr-auto px-5 py-2.5 text-white font-bold rounded-xl text-sm"
                  style={{ backgroundColor: 'var(--brand)' }}
                >
                  יציאה מהאשף
                </button>
              </div>
            </div>
          )}

          {step === 4 && step4Mode === 'clubSign' && (
            <div className="space-y-5">
              <h3 className="font-bold text-slate-900 text-base flex items-center border-b border-slate-100 pb-2">
                <PenTool className="w-5 h-5 ml-2 text-[var(--brand)]" />
                שלב 4: חתימת מועדון
                {activeSigField && (
                  <span className="mr-2 text-xs font-bold text-slate-500">
                    — {activeSigField.label}
                    {applyToAllSameRole && activeSigList.length > 1
                      ? ` (+${activeSigList.length - 1} מיקומים נוספים מאותו תפקיד)`
                      : ` (${currentSigIndex + 1}/${activeSigList.length})`}
                  </span>
                )}
              </h3>

              <div className="bg-violet-50 border border-violet-100 rounded-2xl px-4 py-3 text-xs text-violet-900 font-medium">
                העובד כבר חתם — השלימו חתימת נציג המועדון. ההסכם יעבור לסטטוס חתום רק לאחר מכן.
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={applyToAllSameRole}
                  onChange={(e) => setApplyToAllSameRole(e.target.checked)}
                />
                השתמש באותה חתימה לכל מיקומי חתימת המועדון
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  className={fieldClassXs}
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="שם החותם"
                />
                <input
                  className={fieldClassXs}
                  value={signerIdNumber}
                  onChange={(e) => setSignerIdNumber(e.target.value)}
                  placeholder="ת.ז."
                />
                <input
                  className={fieldClassXs}
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  placeholder="אימייל"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSignatureType('draw')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border ${
                    signatureType === 'draw'
                      ? 'bg-[var(--brand)] text-white border-transparent'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  ציור חתימה
                </button>
                <button
                  type="button"
                  onClick={() => setSignatureType('type')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1 ${
                    signatureType === 'type'
                      ? 'bg-[var(--brand)] text-white border-transparent'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  <Keyboard className="w-3.5 h-3.5" />
                  הקלדה
                </button>
              </div>

              {signatureType === 'draw' ? (
                <div className="space-y-2">
                  <canvas
                    ref={canvasRef}
                    width={560}
                    height={160}
                    className="w-full border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 touch-none cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                  <button
                    type="button"
                    onClick={clearCanvas}
                    className="text-xs font-bold text-slate-500 flex items-center gap-1"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    נקה
                  </button>
                </div>
              ) : (
                <input
                  className={fieldClass}
                  value={typedSignature}
                  onChange={(e) => setTypedSignature(e.target.value)}
                  placeholder="הקלד שם לחתימה"
                />
              )}

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  disabled={committing}
                  onClick={() => void acceptCurrentSignature()}
                  className="px-5 py-2.5 text-white font-bold rounded-xl text-sm flex items-center"
                  style={{ backgroundColor: 'var(--brand)' }}
                >
                  <CheckCircle2 className="w-4 h-4 ml-1.5" />
                  {applyToAllSameRole || currentSigIndex + 1 >= activeSigList.length
                    ? 'סיים והטמע בבלוקצ׳יין'
                    : 'אשר חתימה והמשך'}
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="py-16 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <p className="font-extrabold text-slate-900 text-lg">
                {committing ? 'שומר ומעגן בבלוקצ׳יין...' : 'ההסכם נחתם בהצלחה'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
