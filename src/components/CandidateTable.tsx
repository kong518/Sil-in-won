/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Candidate, CategoryType } from '../types';
import { Edit, Trash, Search, MapPin, Phone, Printer, ChevronLeft, ChevronRight, FileText, Table, LayoutGrid, RotateCcw, UserPlus } from 'lucide-react';

// Helper to parse funding string to number safely
export const parseFundingHours = (val?: string | number | null): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val).trim();
  if (!str || str === '-' || str === '미정' || str === '없음') return 0;
  const match = str.match(/\d+(?:\.\d+)?/);
  if (!match) return 0;
  const num = parseFloat(match[0]);
  return isNaN(num) ? 0 : num;
};

// Helper to sum funding hours (국비 + 도비 + 시비)
export const getTotalFundingHours = (cand: Candidate): number => {
  const nat = parseFundingHours(cand.fundingNational);
  const prov = parseFundingHours(cand.fundingProvincial);
  const city = parseFundingHours(cand.fundingCity);
  return nat + prov + city;
};

// Available time filter thresholds
export const TIME_FILTERS = ['120시간 미만', '160시간 이상', '200시간 이상', '260시간 이상'] as const;

// Categorized filter groups for multi-select facet filtering
export const FILTER_GROUPS = {
  district: ['장안구', '영통구', '권선구', '팔달구', '용인시', '화성시', '기타(주소)'],
  gender: ['남', '여'],
  age: ['아동 및 학생'],
  vehicle: ['차량 필요', '차량 필요 없음'],
  service: ['교내지원서비스'],
  time: ['120시간 미만', '160시간 이상', '200시간 이상', '260시간 이상']
} as const;

export const ALL_SELECTION_FILTERS = [
  '전체',
  ...FILTER_GROUPS.district,
  ...FILTER_GROUPS.gender,
  ...FILTER_GROUPS.age,
  ...FILTER_GROUPS.vehicle,
  ...FILTER_GROUPS.service,
  ...FILTER_GROUPS.time
] as const;

interface CandidateTableProps {
  candidates: Candidate[];
  onSelect?: (cand: Candidate) => void;
  onEdit?: (cand: Candidate) => void;
  onAddNew?: () => void;
  onUpdateCategory: (id: string, category: CategoryType) => void;
  onDelete: (id: string) => void;
  selectedYear: string;
  onPrintTrigger?: () => void;
  onOpenMatchingRecord?: (cand: Candidate) => void;
  privacyMode?: boolean;
}

// Helper to evaluate matching status based on keywords from the last consultation log
const getLastLogMatching = (candidate: Candidate): 'O' | 'X' => {
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

// Helper for combined address formatted for excel-like table
const getCombinedAddress = (cand: Candidate) => {
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
  const combined = addressParts.join(' ').replace(/\s+/g, ' ').trim();
  return combined || '-';
};

// Split phone numbers on whitespace or standard delimiters when multiple exist
const formatPhoneNumbers = (phoneStr: string) => {
  if (!phoneStr) return [];
  const phonePattern = /01[0-9]-\d{3,4}-\d{4}(?:\s*\([^)]+\))?/gi;
  const matches = phoneStr.match(phonePattern);
  if (matches && matches.length > 0) {
    return matches.map(m => m.trim());
  }
  return phoneStr.split(/[\n,;]/).map(p => p.trim()).filter(Boolean);
};

// Extract district name (e.g., 장안구, 권선구, 팔달구, 영통구, 용인시, 화성시 등) for grouping/sorting
const getDistrictGroup = (cand: Candidate): string => {
  const dist = (cand.addressDistrict || '').trim();
  const city = (cand.addressCity || '').trim();
  const dong = (cand.addressDong || '').trim();
  const detail = (cand.addressDetail || '').trim();
  const fullAddress = `${city} ${dist} ${dong} ${detail}`.replace(/\s+/g, ' ').trim();
  
  // 1. Direct match on explicit District/City field
  if (dist.includes('장안')) return '장안구';
  if (dist.includes('영통')) return '영통구';
  if (dist.includes('권선')) return '권선구';
  if (dist.includes('팔달')) return '팔달구';
  if (dist.includes('용인') || city.includes('용인')) return '용인시';
  if (dist.includes('화성') || city.includes('화성')) return '화성시';
  
  // 2. Exact district / city name in full address
  if (fullAddress.includes('장안구')) return '장안구';
  if (fullAddress.includes('영통구')) return '영통구';
  if (fullAddress.includes('권선구')) return '권선구';
  if (fullAddress.includes('팔달구')) return '팔달구';
  if (fullAddress.includes('용인시') || fullAddress.includes('용인')) return '용인시';
  if (fullAddress.includes('화성시') || fullAddress.includes('화성')) return '화성시';
  
  // 3. Dong & Street Inference for 수원시 districts
  // Gwonseon-gu (권선구) dongs/streets
  const gwonseonKeywords = [
    '세류', '호매실', '금곡', '곡반정', '오목천', '서둔', '탑동', 
    '고색', '평동', '당수', '입북', '구운', '평리', '장지', '대황교'
  ];
  if (gwonseonKeywords.some(kw => fullAddress.includes(kw))) return '권선구';
  
  // Jangan-gu (장안구) dongs/streets
  const janganKeywords = [
    '정자', '조원', '율전', '천천', '파장', '영화', '송죽', '연무', '이목', '상광교', '하광교'
  ];
  if (janganKeywords.some(kw => fullAddress.includes(kw))) return '장안구';
  
  // Yeongtong-gu (영통구) dongs/streets
  const yeongtongKeywords = [
    '매탄', '원천', '이의', '망포', '신동', '광교', '하동', '영통'
  ];
  if (yeongtongKeywords.some(kw => fullAddress.includes(kw))) return '영통구';
  
  // Paldal-gu (팔달구) dongs/streets ('장안동' in Suwon is situated in 팔달구)
  const paldalKeywords = [
    '인계', '우만', '지동', '매교', '고등', '화서', '매향', '신풍', '교동', '행궁', '남창', '영동', '중동', '구천', '장안동'
  ];
  if (paldalKeywords.some(kw => fullAddress.includes(kw))) return '팔달구';
  
  // 4. Broad check on district substrings in full address
  if (fullAddress.includes('장안')) return '장안구';
  if (fullAddress.includes('영통')) return '영통구';
  if (fullAddress.includes('권선')) return '권선구';
  if (fullAddress.includes('팔달')) return '팔달구';

  return '기타(주소)';
};

