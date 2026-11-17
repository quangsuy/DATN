import React from 'react';
import { BOARD_NODES, BOARD_LINES, STAGING_BAYS } from '../game/gameRules';
import { RobotInfo, MoveStep, GamePhase, TeamColors } from '../types';
import { RobotPiece } from './RobotPiece';
import { AStarPathVisualizer } from './AStarPathVisualizer';

interface BoardProps {
  board: (number | null)[];
  robots: RobotInfo[];
  selectedRobotId: number | null;
  validDestinations: number[];
  activeMoveStep: MoveStep | null;
  animatedRobotPos: { x: number; y: number; angle: number } | null;
  winningLine: number[] | null;
  phase: GamePhase;
  currentPlayer: 1 | 2;
  isAiThinking: boolean;
  teamColors?: TeamColors;
  onNodeClick: (nodeId: number) => void;
  onRobotClick: (robotId: number) => void;
}

export const Board: React.FC<BoardProps> = ({
  board,
  robots,
  selectedRobotId,
  validDestinations,
  activeMoveStep,
  animatedRobotPos,
  winningLine,
  phase,
  currentPlayer,
  isAiThinking,
  teamColors,
  onNodeClick,
  onRobotClick,
}) => {
  // Find robot at a specific board node
  const getRobotAtNode = (nodeId: number): RobotInfo | undefined => {
    return robots.find((r) => r.currentNode === nodeId && r.status !== 'moving');
  };

  // Find robot currently moving
  const movingRobot = activeMoveStep
    ? robots.find((r) => r.id === activeMoveStep.robotId)
    : null;

  return (
    <div className="relative w-full max-w-2xl aspect-square mx-auto select-none p-4">
      {/* Board Outer Enclosure (Industrial / Robotics Arena Look) */}
      <div className="relative w-full h-full rounded-3xl bg-slate-950/80 border-4 border-slate-800 shadow-2xl p-6 flex items-center justify-center overflow-hidden">
        {/* Subtle grid pattern background */}
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, #94a3b8 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />

        {/* Outer Arena Boundary lines */}
        <div className="absolute inset-8 rounded-2xl border-2 border-slate-800/80 pointer-events-none" />

        {/* SVG Connection Lines for Three Men's Morris */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
          viewBox="0 0 100 100"
        >
          {/* Base Connection Tracks */}
          {BOARD_LINES.map(([fromId, toId], idx) => {
            const fromNode = BOARD_NODES[fromId];
            const toNode = BOARD_NODES[toId];
            const isWinningLineSegment =
              winningLine &&
              winningLine.includes(fromId) &&
              winningLine.includes(toId);

            return (
              <g key={`line-${idx}`}>
                {/* Track groove */}
                <line
                  x1={fromNode.canvasX}
                  y1={fromNode.canvasY}
                  x2={toNode.canvasX}
                  y2={toNode.canvasY}
                  stroke="#1e293b"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                {/* Active line guide */}
                <line
                  x1={fromNode.canvasX}
                  y1={fromNode.canvasY}
                  x2={toNode.canvasX}
                  y2={toNode.canvasY}
                  stroke={isWinningLineSegment ? '#10b981' : '#334155'}
                  strokeWidth={isWinningLineSegment ? '2.5' : '1.5'}
                  strokeLinecap="round"
                  className={isWinningLineSegment ? 'animate-pulse' : ''}
                />
              </g>
            );
          })}

          {/* Staging Bay connector guide tracks to outer nodes */}
          <line x1="5" y1="22" x2="18" y2="18" stroke="#1e293b" strokeWidth="2" strokeDasharray="1,2" />
          <line x1="5" y1="50" x2="18" y2="50" stroke="#1e293b" strokeWidth="2" strokeDasharray="1,2" />
          <line x1="5" y1="78" x2="18" y2="82" stroke="#1e293b" strokeWidth="2" strokeDasharray="1,2" />
          <line x1="95" y1="22" x2="82" y2="18" stroke="#1e293b" strokeWidth="2" strokeDasharray="1,2" />
          <line x1="95" y1="50" x2="82" y2="50" stroke="#1e293b" strokeWidth="2" strokeDasharray="1,2" />
          <line x1="95" y1="78" x2="82" y2="82" stroke="#1e293b" strokeWidth="2" strokeDasharray="1,2" />
        </svg>

        {/* A* Path Visualization during movement */}
        {activeMoveStep && (
          <AStarPathVisualizer
            waypoints={activeMoveStep.waypoints}
            currentWaypointIndex={activeMoveStep.currentWaypointIndex}
            currentRobotPosition={animatedRobotPos || undefined}
            teamColor={movingRobot?.team === 1 ? (teamColors?.team1 || 'cyan') : (teamColors?.team2 || 'orange')}
          />
        )}

        {/* Staging Bays (Parking Slots for 6 Rovers) */}
        {/* Left Bays: Team 1 (Rovers 1, 2, 3) */}
        <div className="absolute left-1.5 top-0 bottom-0 flex flex-col justify-around py-8 z-10">
          {[1, 2, 3].map((id) => {
            const rover = robots.find((r) => r.id === id);
            const t1Color = teamColors?.team1 || '#06b6d4';
            if (!rover || rover.currentNode !== null || (activeMoveStep?.robotId === id && rover.status === 'moving')) {
              return (
                <div
                  key={`bay-${id}`}
                  className="w-12 h-12 rounded-xl border border-dashed flex flex-col items-center justify-center"
                  style={{ borderColor: t1Color + '60', backgroundColor: t1Color + '15' }}
                >
                  <span className="text-[9px] font-mono" style={{ color: t1Color + '80' }}>BAY-{id}</span>
                </div>
              );
            }
            return (
              <div key={`bay-${id}`} id={`staging-bay-${id}`} className="relative">
                <RobotPiece
                  robot={rover}
                  isSelected={selectedRobotId === id}
                  size="sm"
                  teamColor={t1Color}
                  onClick={() => onRobotClick(id)}
                />
                <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[9px] font-bold font-mono" style={{ color: t1Color }}>
                  XE #{id}
                </span>
              </div>
            );
          })}
        </div>

        {/* Right Bays: Team 2 (Rovers 4, 5, 6) */}
        <div className="absolute right-1.5 top-0 bottom-0 flex flex-col justify-around py-8 z-10">
          {[4, 5, 6].map((id) => {
            const rover = robots.find((r) => r.id === id);
            const t2Color = teamColors?.team2 || '#f97316';
            if (!rover || rover.currentNode !== null || (activeMoveStep?.robotId === id && rover.status === 'moving')) {
              return (
                <div
                  key={`bay-${id}`}
                  className="w-12 h-12 rounded-xl border border-dashed flex flex-col items-center justify-center"
                  style={{ borderColor: t2Color + '60', backgroundColor: t2Color + '15' }}
                >
                  <span className="text-[9px] font-mono" style={{ color: t2Color + '80' }}>BAY-{id}</span>
                </div>
              );
            }
            return (
              <div key={`bay-${id}`} id={`staging-bay-${id}`} className="relative">
                <RobotPiece
                  robot={rover}
                  isSelected={selectedRobotId === id}
                  size="sm"
                  teamColor={t2Color}
                  onClick={() => onRobotClick(id)}
                />
                <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[9px] font-bold font-mono" style={{ color: t2Color }}>
                  XE #{id}
                </span>
              </div>
            );
          })}
        </div>

        {/* 9 Board Nodes */}
        {BOARD_NODES.map((node) => {
          const isValidTarget = validDestinations.includes(node.id);
          const robotOnNode = getRobotAtNode(node.id);
          const isPartOfWinningLine = winningLine && winningLine.includes(node.id);

          return (
            <div
              key={node.id}
              id={`board-node-${node.id}`}
              onClick={() => onNodeClick(node.id)}
              style={{
                left: `${node.canvasX}%`,
                top: `${node.canvasY}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className={`absolute z-10 flex flex-col items-center justify-center cursor-pointer select-none transition-all duration-300 ${
                isValidTarget ? 'scale-110' : ''
              }`}
            >
              {/* Outer Circular Node Target Pad */}
              <div
                className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center transition-all ${
                  isPartOfWinningLine
                    ? 'bg-emerald-950/80 border-4 border-emerald-400 ring-4 ring-emerald-500/50 shadow-lg shadow-emerald-500/30'
                    : isValidTarget
                    ? 'bg-emerald-950/60 border-4 border-emerald-400 ring-4 ring-emerald-500/40 animate-pulse cursor-pointer shadow-lg shadow-emerald-500/40'
                    : robotOnNode
                    ? 'bg-slate-900/90 border-2 border-slate-700'
                    : 'bg-slate-900/60 border-2 border-slate-800 hover:border-slate-600'
                }`}
              >
                {/* Node Identifier Label (A1..C3) */}
                <span
                  className={`absolute top-1 text-[10px] font-mono font-bold tracking-wider ${
                    isValidTarget ? 'text-emerald-300' : 'text-slate-500'
                  }`}
                >
                  {node.label}
                </span>

                {/* Valid move target pulse icon */}
                {isValidTarget && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full bg-emerald-400/30 border-2 border-emerald-300 flex items-center justify-center animate-ping" />
                    <span className="text-[10px] font-bold text-emerald-300 z-10">ĐÍCH</span>
                  </div>
                )}

                {/* Placed Robot on this Node */}
                {robotOnNode && (
                  <RobotPiece
                    robot={robotOnNode}
                    isSelected={selectedRobotId === robotOnNode.id}
                    onClick={() => onRobotClick(robotOnNode.id)}
                    size="md"
                    teamColor={robotOnNode.team === 1 ? teamColors?.team1 : teamColors?.team2}
                  />
                )}
              </div>
            </div>
          );
        })}

        {/* Animated Robot In-Transit along A* Waypoints */}
        {movingRobot && animatedRobotPos && (
          <div
            id="active-driving-rover"
            className="absolute z-30 transition-none pointer-events-none"
            style={{
              left: `${animatedRobotPos.x}%`,
              top: `${animatedRobotPos.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <RobotPiece
              robot={movingRobot}
              isMoving={true}
              headingAngle={animatedRobotPos.angle}
              size="md"
              teamColor={movingRobot.team === 1 ? teamColors?.team1 : teamColors?.team2}
            />
          </div>
        )}

        {/* AI Thinking Overlay on Board */}
        {isAiThinking && (
          <div className="absolute inset-x-8 bottom-8 z-40 bg-slate-900/90 backdrop-blur border-2 border-orange-500/80 rounded-2xl p-3 shadow-xl flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-orange-500 animate-ping" />
              <div>
                <p className="text-sm font-bold text-orange-300">AI Minimax đang suy nghĩ...</p>
                <p className="text-xs text-slate-400 font-mono">Duyệt cây trò chơi & tính điểm heuristic</p>
              </div>
            </div>
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
