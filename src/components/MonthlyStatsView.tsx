import React, { useState, useMemo } from 'react';
import { Candidate } from '../types';
import { 
  Calendar, 
  Users, 
  Search, 
  ShieldCheck, 
  Filter,
  Clock,
  AlertCircle,
  TrendingUp,
  UserCheck
} from 'lucide-react';

// Robust, timezone-insensitive date parser for common Korean formats like YYYY-MM-DD, YYYY.MM.DD, YY.MM.DD, etc.
const parseToLocalDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const clean = dateStr.replace(/\s+/g, '').trim(); // Remove all spaces
  
  // 1. Check YYYY-MM-DD or YYYY.MM.DD or YYYY/MM/DD
  const match1 = clean.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (match1) {
    const y = parseInt(match1[1], 10);
    const m = parseInt(match1[2], 10) - 1;
    const d = parseInt(match1[3], 10);
    return new Date(y, m, d);
  }
  
  // 2. Check YY-MM-DD or YY.MM.DD or YY/MM/DD
  const match2 = clean.match(/^(\d{2})[-./](\d{1,2})[-./](\d{1,2})/);
  if (match2) {
    let y = parseInt(match2[1], 10);
    y += y >= 50 ? 1900 : 2000;
    const m = parseInt(match2[2], 10) - 1;
    const d = parseInt(match2[3], 10);
    return new Date(y, m, d);
  }
  
  // 3. Fallback to standard JS parsing
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

// Reconstruct the category/status of a candidate historically as of a reference date
const getCategoryAtDate = (cand: Candidate, refDate: Date): '대기' | '기타' => {
  const regDate = parseToLocalDate(cand.registrationDate);
  if (!regDate) return '기타';
  regDate.setHours(0, 0, 0, 0);
  if (regDate > refDate) return '기타'; // Not even registered yet
  
  const currentCat = (cand.category || '').trim();
  
  // If still actively waiting today, they were active back then too (since they registered before refDate and are still waiting)
  if (currentCat === '대기' || currentCat === '긴급대기') {
    return '대기';
  }
  
  // For '연계', '보류', '삭제' statuses, find the transition date (when they stopped waiting)
  let transitionDate: Date | null = null;
  
  // 1. Scan consultation logs for terminal entries and parse their dates
  if (cand.consultationLogs && cand.consultationLogs.length > 0) {
    const sortedLogs = [...cand.consultationLogs].sort((a, b) => b.date.localeCompare(a.date));
    
    for (const log of sortedLogs) {
      const text = log.content || '';
      const isTransition = 
        /연계|종결|보류|삭제|종료|서비스\s*시작|매칭\s*완료/.test(text);
        
      if (isTransition && log.date) {
        transitionDate = parseToLocalDate(log.date);
        if (transitionDate) {
          transitionDate.setHours(0, 0, 0, 0);
          break;
        }
      }
    }
    
    // Fallback to the latest log date if no explicit transition phrase was matched
    if (!transitionDate && sortedLogs[0]?.date) {
      transitionDate = parseToLocalDate(sortedLogs[0].date);
      if (transitionDate) {
        transitionDate.setHours(0, 0, 0, 0);
      }
    }
  }
  
  // 2. Scan updatedAt timestamp as fallback
  if (!transitionDate && (cand as any).updatedAt) {
    transitionDate = parseToLocalDate((cand as any).updatedAt.split('T')[0]);
    if (transitionDate) {
      transitionDate.setHours(0, 0, 0, 0);
    }
  }
  
  // If we can't find a transition date, assume they transitioned on registration date
  if (!transitionDate) {
    return '기타';
  }
  
  // If transition date is in the future relative to refDate, they were STILL waiting at refDate!
  if (transitionDate > refDate) {
    return '대기';
  }
  
  return '기타';
};

interface MonthlyStatsViewProps {
  candidates: Candidate[];
  privacyMode: boolean;
}