// Check if candidate is child/student age (7 to 19 years old based on year 2026)
const isStudentAge = (birthDate: string): boolean => {
  if (!birthDate) return false;
  const cleaned = birthDate.replace(/[^0-9]/g, '');
  if (cleaned.length < 6) return false;
  
  let year = 0;
  if (cleaned.length === 6) {
    const yy = parseInt(cleaned.substring(0, 2), 10);
    // current year is 2026. If yy is <= 26, it's 2000s, else 1900s
    year = yy <= 26 ? 2000 + yy : 1900 + yy;
  } else if (cleaned.length === 8) {
    year = parseInt(cleaned.substring(0, 4), 10);
  } else {
    return false;
  }
  
  const age = 2026 - year;
  return age >= 7 && age < 19;
};

// Split phone number and parenthesized label (e.g. 010-0000-0000(본인) -> number: 010-0000-0000, label: (본인))
const splitPhoneAndLabel = (phoneStr: string) => {
  if (!phoneStr) return { number: '', label: '' };
  
  const cleaned = phoneStr.trim();
  const idx = cleaned.indexOf('(');
  if (idx !== -1) {
    return {
      number: cleaned.substring(0, idx).trim(),
      label: cleaned.substring(idx).trim()
    };
  }
  
  return {
    number: cleaned,
    label: ''
  };
};

// Unified filter criteria check for candidates
export const matchesFilter = (cand: Candidate, filterVal: string): boolean => {
  if (filterVal === '전체') return true;
  if (['장안구', '영통구', '권선구', '팔달구', '용인시', '화성시', '기타(주소)'].includes(filterVal)) {
    return getDistrictGroup(cand) === filterVal;
  }
  if (filterVal === '남') {
    return (cand.gender || '').trim() === '남';
  }
  if (filterVal === '여') {
    return (cand.gender || '').trim() === '여';
  }
  if (filterVal === '아동 및 학생') {
    return isStudentAge(cand.birthDate);
  }
  if (filterVal === '차량 필요') {
    const text = `${cand.serviceContent || ''} ${cand.specialNotes || ''}`.toLowerCase();
    const hasVehicleKeywords = /차량|자가용|운전/.test(text);
    const isOptionalOrNotReq = /무관|상관\s*없|괜찮|없어도|대중교통/.test(text);
    return hasVehicleKeywords && !isOptionalOrNotReq;
  }
  if (filterVal === '차량 필요 없음') {
    const text = `${cand.serviceContent || ''} ${cand.specialNotes || ''}`.toLowerCase();
    const hasVehicleKeywords = /차량|자가용|운전/.test(text);
    const isOptionalOrNotReq = /무관|상관\s*없|괜찮|없어도|대중교통/.test(text);
    return !hasVehicleKeywords || isOptionalOrNotReq;
  }
  if (filterVal === '교내지원서비스') {
    const text = `${cand.serviceContent || ''} ${cand.specialNotes || ''}`.toLowerCase();
    return /교내|학교|등교|하교/.test(text);
  }
  if (filterVal === '120시간 미만') {
    const total = getTotalFundingHours(cand);
    const hasFunding = [cand.fundingNational, cand.fundingProvincial, cand.fundingCity].some(
      v => v && String(v).trim() !== '' && String(v).trim() !== '-'
    );
    return (hasFunding || total > 0) && total < 120;
  }
  if (filterVal === '160시간 이상') {
    const total = getTotalFundingHours(cand);
    return total >= 160;
  }
  if (filterVal === '200시간 이상') {
    const total = getTotalFundingHours(cand);
    return total >= 200;
  }
  if (filterVal === '260시간 이상') {
    const total = getTotalFundingHours(cand);
    return total >= 260;
  }
  return true;
};

