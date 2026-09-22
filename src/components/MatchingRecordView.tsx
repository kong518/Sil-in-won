/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Candidate, MatchingRecord, MatchingProcessStep, ConsultationLog } from '../types';
import { 
  Printer, 
  Save, 
  RotateCcw, 
  Search, 
  FileText, 
  Check, 
  Trash2, 
  Sparkles,
  Edit3,
  CheckCircle2,
  XCircle,
  ArrowRight,
  User,
  ListOrdered,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckSquare,
  Square,
  Layers,
  Building2,
  X
} from 'lucide-react';
import { 
  saveMatchingRecordToFirestore, 
  deleteMatchingRecordFromFirestore,
  subscribeToMatchingRecords,
  StaffProfile
} from '../services/firebaseService';

interface AutoResizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
}

const AutoResizeTextarea: React.FC<AutoResizeTextareaProps> = ({ value, onChange, className, rows = 2, ...props }) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Set height to auto first to calculate scrollHeight correctly
      textarea.style.height = 'auto';
      // Set height based on scrollHeight
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      className={`${className} overflow-hidden resize-none`}
      rows={rows}
      {...props}
    />
  );
};

interface MatchingRecordViewProps {
  candidates: Candidate[];
  staffProfile: StaffProfile;
  initialCandidate?: Candidate | null;
  onBackToList?: () => void;
  privacyMode?: boolean;
}

// Default 5-step rows template with completely clean blanks
const createDefaultSteps = (): MatchingProcessStep[] => [
  { round: 1, consultDate: '', result: '', assistantName: '', content: '' },
  { round: 2, consultDate: '', result: '', assistantName: '', content: '' },
  { round: 3, consultDate: '', result: '', assistantName: '', content: '' },
  { round: 4, consultDate: '', result: '', assistantName: '', content: '' },
  { round: 5, consultDate: '', result: '', assistantName: '', content: '' }
];

// Sample template strictly based on HWP official print preview capture
const SAMPLE_RECORD: MatchingRecord = {
  id: 'sample_hong_gil_dong',
  userName: '홍길동',
  userBirthDate: '2000.01.01',
  consultDate: '2026. 6. 18.',
  assistantName: '이둘리',
  assistantBirthDate: '7000.12.31',
  consultMethod: '유선',
  consultContent: '이용자는 돌발행동이 심한 장애인으로 기물 파손, 서비스 제공지 이탈 등 서비스를 제공함에 있어 많은 어려움이 있는 이용자임. 이에 제공인력이 더 이상 서비스를 제공하기 힘들 것이라고 하여 보호자는 제공인력 연계를 요청함.',
  counselorOpinion: '이용자 특성을 고려하고 제공인력 연계 전 이를 충분히 고지하여, 오랫동안 서비스를 계속할 수 있는 제공인력을 연계해야 할 것으로 판단됨.',
  steps: [
    { round: 1, consultDate: '6.19', result: '비매칭', assistantName: '이부장', content: '근력이 부족하여 이용자를 제어할 자신이 없어 연계를 포기함' },
    { round: 2, consultDate: '6.22', result: '비매칭', assistantName: '김부장', content: '보호자와 유선 상담을 진행한 후 서비스를 제공하기로 하였으나 거리가 너무 멀다고 함' },
    { round: 3, consultDate: '6.23', result: '매칭', assistantName: '박부장', content: '이용자와 활동지원사 모두 매칭 희망' },
    { round: 4, consultDate: '', result: '', assistantName: '', content: '' },
    { round: 5, consultDate: '', result: '', assistantName: '', content: '' }
  ],
  resultType: '매칭완료',
  resultAssistantName: '박부장',
  handoverDate: '6.27',
  serviceStartDate: '7.1',
  failReason: '',
  writeDate: '2026 .   .   .',
  counselorName: '',
  counselorSignature: '(서명)'
};

/**
 * Reusable HWP Matching Record Sheet Component
 * Used for both the interactive editor sheet and the batch print sheet.
 */
interface HWPRecordSheetProps {
  record: MatchingRecord;
  isEditor?: boolean;
  onUpdateField?: (field: keyof MatchingRecord, value: any) => void;
  onStepChange?: (index: number, field: keyof MatchingProcessStep, value: any) => void;
  showMarginGuide?: boolean;
  maskText: (text: string, isName?: boolean) => string;
  onSetOtherAgencyTransfer?: () => void;
}

