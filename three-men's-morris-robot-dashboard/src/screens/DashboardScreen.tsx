import React, { useState, useEffect } from 'react';
import { SystemTelemetry, RobotInfo, GameEventLog, TeamColors } from '../types';
import { SystemStatusPanel } from '../components/SystemStatusPanel';
import { RobotStatusCard } from '../components/RobotStatusCard';
import { BOARD_NODES } from '../game/gameRules';
import { wsService } from '../network/websocket';
import { sound } from '../utils/sound';
import {
  ArrowLeft,
  Terminal,
  Activity,
  Cpu,
  RefreshCw,
  Sliders,
  CheckCircle2,
  Navigation,
  Sparkles,
  Camera,
  Layers
} from 'lucide-react';

interface DashboardScreenProps {
  onBack: () => void;
  onPlayGame: () => void;
  teamColors?: TeamColors;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ onBack, onPlayGame, teamColors }) => {
  const [telemetry, setTelemetry] = useState<SystemTelemetry>(wsService.telemetry);
  const [eventLogs, setEventLogs] = useState<GameEventLog[]>([...wsService.eventLogs]);
  const [activeTab, setActiveTab] = useState<'overview' | 'robots' | 'astar' | 'logs'>('overview');

  // Sample 6 robots telemetry state
  const [robots] = useState<RobotInfo[]>([
    { id: 1, team: 1, name: 'Rover-01', status: 'idle', currentNode: 0, targetNode: null, signalDbm: -42, macAddress: '70:4B:CA:6D:8F:AC', speedPwm: 180, firmwareVersion: 'v2.4' },
    { id: 2, team: 1, name: 'Rover-02', status: 'idle', currentNode: 1, targetNode: null, signalDbm: -45, macAddress: 'A8:42:E3:4A:29:AC', speedPwm: 180, firmwareVersion: 'v2.4' },
    { id: 3, team: 1, name: 'Rover-03', status: 'idle', currentNode: 3, targetNode: null, signalDbm: -39, macAddress: 'CC:DB:A7:2D:D6:4C', speedPwm: 180, firmwareVersion: 'v2.4' },
    { id: 4, team: 2, name: 'Rover-04', status: 'idle', currentNode: 4, targetNode: null, signalDbm: -41, macAddress: 'F0:08:D1:7C:13:D8', speedPwm: 180, firmwareVersion: 'v2.4' },
    { id: 5, team: 2, name: 'Rover-05', status: 'idle', currentNode: 5, targetNode: null, signalDbm: -44, macAddress: '04:83:08:59:43:6C', speedPwm: 180, firmwareVersion: 'v2.4' },
    { id: 6, team: 2, name: 'Rover-06', status: 'idle', currentNode: 8, targetNode: null, signalDbm: -40, macAddress: 'B0:3F:D3:5B:44:60', speedPwm: 180, firmwareVersion: 'v2.4' },
  ]);

  // Sync telemetry updates
  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetry({ ...wsService.telemetry });
      setEventLogs([...wsService.eventLogs]);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleSimulation = (enabled: boolean) => {
    sound.playClick();
    wsService.setSimulationMode(enabled);
    setTelemetry({ ...wsService.telemetry });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 select-none flex flex-col justify-between">
      {/* Top Header */}
      <header className="w-full max-w-7xl mx-auto flex items-center justify-between pb-4 border-b border-slate-900">
        <div className="flex items-center gap-3">
          <button
            id="dash-back-btn"
            onClick={() => {
              sound.playClick();
              onBack();
            }}
            className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white flex items-center gap-1.5 text-xs font-bold transition-all active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>MENU</span>
          </button>

          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <Activity className="w-6 h-6 text-cyan-400" />
              TECHNICAL MONITORING DASHBOARD
            </h1>
            <p className="text-xs text-slate-400 font-mono">
              Hệ thống giám sát phần cứng Raspberry Pi 3 (Bộ não) & ESP32 (Coordinator) & Cụm 6 Xe Tự Hành
            </p>
          </div>
        </div>

        {/* Quick action button to play game */}
        <button
          id="dash-play-game-btn"
          onClick={() => {
            sound.playClick();
            onPlayGame();
          }}
          className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 active:scale-95 transition-all"
        >
          VÀO BÀN CHƠI
        </button>
      </header>

      {/* Main Dashboard Body */}
      <main className="w-full max-w-7xl mx-auto my-4 flex-1 space-y-5">
        {/* System Hardware Status Component */}
        <SystemStatusPanel telemetry={telemetry} onToggleSimulation={toggleSimulation} />

        {/* Navigation Tabs for Technical Views */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            id="tab-overview"
            onClick={() => {
              sound.playClick();
              setActiveTab('overview');
            }}
            className={`px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === 'overview'
                ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-300 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            TỔNG QUAN 6 XE & BÀN CỜ
          </button>

          <button
            id="tab-astar"
            onClick={() => {
              sound.playClick();
              setActiveTab('astar');
            }}
            className={`px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === 'astar'
                ? 'bg-emerald-500/20 border border-emerald-400 text-emerald-300 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Navigation className="w-4 h-4" />
            LẬP ĐƯỜNG A* & THUẬT TOÁN
          </button>

          <button
            id="tab-logs"
            onClick={() => {
              sound.playClick();
              setActiveTab('logs');
            }}
            className={`px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === 'logs'
                ? 'bg-amber-500/20 border border-amber-400 text-amber-300 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Terminal className="w-4 h-4" />
            WEBSOCKET TERMINAL & LOGS
          </button>
        </div>

        {/* Tab 1: 6 Robots Status Cards Grid */}
        {activeTab === 'overview' && (
          <div className="space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                TRẠNG THÁI 6 XE TỰ HÀNH (ESP-NOW STAR TOPOLOGY)
              </h3>
              <span className="text-xs text-slate-500 font-mono">Đồng bộ theo thời gian thực</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {robots.map((robot) => (
                <RobotStatusCard
                  key={robot.id}
                  robot={robot}
                  isActive={robot.status === 'moving'}
                  teamColor={robot.team === 1 ? teamColors?.team1 : teamColors?.team2}
                />
              ))}
            </div>

            {/* Board State Matrix representation */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 mt-4">
              <h4 className="font-bold text-xs text-slate-300 mb-3 flex items-center gap-2">
                <Camera className="w-4 h-4 text-pink-400" />
                NHẬN DIỆN TRẠNG THÁI BÀN CỜ TỪ CAMERA (ROI MAPPING)
              </h4>
              <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto text-center font-mono">
                {BOARD_NODES.map((node) => {
                  const robotOnNode = robots.find((r) => r.currentNode === node.id);
                  return (
                    <div
                      key={node.id}
                      className={`p-3 rounded-2xl border ${
                        robotOnNode
                          ? robotOnNode.team === 1
                            ? 'bg-cyan-950/40 border-cyan-400 text-cyan-300'
                            : 'bg-orange-950/40 border-orange-400 text-orange-300'
                          : 'bg-slate-950/60 border-slate-800 text-slate-500'
                      }`}
                    >
                      <span className="text-[10px] block opacity-60">{node.label}</span>
                      <span className="text-xs font-bold">
                        {robotOnNode ? `XE #${robotOnNode.id}` : 'TRỐNG'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Optional physical path planning */}
        {activeTab === 'astar' && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-emerald-400 flex items-center gap-2">
                  <Navigation className="w-5 h-5" />
                  Lập Đường Di Chuyển Trên Sa Bàn Three Men's Morris
                </h3>
                <p className="text-xs text-slate-400">
                  Nước đi hợp lệ dùng cạnh trực tiếp; A* chỉ bật khi cần tránh vật cản vật lý hoặc đi từ bãi đỗ.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <span className="text-emerald-400 font-bold block mb-1">1. ĐỒ THỊ RỜI RẠC</span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  9 điểm giao tạo thành đồ thị luật chơi. Một nước đi chỉ đi tới node kề trực tiếp theo luật.
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <span className="text-cyan-400 font-bold block mb-1">2. VẬT CẢN ĐỘNG</span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Khi có robot hoặc vật cản vật lý, A* có thể được dùng ở lớp triển khai để tìm chuỗi waypoint an toàn.
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <span className="text-amber-400 font-bold block mb-1">3. THỰC THI ESP-NOW</span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Raspberry Pi 3 gửi lệnh qua Serial đến ESP32 Coordinator đóng gói gửi không dây ESP-NOW tới xe tự hành.
                </p>
              </div>
            </div>

            {/* Pipeline Flow Visualization */}
            <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-center flex-1 min-w-[120px]">
                <span className="text-slate-400 text-[10px] block">BƯỚC 1</span>
                <span className="text-pink-400 font-bold">CAMERA ROI</span>
              </div>
              <span>→</span>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-center flex-1 min-w-[120px]">
                <span className="text-slate-400 text-[10px] block">BƯỚC 2</span>
                <span className="text-orange-400 font-bold">MINIMAX AI</span>
              </div>
              <span>→</span>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-center flex-1 min-w-[120px]">
                <span className="text-slate-400 text-[10px] block">BƯỚC 3</span>
                <span className="text-emerald-400 font-bold">DIRECT EDGE / A*</span>
              </div>
              <span>→</span>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-center flex-1 min-w-[120px]">
                <span className="text-slate-400 text-[10px] block">BƯỚC 4</span>
                <span className="text-cyan-400 font-bold">ESP-NOW TX</span>
              </div>
              <span>→</span>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-center flex-1 min-w-[120px]">
                <span className="text-slate-400 text-[10px] block">BƯỚC 5</span>
                <span className="text-white font-bold">ROVER MOTOR</span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Real-time WebSocket Terminal & Logs */}
        {activeTab === 'logs' && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm text-slate-200">GÓI TIN WEBSOCKET & SỰ KIỆN HỆ THỐNG</h3>
              </div>
              <button
                onClick={() => {
                  wsService.eventLogs = [];
                  setEventLogs([]);
                }}
                className="text-xs text-slate-400 hover:text-white"
              >
                Xóa nhật ký
              </button>
            </div>

            <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800/80 font-mono text-xs max-h-96 overflow-y-auto space-y-2">
              {eventLogs.length === 0 ? (
                <div className="text-slate-500 py-4 text-center">Chưa có bản tin nào...</div>
              ) : (
                eventLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2.5 leading-relaxed">
                    <span className="text-slate-500 text-[11px] shrink-0">[{log.timestamp}]</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 ${
                        log.type === 'move'
                          ? 'bg-amber-500/20 text-amber-300'
                          : log.type === 'ai'
                          ? 'bg-orange-500/20 text-orange-300'
                          : log.type === 'astar'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : log.type === 'warn'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-cyan-500/20 text-cyan-300'
                      }`}
                    >
                      {log.type.toUpperCase()}
                    </span>
                    <span className="text-slate-300 break-all">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="w-full max-w-7xl mx-auto pt-3 border-t border-slate-900 text-center text-xs text-slate-500 font-mono">
        Học viện Công nghệ Bưu chính Viễn thông • Đồ án tốt nghiệp Kỹ thuật Điện tử D22
      </footer>
    </div>
  );
};
