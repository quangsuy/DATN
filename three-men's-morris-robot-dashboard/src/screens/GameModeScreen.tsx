import React, { useState, useEffect } from 'react';
import { GameMode, PlayerColor, TeamColors } from '../types';
import {
  Users,
  Bot,
  ArrowLeft,
  Play,
  Sparkles,
  Check,
  Cpu,
  MonitorPlay,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Camera,
  Radio,
  Wifi,
  AlertTriangle,
  Crosshair,
} from 'lucide-react';
import { sound } from '../utils/sound';
import { wsService } from '../network/websocket';

interface GameModeScreenProps {
  onStartGame: (mode: GameMode, color: PlayerColor, firstPlayer: 1 | 2, teamColors: TeamColors) => void;
  onBack: () => void;
}

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

const REAL_ROBOT_MACS: Record<number, string> = {
  1: '70:4B:CA:6D:8F:AC',
  2: 'A8:42:E3:4A:29:AC',
  3: 'CC:DB:A7:2D:D6:4C',
  4: 'F0:08:D1:7C:13:D8',
  5: '04:83:08:59:43:6C',
  6: 'B0:3F:D3:5B:44:60',
};

interface RobotDiagnostic {
  robot_id: number;
  team: 1 | 2;
  espnow_ok: boolean;
  qr_seen: boolean;
  heading_deg: number | null;
}

interface PreFlightState {
  checking: boolean;
  wsConnected: boolean;
  cameraOnline: boolean;
  cameraCalibrated: boolean;
  missingCorners: number[];
  markersSeen: number[];
  coordinatorConnected: boolean;
  coordinatorDevice: string;
  coordinatorError: string | null;
  robots: RobotDiagnostic[];
}

