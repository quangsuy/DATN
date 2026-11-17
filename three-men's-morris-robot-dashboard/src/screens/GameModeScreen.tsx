import React, { useState } from 'react';
import { GameMode, PlayerColor, TeamColors } from '../types';
import { Users, Bot, ArrowLeft, Play, Sparkles, Check } from 'lucide-react';
import { sound } from '../utils/sound';

interface GameModeScreenProps {
  onStartGame: (mode: GameMode, color: PlayerColor, firstPlayer: 1 | 2, teamColors: TeamColors) => void;
  onBack: () => void;
}

// Bảng màu preset cho LED xe — 12 màu đẹp
const COLOR_PRESETS = [
  { hex: '#00ffff', label: 'Cyan' },
  { hex: '#3b82f6', label: 'Xanh' },
  { hex: '#8b5cf6', label: 'Tím' },
  { hex: '#ec4899', label: 'Hồng' },
  { hex: '#ef4444', label: 'Đỏ' },
  { hex: '#f97316', label: 'Cam' },
  { hex: '#eab308', label: 'Vàng' },
  { hex: '#22c55e', label: 'Lá' },
  { hex: '#ffffff', label: 'Trắng' },
  { hex: '#94a3b8', label: 'Bạc' },
  { hex: '#fbbf24', label: 'Vàng kim' },
  { hex: '#f0abfc', label: 'Lavender' },
];

