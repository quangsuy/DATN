import React, { useEffect, useRef } from 'react';
import { Trophy, RotateCcw, Home, Sparkles, Eye } from 'lucide-react';
import { sound } from '../utils/sound';

interface VictoryModalProps {
  winner: 1 | 2 | null;
  isDraw?: boolean;
  gameMode: 'pvp' | 'pva';
  onPlayAgain: () => void;
  onBackToMenu: () => void;
  onReviewBoard?: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  winner,
  isDraw = false,
  gameMode,
  onPlayAgain,
  onBackToMenu,
  onReviewBoard,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    sound.playVictory();

    // Lightweight native canvas confetti (no external library, perfectly embedded-safe)
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.parentElement?.clientWidth || 500;
    canvas.height = canvas.parentElement?.clientHeight || 500;

    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      rotation: number;
      vRot: number;
    }[] = [];

    const colors = ['#06b6d4', '#f97316', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
    for (let i = 0; i < 70; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 3,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 1.2) * 10,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        vRot: (Math.random() - 0.5) * 10,
      });
    }

    let animationFrameId: number;
    let frameCount = 0;

    const render = () => {
      frameCount++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2; // gravity
        p.vx *= 0.98;
        p.rotation += p.vRot;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });

      if (frameCount < 140) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const isPlayer1Win = winner === 1;
  const isAiWin = winner === 2 && gameMode === 'pva';

  let title = 'CHIẾN THẮNG!';
  let subtitle = 'Bạn đã xếp được 3 quân thẳng hàng!';
  let titleColor = 'text-cyan-400';
  let badgeBg = 'bg-cyan-500/20 border-cyan-400';

  if (isDraw) {
    title = 'HÒA CỜ!';
    subtitle = 'Cả hai người chơi đều phòng thủ xuất sắc!';
    titleColor = 'text-amber-400';
    badgeBg = 'bg-amber-500/20 border-amber-400';
  } else if (isAiWin) {
    title = 'AI CHIẾN THẮNG!';
    subtitle = 'Thuật toán Minimax (Bộ điều phối Pi 3) đã thắng ván này!';
    titleColor = 'text-orange-400';
    badgeBg = 'bg-orange-500/20 border-orange-400';
  } else if (isPlayer1Win) {
    title = gameMode === 'pva' ? 'BẠN THẮNG AI!' : 'NGƯỜI CHƠI 1 THẮNG!';
    subtitle = 'Xuất sắc! Các xe tự hành Đội Xanh đã tạo thành hàng 3!';
    titleColor = 'text-cyan-400';
    badgeBg = 'bg-cyan-500/20 border-cyan-400';
  } else {
    title = 'NGƯỜI CHƠI 2 THẮNG!';
    subtitle = 'Chúc mừng Đội Cam (Xe #04, #05, #06)!';
    titleColor = 'text-orange-400';
    badgeBg = 'bg-orange-500/20 border-orange-400';
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      {/* Confetti canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none w-full h-full" />

      <div className="relative w-full max-w-md bg-slate-900/95 border-4 border-slate-700/90 rounded-3xl p-6 text-center shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        {/* Animated Mascot / Trophy */}
        <div className="mx-auto w-24 h-24 mb-4 relative flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping opacity-75" />
          <div className={`w-20 h-20 rounded-2xl ${badgeBg} border-2 flex items-center justify-center shadow-inner`}>
            {isDraw ? (
              <Sparkles className="w-10 h-10 text-amber-400 animate-bounce" />
            ) : (
              <Trophy className={`w-10 h-10 ${titleColor} animate-bounce`} />
            )}
          </div>
        </div>

        {/* Title & Subtitle */}
        <h2 className={`text-3xl font-extrabold tracking-wide mb-2 ${titleColor}`}>
          {title}
        </h2>
        <p className="text-sm text-slate-300 mb-6 px-4">{subtitle}</p>

        {/* Action Buttons (Large, Kid-friendly) */}
        <div className="space-y-3">
          {onReviewBoard && (
            <button
              id="modal-review-btn"
              onClick={() => {
                sound.playClick();
                onReviewBoard();
              }}
              className="w-full py-3.5 px-6 rounded-2xl font-bold text-sm bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/30 flex items-center justify-center gap-2 transform active:scale-95 transition-all"
            >
              <Eye className="w-4 h-4" />
              XEM LẠI THẾ CỜ CHIẾN THẮNG
            </button>
          )}

          <button
            id="modal-play-again-btn"
            onClick={() => {
              sound.playClick();
              onPlayAgain();
            }}
            className="w-full py-4 px-6 rounded-2xl font-extrabold text-base bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 transform active:scale-95 transition-all"
          >
            <RotateCcw className="w-5 h-5" />
            CHƠI VÁN MỚI
          </button>

          <button
            id="modal-menu-btn"
            onClick={() => {
              sound.playClick();
              onBackToMenu();
            }}
            className="w-full py-3 px-6 rounded-2xl font-bold text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-2 transform active:scale-95 transition-all"
          >
            <Home className="w-4 h-4" />
            QUAY VỀ MENU CHÍNH
          </button>
        </div>
      </div>
    </div>
  );
};
