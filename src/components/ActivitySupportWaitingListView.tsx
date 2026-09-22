/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Candidate, CategoryType } from '../types';
import { 
  Printer, 
  Search, 
  Filter, 
  ShieldCheck, 
  FileText, 
  Calendar, 
  Info,
  CheckCircle2,
  MapPin,
  Clock
} from 'lucide-react';

interface ActivitySupportWaitingListViewProps {
  candidates: Candidate[];
  selectedYear: string;
}

export default function ActivitySupportWaitingListView({
  candidates,
  selectedYear: initialSelectedYear
}: ActivitySupportWaitingListViewProps) {
  const [filterYear, setFilterYear] = useState<string>(initialSelectedYear || '2025');
  const [categoryFilter, setCategoryFilter] = useState<'대기' | '전체'>('대기');
  const [searchDistrict, setSearchDistrict] = useState<string>('전체');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [printOrientation, setPrintOrientation] = useState<'landscape' | 'portrait'>('landscape');

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

  // Sync state when parent selected year changes
  React.useEffect(() => {
    if (initialSelectedYear) {
      setFilterYear(initialSelectedYear);
    }
  }, [initialSelectedYear]);

  // Districts in Suwon
  const SUWON_DISTRICTS = ['전체', '영통구', '권선구', '팔달구', '장안구', '기타지역'];

  // Filter candidates by Year
  const yearFiltered = useMemo(() => {
    return candidates.filter(cand => {
      if (!cand.registrationDate) return false;
      const regYear = cand.registrationDate.split('-')[0];
      if (filterYear === '전체') {
        const yNum = parseInt(regYear, 10);
        return !isNaN(yNum) && yNum >= 2024;
      }
      return regYear === filterYear;
    });
  }, [candidates, filterYear]);

  // Filter by Category, District, and Search Keyword
  const displayList = useMemo(() => {
    return yearFiltered.filter(cand => {
      // Category filter (Activity support workers usually review '대기' waitlist)
      if (categoryFilter === '대기' && cand.category !== '대기') {
        return false;
      }

      // District filter
      if (searchDistrict !== '전체') {
        const addrDist = cand.addressDistrict || '';
        const fullAddr = `${cand.addressCity || ''} ${cand.addressDistrict || ''} ${cand.addressDong || ''}`;
        if (searchDistrict === '기타지역') {
          if (addrDist.includes('영통') || addrDist.includes('권선') || addrDist.includes('팔달') || addrDist.includes('장안')) {
            return false;
          }
        } else if (!fullAddr.includes(searchDistrict)) {
          return false;
        }
      }

      // Keyword search (address, service content, disability type, special notes)
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        const fullAddr = `${cand.addressCity || ''} ${cand.addressDistrict || ''} ${cand.addressDong || ''} ${cand.addressDetail || ''}`.toLowerCase();
        const fullService = (cand.serviceContent || '').toLowerCase();
        const fullNotes = (cand.specialNotes || '').toLowerCase();
        const fullDisability = `${cand.disabilityType || ''} ${cand.disabilityGrade || ''}`.toLowerCase();
        
        return fullAddr.includes(kw) || fullService.includes(kw) || fullNotes.includes(kw) || fullDisability.includes(kw);
      }

      return true;
    });
  }, [yearFiltered, categoryFilter, searchDistrict, searchKeyword]);

  // Helper to format address nicely
  const getFullAddress = (cand: Candidate): string => {
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
    const combined = parts.join(' ').replace(/\s+/g, ' ').trim();
    return combined || '-';
  };

  // Helper to format birth date cleanly (YY.MM.DD or YYYY.MM.DD)
  const formatBirth = (raw: string): string => {
    if (!raw) return '-';
    if (raw.length === 6 && /^\d+$/.test(raw)) {
      return `${raw.substring(0, 2)}.${raw.substring(2, 4)}.${raw.substring(4, 6)}`;
    }
    const match = raw.match(/(\d{4})[.\-/]?\s*0?(\d{1,2})[.\-/]?\s*0?(\d{1,2})/);
    if (match) {
      return `${match[1].substring(2)}.${match[2].padStart(2, '0')}.${match[3].padStart(2, '0')}`;
    }
    return raw;
  };

  const handlePrint = () => {
    window.print();
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="w-full space-y-6">
      
      {/* ========================================================================= */}
      {/* PRINT-SPECIFIC CSS                                                        */}
      {/* When printed, Title is strictly "이용대기명단" with standard clean borders  */}
      {/* ========================================================================= */}
      <style>{`
        @media print {
          @page {
            size: ${printOrientation === 'landscape' ? 'A4 landscape' : 'A4 portrait'};
            margin: 12mm 12mm 12mm 12mm;
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            font-family: 'Malgun Gothic', '맑은 고딕', sans-serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          /* Hide app shell */
          body * {
            visibility: hidden !important;
          }
          /* Only show this helper print section */
          #activity-support-printable-area, #activity-support-printable-area * {
            visibility: visible !important;
          }
          #activity-support-printable-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
          }
          .helper-table {
            width: 100% !important;
            border-collapse: collapse !important;
            border: 1.5px solid #000000 !important;
            font-size: ${printOrientation === 'landscape' ? '11px' : '10px'} !important;
            line-height: 1.3 !important;
          }
          .helper-table th, .helper-table td {
            border: 1px solid #000000 !important;
            color: #000000 !important;
            padding: 4px 6px !important;
          }
          .helper-table th {
            background-color: #f3f4f6 !important;
            font-weight: bold !important;
            text-align: center !important;
          }
          .helper-table tr {
            page-break-inside: avoid !important;
          }
          .helper-table thead {
            display: table-header-group !important;
          }
        }
      `}</style>

      {/* SCREEN-ONLY TOOLBAR & CONTROL PANEL */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4 print:hidden">
        
        {/* Banner with Privacy Guarantee */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shrink-0 shadow-2xs">
              <ShieldCheck className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900">이용대기명단 출력 (활동지원사 확인용)</h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-teal-50 text-teal-700 border border-teal-200">
                  개인정보 100% 배제 서식
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                활동지원사 열람 및 매칭 상담용 서식입니다. <strong className="text-slate-800 font-bold">성명, 연락처, 상세 주민번호, 접수자 등 개인 식별정보가 전혀 포함되지 않으며</strong>, 
                인쇄 시 정식 명칭 <strong className="text-emerald-700 font-bold">"이용대기명단"</strong>으로 깔끔하게 출력됩니다.
              </p>
            </div>
          </div>

          {/* Action Button: Print */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setPrintOrientation('landscape')}
                className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  printOrientation === 'landscape' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="A4 가로 방향 (10개 항목이 시원하게 배치됩니다)"
              >
                A4 가로 (권장)
              </button>
              <button
                type="button"
                onClick={() => setPrintOrientation('portrait')}
                className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  printOrientation === 'portrait' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="A4 세로 방향"
              >
                A4 세로
              </button>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black shadow-md shadow-teal-600/20 hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>이용대기명단 인쇄 (출력)</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          
          {/* 1. Year Filter */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              접수 연도
            </label>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              {[...availableYears, '전체'].map(yr => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setFilterYear(yr)}
                  className={`flex-1 py-1.5 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                    filterYear === yr ? 'bg-white text-teal-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {yr === '전체' ? '전체' : `${yr}년`}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Category Filter */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              대기 상태
            </label>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setCategoryFilter('대기')}
                className={`flex-1 py-1.5 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                  categoryFilter === '대기' ? 'bg-white text-teal-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                대기자만 (권장)
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('전체')}
                className={`flex-1 py-1.5 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                  categoryFilter === '전체' ? 'bg-white text-teal-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                전체 포함
              </button>
            </div>
          </div>

          {/* 3. District Filter */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              수원시 구별 필터
            </label>
            <select
              value={searchDistrict}
              onChange={(e) => setSearchDistrict(e.target.value)}
              className="w-full bg-slate-100 hover:bg-slate-200/60 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-teal-500 transition-colors cursor-pointer"
            >
              {SUWON_DISTRICTS.map(dist => (
                <option key={dist} value={dist}>{dist}</option>
              ))}
            </select>
          </div>

          {/* 4. Keyword Search */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              상세검색 (동, 서비스내용, 특이사항)
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="예: 매탄동, 등하교, 휠체어..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-teal-500 transition-colors"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            </div>
          </div>

        </div>

        {/* Status count indicator */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 font-medium">
          <div className="flex items-center gap-2">
            <span>출력 대상 대기 인원: <strong className="text-teal-700 font-bold text-sm">{displayList.length}</strong>명</span>
            <span>(기준: {filterYear === '전체' ? '전체 접수자' : `${filterYear}년 접수`} / {categoryFilter === '대기' ? '대기자' : '전체구분'})</span>
          </div>
          <div className="text-[11px] text-slate-400">
            * 인쇄 시 상단 여백 및 페이지 넘김이 자동 정렬됩니다.
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PRINTABLE SHEET CONTAINER                                                 */}
      {/* Title strictly: "이용대기명단"                                              */}
      {/* Columns: 순번, 생년월일, 성별, 장애유형, 국비, 도비, 시비, 주소, 서비스내용, 특이사항 */}
      {/* ========================================================================= */}
      <div 
        id="activity-support-printable-area" 
        className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/90 shadow-sm print:p-0 print:border-none print:shadow-none"
      >
        {/* DOCUMENT TITLE (HWP Style: 이용대기명단) */}
        <div className="text-center pt-2 pb-5 border-b-2 border-slate-900 print:border-b-2 print:border-black mb-4">
          <h1 className="text-2xl sm:text-3xl font-black text-black tracking-[0.25em] inline-block">
            이 용 대 기 명 단
          </h1>
          <div className="flex items-center justify-between text-xs text-slate-600 print:text-black font-medium mt-3 px-1">
            <span>수원시장애인종합복지관 장애인활동지원사업</span>
            <span>기준: {filterYear === '전체' ? '전체 접수자' : `${filterYear}년도`} (총 {displayList.length}명)</span>
            <span>출력일자: {todayStr}</span>
          </div>
        </div>

        {/* 10-COLUMN ROSTER TABLE */}
        {displayList.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            조건에 부합하는 이용 대기 명단이 없습니다. 필터를 조정해 주세요.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="helper-table w-full border-collapse border border-black text-xs text-black">
              <thead>
                <tr className="bg-slate-100 print:bg-slate-100">
                  <th style={{ width: '4%' }} className="border border-black p-2 text-center font-bold">순번</th>
                  <th style={{ width: '8%' }} className="border border-black p-2 text-center font-bold">생년월일</th>
                  <th style={{ width: '5%' }} className="border border-black p-2 text-center font-bold">성별</th>
                  <th style={{ width: '9%' }} className="border border-black p-2 text-center font-bold">장애유형</th>
                  <th style={{ width: '5%' }} className="border border-black p-2 text-center font-bold">국비</th>
                  <th style={{ width: '5%' }} className="border border-black p-2 text-center font-bold">도비</th>
                  <th style={{ width: '5%' }} className="border border-black p-2 text-center font-bold">시비</th>
                  <th style={{ width: '18%' }} className="border border-black p-2 text-center font-bold">주소</th>
                  <th style={{ width: '23%' }} className="border border-black p-2 text-center font-bold">서비스내용</th>
                  <th style={{ width: '18%' }} className="border border-black p-2 text-center font-bold">특이사항</th>
                </tr>
              </thead>
              <tbody>
                {displayList.map((cand, idx) => {
                  const disabilityFormatted = [cand.disabilityType, cand.disabilityGrade].filter(Boolean).join(' / ') || '-';
                  const fullAddress = getFullAddress(cand);

                  return (
                    <tr key={cand.id || idx} className="hover:bg-slate-50/70 transition-colors">
                      {/* 1. 순번 */}
                      <td className="border border-black p-2 text-center font-bold align-middle">
                        {idx + 1}
                      </td>

                      {/* 2. 생년월일 */}
                      <td className="border border-black p-2 text-center font-medium align-middle whitespace-nowrap">
                        {formatBirth(cand.birthDate)}
                      </td>

                      {/* 3. 성별 */}
                      <td className="border border-black p-2 text-center font-medium align-middle">
                        {cand.gender || '-'}
                      </td>

                      {/* 4. 장애유형 */}
                      <td className="border border-black p-2 text-center align-middle">
                        {disabilityFormatted}
                      </td>

                      {/* 5. 국비 */}
                      <td className="border border-black p-2 text-center font-medium align-middle">
                        {cand.fundingNational || '-'}
                      </td>

                      {/* 6. 도비 */}
                      <td className="border border-black p-2 text-center font-medium align-middle">
                        {cand.fundingProvincial || '-'}
                      </td>

                      {/* 7. 시비 */}
                      <td className="border border-black p-2 text-center font-medium align-middle">
                        {cand.fundingCity || '-'}
                      </td>

                      {/* 8. 주소 */}
                      <td className="border border-black p-2 text-left align-middle leading-snug">
                        {fullAddress}
                      </td>

                      {/* 9. 서비스내용 */}
                      <td className="border border-black p-2 text-left align-middle whitespace-pre-wrap leading-snug">
                        {cand.serviceContent || '-'}
                      </td>

                      {/* 10. 특이사항 */}
                      <td className="border border-black p-2 text-left align-middle whitespace-pre-wrap leading-snug">
                        {cand.specialNotes || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Printable Footer Notice */}
        <div className="mt-4 pt-2 border-t border-slate-300 print:border-black flex items-center justify-between text-[11px] text-slate-500 print:text-black">
          <span>* 본 명단은 활동지원사 매칭 상담 확인용 자료이며, 외부 유출을 엄격히 금지합니다.</span>
          <span>수원시장애인종합복지관 (031-206-2600)</span>
        </div>

      </div>

    </div>
  );
}
