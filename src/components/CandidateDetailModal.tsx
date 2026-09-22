/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Candidate, CategoryType, ConsultationLog } from '../types';
import { X, Save, Calendar, Plus, Trash2, Heart, Shield, PlusCircle, CheckSquare, Sparkles, Navigation } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseBirthDateToYYMMDD } from './ExcelImporter';

interface CandidateDetailModalProps {
  candidate: Candidate | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Candidate) => void;
  onDelete?: (id: string) => void;
}

export default function CandidateDetailModal({
  candidate,
  isOpen,
  onClose,
  onSave,
  onDelete
}: CandidateDetailModalProps) {
  const [formData, setFormData] = useState<Partial<Candidate>>({});
  const [newLogDate, setNewLogDate] = useState('');
  const [newLogContent, setNewLogContent] = useState('');
  const [activeTab, setActiveTab] = useState<'info' | 'logs'>('info');
  const [innerConfirm, setInnerConfirm] = useState<{ message: string; onConfirm: () => void; } | null>(null);

  useEffect(() => {
    if (candidate) {
      setFormData({ ...candidate });
      // Default new log date to today's date
      const today = new Date().toISOString().split('T')[0];
      setNewLogDate(today);
      setNewLogContent('');
      setActiveTab('info');
    } else {
      // Create draft template for brand new candidate
      setFormData({
        id: `cand-new-${Date.now()}`,
        category: '대기',
        registrationDate: new Date().toISOString().split('T')[0],
        registrar: '',
        name: '',
        birthDate: '',
        gender: '남',
        disabilityType: '',
        disabilityGrade: '',
        complexDisability: false,
        complexDisabilityType: '',
        fundingNational: '',
        fundingProvincial: '',
        fundingCity: '',
        addressCity: '수원시',
        addressDistrict: '',
        addressDong: '',
        addressDetail: '',
        phone: '',
        serviceContent: '',
        specialNotes: '',
        consultationLogs: [],
        remarks: ''
      });
      setNewLogDate(new Date().toISOString().split('T')[0]);
      setNewLogContent('');
      setActiveTab('info');
    }
  }, [candidate, isOpen]);

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }));
  };

  const handleAddLog = () => {
    if (!newLogContent.trim() || !newLogDate) return;
    
    const newLog: ConsultationLog = {
      id: `log-add-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      date: newLogDate,
      content: newLogContent.trim()
    };

    const currentLogs = formData.consultationLogs || [];
    // Sort logs descending by date
    const updatedLogs = [newLog, ...currentLogs].sort((a, b) => b.date.localeCompare(a.date));

    setFormData(prev => ({
      ...prev,
      consultationLogs: updatedLogs
    }));
    setNewLogContent('');
  };

  const handleDeleteLog = (logId: string) => {
    setInnerConfirm({
      message: '이 상담 기록 일지를 정말 삭제하시겠습니까?',
      onConfirm: () => {
        const currentLogs = formData.consultationLogs || [];
        const updatedLogs = currentLogs.filter(log => log.id !== logId);
        setFormData(prev => ({
          ...prev,
          consultationLogs: updatedLogs
        }));
      }
    });
  };

  const handleSave = () => {
    if (!formData.name?.trim()) {
      alert('성명은 필수 항목입니다.');
      return;
    }
    if (!formData.registrationDate) {
      alert('접수일은 필수 항목입니다.');
      return;
    }

    // Standardize birthDate to YYMMDD
    const rawBirth = formData.birthDate || '';
    const birthVal = parseBirthDateToYYMMDD(rawBirth);

    // Clean disabilityGrade from '미분류' or '미지정'
    const rawGrade = formData.disabilityGrade || '';
    const cleanedGrade = (rawGrade === '미분류' || rawGrade === '미지정') ? '' : rawGrade;

    const finalData = {
      ...formData,
      birthDate: birthVal,
      disabilityGrade: cleanedGrade
    };

    onSave(finalData as Candidate);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Modal Container */}
      <div className="bg-slate-50 rounded-2xl shadow-2xl border border-slate-100 max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col z-10">
        
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg ${
              formData.category === '대기' ? 'bg-orange-50 text-orange-600 border border-orange-100' :
              formData.category === '삭제' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
              formData.category === '보류' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
              'bg-emerald-50 text-emerald-600 border border-emerald-100'
            }`}>
              {formData.category || '대기'}
            </span>
            <h2 className="text-xl font-bold text-slate-800">
              {candidate ? `${formData.name}님의 대기 정보` : '새로운 이용대기자 등록'}
            </h2>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-50/80 px-6 py-2.5 border-b border-slate-200 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`px-4 py-2 text-sm font-bold rounded-lg border transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'info'
                ? 'bg-white text-emerald-700 border-emerald-600 shadow-xs ring-1 ring-emerald-500/20'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100/70 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <span className={`w-5 h-5 rounded-full text-xs font-black flex items-center justify-center ${
              activeTab === 'info'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-200 text-slate-600'
            }`}>
              1
            </span>
            <span>기본 인적사항</span>
          </button>
          
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 text-sm font-bold rounded-lg border transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-white text-emerald-700 border-emerald-600 shadow-xs ring-1 ring-emerald-500/20'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100/70 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <span className={`w-5 h-5 rounded-full text-xs font-black flex items-center justify-center ${
              activeTab === 'logs'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-200 text-slate-600'
            }`}>
              2
            </span>
            <span>추가 상담 일지</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-black ml-0.5 ${
              activeTab === 'logs'
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              {formData.consultationLogs?.length || 0}
            </span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'info' ? (
            <div className="flex flex-col gap-6">
              
              {/* 기본 대기 및 인적정보 */}
              <div className="space-y-4 bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <Heart className="w-4 h-4 text-emerald-500" />
                  기본 대기 및 인적정보
                </h3>

                {/* 성명, 생년월일, 성별, 연락처 */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">성명</label>
                    <input
                      type="text"
                      name="name"
                      placeholder="성함 입력"
                      value={formData.name || ''}
                      onChange={handleInputChange}
                      className="w-full text-[13px] p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none bg-slate-50/50 text-slate-800 font-bold placeholder:text-slate-400 placeholder:font-normal"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">생년월일</label>
                    <input
                      type="text"
                      name="birthDate"
                      placeholder="생년월일 (예시: 940322)"
                      value={formData.birthDate || ''}
                      onChange={handleInputChange}
                      className="w-full text-[13px] p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none bg-slate-50/50 text-slate-800 font-bold placeholder:text-slate-400 placeholder:font-normal"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">성별</label>
                    <select
                      name="gender"
                      value={formData.gender || '남'}
                      onChange={handleInputChange}
                      className="w-full text-[13px] p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none bg-slate-50/50 text-slate-800 font-bold"
                    >
                      <option value="남">남성</option>
                      <option value="여">여성</option>
                      <option value="기타">기타</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">연락처</label>
                    <input
                      type="text"
                      name="phone"
                      placeholder="010-0000-0000"
                      value={formData.phone || ''}
                      onChange={handleInputChange}
                      className="w-full text-[13px] p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none bg-slate-50/50 text-slate-800 font-bold placeholder:text-slate-400 placeholder:font-normal"
                    />
                  </div>
                </div>

                {/* 구분, 접수일, 접수자 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">구분</label>
                    <select
                      name="category"
                      value={formData.category || '대기'}
                      onChange={handleInputChange}
                      className="w-full text-[13px] p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none bg-slate-50/50 text-slate-800 font-bold"
                    >
                      <option value="대기">대기</option>
                      <option value="삭제">삭제</option>
                      <option value="보류">보류</option>
                      <option value="연계">연계</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">접수일</label>
                    <input
                      type="date"
                      name="registrationDate"
                      value={formData.registrationDate || ''}
                      onChange={handleInputChange}
                      className="w-full text-[13px] p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none bg-slate-50/50 text-slate-800 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">접수자</label>
                    <input
                      type="text"
                      name="registrar"
                      placeholder="직원 성명"
                      value={formData.registrar || ''}
                      onChange={handleInputChange}
                      className="w-full text-[13px] p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none bg-slate-50/50 text-slate-800 font-bold placeholder:text-slate-400 placeholder:font-normal"
                    />
                  </div>
                </div>

                {/* 장애유형, 급수 (장애정도), 중복 장애 여부 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">장애유형</label>
                    <input
                      type="text"
                      name="disabilityType"
                      placeholder="예) 지체장애, 자폐성장애"
                      value={formData.disabilityType || ''}
                      onChange={handleInputChange}
                      className="w-full text-[13px] p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none bg-slate-50/50 text-slate-800 font-bold placeholder:text-slate-400 placeholder:font-normal"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">급수 (장애정도)</label>
                    <input
                      type="text"
                      name="disabilityGrade"
                      placeholder="예) 중증 1급, 경증"
                      value={formData.disabilityGrade || ''}
                      onChange={handleInputChange}
                      className="w-full text-[13px] p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none bg-slate-50/50 text-slate-800 font-bold placeholder:text-slate-400 placeholder:font-normal"
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-3.5 pl-1">
                    <input
                      type="checkbox"
                      id="complexDisability"
                      name="complexDisability"
                      checked={formData.complexDisability || false}
                      onChange={handleCheckboxChange}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4.5 w-4.5 cursor-pointer"
                    />
                    <label htmlFor="complexDisability" className="text-[13px] font-bold text-slate-700 cursor-pointer select-none">
                      중복 장애 여부
                    </label>
                  </div>
                </div>

                {/* 중복장애 활성화 시 나타나는 추가 입력란 */}
                {formData.complexDisability && (
                  <div className="p-3.5 bg-emerald-50/60 border border-emerald-100/90 rounded-xl space-y-2.5">
                    <div>
                      <label className="block text-[13px] font-bold text-emerald-800 mb-1.5">중복장애 장애유형</label>
                      <input
                        type="text"
                        name="complexDisabilityType"
                        placeholder="중복장애의 장애유형을 작성해 주세요. (예: 지적장애, 뇌병변장애 등)"
                        value={formData.complexDisabilityType || ''}
                        onChange={handleInputChange}
                        className="w-full text-[13px] p-2.5 border border-emerald-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none bg-white text-slate-800 font-bold placeholder:text-slate-400 placeholder:font-normal"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 활동지원급여 */}
              <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm space-y-3">
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <Shield className="w-4 h-4 text-emerald-500" />
                  활동지원급여
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">국비</label>
                    <input
                      type="text"
                      name="fundingNational"
                      placeholder="예) 120"
                      value={formData.fundingNational || ''}
                      onChange={handleInputChange}
                      className="w-full text-[13px] p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none bg-slate-50/50 text-slate-800 font-bold placeholder:text-slate-400 placeholder:font-normal"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">도비</label>
                    <input
                      type="text"
                      name="fundingProvincial"
                      placeholder="예) 120"
                      value={formData.fundingProvincial || ''}
                      onChange={handleInputChange}
                      className="w-full text-[13px] p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none bg-slate-50/50 text-slate-800 font-bold placeholder:text-slate-400 placeholder:font-normal"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">시비</label>
                    <input
                      type="text"
                      name="fundingCity"
                      placeholder="예) 120"
                      value={formData.fundingCity || ''}
                      onChange={handleInputChange}
                      className="w-full text-[13px] p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none bg-slate-50/50 text-slate-800 font-bold placeholder:text-slate-400 placeholder:font-normal"
                    />
                  </div>
                </div>
              </div>

              {/* 주소 관리 */}
              <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm space-y-3">
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <Navigation className="w-4 h-4 text-emerald-500" />
                  주소 관리
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">시/도</label>
                    <input
                      type="text"
                      name="addressCity"
                      placeholder="예) 수원시"
                      value={formData.addressCity || ''}
                      onChange={handleInputChange}
                      className="w-full text-[13px] p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 font-bold placeholder:text-slate-400 bg-slate-50/50 placeholder:font-normal"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">구</label>
                    <input
                      type="text"
                      name="addressDistrict"
                      placeholder="예) 영통구"
                      value={formData.addressDistrict || ''}
                      onChange={handleInputChange}
                      className="w-full text-[13px] p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 font-bold placeholder:text-slate-400 bg-slate-50/50 placeholder:font-normal"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">동</label>
                    <input
                      type="text"
                      name="addressDong"
                      placeholder="예) 매탄동"
                      value={formData.addressDong || ''}
                      onChange={handleInputChange}
                      className="w-full text-[13px] p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 font-bold placeholder:text-slate-400 bg-slate-50/50 placeholder:font-normal"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[13px] font-bold text-slate-700 mb-1.5">세부 상세 주소</label>
                  <input
                    type="text"
                    name="addressDetail"
                    placeholder="예) 삼성로 123번길 10, 동/호수 등"
                    value={formData.addressDetail || ''}
                    onChange={handleInputChange}
                    className="w-full text-[13px] p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 font-bold placeholder:text-slate-400 bg-slate-50/50 placeholder:font-normal"
                  />
                </div>
              </div>

              {/* 서비스 의뢰 상세 및 대기 특이사항 */}
              <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm space-y-4">
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  서비스 의뢰 상세 및 대기 특이사항
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">서비스 요청 상세 내용</label>
                    <textarea
                      name="serviceContent"
                      rows={3}
                      placeholder="요구하시는 구체적인 서비스 지원 방향 기술"
                      value={formData.serviceContent || ''}
                      onChange={handleInputChange}
                      className="w-full text-[13px] p-3 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none bg-slate-50/50 text-slate-800 font-bold placeholder:text-slate-400 placeholder:font-normal"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">특이사항</label>
                    <textarea
                      name="specialNotes"
                      rows={3}
                      placeholder="일상생활 시 유의해야 할 돌발 특성, 보조기구 장착 여부 등"
                      value={formData.specialNotes || ''}
                      onChange={handleInputChange}
                      className="w-full text-[13px] p-3 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none bg-slate-50/50 text-slate-800 font-bold placeholder:text-slate-400 placeholder:font-normal"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[13px] font-bold text-slate-700 mb-1.5">기타 종합 비고</label>
                  <input
                    type="text"
                    name="remarks"
                    placeholder="기타 비고 또는 참고 설명 작성"
                    value={formData.remarks || ''}
                    onChange={handleInputChange}
                    className="w-full text-[13px] p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none bg-slate-50/50 text-slate-800 font-bold placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>
              </div>

            </div>
          ) : (
            <div className="space-y-6">
              {/* Consultation Logs Tab Content */}
              <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
                  새 상담 내역 추가 등록
                </h3>
                <div className="flex flex-col md:flex-row gap-3 items-end">
                  <div className="w-full md:w-1/4">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">상담 진행일자</label>
                    <input
                      type="date"
                      value={newLogDate}
                      onChange={(e) => setNewLogDate(e.target.value)}
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
                    />
                  </div>
                  <div className="w-full md:w-3/4">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">상담 요약 및 실행 내역</label>
                    <input
                      type="text"
                      placeholder="상담 일지에 들어갈 통화 요약 또는 조치 사항을 작성해 주세요."
                      value={newLogContent}
                      onChange={(e) => setNewLogContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddLog();
                      }}
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddLog}
                    className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 hover:shadow shadow-sm shrink-0 flex items-center gap-1 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    추가
                  </button>
                </div>
              </div>

              {/* Consultation Timeline */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-700">과거 및 최근 상담 내역 연대기 목록</h3>
                  <span className="text-[11px] text-slate-400">여기에 추가된 연도 데이터에 의거해 연도별 웰컴대기명단에 자동 출현 처리됩니다.</span>
                </div>
                
                {formData.consultationLogs && formData.consultationLogs.length > 0 ? (
                  <div className="relative border-l border-emerald-100 ml-3.5 space-y-5 py-2">
                    {formData.consultationLogs.map((log) => (
                      <div key={log.id} className="relative pl-6">
                        {/* Dot indicator */}
                        <div className="absolute -left-1.5 top-1 w-3 h-3 rounded-full bg-emerald-500 border border-white" />
                        
                        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {log.date}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                ({log.date.split('-')[0]}년도 명단 노출 트리거)
                              </span>
                            </div>
                            <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                              {log.content}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteLog(log.id)}
                            className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors shrink-0"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-8 bg-white border border-slate-100 rounded-xl text-slate-400 text-xs">
                    등록되어 있는 누적 상담 일지가 존재하지 않습니다. 첫 일지를 입력해 주시기 바랍니다.
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="bg-white border-t border-slate-100 px-6 py-4 flex items-center justify-between">
          <div>
            {candidate && onDelete && (
              <button
                type="button"
                onClick={() => {
                  onDelete(formData.id!);
                  onClose();
                }}
                className="px-4 py-2 text-xs font-bold text-rose-500 bg-rose-50 hover:bg-rose-100 rounded-xl transition-all"
              >
                전체 영구 삭제
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-500 bg-white border border-slate-200 rounded-xl hover:text-slate-800 hover:bg-slate-50 transition-all"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm hover:shadow flex items-center gap-1.5 transition-all"
            >
              <Save className="w-4 h-4" />
              저장 및 완료
            </button>
          </div>
        </div>

      </div>

      {/* Inner confirm overlay */}
      <AnimatePresence>
        {innerConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4 text-center z-50"
            >
              <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto">
                <Trash2 className="w-5 h-5 flex-shrink-0" />
              </div>
              <h4 className="text-sm font-black text-slate-800">이용대기 기록 가상 영구 삭제</h4>
              <p className="text-xs text-slate-500 leading-relaxed text-left bg-slate-50 p-3 rounded-lg border border-slate-100 font-medium">
                {innerConfirm.message}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setInnerConfirm(null)}
                  className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-[11px] font-bold transition-all cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    innerConfirm.onConfirm();
                    setInnerConfirm(null);
                  }}
                  className="flex-1 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition-all cursor-pointer"
                >
                  삭제 확인
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
