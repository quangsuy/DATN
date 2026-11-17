import React, { useState } from 'react';
import { ArrowLeft, Save, Wifi, Volume2, Bot, ShieldCheck, GraduationCap, RefreshCw } from 'lucide-react';
import { wsService } from '../network/websocket';
import { sound } from '../utils/sound';

interface SettingsScreenProps {
  onBack: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  onBack,
  soundEnabled,
  onToggleSound,
}) => {
  const [wsUrl, setWsUrl] = useState<string>(wsService.url);
  const [isSimulated, setIsSimulated] = useState<boolean>(wsService.isSimulated);
  const [speedLevel, setSpeedLevel] = useState<'slow' | 'medium' | 'fast'>('medium');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const handleSave = () => {
    sound.playClick();
    wsService.url = wsUrl;
    wsService.setSimulationMode(isSimulated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 select-none flex flex-col justify-between">
      {/* Header */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between pb-4 border-b border-slate-900">
        <button
          id="settings-back-btn"
          onClick={() => {
            sound.playClick();
            onBack();
          }}
          className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white flex items-center gap-1.5 text-xs font-bold transition-all active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>MENU</span>
        </button>

        <h1 className="text-xl font-bold text-white">CÀI ĐẶT HỆ THỐNG</h1>

        <div className="w-16" />
      </header>

      {/* Main Settings Body */}
      <main className="w-full max-w-3xl mx-auto my-6 flex-1 space-y-6">
        {/* Project Credentials Banner */}
        <div className="bg-gradient-to-r from-cyan-950/40 via-slate-900 to-orange-950/40 border border-cyan-500/30 rounded-3xl p-5 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-400/40">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-white">
                ĐỒ ÁN TỐT NGHIỆP ĐẠI HỌC CHÍNH QUY
              </h3>
              <p className="text-xs text-cyan-300 font-mono">Học viện Công nghệ Bưu chính Viễn thông - PTIT</p>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed font-medium mb-3">
            “Nghiên cứu, thiết kế và chế tạo hệ thống cờ người tự hành (Three Men's Morris) ứng dụng trí tuệ nhân tạo và xử lý ảnh trên nền tảng vi điều khiển ESP32-S3”
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono text-slate-400 pt-2 border-t border-slate-800">
            <div>
              <span className="text-slate-500 block text-[10px]">Sinh viên:</span>
              <span className="text-slate-200 font-bold">Dương Sơn Quang</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Mã sinh viên:</span>
              <span className="text-slate-200 font-bold">B22DCDT238</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Khoá / Ngành:</span>
              <span className="text-slate-200 font-bold">D22 - Kỹ thuật Điện tử</span>
            </div>
          </div>
        </div>

        {/* Setting Groups */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 space-y-5">
          {/* WebSocket Server URL */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2 flex items-center gap-2">
              <Wifi className="w-4 h-4 text-cyan-400" />
              ĐỊA CHỈ WEBSOCKET SERVER (RASPBERRY PI 3):
            </label>
            <input
              type="text"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-400 rounded-2xl px-4 py-3 text-sm font-mono text-cyan-300 outline-none transition-all"
              placeholder="ws://192.168.66.107:8765"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Mặc định: ws://&lt;IP_Pi3&gt;:8765 (hoặc ws://127.0.0.1:8765 khi chạy nội bộ)
            </p>
          </div>

          {/* Backend transport mode toggle */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800/80">
            <div>
              <h4 className="text-sm font-bold text-slate-200">Backend mô phỏng (Pi SimulationTransport)</h4>
              <p className="text-xs text-slate-400">
                Pi vẫn xử lý lượt chơi và Minimax; chỉ thay robot thật bằng transport mô phỏng.
              </p>
            </div>
            <button
              id="settings-toggle-sim"
              type="button"
              onClick={() => {
                sound.playClick();
                setIsSimulated(!isSimulated);
              }}
              className={`w-14 h-8 rounded-full transition-colors relative p-1 cursor-pointer ${
                isSimulated ? 'bg-amber-500' : 'bg-slate-800'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full bg-slate-950 transition-transform ${
                  isSimulated ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Sound Effects Toggle */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800/80">
            <div>
              <h4 className="text-sm font-bold text-slate-200">Hiệu ứng âm thanh (Sound Effects)</h4>
              <p className="text-xs text-slate-400">
                Âm thanh vui nhộn phù hợp trẻ nhỏ khi di chuyển quân cờ và chiến thắng.
              </p>
            </div>
            <button
              id="settings-toggle-sound"
              type="button"
              onClick={() => {
                sound.playClick();
                onToggleSound();
              }}
              className={`w-14 h-8 rounded-full transition-colors relative p-1 cursor-pointer ${
                soundEnabled ? 'bg-emerald-500' : 'bg-slate-800'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full bg-slate-950 transition-transform ${
                  soundEnabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Robot Speed Preference */}
          <div className="pt-4 border-t border-slate-800/80">
            <label className="block text-xs font-bold text-slate-300 mb-2">
              TỐC ĐỘ DI CHUYỂN CỦA XE (MÔ PHỎNG):
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['slow', 'medium', 'fast'] as const).map((spd) => (
                <button
                  key={spd}
                  onClick={() => {
                    sound.playClick();
                    setSpeedLevel(spd);
                  }}
                  className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${
                    speedLevel === spd
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {spd === 'slow' ? 'Chậm (Demo)' : spd === 'medium' ? 'Vừa phải' : 'Nhanh'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-between pt-2">
          {saveSuccess ? (
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 animate-in fade-in">
              <ShieldCheck className="w-4 h-4" /> Đã lưu cấu hình thành công!
            </span>
          ) : (
            <span />
          )}

          <button
            id="settings-save-btn"
            onClick={handleSave}
            className="py-3 px-8 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-sm shadow-lg shadow-cyan-500/25 flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
          >
            <Save className="w-4 h-4" />
            LƯU THIẾT LẬP
          </button>
        </div>
      </main>

      <footer className="w-full max-w-4xl mx-auto pt-3 border-t border-slate-900 text-center text-xs text-slate-500 font-mono">
        Web Interface tối ưu hoá kích thước cho bộ nhớ Flash SPIFFS / LittleFS trên ESP32-S3
      </footer>
    </div>
  );
};
