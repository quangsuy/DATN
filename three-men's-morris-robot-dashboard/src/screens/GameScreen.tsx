import React, { useState, useEffect, useRef } from 'react';
import { GameMode, PlayerColor, RobotInfo, GamePhase, MoveStep, AStarLog, MinimaxLog, TeamColors } from '../types';
import { Board } from '../components/Board';
import { CameraStream } from '../components/CameraStream';
import { VictoryModal } from '../components/VictoryModal';
import { BOARD_NODES, getValidDestinations } from '../game/gameRules';
import { wsService } from '../network/websocket';
import { sound } from '../utils/sound';
import {
  RotateCcw,
  ArrowLeft,
  Bot,
  User,
  Volume2,
  VolumeX,
  Gauge,
  Sparkles,
  Navigation,
  Radio,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface GameScreenProps {
  gameMode: GameMode;
  playerColor: PlayerColor;
  firstPlayer: 1 | 2;
  soundEnabled: boolean;
  teamColors: TeamColors;
  onToggleSound: () => void;
  onBackToMenu: () => void;
  onOpenDashboard: () => void;
}

export const GameScreen: React.FC<GameScreenProps> = ({
  gameMode,
  playerColor,
  firstPlayer,
  soundEnabled,
  teamColors,
  onToggleSound,
  onBackToMenu,
  onOpenDashboard,
}) => {
  // Game states
  const [board, setBoard] = useState<(number | null)[]>(Array(9).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState<1 | 2>(firstPlayer);
  const [phase, setPhase] = useState<GamePhase>('drop');
  const [turnCount, setTurnCount] = useState<number>(1);
  const [winner, setWinner] = useState<1 | 2 | null>(null);
  const [winningLine, setWinningLine] = useState<number[] | null>(null);
  const [isDraw, setIsDraw] = useState<boolean>(false);
  const [showVictoryModal, setShowVictoryModal] = useState<boolean>(false);

  // 6 Autonomous Vehicles state
  const [robots, setRobots] = useState<RobotInfo[]>([
    // Team 1 (Player 1)
    { id: 1, team: 1, name: 'Rover-01', status: 'idle', currentNode: null, targetNode: null, signalDbm: -42, macAddress: '70:4B:CA:6D:8F:AC', speedPwm: 180, firmwareVersion: 'v2.4' },
    { id: 2, team: 1, name: 'Rover-02', status: 'idle', currentNode: null, targetNode: null, signalDbm: -45, macAddress: 'A8:42:E3:4A:29:AC', speedPwm: 180, firmwareVersion: 'v2.4' },
    { id: 3, team: 1, name: 'Rover-03', status: 'idle', currentNode: null, targetNode: null, signalDbm: -39, macAddress: 'CC:DB:A7:2D:D6:4C', speedPwm: 180, firmwareVersion: 'v2.4' },
    // Team 2 (Player 2 or AI)
    { id: 4, team: 2, name: 'Rover-04', status: 'idle', currentNode: null, targetNode: null, signalDbm: -41, macAddress: 'F0:08:D1:7C:13:D8', speedPwm: 180, firmwareVersion: 'v2.4' },
    { id: 5, team: 2, name: 'Rover-05', status: 'idle', currentNode: null, targetNode: null, signalDbm: -44, macAddress: '04:83:08:59:43:6C', speedPwm: 180, firmwareVersion: 'v2.4' },
    { id: 6, team: 2, name: 'Rover-06', status: 'idle', currentNode: null, targetNode: null, signalDbm: -40, macAddress: 'B0:3F:D3:5B:44:60', speedPwm: 180, firmwareVersion: 'v2.4' },
  ]);

  // UI Selection & Movement Animation states
  const [selectedRobotId, setSelectedRobotId] = useState<number | null>(null);
  const [validDestinations, setValidDestinations] = useState<number[]>([]);
  const [activeMoveStep, setActiveMoveStep] = useState<MoveStep | null>(null);
  const [animatedRobotPos, setAnimatedRobotPos] = useState<{ x: number; y: number; angle: number } | null>(null);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [showTechnicalHUD, setShowTechnicalHUD] = useState<boolean>(false);
  const [lastAStarLog, setLastAStarLog] = useState<AStarLog | null>(null);
  const [lastMinimaxLog, setLastMinimaxLog] = useState<MinimaxLog | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<string>('Hệ thống sẵn sàng');

  const animationTimerRef = useRef<any>(null);
  const robotsRef = useRef<RobotInfo[]>(robots);

  useEffect(() => {
    robotsRef.current = robots;
  }, [robots]);

  // Check how many pieces placed
  // Phase tu backend la nguon chinh xac, khong tu dem quan
  const isDropPhase = phase === 'drop';
  const humanTeam: 1 | 2 = playerColor === 'cyan' ? 1 : 2;

  // The backend is authoritative. The browser only animates confirmed events.
  useEffect(() => {
    const unsubscribe = wsService.subscribe((event) => {
      if (event.type === 'game_state') {
        setBoard(event.board);
        setCurrentPlayer(event.current_player);
        setPhase(event.phase);
        setTurnCount(event.turn_count);
        setWinner(event.winner);
        setWinningLine(event.winning_line);
        if (event.winner) {
          setTimeout(() => setShowVictoryModal(true), 1500);
        } else {
          setShowVictoryModal(false);
        }
        setIsAiThinking(false);
        setPipelineStatus(event.winner ? 'VÁN CỜ ĐÃ KẾT THÚC' : 'HỆ THỐNG SẴN SÀNG');
        // Re-derive robots currentNode from authoritative board so frontend
        // and backend stay in sync even after evasion / restore sequences.
        setRobots((prev) => {
          // Build a map: board node -> team that owns it
          const nodeTeam: Record<number, number> = {};
          event.board.forEach((cell, idx) => {
            if (cell !== null) nodeTeam[idx] = cell as number;
          });
          return prev.map((r) => {
            // If the robot is currently on a node that still has its team's piece,
            // keep currentNode; otherwise we may need to wait for robot_status.
            if (r.currentNode !== null && nodeTeam[r.currentNode] === r.team) {
              return r; // unchanged
            }
            // Robot moved away or position is stale — keep as-is, robot_status
            // events will provide the authoritative update.
            return r;
          });
        });
      }

      if (event.type === 'game_over') {
        setBoard(event.board);
        setWinningLine(event.winning_line);
        setIsAiThinking(false);
        setActiveMoveStep(null);
        setAnimatedRobotPos(null);
        setPipelineStatus(`VÁN CỜ KẾT THÚC - ĐỘI ${event.winner === 1 ? 'XANH' : 'CAM'} THẮNG`);
        // Đợi 1500ms (1.5s) cho xe chạy xong animation / chạy đến đích vật lý
        setTimeout(() => {
          setWinner(event.winner);
          setPhase('game_over');
          setShowVictoryModal(true);
        }, 1500);
      }

      if (event.type === 'ai_thinking') {
        setIsAiThinking(true);
        setPipelineStatus('AI MINIMAX ĐANG TÍNH TOÁN');
        sound.playAiThink();
      }

      if (event.type === 'ai_decision') {
        setIsAiThinking(false);
        setPipelineStatus(`AI CHỌN XE #${event.robot_id} -> Ô #${event.to}`);
        setLastMinimaxLog({
          evalScore: event.eval_score,
          depth: event.depth ?? 8,
          nodesSearched: event.nodes_searched,
          chosenPiece: event.robot_id,
          chosenMove: { from: event.from, to: event.to },
          calcTimeMs: event.calc_ms,
        });
      }

      if (event.type === 'evasion_step') {
        const isPush = event.action === 'push' || event.action === 'clear_bay_entrance';
        const label = isPush
          ? `NÉ ĐƯỜNG: XE #${event.robot_id} dời sang ô #${event.to_node}`
          : `KHÔI PHỤC: XE #${event.robot_id} về ô #${event.to_node}`;
        setPipelineStatus(label);
        wsService.addLog('info', label);
      }

      if (event.type === 'astar_result') {
        setLastAStarLog({
          startNode: event.start,
          goalNode: event.goal,
          exploredNodes: [],
          finalPath: event.path,
          cost: event.cost,
          calcTimeMs: event.calc_ms,
        });
        setPipelineStatus(
          event.planner === 'direct_edge'
            ? `ĐƯỜNG CẠNH HỢP LỆ: ${event.path.join(' -> ')}`
            : `A* ĐÃ TÌM ĐƯỜNG: ${event.path.join(' -> ')}`,
        );
      }

      if (event.type === 'move_start') {
        const robot = robotsRef.current.find((item) => item.id === event.robot_id);
        if (!robot) return;
        const waypoints = event.waypoints.map((point, index) => ({
          id: `server-wp-${index}`,
          x: 18 + (point.x / 200) * 64,
          y: 18 + (point.y / 200) * 64,
          label: point.label,
        }));
        const moveStep: MoveStep = {
          robotId: event.robot_id,
          fromNode: typeof event.start === 'number' ? event.start : null,
          toNode: Number(event.goal),
          waypoints,
          currentWaypointIndex: 0,
          isCompleted: false,
        };
        setActiveMoveStep(moveStep);
        setPipelineStatus(`XE #${event.robot_id} ĐANG DI CHUYỂN`);
        sound.playRoverDrive();
        let waypointIndex = 0;
        let subStep = 0;
        const segmentCount = Math.max(1, waypoints.length - 1);
        const stepSubdivision = Math.max(
          14,
          Math.ceil(((event.duration_ms ?? 1400) / 35) / segmentCount),
        );
        setAnimatedRobotPos({ x: waypoints[0]?.x ?? 50, y: waypoints[0]?.y ?? 50, angle: 0 });
        if (animationTimerRef.current) clearInterval(animationTimerRef.current);
        animationTimerRef.current = setInterval(() => {
          if (waypointIndex >= waypoints.length - 1) return;
          const start = waypoints[waypointIndex];
          const end = waypoints[waypointIndex + 1];
          subStep += 1;
          const progress = Math.min(1, subStep / stepSubdivision);
          setAnimatedRobotPos({
            x: start.x + (end.x - start.x) * progress,
            y: start.y + (end.y - start.y) * progress,
            angle: (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI + 90,
          });
          if (subStep >= stepSubdivision) {
            subStep = 0;
            waypointIndex += 1;
            setActiveMoveStep((previous) => previous ? { ...previous, currentWaypointIndex: waypointIndex } : null);
          }
        }, 35);
      }

      if (event.type === 'robot_status') {
        setRobots((previous) => previous.map((robot) => {
          if (robot.id !== event.robot_id) return robot;
          // position is a node number string ("0".."8"), "BAY", or "MOVING"/"UNKNOWN"
          const parsedNode = /^\d+$/.test(event.position) ? Number(event.position) : null;
          const isOnBay = event.position === 'BAY';
          return {
            ...robot,
            status: event.status,
            // If position is explicitly "BAY" → null (off board).
            // If position is a digit → that node.
            // If "MOVING" / "UNKNOWN" → keep previous currentNode.
            currentNode: isOnBay ? null : parsedNode !== null ? parsedNode : robot.currentNode,
            targetNode: event.status === 'moving' ? robot.targetNode : null,
            battery: event.battery ?? robot.battery,
            speedPwm: event.speed_pwm ?? robot.speedPwm,
          };
        }));
      }

      if (event.type === 'move_complete') {
        // auxiliary=true means this is an evasion sub-move (blocker moved aside
        // or restored). Update the board snapshot and robot position but do NOT
        // clear the primary activeMoveStep or the animation timer — the main
        // move is still in flight.
        if (event.auxiliary) {
          setBoard(event.board);
          // Sync the displaced robot's currentNode from robot_status events;
          // we just keep the primary animation running here.
          setPipelineStatus(`XE #${event.robot_id} (hỗ trợ) → Ô #${event.goal}`);
          return;
        }
        // Primary move completed.
        if (animationTimerRef.current) clearInterval(animationTimerRef.current);
        setBoard(event.board);
        setActiveMoveStep(null);
        setAnimatedRobotPos(null);
        setSelectedRobotId(null);
        setValidDestinations([]);
        setPipelineStatus(`XE #${event.robot_id} ĐÃ TỚI Ô #${event.goal}`);
        sound.playArrive();
        // Sync the moved robot's currentNode so it can be clicked/selected again
        const arrivedGoal = typeof event.goal === 'number' ? event.goal : parseInt(String(event.goal), 10);
        if (!isNaN(arrivedGoal)) {
          setRobots((prev) =>
            prev.map((r) =>
              r.id === event.robot_id
                ? { ...r, status: 'arrived', currentNode: arrivedGoal, targetNode: null }
                : r
            )
          );
        }
      }

      if (event.type === 'fault') {
        setIsAiThinking(false);
        setActiveMoveStep(null);
        setAnimatedRobotPos(null);
        // Clear selection so the player can pick a different piece / node
        setSelectedRobotId(null);
        setValidDestinations([]);
        if (animationTimerRef.current) clearInterval(animationTimerRef.current);
        setPipelineStatus(`LỖI HỆ THỐNG: ${event.message}`);
        sound.playError();
      }
    });

    if (!wsService.isSimulated) {
      wsService.connect();
    }
    wsService.send({ type: 'join_game', mode: gameMode, player_team: humanTeam, first_player: firstPlayer });

    // Gửi màu LED cho cả 2 đội ngay khi bắt đầu game
    const hexToRgb = (hex: string) => {
      const h = hex.replace('#', '');
      return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
      };
    };
    const c1 = hexToRgb(teamColors.team1);
    const c2 = hexToRgb(teamColors.team2);
    wsService.send({ type: 'set_team_color', team: 1, ...c1, brightness: 200 });
    wsService.send({ type: 'set_team_color', team: 2, ...c2, brightness: 200 });

    return () => {
      unsubscribe();
      wsService.disconnect();
      if (animationTimerRef.current) clearInterval(animationTimerRef.current);
    };
  }, [gameMode, humanTeam, firstPlayer]);

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (animationTimerRef.current) clearInterval(animationTimerRef.current);
    };
  }, []);

  // Handle clicking on a Robot Piece
  const handleRobotClick = (robotId: number) => {
    if (activeMoveStep !== null || isAiThinking || winner !== null) return;

    // Check if it's AI's turn in PVA
    if (gameMode === 'pva' && currentPlayer !== humanTeam) return;

    const robot = robots.find((r) => r.id === robotId);
    if (!robot) return;

    // Only allow selecting robots of current player
    if (robot.team !== currentPlayer) {
      sound.playError();
      return;
    }

    sound.playSelect();

    // If in Drop phase
    if (isDropPhase) {
      if (robot.currentNode === null) {
        // Unplaced rover in staging bay
        setSelectedRobotId(robotId);
        // Valid targets are ALL empty nodes on board
        const emptyNodes = board
          .map((val, idx) => (val === null ? idx : -1))
          .filter((idx) => idx !== -1);
        setValidDestinations(emptyNodes);
      } else {
        // Can't move already placed pieces during drop phase
        sound.playError();
      }
    } else {
      // In Movement phase
      if (robot.currentNode !== null) {
        setSelectedRobotId(robotId);
        const legalDests = getValidDestinations(robot.currentNode, board);
        setValidDestinations(legalDests);
        if (legalDests.length === 0) {
          wsService.addLog('warn', `Xe #${robotId} bị chặn, không có đường đi hợp lệ.`);
        }
      }
    }
  };

  // Handle clicking on a Board Node
  const handleNodeClick = (nodeId: number) => {
    if (activeMoveStep !== null || isAiThinking || winner !== null) return;
    if (gameMode === 'pva' && currentPlayer !== humanTeam) return;

    // Nếu người chơi click vào một ô đang có xe của chính đội mình -> chọn xe đó
    const robotAtClickedNode = robots.find((r) => r.currentNode === nodeId);
    if (robotAtClickedNode && robotAtClickedNode.team === currentPlayer && !isDropPhase) {
      handleRobotClick(robotAtClickedNode.id);
      return;
    }

    // Nếu đang ở giai đoạn Đặt quân (Drop phase) mà người chơi ấn thẳng vào ô trống
    // trên bàn cờ (chưa ấn chọn xe ở bãi đỗ) -> tự động lấy xe đầu tiên còn trong bãi đỗ của đội đó!
    if (selectedRobotId === null) {
      if (isDropPhase && board[nodeId] === null) {
        const autoBayRobot = robots.find((r) => r.team === currentPlayer && r.currentNode === null);
        if (!autoBayRobot) {
          sound.playError();
          return;
        }
        sound.playSelect();
        setSelectedRobotId(autoBayRobot.id);
        wsService.send({
          type: 'select_move',
          player: currentPlayer,
          robot_id: autoBayRobot.id,
          from_node: null,
          to_node: nodeId,
        });
        setPipelineStatus(`ĐÃ GỬI YÊU CẦU XE #${autoBayRobot.id} -> Ô #${nodeId}`);
      }
      return;
    }

    // Must be a valid destination
    if (!validDestinations.includes(nodeId)) {
      sound.playError();
      return;
    }

    const selectedRobot = robots.find((r) => r.id === selectedRobotId);
    if (!selectedRobot) return;

    wsService.send({
      type: 'select_move',
      player: currentPlayer,
      robot_id: selectedRobot.id,
      from_node: selectedRobot.currentNode,
      to_node: nodeId,
    });
    setPipelineStatus(`ĐÃ GỬI YÊU CẦU XE #${selectedRobot.id} -> Ô #${nodeId}`);
  };

  // Restart match
  const handleRestart = () => {
    if (animationTimerRef.current) clearInterval(animationTimerRef.current);
    setBoard(Array(9).fill(null));
    setCurrentPlayer(firstPlayer);
    setPhase('drop');
    setTurnCount(1);
    setWinner(null);
    setWinningLine(null);
    setIsDraw(false);
    setShowVictoryModal(false);
    setSelectedRobotId(null);
    setValidDestinations([]);
    setActiveMoveStep(null);
    setAnimatedRobotPos(null);
    setIsAiThinking(false);
    setPipelineStatus('Ván mới đã bắt đầu');

    // Reset 6 robots back to bays
    setRobots((prev) =>
      prev.map((r) => ({
        ...r,
        status: 'idle',
        currentNode: null,
        targetNode: null,
      }))
    );

    wsService.send({ type: 'reset_game' });
    wsService.addLog('info', 'Đã thiết lập lại ván cờ mới.');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-3 sm:p-5 select-none relative overflow-x-hidden">
      {/* Top Header Bar */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between z-20 pb-2">
        <div className="flex items-center gap-3">
          <button
            id="game-back-menu-btn"
            onClick={() => {
              sound.playClick();
              onBackToMenu();
            }}
            className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white flex items-center gap-1.5 text-xs font-bold transition-all active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">MENU</span>
          </button>

          {/* Current Turn Badge */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3.5 py-1.5 rounded-2xl">
            <div
              className={`w-3 h-3 rounded-full ${
                currentPlayer === 1 ? 'bg-cyan-400 ring-4 ring-cyan-500/20' : 'bg-orange-400 ring-4 ring-orange-500/20'
              }`}
            />
            <span className="text-xs font-bold font-mono">
              LƯỢT:{' '}
              {currentPlayer === 1
                ? 'ĐỘI XANH (P1)'
                : gameMode === 'pva'
                ? 'ĐỘI CAM (AI)'
                : 'ĐỘI CAM (P2)'}
            </span>
            <span className="text-[10px] text-slate-400 ml-1">
              ({isDropPhase ? 'Đặt xe vào ô' : 'Di chuyển xe'})
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Toggle Technical HUD */}
          <button
            id="toggle-hud-btn"
            onClick={() => {
              sound.playClick();
              setShowTechnicalHUD(!showTechnicalHUD);
            }}
            className={`p-2.5 rounded-2xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
              showTechnicalHUD
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Gauge className="w-4 h-4" />
            <span className="hidden md:inline">DEBUG HUD</span>
          </button>

          {/* Sound Toggle */}
          <button
            id="game-sound-btn"
            onClick={() => {
              sound.playClick();
              onToggleSound();
            }}
            className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-all"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-rose-400" />}
          </button>

          {/* Restart */}
          <button
            id="game-restart-btn"
            onClick={() => {
              sound.playClick();
              handleRestart();
            }}
            className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white flex items-center gap-1 text-xs font-semibold transition-all active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">CHƠI LẠI</span>
          </button>
        </div>
      </header>

      {/* Real-time Movement & System Status Bar (Reflects physical robot state) */}
      <div className="w-full max-w-3xl mx-auto my-1 z-10">
        <div
          className={`rounded-2xl p-3 border transition-all flex items-center justify-between ${
            activeMoveStep
              ? 'bg-amber-950/40 border-amber-500 text-amber-200 shadow-lg shadow-amber-950/50'
              : isAiThinking
              ? 'bg-orange-950/40 border-orange-500 text-orange-200 shadow-lg'
              : 'bg-slate-900/80 border-slate-800 text-slate-300'
          }`}
        >
          <div className="flex items-center gap-3">
            {activeMoveStep ? (
              <Navigation className="w-5 h-5 text-amber-400 animate-spin" style={{ animationDuration: '3s' }} />
            ) : isAiThinking ? (
              <Bot className="w-5 h-5 text-orange-400 animate-bounce" />
            ) : (
              <Radio className="w-5 h-5 text-cyan-400" />
            )}

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-wide uppercase font-mono">
                  {pipelineStatus}
                </span>
                {activeMoveStep && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                    ROBOT #{activeMoveStep.robotId}
                  </span>
                )}
              </div>
              {/* Waypoint sequence breadcrumb */}
              {activeMoveStep && (
                <div className="flex items-center gap-1 text-[11px] text-amber-300/80 font-mono mt-0.5">
                  {activeMoveStep.waypoints.map((wp, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <span
                        className={`px-1.5 py-0.2 rounded ${
                          i === activeMoveStep.currentWaypointIndex
                            ? 'bg-amber-400 text-slate-950 font-bold'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {wp.label || wp.id}
                      </span>
                      {i < activeMoveStep.waypoints.length - 1 && <span>→</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Current Turn counter */}
          <div className="text-right font-mono">
            <span className="text-[10px] text-slate-400 block">NƯỚC ĐI</span>
            <span className="text-sm font-bold text-white">#{turnCount}</span>
          </div>
        </div>
      </div>

      {/* Central Arena Board Area */}
      <main className="w-full max-w-7xl flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)] gap-5 items-start mx-auto relative z-10 py-1">
        <section className="min-w-0 flex flex-col items-center justify-center">
          <Board
            board={board}
            robots={robots}
            selectedRobotId={selectedRobotId}
            validDestinations={validDestinations}
            activeMoveStep={activeMoveStep}
            animatedRobotPos={animatedRobotPos}
            winningLine={winningLine}
            phase={phase}
            currentPlayer={currentPlayer}
            isAiThinking={isAiThinking}
            teamColors={teamColors}
            onNodeClick={handleNodeClick}
            onRobotClick={handleRobotClick}
          />

          {/* Technical HUD Overlay (When enabled) */}
          {showTechnicalHUD && (
            <div className="w-full max-w-2xl mt-2 p-3 bg-slate-900/90 border border-slate-800 rounded-2xl text-xs font-mono grid grid-cols-2 sm:grid-cols-4 gap-2 animate-in fade-in">
            <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Minimax Đánh giá:</span>
              <span className="font-bold text-cyan-400">
                {lastMinimaxLog ? `${lastMinimaxLog.evalScore} pts (${lastMinimaxLog.calcTimeMs}ms)` : 'Chưa chạy'}
              </span>
            </div>
            <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">A* Chi phí đường:</span>
              <span className="font-bold text-emerald-400">
                {lastAStarLog ? `${lastAStarLog.cost} cost (${lastAStarLog.calcTimeMs}ms)` : 'Chưa chạy'}
              </span>
            </div>
            <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">A* Nút đã duyệt:</span>
              <span className="font-bold text-amber-400">
                {lastAStarLog ? `${lastAStarLog.exploredNodes.length} nodes` : 'N/A'}
              </span>
            </div>
            <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">ESP-NOW RF Link:</span>
              <span className="font-bold text-teal-400">6 Peers • 0 Drop</span>
            </div>
            </div>
          )}
        </section>
        <div className="w-full lg:sticky lg:top-4">
          <CameraStream />
        </div>
      </main>

      {/* Bottom Kid-Friendly Instructions Banner */}
      <footer className="w-full max-w-2xl mx-auto z-10 pt-2">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs">
              💡
            </div>
            <span className="text-slate-300 font-medium">
              {isDropPhase
                ? 'Giai đoạn 1: Chạm vào xe trong bãi đỗ, sau đó chạm vào ô trống trên bàn cờ.'
                : 'Giai đoạn 2: Chạm vào quân cờ của bạn, sau đó chạm vào ô nối liền kề để xe di chuyển.'}
            </span>
          </div>

          <button
            id="view-dashboard-quick-btn"
            onClick={() => {
              sound.playClick();
              onOpenDashboard();
            }}
            className="text-xs font-bold text-cyan-400 hover:text-cyan-300 underline whitespace-nowrap ml-3"
          >
            Mở Dashboard
          </button>
        </div>
      </footer>

      {/* Victory / Draw Celebration Modal */}
      {winner !== null && showVictoryModal && (
        <VictoryModal
          winner={winner}
          isDraw={isDraw}
          gameMode={gameMode}
          onPlayAgain={handleRestart}
          onBackToMenu={onBackToMenu}
          onReviewBoard={() => setShowVictoryModal(false)}
        />
      )}

      {/* Floating button to re-open victory modal if user dismissed it to inspect board */}
      {winner !== null && !showVictoryModal && (
        <div className="fixed bottom-6 right-6 z-40 animate-bounce">
          <button
            onClick={() => setShowVictoryModal(true)}
            className="px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-bold text-sm shadow-xl flex items-center gap-2 border border-emerald-300"
          >
            🏆 Xem Bảng Kết Quả
          </button>
        </div>
      )}
    </div>
  );
};
