import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  getDocs, 
  deleteDoc, 
  onSnapshot, 
  writeBatch,
  query,
  limit
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously,
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Candidate, MatchingRecord } from '../types';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || 'ai-studio-remix-d84c0d42-c0f4-4b8f-8197-53bea2537fd8');

export interface StaffProfile {
  name: string;
  email: string;
  department: string;
}

export const getSavedStaffProfile = (): StaffProfile => {
  const saved = localStorage.getItem('suwon_staff_profile');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // fallback
    }
  }
  return {
    name: '복지관 담당자',
    email: 'kong@suwonrehab.or.kr',
    department: '상담·사례관리팀'
  };
};

export const ALLOWED_DOMAIN = 'suwonrehab.or.kr';

/**
 * Check if the provided email strictly belongs to the allowed Google Workspace domain
 */
export const isAllowedEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return clean.endsWith(`@${ALLOWED_DOMAIN}`);
};

export const saveStaffProfile = (profile: StaffProfile) => {
  localStorage.setItem('suwon_staff_profile', JSON.stringify(profile));
};

/**
 * Sign in strictly with Google Workspace (@suwonrehab.or.kr)
 */
export const signInWithGoogle = async (): Promise<StaffProfile> => {
  const googleProvider = new GoogleAuthProvider();
  // Request account picker and hint domain to suwonrehab.or.kr
  googleProvider.setCustomParameters({ 
    prompt: 'select_account',
    hd: ALLOWED_DOMAIN
  });

  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;

  // Enforce security domain check
  if (!user.email || !isAllowedEmail(user.email)) {
    const rejected = user.email || '미확인 계정';
    await firebaseSignOut(auth);
    localStorage.removeItem('suwon_staff_logged_in');
    localStorage.removeItem('suwon_staff_profile');
    
    const err: any = new Error(`UNAUTHORIZED_DOMAIN`);
    err.rejectedEmail = rejected;
    throw err;
  }

  const staffProfile: StaffProfile = {
    name: user.displayName || user.email.split('@')[0] || '복지관 담당자',
    email: user.email,
    department: '수원시장애인종합복지관'
  };

  saveStaffProfile(staffProfile);
  localStorage.setItem('suwon_staff_logged_in', 'true');
  return staffProfile;
};

// Sign Out
export const logoutUser = async (): Promise<void> => {
  try {
    await firebaseSignOut(auth);
  } catch (e) {
    console.warn('Logout error:', e);
  }
  localStorage.removeItem('suwon_staff_logged_in');
  localStorage.removeItem('suwon_staff_profile');
};

// Save/Update Candidate in Firestore
export const saveCandidateToFirestore = async (candidate: Candidate, userEmail?: string): Promise<void> => {
  try {
    const docRef = doc(db, 'candidate_master', 'main');
    const docSnap = await getDoc(docRef);
    let list: Candidate[] = [];
    if (docSnap.exists()) {
      list = docSnap.data().list || [];
    }
    const idx = list.findIndex(c => String(c.id) === String(candidate.id));
    if (idx >= 0) {
      list[idx] = candidate;
    } else {
      list.push(candidate);
    }
    await setDoc(docRef, {
      list,
      updatedAt: new Date().toISOString(),
      updatedBy: userEmail || '직원'
    });
  } catch (err: any) {
    if (err?.message?.includes('Quota') || err?.code === 'resource-exhausted') {
      console.warn('Firestore save notice: Quota limit reached. Saved locally in browser storage.');
    } else {
      console.warn('Firestore save notice:', err);
    }
  }
};

// Batch Upload initial candidates to Firestore if collection is empty
export const batchUploadCandidatesIfEmpty = async (initialCandidates: Candidate[], userEmail?: string): Promise<boolean> => {
  try {
    const docRef = doc(db, 'candidate_master', 'main');
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists() || !docSnap.data().list || docSnap.data().list.length === 0) {
      console.log(`Firestore가 비어있어 기본 ${initialCandidates.length}건을 일괄 업로드합니다...`);
      await setDoc(docRef, {
        list: initialCandidates,
        updatedAt: new Date().toISOString(),
        updatedBy: userEmail || '초기데이터'
      });
      return true;
    }
  } catch (err: any) {
    if (err?.message?.includes('Quota') || err?.code === 'resource-exhausted') {
      console.warn('Firestore initial batch check skipped (Quota limit reached). Using local storage.');
    } else {
      console.warn('Batch upload notice:', err);
    }
  }
  return false;
};