export default function CandidateTable({
  candidates,
  onSelect,
  onEdit,
  onAddNew,
  onUpdateCategory,
  onDelete,
  selectedYear,
  onPrintTrigger,
  onOpenMatchingRecord,
  privacyMode = false
}: CandidateTableProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Helper for masking personal data
  const maskText = (text: string, type: 'name' | 'birth' | 'phone' = 'name') => {
    if (!privacyMode || !text) return text;
    if (type === 'name') {
      if (text.length <= 2) return text.substring(0, 1) + '*';
      return text.substring(0, 1) + '*'.repeat(text.length - 2) + text.substring(text.length - 1);
    }
    if (type === 'birth') {
      return text.length >= 4 ? text.substring(0, 4) + '**' : text;
    }
    if (type === 'phone') {
      return text.replace(/(\d{2,3})-(\d{3,4})-(\d{4})/, '$1-****-$3');
    }
    return text;
  };
  const [categoryFilter, setCategoryFilter] = useState<'전체' | CategoryType>('전체');
  const [activeFilters, setActiveFilters] = useState<string[]>(['전체']);

  const handleToggleFilter = (filterValue: string) => {
    if (filterValue === '전체') {
      setActiveFilters(['전체']);
      return;
    }

    setActiveFilters(prev => {
      const withoutAll = prev.filter(f => f !== '전체');
      if (withoutAll.includes(filterValue)) {
        const updated = withoutAll.filter(f => f !== filterValue);
        return updated.length === 0 ? ['전체'] : updated;
      } else {
        return [...withoutAll, filterValue];
      }
    });
  };
  const [viewMode, setViewMode] = useState<'card' | 'excel'>('card');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'category' | 'district'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50); // Default 50 per page for ultra smooth 60fps performance

  const handleEditClick = (cand: Candidate) => {
    if (onEdit) onEdit(cand);
    else if (onSelect) onSelect(cand);
  };

  // Multi-column search implementation memoized
  const filteredCandidates = useMemo(() => {
    return candidates.filter(cand => {
      // Category filter
      if (categoryFilter !== '전체' && cand.category !== categoryFilter) {
        return false;
      }

      // Multi-facet selection filter:
      // OR logic within each category group (e.g. 장안구 OR 영통구, 160시간 이상 OR 200시간 이상)
      // AND logic across different category groups (e.g. (장안구 OR 영통구) AND (남) AND (160시간 이상))
      if (!activeFilters.includes('전체') && activeFilters.length > 0) {
        // 1. District group (OR)
        const selectedDistricts = activeFilters.filter(f => (FILTER_GROUPS.district as readonly string[]).includes(f));
        if (selectedDistricts.length > 0) {
          const matchedDistrict = selectedDistricts.some(d => matchesFilter(cand, d));
          if (!matchedDistrict) return false;
        }

        // 2. Gender group (OR)
        const selectedGenders = activeFilters.filter(f => (FILTER_GROUPS.gender as readonly string[]).includes(f));
        if (selectedGenders.length > 0) {
          const matchedGender = selectedGenders.some(g => matchesFilter(cand, g));
          if (!matchedGender) return false;
        }

        // 3. Age group (OR)
        const selectedAges = activeFilters.filter(f => (FILTER_GROUPS.age as readonly string[]).includes(f));
        if (selectedAges.length > 0) {
          const matchedAge = selectedAges.some(a => matchesFilter(cand, a));
          if (!matchedAge) return false;
        }

        // 4. Vehicle requirement group (OR)
        const selectedVehicles = activeFilters.filter(f => (FILTER_GROUPS.vehicle as readonly string[]).includes(f));
        if (selectedVehicles.length > 0) {
          const matchedVehicle = selectedVehicles.some(v => matchesFilter(cand, v));
          if (!matchedVehicle) return false;
        }

        // 5. Special service group (OR)
        const selectedServices = activeFilters.filter(f => (FILTER_GROUPS.service as readonly string[]).includes(f));
        if (selectedServices.length > 0) {
          const matchedService = selectedServices.some(s => matchesFilter(cand, s));
          if (!matchedService) return false;
        }

        // 6. Time / Voucher Hours group (OR)
        const selectedTimes = activeFilters.filter(f => (FILTER_GROUPS.time as readonly string[]).includes(f));
        if (selectedTimes.length > 0) {
          const matchedTime = selectedTimes.some(t => matchesFilter(cand, t));
          if (!matchedTime) return false;
        }
      }

      // Text search
      const term = searchTerm.trim().toLowerCase();
      if (!term) return true;

      const fundingMatch = (
        (cand.fundingNational && cand.fundingNational.toLowerCase().includes(term)) ||
        (cand.fundingProvincial && cand.fundingProvincial.toLowerCase().includes(term)) ||
        (cand.fundingCity && cand.fundingCity.toLowerCase().includes(term))
      );

      const addressParts = [];
      if (cand.addressCity) addressParts.push(cand.addressCity.trim());
      if (cand.addressDistrict) addressParts.push(cand.addressDistrict.trim());
      if (cand.addressDong && cand.addressDong.trim()) {
        const trimmedDong = cand.addressDong.trim();
        if (trimmedDong.endsWith('동') || trimmedDong.endsWith('읍') || trimmedDong.endsWith('면')) {
          addressParts.push(trimmedDong);
        }
      }
      if (cand.addressDetail) addressParts.push(cand.addressDetail.trim());
      const combinedAddress = addressParts.join(' ').toLowerCase();

      const serviceNotesCombined = `${cand.serviceContent || ''} ${cand.specialNotes || ''}`.toLowerCase();
      
      return (
        (cand.name || '').toLowerCase().includes(term) ||
        (cand.registrar || '').toLowerCase().includes(term) ||
        (cand.phone || '').includes(term) ||
        (cand.disabilityType || '').toLowerCase().includes(term) ||
        (cand.disabilityGrade || '').toLowerCase().includes(term) ||
        combinedAddress.includes(term) ||
        serviceNotesCombined.includes(term) ||
        fundingMatch ||
        (cand.remarks || '').toLowerCase().includes(term)
      );
    });
  }, [candidates, categoryFilter, searchTerm, activeFilters]);

  // Sort candidates memoized
  const sortedCandidates = useMemo(() => {
    return [...filteredCandidates].sort((a, b) => {
      let checkA = '';
      let checkB = '';

      if (sortBy === 'date') {
        checkA = a.registrationDate || '';
        checkB = b.registrationDate || '';
      } else if (sortBy === 'name') {
        checkA = a.name || '';
        checkB = b.name || '';
      } else if (sortBy === 'category') {
        checkA = a.category || '';
        checkB = b.category || '';
      } else if (sortBy === 'district') {
        checkA = getDistrictGroup(a);
        checkB = getDistrictGroup(b);
      }

      if (sortOrder === 'asc') {
        return checkA.localeCompare(checkB);
      } else {
        return checkB.localeCompare(checkA);
      }
    });
  }, [filteredCandidates, sortBy, sortOrder]);

  // Pagination calculation
  const totalPages = pageSize === -1 ? 1 : Math.ceil(sortedCandidates.length / pageSize) || 1;
  const paginatedCandidates = useMemo(() => {
    if (pageSize === -1) return sortedCandidates;
    const start = (currentPage - 1) * pageSize;
    return sortedCandidates.slice(start, start + pageSize);
  }, [sortedCandidates, currentPage, pageSize]);

  const handleDirectPrint = () => {
    if (onPrintTrigger) {
      onPrintTrigger();
    } else {
      try {
        window.focus();
        window.print();
      } catch (e) {
        console.warn('Print failed', e);
      }
    }
  };

  const toggleSort = (type: 'date' | 'name' | 'category' | 'district') => {
    if (sortBy === type) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(type);
      setSortOrder('asc');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border-none">
      
      {/* Search & Filter Header (Hidden in Print) */}
      <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row gap-4 justify-between items-center bg-slate-50/70 print:hidden">
        
        {/* Left Side: Category filtering tabs & Print Button */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          <div className="flex bg-slate-200/80 p-1 rounded-xl w-full sm:w-auto shrink-0">
            {(['전체', '대기', '삭제', '보류', '연계'] as const).map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setCategoryFilter(cat);
                  setCurrentPage(1);
                }}
                className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
                {cat !== '전체' && (
                  <span className={`ml-1 px-1 rounded text-[10px] font-black ${
                    cat === '대기' ? 'bg-orange-50 text-orange-600' :
                    cat === '삭제' ? 'bg-rose-50 text-rose-600' :
                    cat === '보류' ? 'bg-amber-50 text-amber-600' :
                    'bg-emerald-50 text-emerald-600'
                  }`}>
                    {candidates.filter(c => c.category === cat).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* View Mode Toggle: Card vs Excel Table */}
          <div className="flex bg-slate-200/80 p-1 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'card'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="기본 카드형 상세 목록으로 봅니다."
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>카드형 상세</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('excel')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'excel'
                  ? 'bg-white text-emerald-800 shadow-xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="엑셀 저장 파일과 동일한 17개 열 정통 표 양식으로 봅니다."
            >
              <Table className="w-3.5 h-3.5 text-emerald-600" />
              <span>엑셀 양식 표</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleDirectPrint}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border border-slate-200 shadow-xs"
            title="현재 선택한 분류 및 필터 기준으로 출력물을 인쇄합니다."
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>선택 목록 인쇄</span>
          </button>
        </div>

        {/* Right Side: New candidate button, Page size selector & Search Input */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          {onAddNew && (
            <button
              type="button"
              onClick={onAddNew}
              className="px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
              title="신규 대기자 등록"
            >
              <UserPlus className="w-4 h-4" />
              <span>신규 대기자 등록</span>
            </button>
          )}

          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="text-xs font-bold px-2.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700 shrink-0 cursor-pointer shadow-xs"
            title="페이지당 표시 건수"
          >
            <option value={30}>30개씩 보기</option>
            <option value={50}>50개씩 (추천·고속)</option>
            <option value={100}>100개씩 보기</option>
            <option value={200}>200개씩 보기</option>
            <option value={-1}>전체 보기</option>
          </select>

          <div className="relative flex-1 flex items-center">
            <span className="absolute left-3 text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              className="w-full text-xs pl-9 pr-14 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs transition-all text-slate-800 placeholder-slate-400 font-medium"
              placeholder="성명, 연락처, 주소, 장애유형, 재원 검색..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setCurrentPage(1);
                }}
                className="absolute right-2.5 text-[11px] text-slate-500 hover:text-slate-800 font-bold bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded cursor-pointer"
              >
                지우기
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Selection Filter Row (Hidden in Print) */}
      <div className="px-4 py-3 bg-slate-100/55 border-b border-slate-200/80 flex flex-wrap items-center gap-2 print:hidden">
        <div className="flex items-center gap-1.5 shrink-0 mr-1">
          <span className="text-[11.5px] font-extrabold text-slate-500 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-slate-500" />
            선택 필터:
          </span>
          {!activeFilters.includes('전체') && (
            <button
              type="button"
              onClick={() => {
                setActiveFilters(['전체']);
                setCurrentPage(1);
              }}
              className="text-[10.5px] font-bold text-slate-500 hover:text-rose-600 bg-white hover:bg-rose-50 px-2 py-0.5 rounded-md border border-slate-200 hover:border-rose-200 transition-colors flex items-center gap-1 cursor-pointer"
              title="모든 선택 필터 초기화"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              초기화
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {ALL_SELECTION_FILTERS.map(filterValue => {
            // Count candidates matching this individual filter criteria
            const count = candidates.filter(c => {
              const regYear = c.registrationDate ? c.registrationDate.substring(0, 4) : '';
              const yearMatch = selectedYear === '전체' || regYear === selectedYear;
              if (!yearMatch) return false;
              
              if (categoryFilter !== '전체' && c.category !== categoryFilter) return false;

              return matchesFilter(c, filterValue);
            }).length;

            const isSelected = activeFilters.includes(filterValue);

            // Determine active styles based on filter group
            let activeStyle = 'bg-emerald-600 text-white border-emerald-600 shadow-3xs';
            let activeLabelStyle = 'bg-emerald-700 text-emerald-100';
            
            if (['남', '여'].includes(filterValue)) {
              activeStyle = 'bg-slate-800 text-white border-slate-800 shadow-3xs';
              activeLabelStyle = 'bg-slate-950 text-slate-200';
            } else if (filterValue === '아동 및 학생') {
              activeStyle = 'bg-indigo-600 text-white border-indigo-600 shadow-3xs';
              activeLabelStyle = 'bg-indigo-700 text-indigo-100';
            } else if (['차량 필요', '차량 필요 없음', '교내지원서비스'].includes(filterValue)) {
              activeStyle = 'bg-teal-600 text-white border-teal-600 shadow-3xs';
              activeLabelStyle = 'bg-teal-700 text-teal-100';
            } else if ((FILTER_GROUPS.time as readonly string[]).includes(filterValue)) {
              activeStyle = 'bg-slate-700 text-white border-slate-700 shadow-3xs';
              activeLabelStyle = 'bg-slate-900 text-slate-200';
            }

            return (
              <button
                key={filterValue}
                type="button"
                onClick={() => {
                  handleToggleFilter(filterValue);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center ${
                  isSelected
                    ? `${activeStyle} font-black`
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                {filterValue}
                <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[9.5px] font-black ${
                  isSelected
                    ? activeLabelStyle
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. PRINT-ONLY VIEW: Exact Excel 17-Column Document Layout                 */}
      {/* Always prints the full filtered list in strict tabular Excel format       */}
      {/* ========================================================================= */}
      <div className="hidden print:block w-full bg-white p-2">
        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2 mb-2">
          <div>
            <h2 className="text-base font-black text-slate-950 tracking-tight">
              이용대기명단 ({selectedYear === '전체' ? '전체' : `${selectedYear}년`} 접수자)
            </h2>
            <p className="text-[9px] text-slate-600 font-semibold">
              수원시장애인종합복지관
            </p>
          </div>
          <div className="text-right text-[9px] text-slate-700 font-semibold">
            <p>출력일자: {new Date().toLocaleDateString('ko-KR')}</p>
            <p>출력대상: 총 {sortedCandidates.length}명 {categoryFilter !== '전체' ? `[${categoryFilter}]` : ''}</p>
          </div>
        </div>

        <table className="w-full border-collapse border border-slate-400 text-[8px] leading-tight table-fixed">
          <thead>
            <tr className="bg-slate-100 text-slate-950 font-black border-b border-slate-400 text-center">
              <th className="border border-slate-400 p-1 w-[3%]">순번</th>
              <th className="border border-slate-400 p-1 w-[4%]">구분</th>
              <th className="border border-slate-400 p-1 w-[6%]">접수일</th>
              <th className="border border-slate-400 p-1 w-[5%]">접수자</th>
              <th className="border border-slate-400 p-1 w-[6%]">성명</th>
              <th className="border border-slate-400 p-1 w-[6%]">생년월일</th>
              <th className="border border-slate-400 p-1 w-[3%]">성별</th>
              <th className="border border-slate-400 p-1 w-[6%]">장애유형</th>
              <th className="border border-slate-400 p-1 w-[4%]">급수</th>
              <th className="border border-slate-400 p-1 w-[4%]">국비</th>
              <th className="border border-slate-400 p-1 w-[4%]">도비</th>
              <th className="border border-slate-400 p-1 w-[4%]">시비</th>
              <th className="border border-slate-400 p-1 w-[13%]">주소</th>
              <th className="border border-slate-400 p-1 w-[8%]">연락처</th>
              <th className="border border-slate-400 p-1 w-[12%]">서비스내용</th>
              <th className="border border-slate-400 p-1 w-[12%]">추가상담</th>
              <th className="border border-slate-400 p-1 w-[4%]">매칭</th>
            </tr>
          </thead>
          <tbody>
            {sortedCandidates.map((cand, idx) => {
              const matchedVal = getLastLogMatching(cand);
              const combinedAddress = getCombinedAddress(cand);
              const combinedService = [cand.serviceContent, cand.specialNotes ? `[특이사항] ${cand.specialNotes}` : '']
                .filter(Boolean)
                .join('\n');
              const logsText = (cand.consultationLogs || [])
                .map(l => `[${l.date}] ${l.content}`)
                .join('\n');

              return (
                <tr key={`print-cand-${cand.id}`} className="border-b border-slate-300">
                  <td className="border border-slate-300 p-1 text-center font-mono">{idx + 1}</td>
                  <td className="border border-slate-300 p-1 text-center font-bold">{cand.category}</td>
                  <td className="border border-slate-300 p-1 text-center font-mono">{cand.registrationDate || '-'}</td>
                  <td className="border border-slate-300 p-1 text-center">{cand.registrar || '-'}</td>
                  <td className="border border-slate-300 p-1 text-center font-bold">{maskText(cand.name, 'name')}</td>
                  <td className="border border-slate-300 p-1 text-center font-mono">{maskText(cand.birthDate, 'birth') || '-'}</td>
                  <td className="border border-slate-300 p-1 text-center">{cand.gender || '-'}</td>
                  <td className="border border-slate-300 p-1 text-center">{cand.disabilityType || '-'}</td>
                  <td className="border border-slate-300 p-1 text-center">{cand.disabilityGrade || '-'}</td>
                  <td className="border border-slate-300 p-1 text-center">{cand.fundingNational || '-'}</td>
                  <td className="border border-slate-300 p-1 text-center">{cand.fundingProvincial || '-'}</td>
                  <td className="border border-slate-300 p-1 text-center">{cand.fundingCity || '-'}</td>
                  <td className="border border-slate-300 p-1 text-left break-all">{combinedAddress}</td>
                  <td className="border border-slate-300 p-1 text-center font-mono text-[10px]">
                    {(() => {
                      const printPhones = formatPhoneNumbers(cand.phone);
                      if (printPhones.length > 0) {
                        return (
                          <div className="space-y-1">
                            {printPhones.map((ph, pIdx) => {
                              const { number, label } = splitPhoneAndLabel(ph);
                              return (
                                <div key={pIdx} className="leading-tight text-center">
                                  <div className="font-bold whitespace-nowrap">{maskText(number, 'phone')}</div>
                                  {label && <div className="text-[9px] text-slate-500 whitespace-nowrap">{label}</div>}
                                </div>
                              );
                            })}
                          </div>
                        );
                      }
                      return '-';
                    })()}
                  </td>
                  <td className="border border-slate-300 p-1 text-left whitespace-pre-wrap break-all">{combinedService || '-'}</td>
                  <td className="border border-slate-300 p-1 text-left whitespace-pre-wrap break-all">{logsText || '-'}</td>
                  <td className={`border border-slate-300 p-1 text-center font-black ${
                    matchedVal === 'O' ? 'text-emerald-700' : 'text-slate-400'
                  }`}>
                    {matchedVal}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Main Table Area with Optimized Render (Hidden in Print) */}
      <div className="print:hidden">
        {viewMode === 'excel' ? (
          /* EXCEL-LIKE SPREADSHEET TABLE ON SCREEN */
          <div className="overflow-x-auto border-b border-slate-200">
            <table className="w-full border-collapse text-left text-[11px] table-fixed min-w-0">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold text-[11.5px] whitespace-nowrap sticky top-0 z-10">
                  <th className="py-2 px-1 text-center w-[2%] border-r border-slate-200">순번</th>
                  <th className="py-2 px-1 text-center w-[4%] border-r border-slate-200 cursor-pointer hover:bg-slate-200/70 select-none" onClick={() => toggleSort('category')}>
                    구분{sortBy === 'category' && (sortOrder === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="py-2 px-1 text-center w-[5%] border-r border-slate-200 cursor-pointer hover:bg-slate-200/70 select-none" onClick={() => toggleSort('date')}>
                    접수일{sortBy === 'date' && (sortOrder === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="py-2 px-1 text-center w-[4%] border-r border-slate-200">접수자</th>
                  <th className="py-2 px-1 text-center w-[4%] border-r border-slate-200 cursor-pointer hover:bg-slate-200/70 select-none" onClick={() => toggleSort('name')}>
                    성명{sortBy === 'name' && (sortOrder === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="py-2 px-1 text-center w-[5%] border-r border-slate-200">생년월일</th>
                  <th className="py-2 px-1 text-center w-[2%] border-r border-slate-200">성별</th>
                  <th className="py-2 px-1 text-center w-[4%] border-r border-slate-200">장애유형</th>
                  <th className="py-2 px-1 text-center w-[2%] border-r border-slate-200">급수</th>
                  <th className="py-2 px-1 text-center w-[2%] border-r border-slate-200">국비</th>
                  <th className="py-2 px-1 text-center w-[2%] border-r border-slate-200">도비</th>
                  <th className="py-2 px-1 text-center w-[2%] border-r border-slate-200">시비</th>
                  <th className="py-2 px-2 text-left w-[10%] border-r border-slate-200 select-none">
                    주소
                  </th>
                  <th className="py-2 px-2 text-center w-[8%] border-r border-slate-200">연락처</th>
                  <th className="py-2 px-2 text-left w-[19%] border-r border-slate-200">서비스내용</th>
                  <th className="py-2 px-2 text-left w-[15.5%] border-r border-slate-200">추가상담</th>
                  <th className="py-2 px-1 text-center w-[4.5%] border-r border-slate-200">매칭</th>
                  <th className="py-2 px-1 text-center w-[5%]">관리</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {paginatedCandidates.length > 0 ? (
                  paginatedCandidates.map((cand, idx) => {
                    const matchedVal = getLastLogMatching(cand);
                    const globalIndex = pageSize === -1 ? idx + 1 : (currentPage - 1) * pageSize + idx + 1;
                    const combinedAddress = getCombinedAddress(cand);
                    const phoneList = formatPhoneNumbers(cand.phone);

                    return (
                      <tr key={`excel-cand-${cand.id}`} className="hover:bg-emerald-50/45 odd:bg-white even:bg-slate-50/50 transition-colors group text-[11.5px] border-b-[2px] border-slate-300/80 [&>td]:align-middle">
                        <td className="py-4 px-0.5 text-center font-mono font-semibold text-slate-500 border-r border-slate-200 text-[11.5px] align-middle">
                          {globalIndex}
                        </td>
                        <td className="py-3 px-0.5 text-center border-r border-slate-200 align-middle">
                          <select
                            value={cand.category}
                            onChange={(e) => onUpdateCategory(cand.id, e.target.value as CategoryType)}
                            className={`text-[11px] font-bold px-1 py-0.5 rounded border outline-none cursor-pointer w-full text-center ${
                              cand.category === '대기' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                              cand.category === '삭제' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                              cand.category === '보류' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            <option value="대기">대기</option>
                            <option value="보류">보류</option>
                            <option value="연계">연계</option>
                            <option value="삭제">삭제</option>
                          </select>
                        </td>
                        <td className="py-4 px-0.5 text-center font-mono text-slate-600 border-r border-slate-200 text-[11px] align-middle">
                          {cand.registrationDate || '-'}
                        </td>
                        <td className="py-4 px-0.5 text-center font-medium text-slate-700 border-r border-slate-200 text-[11.5px] truncate align-middle" title={cand.registrar || ''}>
                          {cand.registrar || '-'}
                        </td>
                        <td className="py-4 px-0.5 text-center font-black text-slate-900 border-r border-slate-200 text-[12px] truncate align-middle" title={cand.name}>
                          {maskText(cand.name, 'name')}
                        </td>
                        <td className="py-4 px-0.5 text-center font-mono font-bold text-slate-900 border-r border-slate-200 text-[11px] align-middle">
                          {maskText(cand.birthDate, 'birth') || '-'}
                        </td>
                        <td className="py-4 px-0.5 text-center text-slate-700 border-r border-slate-200 text-[11.5px] align-middle">
                          {cand.gender || '-'}
                        </td>
                        <td className="py-4 px-0.5 text-center text-slate-800 font-medium border-r border-slate-200 text-[11.5px] truncate align-middle" title={cand.disabilityType || ''}>
                          {cand.disabilityType || '-'}
                        </td>
                        <td className="py-4 px-0.5 text-center text-slate-600 border-r border-slate-200 text-[11px] align-middle">
                          {cand.disabilityGrade || '-'}
                        </td>
                        <td className="py-4 px-0.5 text-center font-mono font-bold text-emerald-700 border-r border-slate-200 text-[11.5px] align-middle">
                          {cand.fundingNational || '-'}
                        </td>
                        <td className="py-4 px-0.5 text-center font-mono font-bold text-sky-700 border-r border-slate-200 text-[11.5px] align-middle">
                          {cand.fundingProvincial || '-'}
                        </td>
                        <td className="py-4 px-0.5 text-center font-mono font-bold text-purple-700 border-r border-slate-200 text-[11.5px] align-middle">
                          {cand.fundingCity || '-'}
                        </td>
                        <td className="py-4 px-1.5 text-left text-slate-700 border-r border-slate-200 text-[11.5px] align-middle font-medium leading-normal break-all">
                          {combinedAddress}
                        </td>
                        <td className="py-4 px-1 text-center border-r border-slate-200 text-[11.5px] align-middle">
                          {phoneList.length > 0 ? (
                            <div className="flex flex-col gap-1 items-center justify-center">
                              {phoneList.map((ph, pIdx) => {
                                const { number, label } = splitPhoneAndLabel(ph);
                                return (
                                  <div key={pIdx} className="leading-tight text-center">
                                    <div className="font-bold tracking-tight text-slate-800 text-[11.5px] whitespace-nowrap">
                                      {maskText(number, 'phone')}
                                    </div>
                                    {label && (
                                      <div className="text-[10px] text-slate-500 font-extrabold whitespace-nowrap leading-none mt-0.5">
                                        {label}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : '-'}
                        </td>
                        <td className="py-4 px-2 text-left text-slate-900 border-r border-slate-200 text-[12.5px] align-middle">
                          <div className="leading-relaxed font-medium text-slate-900">
                            <div>{cand.serviceContent || '-'}</div>
                            {cand.specialNotes && (
                              <div className="mt-1.5 text-rose-700 text-[11.5px] bg-rose-50/60 p-1.5 rounded border border-rose-200 font-normal leading-normal">
                                <strong className="text-rose-900 font-semibold bg-rose-100/70 px-1.5 py-0.5 rounded mr-1">[특이사항]</strong> {cand.specialNotes}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-1.5 text-left text-slate-900 border-r border-slate-200 text-[12px] align-middle">
                          <div className="space-y-1.5">
                            {cand.consultationLogs && cand.consultationLogs.length > 0 ? (
                              cand.consultationLogs.map((log) => (
                                <div key={log.id} className="text-[11.5px] bg-slate-50/90 p-1.5 rounded border border-slate-300 font-medium text-slate-900 leading-normal">
                                  <span className="font-extrabold text-slate-950 font-mono bg-slate-200/60 px-1 py-0.5 rounded mr-1">[{log.date}]</span> {log.content}
                                </div>
                              ))
                            ) : '-'}
                          </div>
                        </td>
                        <td className="py-4 px-0.5 text-center border-r border-slate-200 text-[11.5px] align-middle">
                          <span className={`inline-flex items-center justify-center w-5.5 h-5.5 rounded-full font-black text-[11px] border ${
                            matchedVal === 'O' 
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-300' 
                              : 'bg-rose-50 text-rose-500 border-rose-200'
                          }`}>
                            {matchedVal}
                          </span>
                        </td>
                        <td className="py-4 px-0.5 text-center text-[11.5px] align-middle">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEditClick(cand)}
                              className="p-1 text-emerald-700 hover:bg-emerald-100 rounded border border-emerald-200 cursor-pointer shrink-0"
                              title="수정"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            {onOpenMatchingRecord && (
                              <button
                                type="button"
                                onClick={() => onOpenMatchingRecord(cand)}
                                className="p-1 text-indigo-700 hover:bg-indigo-100 rounded border border-indigo-200 cursor-pointer shrink-0"
                                title="기록지"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onDelete(cand.id)}
                              className="p-1 text-rose-700 hover:bg-rose-100 rounded border border-rose-200 cursor-pointer shrink-0"
                              title="삭제"
                            >
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={18} className="py-12 bg-white text-center text-slate-400 font-medium">
                      {searchTerm ? '검색 필터와 일치하는 접수자가 없습니다.' : '해당 조건의 이용대기자가 등록되지 않았습니다.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* CARD-STYLE TABLE (EXISTING) */
          <div className="overflow-x-auto border-b border-slate-200">
        <table className="w-full border-collapse text-left text-[11px] min-w-[1100px] table-fixed print:min-w-full print:table-auto">
          <thead>
            <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold print:bg-white text-[11px] whitespace-nowrap sticky top-0 z-10">
              <th className="py-2.5 px-3 text-left w-[380px] min-w-[380px] align-middle">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-slate-800 font-black text-[11px]">순번, 인적사항 / 재원·주소·연락처</span>
                  <div className="flex items-center gap-1 print:hidden">
                    <span className="text-[10px] text-slate-400 font-bold">정렬:</span>
                    <button
                      type="button"
                      onClick={() => toggleSort('date')}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all flex items-center gap-0.5 cursor-pointer ${
                        sortBy === 'date'
                          ? 'bg-emerald-600 text-white border-emerald-600 font-black'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      접수일{sortBy === 'date' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSort('name')}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all flex items-center gap-0.5 cursor-pointer ${
                        sortBy === 'name'
                          ? 'bg-emerald-600 text-white border-emerald-600 font-black'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      성명{sortBy === 'name' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSort('category')}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all flex items-center gap-0.5 cursor-pointer ${
                        sortBy === 'category'
                          ? 'bg-emerald-600 text-white border-emerald-600 font-black'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      구분{sortBy === 'category' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </button>
                  </div>
                </div>
              </th>
              <th className="py-2.5 px-3 w-[33%] min-w-[300px] align-middle text-left font-black text-slate-800">서비스 내용 (*특이사항)</th>
              <th className="py-2.5 px-3 w-[41%] min-w-[360px] align-middle text-left font-black text-slate-800">추가상담 (전체 이력)</th>
              <th className="py-2.5 px-2 text-center w-[60px] min-w-[60px] align-middle font-black text-slate-800">매칭여부</th>
              <th className="py-2.5 px-2 text-center w-[90px] min-w-[90px] print:hidden align-middle font-black text-slate-800">관리액션</th>
            </tr>
          </thead>
          
          <tbody className="divide-y divide-slate-200 bg-white">
            {paginatedCandidates.length > 0 ? (
              paginatedCandidates.map((cand, idx) => {
                const matchedVal = getLastLogMatching(cand);
                const globalIndex = pageSize === -1 ? idx + 1 : (currentPage - 1) * pageSize + idx + 1;

                return (
                  <tr 
                    key={cand.id} 
                    className="hover:bg-slate-50/70 transition-colors group print:hover:bg-white"
                  >
                    
                    {/* Aligned Left Block */}
                    <td className="py-2.5 px-3 align-top w-[380px] min-w-[380px]">
                      
                      {/* Top Bar basic details */}
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 py-0.5 px-1 rounded-t-lg text-[11px] w-full">
                        {/* Sequence */}
                        <span className="text-slate-500 font-mono font-bold text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded min-w-[20px] text-center shrink-0">
                          {globalIndex}
                        </span>

                        {/* Category Dropdown Selection */}
                        <div className="shrink-0 print:hidden">
                          <select
                            value={cand.category}
                            onChange={(e) => onUpdateCategory(cand.id, e.target.value as CategoryType)}
                            className={`inline-block px-1.5 py-0.5 text-[10px] font-black rounded cursor-pointer border outline-none font-sans text-center ${
                              cand.category === '대기' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                              cand.category === '삭제' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                              cand.category === '보류' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                              'bg-emerald-50 text-emerald-600 border-emerald-200'
                            }`}
                          >
                            <option value="대기">대기</option>
                            <option value="보류">보류</option>
                            <option value="연계">연계</option>
                            <option value="삭제">삭제</option>
                          </select>
                        </div>
                        <div className="hidden print:block font-extrabold text-[11px] bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded text-center shrink-0">
                          {cand.category}
                        </div>

                        {/* Client Name (이름과 생년월일 통일된 깔끔한 동일 색상) */}
                        <span className="text-slate-900 font-black text-[12px] whitespace-nowrap px-2 py-0.5 shrink-0 bg-slate-100 rounded-md border border-slate-300">
                          {maskText(cand.name, 'name')}
                        </span>

                        {/* Birthdate (이름과 동일한 배경/테두리/텍스트 색상) */}
                        {cand.birthDate ? (
                          <span className="text-slate-900 font-bold font-mono text-[11px] whitespace-nowrap bg-slate-100 px-2 py-0.5 rounded-md border border-slate-300 shrink-0">
                            {maskText(cand.birthDate, 'birth')}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px] px-2 py-0.5 shrink-0 select-none bg-slate-100 rounded-md border border-slate-300">
                            -
                          </span>
                        )}

                        {/* Gender */}
                        <span className="px-2 py-0.5 rounded text-[10.5px] font-bold shrink-0 bg-slate-100 text-slate-700 border border-slate-200">
                          {cand.gender}
                        </span>

                        {/* Disability type & Grade */}
                        <div className="flex items-center gap-1 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-md shrink-0">
                          <span className="font-extrabold text-violet-950 text-[10.5px]">{cand.disabilityType || '미지정'}</span>
                          {cand.disabilityGrade && cand.disabilityGrade !== '미분류' && cand.disabilityGrade !== '미지정' && (
                            <span className="text-[9.5px] text-violet-700 font-bold bg-white border border-violet-200/50 px-1 py-0.2 rounded">
                              {cand.disabilityGrade}
                            </span>
                          )}
                        </div>

                        {/* Registrar with receipt date */}
                        <span className="text-slate-500 font-semibold text-[10px] whitespace-nowrap bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md shrink-0 sm:ml-auto">
                          접수: {cand.registrar || '미지정'} ({cand.registrationDate})
                        </span>
                      </div>

                      {/* Funding Row (국비, 도비, 시비 적절한 크기 & 적당한 여백을 둔 총 000시간) */}
                      {(() => {
                        const totalHours = getTotalFundingHours(cand);
                        return (
                          <div className="mt-1.5 bg-slate-50/80 border border-slate-200/90 rounded-lg px-2.5 py-1.5 flex flex-wrap items-center gap-1.5 shadow-3xs">
                            {/* 국비 */}
                            <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-md border border-emerald-200 shadow-3xs">
                              <span className="text-[10.5px] font-bold text-emerald-700">국비</span>
                              <span className="text-[12px] font-bold font-mono text-emerald-800">
                                {cand.fundingNational || '-'}
                              </span>
                              {cand.fundingNational && !cand.fundingNational.includes('시') && cand.fundingNational !== '-' && (
                                <span className="text-[9.5px] text-emerald-600">시간</span>
                              )}
                            </div>

                            {/* 도비 */}
                            <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-md border border-sky-200 shadow-3xs">
                              <span className="text-[10.5px] font-bold text-sky-700">도비</span>
                              <span className="text-[12px] font-bold font-mono text-sky-800">
                                {cand.fundingProvincial || '-'}
                              </span>
                              {cand.fundingProvincial && !cand.fundingProvincial.includes('시') && cand.fundingProvincial !== '-' && (
                                <span className="text-[9.5px] text-sky-600">시간</span>
                              )}
                            </div>

                            {/* 시비 */}
                            <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-md border border-purple-200 shadow-3xs">
                              <span className="text-[10.5px] font-bold text-purple-700">시비</span>
                              <span className="text-[12px] font-bold font-mono text-purple-800">
                                {cand.fundingCity || '-'}
                              </span>
                              {cand.fundingCity && !cand.fundingCity.includes('시') && cand.fundingCity !== '-' && (
                                <span className="text-[9.5px] text-purple-600">시간</span>
                              )}
                            </div>

                            {/* 총 000시간 (과도하지 않고 편안한 여백으로 정렬) */}
                            {totalHours > 0 && (
                              <div className="ml-auto flex items-center px-2 py-0.5 bg-amber-50 border border-amber-300 text-amber-900 rounded-md text-[11px] font-bold whitespace-nowrap shadow-3xs">
                                총 <span className="font-mono font-black text-amber-800 ml-0.5 mr-0.5">{totalHours}</span>시간
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Address and Contact Block */}
                      <div className="mt-1.5 bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 space-y-1.5 shadow-3xs">
                        <div className="flex gap-1.5 items-start text-[11.5px] text-slate-700 leading-normal">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5 print:hidden" />
                          <span className="keep-all break-keep whitespace-normal leading-relaxed text-[11.5px] font-medium text-slate-800">
                            {(() => {
                              const parts = [];
                              if (cand.addressCity) parts.push(cand.addressCity.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim());
                              if (cand.addressDistrict) parts.push(cand.addressDistrict.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim());
                              if (cand.addressDong && cand.addressDong.trim()) {
                                parts.push(cand.addressDong.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim());
                              }
                              if (cand.addressDetail) parts.push(cand.addressDetail.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim());
                              return parts.join(' ').replace(/\s+/g, ' ').trim() || '상세 주소 없음';
                            })()}
                          </span>
                        </div>

                        {/* Contact (Horizontal Flow underneath Address) */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-200/60 mt-1.5">
                          {(() => {
                            const parsedPhones = formatPhoneNumbers(cand.phone);
                            if (parsedPhones.length > 0) {
                              return (
                                <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                                  {parsedPhones.map((phone, pIdx) => {
                                    const { number, label } = splitPhoneAndLabel(phone);
                                    return (
                                      <div key={pIdx} className="flex items-center gap-1.5 bg-white border border-slate-200/90 rounded-md px-2 py-0.5 whitespace-nowrap text-slate-800 font-medium shrink-0 shadow-3xs">
                                        <Phone className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                        <span className="font-mono text-[11px] font-bold">{maskText(number, 'phone')}</span>
                                        {label && <span className="text-[9.5px] text-slate-500 font-bold">{label}</span>}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            }
                            return (
                              <div className="flex items-center gap-1 text-slate-300 text-[10px]">
                                <Phone className="w-2.5 h-2.5" />
                                <span>-</span>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                    </td>

                    {/* Combined Service description & Special notes */}
                    <td className="py-2.5 px-3 leading-relaxed align-top w-[33%] min-w-[300px] text-[13px]">
                      <div className="space-y-2">
                        {cand.serviceContent ? (
                          <div className="text-slate-800 font-medium whitespace-pre-wrap break-all leading-relaxed text-[13px]">
                            {cand.serviceContent}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">-</span>
                        )}
                        {cand.specialNotes && (
                          <div className="text-[11.5px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5 break-all whitespace-pre-wrap leading-normal">
                            <strong className="font-semibold">*특이사항:</strong> {cand.specialNotes}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Additional logs */}
                    <td className="py-2.5 px-3 leading-relaxed align-top w-[41%] min-w-[360px] text-[13px]">
                      {cand.consultationLogs && cand.consultationLogs.length > 0 ? (
                        <div className="space-y-2">
                          {[...cand.consultationLogs]
                            .sort((a, b) => a.date.localeCompare(b.date))
                            .map((log) => {
                              const isYearTrigger = selectedYear !== '전체' && log.date.startsWith(selectedYear);
                              return (
                                <div 
                                  key={log.id} 
                                  className={`text-[12px] border-l-2 pl-2 py-0.5 leading-relaxed ${
                                    isYearTrigger 
                                      ? 'border-emerald-500 text-emerald-950 bg-emerald-50/70 p-1 rounded-r-md font-semibold' 
                                      : 'border-slate-300 text-slate-700'
                                  }`}
                                >
                                  <span className="font-bold text-[10px] text-slate-400 block mb-0.5">{log.date}</span>
                                  <span className="break-all whitespace-pre-wrap">{log.content}</span>
                                </div>
                              );
                            })}
                        </div>
                      ) : (
                        <span className="text-slate-300 text-[11px] whitespace-nowrap">상담 이력 없음</span>
                      )}
                    </td>

                    {/* Matching status O/X column */}
                    <td className="py-2.5 px-2 text-center align-top w-[60px] min-w-[60px]">
                      <div className="pt-2">
                        <span className={`inline-block px-2 py-0.5 text-xs font-black rounded-lg border-2 ${
                          matchedVal === 'O' 
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-300' 
                            : 'bg-rose-50 text-rose-500 border-rose-200'
                        }`}>
                          {matchedVal}
                        </span>
                      </div>
                    </td>

                    {/* Quick CRUD action items */}
                    <td className="py-2.5 px-2 text-center print:hidden align-top w-[90px] min-w-[90px]">
                      <div className="pt-2 flex flex-col items-center justify-center gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
                        <button
                           type="button"
                           onClick={() => handleEditClick(cand)}
                           className="w-full px-2 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-600 hover:text-white rounded transition-all flex items-center justify-center gap-1 cursor-pointer"
                           title="상담 관리 및 수정"
                        >
                          <Edit className="w-2.5 h-2.5" />
                          수정
                        </button>
                        {onOpenMatchingRecord && (
                          <button
                            type="button"
                            onClick={() => onOpenMatchingRecord(cand)}
                            className="w-full px-2 py-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-600 hover:text-white rounded transition-all flex items-center justify-center gap-1 cursor-pointer"
                            title="매칭 과정 기록지 작성/보기"
                          >
                            <FileText className="w-2.5 h-2.5" />
                            기록지
                          </button>
                        )}
                        <button
                           type="button"
                           onClick={() => onDelete(cand.id)}
                           className="w-full px-2 py-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-600 hover:text-white rounded transition-all flex items-center justify-center gap-1 cursor-pointer"
                           title="영구 삭제"
                        >
                          <Trash className="w-2.5 h-2.5" />
                          삭제
                        </button>
                      </div>
                    </td>

                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="py-12 bg-white text-center text-slate-400 font-medium">
                  {searchTerm ? '검색 필터와 일치하는 접수자가 없습니다.' : '해당 조건의 이용대기자가 등록되지 않았습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )}
  </div>

      {/* Pagination & Summary Footer */}
      <div className="p-3.5 bg-slate-50/80 border-t border-slate-200 text-xs text-slate-600 flex flex-col sm:flex-row justify-between items-center print:hidden gap-3">
        
        {/* Total stats */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span>총 <strong className="text-slate-900 font-black">{filteredCandidates.length}명</strong> 중 {pageSize === -1 ? '전체' : `${(currentPage - 1) * pageSize + 1}~${Math.min(currentPage * pageSize, filteredCandidates.length)}명`} 표시</span>
          <span className="text-slate-300">|</span>
          <span className="text-orange-600 font-bold">대기 {candidates.filter(c => c.category === '대기').length}</span>
          <span className="text-amber-600 font-bold">보류 {candidates.filter(c => c.category === '보류').length}</span>
          <span className="text-emerald-600 font-bold">연계 {candidates.filter(c => c.category === '연계').length}</span>
          <span className="text-rose-600 font-bold">삭제 {candidates.filter(c => c.category === '삭제').length}</span>
        </div>

        {/* Pagination Navigation */}
        {pageSize !== -1 && totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none text-slate-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              이전
            </button>
            
            <div className="px-3 py-1 text-xs font-black text-slate-800">
              {currentPage} / {totalPages} 페이지
            </div>

            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none text-slate-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              다음
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

      </div>

    </div>
  );
}
