import React, { useState, useEffect, useRef } from 'react';
import {
  SalaryAgreement, 
  Employee, 
  RoleType, 
  FilterState,
  AgreementTemplate,
  EmployeeFileDocument,
  ManagerActivityEvent,
} from './types';
import { Header, AppTab } from './components/Header';
import { DashboardStats } from './components/DashboardStats';
import { DocumentRepository } from './components/DocumentRepository';
import { ManagerActivityLog } from './components/ManagerActivityLog';
import { PdfViewerModal } from './components/PdfViewerModal';
import { ContractSignerWizard } from './components/ContractSignerWizard';
import { BlockchainVerifier } from './components/BlockchainVerifier';
import { LedgerExplorer } from './components/LedgerExplorer';
import { EmployeeManager } from './components/EmployeeManager';
import { TemplateManager } from './components/TemplateManager';
import { AccountSettings } from './components/AccountSettings';
import { BrandSettings } from './components/BrandSettings';
import { UsersPermissions } from './components/UsersPermissions';
import { ClubLogo } from './components/ClubLogo';
import { EmployeeUploadPortal } from './components/EmployeeUploadPortal';
import { EmployeeOnboardingPortal } from './components/EmployeeOnboardingPortal';
import { EmployeeSigningPortal } from './components/EmployeeSigningPortal';
import { LoginPage } from './components/LoginPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import {
  BrandingSettings,
  applyDocumentBranding,
} from './config/branding';
import {
  dedupeActivityEvents,
  buildAgreementSignedActivityEvent,
} from './config/activityLog';
import {
  archiveActivityEventRemote,
  persistActivityEvent,
  purgeActivityLogCompletely,
} from './services/activityLogStore';
import { deleteEmployeeFileDocument } from './services/deleteEmployeeDocument';
import {
  initialActivityEvents,
  initialAgreements,
  initialBranding,
  initialEmployees,
  initialFileDocuments,
  initialRoles,
  initialTemplates,
  useHrPersistence,
} from './services/hrPersistence';