// Force batch upload entire local list to Firestore
export const forceUploadAllToFirestore = async (candidatesList: Candidate[], userEmail?: string): Promise<void> => {
  try {
    const docRef = doc(db, 'candidate_master', 'main');
    await setDoc(docRef, {
      list: candidatesList,
      updatedAt: new Date().toISOString(),
      updatedBy: userEmail || '전체동기화'
    });
  } catch (err: any) {
    if (err?.message?.includes('Quota') || err?.code === 'resource-exhausted') {
      console.warn('Firestore batch upload paused due to daily free quota limits.');
    } else {
      console.warn('Force upload error:', err);
    }
    throw err;
  }
};

// Delete Candidate from Firestore
export const deleteCandidateFromFirestore = async (candidateId: string | number): Promise<void> => {
  try {
    const docRef = doc(db, 'candidate_master', 'main');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const list: Candidate[] = docSnap.data().list || [];
      const filtered = list.filter(c => String(c.id) !== String(candidateId));
      await setDoc(docRef, {
        list: filtered,
        updatedAt: new Date().toISOString(),
        updatedBy: '직원'
      });
    }
  } catch (err: any) {
    console.warn('Firestore delete notice:', err);
  }
};

// Subscribe to real-time candidates updates
export const subscribeToCandidates = (
  onUpdate: (candidates: Candidate[]) => void,
  onError: (error: Error) => void
) => {
  const docRef = doc(db, 'candidate_master', 'main');
  return onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const list = docSnap.data().list || [];
        onUpdate(list);
      } else {
        onUpdate([]);
      }
    },
    (err) => {
      const isQuota = err.message?.includes('Quota') || (err as any).code === 'resource-exhausted';
      if (isQuota) {
        console.warn('Firestore snapshot subscription: Daily quota limit reached. Falling back to local offline storage.');
      } else {
        console.warn('Firestore snapshot subscription warning:', err);
      }
      onError(err);
    }
  );
};

// Save Matching Record to Firestore
export const saveMatchingRecordToFirestore = async (
  record: MatchingRecord,
  userEmail?: string
): Promise<void> => {
  try {
    const docRef = doc(db, 'matching_records', record.id);
    await setDoc(docRef, {
      ...record,
      updatedAt: new Date().toISOString(),
      updatedBy: userEmail || '담당자'
    }, { merge: true });
  } catch (err: any) {
    if (err?.message?.includes('Quota') || err?.code === 'resource-exhausted') {
      console.warn('Firestore matching_records save notice: Quota limit reached. Saved in local storage.');
    } else {
      console.warn('Firestore matching_records save notice:', err);
    }
  }
};

// Delete Matching Record from Firestore
export const deleteMatchingRecordFromFirestore = async (recordId: string): Promise<void> => {
  try {
    const docRef = doc(db, 'matching_records', recordId);
    await deleteDoc(docRef);
  } catch (err: any) {
    console.warn('Firestore delete matching record notice:', err);
  }
};

// Subscribe to real-time Matching Records updates
export const subscribeToMatchingRecords = (
  onUpdate: (records: MatchingRecord[]) => void,
  onError: (error: Error) => void
) => {
  const recordsRef = collection(db, 'matching_records');
  return onSnapshot(
    recordsRef,
    (snapshot) => {
      const list: MatchingRecord[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as MatchingRecord);
      });
      // Sort by updatedAt descending
      list.sort((a, b) => ((b.updatedAt || '') > (a.updatedAt || '') ? 1 : -1));
      onUpdate(list);
    },
    (err) => {
      const isQuota = err.message?.includes('Quota') || (err as any).code === 'resource-exhausted';
      if (isQuota) {
        console.warn('Firestore matching_records subscription: Quota limit reached. Operating in local mode.');
      } else {
        console.warn('Firestore matching_records subscription notice:', err);
      }
      onError(err);
    }
  );
};
