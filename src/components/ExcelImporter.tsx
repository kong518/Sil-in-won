/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import XLSX from 'xlsx-js-style';
import { Candidate, CategoryType, ConsultationLog } from '../types';
import { Upload, Clipboard, Info, Check, AlertCircle, RefreshCw, FileText } from 'lucide-react';
import { motion } from 'motion/react';

export const parseBirthDateToYYMMDD = (val: any): string => {
  if (val === undefined || val === null) return '';

  // If it's a JS Date object
  if (val instanceof Date) {
    if (!isNaN(val.getTime())) {
      const yy = String(val.getFullYear()).slice(-2);
      const mm = String(val.getMonth() + 1).padStart(2, '0');
      const dd = String(val.getDate()).padStart(2, '0');
      return `${yy}${mm}${dd}`;
    }
    return '';
  }

  let s = String(val).trim();
  if (!s) return '';

  // Clean trailing timezone description (e.g., "(한국 표준시)")
  s = s.replace(/\s*\([^)]+\)/g, '').trim();

  // 1. Is it a 5-digit Excel date serial? (e.g. 34415 for 1994-03-22 or 45367 or whatever)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    const utc_days  = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    const year = date_info.getFullYear();
    if (year >= 1900 && year <= 2100) {
      const yy = String(year).slice(-2);
      const mm = String(date_info.getMonth() + 1).padStart(2, '0');
      const dd = String(date_info.getDate()).padStart(2, '0');
      const res = `${yy}${mm}${dd}`;
      if (/^\d{6}$/.test(res)) return res;
    }
  }

  // 2. Korean date format check: e.g., "13년 3월 30일", "2013년 03월 30일"
  const koMatch = s.match(/(?:19|20)?(\d{2})\s*년\s*(0?[1-9]|1[0-2])\s*월\s*(0?[1-9]|[12]\d|3[01])\s*일/);
  if (koMatch) {
    const yy = koMatch[1];
    const mm = koMatch[2].padStart(2, '0');
    const dd = koMatch[3].padStart(2, '0');
    return `${yy}${mm}${dd}`;
  }

  // 3. Separator-based format check: e.g., "2013.03.30", "13-03-30", "13/3/30"
  const sepMatch = s.match(/(?:19|20)?(\d{2})[-./\s]+(0?[1-9]|1[0-2]|\d)[-./\s]+(0?[1-9]|[12]\d|3[01]|\d)/);
  if (sepMatch) {
    const yy = sepMatch[1];
    const mm = sepMatch[2].padStart(2, '0');
    const dd = sepMatch[3].padStart(2, '0');
    return `${yy}${mm}${dd}`;
  }

  // 4. Resident Registration Number (RRN) check with hyphen or continuous: e.g. "130330-3123456" or "1303303123456"
  const rrnMatch = s.match(/^(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[-./\s]*\d/);
  if (rrnMatch) {
    return `${rrnMatch[1]}${rrnMatch[2]}${rrnMatch[3]}`;
  }

  // 5. Pure 8-digit checking: e.g. "20130330" or "19940322"
  const pure8Match = s.match(/^(?:19|20)(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/);
  if (pure8Match) {
    return `${pure8Match[1]}${pure8Match[2]}${pure8Match[3]}`;
  }

  // 6. Pure 6-digit checking: e.g. "130330"
  const pure6Match = s.match(/^(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/);
  if (pure6Match) {
    return `${pure6Match[1]}${pure6Match[2]}${pure6Match[3]}`;
  }

  // 7. General extract first 6 or 8 digits from any messy string
  // Clean all characters except digits first
  const digits = s.replace(/[^\d]/g, '');

  const blockMatch = s.match(/\b(\d{6})\b/) || s.match(/(\d{6})/);
  if (blockMatch) {
    const candidateDigits = blockMatch[1];
    const mm = parseInt(candidateDigits.substring(2, 4), 10);
    const dd = parseInt(candidateDigits.substring(4, 6), 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return candidateDigits;
    }
  }

  const block8Match = s.match(/\b(\d{8})\b/) || s.match(/(\d{8})/);
  if (block8Match) {
    const candidateDigits = block8Match[1];
    const mm = parseInt(candidateDigits.substring(4, 6), 10);
    const dd = parseInt(candidateDigits.substring(6, 8), 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return candidateDigits.substring(2);
    }
  }

  if (digits.length === 6) {
    return digits;
  }
  if (digits.length === 13) {
    return digits.substring(0, 6);
  }
  if (digits.length > 6) {
    return digits.substring(0, 6);
  }

  // 8. Browser Date parse as fallback
  if (isNaN(Number(s)) && s.length > 5) {
    const parsedDate = new Date(s);
    if (!isNaN(parsedDate.getTime())) {
      const year = parsedDate.getFullYear();
      if (year >= 1900 && year <= 2100) {
        const yy = String(year).slice(-2);
        const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
        const day = String(parsedDate.getDate()).padStart(2, '0');
        return `${yy}${mm}${day}`;
      }
    }
  }

  return '';
};

interface ExcelImporterProps {
  onImport: (newCandidates: Candidate[]) => void;
  onClose?: () => void;
}

export default function ExcelImporter({ onImport }: ExcelImporterProps) {
  const [inputText, setInputText] = useState('');
  const [importType, setImportType] = useState<'paste' | 'file'>('file'); // default to file drag-and-drop
  const [parsedCount, setParsedCount] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Candidate[]>([]);
  const [pendingImportData, setPendingImportData] = useState<Candidate[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatExcelDate = (val: any): string => {
    if (!val) return '2026-05-28';
    
    // ISO string format check
    if (val instanceof Date) {
      const year = val.getFullYear();
      const month = String(val.getMonth() + 1).padStart(2, '0');
      const day = String(val.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    let dateStr = String(val).trim();
    if (!dateStr) return '2026-05-28';

    // 1. If it is purely a number and matches 5-digit Excel serial format (between 10000 and 99999)
    if (/^\d{5}(\.\d+)?$/.test(dateStr)) {
      const serial = parseFloat(dateStr);
      const utc_days  = Math.floor(serial - 25569);
      const utc_value = utc_days * 86400;
      const date_info = new Date(utc_value * 1000);
      
      const year = date_info.getFullYear();
      const month = String(date_info.getMonth() + 1).padStart(2, '0');
      const day = String(date_info.getDate()).padStart(2, '0');
      if (year >= 1900 && year <= 2100) {
        return `${year}-${month}-${day}`;
      }
    }

    // 2. Identify and parse standard sequences of pure digits (length 6 or 8) FIRST,
    // to prevent standard JavaScript `new Date()` from treating numeric codes as huge year dates.
    const digits = dateStr.replace(/[^\d]/g, '');
    
    // If we have 6 digits (YYMMDD), map to 19YY-MM-DD or 20YY-MM-DD
    if (digits.length === 6) {
      const yy = parseInt(digits.substring(0, 2), 10);
      const mm = parseInt(digits.substring(2, 4), 10);
      const dd = parseInt(digits.substring(4, 6), 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        const prefix = yy > 50 ? '19' : '20';
        return `${prefix}${String(yy).padStart(2, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      }
    }
    
    // If we have 8 digits (YYYYMMDD), map to YYYY-MM-DD
    if (digits.length === 8) {
      const yyyy = parseInt(digits.substring(0, 4), 10);
      const mm = parseInt(digits.substring(4, 6), 10);
      const dd = parseInt(digits.substring(6, 8), 10);
      if (yyyy >= 1900 && yyyy <= 2100 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      }
    }

    // 3. What if it is formatted like "2024.1.2" or "94-3-22"
    const parts = dateStr.split(/[-./_]/).map(p => p.trim());
    if (parts.length === 3) {
      const yDigits = parts[0].replace(/[^\d]/g, '');
      const mDigits = parts[1].replace(/[^\d]/g, '');
      const dDigits = parts[2].replace(/[^\d]/g, '');
      
      if (yDigits && mDigits && dDigits) {
        let yearNum = parseInt(yDigits, 10);
        let monthNum = parseInt(mDigits, 10);
        let dayNum = parseInt(dDigits, 10);
        
        if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
          if (yDigits.length === 2) {
            yearNum = yearNum > 50 ? 1900 + yearNum : 2000 + yearNum;
          }
          if (yearNum >= 1900 && yearNum <= 2100) {
            return `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          }
        }
      }
    }

    // 4. Strip out trailing parentheses e.g. "(한국 표준시)" and try standard JavaScript Dates with year strict bounds
    const sanitizedZoneStr = dateStr.replace(/\s*\([^)]+\)/g, '').trim();
    if (sanitizedZoneStr.includes('GMT') || sanitizedZoneStr.includes('UTC') || /[a-zA-Z]/.test(sanitizedZoneStr) || sanitizedZoneStr.includes('표준시')) {
      const parsedDate = new Date(sanitizedZoneStr);
      if (!isNaN(parsedDate.getTime())) {
        const year = parsedDate.getFullYear();
        const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
        const day = String(parsedDate.getDate()).padStart(2, '0');
        if (year >= 1900 && year <= 2100) {
          return `${year}-${month}-${day}`;
        }
      }
    }

    // Direct browser Parse fallback only if year is within normal boundaries (1900 ~ 2100)
    const directParsed = new Date(dateStr);
    if (!isNaN(directParsed.getTime())) {
      const year = directParsed.getFullYear();
      if (year >= 1900 && year <= 2100) {
        const month = String(directParsed.getMonth() + 1).padStart(2, '0');
        const day = String(directParsed.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }

    return dateStr;
  };

  const formatPhoneNumber = (phoneStr: string): string => {
    if (!phoneStr) return '';
    const cleanNum = phoneStr.replace(/[^\d]/g, '');
    if (cleanNum.length === 11) {
      return `${cleanNum.substring(0, 3)}-${cleanNum.substring(3, 7)}-${cleanNum.substring(7, 11)}`;
    }
    if (cleanNum.length === 10) {
      return `${cleanNum.substring(0, 3)}-${cleanNum.substring(3, 6)}-${cleanNum.substring(6, 10)}`;
    }
    return phoneStr;
  };

  const parseRemarksAndLogs = (rawLogs: string, defaultDate: string, index: number): ConsultationLog[] => {
    if (!rawLogs || !rawLogs.trim()) {
      return [{
        id: `log-${index}-initial-${Date.now()}`,
        date: defaultDate,
        content: '[최초 등록] 이용대기 접수 완료'
      }];
    }

    const logs: ConsultationLog[] = [];
    
    // Split on newline to isolate notes
    const lines = rawLogs.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '');
    
    lines.forEach((line, logIdx) => {
      // Find dates: e.g. 2025.01.12, 12/23/24, (25.12.02)
      const dateRegex = /([\[\(]?\s*(?:20)?(23|24|25|26|27)[-./](0[1-9]|1[0-2]|\d)[-./](0[1-9]|[12]\d|3[01]|\d)\s*[\]\)]?)/;
      const match = line.match(dateRegex);
      
      let resolvedDate = defaultDate;
      let cleanText = line;
      
      if (match) {
        const fullDateStr = match[1];
        const yearShort = match[2];
        const monthStr = match[3].padStart(2, '0');
        const dayStr = match[4].padStart(2, '0');
        
        const fullYear = yearShort.length === 2 ? `20${yearShort}` : yearShort;
        resolvedDate = `${fullYear}-${monthStr}-${dayStr}`;
        
        cleanText = line.replace(fullDateStr, '').trim();
        cleanText = cleanText.replace(/^[:\-~=\s\],]+/g, '').trim();
      }
      
      if (cleanText) {
        logs.push({
          id: `imported-log-${index}-${logIdx}-${Math.random().toString(36).substr(2, 5)}`,
          date: resolvedDate,
          content: cleanText
        });
      }
    });

    if (logs.length === 0) {
      logs.push({
        id: `imported-log-${index}-0-${Math.random().toString(36).substr(2, 5)}`,
        date: defaultDate,
        content: rawLogs
      });
    }

    return logs;
  };

  const processExcelWorkbook = (workbook: any) => {
    try {
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
      
      if (rawRows.length === 0) {
        setErrorMessage('비어 있는 내용의 시트이거나 형식이 잘못되었습니다.');
        return;
      }

      // Filter out clean visual empty lines
      const filtered = rawRows.filter(row => row && row.length > 0 && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ''));
      if (filtered.length < 2) {
        setErrorMessage('헤더행을 파싱했으나, 그 아래의 실제 인적 데이터가 포함되어 있지 않습니다.');
        return;
      }

      const headers = filtered[0].map(h => String(h || '').trim());
      
      // Match column keywords explicitly
      let map: Record<string, number> = {};
      headers.forEach((field, idx) => {
        const clean = field.replace(/\s+/g, '');
        if (clean.includes('구분')) map.category = idx;
        else if (clean.includes('접수일')) map.registrationDate = idx;
        else if (clean.includes('접수자')) map.registrar = idx;
        else if (clean === '성명' || clean === '이름' || (clean.includes('성명') && !clean.includes('접수'))) map.name = idx;
        else if (clean.includes('생년월일') || clean.includes('생년') || clean.includes('주민번호')) map.birthDate = idx;
        else if (clean.includes('성별')) map.gender = idx;
        else if (clean.includes('장애유형') || clean.includes('장애형') || clean === '장애명') map.disabilityType = idx;
        else if (clean.includes('급수') || clean.includes('등급')) map.disabilityGrade = idx;
        else if (clean.includes('복합')) map.complexDisability = idx;
        else if (clean.includes('국비')) map.fundingNational = idx;
        else if (clean.includes('도비')) map.fundingProvincial = idx;
        else if (clean.includes('시비')) map.fundingCity = idx;
        else if (clean === '시') map.addressCity = idx;
        else if (clean === '구') map.addressDistrict = idx;
        else if (clean === '동') map.addressDong = idx;
        else if (clean.includes('세부주소') || clean.includes('상세주소') || clean === '주소') {
          if (map.addressDetail === undefined) map.addressDetail = idx;
        }
        else if (clean.includes('연락처') || clean.includes('전화') || clean.includes('핸드폰')) map.phone = idx;
        else if (clean.includes('서비스내용') || clean.includes('서비스요청') || clean.includes('서비스')) map.serviceContent = idx;
        else if (clean.includes('특이사항') || clean.includes('특이')) map.specialNotes = idx;
        else if (clean.includes('상담내역') || clean.includes('상담기록') || clean.includes('상담')) map.consultationLogs = idx;
        else if (clean.includes('비고')) map.remarks = idx;
      });

      const essentialKeys = ['category', 'registrationDate', 'name'];
      const hasEssentials = essentialKeys.every(k => map[k] !== undefined);
      
      if (!hasEssentials) {
        // Sequentially map exact columns schema provided by the user:
        // 0: 구분, 1: 접수일, 2: 접수자, 3: 성명, 4: 생년월일, 5: 성별, 6: 장애유형, 7: 급수, 8: 복합장애,
        // 9: 국비, 10: 도비, 11: 시비, 12: 시, 13: 구, 14: 동, 15: 세부주소, 16: 연락처, 17: 서비스내용, 18: 특이사항, 19: 상담내역, 20: 비고
        map = {
          category: 0,
          registrationDate: 1,
          registrar: 2,
          name: 3,
          birthDate: 4,
          gender: 5,
          disabilityType: 6,
          disabilityGrade: 7,
          complexDisability: 8,
          fundingNational: 9,
          fundingProvincial: 10,
          fundingCity: 11,
          addressCity: 12,
          addressDistrict: 13,
          addressDong: 14,
          addressDetail: 15,
          phone: 16,
          serviceContent: 17,
          specialNotes: 18,
          consultationLogs: 19,
          remarks: 20
        };
      }

      const parsedList: Candidate[] = [];
      
      for (let i = 1; i < filtered.length; i++) {
        const row = filtered[i];
        if (!row || row.length === 0 || row.every(c => c === null || c === undefined || String(c).trim() === '')) {
          continue;
        }

        const getCell = (key: string, def: string = ''): string => {
          const index = map[key];
          if (index !== undefined && row[index] !== undefined && row[index] !== null) {
            return String(row[index]).trim();
          }
          return def;
        };

        const getBool = (key: string): boolean => {
          const v = getCell(key).toLowerCase();
          return v === 'y' || v === 'yes' || v === 'o' || v === '참' || v === 'true' || v === '대상' || v === '유' || v === '1' || v.includes('중증');
        };

        const rawRegDate = getCell('registrationDate');
        const formattedRegDate = formatExcelDate(rawRegDate);

        let cat = getCell('category') as CategoryType;
        if (!['대기', '삭제', '보류', '연계'].includes(cat)) {
          cat = '대기';
        }

        let genderVal: '남' | '여' | '기타' = '기타';
        const rawGender = getCell('gender');
        if (rawGender.includes('남') || rawGender.toLowerCase() === 'm' || rawGender.toLowerCase() === 'male' || rawGender === '1') {
          genderVal = '남';
        } else if (rawGender.includes('여') || rawGender.toLowerCase() === 'f' || rawGender.toLowerCase() === 'female' || rawGender === '2') {
          genderVal = '여';
        }

        const candName = getCell('name', '이름없음');
        if (candName === '성명' || candName === '이름') {
          continue;
        }

        const rawBirth = getCell('birthDate');
        const birthVal = parseBirthDateToYYMMDD(rawBirth);

        let typeVal = getCell('disabilityType');
        if (typeVal === '미분류' || typeVal === '미지정' || typeVal === '미상') {
          typeVal = '';
        }

        let gradeVal = getCell('disabilityGrade');
        if (gradeVal === '미분류' || gradeVal === '미지정' || gradeVal === '미상') {
          gradeVal = '';
        }

        const logsCell = getCell('consultationLogs');
        const logs = parseRemarksAndLogs(logsCell, formattedRegDate, i);

        parsedList.push({
          id: `imported-excel-cand-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
          category: cat,
          registrationDate: formattedRegDate || '2026-05-28',
          registrar: getCell('registrar', '미기재'),
          name: candName,
          birthDate: birthVal || '',
          gender: genderVal,
          disabilityType: typeVal,
          disabilityGrade: gradeVal,
          complexDisability: getBool('complexDisability'),
          fundingNational: getCell('fundingNational'),
          fundingProvincial: getCell('fundingProvincial'),
          fundingCity: getCell('fundingCity'),
          addressCity: getCell('addressCity').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(),
          addressDistrict: getCell('addressDistrict').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(),
          addressDong: getCell('addressDong').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(),
          addressDetail: getCell('addressDetail').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(),
          phone: formatPhoneNumber(getCell('phone')),
          serviceContent: getCell('serviceContent'),
          specialNotes: getCell('specialNotes'),
          consultationLogs: logs,
          remarks: getCell('remarks')
        });
      }

      setPreviewData(parsedList.slice(0, 5));
      setParsedCount(parsedList.length);
      setPendingImportData(parsedList);
      setErrorMessage(null);

    } catch (e: any) {
      console.error(e);
      setErrorMessage('파일 해석 도중 오류가 발생했습니다: ' + e.message);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      readFileAndParse(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      readFileAndParse(file);
    }
  };

  const readFileAndParse = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary', cellDates: true });
        processExcelWorkbook(workbook);
      } catch (err: any) {
        setErrorMessage('엑셀 파싱 중 치명적 오류 발생: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handlePasteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setInputText(text);
    setErrorMessage(null);
    if (!text.trim()) {
      setPreviewData([]);
      setParsedCount(null);
      return;
    }

    try {
      // Parse TSV lines
      const rows = text.split(/\r?\n/).filter(line => line.trim() !== '');
      if (rows.length === 0) return;

      const workbook = XLSX.read(text, { type: 'string' });
      processExcelWorkbook(workbook);
    } catch (err: any) {
      setErrorMessage('붙여넣은 대기 기록을 파싱하지 못했습니다: ' + err.message);
    }
  };

  const executeImport = () => {
    if (pendingImportData.length === 0) {
      setErrorMessage('가져올 유효한 데이터가 없습니다.');
      return;
    }
    
    onImport(pendingImportData);
    setInputText('');
    setPreviewData([]);
    setPendingImportData([]);
    setParsedCount(null);
  };

  return (
    <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-slate-100 shadow-xl overflow-hidden mb-8">
      {/* Selector Header */}
      <div className="flex border-b border-slate-100 bg-slate-50/70 p-1">
        <button
          type="button"
          onClick={() => { setImportType('file'); setErrorMessage(null); }}
          className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all ${
            importType === 'file' 
              ? 'bg-white text-emerald-600 shadow-sm' 
              : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
          }`}
        >
          <Upload className="w-4 h-4" />
          엑셀 파일 (.xlsx, .xls) 첨부하기
        </button>
        <button
          type="button"
          onClick={() => { setImportType('paste'); setErrorMessage(null); }}
          className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all ${
            importType === 'paste' 
              ? 'bg-white text-emerald-600 shadow-sm' 
              : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
          }`}
        >
          <Clipboard className="w-4 h-4" />
          텍셀 시트 행 복사-붙여넣기
        </button>
      </div>

      <div className="p-6">
        <div className="mb-4 bg-emerald-50/50 rounded-xl p-4 text-xs text-emerald-800 border border-emerald-100 flex items-start gap-2.5 leading-relaxed">
          <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold mb-1 col-span-2 text-emerald-900 text-sm">스마트 엑셀 데이터 분석 안내</p>
            <p className="mb-1">
              • 파일은 수집하신 대입 정리대장 엑셀 파일(<strong>.xlsx</strong>, <strong>.xls</strong>) 또는 일반 콤마구분 파일(<strong>.csv</strong>)을 올릴 수 있습니다.
            </p>
            <p className="mb-1 text-rose-700 font-semibold flex items-center gap-1">
              <span>• ⚠️ 중요: 엑셀 파일의 암호(보안설정)는 반드시 해제하고(풀고) 올려주세요. (암호가 설정된 엑셀 파일은 분석할 수 없습니다.)</span>
            </p>
            <p className="mb-1">
              • 규격 행: <strong>구분, 접수일, 접수자, 성명, 생년월일, 성별, 장애유형, 급수, 복합장애, 국비, 도비, 시비, 시, 구, 동, 세부주소, 연락처, 서비스내용, 특이사항, 상담내역, 비고</strong> 순입니다.
            </p>
            <p>
              • 똑똑한 자동 정렬 연산: 접수일자와 <strong>상담내역(과거 및 미래 연도 일지포함)</strong>을 자동 감지 파싱하여 <strong>2024, 2025, 2026 연도 분류 탭에 즉각 분배되어 할당되어 출력</strong>됩니다!
            </p>
          </div>
        </div>

        {importType === 'file' ? (
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
              isDragging 
                ? 'border-emerald-500 bg-emerald-50/30 text-emerald-800' 
                : 'border-slate-200 bg-slate-50/30 hover:border-emerald-500 hover:bg-emerald-50/10'
            }`}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept=".xlsx,.xls,.csv" 
              className="hidden" 
            />
            <div className={`mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
              isDragging ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'
            }`}>
              <Upload className="w-6 h-6 animate-pulse" />
            </div>
            <p className="text-sm font-extrabold text-slate-700">엑셀 파일을 드래그하여 여기 놓으시거나 클릭해서 파일 선택</p>
            <p className="text-xs text-slate-400 mt-1.5">행정대기명단 통합 지원 (.xlsx, .xls, .csv)</p>
          </div>
        ) : (
          <div>
            <textarea
              className="w-full h-44 p-4 border border-slate-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-emerald-500 bg-slate-50/50 outline-none transition-all placeholder-slate-400"
              placeholder={`엑셀 시트에서 통째로 드래그 복사(Ctrl + C)한 뒤 여기에 그대로 붙여넣어주세요. (Ctrl + V)\n\n헤더 열 이름을 한글 규격명으로 명시하시면 순서가 달라도 자동으로 매칭됩니다.`}
              value={inputText}
              onChange={handlePasteChange}
            />
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 text-xs flex items-center gap-2 font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <div>{errorMessage}</div>
          </div>
        )}

        {parsedCount !== null && parsedCount > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 border border-slate-100 rounded-xl bg-slate-50/40 p-4"
          >
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Check className="w-4.5 h-4.5 text-emerald-600 bg-emerald-100 rounded-full p-0.5" />
                <span className="text-sm font-bold text-slate-800">
                  완벽하게 변환 해석 완료: <span className="text-emerald-600 font-extrabold">{parsedCount}건 검출</span>
                </span>
              </div>
              <span className="text-xs text-slate-400 font-medium">상위 5명 데이터 가가져오기 미리보기</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 px-1">구분</th>
                    <th className="py-2 px-1">성명</th>
                    <th className="py-2 px-1">접수일</th>
                    <th className="py-2 px-1">장애유형</th>
                    <th className="py-2 px-1">주소</th>
                    <th className="py-2 px-1">상담내역(연도추정)</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((cand, idx) => (
                    <tr key={idx} className="border-b border-slate-100 text-slate-700 hover:bg-slate-50">
                      <td className="py-2 px-1">
                        <span className={`inline-block px-1.5 py-0.5 text-[10px] rounded font-bold ${
                          cand.category === '대기' ? 'bg-orange-50 text-orange-600' :
                          cand.category === '삭제' ? 'bg-rose-50 text-rose-600' :
                          cand.category === '보류' ? 'bg-amber-50 text-amber-600' :
                          'bg-emerald-50 text-emerald-600'
                        }`}>
                          {cand.category}
                        </span>
                      </td>
                      <td className="py-2 px-1 font-bold">{cand.name}</td>
                      <td className="py-2 px-1 text-slate-500 font-mono">{cand.registrationDate}</td>
                      <td className="py-2 px-1">
                        {cand.disabilityType || '미지정'}
                        {cand.disabilityGrade ? ` (${cand.disabilityGrade})` : ''}
                      </td>
                      <td className="py-2 px-1 max-w-[150px] truncate">
                        {(() => {
                          const parts = [];
                          if (cand.addressCity) parts.push(cand.addressCity.trim());
                          if (cand.addressDistrict) parts.push(cand.addressDistrict.trim());
                          if (cand.addressDong && cand.addressDong.trim()) {
                            const trimmedDong = cand.addressDong.trim();
                            if (trimmedDong.endsWith('동') || trimmedDong.endsWith('읍') || trimmedDong.endsWith('면')) {
                              parts.push(trimmedDong);
                            }
                          }
                          if (cand.addressDetail) parts.push(cand.addressDetail.trim());
                          return parts.join(' ').replace(/\s+/g, ' ').trim() || '-';
                        })()}
                      </td>
                      <td className="py-2 px-1 max-w-[180px] truncate text-slate-500">
                        {cand.consultationLogs && cand.consultationLogs.length > 0 ? (
                          cand.consultationLogs.map(l => `[${l.date}] ${l.content}`).join(' | ')
                        ) : '접수만 완료'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setInputText('');
                  setPreviewData([]);
                  setPendingImportData([]);
                  setParsedCount(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-lg transition-all"
              >
                초기화
              </button>
              <button
                type="button"
                onClick={executeImport}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                정리된 대기명부 데이터베이스에 영구 반영하기
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
