/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import XLSX from 'xlsx-js-style';
import { Candidate, CategoryType } from './types';
import { INITIAL_CANDIDATES } from './data/sampleData';
import CandidateTable from './components/CandidateTable';
import CandidateDetailModal from './components/CandidateDetailModal';
import ExcelImporter, { parseBirthDateToYYMMDD } from './components/ExcelImporter';
import LoginScreen from './components/LoginScreen';
import MatchingRecordView from './components/MatchingRecordView';
import ActivitySupportWaitingListView from './components/ActivitySupportWaitingListView';
import MonthlyStatsView from './components/MonthlyStatsView';
import InstallGuideModal from './components/InstallGuideModal';
import GoogleDriveSyncModal from './components/GoogleDriveSyncModal';
import { 
  getSavedSyncState, 
  saveSyncState, 
  GoogleSyncState, 
  syncCandidatesToSpreadsheet,
  syncViaWebhook,
  getSavedAccessToken,
  requestGoogleAccessToken,
  SPREADSHEET_DEFAULT_NAME
} from './services/googleSheetsService';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  auth,
  logoutUser,
  saveCandidateToFirestore,
  deleteCandidateFromFirestore,
  subscribeToCandidates,
  batchUploadCandidatesIfEmpty,
  forceUploadAllToFirestore,
  isAllowedEmail,
  getSavedStaffProfile,
  StaffProfile
} from './services/firebaseService';
import { 
  FileSpreadsheet, 
  Printer, 
  UserPlus, 
  Download, 
  Calendar,
  Trash2,
  AlertTriangle,
  Cloud,
  LogOut,
  Sparkles,
  RefreshCw,
  UserCheck,
  FileText,
  ShieldCheck,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  BarChart3,
  Share2,
  ExternalLink,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const deduplicateCandidates = (list: Candidate[]): Candidate[] => {
  const seen = new Set<string>();
  const uniqueList: Candidate[] = [];
  
  const sorted = [...list].sort((a, b) => {
    const timeA = (a as any).updatedAt ? new Date((a as any).updatedAt).getTime() : 0;
    const timeB = (b as any).updatedAt ? new Date((b as any).updatedAt).getTime() : 0;
    return timeB - timeA;
  });

  for (const c of sorted) {
    if (!c.name) continue;
    const nameKey = c.name.trim();
    const birthDigits = (c.birthDate || '').replace(/[^0-9]/g, '');
    const uniqueKey = `${nameKey}_${birthDigits}`;

    if (!seen.has(uniqueKey)) {
      seen.add(uniqueKey);
      uniqueList.push(c);
    }
  }

  return uniqueList.sort((a, b) => (b.registrationDate || '').localeCompare(a.registrationDate || ''));
};

export default function App() {
  const [staffProfile, setStaffProfile] = useState<StaffProfile>(getSavedStaffProfile());
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem('suwon_staff_logged_in') === 'true';
  });
  const [currentTab, setCurrentTab] = useState<'candidates' | 'matchingRecord' | 'activitySupportPrint' | 'monthlyStats'>('candidates');
  const [selectedCandidateForRecord, setSelectedCandidateForRecord] = useState<Candidate | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>('2025'); // default to 2025 or total
  const [hasSetInitialYear, setHasSetInitialYear] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [showImporter, setShowImporter] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [isQuotaBannerDismissed, setIsQuotaBannerDismissed] = useState(false);
  
  // Privacy & Screen Protection System
  const [privacyMode, setPrivacyMode] = useState<boolean>(false);
  const [isScreenLocked, setIsScreenLocked] = useState<boolean>(false);
  const [lockPinInput, setLockPinInput] = useState<string>('');
  const [lockPinError, setLockPinError] = useState<string>('');
  const [confirmDialog, setConfirmDialog] = useState<{ 
    isOpen: boolean; 
    title: string; 
    message: string; 
    onConfirm: () => void; 
    actionText?: string;
    isWarning?: boolean;
  } | null>(null);

  // PWA & Share Guide States
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(false);
  const [showInstallGuide, setShowInstallGuide] = useState<boolean>(false);

  // Google Drive & Sheets Single-Sheet Auto-Sync States
  const [showGoogleSyncModal, setShowGoogleSyncModal] = useState<boolean>(false);
  const [googleSyncState, setGoogleSyncState] = useState<GoogleSyncState>(() => getSavedSyncState());
  const [isGoogleSyncing, setIsGoogleSyncing] = useState<boolean>(false);
  const [googleSyncNotification, setGoogleSyncNotification] = useState<string | null>(null);

  useEffect(() => {
    // Detect standalone mode
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true;
    setIsAppInstalled(isStandalone);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Google Authentication session validation with suwonrehab.or.kr domain constraint
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setIsAuthChecking(false);
      if (currentUser && currentUser.email) {
        if (isAllowedEmail(currentUser.email)) {
          const profile: StaffProfile = {
            name: currentUser.displayName || currentUser.email.split('@')[0] || '복지관 담당자',
            email: currentUser.email,
            department: '수원시장애인종합복지관'
          };
          setStaffProfile(profile);
          setIsLoggedIn(true);
          localStorage.setItem('suwon_staff_logged_in', 'true');
        } else {
          // If non-suwonrehab domain user is logged in, force logout immediately
          await logoutUser();
          setIsLoggedIn(false);
        }
      } else {
        setIsLoggedIn(false);
        localStorage.removeItem('suwon_staff_logged_in');
      }
    });

    return () => unsubscribe();
  }, []);

  const handleTriggerInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsAppInstalled(true);
      setDeferredPrompt(null);
    }
  };

  const handleUnlockScreen = () => {
    if (lockPinInput === '5612') {
      setIsScreenLocked(false);
      setLockPinInput('');
      setLockPinError('');
    } else {
      setLockPinError('비밀번호가 일치하지 않습니다. (올바른 비밀번호: 5612)');
    }
  };

  // Real-time sync with Firebase Firestore when logged in
  useEffect(() => {
    if (!isLoggedIn) return;

    setIsCloudSyncing(true);

    // Initial batch check: seed 1,161 candidates if firestore collection is brand new
    const initialCandidatesToSeed = (() => {
      const saved = localStorage.getItem('waitlist_candidates');
      if (saved) {
        try {
          return JSON.parse(saved) as Candidate[];
        } catch {
          return INITIAL_CANDIDATES;
        }
      }
      return INITIAL_CANDIDATES;
    })();

    batchUploadCandidatesIfEmpty(initialCandidatesToSeed, staffProfile.email || '관리자')
      .then((uploaded) => {
        if (uploaded) {
          console.log('기본 1,161건 대기명단이 Firestore 클라우드에 안전하게 초기 적재되었습니다.');
        }
      })
      .catch((err) => console.warn('Batch check notice:', err));

    // Real-time Firestore subscription (any edits by other staff reflect instantly)
    const unsubscribeSnapshot = subscribeToCandidates(
      (firestoreList) => {
        setIsCloudSyncing(false);
        if (firestoreList.length > 0) {
          // Normalize dates & grades
          const normalized = firestoreList.map(c => {
            let cleanedBirth = c.birthDate || '';
            if (cleanedBirth) {
              cleanedBirth = parseBirthDateToYYMMDD(cleanedBirth);
            }
            let cleanedGrade = c.disabilityGrade || '';
            if (cleanedGrade === '미분류' || cleanedGrade === '미지정' || cleanedGrade === '미상') {
              cleanedGrade = '';
            }
            let cleanedType = c.disabilityType || '';
            if (cleanedType === '미분류' || cleanedType === '미지정' || cleanedType === '미상') {
              cleanedType = '';
            }
            return {
              ...c,
              birthDate: cleanedBirth,
              disabilityGrade: cleanedGrade,
              disabilityType: cleanedType
            };
          });
          const deduplicated = deduplicateCandidates(normalized);
          setCandidates(deduplicated);
          localStorage.setItem('waitlist_candidates', JSON.stringify(deduplicated));
        } else {
          // If Firestore is empty, fallback to local or default
          const local = localStorage.getItem('waitlist_candidates');
          if (local) {
            try {
              const parsed = JSON.parse(local);
              setCandidates(deduplicateCandidates(parsed));
            } catch {
              setCandidates(deduplicateCandidates(INITIAL_CANDIDATES));
            }
          } else {
            setCandidates(deduplicateCandidates(INITIAL_CANDIDATES));
          }
        }
      },
      (error) => {
        setIsCloudSyncing(false);
        const isQuota = error.message?.includes('Quota') || (error as any).code === 'resource-exhausted';
        if (isQuota) {
          setIsQuotaExceeded(true);
        }
        console.warn('Firestore subscription offline fallback notice:', error);
        // Fallback to localStorage
        const saved = localStorage.getItem('waitlist_candidates');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setCandidates(deduplicateCandidates(parsed));
          } catch {
            setCandidates(deduplicateCandidates(INITIAL_CANDIDATES));
          }
        }
      }
    );

    return () => unsubscribeSnapshot();
  }, [isLoggedIn, staffProfile.email]);

  // Google Drive & Sheets Real-time Auto-Sync Effect:
  // Automatically persists any additions, modifications, deletions, or bulk imports into the single Google Sheet
  useEffect(() => {
    if (!googleSyncState.isConnected || !(googleSyncState.autoSyncEnabled ?? true)) {
      return;
    }
    if (!candidates || candidates.length === 0) return;

    const timer = setTimeout(async () => {
      try {
        if (googleSyncState.syncType === 'webhook' && googleSyncState.webhookUrl) {
          setIsGoogleSyncing(true);
          await syncViaWebhook(googleSyncState.webhookUrl, candidates);
          const updatedTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
          const updatedState = { ...googleSyncState, lastSyncedAt: updatedTime };
          setGoogleSyncState(updatedState);
          saveSyncState(updatedState);
          setGoogleSyncNotification(`구글 시트 자동 저장 완료 (${updatedTime})`);
          setTimeout(() => setGoogleSyncNotification(null), 3000);
        } else if (googleSyncState.spreadsheetId) {
          const token = getSavedAccessToken();
          if (token) {
            setIsGoogleSyncing(true);
            await syncCandidatesToSpreadsheet(token, googleSyncState.spreadsheetId, candidates);
            const updatedTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
            const updatedState = { ...googleSyncState, lastSyncedAt: updatedTime };
            setGoogleSyncState(updatedState);
            saveSyncState(updatedState);
            setGoogleSyncNotification(`구글 시트 자동 저장 완료 (${updatedTime})`);
            setTimeout(() => setGoogleSyncNotification(null), 3000);
          }
        }
      } catch (syncErr) {
        console.warn('Auto sync warning:', syncErr);
      } finally {
        setIsGoogleSyncing(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [
    candidates, 
    googleSyncState.isConnected, 
    googleSyncState.spreadsheetId, 
    googleSyncState.autoSyncEnabled, 
    googleSyncState.syncType, 
    googleSyncState.webhookUrl
  ]);

  // Quick Google Drive Sync button handler
  const handleQuickGoogleSync = async () => {
    if (!googleSyncState.isConnected) {
      setShowGoogleSyncModal(true);
      return;
    }

    setIsGoogleSyncing(true);
    try {
      if (googleSyncState.syncType === 'webhook' && googleSyncState.webhookUrl) {
        await syncViaWebhook(googleSyncState.webhookUrl, candidates);
      } else if (googleSyncState.spreadsheetId) {
        const token = await requestGoogleAccessToken();
        await syncCandidatesToSpreadsheet(token, googleSyncState.spreadsheetId, candidates);
      }
      const updatedTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      const updatedState = { ...googleSyncState, lastSyncedAt: updatedTime };
      setGoogleSyncState(updatedState);
      saveSyncState(updatedState);
      setGoogleSyncNotification(`구글 시트 저장 완료 (${updatedTime})`);
      setTimeout(() => setGoogleSyncNotification(null), 3000);
    } catch (err: any) {
      alert(err.message || '구글 시트 동기화 중 오류가 발생했습니다.');
    } finally {
      setIsGoogleSyncing(false);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    await logoutUser();
    setIsLoggedIn(false);
  };

  // YEAR SEGREGATION LOGIC:
  // Find all distinct years in candidates registration date >= 2024 dynamically
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    candidates.forEach(cand => {
      if (cand.registrationDate) {
        const parts = cand.registrationDate.split('-');
        if (parts[0] && parts[0].length === 4) {
          const yNum = parseInt(parts[0], 10);
          if (!isNaN(yNum) && yNum >= 2024) {
            yearsSet.add(parts[0]);
          }
        }
      }
    });
    // Ensure standard years exist as safe fallbacks
    yearsSet.add('2025');
    yearsSet.add('2024');
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [candidates]);

  // Sync selectedYear to the latest year on initial candidates load
  useEffect(() => {
    if (availableYears.length > 0 && !hasSetInitialYear && candidates.length > 0) {
      const latestYear = availableYears[0];
      setSelectedYear(latestYear);
      setHasSetInitialYear(true);
    }
  }, [availableYears, hasSetInitialYear, candidates.length]);

  // Handle selectedYear becoming invalid (e.g. if candidates are updated/cleared)
  useEffect(() => {
    if (selectedYear !== '전체' && availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const getCandidatesByYear = (year: string) => {
    // 2024년 이전 자료는 전체적으로 걸러냅니다
    const safeCandidates = candidates.filter(cand => {
      if (!cand.registrationDate) return false;
      const regYear = parseInt(cand.registrationDate.split('-')[0], 10);
      return !isNaN(regYear) && regYear >= 2024;
    });

    if (year === '전체') return safeCandidates;
    
    return safeCandidates.filter(cand => {
      const regYear = cand.registrationDate.split('-')[0];
      return regYear === year;
    });
  };

  // Add or updates a candidate entry
  const handleSaveCandidate = async (savedCand: Candidate) => {
    const existsIndex = candidates.findIndex(c => c.id === savedCand.id);
    let updatedList = [...candidates];
    
    if (existsIndex >= 0) {
      updatedList[existsIndex] = savedCand;
    } else {
      updatedList.push(savedCand);
    }
    
    setCandidates(updatedList);
    localStorage.setItem('waitlist_candidates', JSON.stringify(updatedList));

    // Sync to Firestore
    try {
      await saveCandidateToFirestore(savedCand, staffProfile.email || '직원');
    } catch (err) {
      console.warn('Firestore single save notice:', err);
    }
  };

  // Switch category status directly from list view
  const handleUpdateCategory = async (id: string, category: CategoryType) => {
    const target = candidates.find(c => c.id === id);
    if (!target) return;

    const updated = { ...target, category };
    const updatedList = candidates.map(c => (c.id === id ? updated : c));
    
    setCandidates(updatedList);
    localStorage.setItem('waitlist_candidates', JSON.stringify(updatedList));

    try {
      await saveCandidateToFirestore(updated, staffProfile.email || '직원');
    } catch (err) {
      console.warn('Firestore category update notice:', err);
    }
  };

  // Delete a candidate entry
  const handleDeleteCandidate = async (id: string) => {
    const filtered = candidates.filter(c => c.id !== id);
    setCandidates(filtered);
    localStorage.setItem('waitlist_candidates', JSON.stringify(filtered));

    try {
      await deleteCandidateFromFirestore(id);
    } catch (err) {
      console.warn('Firestore delete notice:', err);
    }
  };

  // Mass Import handler
  const handleMassImport = async (newCandidates: Candidate[]) => {
    let addedCount = 0;
    let updatedCount = 0;

    // Create a map of existing candidates by unique key (Name + BirthDate digits)
    const existingMap = new Map<string, Candidate>();
    candidates.forEach(c => {
      if (!c.name) return;
      const name = c.name.trim().replace(/\s+/g, '');
      const birth = (c.birthDate || '').replace(/[^0-9]/g, '');
      existingMap.set(`${name}_${birth}`, c);
    });

    const updatedList = [...candidates];

    newCandidates.forEach(excelCand => {
      if (!excelCand.name) return;
      const name = excelCand.name.trim().replace(/\s+/g, '');
      const birth = (excelCand.birthDate || '').replace(/[^0-9]/g, '');
      const key = `${name}_${birth}`;

      if (existingMap.has(key)) {
        // 1. Existing candidate: Perform smart merge of modified/new fields
        const oldCand = existingMap.get(key)!;
        let isModified = false;
        const mergedCand = { ...oldCand };

        // A. Merge Category (e.g. if status in Excel changed to '연계' or '보류')
        if (excelCand.category && excelCand.category !== oldCand.category) {
          mergedCand.category = excelCand.category;
          isModified = true;
        }

        // B. Merge Consultation Logs (deduplicated by spacing and text content)
        const oldLogs = [...(oldCand.consultationLogs || [])];
        const excelLogs = excelCand.consultationLogs || [];
        const mergedLogs = [...oldLogs];

        excelLogs.forEach(eLog => {
          const eContent = (eLog.content || '').trim();
          if (!eContent || eContent === '[최초 등록] 이용대기 접수 완료') return;

          const exists = oldLogs.some(oLog => 
            (oLog.content || '').trim().replace(/\s+/g, '') === eContent.replace(/\s+/g, '')
          );

          if (!exists) {
            mergedLogs.push({
              id: `merged-excel-log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              date: eLog.date || new Date().toISOString().split('T')[0],
              content: eContent
            });
            isModified = true;
          }
        });

        mergedCand.consultationLogs = mergedLogs;

        // C. Merge other fields if updated in Excel
        const textFieldsToMerge: (keyof Candidate)[] = [
          'phone', 'remarks', 'disabilityType', 'disabilityGrade', 
          'addressCity', 'addressDistrict', 'addressDong', 'addressDetail',
          'fundingNational', 'fundingProvincial', 'fundingCity', 
          'serviceContent', 'specialNotes', 'registrar'
        ];

        textFieldsToMerge.forEach(field => {
          const excelVal = (excelCand[field] || '').toString().trim();
          const oldVal = (oldCand[field] || '').toString().trim();

          if (excelVal && excelVal !== oldVal) {
            (mergedCand as any)[field] = excelCand[field];
            isModified = true;
          }
        });

        if (isModified) {
          const idx = updatedList.findIndex(c => c.id === oldCand.id);
          if (idx >= 0) {
            updatedList[idx] = mergedCand;
          }
          updatedCount++;
        }
      } else {
        // 2. Pure new candidate: Append
        updatedList.push(excelCand);
        addedCount++;
      }
    });

    if (addedCount === 0 && updatedCount === 0) {
      alert('업로드한 파일이 프로그램 내 기존 데이터와 100% 동일합니다. 새롭게 추가하거나 업데이트할 이력이 없습니다.');
      setShowImporter(false);
      return;
    }

    setCandidates(updatedList);
    localStorage.setItem('waitlist_candidates', JSON.stringify(updatedList));
    setShowImporter(false);

    setIsCloudSyncing(true);
    let googleSyncError = false;
    let syncedTimeStr = '';

    try {
      // 1. Firestore Sync
      await forceUploadAllToFirestore(updatedList, staffProfile.email || '일괄등록');

      // 2. Google Sheets Auto-Sync (if connected)
      if (googleSyncState.isConnected && googleSyncState.spreadsheetId) {
        setIsGoogleSyncing(true);
        try {
          let token = getSavedAccessToken();
          if (!token) {
            token = await requestGoogleAccessToken();
          }
          if (token) {
            await syncCandidatesToSpreadsheet(token, googleSyncState.spreadsheetId, updatedList);
            const updatedTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
            syncedTimeStr = ` (구글시트 실시간 저장 완료: ${updatedTime})`;
            const updatedState = { ...googleSyncState, lastSyncedAt: updatedTime };
            setGoogleSyncState(updatedState);
            saveSyncState(updatedState);
          }
        } catch (sheetErr) {
          console.warn('Excel mass import google sheets sync fail:', sheetErr);
          googleSyncError = true;
        } finally {
          setIsGoogleSyncing(false);
        }
      }

      let alertMsg = `일괄 처리 완료!\n- 신규 등록 대기자: ${addedCount}명\n- 정보 수정 및 새 상담이력 갱신 대기자: ${updatedCount}명\n기존 이력 누락 없이 안전하게 클라우드 동기화가 완료되었습니다.`;
      if (googleSyncState.isConnected) {
        if (googleSyncError) {
          alertMsg += `\n\n⚠️ 단, 구글시트 연동 저장 중 일시적 오류가 발생했습니다. 연동 창에서 [지금 최신 데이터 동기화]를 눌러 다시 갱신할 수 있습니다.`;
        } else if (syncedTimeStr) {
          alertMsg += `\n\n💚${syncedTimeStr}`;
        }
      }
      alert(alertMsg);
    } catch (err) {
      console.warn('Firestore batch upload notice:', err);
      alert(`일괄 처리 완료 (클라우드 지연됨):\n- 신규 등록: ${addedCount}명\n- 정보 수정: ${updatedCount}명`);
    } finally {
      setIsCloudSyncing(false);
    }
  };

  // Helper to calculate last consultation log matching status
  const getLastLogMatching = (candidate: Candidate): 'O' | 'X' => {
    if (!candidate.consultationLogs || candidate.consultationLogs.length === 0) return 'X';
    const sortedLogs = [...candidate.consultationLogs].sort((a, b) => a.date.localeCompare(b.date));
    const lastLog = sortedLogs[sortedLogs.length - 1];
    if (!lastLog) return 'X';
    const text = lastLog.content || '';
    
    // Check if the latest log indicates re-waiting / waiting request
    // Keywords: "재대기", "대기요청", "대기", "대기 희망", "대기원함", "다시 대기", etc.
    const isReWaitingOrWaiting = 
      /(재대기|대기요청|대기\s*요청|대기희망|대기\s*희망|재접수|다시\s*대기|대기원함|대기\s*원함)/.test(text) ||
      (text.includes('대기') && !/(서비스\s*시작|서비스시작)/.test(text) && !/(연계완료|[가-힣]{2,4}\s*[Tt티]?\s*연계)/.test(text));

    if (isReWaitingOrWaiting) {
      return 'X';
    }

    const hasServiceStart = text.includes('서비스 시작') || text.includes('서비스시작');
    const hasConnection = /(연계완료|[가-힣]{2,4}\s*[Tt티]?\s*연계|연계)/.test(text); 
    const hasOtherConnection = text.includes('타기관 연계') || text.includes('타기관연계');
    const hasEnd = text.includes('종결');
    const hasCancelOrFail = /(연계불가|연계실패|연계안됨|연계\s*취소|연계포기|연계를\s*포기)/.test(text);
    
    if (hasOtherConnection || hasEnd || hasCancelOrFail) {
      return 'X';
    }
    
    if (hasServiceStart || hasConnection) {
      return 'O';
    }
    
    return 'X';
  };

  // Export to Styled Excel (.xlsx) file
  const handleExportExcel = () => {
    const listToExport = getCandidatesByYear(selectedYear);
    if (listToExport.length === 0) {
      alert('다운로드할 명단 데이터가 해당 연도에 존재하지 않습니다.');
      return;
    }

    const headers = [
      '순번', '구분', '접수일', '접수자', '성명', '생년월일', '성별', '장애유형', '급수', '국비', '도비', '시비', '주소', '연락처', '서비스내용', '추가상담', '매칭여부'
    ];

    const rows = listToExport.map((cand, idx) => {
      const addressParts = [];
      if (cand.addressCity) addressParts.push(cand.addressCity.trim());
      if (cand.addressDistrict) addressParts.push(cand.addressDistrict.trim());
      if (cand.addressDong && cand.addressDong.trim()) {
        const tDong = cand.addressDong.trim();
        if (tDong.endsWith('동') || tDong.endsWith('읍') || tDong.endsWith('면')) {
          addressParts.push(tDong);
        }
      }
      if (cand.addressDetail) addressParts.push(cand.addressDetail.trim());
      const combinedAddress = addressParts.join(' ').replace(/\s+/g, ' ').trim();

      const serviceCombined = `${cand.serviceContent || ''}${cand.specialNotes ? `\n[특이사항]: ${cand.specialNotes}` : ''}`.trim();
      
      const logsCombined = cand.consultationLogs && cand.consultationLogs.length > 0 
        ? cand.consultationLogs.map(l => `[${l.date}] ${l.content}`).join('\r\n')
        : '상담기록 없음';

      const matchedVal = getLastLogMatching(cand);

      return [
        idx + 1,
        cand.category,
        cand.registrationDate,
        cand.registrar || '미기재',
        cand.name,
        cand.birthDate || '미기재',
        cand.gender,
        cand.disabilityType || '미지정',
        cand.disabilityGrade || '미상',
        cand.fundingNational || '-',
        cand.fundingProvincial || '-',
        cand.fundingCity || '-',
        combinedAddress || '-',
        cand.phone || '-',
        serviceCombined || '-',
        logsCombined,
        matchedVal
      ];
    });

    const dataMatrix = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(dataMatrix);

    const baseCols = [
      { wch: 6 },   // 순번
      { wch: 10 },  // 구분
      { wch: 13 },  // 접수일
      { wch: 10 },  // 접수자
      { wch: 10 },  // 성명
      { wch: 12 },  // 생년월일
      { wch: 8 },   // 성별
      { wch: 12 },  // 장애유형
      { wch: 8 },   // 급수
      { wch: 8 },   // 국비
      { wch: 8 },   // 도비
      { wch: 8 },   // 시비
      { wch: 30 },  // 주소
      { wch: 15 },  // 연락처
      { wch: 32 },  // 서비스내용
      { wch: 38 },  // 추가상담
      { wch: 10 }   // 매칭여부
    ];

    ws['!cols'] = baseCols;

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Q1');
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) continue;

        const isHeader = R === 0;
        const isLeftAlignCol = C === 14 || C === 15;

        ws[cellAddress].s = {
          font: {
            name: '맑은 고딕',
            sz: isHeader ? 11 : 10,
            bold: isHeader,
            color: { rgb: isHeader ? 'FFFFFF' : '1E293B' }
          },
          alignment: {
            vertical: 'center',
            horizontal: isHeader ? 'center' : (isLeftAlignCol ? 'left' : 'center'),
            wrapText: true
          },
          fill: {
            fgColor: { rgb: isHeader ? '059669' : (R % 2 === 0 ? 'F8FAFC' : 'FFFFFF') }
          },
          border: {
            top: { style: 'thin', color: { rgb: 'CBD5E1' } },
            bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
            left: { style: 'thin', color: { rgb: 'CBD5E1' } },
            right: { style: 'thin', color: { rgb: 'CBD5E1' } }
          }
        };
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '이용대기명단');

    const displayYear = selectedYear === '전체' ? '전체연도' : `${selectedYear}년도`;
    const formatToday = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `이용대기명단정리_${displayYear}_${formatToday}.xlsx`);
  };

  // Direct System Print
  const handlePrint = () => {
    try {
      window.focus();
      window.print();
    } catch (e) {
      console.warn('Print failed', e);
    }
  };

  // Authentication verification state while Firebase initializes
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4 font-sans">
        <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mb-4" />
        <div className="text-sm font-bold text-slate-200">수원시장애인종합복지관 보안 인증 확인 중...</div>
        <div className="text-xs text-slate-400 mt-1.5">Google Workspace 보안 세션을 안전하게 검증하고 있습니다.</div>
      </div>
    );
  }

  // If not logged in, render streamlined Staff Login Screen
  if (!isLoggedIn) {
    return (
      <LoginScreen 
        onLoginSuccess={(profile) => {
          setStaffProfile(profile);
          setIsLoggedIn(true);
        }} 
      />
    );
  }

  const activeCandidates = getCandidatesByYear(selectedYear);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans transition-colors antialiased">
      
      {/* APP TITLE / HEADER AREA (Hidden on print) */}
      <header className="bg-white border-b border-slate-100 shadow-sm shrink-0 print:hidden sticky top-0 z-40">
        <div className="max-w-full mx-auto px-2 lg:px-4 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-black shadow-md shadow-emerald-500/20">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-slate-900 tracking-tight">이용대기명단</h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
                  <ShieldCheck className="w-3 h-3 text-blue-600" />
                  개인정보보호 시스템 적용
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">수원시장애인종합복지관 이용자 대기 및 매칭 관리</p>
            </div>
          </div>

          {/* User Profile & Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* PWA Install Guide button */}
            <button
              type="button"
              onClick={() => setShowInstallGuide(true)}
              className="px-3 py-1.5 text-xs font-bold bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 hover:border-indigo-300 rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
              title="바탕화면 전용 앱 설치방법 안내"
            >
              <Download className="w-3.5 h-3.5 text-indigo-500" />
              <span>앱 설치방법</span>
            </button>
            
            {/* Privacy Protection System Controls */}
            <button
              type="button"
              onClick={() => setPrivacyMode(!privacyMode)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                privacyMode 
                  ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-xs' 
                  : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
              }`}
              title="이름, 생년월일, 연락처를 마스킹 처리하여 주변 노출을 방지합니다"
            >
              {privacyMode ? <EyeOff className="w-3.5 h-3.5 text-amber-600" /> : <Eye className="w-3.5 h-3.5 text-slate-500" />}
              <span>{privacyMode ? '개인정보 마스킹 ON' : '개인정보 마스킹'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setLockPinInput('');
                setLockPinError('');
                setIsScreenLocked(true);
              }}
              className="px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              title="자리 비움 시 대기명단 화면을 안전하게 잠급니다"
            >
              <Lock className="w-3.5 h-3.5 text-slate-300" />
              <span>화면 잠금</span>
            </button>
            
            {/* Staff Profile Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-700 font-bold mr-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="truncate max-w-[150px]">{staffProfile.name || staffProfile.email}</span>
              <button
                type="button"
                onClick={handleLogout}
                title="로그아웃 / 담당자 변경"
                className="text-slate-400 hover:text-rose-600 ml-1 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Google Drive / Sheets Single Sheet Auto-Sync Button */}
            {googleSyncState.isConnected ? (
              <div className="flex items-center gap-1.5 p-1 bg-emerald-50 border border-emerald-200 rounded-xl shadow-2xs">
                <button
                  type="button"
                  onClick={() => setShowGoogleSyncModal(true)}
                  className="px-2.5 py-1 text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1.5 cursor-pointer"
                  title="구글 드라이브 단일 시트「활동지원 이용대기 명단」자동 저장 관리"
                >
                  <span className={`w-2 h-2 rounded-full ${isGoogleSyncing ? 'bg-amber-500 animate-ping' : 'bg-emerald-500 animate-pulse'}`}></span>
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span className="truncate max-w-[130px] font-black text-emerald-900">활동지원 이용대기 명단</span>
                  {isGoogleSyncing ? (
                    <span className="text-[10px] text-amber-700 font-bold animate-pulse">저장 중...</span>
                  ) : (
                    <span className="text-[10px] text-emerald-600 font-bold">자동 저장 ON</span>
                  )}
                </button>
                {googleSyncState.spreadsheetUrl && (
                  <a
                    href={googleSyncState.spreadsheetUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                    title="구글 스프레드시트 바로 열기 ↗"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleQuickGoogleSync}
                  disabled={isGoogleSyncing}
                  className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  title="지금 즉시 구글 시트로 동기화"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGoogleSyncing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowGoogleSyncModal(true)}
                className="px-3.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50/90 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="구글 드라이브 단일 시트「활동지원 이용대기 명단」실시간 자동 저장 연결"
              >
                <Cloud className="w-4 h-4 text-emerald-600" />
                <span>구글시트 연동</span>
              </button>
            )}

            <button
              onClick={() => setShowImporter(!showImporter)}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                showImporter 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              엑셀 일괄 추가
            </button>

            <button
              onClick={handleExportExcel}
              className="px-3.5 py-2 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              title="이용 대기 현황 엑셀 다운로드"
            >
              <Download className="w-4 h-4" />
              엑셀 저장
            </button>

            <button
              type="button"
              onClick={() => {
                setConfirmDialog({
                  isOpen: true,
                  title: '전체 데이터 영구 초기화',
                  message: '⚠️ 경고: 정말로 등록된 모든 대기명단 데이터를 클라우드에서 완전히 삭제하시겠습니까? 이 작업은 복구할 수 없습니다.',
                  actionText: '전체 초기화 실행',
                  isWarning: true,
                  onConfirm: async () => {
                    setCandidates([]);
                    localStorage.setItem('waitlist_candidates', JSON.stringify([]));
                    await forceUploadAllToFirestore([], staffProfile.email);
                  }
                });
              }}
              className="px-3 py-2 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              title="데이터베이스 초기화"
            >
              <Trash2 className="w-4 h-4 text-rose-500" />
            </button>

          </div>
        </div>
      </header>
 
      {/* Cloud Quota Notice Banner */}
      {isQuotaExceeded && !isQuotaBannerDismissed && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 lg:px-4 py-2.5 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2 shrink-0 print:hidden z-35">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="flex flex-wrap items-center gap-1.5 leading-relaxed">
              <span className="font-extrabold text-amber-900">Firestore 일일 무료 읽기 할당량 초과 안내:</span>
              <span className="text-amber-800">
                금일 무료 한도가 소진되어 브라우저 <strong>로컬 안전 보관 모드</strong>로 자동 전환되었습니다. 기존 대기명단 및 기록은 정상적으로 조회/수정/출력하실 수 있으며, 내일 할당량이 자동 리셋됩니다.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <a
              href="https://console.firebase.google.com/project/gen-lang-client-0616047831/firestore/databases/ai-studio-remix-d84c0d42-c0f4-4b8f-8197-53bea2537fd8/data?openUpgradeDialog=true"
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors flex items-center gap-1 shadow-2xs text-[11px]"
            >
              <span>Firebase 콘솔 업그레이드</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <button
              type="button"
              onClick={() => setIsQuotaBannerDismissed(true)}
              className="px-1.5 py-0.5 hover:bg-amber-200/60 rounded text-amber-700 font-bold transition-colors cursor-pointer text-xs"
              title="닫기"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* TOP NAVIGATION TABS: [이용대기명단] vs [매칭과정 기록지] vs [이용대기명단 출력(활동지원사 확인용)] */}
      <div className="bg-white border-b border-slate-200/80 px-2 lg:px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 print:hidden sticky top-[69px] z-30 shadow-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setCurrentTab('candidates')}
            className={`px-4 py-2 text-xs font-black rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
              currentTab === 'candidates'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            이용대기명단 관리
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              currentTab === 'candidates' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {candidates.length}명
            </span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('matchingRecord')}
            className={`px-4 py-2 text-xs font-black rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
              currentTab === 'matchingRecord'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            매칭과정 기록지
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              currentTab === 'matchingRecord' ? 'bg-indigo-700 text-white' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
            }`}>
              공문서 서식
            </span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('activitySupportPrint')}
            className={`px-4 py-2 text-xs font-black rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
              currentTab === 'activitySupportPrint'
                ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Printer className="w-4 h-4" />
            이용대기명단 출력(활동지원사 확인용)
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              currentTab === 'activitySupportPrint' ? 'bg-teal-700 text-white' : 'bg-teal-50 text-teal-700 border border-teal-200'
            }`}>
              개인정보 보호
            </span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab('monthlyStats')}
            className={`px-4 py-2 text-xs font-black rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
              currentTab === 'monthlyStats'
                ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            월별 이용 대기 현황
          </button>
        </div>

        {currentTab === 'matchingRecord' && (
          <div className="text-xs text-slate-500 font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
            이용자 이름을 적으면 상담내용·생년월일이 자동 입력됩니다.
          </div>
        )}
      </div>

      {/* MAIN BODY LAYOUT */}
      <main className="flex-1 max-w-full w-full mx-auto p-2 sm:p-4 lg:p-4 space-y-4">
        {currentTab === 'matchingRecord' ? (
          <MatchingRecordView
            candidates={candidates}
            staffProfile={staffProfile}
            initialCandidate={selectedCandidateForRecord}
            onBackToList={() => setCurrentTab('candidates')}
            privacyMode={privacyMode}
          />
        ) : currentTab === 'activitySupportPrint' ? (
          <ActivitySupportWaitingListView
            candidates={candidates}
            selectedYear={selectedYear}
          />
        ) : currentTab === 'monthlyStats' ? (
          <MonthlyStatsView
            candidates={candidates}
            privacyMode={privacyMode}
          />
        ) : (
          <>
            {/* YEAR SELECTION TABS & SUMMARY CARDS */}
        <div className="space-y-4 print:hidden">
          
          {/* Year selector header with relocated Print button */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-sm font-bold text-slate-800">접수 연도별 대기명단 필터</h2>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="px-2.5 py-1 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 hover:text-emerald-800 border border-slate-300 rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                    title="선택된 연도의 대기명단 인쇄하기"
                  >
                    <Printer className="w-3.5 h-3.5 text-emerald-600" />
                    <span>대기목록 인쇄</span>
                  </button>
                </div>
                 <p className="text-xs text-slate-400">접수 연도별 대기 명단을 탭으로 연도별 분리하여 관리합니다.</p>
              </div>
            </div>

            {/* Year Buttons */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
              {[...availableYears, '전체'].map((year) => {
                const count = getCandidatesByYear(year).length;
                const isSelected = selectedYear === year;
                return (
                  <button
                    key={year}
                    onClick={() => setSelectedYear(year)}
                    className={`px-4 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-white text-emerald-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <span>{year === '전체' ? '전체 접수자' : `${year}년 접수`}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      isSelected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {count}명
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Stats Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs text-slate-400 font-bold block">선택 연도 대기 인원</span>
              <span className="text-2xl font-black text-slate-900 mt-1 block">
                {activeCandidates.length}
                <span className="text-xs font-normal text-slate-400 ml-1">명</span>
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs text-amber-500 font-bold block">대기 중 (일반/긴급)</span>
              <span className="text-2xl font-black text-amber-600 mt-1 block">
                {activeCandidates.filter(c => c.category === '대기' || c.category === '긴급대기').length}
                <span className="text-xs font-normal text-slate-400 ml-1">명</span>
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs text-emerald-600 font-bold block">서비스 이용/매칭</span>
              <span className="text-2xl font-black text-emerald-600 mt-1 block">
                {activeCandidates.filter(c => c.category === '이용중' || getLastLogMatching(c) === 'O').length}
                <span className="text-xs font-normal text-slate-400 ml-1">명</span>
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs text-slate-400 font-bold block">종결 및 보류</span>
              <span className="text-2xl font-black text-slate-600 mt-1 block">
                {activeCandidates.filter(c => c.category === '종결' || c.category === '보류').length}
                <span className="text-xs font-normal text-slate-400 ml-1">명</span>
              </span>
            </div>
          </div>

        </div>

        {/* EXCEL IMPORTER DRAWER */}
        <AnimatePresence>
          {showImporter && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <ExcelImporter 
                onImport={handleMassImport} 
                onClose={() => setShowImporter(false)} 
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* CANDIDATE TABLE COMPONENT */}
        <CandidateTable
          candidates={activeCandidates}
          onAddNew={() => {
            setEditingCandidate(null);
            setIsModalOpen(true);
          }}
          onEdit={(candidate) => {
            setEditingCandidate(candidate);
            setIsModalOpen(true);
          }}
          onDelete={handleDeleteCandidate}
          onUpdateCategory={handleUpdateCategory}
          selectedYear={selectedYear}
          privacyMode={privacyMode}
          onOpenMatchingRecord={(cand) => {
            setSelectedCandidateForRecord(cand);
            setCurrentTab('matchingRecord');
          }}
        />
          </>
        )}
      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-100 py-4 px-6 text-center text-xs text-slate-400 print:hidden">
        <p>수원시장애인종합복지관 이용대기명단 전산관리 시스템 · 개인정보보호법 준수 암호화 관리</p>
      </footer>

      {/* SCREEN LOCK MODAL (Privacy Protection) */}
      <AnimatePresence>
        {isScreenLocked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 print:hidden"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-sm w-full p-8 shadow-2xl border border-slate-200 text-center space-y-5"
            >
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto shadow-inner">
                <Lock className="w-8 h-8 text-indigo-600" />
              </div>
              
              <div>
                <h3 className="text-lg font-black text-slate-900">화면 보호 잠금 중</h3>
                <p className="text-xs text-slate-500 mt-1">
                  자리 비움 및 개인정보 보호를 위해 화면이 안전하게 보호되고 있습니다.
                </p>
                <div className="mt-2 text-[11px] font-bold text-indigo-700 bg-indigo-50/80 px-3 py-1.5 rounded-xl inline-block border border-indigo-100">
                  담당자: {staffProfile.name || staffProfile.email}
                </div>
              </div>

              <div className="space-y-3.5">
                <div className="relative">
                  <input
                    type="password"
                    value={lockPinInput}
                    onChange={(e) => {
                      setLockPinInput(e.target.value);
                      if (lockPinError) setLockPinError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleUnlockScreen();
                      }
                    }}
                    placeholder="잠금 해제 비밀번호"
                    className={`w-full text-center text-xs font-bold px-3.5 py-2.5 rounded-xl border bg-slate-50/50 focus:bg-white focus:outline-indigo-600 focus:border-indigo-600 text-slate-800 transition-all shadow-inner ${
                      lockPinError ? 'border-rose-300 focus:border-rose-500 focus:outline-rose-500' : 'border-slate-200'
                    }`}
                  />
                </div>
                {lockPinError && (
                  <p className="text-[11px] font-semibold text-rose-600 flex items-center justify-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span>
                    {lockPinError}
                  </p>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleUnlockScreen}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-md shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Unlock className="w-4 h-4" />
                  <span>잠금 해제 및 업무 복귀</span>
                </button>
              </div>

              <p className="text-[10px] text-slate-400">
                개인정보보호법에 의거하여 화면 잠금 및 마스킹 기능이 상시 가동됩니다.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CANDIDATE DETAIL / ADD MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <CandidateDetailModal
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
              setEditingCandidate(null);
            }}
            candidate={editingCandidate}
            onSave={handleSaveCandidate}
          />
        )}
      </AnimatePresence>

      {/* CONFIRMATION DIALOG MODAL */}
      <AnimatePresence>
        {confirmDialog?.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4"
            >
              <div className="flex items-center gap-3 text-rose-600">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-base font-black text-slate-900">{confirmDialog.title}</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                {confirmDialog.message}
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDialog(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    confirmDialog.onConfirm();
                    setConfirmDialog(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-md shadow-rose-600/20 cursor-pointer"
                >
                  {confirmDialog.actionText || '확인'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PWA INSTALL GUIDE MODAL */}
      <AnimatePresence>
        {showInstallGuide && (
          <InstallGuideModal
            isOpen={showInstallGuide}
            onClose={() => setShowInstallGuide(false)}
            deferredPrompt={deferredPrompt}
            isAppInstalled={isAppInstalled}
            onTriggerInstall={handleTriggerInstall}
          />
        )}
      </AnimatePresence>

      {/* GOOGLE DRIVE & SHEETS SYNC MODAL */}
      <AnimatePresence>
        {showGoogleSyncModal && (
          <GoogleDriveSyncModal
            isOpen={showGoogleSyncModal}
            onClose={() => setShowGoogleSyncModal(false)}
            candidates={candidates}
            syncState={googleSyncState}
            onSyncStateChange={(newState) => setGoogleSyncState(newState)}
          />
        )}
      </AnimatePresence>

      {/* FLOATING SYNC NOTIFICATION TOAST */}
      <AnimatePresence>
        {googleSyncNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-20 right-6 z-50 px-4 py-2.5 bg-emerald-800/95 text-white text-xs font-bold rounded-2xl shadow-xl flex items-center gap-2.5 border border-emerald-500/50 backdrop-blur-md"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>{googleSyncNotification}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
