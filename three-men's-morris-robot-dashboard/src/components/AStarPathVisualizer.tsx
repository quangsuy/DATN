import React from 'react';
import { Waypoint } from '../types';

interface AStarPathVisualizerProps {
  waypoints: Waypoint[];
  currentWaypointIndex: number;
  currentRobotPosition?: { x: number; y: number };
  teamColor?: 'cyan' | 'orange';
}

export const AStarPathVisualizer: React.FC<AStarPathVisualizerProps> = ({
  waypoints,
  currentWaypointIndex,
  currentRobotPosition,
  teamColor = 'cyan',
}) => {
  if (!waypoints || waypoints.length < 2) return null;

  const strokeColor = teamColor === 'cyan' ? '#06b6d4' : '#f97316';
  const glowColor = teamColor === 'cyan' ? 'rgba(6, 182, 212, 0.4)' : 'rgba(249, 115, 22, 0.4)';

  // Build SVG polyline points string
  const pointsString = waypoints.map((wp) => `${wp.x},${wp.y}`).join(' ');

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-20" viewBox="0 0 100 100">
      <defs>
        {/* Glow filter */}
        <filter id="path-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Background Soft Glow Path */}
      <polyline
        points={pointsString}
        fill="none"
        stroke={glowColor}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Main Animated Laser Dotted Path */}
      <polyline
        points={pointsString}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.8"
        strokeDasharray="2, 2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-pulse"
        filter="url(#path-glow)"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="10"
          to="0"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </polyline>

      {/* Waypoint Markers */}
      {waypoints.map((wp, index) => {
        const isStart = index === 0;
        const isGoal = index === waypoints.length - 1;
        const isPassed = index <= currentWaypointIndex;

        let fillColor = strokeColor;
        if (isStart) fillColor = '#10b981'; // Green start
        if (isGoal) fillColor = '#e11d48'; // Red goal

        return (
          <g key={wp.id || index} transform={`translate(${wp.x}, ${wp.y})`}>
            {/* Outer pulse circle for target */}
            {isGoal && (
              <circle
                r="4"
                fill="none"
                stroke={fillColor}
                strokeWidth="0.8"
                className="animate-ping"
                opacity="0.7"
              />
            )}

            {/* Waypoint circle */}
            <circle
              r={isGoal ? 3.2 : 2.2}
              fill={isPassed ? '#334155' : fillColor}
              stroke="#ffffff"
              strokeWidth="0.8"
            />

            {/* Waypoint label text */}
            <text
              y={-4}
              fontSize="2.5"
              fill="#ffffff"
              fontWeight="bold"
              textAnchor="middle"
              className="drop-shadow"
            >
              {isStart ? 'START' : isGoal ? 'GOAL' : `WP${index}`}
            </text>
          </g>
        );
      })}

      {/* Trail particles behind robot */}
      {currentRobotPosition && (
        <g transform={`translate(${currentRobotPosition.x}, ${currentRobotPosition.y})`}>
          <circle r="6" fill={strokeColor} opacity="0.25" className="animate-ping" />
          <circle r="3.5" fill={strokeColor} opacity="0.4" />
        </g>
      )}
    </svg>
  );
};
