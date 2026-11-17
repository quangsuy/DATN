import React from 'react';
import { SystemTelemetry } from '../types';
import { Cpu, Wifi, Camera, Radio, Activity, HardDrive, ShieldCheck, Zap } from 'lucide-react';

interface SystemStatusPanelProps {
  telemetry: SystemTelemetry;
  onToggleSimulation?: (enabled: boolean) => void;
}

export const SystemStatusPanel: React.FC<SystemStatusPanelProps> = ({
  telemetry,
  onToggleSimulation,
}) => {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base">Bộ Điều Khiển Raspberry Pi 3 & ESP32 Coordinator</h3>
            <p className="text-xs text-slate-400 font-mono">Đồ án tốt nghiệp: Học viện CN Bưu chính Viễn thông</p>
          </div>
        </div>

        {/* Simulation / Real Hardware Mode Toggle */}
        <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-full border border-slate-800">
          <span className="text-xs text-slate-400 font-medium">Chế độ:</span>
          <button
            id="toggle-sim-mode-btn"
            onClick={() => onToggleSimulation && onToggleSimulation(!telemetry.simulationMode)}
            className={`px-2.5 py-0.5 rounded-full text-xs font-bold transition-all ${
              telemetry.simulationMode
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-emerald-500 text-slate-950 shadow-sm'
            }`}
          >
            {telemetry.simulationMode ? 'Mô Phỏng Demo' : 'Phần Cứng Thực Tế'}
          </button>
        </div>
      </div>

      {/* Main Subsystem Health Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {/* Hardware Architecture */}
        <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Raspberry Pi 3</span>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <p className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {telemetry.simulationMode ? 'SIMULATED' : 'ONLINE'}
          </p>
          <span className="text-[10px] text-slate-500 font-mono">Pi 3 & ESP32 Coord</span>
        </div>

        {/* Wi-Fi */}
        <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Wi-Fi SoftAP</span>
            <Wifi className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <p className="text-xs font-mono font-bold text-sky-400 truncate">
            {telemetry.wifiSsid}
          </p>
          <span className="text-[10px] text-slate-500 font-mono">IP: {telemetry.ipAddress}</span>
        </div>

        {/* WebSocket */}
        <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>WebSocket</span>
            <Activity className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <p className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            CONNECTED
          </p>
          <span className="text-[10px] text-slate-500 font-mono">Port 81 (Binary/JSON)</span>
        </div>

        {/* Camera */}
        <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Camera OV2640</span>
            <Camera className="w-3.5 h-3.5 text-pink-400" />
          </div>
          <p className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {telemetry.cameraFps} FPS
          </p>
          <span className="text-[10px] text-slate-500 font-mono">ArUco / Color ROI</span>
        </div>

        {/* ESP-NOW */}
        <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>ESP-NOW MESH</span>
            <Radio className="w-3.5 h-3.5 text-teal-400" />
          </div>
          <p className="text-xs font-mono font-bold text-teal-400">
            6 NÚT KẾT NỐI
          </p>
          <span className="text-[10px] text-slate-500 font-mono">Độ trễ &lt; 5ms</span>
        </div>

        {/* FreeRTOS */}
        <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>FreeRTOS</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <p className="text-xs font-mono font-bold text-emerald-400">
            ĐA TÁC VỤ
          </p>
          <span className="text-[10px] text-slate-500 font-mono">Watchdog: OK</span>
        </div>
      </div>

      {/* FreeRTOS Core & Memory Bars */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
        {/* Core 0 Load */}
        <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800">
          <div className="flex justify-between text-slate-400 mb-1">
            <span>Core 0 (Wi-Fi, WS, ESP-NOW):</span>
            <span className="text-sky-300 font-bold">{Math.round(telemetry.cpu0Usage)}%</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-sky-400 rounded-full" style={{ width: `${telemetry.cpu0Usage}%` }} />
          </div>
        </div>

        {/* Core 1 Load */}
        <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800">
          <div className="flex justify-between text-slate-400 mb-1">
            <span>Core 1 (Camera, Minimax, A*):</span>
            <span className="text-amber-300 font-bold">{Math.round(telemetry.cpu1Usage)}%</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${telemetry.cpu1Usage}%` }} />
          </div>
        </div>

        {/* Free Heap */}
        <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800">
          <div className="flex justify-between text-slate-400 mb-1">
            <span>Free SRAM/PSRAM Heap:</span>
            <span className="text-emerald-300 font-bold">{telemetry.freeHeapKb} KB</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full"
              style={{ width: `${Math.min(100, (telemetry.freeHeapKb / 380) * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