function HWPRecordSheet({
  record,
  isEditor = false,
  onUpdateField,
  onStepChange,
  showMarginGuide = false,
  maskText,
  onSetOtherAgencyTransfer
}: HWPRecordSheetProps) {
  const isOtherAgency = 
    record.resultAssistantName === '타기관 연계' || 
    /(타\s*기관\s*연계|타기관연계|타기관)/.test(record.resultAssistantName);

  return (
    <div className="w-full relative text-black bg-white select-text">
      {/* Red dotted guideline box like Hancom HWP preview (Screen Only) */}
      <div className={`hwp-margin-guide-box w-full relative ${showMarginGuide && isEditor ? 'border border-dashed border-red-500/80 p-2 sm:p-3' : 'p-0'}`}>
        
        {/* DOCUMENT TITLE (HWP: 매칭  과정  기록지 - 단어 사이 2칸 공백, 정상 자간) */}
        <div className="text-center pt-1 pb-4">
          <h1 className="text-[26px] sm:text-[28px] font-black text-black tracking-normal inline-block select-none">
            매칭&nbsp;&nbsp;과정&nbsp;&nbsp;기록지
          </h1>
        </div>

        {/* ===================================================================== */}
        {/* TABLE SECTION 1: 이용자 / 활동지원사 / 상담내용 / 상담자의견           */}
        {/* Left column is strictly 14%, aligning with all lower sections!       */}
        {/* ===================================================================== */}
        <table className="hwp-record-table w-full border-collapse border-[1.5px] border-black text-[13px] leading-snug">
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <tbody>
            {/* ROW 1: 이용자 / 생년월일 / 상담일자 (Height: 46px) */}
            <tr style={{ height: '46px' }}>
              <th className="border border-black p-2 text-center font-bold text-black bg-white">
                이용자
              </th>
              <td className="border border-black p-1.5 text-center align-middle">
                {isEditor ? (
                  <>
                    <span className="hidden print-data-text text-center font-bold">{maskText(record.userName, true)}</span>
                    <input
                      type="text"
                      value={record.userName}
                      onChange={(e) => onUpdateField && onUpdateField('userName', e.target.value)}
                      placeholder=""
                      className="print-hidden-input w-full text-center font-bold text-black outline-none focus:bg-amber-50/40"
                    />
                  </>
                ) : (
                  <span className="text-center font-bold">{maskText(record.userName, true)}</span>
                )}
              </td>
              <th className="border border-black p-2 text-center font-bold text-black bg-white">
                생년월일
              </th>
              <td className="border border-black p-1.5 text-center align-middle">
                {isEditor ? (
                  <>
                    <span className="hidden print-data-text text-center">{maskText(record.userBirthDate)}</span>
                    <input
                      type="text"
                      value={record.userBirthDate}
                      onChange={(e) => onUpdateField && onUpdateField('userBirthDate', e.target.value)}
                      placeholder=""
                      className="print-hidden-input w-full text-center text-black outline-none focus:bg-amber-50/40"
                    />
                  </>
                ) : (
                  <span className="text-center">{maskText(record.userBirthDate)}</span>
                )}
              </td>
              <th className="border border-black p-2 text-center font-bold text-black bg-white">
                상담일자
              </th>
              <td className="border border-black p-1.5 text-center align-middle">
                {isEditor ? (
                  <>
                    <span className="hidden print-data-text text-center">{record.consultDate}</span>
                    <input
                      type="text"
                      value={record.consultDate}
                      onChange={(e) => onUpdateField && onUpdateField('consultDate', e.target.value)}
                      placeholder=""
                      className="print-hidden-input w-full text-center text-black outline-none focus:bg-amber-50/40"
                    />
                  </>
                ) : (
                  <span className="text-center">{record.consultDate}</span>
                )}
              </td>
            </tr>

            {/* ROW 2: 활동지원사 / 생년월일 / 상담방법 (Height: 46px) */}
            <tr style={{ height: '46px' }}>
              <th className="border border-black p-2 text-center font-bold text-black bg-white">
                활동지원사
              </th>
              <td className="border border-black p-1.5 text-center align-middle">
                {isEditor ? (
                  <>
                    <span className="hidden print-data-text text-center font-bold">{maskText(record.assistantName, true)}</span>
                    <input
                      type="text"
                      value={record.assistantName}
                      onChange={(e) => onUpdateField && onUpdateField('assistantName', e.target.value)}
                      placeholder=""
                      className="print-hidden-input w-full text-center text-black outline-none focus:bg-amber-50/40"
                    />
                  </>
                ) : (
                  <span className="text-center font-bold">{maskText(record.assistantName, true)}</span>
                )}
              </td>
              <th className="border border-black p-2 text-center font-bold text-black bg-white">
                생년월일
              </th>
              <td className="border border-black p-1.5 text-center align-middle">
                {isEditor ? (
                  <>
                    <span className="hidden print-data-text text-center">{maskText(record.assistantBirthDate)}</span>
                    <input
                      type="text"
                      value={record.assistantBirthDate}
                      onChange={(e) => onUpdateField && onUpdateField('assistantBirthDate', e.target.value)}
                      placeholder=""
                      className="print-hidden-input w-full text-center text-black outline-none focus:bg-amber-50/40"
                    />
                  </>
                ) : (
                  <span className="text-center">{maskText(record.assistantBirthDate)}</span>
                )}
              </td>
              <th className="border border-black p-2 text-center font-bold text-black bg-white">
                상담방법
              </th>
              <td className="border border-black p-1.5 text-center align-middle">
                <div className="flex items-center justify-center gap-3 text-[13px]">
                  <span 
                    onClick={() => isEditor && onUpdateField && onUpdateField('consultMethod', '유선')}
                    className={`select-none ${isEditor ? 'cursor-pointer' : ''}`}
                  >
                    {record.consultMethod === '유선' ? '■' : '□'}유선
                  </span>
                  <span 
                    onClick={() => isEditor && onUpdateField && onUpdateField('consultMethod', '내방')}
                    className={`select-none ${isEditor ? 'cursor-pointer' : ''}`}
                  >
                    {record.consultMethod === '내방' ? '■' : '□'}내방
                  </span>
                </div>
              </td>
            </tr>

            {/* ROW 3: 상담내용 (Natural Height: 135px) */}
            <tr style={{ height: '135px' }}>
              <th className="border border-black p-3 text-center font-bold text-black bg-white align-middle">
                상담내용
              </th>
              <td colSpan={5} className="border border-black p-3 text-left align-top">
                {isEditor ? (
                  <>
                    <div className="hidden print-data-text">{record.consultContent}</div>
                    <AutoResizeTextarea
                      rows={4}
                      value={record.consultContent}
                      onChange={(e) => onUpdateField && onUpdateField('consultContent', e.target.value)}
                      placeholder=""
                      className="print-hidden-input w-full h-full text-[13px] leading-relaxed text-black outline-none focus:bg-amber-50/30"
                    />
                  </>
                ) : (
                  <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{record.consultContent}</div>
                )}
              </td>
            </tr>

            {/* ROW 4: 상담자 의견 (Natural Height: 100px) */}
            <tr style={{ height: '100px' }}>
              <th className="border border-black p-3 text-center font-bold text-black bg-white align-middle">
                상담자 의견
              </th>
              <td colSpan={5} className="border border-black p-3 text-left align-top">
                {isEditor ? (
                  <>
                    <div className="hidden print-data-text">{record.counselorOpinion}</div>
                    <AutoResizeTextarea
                      rows={3}
                      value={record.counselorOpinion}
                      onChange={(e) => onUpdateField && onUpdateField('counselorOpinion', e.target.value)}
                      placeholder=""
                      className="print-hidden-input w-full h-full text-[13px] leading-relaxed text-black outline-none focus:bg-amber-50/30"
                    />
                  </>
                ) : (
                  <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{record.counselorOpinion}</div>
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ===================================================================== */}
        {/* TABLE SECTION 2: 매칭과정 (1~5회차)                                    */}
        {/* 매칭과정 is strictly 14%, aligning 100% with the vertical line above! */}
        {/* ===================================================================== */}
        <table className="hwp-record-table w-full border-collapse border-x-[1.5px] border-b-[1.5px] border-t-0 border-black text-[13px] leading-snug">
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '44%' }} />
          </colgroup>
          <tbody>
            {/* SECTION HEADER ROW */}
            <tr style={{ height: '36px' }}>
              <th 
                rowSpan={6} 
                className="border border-black p-2 text-center font-bold text-black bg-white align-middle"
              >
                매칭과정
              </th>
              <th className="border border-black p-1 text-center font-bold text-black bg-white text-xs whitespace-nowrap">
                회차
              </th>
              <th className="border border-black p-1 text-center font-bold text-black bg-white text-xs whitespace-nowrap">
                상담일
              </th>
              <th className="border border-black p-1 text-center font-bold text-black bg-white text-xs whitespace-nowrap">
                결과
              </th>
              <th className="border border-black p-1 text-center font-bold text-black bg-white text-xs whitespace-nowrap">
                활동지원사
              </th>
              <th className="border border-black p-1 text-center font-bold text-black bg-white text-xs">
                내 용
              </th>
            </tr>

            {/* 1 ~ 5 ROUND ROWS (Each row height: 60px) */}
            {record.steps.map((step, idx) => (
              <tr key={idx} style={{ height: '60px' }}>
                {/* 회차 */}
                <td className="border border-black p-1 text-center font-bold text-black text-xs align-middle">
                  {step.round}
                </td>

                {/* 상담일 */}
                <td className="border border-black p-1 text-center align-middle">
                  {isEditor ? (
                    <>
                      <span className="hidden print-data-text text-center text-xs font-medium">{step.consultDate}</span>
                      <input
                        type="text"
                        value={step.consultDate}
                        onChange={(e) => onStepChange && onStepChange(idx, 'consultDate', e.target.value)}
                        placeholder=""
                        className="print-hidden-input w-full text-center text-xs font-medium text-black outline-none focus:bg-amber-50/40"
                      />
                    </>
                  ) : (
                    <span className="text-center text-xs font-medium">{step.consultDate}</span>
                  )}
                </td>

                {/* 결과 */}
                <td className="border border-black p-1 text-center select-none align-middle">
                  {step.result || step.content || step.consultDate ? (
                    <div className="print-result-box flex flex-col items-center justify-center text-[11px] leading-tight space-y-0.5">
                      <span 
                        onClick={() => {
                          if (isEditor && onStepChange) {
                            onStepChange(idx, 'result', step.result === '매칭' ? '' : '매칭');
                          }
                        }}
                        className={`whitespace-nowrap ${isEditor ? 'cursor-pointer hover:font-bold' : ''}`}
                      >
                        {step.result === '매칭' ? '■' : '□'} 매칭
                      </span>
                      <span 
                        onClick={() => {
                          if (isEditor && onStepChange) {
                            onStepChange(idx, 'result', step.result === '비매칭' ? '' : '비매칭');
                          }
                        }}
                        className={`whitespace-nowrap ${isEditor ? 'cursor-pointer hover:font-bold' : ''}`}
                      >
                        {step.result === '비매칭' ? '■' : '□'} 비매칭
                      </span>
                    </div>
                  ) : (
                    <span className="text-transparent">.</span>
                  )}
                </td>

                {/* 활동지원사 */}
                <td className="border border-black p-1 text-center align-middle">
                  {isEditor ? (
                    <>
                      <span className="hidden print-data-text text-center text-xs font-bold">{maskText(step.assistantName, true)}</span>
                      <input
                        type="text"
                        value={step.assistantName}
                        onChange={(e) => onStepChange && onStepChange(idx, 'assistantName', e.target.value)}
                        placeholder=""
                        className="print-hidden-input w-full text-center text-xs font-medium text-black outline-none focus:bg-amber-50/40"
                      />
                    </>
                  ) : (
                    <span className="text-center text-xs font-bold">{maskText(step.assistantName, true)}</span>
                  )}
                </td>

                {/* 내 용 */}
                <td className="border border-black p-2 text-left align-middle">
                  {isEditor ? (
                    <>
                      <div className="hidden print-data-text text-xs leading-relaxed">{step.content}</div>
                      <AutoResizeTextarea
                        rows={2}
                        value={step.content}
                        onChange={(e) => onStepChange && onStepChange(idx, 'content', e.target.value)}
                        placeholder=""
                        className="print-hidden-input w-full h-full text-xs text-black outline-none focus:bg-amber-50/40 leading-relaxed"
                      />
                    </>
                  ) : (
                    <div className="text-xs leading-relaxed whitespace-pre-wrap">{step.content}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ===================================================================== */}
        {/* TABLE SECTION 3: 매칭결과                                             */}
        {/* Left column is strictly 14%, aligning 100% with the sections above!   */}
        {/* Notice: 타 기관 연계의 경우 인수인계일 및 서비스개시일은 미작성(빈칸)      */}
        {/* ===================================================================== */}
        <table className="hwp-record-table w-full border-collapse border-x-[1.5px] border-b-[1.5px] border-t-0 border-black text-[13px] leading-snug">
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '34%' }} />
          </colgroup>
          <tbody>
            {/* 매칭결과 헤더 */}
            <tr style={{ height: '36px' }}>
              <th 
                rowSpan={3} 
                className="border border-black p-2 text-center font-bold text-black bg-white align-middle"
              >
                매칭결과
              </th>
              <th colSpan={3} className="border border-black p-1 text-center font-bold text-black bg-white text-xs">
                <div className="flex items-center justify-center gap-2">
                  <span>매칭 완료</span>
                  {isEditor && onSetOtherAgencyTransfer && (
                    <button
                      type="button"
                      onClick={onSetOtherAgencyTransfer}
                      className="print:hidden px-1.5 py-0.5 text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded cursor-pointer transition-colors"
                      title="타 기관 연계 시 인수인계일 및 서비스개시일은 작성하지 않습니다."
                    >
                      타기관 연계 설정
                    </button>
                  )}
                </div>
              </th>
              <th className="border border-black p-1 text-center font-bold text-black bg-white text-xs">
                연계 불가
              </th>
            </tr>

            {/* 매칭결과 하위 헤더 */}
            <tr style={{ height: '36px' }}>
              <th className="border border-black p-1 text-center font-bold text-black bg-white text-xs">
                활동지원사
              </th>
              <th className="border border-black p-1 text-center font-bold text-black bg-white text-xs">
                인수·인계일
              </th>
              <th className="border border-black p-1 text-center font-bold text-black bg-white text-xs">
                서비스 개시일
              </th>
              <th className="border border-black p-1 text-center font-bold text-black bg-white text-xs">
                사유
              </th>
            </tr>

            {/* 매칭결과 데이터 입력 행 (Height: 65px) */}
            <tr style={{ height: '65px' }}>
              {/* 활동지원사 */}
              <td className="border border-black p-1.5 text-center align-middle">
                {isEditor ? (
                  <>
                    <span className="hidden print-data-text text-center font-bold text-xs">{maskText(record.resultAssistantName, true)}</span>
                    <input
                      type="text"
                      value={record.resultAssistantName}
                      onChange={(e) => onUpdateField && onUpdateField('resultAssistantName', e.target.value)}
                      placeholder=""
                      className="print-hidden-input w-full text-center text-xs font-bold text-black outline-none focus:bg-amber-50/40"
                    />
                  </>
                ) : (
                  <span className="text-center font-bold text-xs">{maskText(record.resultAssistantName, true)}</span>
                )}
              </td>

              {/* 인수·인계일 (타 기관 연계 시 작성 제외 - 빈칸) */}
              <td className="border border-black p-1.5 text-center align-middle">
                {isEditor ? (
                  <>
                    <span className="hidden print-data-text text-center text-xs font-medium">
                      {isOtherAgency ? '' : record.handoverDate}
                    </span>
                    <input
                      type="text"
                      value={isOtherAgency ? '' : record.handoverDate}
                      onChange={(e) => onUpdateField && onUpdateField('handoverDate', e.target.value)}
                      placeholder={isOtherAgency ? '' : ''}
                      disabled={isOtherAgency}
                      className="print-hidden-input w-full text-center text-xs font-medium text-black outline-none focus:bg-amber-50/40 disabled:bg-transparent"
                    />
                  </>
                ) : (
                  <span className="text-center text-xs font-medium">{isOtherAgency ? '' : record.handoverDate}</span>
                )}
              </td>

              {/* 서비스 개시일 (타 기관 연계 시 작성 제외 - 빈칸) */}
              <td className="border border-black p-1.5 text-center align-middle">
                {isEditor ? (
                  <>
                    <span className="hidden print-data-text text-center text-xs font-medium">
                      {isOtherAgency ? '' : record.serviceStartDate}
                    </span>
                    <input
                      type="text"
                      value={isOtherAgency ? '' : record.serviceStartDate}
                      onChange={(e) => onUpdateField && onUpdateField('serviceStartDate', e.target.value)}
                      placeholder={isOtherAgency ? '' : ''}
                      disabled={isOtherAgency}
                      className="print-hidden-input w-full text-center text-xs font-medium text-black outline-none focus:bg-amber-50/40 disabled:bg-transparent"
                    />
                  </>
                ) : (
                  <span className="text-center text-xs font-medium">{isOtherAgency ? '' : record.serviceStartDate}</span>
                )}
              </td>

              {/* 사유 */}
              <td className="border border-black p-2 text-left align-middle">
                {isEditor ? (
                  <>
                    <div className="hidden print-data-text text-xs leading-relaxed">{record.failReason}</div>
                    <AutoResizeTextarea
                      rows={2}
                      value={record.failReason}
                      onChange={(e) => onUpdateField && onUpdateField('failReason', e.target.value)}
                      placeholder=""
                      className="print-hidden-input w-full text-xs text-black outline-none focus:bg-amber-50/40 leading-relaxed"
                    />
                  </>
                ) : (
                  <div className="text-xs leading-relaxed whitespace-pre-wrap">{record.failReason}</div>
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {/* BOTTOM SIGNATURE & DATE SECTION (Placed right below table) */}
        <div className="mt-8 flex items-center justify-between text-[13px] font-medium text-black px-1">
          <div className="flex items-center gap-1">
            <span>작성일자 :</span>
            {isEditor ? (
              <>
                <span className="hidden print-data-text font-medium">{record.writeDate}</span>
                <input
                  type="text"
                  value={record.writeDate}
                  onChange={(e) => onUpdateField && onUpdateField('writeDate', e.target.value)}
                  placeholder="2026 .   .   ."
                  className="print-hidden-input w-36 font-medium text-black outline-none focus:bg-amber-50/40"
                />
              </>
            ) : (
              <span className="font-medium">{record.writeDate}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span>전담인력(상담자) :</span>
            {isEditor ? (
              <>
                <span className="hidden print-data-text font-bold">{record.counselorName}</span>
                <input
                  type="text"
                  value={record.counselorName}
                  onChange={(e) => onUpdateField && onUpdateField('counselorName', e.target.value)}
                  placeholder=""
                  className="print-hidden-input w-24 text-center font-bold text-black outline-none focus:bg-amber-50/40"
                />
              </>
            ) : (
              <span className="font-bold">{record.counselorName}</span>
            )}
            <span className="text-black font-normal">{record.counselorSignature || '(서명)'}</span>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function MatchingRecordView({
  candidates,
  staffProfile,
  initialCandidate,
  onBackToList,
  privacyMode = false
}: MatchingRecordViewProps) {
  // Sub-tabs: 'editor' vs 'savedList'
  const [subTab, setSubTab] = useState<'editor' | 'savedList'>('editor');

  // Saved records from Firestore
  const [savedRecords, setSavedRecords] = useState<MatchingRecord[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);

  // Search candidate query & state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Current working record state
  const [record, setRecord] = useState<MatchingRecord>(() => {
    return {
      id: `record_${Date.now()}`,
      userName: '',
      userBirthDate: '',
      consultDate: '',
      assistantName: '',
      assistantBirthDate: '',
      consultMethod: '유선',
      consultContent: '',
      counselorOpinion: '',
      steps: createDefaultSteps(),
      resultType: '',
      resultAssistantName: '',
      handoverDate: '',
      serviceStartDate: '',
      failReason: '',
      writeDate: '2026 .   .   .',
      counselorName: staffProfile.name || '',
      counselorSignature: '(서명)'
    };
  });

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [deleteTargetRecord, setDeleteTargetRecord] = useState<MatchingRecord | null>(null);

  // Search and filter for saved list tab
  const [savedSearchQuery, setSavedSearchQuery] = useState('');
  const [savedStatusFilter, setSavedStatusFilter] = useState<'전체' | '매칭완료' | '연계불가' | '미결'>('전체');

  // Local Privacy Masking Mode
  const [localPrivacy, setLocalPrivacy] = useState(privacyMode);

  // HWP Page Margins Guide Overlay (Red dotted guideline like Hancom HWP preview)
  const [showMarginGuide, setShowMarginGuide] = useState(false);

  // Batch Print Modal and Execution State
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);
  const [isBatchPrintModalOpen, setIsBatchPrintModalOpen] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);

  // Merge candidates with the same name, excluding '삭제' candidates and duplicate contents
  const mergedCandidates = useMemo(() => {
    // 1. Filter out deleted candidates
    const activeCandidates = candidates.filter(c => c.category !== '삭제');

    // 2. Group by normalized name (trimmed)
    const groups: { [key: string]: Candidate[] } = {};
    activeCandidates.forEach(c => {
      const nameKey = (c.name || '').trim();
      if (!nameKey) return;
      if (!groups[nameKey]) {
        groups[nameKey] = [];
      }
      groups[nameKey].push(c);
    });

    // 3. Merge each group
    return Object.keys(groups).map(nameKey => {
      const groupList = groups[nameKey];
      // Sort so the one with the latest registrationDate is first (base of simple fields)
      const sortedGroup = [...groupList].sort((a, b) => {
        const regA = a.registrationDate || '';
        const regB = b.registrationDate || '';
        return regB.localeCompare(regA); // descending
      });

      const base = sortedGroup[0];

      // Merge consultation logs without duplicates
      const logKeySet = new Set<string>();
      const combinedLogs: ConsultationLog[] = [];
      groupList.forEach(cand => {
        if (cand.consultationLogs) {
          cand.consultationLogs.forEach(log => {
            const key = `${log.date}_${(log.content || '').trim()}`;
            if (!logKeySet.has(key)) {
              logKeySet.add(key);
              combinedLogs.push(log);
            }
          });
        }
      });
      // Sort combined logs chronologically (oldest to latest)
      combinedLogs.sort((a, b) => a.date.localeCompare(b.date));

      // Merge serviceContent and specialNotes cleanly, removing duplicate text fragments
      const mergeTextAndDeduplicate = (texts: string[], delimiter = '\n'): string => {
        const uniqueItems = new Set<string>();
        texts.forEach(text => {
          if (!text) return;
          // Split by common separators/newlines
          const parts = text.split(/[\n,;/]+/).map(p => p.trim()).filter(Boolean);
          parts.forEach(part => {
            // Keep unique items, avoid redundancy if something contains or is contained in another item
            const alreadyExists = Array.from(uniqueItems).some(item => item.includes(part) || part.includes(item));
            if (!alreadyExists) {
              uniqueItems.add(part);
            }
          });
        });
        return Array.from(uniqueItems).join(delimiter);
      };

      const combinedServiceContent = mergeTextAndDeduplicate(groupList.map(c => c.serviceContent || ''), '\n');
      const combinedSpecialNotes = mergeTextAndDeduplicate(groupList.map(c => c.specialNotes || ''), ' / ');
      const combinedRemarks = mergeTextAndDeduplicate(groupList.map(c => c.remarks || ''), ' / ');

      // Find first non-empty value for core details
      const findFirstNonEmpty = <K extends keyof Candidate>(field: K): Candidate[K] => {
        for (const cand of sortedGroup) {
          if (cand[field]) return cand[field];
        }
        return base[field];
      };

      return {
        ...base,
        birthDate: findFirstNonEmpty('birthDate'),
        gender: findFirstNonEmpty('gender'),
        disabilityType: findFirstNonEmpty('disabilityType'),
        disabilityGrade: findFirstNonEmpty('disabilityGrade'),
        phone: findFirstNonEmpty('phone'),
        addressCity: findFirstNonEmpty('addressCity'),
        addressDistrict: findFirstNonEmpty('addressDistrict'),
        addressDong: findFirstNonEmpty('addressDong'),
        addressDetail: findFirstNonEmpty('addressDetail'),
        fundingNational: findFirstNonEmpty('fundingNational'),
        fundingProvincial: findFirstNonEmpty('fundingProvincial'),
        fundingCity: findFirstNonEmpty('fundingCity'),
        registrar: findFirstNonEmpty('registrar'),
        registrationDate: findFirstNonEmpty('registrationDate'),
        serviceContent: combinedServiceContent,
        specialNotes: combinedSpecialNotes,
        remarks: combinedRemarks,
        consultationLogs: combinedLogs
      };
    });
  }, [candidates]);

  // Subscribe to real-time Matching Records from Firestore with offline fallback
  useEffect(() => {
    // Check localStorage first for instant display
    const local = localStorage.getItem('suwon_matching_records');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSavedRecords(parsed);
          setIsLoadingSaved(false);
        }
      } catch (e) {
        // ignore
      }
    }

    const unsubscribe = subscribeToMatchingRecords(
      (list) => {
        setSavedRecords(list);
        try {
          localStorage.setItem('suwon_matching_records', JSON.stringify(list));
        } catch (e) {
          // ignore
        }
        setIsLoadingSaved(false);
      },
      (err) => {
        console.warn('Matching records subscription offline fallback notice:', err);
        setIsLoadingSaved(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // When initialCandidate prop is supplied, populate record
  useEffect(() => {
    if (initialCandidate) {
      const merged = mergedCandidates.find(c => c.name.trim() === initialCandidate.name.trim());
      applyCandidateToRecord(merged || initialCandidate);
    }
  }, [initialCandidate, mergedCandidates]);

  // Clean up batch printing mode when print dialog closes
  useEffect(() => {
    const handleAfterPrint = () => {
      setIsBatchPrinting(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const formatShortDate = (rawDate: string): string => {
    if (!rawDate) return '';
    const match = rawDate.match(/(\d{4})[.\-/]\s*0?(\d{1,2})[.\-/]\s*0?(\d{1,2})/);
    if (match) {
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      return `${month}.${day}`;
    }
    const simpleMatch = rawDate.match(/0?(\d{1,2})[.\-/]0?(\d{1,2})/);
    if (simpleMatch) {
      return `${parseInt(simpleMatch[1], 10)}.${parseInt(simpleMatch[2], 10)}`;
    }
    return rawDate.trim();
  };

  const estimateHandoverDate = (startDateStr: string): string => {
    if (!startDateStr) return '';
    const match = startDateStr.match(/(\d{1,2})\.(\d{1,2})/);
    if (match) {
      const m = parseInt(match[1], 10);
      const d = parseInt(match[2], 10);
      if (d > 4) {
        return `${m}.${d - 4}`;
      } else {
        const prevMonth = m > 1 ? m - 1 : 12;
        const prevDay = 30 + d - 4;
        return `${prevMonth}.${prevDay}`;
      }
    }
    return '';
  };

  /**
   * Applies candidate details & consultation logs to matching record form.
   * STRICT USER REQUIREMENTS IMPLEMENTED:
   * 1. 최신날짜의 내용이 재대기, 대기요청, 대기, 대기 희망 등과 같이 다시 대기를 하고 있는 상황이라면
   *    이전 상담에 연계 글이 있더라도 매칭완료는 빈칸으로 남김.
   * 2. 타 기관 연계의 경우에는 인수인계일과 서비스개시일은 작성하지 않음 (빈칸 유지).
   */
  const applyCandidateToRecord = (cand: Candidate) => {
    const existing = savedRecords.find(
      r => (r.candidateId && r.candidateId === cand.id) || (r.userName && r.userName.trim() === cand.name.trim())
    );

    if (existing) {
      setRecord(existing);
      setSearchQuery(cand.name);
      setIsSearchOpen(false);
      setToastMessage(`'${cand.name}' 님의 기존 저장된 매칭과정 기록지를 불러왔습니다.`);
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    let formattedBirth = cand.birthDate || '';
    if (formattedBirth.length === 6 && /^\d+$/.test(formattedBirth)) {
      const yy = parseInt(formattedBirth.substring(0, 2), 10);
      const mm = formattedBirth.substring(2, 4);
      const dd = formattedBirth.substring(4, 6);
      const yyyy = yy >= 30 ? `19${yy}` : `20${yy}`;
      formattedBirth = `${yyyy}.${mm}.${dd}`;
    }

    let formattedRegDate = cand.registrationDate || '';
    if (formattedRegDate) {
      formattedRegDate = formattedRegDate.replace(/[-/]/g, '.');
      formattedRegDate = formattedRegDate.replace(/\.+$/, '.');
      if (!formattedRegDate.endsWith('.')) {
        formattedRegDate += '.';
      }
    }

    // Sort consultation logs chronologically (oldest to latest)
    const logs = [...(cand.consultationLogs || [])];
    logs.sort((a, b) => a.date.localeCompare(b.date));

    // Inspect the MOST RECENT (latest date) log
    const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;
    const latestContent = latestLog ? (latestLog.content || '').trim() : '';

    // Check if the latest log indicates re-waiting / wait status
    // User requirement: "가장 최신날짜의 내용이 재대기, 대기요청, 대기, 대기 희망 등과 같이 다시 대기를 하고 있는 상황이라면 매칭완료는 빈칸으로 남겨줘."
    const isCurrentlyReWaiting = (() => {
      if (!latestContent) return false;
      
      // Explicit re-wait keywords
      if (/(재대기|대기요청|대기\s*요청|대기희망|대기\s*희망|재접수|다시\s*대기|대기원함|대기\s*원함|대기신청|대기\s*등록)/.test(latestContent)) {
        return true;
      }

      // If content mentions "대기" without a subsequent service start or successful link
      if (latestContent.includes('대기')) {
        const hasServiceStart = /(서비스\s*시작|서비스시작)/.test(latestContent);
        const hasNewConnection = /(연계완료|[가-힣]{2,4}\s*[Tt티]?\s*연계)/.test(latestContent) && 
          !/(연계불가|연계\s*취소|연계포기)/.test(latestContent);
        if (!hasServiceStart && !hasNewConnection) {
          return true;
        }
      }
      return false;
    })();

    const defaultSteps = createDefaultSteps();
    let matchedAssistantForFinal = '';
    let matchedDateForFinal = '';
    let hasMatched = false;
    let hasNonMatch = false;

    logs.slice(0, 5).forEach((log, idx) => {
      const roundNum = idx + 1;
      const shortDate = formatShortDate(log.date);
      const content = log.content || '';

      const isExplicitMatch = /(연계완료|타\s*기관\s*연계|타기관연계|[가-힣]{2,4}\s*[Tt티]?\s*연계|연계)/.test(content) &&
        !/(연계불가|연계실패|연계안됨|연계\s*취소|연계를\s*포기|연계포기)/.test(content);

      let stepResult: '매칭' | '비매칭' | '' = '';
      let stepAssistant = '';

      if (isExplicitMatch) {
        stepResult = '매칭';
        hasMatched = true;

        const nameMatch = content.match(/([가-힣]{2,4})\s*(?:[Tt티]|선생님)?\s*연계/);
        if (nameMatch && nameMatch[1]) {
          const candidateNameGroup = nameMatch[1];
          if (!['기관', '기관연', '이용', '이용자', '보호', '보호자', '센터'].includes(candidateNameGroup)) {
            stepAssistant = candidateNameGroup;
          }
        }
        
        if (!stepAssistant) {
          const generalTeacherMatch = content.match(/([가-힣]{2,4})\s*(?:[Tt티]|선생님)/);
          if (generalTeacherMatch && generalTeacherMatch[1]) {
            stepAssistant = generalTeacherMatch[1];
          }
        }

        if (/(타\s*기관\s*연계|타기관연계)/.test(content)) {
          stepAssistant = '타기관 연계';
        }

        matchedAssistantForFinal = stepAssistant;
        matchedDateForFinal = shortDate;
      } else if (content.trim()) {
        stepResult = '비매칭';
        hasNonMatch = true;
        stepAssistant = '';
      }

      defaultSteps[idx] = {
        round: roundNum,
        consultDate: shortDate,
        result: stepResult,
        assistantName: stepAssistant,
        content: content
      };
    });

    let defaultConsultContent = '';
    if (cand.specialNotes) {
      defaultConsultContent += cand.specialNotes;
    }
    if (cand.serviceContent) {
      if (defaultConsultContent) defaultConsultContent += '\n';
      defaultConsultContent += cand.serviceContent;
    }

    // Check if other agency connection
    const isOtherAgencyTransfer = 
      /(타\s*기관\s*연계|타기관연계|타기관)/.test(latestContent) ||
      /(타\s*기관\s*연계|타기관연계|타기관)/.test(matchedAssistantForFinal);

    let finalResultType: '매칭완료' | '연계불가' | '' = '';
    let finalAssistantName = '';
    let finalHandoverDate = '';
    let finalServiceStartDate = '';
    let finalFailReason = '';

    if (isCurrentlyReWaiting) {
      // Latest log is re-waiting -> leave matching result blank!
      finalResultType = '';
      finalAssistantName = '';
      finalHandoverDate = '';
      finalServiceStartDate = '';
      finalFailReason = '';
    } else if (hasMatched) {
      finalResultType = '매칭완료';
      finalAssistantName = isOtherAgencyTransfer ? '타기관 연계' : matchedAssistantForFinal;
      
      if (isOtherAgencyTransfer) {
        // User requirement: "타 기관 연계의 경우에는 인수인계일과 서비스개시일은 작성하지 않아도 돼."
        finalHandoverDate = '';
        finalServiceStartDate = '';
      } else {
        finalServiceStartDate = matchedDateForFinal;
        finalHandoverDate = estimateHandoverDate(matchedDateForFinal);
      }
      finalFailReason = '';
    } else if (hasNonMatch || cand.category === '삭제' || cand.category === '보류') {
      finalResultType = '연계불가';
      finalAssistantName = '';
      finalHandoverDate = '';
      finalServiceStartDate = '';
      finalFailReason = '매칭가능한 활동지원사 없음';
    }

    setRecord({
      id: `record_${cand.id}_${Date.now()}`,
      candidateId: cand.id,
      userName: cand.name,
      userBirthDate: formattedBirth,
      consultDate: formattedRegDate,
      assistantName: isCurrentlyReWaiting ? '' : (finalAssistantName || ''),
      assistantBirthDate: '',
      consultMethod: '유선',
      consultContent: defaultConsultContent,
      counselorOpinion: '이용자 특성을 고려하고 제공인력 연계 전 이를 충분히 고지하여, 오랫동안 서비스를 계속할 수 있는 제공인력을 연계해야 할 것으로 판단됨.',
      steps: defaultSteps,
      resultType: finalResultType,
      resultAssistantName: finalAssistantName,
      handoverDate: finalHandoverDate,
      serviceStartDate: finalServiceStartDate,
      failReason: finalFailReason,
      writeDate: '2026 .   .   .',
      counselorName: staffProfile.name || cand.registrar || '',
      counselorSignature: '(서명)'
    });

    setSearchQuery(cand.name);
    setIsSearchOpen(false);

    if (isCurrentlyReWaiting) {
      setToastMessage(`'${cand.name}' 님은 최근 재대기 요청 상태이므로 매칭결과를 빈칸으로 보존했습니다.`);
    } else {
      setToastMessage(`'${cand.name}' 님의 추가상담 내역을 매칭과정 양식에 자동 연계했습니다.`);
    }
    setTimeout(() => setToastMessage(null), 3500);
  };

  const candidateResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    return mergedCandidates.filter(c => 
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.disabilityType && c.disabilityType.toLowerCase().includes(q))
    ).slice(0, 15);
  }, [mergedCandidates, searchQuery]);

  const handleLoadSample = () => {
    setRecord({
      ...SAMPLE_RECORD,
      id: `sample_${Date.now()}`
    });
    setSearchQuery('홍길동');
    setToastMessage('한글문서 예시(홍길동) 데이터를 불러왔습니다.');
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleResetForm = () => {
    setRecord({
      id: `record_${Date.now()}`,
      userName: '',
      userBirthDate: '',
      consultDate: '',
      assistantName: '',
      assistantBirthDate: '',
      consultMethod: '유선',
      consultContent: '',
      counselorOpinion: '',
      steps: createDefaultSteps(),
      resultType: '',
      resultAssistantName: '',
      handoverDate: '',
      serviceStartDate: '',
      failReason: '',
      writeDate: '2026 .   .   .',
      counselorName: staffProfile.name || '',
      counselorSignature: '(서명)'
    });
    setSearchQuery('');
    setToastMessage('새 양식으로 초기화되었습니다.');
    setTimeout(() => setToastMessage(null), 2000);
  };

  const handleSave = async () => {
    if (!record.userName.trim()) {
      setToastMessage('이용자 이름을 입력해 주세요.');
      setTimeout(() => setToastMessage(null), 2500);
      return;
    }
    setSaveStatus('saving');
    try {
      await saveMatchingRecordToFirestore(record, staffProfile.email);
      setSaveStatus('saved');
      setToastMessage(`'${record.userName}' 님의 매칭과정 기록지가 저장되어 목록으로 이동합니다.`);
      
      setTimeout(() => {
        setSaveStatus('idle');
        setSubTab('savedList');
        setToastMessage(null);
      }, 900);
    } catch (e) {
      console.error('Error saving matching record:', e);
      setSaveStatus('error');
      setToastMessage('저장 중 오류가 발생했습니다. 다시 시도해 주세요.');
      setTimeout(() => {
        setSaveStatus('idle');
        setToastMessage(null);
      }, 3000);
    }
  };

  const handlePrintItem = (item: MatchingRecord) => {
    setIsBatchPrinting(false);
    setRecord(item);
    setSearchQuery(item.userName);
    setSubTab('editor');
    setTimeout(() => {
      window.print();
    }, 250);
  };

  const handleStepChange = (index: number, field: keyof MatchingProcessStep, value: any) => {
    const newSteps = [...record.steps];
    newSteps[index] = {
      ...newSteps[index],
      [field]: value
    };
    setRecord({
      ...record,
      steps: newSteps
    });
  };

  const filteredSavedRecords = useMemo(() => {
    return savedRecords.filter(r => {
      const q = savedSearchQuery.trim().toLowerCase();
      const matchesQuery = !q || 
        r.userName.toLowerCase().includes(q) ||
        (r.assistantName && r.assistantName.toLowerCase().includes(q)) ||
        (r.resultAssistantName && r.resultAssistantName.toLowerCase().includes(q)) ||
        (r.counselorName && r.counselorName.toLowerCase().includes(q));

      const matchesStatus = savedStatusFilter === '전체' ||
        (savedStatusFilter === '매칭완료' && r.resultType === '매칭완료') ||
        (savedStatusFilter === '연계불가' && r.resultType === '연계불가') ||
        (savedStatusFilter === '미결' && !r.resultType);

      return matchesQuery && matchesStatus;
    });
  }, [savedRecords, savedSearchQuery, savedStatusFilter]);

  const isExistingSaved = savedRecords.some(r => r.id === record.id);

  // Helper for masking personal data if privacy mode is active
  const maskText = (text: string, isName = false) => {
    if (!localPrivacy || !text) return text;
    if (isName) {
      if (text.length <= 2) return text.substring(0, 1) + '*';
      return text.substring(0, 1) + '*'.repeat(text.length - 2) + text.substring(text.length - 1);
    }
    return text.length >= 4 ? text.substring(0, 4) + '**' : text;
  };

  // Batch Print: Open modal with all filtered records selected
  const handleOpenBatchPrintModal = () => {
    if (filteredSavedRecords.length === 0) {
      setToastMessage('인쇄할 저장된 기록지가 없습니다.');
      setTimeout(() => setToastMessage(null), 2500);
      return;
    }
    setBatchSelectedIds(filteredSavedRecords.map(r => r.id));
    setIsBatchPrintModalOpen(true);
  };

  // Toggle selection for a single record in batch modal
  const handleToggleBatchSelect = (id: string) => {
    setBatchSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Toggle all records selection in batch modal
  const handleToggleSelectAllBatch = () => {
    if (batchSelectedIds.length === filteredSavedRecords.length) {
      setBatchSelectedIds([]);
    } else {
      setBatchSelectedIds(filteredSavedRecords.map(r => r.id));
    }
  };

  // Records to be printed in batch
  const batchRecordsToPrint = useMemo(() => {
    if (batchSelectedIds.length === 0) return [];
    return filteredSavedRecords.filter(r => batchSelectedIds.includes(r.id));
  }, [filteredSavedRecords, batchSelectedIds]);

  // Execute Batch Print
  const handleStartBatchPrint = () => {
    if (batchRecordsToPrint.length === 0) {
      setToastMessage('인쇄할 기록지를 최소 1건 이상 선택해 주세요.');
      setTimeout(() => setToastMessage(null), 2500);
      return;
    }
    setIsBatchPrintModalOpen(false);
    setIsBatchPrinting(true);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  return (
    <div className="w-full">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 backdrop-blur text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* HWP EXACT PRINT SPEC CSS                                                  */}
      {/* ========================================================================= */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 20mm 20mm 15mm 20mm; /* Top: 20mm, Right: 20mm, Bottom: 15mm, Left: 20mm (Standard HWP margins) */
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            font-family: 'Malgun Gothic', '맑은 고딕', 'Batang', 'Gulim', sans-serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
          }
          /* Hide EVERYTHING outside */
          body * {
            visibility: hidden !important;
          }

          /* Conditional display: Batch Print vs Single Print */
          ${isBatchPrinting ? `
            #hwp-print-document {
              display: none !important;
            }
            #hwp-batch-print-document, #hwp-batch-print-document * {
              visibility: visible !important;
            }
            #hwp-batch-print-document {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
            }
            .hwp-batch-page {
              page-break-after: always !important;
              break-after: page !important;
              min-height: 100vh !important;
              box-sizing: border-box !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            .hwp-batch-page:last-child {
              page-break-after: avoid !important;
              break-after: avoid !important;
            }
          ` : `
            #hwp-batch-print-document {
              display: none !important;
            }
            #hwp-print-document, #hwp-print-document * {
              visibility: visible !important;
            }
            #hwp-print-document {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              box-shadow: none !important;
              border: none !important;
            }
          `}

          /* Hide screen-only margin guide guidelines on actual print */
          .hwp-margin-guide-box {
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .hwp-record-table {
            border-collapse: collapse !important;
            width: 100% !important;
            border: 1.5px solid #000000 !important;
          }
          .hwp-record-table th, .hwp-record-table td {
            border: 1px solid #000000 !important;
            color: #000000 !important;
            background-color: #ffffff !important;
            box-shadow: none !important;
          }
          .hwp-record-table th {
            font-weight: 700 !important;
            background-color: #ffffff !important;
          }
          .print-data-text {
            display: block !important;
            color: #000000 !important;
            font-size: 13px !important;
            line-height: 1.4 !important;
            word-break: break-all !important;
            white-space: pre-wrap !important;
          }
          .print-hidden-input {
            display: none !important;
          }
          .print-result-box {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            line-height: 1.3 !important;
          }
        }
      `}</style>

      {/* TOP NAVIGATION & SUB-TABS (Hidden on Print) */}
      <div className="max-w-[950px] mx-auto mb-6 px-4 print:hidden">
        
        {/* SUB-TAB SELECTOR & PRIVACY TOGGLE */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white rounded-2xl p-2 border border-slate-200/80 shadow-xs mb-4 gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setIsBatchPrinting(false);
                setSubTab('editor');
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                subTab === 'editor'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Edit3 className="w-4 h-4" />
              <span>기록지 작성 / 편집</span>
              {record.userName && (
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold ${
                  subTab === 'editor' ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {record.userName}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsBatchPrinting(false);
                setSubTab('savedList');
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                subTab === 'savedList'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <ListOrdered className="w-4 h-4" />
              <span>저장된 기록지 목록 (인쇄)</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                subTab === 'savedList' ? 'bg-white text-indigo-700' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              }`}>
                {savedRecords.length}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* PRIVACY SHIELD TOGGLE BUTTON */}
            <button
              type="button"
              onClick={() => setLocalPrivacy(!localPrivacy)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
                localPrivacy 
                  ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-xs' 
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
              title="화면 상의 성명, 생년월일 등 개인정보를 마스킹 처리하여 주변 노출을 방지합니다"
            >
              {localPrivacy ? <EyeOff className="w-3.5 h-3.5 text-amber-600" /> : <Eye className="w-3.5 h-3.5 text-slate-500" />}
              <span>{localPrivacy ? '개인정보 보호 적용중' : '개인정보 마스킹'}</span>
            </button>

            {onBackToList && (
              <button
                type="button"
                onClick={onBackToList}
                className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>대기명단</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* TOOLBAR FOR EDITOR SUB-TAB */}
        {subTab === 'editor' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4 space-y-4">
            
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black text-slate-900">매칭 과정 기록지 작성</h2>
                  </div>
                  <p className="text-xs text-slate-500">
                    작성 후 [기록지 저장]을 누르면 목록으로 이동하여 인쇄하실 수 있습니다.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">

                <button
                  type="button"
                  onClick={handleLoadSample}
                  className="px-3 py-2 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  title="보내주신 한글문서 미리보기(홍길동) 내용을 그대로 불러옵니다"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  예시 데이터 불러오기
                </button>

                <button
                  type="button"
                  onClick={handleResetForm}
                  className="px-3 py-2 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  새 양식
                </button>

                {/* DIRECT PRINT BUTTON */}
                <button
                  type="button"
                  onClick={() => {
                    setIsBatchPrinting(false);
                    setTimeout(() => window.print(), 100);
                  }}
                  className="px-3.5 py-2 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300/80 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  title="현재 작성 중인 기록지를 A4로 즉시 인쇄합니다."
                >
                  <Printer className="w-3.5 h-3.5 text-indigo-700" />
                  인쇄
                </button>

                {/* SAVE BUTTON */}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveStatus === 'saving'}
                  className={`px-5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer ${
                    saveStatus === 'saved'
                      ? 'bg-emerald-600 text-white'
                      : isExistingSaved
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20'
                  }`}
                >
                  {saveStatus === 'saving' ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      저장 중...
                    </>
                  ) : saveStatus === 'saved' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      저장 완료! 목록 이동
                    </>
                  ) : isExistingSaved ? (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      수정사항 저장 후 목록 이동
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      기록지 저장 후 목록 이동
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* USER AUTO-FILL SEARCH BAR */}
            <div className="pt-3 border-t border-slate-100 relative">
              <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-indigo-600" />
                <span>대기자 검색 및 추가상담 자동연계 (이름 입력 시 추가상담 내역이 회차별로 자동 입력됩니다)</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  onFocus={() => setIsSearchOpen(true)}
                  placeholder="대기자 성명을 검색하세요 (예: 홍길동, 김영희, 이철수...)"
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setIsSearchOpen(false);
                    }}
                    className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                  >
                    지우기
                  </button>
                )}
              </div>

              {/* Dropdown auto-complete candidate list */}
              {isSearchOpen && candidateResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-72 overflow-y-auto divide-y divide-slate-100">
                  <div className="p-2 bg-slate-50 text-[11px] font-bold text-slate-500 flex justify-between items-center">
                    <span>검색 결과 ({candidateResults.length}건)</span>
                    <span>클릭하여 서식에 바로 채우기</span>
                  </div>
                  {candidateResults.map(cand => (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => applyCandidateToRecord(cand)}
                      className="w-full px-4 py-2.5 text-left hover:bg-indigo-50/70 transition-colors flex items-center justify-between cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-slate-900 group-hover:text-indigo-600">
                          {cand.name}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {cand.birthDate || '생년월일 미기재'}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {cand.disabilityType} {cand.disabilityGrade}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          cand.category === '대기' ? 'bg-orange-100 text-orange-700' :
                          cand.category === '연계' ? 'bg-emerald-100 text-emerald-700' :
                          cand.category === '삭제' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {cand.category}
                        </span>
                        <span className="text-[11px] text-indigo-600 font-bold flex items-center">
                          불러오기 <ArrowRight className="w-3 h-3 ml-0.5" />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: [기록지 작성 / 편집] (HWP 실시간 에디터)                        */}
      {/* ========================================================================= */}
      {subTab === 'editor' && (
        <div className="flex justify-center px-2 sm:px-4 pb-16">
          <div className="relative">

            {/* SINGLE PRINT DOCUMENT WRAPPER */}
            <div 
              id="hwp-print-document" 
              className="w-full max-w-[794px] bg-white shadow-2xl relative text-black pt-[20mm] px-[20mm] pb-[15mm] print:shadow-none print:max-w-none print:pt-0 print:px-0 print:pb-0"
              style={{ minHeight: '1123px' }}
            >
              <HWPRecordSheet
                record={record}
                isEditor={true}
                onUpdateField={(field, value) => setRecord(prev => ({ ...prev, [field]: value }))}
                onStepChange={handleStepChange}
                maskText={maskText}
                showMarginGuide={showMarginGuide}
                onSetOtherAgencyTransfer={() => {
                  setRecord(prev => ({
                    ...prev,
                    resultType: '매칭완료',
                    resultAssistantName: '타기관 연계',
                    handoverDate: '',
                    serviceStartDate: '',
                    failReason: ''
                  }));
                  setToastMessage('타 기관 연계로 설정되었습니다. (인수인계일 및 서비스개시일 미작성)');
                  setTimeout(() => setToastMessage(null), 3000);
                }}
              />
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: [저장된 기록지 목록] (개별 인쇄 및 일괄 인쇄 기능)              */}
      {/* ========================================================================= */}
      {subTab === 'savedList' && (
        <div className="max-w-[1100px] mx-auto space-y-4">
          
          {/* SEARCH & STATUS FILTER & BATCH PRINT BUTTON */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  value={savedSearchQuery}
                  onChange={(e) => setSavedSearchQuery(e.target.value)}
                  placeholder="이용자 성명, 활동지원사, 상담자 검색..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {(['전체', '매칭완료', '연계불가', '미결'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setSavedStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      savedStatusFilter === status
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* BATCH PRINT BUTTON */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleOpenBatchPrintModal}
                disabled={filteredSavedRecords.length === 0}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-black rounded-xl transition-all shadow-md shadow-indigo-500/20 hover:shadow-lg flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                title="저장된 매칭과정기록지들을 A4 1장씩 일괄 인쇄합니다."
              >
                <Printer className="w-4 h-4" />
                <span>기록지 일괄 인쇄 ({filteredSavedRecords.length}건)</span>
              </button>
            </div>
          </div>

          {/* SAVED RECORDS TABLE */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {isLoadingSaved ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                저장된 기록지를 불러오는 중입니다...
              </div>
            ) : filteredSavedRecords.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <FileText className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">저장된 매칭과정 기록지가 없습니다.</p>
                <p className="text-xs text-slate-400">
                  [기록지 작성 / 편집] 탭에서 이용자 정보를 입력하고 [기록지 저장]을 누르면 이곳에서 바로 인쇄하실 수 있습니다.
                </p>
                <button
                  type="button"
                  onClick={() => setSubTab('editor')}
                  className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
                >
                  기록지 작성하러 가기
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse divide-y divide-slate-100">
                  <thead className="bg-slate-50 text-slate-600 font-bold">
                    <tr>
                      <th className="py-3 px-4">이용자 성명</th>
                      <th className="py-3 px-3">생년월일</th>
                      <th className="py-3 px-3">상담일자</th>
                      <th className="py-3 px-3 text-center">매칭결과</th>
                      <th className="py-3 px-3">연계 활동지원사</th>
                      <th className="py-3 px-3">서비스 개시일</th>
                      <th className="py-3 px-3">전담인력(상담자)</th>
                      <th className="py-3 px-4 text-right">인쇄 및 관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSavedRecords.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-black text-slate-900 flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{maskText(item.userName, true) || '이름 없음'}</span>
                        </td>
                        <td className="py-3.5 px-3 text-slate-500 font-medium">
                          {maskText(item.userBirthDate) || '-'}
                        </td>
                        <td className="py-3.5 px-3 text-slate-600 font-medium">
                          {item.consultDate || '-'}
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          {item.resultType === '매칭완료' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              매칭완료
                            </span>
                          ) : item.resultType === '연계불가' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                              <XCircle className="w-3 h-3 text-rose-600" />
                              연계불가
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
                              미결 (진행중)
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 font-bold text-slate-800">
                          {maskText(item.resultAssistantName || item.assistantName, true) || '-'}
                        </td>
                        <td className="py-3.5 px-3 text-slate-600 font-medium">
                          {item.serviceStartDate || '-'}
                        </td>
                        <td className="py-3.5 px-3 text-slate-600">
                          {item.counselorName || '-'}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* INDIVIDUAL PRINT BUTTON */}
                            <button
                              type="button"
                              onClick={() => handlePrintItem(item)}
                              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                              title="A4 인쇄 / PDF 출력"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>인쇄</span>
                            </button>

                            {/* EDIT BUTTON */}
                            <button
                              type="button"
                              onClick={() => {
                                setRecord(item);
                                setSearchQuery(item.userName);
                                setSubTab('editor');
                              }}
                              className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                              title="기록지 열람 및 수정"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>수정</span>
                            </button>

                            {/* DELETE BUTTON */}
                            <button
                              type="button"
                              onClick={() => setDeleteTargetRecord(item)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="기록지 삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* BATCH PRINT CONTAINER (Always rendered for @media print, hidden on screen) */}
      {/* ========================================================================= */}
      <div 
        id="hwp-batch-print-document" 
        className={isBatchPrinting ? 'block' : 'hidden'}
      >
        {batchRecordsToPrint.map((batchItem, bIdx) => (
          <div key={batchItem.id || bIdx} className="hwp-batch-page">
            <HWPRecordSheet
              record={batchItem}
              isEditor={false}
              maskText={maskText}
              showMarginGuide={false}
            />
          </div>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* BATCH PRINT CONFIRMATION & SELECTION MODAL                                 */}
      {/* ========================================================================= */}
      {isBatchPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">저장된 매칭과정 기록지 일괄 인쇄</h3>
                  <p className="text-xs text-slate-500">선택한 기록지들을 각각 A4 1장 규격으로 연속 출력합니다.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBatchPrintModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Selection Toolbar */}
            <div className="px-5 py-3 bg-indigo-50/60 border-b border-indigo-100 flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={batchSelectedIds.length === filteredSavedRecords.length && filteredSavedRecords.length > 0}
                  onChange={handleToggleSelectAllBatch}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span>전체 선택 ({batchSelectedIds.length} / {filteredSavedRecords.length}건)</span>
              </label>
              <span className="text-indigo-700 font-extrabold">
                총 {batchSelectedIds.length}장의 A4 기록지가 출력됩니다.
              </span>
            </div>

            {/* Records Checklist */}
            <div className="p-4 overflow-y-auto divide-y divide-slate-100 flex-1 space-y-1">
              {filteredSavedRecords.map((item) => {
                const isSelected = batchSelectedIds.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className={`p-3 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected ? 'bg-indigo-50/40 hover:bg-indigo-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleBatchSelect(item.id)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-900">{maskText(item.userName, true)}</span>
                          <span className="text-[11px] text-slate-400">({maskText(item.userBirthDate) || '생년월일 미기재'})</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          상담일자: {item.consultDate || '-'} | 상담자: {item.counselorName || '-'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-right">
                      {item.resultType === '매칭완료' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          매칭완료 ({maskText(item.resultAssistantName, true) || '활동지원사'})
                        </span>
                      ) : item.resultType === '연계불가' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                          연계불가
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                          미결
                        </span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsBatchPrintModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-xl cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleStartBatchPrint}
                disabled={batchSelectedIds.length === 0}
                className="px-5 py-2 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl shadow-md shadow-indigo-500/20 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>선택된 {batchSelectedIds.length}건 일괄 인쇄 시작</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTargetRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white max-w-sm w-full rounded-2xl p-5 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">기록지 삭제 확인</h3>
            <p className="text-xs text-slate-600">
              <strong className="text-slate-900">'{deleteTargetRecord.userName}'</strong> 님의 매칭과정 기록지를 클라우드 데이터베이스에서 영구 삭제하시겠습니까?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTargetRecord(null)}
                className="px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await deleteMatchingRecordFromFirestore(deleteTargetRecord.id);
                    setDeleteTargetRecord(null);
                    setToastMessage('기록지가 성공적으로 삭제되었습니다.');
                    setTimeout(() => setToastMessage(null), 2500);
                  } catch (e) {
                    console.error('Delete error:', e);
                  }
                }}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl cursor-pointer shadow-xs"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