export default function MonthlyStatsView({ 
  candidates, 
  privacyMode
}: MonthlyStatsViewProps) {
  // Years derived dynamically from candidates
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
    yearsSet.add('2026');
    yearsSet.add('2025');
    yearsSet.add('2024');
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [candidates]);

  const [selectedYear, setSelectedYear] = useState<string>(() => {
    return availableYears[0] || '2026';
  });
  
  const [activeMonth, setActiveMonth] = useState<number | null>(() => {
    return new Date().getMonth() + 1; 
  });

  const [searchTerm, setSearchTerm] = useState('');

  // Helper to calculate waiting stats as of YYYY-MM-DD (last day of that month)
  const getMonthStats = (year: number, month: number) => {
    // Reference date set to the end of the last day of chosen month (23:59:59.999)
    const refDate = new Date(year, month, 0, 23, 59, 59, 999);
    
    let count15d = 0;       // < 15 days
    let count1m = 0;        // 15 days <= wait < 30 days
    let count3m = 0;        // 30 days <= wait < 90 days
    let countOver3m = 0;    // >= 90 days
    
    const list: Candidate[] = [];
    
    candidates.forEach(cand => {
      const catAtDate = getCategoryAtDate(cand, refDate);
      if (catAtDate !== '대기') return;
      if (!cand.registrationDate) return;
      
      const regDate = parseToLocalDate(cand.registrationDate);
      if (!regDate) return;
      
      // Set hours to 00:00:00 to calculate purely by calendar day difference
      regDate.setHours(0, 0, 0, 0);
      
      if (regDate > refDate) return; // Not registered yet as of this month
      
      const diffTime = refDate.getTime() - regDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) return;
      
      list.push(cand);
      
      if (diffDays < 15) {
        count15d++;
      } else if (diffDays < 30) {
        count1m++;
      } else if (diffDays < 90) {
        count3m++;
      } else {
        countOver3m++;
      }
    });
    
    // Sort list: longest waiting first (descending by wait days)
    const sortedList = [...list].sort((a, b) => {
      const dateA = parseToLocalDate(a.registrationDate)?.getTime() || 0;
      const dateB = parseToLocalDate(b.registrationDate)?.getTime() || 0;
      return dateA - dateB; // earlier registration date = longer wait
    });
    
    return {
      total: sortedList.length,
      count15d,
      count1m,
      count3m,
      countOver3m,
      list: sortedList
    };
  };

  // Precompute stats for all 12 months for the selected year
  const monthlyStats = useMemo(() => {
    const yearNum = parseInt(selectedYear, 10);
    return Array(12).fill(0).map((_, idx) => {
      return getMonthStats(yearNum, idx + 1);
    });
  }, [candidates, selectedYear]);

  // Current selected month's stats
  const selectedMonthData = useMemo(() => {
    if (activeMonth === null) return null;
    return monthlyStats[activeMonth - 1];
  }, [monthlyStats, activeMonth]);

  // Filtered list of candidates for search
  const filteredCandidates = useMemo(() => {
    if (!selectedMonthData) return [];
    const term = searchTerm.trim().toLowerCase();
    if (!term) return selectedMonthData.list;
    
    return selectedMonthData.list.filter(c => {
      const nameMatch = c.name.toLowerCase().includes(term);
      const phoneMatch = c.phone.toLowerCase().includes(term);
      const serviceMatch = (c.serviceContent || '').toLowerCase().includes(term);
      const registrarMatch = (c.registrar || '').toLowerCase().includes(term);
      const typeMatch = (c.disabilityType || '').toLowerCase().includes(term);
      return nameMatch || phoneMatch || serviceMatch || registrarMatch || typeMatch;
    });
  }, [selectedMonthData, searchTerm]);

  // Helper to calculate waiting days for a specific candidate at the selected month reference date
  const getWaitingDaysAtRef = (regDateStr: string) => {
    if (!activeMonth) return 0;
    const yearNum = parseInt(selectedYear, 10);
    const refDate = new Date(yearNum, activeMonth, 0, 23, 59, 59, 999);
    const regDate = parseToLocalDate(regDateStr);
    if (!regDate) return 0;
    regDate.setHours(0, 0, 0, 0);
    const diffTime = refDate.getTime() - regDate.getTime();
    return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
  };

  // Masking helpers
  const maskName = (name: string) => {
    if (!privacyMode) return name;
    if (name.length <= 1) return name;
    if (name.length === 2) return `${name[0]}*`;
    return `${name[0]}*${name[name.length - 1]}`;
  };

  const maskPhone = (phone: string) => {
    if (!privacyMode) return phone;
    const parts = phone.split('-');
    if (parts.length === 3) {
      return `${parts[0]}-****-${parts[2]}`;
    }
    if (phone.length > 7) {
      return phone.replace(/(\d{3})\d+(\d{4})/, '$1-****-$2');
    }
    return '***-****';
  };

  const maskBirth = (birth: string) => {
    if (!privacyMode) return birth;
    const clean = birth.replace(/[^0-9]/g, '');
    if (clean.length >= 6) {
      return `${clean.substring(0, 2)}****`;
    }
    return '******';
  };

  return (
    <div className="space-y-6">
      
      {/* Filters Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600 shadow-inner">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-950 flex items-center gap-2">
              월별 이용 대기 현황
              <span className="text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-150 px-2 py-0.5 rounded-full">
                정밀 시점 분석
              </span>
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">선택한 연도/월 시점 기준으로 2024년부터 누적되어 대기 중인 실제 대상자와 대기 기간을 실시간으로 추적합니다.</p>
          </div>
        </div>

        {/* Year Select */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-500">조회 시점 기준연도</span>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/50">
            {availableYears.map(year => (
              <button
                key={year}
                onClick={() => {
                  setSelectedYear(year);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  selectedYear === year
                    ? 'bg-white text-violet-700 shadow-xs border border-slate-200/20'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {year}년 기준
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 12-Month Grid showing Accumulated Active Waiters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {Array(12).fill(0).map((_, idx) => {
          const month = idx + 1;
          const stats = monthlyStats[idx];
          const isSelected = activeMonth === month;
          
          return (
            <button
              key={month}
              type="button"
              onClick={() => setActiveMonth(isSelected ? null : month)}
              className={`p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between cursor-pointer h-[135px] ${
                isSelected
                  ? 'bg-violet-600 border-violet-600 text-white shadow-md shadow-violet-600/20'
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <div className="w-full flex items-center justify-between">
                <span className={`text-xs font-black ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                  {month}월말 기준
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  isSelected 
                    ? 'bg-violet-700 text-white' 
                    : stats.total > 0 
                      ? 'bg-violet-50 text-violet-700 border border-violet-100' 
                      : 'bg-slate-100 text-slate-400'
                }`}>
                  대기 {stats.total}명
                </span>
              </div>

              {/* Stacked Indicator Bar or Stats */}
              <div className="mt-4 space-y-2 w-full">
                {/* 4 colors segmented bar representing duration */}
                <div className="w-full h-2 rounded-full bg-slate-100/80 flex overflow-hidden">
                  {stats.total > 0 ? (
                    <>
                      <div 
                        className="h-full bg-emerald-400 transition-all duration-300" 
                        style={{ width: `${(stats.count15d / stats.total) * 100}%` }}
                        title={`15일 미만: ${stats.count15d}명`}
                      />
                      <div 
                        className="h-full bg-amber-400 transition-all duration-300" 
                        style={{ width: `${(stats.count1m / stats.total) * 100}%` }}
                        title={`15일 ~ 1달: ${stats.count1m}명`}
                      />
                      <div 
                        className="h-full bg-orange-400 transition-all duration-300" 
                        style={{ width: `${(stats.count3m / stats.total) * 100}%` }}
                        title={`1달 ~ 3달: ${stats.count3m}명`}
                      />
                      <div 
                        className="h-full bg-rose-500 transition-all duration-300" 
                        style={{ width: `${(stats.countOver3m / stats.total) * 100}%` }}
                        title={`3달 이상: ${stats.countOver3m}명`}
                      />
                    </>
                  ) : (
                    <div className="w-full h-full bg-slate-100" />
                  )}
                </div>

                {/* Sub-label */}
                <div className="flex items-center justify-between text-[9px] font-semibold">
                  <span className={isSelected ? 'text-violet-200' : 'text-slate-400'}>
                    3개월 이상 장기대기
                  </span>
                  <span className={`font-black ${isSelected ? 'text-white' : 'text-rose-600'}`}>
                    {stats.countOver3m}명
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Month Stats Dashboard */}
      {activeMonth !== null && selectedMonthData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-fade-in">
          
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <span className="text-xs font-black">15일↓</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold block">15일 미만 대기자</span>
              <span className="text-xl font-black text-slate-900 block mt-0.5">
                {selectedMonthData.count15d}
                <span className="text-xs font-normal text-slate-400 ml-1">명</span>
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <span className="text-xs font-black">15일~</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold block">15일 이상 ~ 1개월 미만</span>
              <span className="text-xl font-black text-slate-900 block mt-0.5">
                {selectedMonthData.count1m}
                <span className="text-xs font-normal text-slate-400 ml-1">명</span>
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
              <span className="text-xs font-black">1달~</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold block">1개월 이상 ~ 3개월 미만</span>
              <span className="text-xl font-black text-slate-900 block mt-0.5">
                {selectedMonthData.count3m}
                <span className="text-xs font-normal text-slate-400 ml-1">명</span>
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <span className="text-xs font-black">3달↑</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold block">3개월 이상 대기자</span>
              <span className="text-xl font-black text-rose-600 block mt-0.5">
                {selectedMonthData.countOver3m}
                <span className="text-xs font-normal text-slate-400 ml-1">명</span>
              </span>
            </div>
          </div>

        </div>
      )}

      {/* Monthly Detailed Table Container */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        
        {/* Table Title and Search bar */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-black text-slate-900 flex items-center gap-2">
              <Filter className="w-4 h-4 text-violet-500" />
              <span>
                {activeMonth === null ? `${selectedYear}년도 전체 누적 대기자` : `${selectedYear}년 ${activeMonth}월말 기준 실질 대기자 명단`}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                총 {filteredCandidates.length}명 대기 중
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">상단의 월 기준 카드를 선택하면 해당 시점에 대기 상태였던 대상자 명단과 누적 대기일수가 자동 반영됩니다.</p>
          </div>

          {/* Quick Search */}
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="이름, 연락처, 서비스내용 검색"
              className="w-full pl-9 pr-4 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white focus:outline-violet-600 focus:border-violet-600 text-slate-800 shadow-2xs transition-all"
            />
          </div>
        </div>

        {/* Detailed Candidates List */}
        <div className="overflow-x-auto">
          {activeMonth === null ? (
            <div className="p-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto border border-slate-150 animate-bounce">
                <Calendar className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-600">조회할 기준월을 먼저 클릭해 주세요.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">상단 달력의 월 카드를 선택하시면 해당 시점에 대기 중이던 전체 명단이 출력됩니다.</p>
              </div>
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="p-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto border border-slate-150">
                <Users className="w-6 h-6 text-slate-300" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-600">해당 시점 조건에 일치하는 대기자가 없습니다.</p>
              </div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50/50 text-[11px] font-black text-slate-400 border-b border-slate-100 uppercase tracking-wider">
                  <th className="py-3.5 px-4 text-center w-14">순번</th>
                  <th className="py-3.5 px-3">접수일</th>
                  <th className="py-3.5 px-3 text-center w-24">누적 대기일수</th>
                  <th className="py-3.5 px-3">성명</th>
                  <th className="py-3.5 px-3">생년월일</th>
                  <th className="py-3.5 px-3 text-center w-14">성별</th>
                  <th className="py-3.5 px-3">장애유형 / 등급</th>
                  <th className="py-3.5 px-3">연락처</th>
                  <th className="py-3.5 px-4">요청 서비스 내용</th>
                  <th className="py-3.5 px-3 text-center w-24">담당자</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {filteredCandidates.map((cand, idx) => {
                  const regDate = cand.registrationDate || '-';
                  const waitingDays = getWaitingDaysAtRef(cand.registrationDate);
                  
                  // Waiting duration color code
                  let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                  if (waitingDays >= 90) {
                    badgeColor = 'bg-rose-50 text-rose-700 border-rose-150';
                  } else if (waitingDays >= 30) {
                    badgeColor = 'bg-orange-50 text-orange-700 border-orange-100';
                  } else if (waitingDays >= 15) {
                    badgeColor = 'bg-amber-50 text-amber-700 border-amber-100';
                  }

                  return (
                    <tr 
                      key={cand.id} 
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      {/* 순번 */}
                      <td className="py-3 px-4 text-center font-bold text-slate-400">
                        {idx + 1}
                      </td>

                      {/* 접수일 */}
                      <td className="py-3 px-3 font-semibold text-slate-500 whitespace-nowrap">
                        {regDate}
                      </td>

                      {/* 누적 대기일수 */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black border ${badgeColor}`}>
                          {waitingDays}일 대기 중
                        </span>
                      </td>

                      {/* 성명 */}
                      <td className="py-3 px-3">
                        <span className="font-bold text-slate-900">
                          {maskName(cand.name)}
                        </span>
                      </td>

                      {/* 생년월일 */}
                      <td className="py-3 px-3 font-semibold text-slate-500">
                        {maskBirth(cand.birthDate)}
                      </td>

                      {/* 성별 */}
                      <td className="py-3 px-3 text-center font-semibold text-slate-500">
                        {cand.gender || '-'}
                      </td>

                      {/* 장애유형 / 등급 */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-bold text-slate-800">
                          {cand.disabilityType || '미지정'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold mt-0.5">
                          {cand.disabilityGrade || '급수 미지정'}
                        </div>
                      </td>

                      {/* 연락처 */}
                      <td className="py-3 px-3 font-semibold text-slate-500 whitespace-nowrap">
                        {maskPhone(cand.phone)}
                      </td>

                      {/* 요청 서비스 내용 */}
                      <td className="py-3 px-4 max-w-[280px]">
                        <p className="font-bold text-slate-700 truncate" title={cand.serviceContent}>
                          {cand.serviceContent || '-'}
                        </p>
                        {cand.specialNotes && (
                          <p className="text-[10px] text-slate-400 font-bold truncate mt-0.5" title={cand.specialNotes}>
                            🚨 특이사항: {cand.specialNotes}
                          </p>
                        )}
                      </td>

                      {/* 접수자 */}
                      <td className="py-3 px-3 text-center font-semibold text-slate-500 whitespace-nowrap">
                        {cand.registrar || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>

    </div>
  );
}
