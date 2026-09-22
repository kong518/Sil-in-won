import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  FileSpreadsheet, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Cloud, 
  Check, 
  Copy, 
  Sparkles, 
  ShieldCheck, 
  ArrowRight,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { Candidate } from '../types';
import { 
  GoogleSyncState, 
  saveSyncState, 
  requestGoogleAccessToken, 
  fetchGoogleUserInfo,
  getOrCreateWaitlistSpreadsheet, 
  syncCandidatesToSpreadsheet,
  syncViaWebhook,
  clearGoogleAuth,
  formatCandidatesLikeExcel,
  SPREADSHEET_DEFAULT_NAME,
  extractFolderId
} from '../services/googleSheetsService';

interface GoogleDriveSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: Candidate[];
  syncState: GoogleSyncState;
  onSyncStateChange: (state: GoogleSyncState) => void;
}

export default function GoogleDriveSyncModal({
  isOpen,
  onClose,
  candidates,
  syncState,
  onSyncStateChange
}: GoogleDriveSyncModalProps) {
  const [activeTab, setActiveTab] = useState<'oauth' | 'webhook' | 'clipboard'>('oauth');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Webhook / Apps Script form
  const [webhookUrl, setWebhookUrl] = useState(syncState.webhookUrl || '');
  const [folderUrl, setFolderUrl] = useState(syncState.folderUrl || '');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedClipboard, setCopiedClipboard] = useState(false);
  const [copiedMenuCode, setCopiedMenuCode] = useState(false);

  if (!isOpen) return null;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://ais-pre-6wrb5nktj2mlgfjyvceasc-324830255896.asia-northeast1.run.app';

  // Apps Script code for menu shortcut only (when using Google Direct OAuth sync)
  const menuAppsScriptCode = `function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🔗 이용대기명단 앱')
    .addItem('💻 대기명단 프로그램으로 이동', 'openAppUrl')
    .addToUi();
}

function openAppUrl() {
  var html = 
    "<!DOCTYPE html>" +
    "<html>" +
    "<head>" +
    "  <link href='https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap' rel='stylesheet'>" +
    "  <style>" +
    "    body { font-family: 'Noto Sans KR', sans-serif; background: #ffffff; padding: 20px; text-align: center; margin: 0; color: #1e293b; overflow: hidden; }" +
    "    .container { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; }" +
    "    .title { font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 6px; }" +
    "    .desc { font-size: 11px; color: #64748b; margin-bottom: 16px; line-height: 1.4; }" +
    "    .highlight-yellow { color: #b45309; font-weight: 700; background-color: #fef3c7; padding: 2px 6px; border-radius: 4px; }" +
    "    .btn-blue { display: inline-flex; align-items: center; justify-content: center; background-color: #2563eb; color: #ffffff; border: none; padding: 11px 22px; border-radius: 8px; font-size: 12px; font-weight: 700; text-decoration: none; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2); transition: all 0.15s ease-in-out; width: 85%; box-sizing: border-box; }" +
    "    .btn-blue:hover { background-color: #1d4ed8; transform: translateY(-1px); }" +
    "    .btn-blue:active { transform: translateY(0); }" +
    "  </style>" +
    "</head>" +
    "<body>" +
    "  <div class='container'>" +
    "    <div class='title'>💻 이용대기명단 프로그램 이동</div>" +
    "    <div class='desc'>안전한 보안 연결을 위해 아래 <span class='highlight-yellow'>[앱으로 이동하기]</span> 버튼을 눌러주세요.</div>" +
    "    <a href='${currentOrigin}' target='_blank' class='btn-blue' onclick='google.script.host.close()'>💻 앱으로 이동하기</a>" +
    "  </div>" +
    "</body>" +
    "</html>";
  var userInterface = HtmlService.createHtmlOutput(html)
    .setWidth(360)
    .setHeight(150);
  SpreadsheetApp.getUi().showModalDialog(userInterface, '이용대기명단 앱 이동');
}`;

  // Complete Apps Script code with data write, custom formatting, and menu shortcut (when using Webhook Sync mode)
  const appsScriptCode = `function doPost(e) {
  // 수동 실행 시 에러 방지용 안전 가드 추가
  if (!e || !e.postData || !e.postData.contents) {
    Logger.log("이 함수는 대기명단 프로그램에서 '동기화'를 누를 때 자동으로 동작합니다. 구글 편집기 내부에서 '실행' 버튼을 직접 누르지 마세요.");
    return ContentService.createTextOutput(JSON.stringify({ 
      status: 'error', 
      message: '직접 실행은 지원되지 않습니다. 대기명단 앱에서 동기화를 작동해 주세요.' 
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: '데이터 분석 실패' })).setMimeType(ContentService.MimeType.JSON);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('이용대기명단') || ss.getActiveSheet();
  
  // 1. 기존 데이터 및 서식 비우기
  sheet.clearContents();
  
  if (data.rows && data.rows.length > 0) {
    // 2. 새로운 전체 대기명단 데이터 작성
    var range = sheet.getRange(1, 1, data.rows.length, data.rows[0].length);
    range.setValues(data.rows);
    
    // 3. 열 너비 지정: A(55), B(55), C(75), D(70), E(65), F(82), G(55), H(82), I(60), J-L(55), M(215), N(130), O(320), P(260), Q(82)
    var widths = [55, 55, 75, 70, 65, 82, 55, 82, 60, 55, 55, 55, 215, 130, 320, 260, 82];
    for (var i = 0; i < widths.length; i++) {
      sheet.setColumnWidth(i + 1, widths[i]);
    }
    
    // 4. 첫 번째 행(헤더) 고정
    sheet.setFrozenRows(1);
    
    // 5. 헤더 서식 지정 (에메랄드 그린 #059669 백그라운드, 흰색 볼드 텍스트, 가로/세로 가운데 정렬)
    var headerRange = sheet.getRange(1, 1, 1, 17);
    headerRange.setBackground('#059669')
               .setFontColor('#ffffff')
               .setFontWeight('bold')
               .setHorizontalAlignment('center')
               .setVerticalAlignment('middle');
               
    // 6. 데이터 영역 기본 가운데 정렬
    if (data.rows.length > 1) {
      var dataRange = sheet.getRange(2, 1, data.rows.length - 1, 17);
      dataRange.setHorizontalAlignment('center')
               .setVerticalAlignment('middle');
               
      // 주소(13열: M), 서비스내용(15열: O), 추가상담(16열: P)은 좌측 정렬로 가독성 높임
      sheet.getRange(2, 13, data.rows.length - 1, 1).setHorizontalAlignment('left');
      sheet.getRange(2, 15, data.rows.length - 1, 2).setHorizontalAlignment('left');
    }
    
    // 7. 자동 줄바꿈 활성화
    sheet.getRange(1, 1, data.rows.length, 17).setWrap(true);
    
    // 8. 데이터 전체 영역에 기본 정렬/필터 생성
    var filter = sheet.getFilter();
    if (filter) {
      filter.remove();
    }
    sheet.getRange(1, 1, data.rows.length, 17).createFilter();
  }
  
  return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// 상단 도구바 메뉴에 바로가기 생성
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🔗 이용대기명단 앱')
    .addItem('💻 대기명단 프로그램으로 이동', 'openAppUrl')
    .addToUi();
}

function openAppUrl() {
  var html = 
    "<!DOCTYPE html>" +
    "<html>" +
    "<head>" +
    "  <link href='https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap' rel='stylesheet'>" +
    "  <style>" +
    "    body { font-family: 'Noto Sans KR', sans-serif; background: #ffffff; padding: 20px; text-align: center; margin: 0; color: #1e293b; overflow: hidden; }" +
    "    .container { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; }" +
    "    .title { font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 6px; }" +
    "    .desc { font-size: 11px; color: #64748b; margin-bottom: 16px; line-height: 1.4; }" +
    "    .highlight-yellow { color: #b45309; font-weight: 700; background-color: #fef3c7; padding: 2px 6px; border-radius: 4px; }" +
    "    .btn-blue { display: inline-flex; align-items: center; justify-content: center; background-color: #2563eb; color: #ffffff; border: none; padding: 11px 22px; border-radius: 8px; font-size: 12px; font-weight: 700; text-decoration: none; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2); transition: all 0.15s ease-in-out; width: 85%; box-sizing: border-box; }" +
    "    .btn-blue:hover { background-color: #1d4ed8; transform: translateY(-1px); }" +
    "    .btn-blue:active { transform: translateY(0); }" +
    "  </style>" +
    "</head>" +
    "<body>" +
    "  <div class='container'>" +
    "    <div class='title'>💻 이용대기명단 프로그램 이동</div>" +
    "    <div class='desc'>안전한 보안 연결을 위해 아래 <span class='highlight-yellow'>[앱으로 이동하기]</span> 버튼을 눌러주세요.</div>" +
    "    <a href='${currentOrigin}' target='_blank' class='btn-blue' onclick='google.script.host.close()'>💻 앱으로 이동하기</a>" +
    "  </div>" +
    "</body>" +
    "</html>";
  var userInterface = HtmlService.createHtmlOutput(html)
    .setWidth(360)
    .setHeight(150);
  SpreadsheetApp.getUi().showModalDialog(userInterface, '이용대기명단 앱 이동');
}`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(appsScriptCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  // Copy entire sheet data to clipboard (TSV format for direct Ctrl+V into Google Sheets)
  const handleCopySheetToClipboard = () => {
    const tableData = formatCandidatesLikeExcel(candidates);
    const tsvString = tableData.map(row => row.map(cell => String(cell).replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t')).join('\n');
    navigator.clipboard.writeText(tsvString);
    setCopiedClipboard(true);
    setTimeout(() => setCopiedClipboard(false), 2500);
  };

  // 1. Direct Google Drive & Sheets Connect (Single Sheet: 활동지원 이용대기 명단)
  const handleOAuthConnect = async () => {
    const trimmed = folderUrl.trim();
    const folderId = extractFolderId(trimmed);

    if (trimmed && folderId && folderId.length < 33) {
      if (!confirm(`⚠️ 입력하신 폴더 ID의 길이(${folderId.length}자)가 표준 구글 드라이브 폴더 ID(33자)보다 짧습니다.\n주소가 복사 중 일부 누락되었을 수 있습니다. 이대로 진행하시겠습니까?\n\n올바른 주소 예시:\nhttps://drive.google.com/drive/folders/1cfhfJefRVcvTuIZXQtFUu5Gol-va8S0w`)) {
        return;
      }
    }

    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage('Google 계정 인증 창을 여는 중입니다...');

    try {
      const token = await requestGoogleAccessToken();
      const userInfo = await fetchGoogleUserInfo(token);

      setStatusMessage(`구글 드라이브에서 「${SPREADSHEET_DEFAULT_NAME}」 시트를 확인하는 중...`);
      
      // Automatically find existing single sheet or create it once
      const { spreadsheetId, spreadsheetUrl, isNew } = await getOrCreateWaitlistSpreadsheet(token, SPREADSHEET_DEFAULT_NAME, folderUrl);

      setStatusMessage(
        isNew 
          ? `새 스프레드시트 「${SPREADSHEET_DEFAULT_NAME}」에 대기명단(${candidates.length}건)을 전송 중...`
          : `기존 스프레드시트 「${SPREADSHEET_DEFAULT_NAME}」에 최신 대기명단(${candidates.length}건)을 동기화 중...`
      );

      await syncCandidatesToSpreadsheet(token, spreadsheetId, candidates);

      const newState: GoogleSyncState = {
        isConnected: true,
        syncType: 'oauth',
        spreadsheetId,
        spreadsheetUrl,
        spreadsheetName: SPREADSHEET_DEFAULT_NAME,
        webhookUrl: null,
        lastSyncedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        userEmail: userInfo.email || 'Google 계정 연결됨',
        autoSyncEnabled: true,
        folderUrl: folderUrl.trim() || null
      };

      saveSyncState(newState);
      onSyncStateChange(newState);
      setStatusMessage(
        isNew 
          ? `🎉 구글 드라이브에 「${SPREADSHEET_DEFAULT_NAME}」이 생성되었으며 자동 저장이 시작되었습니다!`
          : `✨ 기존 「${SPREADSHEET_DEFAULT_NAME}」 시트에 최신 데이터가 성공적으로 업데이트되었습니다!`
      );
    } catch (err: any) {
      console.error('Google Sheet Connect Error:', err);
      setStatusMessage(null);
      setErrorMessage(err.message || '인증 중 오류가 발생했습니다. 브라우저 팝업 차단을 해제하거나 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Resync handler
  const handleResync = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage('최신 대기자 명단을 구글 시트에 업데이트하는 중...');

    try {
      if (syncState.syncType === 'webhook' && syncState.webhookUrl) {
        await syncViaWebhook(syncState.webhookUrl, candidates);
      } else {
        const token = await requestGoogleAccessToken();
        const resolved = await getOrCreateWaitlistSpreadsheet(token, SPREADSHEET_DEFAULT_NAME, folderUrl);
        await syncCandidatesToSpreadsheet(token, resolved.spreadsheetId, candidates);

        const newState: GoogleSyncState = {
          ...syncState,
          isConnected: true,
          spreadsheetId: resolved.spreadsheetId,
          spreadsheetUrl: resolved.spreadsheetUrl,
          folderUrl: folderUrl.trim() || null,
          lastSyncedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        };

        saveSyncState(newState);
        onSyncStateChange(newState);
      }

      setStatusMessage(`✨ 총 ${candidates.length}명의 최신 명단이 구글 시트에 실시간 갱신되었습니다!`);
    } catch (err: any) {
      console.error('Sync error:', err);
      setErrorMessage(err.message || '동기화 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Webhook Sync
  const handleWebhookConnect = async () => {
    if (!webhookUrl.trim() || !webhookUrl.startsWith('http')) {
      setErrorMessage('올바른 Google Apps Script 웹 앱 URL(https://script.google.com/...)을 입력해 주세요.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage(`구글 시트에 ${candidates.length}건의 데이터를 실시간 전송하고 있습니다...`);

    try {
      await syncViaWebhook(webhookUrl.trim(), candidates);

      const newState: GoogleSyncState = {
        isConnected: true,
        syncType: 'webhook',
        spreadsheetId: null,
        spreadsheetUrl: null,
        spreadsheetName: `${SPREADSHEET_DEFAULT_NAME} (웹앱 연동)`,
        webhookUrl: webhookUrl.trim(),
        lastSyncedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        userEmail: 'Apps Script 웹앱 실시간 연동',
        autoSyncEnabled: true
      };

      saveSyncState(newState);
      onSyncStateChange(newState);
      setStatusMessage('🎉 Google 스프레드시트에 전체 대기명단이 성공적으로 저장 및 연동되었습니다!');
    } catch (err: any) {
      console.error('Webhook sync error:', err);
      setErrorMessage(err.message || '데이터 전송 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Toggle Auto-Sync
  const handleToggleAutoSync = () => {
    const newState: GoogleSyncState = {
      ...syncState,
      autoSyncEnabled: !(syncState.autoSyncEnabled ?? true)
    };
    saveSyncState(newState);
    onSyncStateChange(newState);
  };

  // 4.5. Update Folder URL Only
  const handleUpdateFolderUrlOnly = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage('구글 폴더 정보를 확인하고 시트 위치를 이동하는 중...');

    const trimmed = folderUrl.trim();
    const folderId = extractFolderId(trimmed);

    if (trimmed && folderId && folderId.length < 33) {
      if (!confirm(`⚠️ 입력하신 폴더 ID의 길이(${folderId.length}자)가 표준 구글 드라이브 폴더 ID(33자)보다 짧습니다.\n주소가 복사 중 일부 누락되었을 수 있습니다. 이대로 진행하시겠습니까?\n\n올바른 주소 예시:\nhttps://drive.google.com/drive/folders/1cfhfJefRVcvTuIZXQtFUu5Gol-va8S0w`)) {
        setIsLoading(false);
        setStatusMessage(null);
        return;
      }
    }

    try {
      const token = await requestGoogleAccessToken();
      
      // Resolve the spreadsheet and move it to the newly configured folder
      const resolved = await getOrCreateWaitlistSpreadsheet(token, SPREADSHEET_DEFAULT_NAME, trimmed);
      
      // Update data immediately inside the new folder
      await syncCandidatesToSpreadsheet(token, resolved.spreadsheetId, candidates);

      const newState: GoogleSyncState = {
        ...syncState,
        isConnected: true,
        spreadsheetId: resolved.spreadsheetId,
        spreadsheetUrl: resolved.spreadsheetUrl,
        folderUrl: trimmed || null,
        lastSyncedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };

      saveSyncState(newState);
      onSyncStateChange(newState);
      setStatusMessage('📂 저장 공유 폴더가 정상적으로 설정되었습니다. 구글 시트가 해당 폴더 내로 완벽하게 이동되었으며, 최신 데이터로 실시간 동기화 완료되었습니다!');
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      console.error('Folder update error:', err);
      setErrorMessage(err.message || '저장 폴더 변경 처리 중 오류가 발생했습니다. 폴더 주소 및 접근 권한을 확인해 주세요.');
      setStatusMessage(null);
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Disconnect
  const handleDisconnect = () => {
    if (confirm('Google 드라이브 시트 자동 저장 연동을 해제하시겠습니까?')) {
      clearGoogleAuth();
      const resetState: GoogleSyncState = {
        isConnected: false,
        syncType: 'oauth',
        spreadsheetId: null,
        spreadsheetUrl: null,
        spreadsheetName: SPREADSHEET_DEFAULT_NAME,
        webhookUrl: null,
        lastSyncedAt: null,
        userEmail: null,
        autoSyncEnabled: false
      };
      saveSyncState(resetState);
      onSyncStateChange(resetState);
      setStatusMessage('연동이 해제되었습니다.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-md">
              <FileSpreadsheet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight">구글시트 연동</h3>
              <p className="text-xs text-emerald-100">단일 시트 「{SPREADSHEET_DEFAULT_NAME}」에 실시간 자동 업데이트</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center transition-colors text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          
          {/* Status Messages */}
          {statusMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {syncState.isConnected ? (
            /* CONNECTED STATE */
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-xs">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                    구글 시트 자동 저장 작동 중
                  </span>
                  <span className="text-xs text-slate-500 font-bold">
                    {syncState.userEmail || 'Google 연결됨'}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-500">저장되는 단일 스프레드시트:</div>
                  <div className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>{syncState.spreadsheetName || SPREADSHEET_DEFAULT_NAME}</span>
                    <span className="text-[11px] font-normal text-slate-400">(탭: 이용대기명단)</span>
                  </div>
                </div>

                {syncState.folderUrl && (
                  <div className="space-y-1 pt-2 border-t border-emerald-200/40">
                    <div className="text-xs font-bold text-slate-500">저장 폴더 위치:</div>
                    <a
                      href={syncState.folderUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs font-black text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <span>📂 저장용 공유 드라이브 폴더 바로가기 ↗</span>
                    </a>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-emerald-200/60">
                  <span>최종 자동 동기화 시각:</span>
                  <span className="font-bold text-slate-800">{syncState.lastSyncedAt || '방금 전'}</span>
                </div>

                {/* Auto-sync switch */}
                <div className="flex items-center justify-between text-xs pt-2 border-t border-emerald-200/60">
                  <span className="font-semibold text-slate-700">대기자 수정/등록 시 자동 실시간 저장</span>
                  <button
                    type="button"
                    onClick={handleToggleAutoSync}
                    className="flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                  >
                    {(syncState.autoSyncEnabled ?? true) ? (
                      <span className="text-emerald-700 flex items-center gap-1">
                        <ToggleRight className="w-6 h-6 text-emerald-600" />
                        <span>켜짐 (권장)</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 flex items-center gap-1">
                        <ToggleLeft className="w-6 h-6 text-slate-400" />
                        <span>꺼짐 (수동)</span>
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* 📂 Shared Drive Folder Setting Box */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                <label className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 font-sans">📂</span>
                  <span>구글 공유 드라이브 / 저장 폴더 주소 설정</span>
                </label>
                <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                  <strong>팀 공유 드라이브나 특정 폴더 주소(URL)</strong>를 아래에 붙여넣으시면, 해당 폴더 안에 자동으로 시트가 예쁘게 생성되어 실시간 갱신됩니다! (비워두시면 개인 드라이브에 저장됩니다)
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={folderUrl}
                    onChange={(e) => setFolderUrl(e.target.value)}
                    placeholder="예: https://drive.google.com/drive/folders/폴더ID... 또는 폴더 ID"
                    className="flex-1 p-2.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 font-medium font-sans"
                  />
                  <button
                    type="button"
                    onClick={handleUpdateFolderUrlOnly}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shrink-0 transition-colors cursor-pointer shadow-sm"
                  >
                    변경 적용
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {syncState.spreadsheetUrl ? (
                  <a
                    href={syncState.spreadsheetUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="py-3 px-4 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-extrabold transition-all flex items-center justify-center gap-2 shadow-xs"
                  >
                    <ExternalLink className="w-4 h-4" />
                    구글 시트 바로 열기 ↗
                  </a>
                ) : (
                  <button
                    onClick={handleCopySheetToClipboard}
                    className="py-3 px-4 rounded-2xl bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 text-xs font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {copiedClipboard ? <Check className="w-4 h-4 text-teal-600" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedClipboard ? '클립보드 복사됨!' : '구글시트용 데이터 복사'}</span>
                  </button>
                )}

                <button
                  onClick={handleResync}
                  disabled={isLoading}
                  className="py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-500/10 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  {isLoading ? '동기화 진행 중...' : '지금 최신 데이터 동기화'}
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed font-medium flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-700 mb-0.5">엑셀과 동일한 17개 항목 형식 보장</p>
                  <p>
                    순번, 구분, 접수일, 접수자, 성명, 생년월일, 성별, 장애유형, 급수, 국비, 도비, 시비, 주소, 연락처, 서비스내용, 추가상담, 매칭여부까지 엑셀 내보내기와 100% 동일한 서식으로 갱신됩니다.
                  </p>
                </div>
              </div>

              <div className="pt-2 text-right">
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="text-xs text-slate-400 hover:text-rose-600 font-bold underline transition-colors cursor-pointer"
                >
                  구글 연동 해제
                </button>
              </div>
            </div>
          ) : (
            /* NOT CONNECTED: TABS */
            <div className="space-y-4">
              
              {/* Tab Selector */}
              <div className="flex rounded-2xl bg-slate-100 p-1 gap-1 text-xs font-bold text-slate-600">
                <button
                  type="button"
                  onClick={() => setActiveTab('oauth')}
                  className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === 'oauth' 
                      ? 'bg-white text-emerald-700 shadow-sm font-black' 
                      : 'hover:text-slate-900'
                  }`}
                >
                  <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                  <span>구글시트 연동</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('webhook')}
                  className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === 'webhook' 
                      ? 'bg-white text-emerald-700 shadow-sm font-black' 
                      : 'hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                  <span>Apps Script 웹앱</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('clipboard')}
                  className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === 'clipboard' 
                      ? 'bg-white text-emerald-700 shadow-sm font-black' 
                      : 'hover:text-slate-900'
                  }`}
                >
                  <Copy className="w-3.5 h-3.5 text-blue-600" />
                  <span>클립보드 복사</span>
                </button>
              </div>

              {/* TAB 1: OAUTH DIRECT AUTO-SYNC (RECOMMENDED & REQUESTED) */}
              {activeTab === 'oauth' && (
                <div className="space-y-4 pt-1">
                  <div className="p-4 bg-emerald-50/70 border border-emerald-200/70 rounded-2xl text-xs text-emerald-950 space-y-2">
                    <div className="font-black text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>단일 시트 자동 업데이트 안내</span>
                    </div>
                    <ul className="text-emerald-800 space-y-1.5 list-disc list-inside leading-relaxed">
                      <li>매번 새 시트를 생성하지 않고, 구글 드라이브 내의 <strong>「활동지원 이용대기 명단」</strong> 시트 하나에 계속 갱신됩니다.</li>
                      <li>대기자를 추가, 수정, 삭제할 때마다 구글 시트에도 <strong>실시간으로 자동 반영</strong>됩니다.</li>
                      <li>열 구조 및 서식은 <strong>엑셀 내보내기(17개 컬럼 및 에메랄드 헤더)</strong>와 100% 동일하게 저장됩니다.</li>
                    </ul>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                    <span className="font-semibold text-slate-700">대상 시트 문서명:</span>
                    <span className="font-black text-emerald-700">「{SPREADSHEET_DEFAULT_NAME}」</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <label className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 font-sans">📂</span>
                      <span>[선택] 공유 드라이브 또는 저장할 특정 폴더 주소 (URL)</span>
                    </label>
                    <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                      비워두면 개인 구글 드라이브(내 드라이브) 루트에 저장됩니다. <strong>팀 공유 드라이브나 공동 관리용 특정 폴더 주소(URL)</strong>를 아래에 붙여넣으시면, 해당 폴더 안에 자동으로 시트가 예쁘게 생성되어 실시간 갱신됩니다!
                    </p>
                    <input
                      type="text"
                      value={folderUrl}
                      onChange={(e) => setFolderUrl(e.target.value)}
                      placeholder="예: https://drive.google.com/drive/folders/폴더ID... 또는 폴더 ID"
                      className="w-full p-3 text-xs text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 font-medium font-sans"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleOAuthConnect}
                    disabled={isLoading}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Google Drive 시트 연동 중...</span>
                      </>
                    ) : (
                      <>
                        <Cloud className="w-4 h-4" />
                        <span>Google 드라이브 시트 자동 저장 연결하기</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* TAB 2: WEBHOOK / APPS SCRIPT */}
              {activeTab === 'webhook' && (
                <div className="space-y-4 pt-1">
                  <div className="p-3.5 bg-teal-50/70 border border-teal-200/70 rounded-2xl text-xs text-teal-950 space-y-1.5">
                    <p className="text-teal-800 leading-relaxed">
                      구글 시트의 <strong>[확장 프로그램] → [Apps Script]</strong>에 아래 코드를 붙여넣고 배포된 웹 앱 URL을 입력하시면 즉시 연동됩니다.
                    </p>
                  </div>

                  <div className="space-y-2 text-xs text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div className="font-bold text-slate-800 flex items-center justify-between">
                      <span>Apps Script 코드</span>
                      <button
                        type="button"
                        onClick={handleCopyScript}
                        className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-xs transition-all"
                      >
                        {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedCode ? '복사완료!' : '코드 복사'}</span>
                      </button>
                    </div>

                    <pre className="p-2.5 bg-slate-900 text-teal-400 font-mono text-[11px] rounded-xl overflow-x-auto max-h-24">
                      {appsScriptCode}
                    </pre>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 block">
                      배포된 웹 앱 URL 입력:
                    </label>
                    <input
                      type="url"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-teal-600 text-slate-800"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleWebhookConnect}
                    disabled={isLoading || !webhookUrl.trim()}
                    className="w-full py-3.5 px-4 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>전송 중...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Apps Script 웹앱으로 즉시 연동 및 저장</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* TAB 3: CLIPBOARD COPY */}
              {activeTab === 'clipboard' && (
                <div className="space-y-4 pt-1">
                  <div className="p-4 bg-blue-50/70 border border-blue-200/70 rounded-2xl text-xs text-blue-950 space-y-2">
                    <div className="font-black text-blue-900 flex items-center gap-1.5">
                      <Copy className="w-4 h-4 text-blue-600" />
                      <span>구글 스프레드시트 즉시 붙여넣기용 복사</span>
                    </div>
                    <p className="text-blue-800 leading-relaxed">
                      엑셀과 동일한 17개 컬럼 양식으로 클립보드에 복사됩니다. 구글 시트의 A1 셀에 <code>Ctrl + V</code>하시면 즉시 완벽한 표 형태로 입력됩니다.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopySheetToClipboard}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 cursor-pointer"
                  >
                    {copiedClipboard ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-300" />
                        <span>{candidates.length}건 전체 명단이 복사되었습니다!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>엑셀 양식 데이터 클립보드 원클릭 복사</span>
                      </>
                    )}
                  </button>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            총 {candidates.length}건 대기명단 동기화 대상
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/70 transition-all cursor-pointer"
          >
            닫기
          </button>
        </div>
      </motion.div>
    </div>
  );
}
