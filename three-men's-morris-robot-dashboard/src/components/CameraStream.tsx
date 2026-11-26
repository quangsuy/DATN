import React, { useEffect, useState } from 'react';
import { Camera, VideoOff, Crosshair, MonitorPlay, Layers, Compass, MapPin } from 'lucide-react';
import { wsService } from '../network/websocket';

const base = `http://${window.location.hostname || '127.0.0.1'}:8080`;

interface RobotQrTelemetry {
  id?: number;
  team?: number;
  px: number;
  py: number;
  board_x?: number;
  board_y?: number;
  mm_x?: number;
  mm_y?: number;
  heading_deg?: number;
  image_heading_deg?: number;
  zone?: string;
  stale?: boolean;
}

interface CameraStatus {
  online: boolean;
  fps: number;
  calibrated: boolean;
  calibrating: boolean;
  estimated_fourth_corner?: boolean;
  calibration_progress: number;
  corner_samples?: Record<string, number>;
  markers_seen?: number[];
  missing_markers: number[];
  robots?: Record<string, RobotQrTelemetry>;
}

export const CameraStream: React.FC = () => {
  const [hasError, setHasError] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [status, setStatus] = useState<CameraStatus | null>(null);
  const [viewMode, setViewMode] = useState<'warped' | 'raw'>('warped');
  const isSimulated = wsService.isSimulated;

  // Poll trạng thái 1.2s/lần để cập nhật trực tiếp thông số QR của 6 xe & 4 góc
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${base}/status`);
        const data: CameraStatus = await res.json();
        setStatus(data);
        if (hasError && data.online) {
          setHasError(false);
          setNonce((n) => n + 1);
        }
      } catch {
        setStatus(null);
      }
    };
    fetchStatus();
    const timer = setInterval(fetchStatus, 1200);
    return () => clearInterval(timer);
  }, [hasError]);

  const calibrate = () => {
    fetch(`${base}/calibrate`)
      .then(() => setNonce((n) => n + 1))
      .catch(() => undefined);
  };

  const badge = hasError
    ? isSimulated
      ? { text: 'MÔ PHỎNG DEMO', cls: 'text-amber-400' }
      : { text: 'OFFLINE', cls: 'text-rose-400' }
    : status?.calibrating
    ? { text: `ĐANG GOM 4 GÓC (${status.calibration_progress}/8)`, cls: 'text-amber-400' }
    : status?.calibrated
    ? {
        text: `ĐÃ CẮT MAP ${status.estimated_fourth_corner ? '(3 GÓC + 1 ƯỚC LƯỢNG)' : '(4 GÓC CHUẨN)'} • ${status.fps} FPS`,
        cls: 'text-emerald-400',
      }
    : { text: 'CHƯA HIỆU CHUẨN', cls: 'text-amber-400' };

  const streamUrl =
    viewMode === 'raw' ? `${base}/video?view=raw&n=${nonce}` : `${base}/video?view=warped&n=${nonce}`;

  const detectedRobots = status?.robots || {};

  return (
    <section className="w-full rounded-3xl border border-slate-800 bg-slate-900/80 p-3 shadow-2xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 className="flex items-center gap-2 text-xs font-bold tracking-wide text-slate-200">
          <Camera className="h-4 w-4 text-pink-400" />
          BẢN ĐỒ CAMERA & TELEMETRY QR
        </h2>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-mono font-bold ${badge.cls}`}>{badge.text}</span>
          <button
            type="button"
            onClick={() => {
              setViewMode((prev) => (prev === 'warped' ? 'raw' : 'warped'));
              setNonce((n) => n + 1);
            }}
            disabled={hasError}
            className="flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40"
          >
            <Layers className="h-3 w-3" />
            {viewMode === 'warped' ? 'MAP ĐÃ CẮT' : 'CAM GỐC'}
          </button>
          <button
            type="button"
            onClick={calibrate}
            disabled={hasError}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-200 hover:text-white disabled:opacity-40"
          >
            <Crosshair className="h-3 w-3" /> CẮT LẠI MAP
          </button>
        </div>
      </div>

      <div
        className={`relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 ${
          status?.calibrated && viewMode === 'warped' ? 'aspect-square max-h-[430px] mx-auto' : 'aspect-video'
        }`}
      >
        {hasError ? (
          isSimulated ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-slate-400">
              <MonitorPlay className="h-9 w-9 text-amber-400/80" />
              <p className="text-xs font-bold text-amber-300">
                CHẾ ĐỘ MÔ PHỎNG DEMO (WEB & AI MINIMAX)
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Không yêu cầu kết nối Camera USB, ESP32 Coordinator hay 6 xe vật lý. Bạn có thể click chọn xe ở bãi đỗ hoặc nhấn trực tiếp vào ô cờ để chơi.
              </p>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-slate-500">
              <VideoOff className="h-8 w-8 text-slate-600" />
              <p className="text-xs">Chưa nhận được camera stream (tự thử lại...)</p>
              <p className="break-all text-[10px] font-mono text-slate-600">{base}/video</p>
            </div>
          )
        ) : (
          <img
            key={`${viewMode}-${nonce}`}
            src={streamUrl}
            alt="Bản đồ camera giám sát bàn cờ"
            className="h-full w-full object-contain bg-slate-950"
            onError={() => setHasError(true)}
          />
        )}
        {status && status.missing_markers.length > 0 && !status.calibrated && !hasError && (
          <div className="absolute bottom-2 left-2 rounded-lg bg-slate-950/90 border border-amber-500/40 px-2.5 py-1 text-[10px] font-mono text-amber-300">
            Đang chờ mã góc: {status.missing_markers.join(', ')} (Gợi ý: nâng nhẹ camera để góc 91 không chạm mép ảnh)
          </div>
        )}
      </div>

      {/* Bảng thông tin chi tiết toàn bộ dữ liệu trích xuất từ mã QR / ArUco của 6 xe & 4 góc */}
      {!hasError && status && (
        <div className="rounded-2xl border border-slate-800/90 bg-slate-950/70 p-2.5 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="font-bold text-slate-300 uppercase flex items-center gap-1">
              <Compass className="h-3.5 w-3.5 text-cyan-400" />
              DỮ LIỆU TRÍCH XUẤT TỪ MÃ QR / ARUCO ({Object.keys(detectedRobots).length}/6 XE)
            </span>
            <div className="flex items-center gap-1">
              {[90, 91, 92, 93].map((cid) => {
                const seen = (status.markers_seen || []).includes(cid) || (status.corner_samples?.[String(cid)] ?? 0) >= 3;
                return (
                  <span
                    key={cid}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      seen
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    }`}
                  >
                    G{cid}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {[1, 2, 3, 4, 5, 6].map((rid) => {
              const r = detectedRobots[String(rid)];
              const isTeam1 = rid <= 3;
              const deg = r ? Math.round(r.heading_deg ?? r.image_heading_deg ?? 0) : null;
              const zone = r?.zone || (r ? 'TRÊN BÀN' : 'CHƯA THẤY');
              const coordText =
                r && typeof r.mm_x === 'number' && typeof r.mm_y === 'number'
                  ? `(${Math.round(r.mm_x)}, ${Math.round(r.mm_y)}) mm`
                  : r
                  ? `(${Math.round(r.px)}, ${Math.round(r.py)}) px`
                  : '--';

              return (
                <div
                  key={rid}
                  className={`rounded-xl border p-2 text-[10px] font-mono transition-all ${
                    r
                      ? isTeam1
                        ? 'border-cyan-500/40 bg-cyan-950/25 text-cyan-100'
                        : 'border-orange-500/40 bg-orange-950/25 text-orange-100'
                      : 'border-slate-800 bg-slate-900/40 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className={r ? (isTeam1 ? 'text-cyan-300' : 'text-orange-300') : 'text-slate-500'}>
                      QR XE #{rid}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] ${
                        r
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {zone}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[9px] text-slate-300">
                    <span className="flex items-center gap-0.5">
                      <MapPin className="h-2.5 w-2.5 text-slate-400" />
                      {coordText}
                    </span>
                    <span className="font-bold text-amber-300">
                      {deg !== null ? `${deg}°` : '--'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
