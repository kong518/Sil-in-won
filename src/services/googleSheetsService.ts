import { Candidate } from '../types';
import { auth } from './firebaseService';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id?: string;
            scope: string;
            callback: (response: { access_token?: string; error?: any }) => void;
            error_callback?: (err: any) => void;
          }) => {
            requestAccessToken: (options?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

// Default OAuth Client ID from Google Cloud / Firebase setup
const DEFAULT_CLIENT_ID = firebaseConfig.oAuthClientId || '814202677309-ckn0g455cvhbg1dj6mi4vo73k2uojfna.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';

export const SPREADSHEET_DEFAULT_NAME = '활동지원 이용대기 명단';
export const SHEET_TAB_NAME = '이용대기명단';

export const getClientId = (): string => {
  return localStorage.getItem('google_oauth_custom_client_id') || DEFAULT_CLIENT_ID;
};

export const setClientId = (id: string) => {
  if (id.trim()) {
    localStorage.setItem('google_oauth_custom_client_id', id.trim());
  } else {
    localStorage.removeItem('google_oauth_custom_client_id');
  }
};

export interface GoogleSyncState {
  isConnected: boolean;
  syncType?: 'oauth' | 'webhook';
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  spreadsheetName: string | null;
  webhookUrl?: string | null;
  lastSyncedAt: string | null;
  userEmail: string | null;
  autoSyncEnabled?: boolean;
  folderUrl?: string | null;
}

const STORAGE_KEY = 'google_sheet_sync_info';
const TOKEN_STORAGE_KEY = 'google_oauth_access_token';
const TOKEN_EXPIRY_KEY = 'google_oauth_token_expiry';

export const getSavedSyncState = (): GoogleSyncState => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        ...parsed,
        autoSyncEnabled: parsed.autoSyncEnabled ?? true,
        folderUrl: parsed.folderUrl || null
      };
    } catch {
      // fallback
    }
  }
  return {
    isConnected: false,
    syncType: 'oauth',
    spreadsheetId: null,
    spreadsheetUrl: null,
    spreadsheetName: SPREADSHEET_DEFAULT_NAME,
    webhookUrl: null,
    lastSyncedAt: null,
    userEmail: null,
    autoSyncEnabled: true,
    folderUrl: null
  };
};

export const saveSyncState = (state: GoogleSyncState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const getSavedAccessToken = (): string | null => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (token && expiry) {
    if (Date.now() < parseInt(expiry, 10)) {
      return token;
    }
  }
  return null;
};

export const setSavedAccessToken = (token: string, expiresInSec = 3500) => {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + expiresInSec * 1000));
};

export const clearGoogleAuth = () => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  const state = getSavedSyncState();
  saveSyncState({
    ...state,
    isConnected: false
  });
};

/**
 * Ensure Google GSI client library is loaded without blocking
 */
export const ensureGoogleScriptLoaded = (): Promise<void> => {
  return new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) {
      return resolve();
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);

    setTimeout(() => resolve(), 2000);
  });
};

/**
 * Request Access Token using Firebase Auth GoogleAuthProvider or GSI Token Client
 */
