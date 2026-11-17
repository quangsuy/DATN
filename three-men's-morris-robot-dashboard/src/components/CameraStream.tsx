import React, { useState } from 'react';
import { Camera, VideoOff } from 'lucide-react';

const defaultStreamUrl = `http://${window.location.hostname}:8080/video`;

export const CameraStream: React.FC = () => {
  const [streamUrl] = useState(defaultStreamUrl);
  const [hasError, setHasError] = useState(false);

  return (
    <section className="w-full rounded-3xl border border-slate-800 bg-slate-900/80 p-3 shadow-2xl">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-xs font-bold tracking-wide text-slate-200">
          <Camera className="h-4 w-4 text-pink-400" />
          CAMERA STREAM
        </h2>
        <span className={`text-[10px] font-mono ${hasError ? 'text-rose-400' : 'text-emerald-400'}`}>
          {hasError ? 'OFFLINE' : 'MJPEG 16:9'}
        </span>
      </div>
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
        {hasError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-slate-500">
            <VideoOff className="h-8 w-8 text-slate-600" />
            <p className="text-xs">Chưa nhận được camera stream</p>
            <p className="break-all text-[10px] font-mono text-slate-600">{streamUrl}</p>
          </div>
        ) : (
          <img
            src={streamUrl}
            alt="Luồng camera giám sát bàn cờ"
            className="h-full w-full object-cover"
            onError={() => setHasError(true)}
          />
        )}
      </div>
    </section>
  );
};
