import React from 'react';
import { Play, Activity, Settings, Volume2, VolumeX, ShieldCheck, Sparkles, Cpu } from 'lucide-react';
import { sound } from '../utils/sound';

interface HomeScreenProps {
  onNavigate: (screen: 'game_mode' | 'dashboard' | 'settings') => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onNavigate,
  soundEnabled,
  onToggleSound,
}) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 sm:p-6 overflow-x-hidden relative">
      {/* Background Ambience Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 -translate-x-1/2 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="w-full max-w-5xl flex items-center justify-between z-10 pt-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-cyan-400 shadow-md">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-mono tracking-wider text-cyan-400 font-bold block">
              ĐỒ ÁN TỐT NGHIỆP • D22 KỸ THUẬT ĐIỆN TỬ - PTIT
            </span>
            <span className="text-xs text-slate-400">SV: Dương Sơn Quang • MSV: B22DCDT238</span>
          </div>
        </div>

        {/* Audio Toggle */}
        <button
          id="sound-toggle-btn"
          onClick={() => {
            sound.playClick();
            onToggleSound();
          }}
          className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-all flex items-center gap-2 text-xs font-semibold"
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-rose-400" />}
          <span className="hidden sm:inline">{soundEnabled ? 'Âm thanh: BẬT' : 'Âm thanh: TẮT'}</span>
        </button>
      </header>

      {/* Central Hero Block */}
      <main className="w-full max-w-2xl flex flex-col items-center text-center my-auto py-8 z-10">
        {/* Cute Mascot & Animated Mini Arena */}
        <div className="relative mb-6">
          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl bg-slate-900/90 border-4 border-cyan-500/40 p-3 shadow-2xl shadow-cyan-950 flex items-center justify-center relative">
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-tr from-cyan-500/20 to-orange-500/20 animate-pulse pointer-events-none" />
            {/* Cute Vehicle Mascot */}
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
              <rect x="12" y="20" width="12" height="22" rx="5" fill="#1e293b" />
              <rect x="76" y="20" width="12" height="22" rx="5" fill="#1e293b" />
              <rect x="12" y="60" width="12" height="22" rx="5" fill="#1e293b" />
              <rect x="76" y="60" width="12" height="22" rx="5" fill="#1e293b" />
              <rect x="20" y="16" width="60" height="70" rx="16" fill="#06b6d4" stroke="#ffffff" strokeWidth="2.5" />
              <circle cx="32" cy="22" r="4.5" fill="#fef08a" />
              <circle cx="68" cy="22" r="4.5" fill="#fef08a" />
              <rect x="28" y="30" width="44" height="24" rx="8" fill="#090d16" />
              <ellipse cx="40" cy="42" rx="5" ry="5" fill="#38bdf8" />
              <ellipse cx="60" cy="42" rx="5" ry="5" fill="#38bdf8" />
              <circle cx="39" cy="40" r="1.5" fill="#ffffff" />
              <circle cx="59" cy="40" r="1.5" fill="#ffffff" />
              <circle cx="50" cy="68" r="9" fill="#e2e8f0" stroke="#0f172a" strokeWidth="1.5" />
              <circle cx="50" cy="68" r="4" fill="#22d3ee" className="animate-ping" />
            </svg>
          </div>
          {/* Sparkles pill */}
          <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-slate-950 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase flex items-center gap-1 shadow-md">
            <Sparkles className="w-3 h-3" /> Pi 3 & ESP32
          </div>
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-2">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-orange-400">
            THREE MEN'S MORRIS
          </span>
        </h1>
        <p className="text-lg sm:text-xl font-bold text-slate-200 mb-1">
          Hệ Thống Cờ Xe Tự Hành Thông Minh
        </p>
        <p className="text-xs sm:text-sm text-slate-400 max-w-lg mb-8">
          Điều khiển 6 robot qua ESP-NOW • Chơi với máy bằng Minimax tùy chọn • Di chuyển theo cạnh hợp lệ của bàn cờ
        </p>

        {/* Big Interactive Action Buttons */}
        <div className="w-full max-w-md space-y-3.5">
          {/* PLAY GAME BUTTON */}
          <button
            id="home-play-btn"
            onClick={() => {
              sound.playClick();
              onNavigate('game_mode');
            }}
            className="w-full py-5 px-6 rounded-3xl font-extrabold text-lg sm:text-xl bg-gradient-to-r from-cyan-500 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-slate-950 shadow-xl shadow-cyan-500/25 flex items-center justify-center gap-3 transform active:scale-95 transition-all cursor-pointer"
          >
            <Play className="w-6 h-6 fill-current" />
            BẮT ĐẦU CHƠI CỜ
          </button>

          {/* DASHBOARD BUTTON */}
          <button
            id="home-dashboard-btn"
            onClick={() => {
              sound.playClick();
              onNavigate('dashboard');
            }}
            className="w-full py-4 px-6 rounded-3xl font-bold text-base bg-slate-900 hover:bg-slate-800 text-slate-100 border-2 border-slate-700 hover:border-cyan-500/50 shadow-md flex items-center justify-center gap-3 transform active:scale-95 transition-all cursor-pointer"
          >
            <Activity className="w-5 h-5 text-cyan-400" />
            DASHBOARD GIÁM SÁT KỸ THUẬT
          </button>

          {/* SETTINGS BUTTON */}
          <button
            id="home-settings-btn"
            onClick={() => {
              sound.playClick();
              onNavigate('settings');
            }}
            className="w-full py-3.5 px-6 rounded-3xl font-semibold text-sm bg-slate-900/60 hover:bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700 flex items-center justify-center gap-2.5 transform active:scale-95 transition-all cursor-pointer"
          >
            <Settings className="w-4 h-4 text-slate-400" />
            CÀI ĐẶT HỆ THỐNG & WEBSOCKET
          </button>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="w-full max-w-5xl flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 border-t border-slate-900 pt-4 z-10 gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Raspberry Pi 3 (Bộ não) & ESP32 (Coordinator) • Star Topology ESP-NOW</span>
        </div>
        <div className="font-mono">Phiên bản Web Interface v2.4 (Embedded Flash Ready)</div>
      </footer>
    </div>
  );
};