export const GameModeScreen: React.FC<GameModeScreenProps> = ({ onStartGame, onBack }) => {
  const [selectedMode, setSelectedMode] = useState<GameMode>('pva');
  const [selectedColor, setSelectedColor] = useState<PlayerColor>('cyan');
  const [firstPlayer, setFirstPlayer] = useState<1 | 2>(1);
  const [team1Color, setTeam1Color] = useState<string>('#00ffff');
  const [team2Color, setTeam2Color] = useState<string>('#f97316');
  const [isSimulated, setIsSimulated] = useState<boolean>(wsService.isSimulated);
  const [showPreFlightModal, setShowPreFlightModal] = useState<boolean>(false);

  const [preFlight, setPreFlight] = useState<PreFlightState>({
    checking: false,
    wsConnected: false,
    cameraOnline: false,
    cameraCalibrated: false,
    missingCorners: [90, 91, 92, 93],
    markersSeen: [],
    coordinatorConnected: false,
    coordinatorDevice: '/dev/ttyUSB0',
    coordinatorError: null,
    robots: [1, 2, 3, 4, 5, 6].map((id) => ({
      robot_id: id,
      team: id <= 3 ? 1 : 2,
      espnow_ok: false,
      qr_seen: false,
      heading_deg: null,
    })),
  });

  // Lắng nghe kết quả hardware_check_result từ Pi 3
  useEffect(() => {
    const unsubscribe = wsService.subscribe((event) => {
      if (event.type === 'hardware_check_result') {
        setPreFlight((prev) => ({
          ...prev,
          checking: false,
          wsConnected: true,
          cameraOnline: event.camera_online || prev.cameraOnline,
          cameraCalibrated: event.camera_calibrated || prev.cameraCalibrated,
          missingCorners: event.missing_corners ?? prev.missingCorners,
          markersSeen: event.markers_seen ?? prev.markersSeen,
          coordinatorConnected: event.coordinator_connected,
          coordinatorDevice: event.coordinator_device,
          coordinatorError: event.coordinator_error,
          robots: event.robots.map((r) => ({
            ...r,
            qr_seen: r.qr_seen || prev.markersSeen.includes(r.robot_id),
          })),
        }));
      }
    });
    return () => unsubscribe();
  }, []);

  const runHardwarePreFlightCheck = async () => {
    setPreFlight((prev) => ({ ...prev, checking: true, coordinatorError: null }));
    wsService.setSimulationMode(false);
    wsService.connect();

    // 1. Kiểm tra trực tiếp HTTP Camera Service (:8080/status) để dù WS chưa thông vẫn biết tình trạng Camera
    const camBase = `http://${window.location.hostname || '127.0.0.1'}:8080`;
    let camOnline = false;
    let camCalibrated = false;
    let camMissing: number[] = [90, 91, 92, 93];
    let camMarkers: number[] = [];
    let camRobots: Record<string, { heading_deg?: number }> = {};

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1800);
      const res = await fetch(`${camBase}/status`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        camOnline = Boolean(data.online);
        camCalibrated = Boolean(data.calibrated);
        camMissing = Array.isArray(data.missing_markers) ? data.missing_markers : [];
        camMarkers = Array.isArray(data.markers_seen) ? data.markers_seen : [];
        camRobots = data.robots || {};
      }
    } catch {
      camOnline = false;
    }

    setPreFlight((prev) => ({
      ...prev,
      cameraOnline: camOnline,
      cameraCalibrated: camCalibrated,
      missingCorners: camMissing,
      markersSeen: camMarkers,
      robots: prev.robots.map((r) => ({
        ...r,
        qr_seen: camMarkers.includes(r.robot_id) || Boolean(camRobots[String(r.robot_id)]),
        heading_deg:
          camRobots[String(r.robot_id)]?.heading_deg !== undefined
            ? Math.round(camRobots[String(r.robot_id)].heading_deg!)
            : r.heading_deg,
      })),
    }));

    // 2. Gửi lệnh hardware_check qua WebSocket tới Pi 3 để Pi kiểm tra Serial Coordinator & Ping 6 xe ESP-NOW
    setTimeout(() => {
      if (wsService.isConnected) {
        wsService.send({ type: 'hardware_check' });
      } else {
        setPreFlight((prev) => ({
          ...prev,
          checking: false,
          wsConnected: false,
          coordinatorConnected: false,
          coordinatorError: `Chưa kết nối được WebSocket Pi 3 (${wsService.url})`,
        }));
      }
    }, 350);

    // Timeout an toàn nếu Pi 3 không phản hồi sau 4.5s
    setTimeout(() => {
      setPreFlight((prev) => (prev.checking ? { ...prev, checking: false, wsConnected: wsService.isConnected } : prev));
    }, 4500);
  };

  const triggerCameraRecalibrate = async () => {
    sound.playClick();
    const camBase = `http://${window.location.hostname || '127.0.0.1'}:8080`;
    try {
      await fetch(`${camBase}/calibrate`);
    } catch {
      // ignore
    }
    if (wsService.isConnected) {
      wsService.send({ type: 'calibrate_camera' });
    }
    setTimeout(() => runHardwarePreFlightCheck(), 1200);
  };

  const handleClickStart = () => {
    sound.playClick();
    wsService.setSimulationMode(isSimulated);
    if (isSimulated) {
      // Chế độ Mô phỏng Demo: vào thẳng bàn cờ, không cần camera/coordinator/xe
      onStartGame(selectedMode, selectedColor, firstPlayer, { team1: team1Color, team2: team2Color });
    } else {
      // Chế độ Phần cứng Thực tế: mở bảng kiểm tra toàn diện trước khi vào game
      setShowPreFlightModal(true);
      runHardwarePreFlightCheck();
    }
  };

  const espnowReadyCount = preFlight.robots.filter((r) => r.espnow_ok).length;
  const qrSeenCount = preFlight.robots.filter((r) => r.qr_seen).length;
  const allHardwareReady =
    preFlight.wsConnected &&
    preFlight.cameraOnline &&
    preFlight.cameraCalibrated &&
    preFlight.coordinatorConnected &&
    espnowReadyCount === 6;

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
          CHỌN CHẾ ĐỘ CHƠI & PHẦN CỨNG
        </h2>

        <div className="w-20" />
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-3xl my-auto py-4 z-10 space-y-5">
        {/* Operating Mode Selector: Simulation Demo vs Real Hardware */}
        <div className="bg-slate-900/80 rounded-3xl p-4 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold tracking-wider text-slate-300 uppercase flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              CHẾ ĐỘ VẬN HÀNH HỆ THỐNG:
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                isSimulated
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
              }`}
            >
              {isSimulated ? 'MÔ PHỎNG DEMO (OFFLINE READY)' : 'PHẦN CỨNG THỰC TẾ (CÓ KIỂM TRA PRE-FLIGHT)'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Option 1: Demo Simulation */}
            <button
              type="button"
              id="select-sim-mode-btn"
              onClick={() => {
                sound.playClick();
                setIsSimulated(true);
                wsService.setSimulationMode(true);
              }}
              className={`p-3.5 rounded-2xl border-2 text-left transition-all flex items-start gap-3 cursor-pointer ${
                isSimulated
                  ? 'bg-amber-950/30 border-amber-400 text-amber-200 shadow-lg shadow-amber-950/40'
                  : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
                <MonitorPlay className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold text-sm text-white flex items-center justify-between">
                  <span>MÔ PHỎNG DEMO</span>
                  {isSimulated && <Check className="w-4 h-4 text-amber-400 stroke-[3]" />}
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                  Chơi ngay trên Web với AI Minimax & Né đường BFS. Không cần Camera, Coordinator hay 6 xe.
                </p>
              </div>
            </button>

            {/* Option 2: Real Hardware */}
            <button
              type="button"
              id="select-hw-mode-btn"
              onClick={() => {
                sound.playClick();
                setIsSimulated(false);
                wsService.setSimulationMode(false);
              }}
              className={`p-3.5 rounded-2xl border-2 text-left transition-all flex items-start gap-3 cursor-pointer ${
                !isSimulated
                  ? 'bg-emerald-950/30 border-emerald-400 text-emerald-200 shadow-lg shadow-emerald-950/40'
                  : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
                <Cpu className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold text-sm text-white flex items-center justify-between">
                  <span>PHẦN CỨNG THỰC TẾ</span>
                  {!isSimulated && <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />}
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                  Kiểm tra Camera ArUco, ESP32 Coordinator và gửi gói PING điểm danh 6 xe trước khi vào bàn.
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Two Large Game Mode Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {/* Card 1: Player vs Player */}
          <div
            id="mode-pvp-card"
            onClick={() => {
              sound.playSelect();
              setSelectedMode('pvp');
            }}
            className={`cursor-pointer rounded-3xl p-5 border-4 transition-all duration-200 transform ${
              selectedMode === 'pvp'
                ? 'bg-cyan-950/40 border-cyan-400 scale-102 shadow-xl shadow-cyan-950/50'
                : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:scale-101'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center text-cyan-400">
                <Users className="w-6 h-6" />
              </div>
              {selectedMode === 'pvp' && (
                <div className="w-7 h-7 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center font-bold">
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
              )}
            </div>

            <h3 className="text-lg font-extrabold text-white mb-0.5">NGƯỜI VỚI NGƯỜI</h3>
            <p className="text-[11px] font-bold text-cyan-400 tracking-wider mb-1.5 font-mono">
              PLAYER VS PLAYER
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Hai người chơi so tài trực tiếp trên màn hình Web hoặc điều khiển 6 xe trên sa bàn.
            </p>
          </div>

          {/* Card 2: Player vs AI */}
          <div
            id="mode-pva-card"
            onClick={() => {
              sound.playSelect();
              setSelectedMode('pva');
            }}
            className={`cursor-pointer rounded-3xl p-5 border-4 transition-all duration-200 transform ${
              selectedMode === 'pva'
                ? 'bg-orange-950/40 border-orange-400 scale-102 shadow-xl shadow-orange-950/50'
                : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:scale-101'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 rounded-2xl bg-orange-500/20 border-2 border-orange-400 flex items-center justify-center text-orange-400">
                <Bot className="w-6 h-6" />
              </div>
              {selectedMode === 'pva' && (
                <div className="w-7 h-7 rounded-full bg-orange-400 text-slate-950 flex items-center justify-center font-bold">
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-lg font-extrabold text-white">NGƯỜI VỚI MÁY</h3>
              <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-bold border border-amber-400/40 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Minimax AI
              </span>
            </div>
            <p className="text-[11px] font-bold text-orange-400 tracking-wider mb-1.5 font-mono">
              PLAYER VS AI
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Đấu trí cùng thuật toán Minimax (cắt tỉa Alpha-Beta) điều phối xe tự động.
            </p>
          </div>
        </div>

        {/* Customization Options */}
        <div className="bg-slate-900/60 rounded-3xl p-5 border border-slate-800 space-y-4">
          {/* Color Picker cho 2 đội */}
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
                    onClick={() => {
                      sound.playClick();
                      setTeam1Color(c.hex);
                    }}
                    className="w-full aspect-square rounded-lg border-2 transition-all active:scale-90 hover:scale-110"
                    style={{
                      backgroundColor: c.hex,
                      borderColor: team1Color === c.hex ? '#fff' : 'transparent',
                      boxShadow: team1Color === c.hex ? `0 0 8px ${c.hex}` : 'none',
                    }}
                  />
                ))}
              </div>
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
                    onClick={() => {
                      sound.playClick();
                      setTeam2Color(c.hex);
                    }}
                    className="w-full aspect-square rounded-lg border-2 transition-all active:scale-90 hover:scale-110"
                    style={{
                      backgroundColor: c.hex,
                      borderColor: team2Color === c.hex ? '#fff' : 'transparent',
                      boxShadow: team2Color === c.hex ? `0 0 8px ${c.hex}` : 'none',
                    }}
                  />
                ))}
              </div>
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

          <div className="border-t border-slate-800" />

          {/* Team & First Turn */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2">ĐỘI XE BẠN ĐIỀU KHIỂN:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setSelectedColor('cyan');
                  }}
                  className={`p-3 rounded-2xl border-2 flex items-center justify-center gap-2 text-xs transition-all ${
                    selectedColor === 'cyan'
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: team1Color }} />
                  Đội 1 (Xe #1-3)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setSelectedColor('orange');
                  }}
                  className={`p-3 rounded-2xl border-2 flex items-center justify-center gap-2 text-xs transition-all ${
                    selectedColor === 'orange'
                      ? 'bg-orange-500/20 border-orange-400 text-orange-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: team2Color }} />
                  Đội 2 (Xe #4-6)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2">LƯỢT ĐI TRƯỚC:</label>
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
                  Đội 1 đi trước
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
                  Đội 2 đi trước
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Start Game Action Button */}
        <button
          id="confirm-start-game-btn"
          onClick={handleClickStart}
          className={`w-full py-5 px-6 rounded-3xl font-extrabold text-lg shadow-xl flex items-center justify-center gap-3 transform active:scale-95 transition-all cursor-pointer ${
            isSimulated
              ? 'bg-gradient-to-r from-amber-400 to-cyan-400 hover:from-amber-300 hover:to-cyan-300 text-slate-950 shadow-amber-500/25'
              : 'bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 shadow-emerald-500/25'
          }`}
        >
          <Play className="w-6 h-6 fill-current" />
          {isSimulated ? 'VÀO VÁN ĐẤU (CHẾ ĐỘ MÔ PHỎNG DEMO)' : 'KIỂM TRA PHẦN CỨNG & VÀO VÁN ĐẤU'}
        </button>
      </main>

      {/* Pre-Flight Hardware Check Modal (Chỉ bật khi ở Chế độ Phần cứng Thực tế) */}
      {showPreFlightModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl border-2 border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-5 my-auto">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <span className="text-[11px] font-mono font-bold text-cyan-400 uppercase tracking-wider block">
                  PRE-FLIGHT HARDWARE DIAGNOSTICS
                </span>
                <h3 className="text-xl font-extrabold text-white">
                  KIỂM TRA TOÀN BỘ PHẦN CỨNG TRƯỚC VÁN ĐẤU
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Xác nhận Camera ArUco, ESP32 Coordinator và gửi gói tin khởi động (PING 0x03) tới 6 xe tự hành.
                </p>
              </div>
              <button
                type="button"
                onClick={() => runHardwarePreFlightCheck()}
                disabled={preFlight.checking}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-cyan-300 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
              >
                {preFlight.checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                KIỂM TRA LẠI
              </button>
            </div>

            {/* 3 Core Subsystems Checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {/* 1. Pi 3 WebSocket */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-slate-400 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                    1. Pi 3 Backend
                  </span>
                  {preFlight.checking ? (
                    <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                  ) : preFlight.wsConnected ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400" />
                  )}
                </div>
                <p className={`font-mono font-bold ${preFlight.wsConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {preFlight.wsConnected ? 'ĐÃ KẾT NỐI WS' : 'CHƯA KẾT NỐI'}
                </p>
                <p className="text-[10px] font-mono text-slate-500 truncate">{wsService.url}</p>
              </div>

              {/* 2. Camera & ArUco 4 Corners */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-slate-400 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-pink-400" />
                    2. Camera & Bàn cờ
                  </span>
                  {preFlight.checking ? (
                    <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                  ) : preFlight.cameraOnline && preFlight.cameraCalibrated ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  )}
                </div>
                <p
                  className={`font-mono font-bold ${
                    preFlight.cameraOnline && preFlight.cameraCalibrated
                      ? 'text-emerald-400'
                      : preFlight.cameraOnline
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {!preFlight.cameraOnline
                    ? 'CAMERA OFFLINE'
                    : preFlight.cameraCalibrated
                    ? 'ĐÃ HIỆU CHUẨN 4 GÓC'
                    : 'CHƯA ĐỦ 4 MÃ GÓC'}
                </p>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono text-slate-500 truncate">
                    {preFlight.missingCorners.length > 0
                      ? `Thiếu góc: ${preFlight.missingCorners.join(', ')}`
                      : 'Đủ mã 90,91,92,93'}
                  </span>
                  <button
                    type="button"
                    onClick={triggerCameraRecalibrate}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-pink-300 flex items-center gap-1 shrink-0"
                  >
                    <Crosshair className="w-2.5 h-2.5" /> Hiệu chuẩn
                  </button>
                </div>
              </div>

              {/* 3. ESP32 Coordinator Serial */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-slate-400 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-amber-400" />
                    3. ESP32 Coordinator
                  </span>
                  {preFlight.checking ? (
                    <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                  ) : preFlight.coordinatorConnected ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400" />
                  )}
                </div>
                <p
                  className={`font-mono font-bold ${
                    preFlight.coordinatorConnected ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {preFlight.coordinatorConnected ? 'SERIAL SẴN SÀNG' : 'CHƯA KẾT NỐI USB'}
                </p>
                <p className="text-[10px] font-mono text-slate-500 truncate" title={preFlight.coordinatorError || ''}>
                  {preFlight.coordinatorError || `${preFlight.coordinatorDevice} • MAC 38:18:2B:B1:BC:E4`}
                </p>
              </div>
            </div>

            {/* 4. 6 Robots ESP-NOW Ping & ArUco QR Status Grid */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300">
                  4. ĐIỂM DANH 6 XE TỰ HÀNH (GÓI PING ESP-NOW & MÃ QR CAMERA):
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  ESP-NOW: <strong className="text-cyan-400">{espnowReadyCount}/6</strong> • Camera QR:{' '}
                  <strong className="text-pink-400">{qrSeenCount}/6</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {preFlight.robots.map((r) => {
                  const tColor = r.team === 1 ? team1Color : team2Color;
                  return (
                    <div
                      key={r.robot_id}
                      className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: tColor, boxShadow: `0 0 6px ${tColor}` }}
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-white flex items-center gap-1.5">
                            <span>XE #{r.robot_id}</span>
                            <span className="text-[10px] font-mono text-slate-500">(QR ID:{r.robot_id})</span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 truncate">
                            MAC: {REAL_ROBOT_MACS[r.robot_id]}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0 font-mono text-[10px]">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                            r.espnow_ok
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {r.espnow_ok ? 'ESP-NOW: PONG' : 'ESP-NOW: CHỜ'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold ${
                            r.qr_seen
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {r.qr_seen
                            ? `CAM: THẤY${r.heading_deg !== null ? ` (${r.heading_deg}°)` : ''}`
                            : 'CAM: CHƯA THẤY'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Footer inside Modal */}
            <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowPreFlightModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 cursor-pointer"
                >
                  ĐÓNG
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setIsSimulated(true);
                    wsService.setSimulationMode(true);
                    setShowPreFlightModal(false);
                    onStartGame(selectedMode, selectedColor, firstPlayer, { team1: team1Color, team2: team2Color });
                  }}
                  className="px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-xs font-bold text-amber-300 cursor-pointer"
                >
                  CHUYỂN SANG MÔ PHỎNG DEMO
                </button>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {!allHardwareReady && (
                  <button
                    type="button"
                    onClick={() => {
                      sound.playClick();
                      setShowPreFlightModal(false);
                      onStartGame(selectedMode, selectedColor, firstPlayer, { team1: team1Color, team2: team2Color });
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold text-slate-200 cursor-pointer"
                    title="Cho phép vào bàn cờ ngay cả khi mới bật 1-2 xe để phục vụ debug từng phần"
                  >
                    BỎ QUA & VÀO DEBUG
                  </button>
                )}

                <button
                  type="button"
                  disabled={!allHardwareReady}
                  onClick={() => {
                    sound.playClick();
                    setShowPreFlightModal(false);
                    onStartGame(selectedMode, selectedColor, firstPlayer, { team1: team1Color, team2: team2Color });
                  }}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-extrabold text-xs cursor-pointer transition-all"
                >
                  VÀO BÀN CỜ THỰC TẾ (ĐỦ 6 XE)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="w-full max-w-4xl text-center text-xs text-slate-500 pt-4 z-10 font-mono">
        Thuật toán Minimax được xử lý trên Raspberry Pi 3 và điều phối qua ESP32 Coordinator
      </footer>
    </div>
  );
};