export const GameModeScreen: React.FC<GameModeScreenProps> = ({ onStartGame, onBack }) => {
  const [selectedMode, setSelectedMode] = useState<GameMode>('pva');
  const [selectedColor, setSelectedColor] = useState<PlayerColor>('cyan');
  const [firstPlayer, setFirstPlayer] = useState<1 | 2>(1);
  // Màu LED cho từng đội
  const [team1Color, setTeam1Color] = useState<string>('#00ffff');
  const [team2Color, setTeam2Color] = useState<string>('#f97316');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 sm:p-6 select-none relative">
      {/* Glow Effects */}
      <div className="absolute top-1/3 left-1/4 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="w-full max-w-4xl flex items-center justify-between z-10 pt-2">
        <button
          id="mode-back-btn"
          onClick={() => {
            sound.playClick();
            onBack();
          }}
          className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white flex items-center gap-2 text-sm font-bold transition-all active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          QUAY LẠI
        </button>

        <h2 className="text-xl font-extrabold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-orange-400">
          CHỌN CHẾ ĐỘ CHƠI
        </h2>

        <div className="w-20" /> {/* Spacer for balance */}
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-3xl my-auto py-4 z-10 space-y-5">
        {/* Two Large Game Mode Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {/* Card 1: Player vs Player */}
          <div
            id="mode-pvp-card"
            onClick={() => {
              sound.playSelect();
              setSelectedMode('pvp');
            }}
            className={`cursor-pointer rounded-3xl p-6 border-4 transition-all duration-200 transform ${
              selectedMode === 'pvp'
                ? 'bg-cyan-950/40 border-cyan-400 scale-102 shadow-xl shadow-cyan-950/50'
                : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:scale-101'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center text-cyan-400">
                <Users className="w-7 h-7" />
              </div>
              {selectedMode === 'pvp' && (
                <div className="w-7 h-7 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center font-bold">
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
              )}
            </div>

            <h3 className="text-xl font-extrabold text-white mb-1">NGƯỜI VỚI NGƯỜI</h3>
            <p className="text-xs font-bold text-cyan-400 tracking-wider mb-2 font-mono">
              PLAYER VS PLAYER
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Hai người chơi so tài trực tiếp trên cùng một màn hình hoặc sa bàn thực tế.
            </p>
          </div>

          {/* Card 2: Player vs AI */}
          <div
            id="mode-pva-card"
            onClick={() => {
              sound.playSelect();
              setSelectedMode('pva');
            }}
            className={`cursor-pointer rounded-3xl p-6 border-4 transition-all duration-200 transform ${
              selectedMode === 'pva'
                ? 'bg-orange-950/40 border-orange-400 scale-102 shadow-xl shadow-orange-950/50'
                : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:scale-101'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 rounded-2xl bg-orange-500/20 border-2 border-orange-400 flex items-center justify-center text-orange-400">
                <Bot className="w-7 h-7" />
              </div>
              {selectedMode === 'pva' && (
                <div className="w-7 h-7 rounded-full bg-orange-400 text-slate-950 flex items-center justify-center font-bold">
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-xl font-extrabold text-white">NGƯỜI VỚI MÁY</h3>
              <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-bold border border-amber-400/40 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Minimax AI
              </span>
            </div>
            <p className="text-xs font-bold text-orange-400 tracking-wider mb-2 font-mono">
              PLAYER VS AI
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Đấu trí cùng thuật toán Minimax chạy trực tiếp trên Raspberry Pi 3 (Bộ điều phối).
            </p>
          </div>
        </div>

        {/* Customization Options */}
        <div className="bg-slate-900/60 rounded-3xl p-5 border border-slate-800 space-y-4">

          {/* ===== Color Picker cho 2 đội ===== */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Đội 1 */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2 flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ backgroundColor: team1Color, boxShadow: `0 0 6px ${team1Color}` }}
                />
                MÀU LED ĐỘI 1 (Xe #1-3):
              </label>
              <div className="grid grid-cols-6 gap-1.5">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c.hex + '-t1'}
                    type="button"
                    title={c.label}
                    onClick={() => { sound.playClick(); setTeam1Color(c.hex); }}
                    className="w-full aspect-square rounded-lg border-2 transition-all active:scale-90 hover:scale-110"
                    style={{
                      backgroundColor: c.hex,
                      borderColor: team1Color === c.hex ? '#fff' : 'transparent',
                      boxShadow: team1Color === c.hex ? `0 0 8px ${c.hex}` : 'none',
                    }}
                  />
                ))}
              </div>
              {/* Custom hex input */}
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="color"
                  value={team1Color}
                  onChange={(e) => setTeam1Color(e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
                  title="Chọn màu tùy chỉnh đội 1"
                />
                <span className="text-[10px] font-mono text-slate-400">{team1Color.toUpperCase()}</span>
              </div>
            </div>

            {/* Đội 2 */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2 flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ backgroundColor: team2Color, boxShadow: `0 0 6px ${team2Color}` }}
                />
                MÀU LED ĐỘI 2 (Xe #4-6):
              </label>
              <div className="grid grid-cols-6 gap-1.5">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c.hex + '-t2'}
                    type="button"
                    title={c.label}
                    onClick={() => { sound.playClick(); setTeam2Color(c.hex); }}
                    className="w-full aspect-square rounded-lg border-2 transition-all active:scale-90 hover:scale-110"
                    style={{
                      backgroundColor: c.hex,
                      borderColor: team2Color === c.hex ? '#fff' : 'transparent',
                      boxShadow: team2Color === c.hex ? `0 0 8px ${c.hex}` : 'none',
                    }}
                  />
                ))}
              </div>
              {/* Custom hex input */}
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="color"
                  value={team2Color}
                  onChange={(e) => setTeam2Color(e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
                  title="Chọn màu tùy chỉnh đội 2"
                />
                <span className="text-[10px] font-mono text-slate-400">{team2Color.toUpperCase()}</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-800" />

          {/* Who Goes First */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">
              LƯỢT ĐI TRƯỚC:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  setFirstPlayer(1);
                }}
                className={`p-3 rounded-2xl border-2 text-xs transition-all ${
                  firstPlayer === 1
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                Người chơi đi trước
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  setFirstPlayer(2);
                }}
                className={`p-3 rounded-2xl border-2 text-xs transition-all ${
                  firstPlayer === 2
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                {selectedMode === 'pva' ? 'AI đi trước' : 'Người chơi 2 đi trước'}
              </button>
            </div>
          </div>
        </div>

        {/* Start Game Action Button */}
        <button
          id="confirm-start-game-btn"
          onClick={() => {
            sound.playClick();
            // playerColor giờ là đội người chơi chọn (team1=cyan / team2=orange vẫn giữ cho logic GameScreen)
            onStartGame(selectedMode, selectedColor, firstPlayer, { team1: team1Color, team2: team2Color });
          }}
          className="w-full py-5 px-6 rounded-3xl font-extrabold text-lg bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-3 transform active:scale-95 transition-all cursor-pointer"
        >
          <Play className="w-6 h-6 fill-current" />
          VÀO VÁN ĐẤU
        </button>
      </main>

      <footer className="w-full max-w-4xl text-center text-xs text-slate-500 pt-4 z-10 font-mono">
        Thuật toán Minimax được xử lý trên Raspberry Pi 3 và điều phối qua ESP32 Coordinator
      </footer>
    </div>
  );
};

