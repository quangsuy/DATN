import React from 'react';
import { RobotInfo } from '../types';

interface RobotPieceProps {
  robot: RobotInfo;
  isSelected?: boolean;
  isMoving?: boolean;
  headingAngle?: number; // rotation in degrees
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  /** MÃ u LED Ä‘á»™i (hex). Náº¿u khÃ´ng truyá»n sáº½ dÃ¹ng mÃ u máº·c Ä‘á»‹nh cyan/orange */
  teamColor?: string;
}

export const RobotPiece: React.FC<RobotPieceProps> = ({
  robot,
  isSelected = false,
  isMoving = false,
  headingAngle = 0,
  onClick,
  size = 'md',
  teamColor,
}) => {
  const isTeam1 = robot.team === 1;

  // Size specs
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-14 h-14 sm:w-16 sm:h-16',
    lg: 'w-20 h-20',
  }[size];

  // MÃ u Ä‘á»™ng: Æ°u tiÃªn prop teamColor, fallback sang default cyan/orange
  const mainColor = teamColor || (isTeam1 ? '#06b6d4' : '#f97316');

  // TÃ­nh darkColor / lightColor tá»± Ä‘á»™ng tá»« mainColor
  const hexToRgb = (hex: string) => {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  };
  const rgb = hexToRgb(mainColor);
  // Dark = giáº£m Ä‘á»™ sÃ¡ng 60%
  const darkColor = `rgb(${Math.round(rgb.r * 0.4)}, ${Math.round(rgb.g * 0.4)}, ${Math.round(rgb.b * 0.4)})`;
  // Light = tÄƒng sÃ¡ng (pha tráº¯ng)
  const lightColor = `rgb(${Math.min(255, Math.round(rgb.r * 0.7 + 180))}, ${Math.min(255, Math.round(rgb.g * 0.7 + 180))}, ${Math.min(255, Math.round(rgb.b * 0.7 + 180))})`;
  const glowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)`;

  return (
    <div
      id={`robot-piece-${robot.id}`}
      onClick={onClick}
      className={`relative cursor-pointer transition-transform duration-200 select-none flex items-center justify-center ${sizeClasses} ${
        isSelected ? 'scale-115 -translate-y-1.5' : 'hover:scale-105'
      }`}
      style={{
        filter: isSelected
          ? `drop-shadow(0 0 12px ${glowColor}) drop-shadow(0 4px 8px rgba(0,0,0,0.5))`
          : 'drop-shadow(0 4px 6px rgba(0,0,0,0.4))',
      }}
    >
      {/* Animated selection halo */}
      {isSelected && (
        <div
          className="absolute -inset-2 rounded-full border-2 border-dashed animate-spin"
          style={{ borderColor: lightColor, animationDuration: '4s' }}
        />
      )}

      {/* Cute Vehicle SVG */}
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full transform transition-transform duration-300"
        style={{ transform: `rotate(${headingAngle}deg)` }}
      >
        <defs>
          {/* Main Body Gradient â€” dÃ¹ng teamColor */}
          <linearGradient id={`grad-body-${robot.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={lightColor} />
            <stop offset="60%" stopColor={mainColor} />
            <stop offset="100%" stopColor={darkColor} />
          </linearGradient>

          {/* Roof Dome Gradient */}
          <radialGradient id={`grad-dome-${robot.id}`} cx="50%" cy="40%" r="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#d1d5db" />
            <stop offset="100%" stopColor="#6b7280" />
          </radialGradient>
        </defs>

        {/* 4 Wheels */}
        {/* Front Left */}
        <rect x="12" y="18" width="12" height="22" rx="5" fill="#1e293b" stroke="#475569" strokeWidth="2" className={isMoving ? 'animate-pulse' : ''} />
        {/* Front Right */}
        <rect x="76" y="18" width="12" height="22" rx="5" fill="#1e293b" stroke="#475569" strokeWidth="2" className={isMoving ? 'animate-pulse' : ''} />
        {/* Rear Left */}
        <rect x="12" y="60" width="12" height="22" rx="5" fill="#1e293b" stroke="#475569" strokeWidth="2" className={isMoving ? 'animate-pulse' : ''} />
        {/* Rear Right */}
        <rect x="76" y="60" width="12" height="22" rx="5" fill="#1e293b" stroke="#475569" strokeWidth="2" className={isMoving ? 'animate-pulse' : ''} />

        {/* Wheel Treads */}
        <line x1="12" y1="29" x2="24" y2="29" stroke="#64748b" strokeWidth="2" />
        <line x1="76" y1="29" x2="88" y2="29" stroke="#64748b" strokeWidth="2" />
        <line x1="12" y1="71" x2="24" y2="71" stroke="#64748b" strokeWidth="2" />
        <line x1="76" y1="71" x2="88" y2="71" stroke="#64748b" strokeWidth="2" />

        {/* Chassis / Rover Main Rounded Body */}
        <rect x="20" y="14" width="60" height="72" rx="18" fill={`url(#grad-body-${robot.id})`} stroke="#ffffff" strokeWidth="2.5" />

        {/* Bumper Front Bar */}
        <rect x="28" y="11" width="44" height="6" rx="3" fill="#0f172a" />

        {/* Front Headlights */}
        <circle cx="32" cy="19" r="4.5" fill="#fef08a" />
        <circle cx="68" cy="19" r="4.5" fill="#fef08a" />
        {isMoving && (
          <>
            <polygon points="28,14 18,-6 42,-6" fill="rgba(254, 240, 138, 0.35)" />
            <polygon points="68,14 58,-6 82,-6" fill="rgba(254, 240, 138, 0.35)" />
          </>
        )}

        {/* Cute Face Screen (Black Visor) */}
        <rect x="28" y="28" width="44" height="26" rx="8" fill="#090d16" stroke="#334155" strokeWidth="1.5" />

        {/* Digital Cute LED Eyes */}
        {isMoving ? (
          <>
            <ellipse cx="40" cy="41" rx="5" ry="4" fill="#38bdf8" />
            <ellipse cx="60" cy="41" rx="5" ry="4" fill="#38bdf8" />
            <circle cx="41" cy="40" r="1.5" fill="#ffffff" />
            <circle cx="61" cy="40" r="1.5" fill="#ffffff" />
          </>
        ) : (
          <>
            <ellipse cx="40" cy="41" rx="5" ry="6" fill="#38bdf8" />
            <ellipse cx="60" cy="41" rx="5" ry="6" fill="#38bdf8" />
            <circle cx="39" cy="39" r="1.8" fill="#ffffff" />
            <circle cx="59" cy="39" r="1.8" fill="#ffffff" />
            {/* Cute smile */}
            <path d="M 46 48 Q 50 51 54 48" stroke="#38bdf8" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </>
        )}

        {/* Roof Dome / Camera Sensor */}
        <circle cx="50" cy="67" r="11" fill={`url(#grad-dome-${robot.id})`} stroke="#0f172a" strokeWidth="1.5" />

        {/* 5 LED strip dots trÃªn mÃ¡i xe â€” hiá»ƒn thá»‹ mÃ u Ä‘á»™i */}
        {[-8, -4, 0, 4, 8].map((offset, i) => (
          <circle
            key={i}
            cx={50 + offset}
            cy={58}
            r={1.6}
            fill={isMoving ? '#ef4444' : mainColor}
            className={isMoving ? 'animate-ping' : ''}
            style={{ filter: `drop-shadow(0 0 2px ${mainColor})` }}
          />
        ))}

        {/* Rover ID Tag */}
        <rect x="36" y="81" width="28" height="10" rx="4" fill="#0f172a" />
        <text x="50" y="88.5" fill="#ffffff" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
          #{String(robot.id).padStart(2, '0')}
        </text>
      </svg>

      {/* LED strip indicator bar dÆ°á»›i xe â€” thay tháº¿ battery bar */}
      <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 flex gap-0.5">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: mainColor,
              boxShadow: `0 0 3px ${mainColor}`,
              opacity: isMoving ? 0.5 + (i % 2) * 0.5 : 0.8,
            }}
          />
        ))}
      </div>
    </div>
  );
};