function ManagerApp() {
  const { user, loading: authLoading } = useAuth();
  const uploadToken = new URLSearchParams(window.location.search).get('upload');
  const onboardToken = new URLSearchParams(window.location.search).get('onboard');
  const signToken = new URLSearchParams(window.location.search).get('sign');

  const [agreements, setAgreements] = useState<SalaryAgreement[]>(initialAgreements);
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [templates, setTemplates] = useState<AgreementTemplate[]>(initialTemplates);
  const [fileDocuments, setFileDocuments] = useState<EmployeeFileDocument[]>(initialFileDocuments);
  const [branding, setBranding] = useState<BrandingSettings>(initialBranding);
  const [roles, setRoles] = useState<RoleType[]>(initialRoles);
  const [activityEvents, setActivityEvents] = useState<ManagerActivityEvent[]>(() =>
    dedupeActivityEvents(initialActivityEvents())
  );
  const activityEventsRef = useRef(activityEvents);
  activityEventsRef.current = activityEvents;

  const handleArchiveActivityEvent = (eventId: string) => {
    void (async () => {
      const next = await archiveActivityEventRemote(activityEventsRef.current, eventId);
      setActivityEvents(next);
    })();
  };

  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    try {
      const saved = sessionStorage.getItem('club_active_tab');
      if (saved === 'ai') return 'dashboard';
      if (saved) return saved as AppTab;
      if (sessionStorage.getItem('club_open_employee_file')) return 'employees';
    } catch {
      // ignore
    }
    return 'dashboard';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterState, setFilterState] = useState<FilterState>({
    searchQuery: '',
    employeeId: '',
    role: '',
    status: 'ALL',
    blockchainVerifiedOnly: false,
    dateRange: 'ALL'
  });

  const [viewingAgreement, setViewingAgreement] = useState<SalaryAgreement | null>(null);
  const [pendingAgreementToSign, setPendingAgreementToSign] = useState<SalaryAgreement | null>(null);
  const [selectedTemplateForWizard, setSelectedTemplateForWizard] = useState<AgreementTemplate | null>(null);

  useHrPersistence({
    enabled: Boolean(user),
    employees,
    agreements,
    templates,
    fileDocuments,
    branding,
    roles,
    activityEvents,
    setEmployees,
    setAgreements,
    setTemplates,
    setFileDocuments,
    setBranding,
    setRoles,
    setActivityEvents,
  });

  // איפוס חד־פעמי של לוג ישן; מקור האמת מעתה Firestore בלבד
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const purged = await purgeActivityLogCompletely(false);
      if (purged) {
        setActivityEvents([]);
      }
    })();
  }, [user]);

  const openEmployeeFileSection = (employeeId: string, fileSection: string) => {
    try {
      sessionStorage.setItem('club_open_employee_file', employeeId);
      sessionStorage.setItem(`club_file_section_${employeeId}`, fileSection);
      sessionStorage.setItem('club_active_tab', 'employees');
    } catch {
      // ignore
    }
    setActiveTab('employees');
    window.dispatchEvent(
      new CustomEvent('club-open-employee-file', {
        detail: { employeeId, fileSection },
      })
    );
  };

  useEffect(() => {
    setFilterState(prev => ({ ...prev, searchQuery }));
  }, [searchQuery]);

  useEffect(() => {
    try {
      sessionStorage.setItem('club_active_tab', activeTab);
    } catch {
      // ignore
    }
  }, [activeTab]);

  // Apply brand CSS variables + favicon globally
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--brand', branding.primaryColor);
    root.style.setProperty('--brand-dark', branding.primaryColor);
    root.style.setProperty('--accent', branding.accentColor);
    applyDocumentBranding(branding);
  }, [branding]);

  const handleSaveBranding = async (next: BrandingSettings) => {
    let updated: BrandingSettings = { ...next };
    if (next.logoDataUrl?.startsWith('data:')) {
      try {
        const { useFirebaseStorage } = await import('./config/featureFlags');
        const { isFirebaseConfigured } = await import('./lib/firebase');
        if (useFirebaseStorage() && isFirebaseConfigured()) {
          const { dataUrlToBlob, uploadBrandingLogo } = await import('./services/storage/clubStorage');
          const { blob, contentType } = await dataUrlToBlob(next.logoDataUrl);
          const up = await uploadBrandingLogo(blob, contentType);
          updated = {
            ...next,
            logoDataUrl: up.downloadURL,
            logoStoragePath: up.storagePath,
          };
        }
      } catch (err) {
        console.error(err);
        alert(
          err instanceof Error
            ? `העלאת הלוגו נכשלה: ${err.message}`
            : 'העלאת הלוגו נכשלה'
        );
        return;
      }
    }
    setBranding(updated);
    applyDocumentBranding(updated);
  };

  const handleAgreementCreatedOrSigned = (updatedOrNewAgreement: SalaryAgreement) => {
    setAgreements(prev => {
      const idx = prev.findIndex(a => a.id === updatedOrNewAgreement.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updatedOrNewAgreement;
        return copy;
      }
      return [updatedOrNewAgreement, ...prev];
    });

    if (updatedOrNewAgreement.status === 'SIGNED') {
      setEmployees(prev => prev.map(e => {
        if (e.id === updatedOrNewAgreement.employeeId) {
          return { ...e, agreementsCount: e.agreementsCount + 1 };
        }
        return e;
      }));

      const emp = employees.find((e) => e.id === updatedOrNewAgreement.employeeId);
      const event = buildAgreementSignedActivityEvent({
        employeeId: updatedOrNewAgreement.employeeId,
        employeeName: updatedOrNewAgreement.employeeName || emp?.name || '',
        employeeIdNumber: emp?.idNumber,
        agreementId: updatedOrNewAgreement.id,
        docNumber: updatedOrNewAgreement.docNumber,
        title: updatedOrNewAgreement.title,
        createdAt: new Date().toISOString(),
      });
      setActivityEvents((prev) => dedupeActivityEvents([event, ...prev]));
      void persistActivityEvent(event).catch(console.error);

      setPendingAgreementToSign(null);
      setViewingAgreement(updatedOrNewAgreement);
      setActiveTab('repository');
    }
  };

  const handleAddEmployee = (newEmployee: Employee) => {
    setEmployees(prev => [newEmployee, ...prev]);
  };

  const handleUpdateEmployee = (updated: Employee) => {
    setEmployees(prev => prev.map(e => (e.id === updated.id ? updated : e)));
  };

  const totalVerifiedCount = agreements.filter(a => a.status === 'SIGNED' && a.blockchain).length;

  if (onboardToken) {
    return <EmployeeOnboardingPortal token={onboardToken} />;
  }

  if (signToken) {
    return <EmployeeSigningPortal token={signToken} />;
  }

  if (uploadToken) {
    return <EmployeeUploadPortal token={uploadToken} />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600" dir="rtl">
        טוען הרשאות…
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="app-shell font-sans text-slate-900" dir="rtl">
      <Header
        branding={branding}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onNewAgreementClick={() => {
          setPendingAgreementToSign(null);
          setActiveTab('signer');
        }}
        totalVerifiedCount={totalVerifiedCount}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <DashboardStats
              agreements={agreements}
              employees={employees}
              templates={templates}
              clubName={branding.clubName}
              onFilterStatus={(status) => {
                setFilterState(prev => ({ ...prev, status }));
                setActiveTab('repository');
              }}
            />
            <ManagerActivityLog
              events={activityEvents}
              onArchiveEvent={handleArchiveActivityEvent}
              onOpenEvent={(event) => openEmployeeFileSection(event.employeeId, event.fileSection)}
            />
          </div>
        )}
        {activeTab === 'repository' && (
          <DocumentRepository
            agreements={agreements}
            employees={employees}
            roles={roles}
            templates={templates}
            filterState={filterState}
            setFilterState={setFilterState}
            onOpenViewer={(agreement) => setViewingAgreement(agreement)}
            onOpenSignerModal={(agreement) => {
              setPendingAgreementToSign(agreement);
              setActiveTab('signer');
            }}
          />
        )}

        {activeTab === 'signer' && (
          <ContractSignerWizard
            employees={employees}
            roles={roles}
            templates={templates}
            initialTemplate={selectedTemplateForWizard}
            pendingAgreementToSign={pendingAgreementToSign}
            onAgreementCreatedOrSigned={(ag) => {
              setSelectedTemplateForWizard(null);
              handleAgreementCreatedOrSigned(ag);
            }}
            onCancel={() => {
              setPendingAgreementToSign(null);
              setSelectedTemplateForWizard(null);
              setActiveTab('repository');
            }}
          />
        )}

        {activeTab === 'templates' && (
          <TemplateManager
            templates={templates}
            roles={roles}
            onUseTemplate={(tpl) => {
              setSelectedTemplateForWizard(tpl);
              setPendingAgreementToSign(null);
              setActiveTab('signer');
            }}
            onCreateTemplate={(newTpl) => {
              setTemplates((prev) => {
                const idx = prev.findIndex((t) => t.id === newTpl.id);
                if (idx >= 0) {
                  const next = prev.slice();
                  next[idx] = newTpl;
                  return next;
                }
                return [newTpl, ...prev];
              });
            }}
            onUpdateTemplate={(tpl) => {
              setTemplates((prev) => {
                const idx = prev.findIndex((t) => t.id === tpl.id);
                if (idx < 0) return [tpl, ...prev];
                const next = prev.slice();
                next[idx] = tpl;
                return next;
              });
            }}
            onDeleteTemplate={(templateId) => {
              setTemplates((prev) => prev.filter((t) => t.id !== templateId));
            }}
          />
        )}

        {activeTab === 'verifier' && (
          <BlockchainVerifier
            agreements={agreements}
            onViewDocument={(agreement) => {
              setViewingAgreement(agreement);
              setActiveTab('repository');
            }}
          />
        )}

        {activeTab === 'ledger' && (
          <LedgerExplorer
            agreements={agreements}
            onViewDocument={(agreement) => setViewingAgreement(agreement)}
          />
        )}

        {activeTab === 'employees' && (
          <EmployeeManager
            employees={employees}
            roles={roles}
            agreements={agreements}
            fileDocuments={fileDocuments}
            templates={templates}
            onSelectEmployeeFilter={(empId) => {
              setFilterState(prev => ({ ...prev, employeeId: empId, role: '' }));
              setActiveTab('repository');
            }}
            onAddEmployee={handleAddEmployee}
            onUpdateEmployee={handleUpdateEmployee}
            onAddFileDocument={(doc) => {
              setFileDocuments(prev => [doc, ...prev]);
            }}
            onDeleteFileDocument={(docId) => {
              setFileDocuments(prev => prev.filter(d => d.id !== docId));
              void deleteEmployeeFileDocument(docId);
            }}
            onOpenAgreement={(agreement) => setViewingAgreement(agreement)}
            onRolesChange={setRoles}
          />
        )}

        {activeTab === 'branding' && (
          <BrandSettings branding={branding} onSave={handleSaveBranding} />
        )}

        {activeTab === 'account' && <AccountSettings />}

        {activeTab === 'users' && <UsersPermissions />}
      </main>

      {viewingAgreement && (
        <PdfViewerModal
          agreement={viewingAgreement}
          employees={employees}
          templates={templates}
          onClose={() => setViewingAgreement(null)}
          onOpenSigner={(ag) => {
            setViewingAgreement(null);
            setPendingAgreementToSign(ag);
            setActiveTab('signer');
          }}
        />
      )}

      <footer
        className="text-white/80 border-t py-6 text-xs text-center mt-12"
        style={{ backgroundColor: branding.primaryColor, borderColor: 'rgba(255,255,255,0.15)' }}
      >
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-medium text-white">
            <ClubLogo src={branding.logoDataUrl} size="sm" />
            <span>{branding.clubName} · מערכת ניהול אגודת ספורט</span>
          </div>
          <div className="text-white/50">
            {branding.clubNameEn} · אימות חתימות · אבטחת מסמכים
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ManagerApp />
    </AuthProvider>
  );
}
