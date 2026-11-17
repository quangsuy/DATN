import React from 'react';
import { RobotInfo } from '../types';
import { Wifi, Navigation, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { BOARD_NODES } from '../game/gameRules';

interface RobotStatusCardProps {
  robot: RobotInfo;
  isActive?: boolean;
  teamColor?: string; // hex e.g. '#00ffff'
}

export const RobotStatusCard: React.FC<RobotStatusCardProps> = ({ robot, isActive = false, teamColor }) => {
  const isTeam1 = robot.team === 1;
  const colorHex = teamColor || (isTeam1 ? '#00ffff' : '#fb923c');

  // Status badge style
  const statusConfig = {
    idle: { label: 'CHỜ (IDLE)', bg: 'bg-slate-800 text-slate-300 border-slate-700', icon: CheckCircle2 },
    moving: { label: 'DI CHUYỂN', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse', icon: Navigation },
    arrived: { label: 'ĐẾN ĐÍCH', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50', icon: CheckCircle2 },
    error: { label: 'SỰ CỐ', bg: 'bg-rose-500/20 text-rose-300 border-rose-500/50', icon: AlertTriangle },
    offline: { label: 'MẤT KẾT NỐI', bg: 'bg-gray-800 text-gray-500 border-gray-700', icon: AlertTriangle },
  }[robot.status];

  const StatusIcon = statusConfig.icon;

  const nodeLabel =
    robot.currentNode !== null
      ? BOARD_NODES[robot.currentNode]?.label || `Ô #${robot.currentNode}`
      : `Bãi đỗ (${robot.team === 1 ? 'T1' : 'T2'})`;

  return (
    <div
      id={`robot-card-${robot.id}`}
      className={`rounded-2xl p-4 border transition-all duration-200 ${
        isActive
          ? 'bg-slate-800/50 border-slate-500 ring-2 ring-slate-400/30 shadow-lg'
          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
      }`}
      style={isActive ? { borderColor: colorHex + '99', boxShadow: `0 0 16px ${colorHex}22` } : {}}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          {/* Team color dot */}
          <div
            className="w-3.5 h-3.5 rounded-full ring-4"
            style={{ backgroundColor: colorHex, boxShadow: `0 0 6px ${colorHex}`, ringColor: colorHex + '33' }}
          />
          <div>
            <h4 className="font-bold text-sm tracking-wide text-white">
              ROBOT #{String(robot.id).padStart(2, '0')}
            </h4>
            <span className="text-[11px] text-slate-400">
              {isTeam1 ? 'Đội 1 (Người chơi 1)' : 'Đội 2 (Người chơi 2/AI)'}
            </span>
          </div>
        </div>

        {/* Status Badge */}
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusConfig.bg}`}
        >
          <StatusIcon className="w-3 h-3" />
          {statusConfig.label}
        </span>
      </div>

      {/* Metrics Grid — vị trí + 5 LED dots */}
      <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-3">
        {/* Current Node */}
        <div className="bg-slate-950/60 rounded-xl p-2 border border-slate-800/80">
          <span className="text-slate-400 text-[10px] block">Vị trí hiện tại:</span>
          <span className="font-bold text-emerald-400 text-sm">{nodeLabel}</span>
        </div>

        {/* 5 LED dots preview */}
        <div className="bg-slate-950/60 rounded-xl p-2 border border-slate-800/80">
          <span className="text-slate-400 text-[10px] block">LED xe (×5):</span>
          <div className="flex items-center gap-1 mt-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-full"
                style={{
                  backgroundColor: colorHex,
                  boxShadow: `0 0 4px ${colorHex}`,
                  opacity: 0.85 + i * 0.03,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Hardware Link Footer */}
      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-1.5">
          <Wifi className="w-3 h-3 text-sky-400" />
          <span>ESP-NOW: {robot.signalDbm} dBm</span>
        </div>
        <span className="text-slate-500">MAC: {robot.macAddress}</span>
      </div>
    </div>
  );
};
