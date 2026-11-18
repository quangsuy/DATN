import React, { useEffect, useState } from 'react';
import { Camera, VideoOff, Crosshair } from 'lucide-react';

const base = `http://${window.location.hostname}:8080`;

interface CameraStatus {
  online: boolean;
  fps: number;
  calibrated: boolean;
  calibrating: boolean;
  calibration_progress: number;
  missing_markers: number[];
}

export const CameraStream: React.FC = () => {
  const [hasError, setHasError] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [status, setStatus] = useState<CameraStatus | null>(null);

  // Poll trạng thái; khi stream lỗi thì tự thử lại mỗi 3s
  useEffect(() => {
    const timer = setInterval(async () => {
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
    }, 3000);
    return () => clearInterval(timer);
  }, [hasError]);

  const calibrate = () => {
    fetch(`${base}/calibrate`).catch(() => undefined);
  };

  const badge = hasError
    ? { text: 'OFFLINE', cls: 'text-rose-400' }
    : status?.calibrating
    ? { text: `HIỆU CHUẨN ${status.calibration_progress}`, cls: 'text-amber-400' }
    : status?.calibrated
    ? { text: `ĐÃ HIỆU CHUẨN • ${status.fps} FPS`, cls: 'text-emerald-400' }
    : { text: 'CHƯA HIỆU CHUẨN', cls: 'text-amber-400' };

  return (
    <section className="w-full rounded-3xl border border-slate-800 bg-slate-900/80 p-3 shadow-2xl">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-xs font-bold tracking-wide text-slate-200">
          <Camera className="h-4 w-4 text-pink-400" />
          CAMERA STREAM
        </h2>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-mono ${badge.cls}`}>{badge.text}</span>
          <button
            type="button"
            onClick={calibrate}
            disabled={hasError}
            className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-300 hover:text-white disabled:opacity-40"
          >
            <Crosshair className="h-3 w-3" /> HIỆU CHỈNH
          </button>
        </div>
      </div>
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
        {hasError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-slate-500">
            <VideoOff className="h-8 w-8 text-slate-600" />
            <p className="text-xs">Chưa nhận được camera stream (tự thử lại...)</p>
            <p className="break-all text-[10px] font-mono text-slate-600">{base}/video</p>
          </div>
        ) : (
          <img
            key={nonce}
            src={`${base}/video`}
            alt="Luồng camera giám sát bàn cờ"
            className="h-full w-full object-cover"
            onError={() => setHasError(true)}
          />
        )}
        {status && status.missing_markers.length > 0 && !hasError && (
          <div className="absolute bottom-2 left-2 rounded bg-slate-950/80 px-2 py-1 text-[10px] font-mono text-amber-300">
            Thiếu marker: {status.missing_markers.join(', ')}
          </div>
        )}
      </div>
    </section>
  );
};