export const requestGoogleAccessToken = async (): Promise<string> => {
  // Check if we have a valid cached token
  const existingToken = getSavedAccessToken();
  if (existingToken) {
    return existingToken;
  }

  // 1. Try Firebase Auth popup with scopes
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/spreadsheets');
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.setCustomParameters({ prompt: 'consent' });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      setSavedAccessToken(credential.accessToken);
      return credential.accessToken;
    }
  } catch (firebaseErr: any) {
    console.warn('Firebase popup token request warning, trying GSI token client fallback:', firebaseErr);
  }

  // 2. GSI Client Fallback
  await ensureGoogleScriptLoaded();

  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: getClientId(),
          scope: SCOPES,
          callback: (response) => {
            if (response.error) {
              console.error('OAuth Token error:', response.error);
              return reject(new Error(`인증에 실패했습니다: ${response.error.message || response.error}`));
            }
            if (response.access_token) {
              setSavedAccessToken(response.access_token);
              resolve(response.access_token);
            } else {
              reject(new Error('토큰을 받지 못했습니다.'));
            }
          },
          error_callback: (err) => {
            console.error('OAuth Init Error:', err);
            reject(new Error('Google 계정 선택 창이 닫혔거나 취소되었습니다.'));
          }
        });

        client.requestAccessToken({ prompt: 'consent' });
        return;
      } catch (err: any) {
        console.warn('GSI client init warning:', err);
      }
    }

    // 3. Direct Google OAuth Window fallback
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
      getClientId()
    )}&redirect_uri=${encodeURIComponent(
      window.location.origin
    )}&response_type=token&scope=${encodeURIComponent(SCOPES)}&prompt=consent`;

    const popup = window.open(
      authUrl,
      'google_oauth_popup',
      'width=500,height=650,menubar=no,toolbar=no,location=no,status=no'
    );

    if (!popup) {
      return reject(new Error('브라우저에서 구글 로그인 팝업 창이 차단되었습니다. 주소창의 팝업 차단을 해제해 주세요.'));
    }

    const interval = setInterval(() => {
      try {
        if (!popup || popup.closed) {
          clearInterval(interval);
          reject(new Error('Google 로그인 창이 닫혔습니다.'));
          return;
        }

        const url = popup.location.href;
        if (url && url.includes('access_token=')) {
          const params = new URLSearchParams(popup.location.hash.substring(1));
          const token = params.get('access_token');
          if (token) {
            clearInterval(interval);
            popup.close();
            setSavedAccessToken(token);
            resolve(token);
          }
        }
      } catch {
        // Cross-origin access error is normal while on google.com
      }
    }, 500);
  });
};

/**
 * Fetch basic user info from Google
 */
export const fetchGoogleUserInfo = async (token: string): Promise<{ email?: string; name?: string }> => {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Could not fetch userinfo', err);
  }
  return {};
};

/**
 * Helper to calculate matching status 'O' or 'X' from candidate's consultation logs
 * Exactly identical to Excel Export logic!
 */
export const getCandidateMatchingStatus = (candidate: Candidate): 'O' | 'X' => {
  if (!candidate.consultationLogs || candidate.consultationLogs.length === 0) return 'X';
  const sortedLogs = [...candidate.consultationLogs].sort((a, b) => a.date.localeCompare(b.date));
  const lastLog = sortedLogs[sortedLogs.length - 1];
  if (!lastLog) return 'X';
  const text = lastLog.content || '';
  
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

/**
 * Exact Excel-identical column headers (17 items)
 */
export const EXCEL_HEADERS = [
  '순번', '구분', '접수일', '접수자', '성명', '생년월일', '성별', '장애유형', '급수', '국비', '도비', '시비', '주소', '연락처', '서비스내용', '추가상담', '매칭여부'
];

/**
 * Format candidate list into 2D Array matching the Excel Export (.xlsx) output 100%
 */
export const formatCandidatesLikeExcel = (candidates: Candidate[]): (string | number)[][] => {
  const rows = candidates.map((cand, idx) => {
    // 1. Combined address
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

    // 2. Combined service content and special notes
    const serviceCombined = `${cand.serviceContent || ''}${cand.specialNotes ? `\n[특이사항]: ${cand.specialNotes}` : ''}`.trim();
    
    // 3. Chronological consultation logs joined with newline
    const sortedLogs = cand.consultationLogs && cand.consultationLogs.length > 0 
      ? [...cand.consultationLogs].sort((a, b) => a.date.localeCompare(b.date))
      : [];
    const logsCombined = sortedLogs.length > 0 
      ? sortedLogs.map(l => `[${l.date}] ${l.content}`).join('\n')
      : '상담기록 없음';

    // 4. Matching status
    const matchedVal = getCandidateMatchingStatus(cand);

    return [
      idx + 1,
      cand.category || '대기',
      cand.registrationDate || '',
      cand.registrar || '미기재',
      cand.name || '',
      cand.birthDate || '미기재',
      cand.gender || '',
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

  return [EXCEL_HEADERS, ...rows];
};

export const extractFolderId = (urlOrId: string): string | null => {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (!trimmed.includes('/')) {
    return trimmed;
  }
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  if (folderMatch) {
    return folderMatch[1];
  }
  const idMatch = trimmed.match(/id=([a-zA-Z0-9-_]+)/);
  if (idMatch) {
    return idMatch[1];
  }
  return null;
};

export const ensureFileInFolder = async (
  token: string,
  fileId: string,
  folderUrlOrId?: string | null
): Promise<void> => {
  const folderId = extractFolderId(folderUrlOrId || '');
  if (!folderId) return;

  try {
    // 1. Get the current parents of the file
    const getFileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!getFileRes.ok) return;

    const fileInfo = await getFileRes.json();
    const parents: string[] = fileInfo.parents || [];

    // 2. If the file is already in the target folder, do nothing!
    if (parents.includes(folderId)) {
      return;
    }

    // 3. Otherwise, move the file to the target folder
    const removeParents = parents.length > 0 ? parents.join(',') : 'root';
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${folderId}&removeParents=${removeParents}&enforceSingleParentBehavior=true&supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (err) {
    console.warn('Failed to ensure file is in target folder:', err);
  }
};

/**
 * Finds the single existing '활동지원 이용대기 명단' Google Sheet in Drive,
 * or creates it if it does not already exist.
 * This guarantees a single persistent spreadsheet is updated instead of creating new ones!
 */
export const getOrCreateWaitlistSpreadsheet = async (
  token: string,
  preferredTitle = SPREADSHEET_DEFAULT_NAME,
  folderUrlOrId?: string | null
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; isNew: boolean }> => {
  // 1. If we have a saved spreadsheetId, verify it's still accessible in Google Drive
  const savedState = getSavedSyncState();
  if (savedState.spreadsheetId) {
    try {
      const checkRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${savedState.spreadsheetId}?fields=spreadsheetId,spreadsheetUrl,properties.title`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (checkRes.ok) {
        const data = await checkRes.json();
        // Ensure folder alignment even for verified existing spreadsheet
        await ensureFileInFolder(token, data.spreadsheetId, folderUrlOrId);
        return {
          spreadsheetId: data.spreadsheetId,
          spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
          isNew: false
        };
      }
    } catch (e) {
      console.warn('Saved spreadsheet ID verification failed, searching Drive...', e);
    }
  }

  // 2. Search Drive for existing spreadsheet named '활동지원 이용대기 명단'
  // supportsAllDrives=true & includeItemsFromAllDrives=true handles searching inside Shared Drives too!
  try {
    const q = encodeURIComponent(`name = '${preferredTitle}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`);
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        const file = searchData.files[0];
        // Ensure folder alignment even for found existing spreadsheet
        await ensureFileInFolder(token, file.id, folderUrlOrId);
        return {
          spreadsheetId: file.id,
          spreadsheetUrl: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit`,
          isNew: false
        };
      }
    }
  } catch (searchErr) {
    console.warn('Drive search error, proceeding to create check:', searchErr);
  }

  // 3. If none found, create a brand new single Google Spreadsheet with sheet '이용대기명단'
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        title: preferredTitle
      },
      sheets: [
        {
          properties: {
            title: SHEET_TAB_NAME,
            gridProperties: {
              frozenRowCount: 1
            }
          }
        }
      ]
    })
  });

  if (!createRes.ok) {
    const errBody = await createRes.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `구글 시트 생성 중 오류가 발생했습니다 (${createRes.status})`);
  }

  const createdData = await createRes.json();
  const spreadsheetId = createdData.spreadsheetId;
  const spreadsheetUrl = createdData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // 4. Move newly created spreadsheet to a shared drive folder if specified
  await ensureFileInFolder(token, spreadsheetId, folderUrlOrId);

  return { spreadsheetId, spreadsheetUrl, isNew: true };
};

/**
 * Synchronize / Overwrite full structured candidate dataset into the specific Google Sheet.
 * Formats the sheet identical to Excel (.xlsx) export:
 * - 17 columns
 * - Header styling: Emerald green background (#059669), bold white text, centered
 * - Frozen header row
 * - Data row alignment: Left for Address(12), Service(14), Logs(15); Center for other 14 columns
 * - Text wrapping enabled
 * - Column pixel widths matching Excel wch
 */
export const syncCandidatesToSpreadsheet = async (
  token: string, 
  spreadsheetId: string, 
  candidates: Candidate[]
): Promise<{ updatedCells: number; updatedRows: number }> => {
  const values = formatCandidatesLikeExcel(candidates);

  // 1. Inspect sheet metadata to find sheet title and sheetId
  let targetSheetName = SHEET_TAB_NAME;
  let targetSheetId = 0;
  try {
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (metaRes.ok) {
      const meta = await metaRes.json();
      if (meta.sheets && meta.sheets.length > 0) {
        const found = meta.sheets.find((s: any) => s.properties?.title === SHEET_TAB_NAME);
        if (found) {
          targetSheetName = found.properties.title;
          targetSheetId = found.properties.sheetId || 0;
        } else {
          // Use first sheet and rename it or target it
          targetSheetName = meta.sheets[0].properties?.title || SHEET_TAB_NAME;
          targetSheetId = meta.sheets[0].properties?.sheetId || 0;
        }
      }
    }
  } catch (e) {
    console.warn('Could not inspect sheet metadata', e);
  }

  // 2. Clear old data from range
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(targetSheetName)}'!A1:Q:clear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }).catch(() => {});

  // 3. Write all rows (17 columns, formatted like Excel)
  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(targetSheetName)}'!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        range: `'${targetSheetName}'!A1`,
        majorDimension: 'ROWS',
        values: values
      })
    }
  );

  if (!writeRes.ok) {
    const errBody = await writeRes.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `구글 시트 데이터 저장 실패 (${writeRes.status})`);
  }

  const writeData = await writeRes.json();

  // 4. Batch styling matching Excel export
  try {
    // Column pixel widths based on Excel wch requested by user:
    // A(55), B(55), C(75), D(70), E(65), F(82), G(55), H(82), I(60), J(55), K(55), L(55), M(215), N(130), O(320), P(260), Q(82)
    const colWidths = [55, 55, 75, 70, 65, 82, 55, 82, 60, 55, 55, 55, 215, 130, 320, 260, 82];
    const dimensionRequests = colWidths.map((w, idx) => ({
      updateDimensionProperties: {
        range: {
          sheetId: targetSheetId,
          dimension: 'COLUMNS',
          startIndex: idx,
          endIndex: idx + 1
        },
        properties: {
          pixelSize: w
        },
        fields: 'pixelSize'
      }
    }));

    const totalRows = Math.max(values.length, 2);

    const requests: any[] = [
      // Freeze header row
      {
        updateSheetProperties: {
          properties: {
            sheetId: targetSheetId,
            gridProperties: {
              frozenRowCount: 1
            }
          },
          fields: 'gridProperties.frozenRowCount'
        }
      },
      // Format Header Row (#059669 Emerald, bold white text, center, middle)
      {
        repeatCell: {
          range: {
            sheetId: targetSheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 17
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.02, green: 0.588, blue: 0.412 },
              textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              wrapStrategy: 'WRAP'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)'
        }
      },
      // Set basic filter on header row and all candidate rows
      {
        setBasicFilter: {
          filter: {
            range: {
              sheetId: targetSheetId,
              startRowIndex: 0,
              endRowIndex: totalRows,
              startColumnIndex: 0,
              endColumnIndex: 17
            }
          }
        }
      },
      // Format Data Rows: default centered, middle, text wrap
      {
        repeatCell: {
          range: {
            sheetId: targetSheetId,
            startRowIndex: 1,
            endRowIndex: totalRows,
            startColumnIndex: 0,
            endColumnIndex: 17
          },
          cell: {
            userEnteredFormat: {
              textFormat: { fontSize: 10, foregroundColor: { red: 0.12, green: 0.16, blue: 0.23 } },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              wrapStrategy: 'WRAP'
            }
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)'
        }
      },
      // Left align for Address (col index 12)
      {
        repeatCell: {
          range: {
            sheetId: targetSheetId,
            startRowIndex: 1,
            endRowIndex: totalRows,
            startColumnIndex: 12,
            endColumnIndex: 13
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'LEFT'
            }
          },
          fields: 'userEnteredFormat.horizontalAlignment'
        }
      },
      // Left align for Service (col index 14) and Additional Logs (col index 15)
      {
        repeatCell: {
          range: {
            sheetId: targetSheetId,
            startRowIndex: 1,
            endRowIndex: totalRows,
            startColumnIndex: 14,
            endColumnIndex: 16
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'LEFT'
            }
          },
          fields: 'userEnteredFormat.horizontalAlignment'
        }
      },
      ...dimensionRequests
    ];

    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requests })
    });
  } catch (styleErr) {
    console.warn('Styling format warning:', styleErr);
  }

  return {
    updatedCells: writeData.updatedCells || (values.length * values[0].length),
    updatedRows: writeData.updatedRows || values.length
  };
};

/**
 * Sync candidates via Google Apps Script Web App Webhook URL (alternative method)
 */
export const syncViaWebhook = async (webhookUrl: string, candidates: Candidate[]): Promise<{ count: number }> => {
  const rows = formatCandidatesLikeExcel(candidates);
  const payload = {
    updatedAt: new Date().toISOString(),
    totalCount: candidates.length,
    rows: rows
  };

  await fetch(webhookUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return { count: candidates.length };
};
