import React from 'react';
import { X, Smartphone, Monitor, Download, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';

interface InstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt: any;
  isAppInstalled: boolean;
  onTriggerInstall: () => void;
}

export default function InstallGuideModal({
  isOpen,
  onClose,
  deferredPrompt,
  isAppInstalled,
  onTriggerInstall,
}: InstallGuideModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs print:hidden">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden z-50 flex flex-col"
        id="install-guide-modal-content"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-all text-white cursor-pointer"
            id="install-guide-close-btn"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center">
              <Download className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-white">앱 설치방법</h3>
              <p className="text-xs text-emerald-100 font-medium">컴퓨터 및 모바일 바탕화면에 앱으로 저장하는 방법</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          
          {/* Direct Install Button (if browser supports one-click PWA install) */}
          {deferredPrompt ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col items-center text-center space-y-2.5">
              <span className="text-xs text-emerald-900 font-bold">
                현재 브라우저에서 바로 설치가 지원됩니다
              </span>
              <button
                onClick={onTriggerInstall}
                className="w-full py-3 px-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                id="install-guide-direct-install-btn"
              >
                <Download className="w-4 h-4" />
                <span>바탕화면에 앱 바로 설치하기</span>
              </button>
            </div>
          ) : isAppInstalled ? (
            <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl text-center">
              <p className="text-xs text-emerald-800 font-bold flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>이미 바탕화면에 설치되었거나 앱 창으로 실행 중입니다.</span>
              </p>
            </div>
          ) : null}

          {/* PC Desktop Install Method */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-black text-slate-900">
              <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Monitor className="w-3.5 h-3.5" />
              </div>
              <span>1. PC 컴퓨터 (크롬 / 엣지 / 웨일) 바탕화면 저장</span>
            </div>
            <div className="space-y-2 text-xs text-slate-600 font-medium pl-8 leading-relaxed">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 space-y-1">
                <div className="font-bold text-slate-800">방법 A. 주소창에서 바로 설치</div>
                <div>브라우저 상단 주소창 맨 오른쪽의 <strong>[설치 ⊕]</strong> 또는 <strong>[컴퓨터 다운로드 아이콘]</strong>을 누른 후 <strong>[설치]</strong>를 클릭합니다.</div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 space-y-1">
                <div className="font-bold text-slate-800">방법 B. 바로가기 만들기로 바탕화면 저장</div>
                <div>
                  브라우저 우측 상단 메뉴(점 3개 <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[11px] font-mono">⋮</span>) 클릭 → <strong>[저장 및 공유]</strong> 또는 <strong>[도구 더보기]</strong> → <strong>[바로가기 만들기]</strong> 클릭 → <strong>[창으로 열기]</strong> 체크 후 <strong>[만들기]</strong>를 누르면 바탕화면에 바로 생성됩니다.
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Install Method */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-black text-slate-900">
              <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <Smartphone className="w-3.5 h-3.5" />
              </div>
              <span>2. 스마트폰 / 태블릿 홈 화면에 저장</span>
            </div>
            <div className="space-y-2 text-xs text-slate-600 font-medium pl-8 leading-relaxed">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 space-y-1">
                <div className="font-bold text-slate-800">삼성 갤럭시 / 안드로이드</div>
                <div>인터넷 브라우저 메뉴(점 3개 <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[11px] font-mono">⋮</span> 또는 삼선 <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[11px] font-mono">≡</span>) 클릭 → <strong>[현재 페이지 추가]</strong> 또는 <strong>[홈 화면에 추가]</strong>를 선택합니다.</div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 space-y-1">
                <div className="font-bold text-slate-800">아이폰 / 아이패드 (Safari)</div>
                <div>사파리 브라우저 하단 중앙의 <strong>[공유 버튼 (네모 위로 화살표 ⎋)]</strong> 클릭 → <strong>[홈 화면에 추가]</strong>를 선택합니다.</div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-150 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
            id="install-guide-confirm-btn"
          >
            닫기
          </button>
        </div>
      </motion.div>
    </div>
  );
}
