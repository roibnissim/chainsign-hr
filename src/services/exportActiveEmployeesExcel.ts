import type { Employee } from '../types';
import { isEmployeeActive } from '../types';

function escapeXml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cell(value: string): string {
  return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function displayOrEmpty(value?: string | null): string {
  const v = String(value ?? '').trim();
  if (!v || v === 'טרם הוזן' || v.endsWith('@pending.local')) return '';
  return v;
}

const HEADERS = [
  'מזהה עובד',
  'שם מלא',
  'תעודת זהות',
  'כתובת',
  'טלפון',
  'דוא״ל',
  'תפקיד',
  'מחלקה',
  'תחילת העסקה',
  'בנק',
  'סניף',
  'מספר חשבון',
  'בעל החשבון',
  'תמונת עובד',
  'צילום תעודת זהות',
] as const;

function employeeToRow(emp: Employee): string[] {
  return [
    emp.id,
    displayOrEmpty(emp.name),
    displayOrEmpty(emp.idNumber),
    displayOrEmpty(emp.address),
    displayOrEmpty(emp.phone),
    displayOrEmpty(emp.email),
    displayOrEmpty(emp.role),
    displayOrEmpty(emp.department),
    emp.startDate
      ? new Date(emp.startDate).toLocaleDateString('he-IL')
      : '',
    displayOrEmpty(emp.bankAccount?.bankName),
    displayOrEmpty(emp.bankAccount?.branchNumber),
    displayOrEmpty(emp.bankAccount?.accountNumber),
    displayOrEmpty(emp.bankAccount?.accountHolderName),
    emp.avatarUrl ? 'כן' : 'לא',
    emp.idCardPhotoUrl ? 'כן' : 'לא',
  ];
}

function buildSpreadsheetXml(rows: string[][]): string {
  const headerXml = `<Row>${HEADERS.map((h) => cell(h)).join('')}</Row>`;
  const bodyXml = rows
    .map((row) => `<Row>${row.map((c) => cell(c)).join('')}</Row>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="עובדים פעילים">
  <Table>
${headerXml}
${bodyXml}
  </Table>
 </Worksheet>
</Workbook>`;
}

/** מייצא את נתוני כרטיסיית «פרטים» לכל העובדים הפעילים לקובץ אקסל */
export function exportActiveEmployeesToExcel(employees: Employee[]): {
  exportedCount: number;
} {
  const active = employees.filter((e) => isEmployeeActive(e));
  const rows = active.map(employeeToRow);
  const xml = buildSpreadsheetXml(rows);
  const blob = new Blob([xml], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `עובדים-פעילים-${stamp}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { exportedCount: active.length };
}
