import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Building2, 
  ShieldCheck, 
  ShieldAlert, 
  FileSpreadsheet,
  RefreshCw,
  AlertCircle,
  Lock
} from 'lucide-react';
import { signInWithGoogle, StaffProfile } from '../services/firebaseService';

interface LoginScreenProps {
  onLoginSuccess: (profile: StaffProfile) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unauthorizedEmail, setUnauthorizedEmail] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setUnauthorizedEmail(null);

    try {
      const profile = await signInWithGoogle();
      onLoginSuccess(profile);
    } catch (err: any) {
      console.warn('Google sign-in attempt:', err);
      
      if (err.message === 'UNAUTHORIZED_DOMAIN') {
        setUnauthorizedEmail(err.rejectedEmail || '미인가 계정');
        setErrorMessage('접근 권한이 없는 계정입니다. 인가된 계정으로 다시 로그인해 주십시오.');
      } else if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setErrorMessage('로그인 창이 닫혔습니다. 다시 시도해 주세요.');
      } else if (err.code === 'auth/popup-blocked') {
        setErrorMessage('브라우저에서 팝업이 차단되었습니다. 팝업 차단을 해제한 후 다시 시도해 주세요.');
      } else if (err.code === 'auth/network-request-failed') {
        setErrorMessage('네트워크 연결이 원활하지 않습니다. 인터넷 연결을 확인해 주세요.');
      } else {
        setErrorMessage('인증에 실패하였습니다. 다시 시도해 주십시오.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      
      {/* Ambient background glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-8 bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white text-center relative">
          <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-md mx-auto flex items-center justify-center mb-4 shadow-inner border border-white/20">
            <FileSpreadsheet className="w-8 h-8 text-white" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-emerald-100 text-xs font-bold mb-2">
            <Building2 className="w-3.5 h-3.5" />
            <span>수원시장애인종합복지관</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">이용대기명단 관리 시스템</h1>
          <p className="text-xs text-emerald-100/90 mt-1.5 font-medium">
            전 직원 실시간 명단 공유 및 매칭과정 기록지 시스템
          </p>
        </div>

        {/* Action Body */}
        <div className="p-8 space-y-6">
          
          {/* Unauthorized Account Alert */}
          <AnimatePresence>
            {unauthorizedEmail && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs space-y-1.5"
              >
                <div className="flex items-center gap-2 font-bold text-rose-800">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>접근 권한 없음 (Access Denied)</span>
                </div>
                <p className="text-rose-700 leading-relaxed">
                  시도하신 계정(<strong className="font-bold text-rose-900">{unauthorizedEmail}</strong>)은 시스템 접근 권한이 없습니다. 인가된 업무용 계정으로 다시 로그인해 주십시오.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* General Error Notice */}
          {errorMessage && !unauthorizedEmail && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{errorMessage}</span>
            </motion.div>
          )}

          {/* Clean Google Login Button */}
          <div>
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full py-4 px-5 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm border-2 border-slate-200 hover:border-emerald-500 transition-all flex items-center justify-center gap-3 shadow-sm hover:shadow-md cursor-pointer disabled:opacity-50 group"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-5 h-5 text-emerald-600 animate-spin" />
                  <span className="text-slate-700">인증 확인 중...</span>
                </>
              ) : (
                <>
                  {/* Google Multicolor Logo */}
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span className="group-hover:text-emerald-700 transition-colors">
                    Google 계정으로 로그인
                  </span>
                </>
              )}
            </button>
          </div>

        </div>

        {/* Footer Security Badge */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>보안 인증 시스템 가동 중</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
