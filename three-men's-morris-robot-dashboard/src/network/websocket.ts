// WebSocket Manager with Simulated Embedded Backend Engine
import { WSServerEvent, WSClientAction } from './protocol';
import { GameEventLog, SystemTelemetry, EventPayload } from '../types';

type EventListener = (event: WSServerEvent) => void;

class WebSocketService {
  private socket: WebSocket | null = null;
  private listeners: Set<EventListener> = new Set();
  public url: string = `ws://${window.location.hostname}:8765`;
  public isConnected: boolean = false;
  public isSimulated: boolean = false;
  private reconnectTimer: any = null;
  private pendingActions: WSClientAction[] = [];

  // Telemetry state
  public telemetry: SystemTelemetry = {
    esp32Status: 'offline',
    wifiStatus: 'connected',
    wifiSsid: 'ESP32-S3_ROBOT_ARENA',
    ipAddress: '192.168.4.1',
    rssi: -42,
    webSocketStatus: 'disconnected',
    cameraStatus: 'online',
    cameraFps: 18.4,
    espNowStatus: 'active',
    freeRtosState: 'running',
    freeHeapKb: 284,
    minHeapKb: 198,
    cpu0Usage: 28,
    cpu1Usage: 45,
    simulationMode: false,
  };

  public eventLogs: GameEventLog[] = [];

  constructor() {
    this.addLog('info', 'Khởi tạo hệ thống điều khiển Three Men\'s Morris (ESP32-S3)');
    this.startTelemetryHeartbeat();
  }

  public addLog(type: GameEventLog['type'], message: string, payload?: EventPayload) {
    const log: GameEventLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour12: false, fractionalSecondDigits: 2 } as any),
      type,
      message,
      payload,
    };
    this.eventLogs.unshift(log);
    if (this.eventLogs.length > 80) {
      this.eventLogs.pop();
    }
  }

  public subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public broadcast(event: WSServerEvent) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in WS subscriber listener:', err);
      }
    });
  }

  public connect(customUrl?: string) {
    if (customUrl) this.url = customUrl;

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.socket?.close();
    this.socket = null;

    try {
      this.telemetry.webSocketStatus = 'connecting';
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.telemetry.webSocketStatus = 'connected';
        this.telemetry.esp32Status = this.isSimulated ? 'simulated' : 'online';
        this.addLog(
          'info',
          `Đã kết nối WebSocket tới Pi backend${this.isSimulated ? ' (transport mô phỏng)' : ''}: ${this.url}`,
        );
        const pendingActions = this.pendingActions.splice(0);
        pendingActions.forEach((action) => this.socket?.send(JSON.stringify(action)));
      };

      this.socket.onmessage = (event) => {
        try {
          const data: WSServerEvent = JSON.parse(event.data);
          this.broadcast(data);
          this.addLog('info', `WS RECV: [${data.type}]`, data);
        } catch {
          this.addLog('warn', `WS RECV non-JSON: ${event.data}`);
        }
      };

      this.socket.onerror = () => {
        this.addLog('warn', `Lỗi kết nối WebSocket tới ${this.url}. Kiểm tra backend Pi và địa chỉ server.`);
        this.telemetry.webSocketStatus = 'disconnected';
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.telemetry.webSocketStatus = 'disconnected';
      };
    } catch {
      this.addLog('warn', `Không thể mở kết nối tới ${this.url}.`);
    }
  }

  public disconnect() {
    this.socket?.close();
    this.socket = null;
    this.pendingActions = [];
    this.isConnected = false;
    this.telemetry.webSocketStatus = 'disconnected';
  }

  public setSimulationMode(enabled: boolean) {
    this.isSimulated = enabled;
    this.telemetry.simulationMode = enabled;
    this.telemetry.esp32Status = enabled ? 'simulated' : (this.isConnected ? 'online' : 'offline');
    this.addLog('info', `Chế độ hoạt động: ${enabled ? 'MÔ PHỎNG (Offline Demo)' : 'ESP32-S3 THỰC TẾ'}`);
  }

  public send(action: WSClientAction) {
    this.addLog('info', `WS SEND: [${action.type}]`, action);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(action));
    } else if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      this.pendingActions.push(action);
    } else {
      this.addLog('warn', `Không thể gửi [${action.type}]: WebSocket chưa kết nối.`);
    }
  }

  private startTelemetryHeartbeat() {
    setInterval(() => {
      // Fluctuate stats subtly for realistic embedded telemetry display
      if (this.isSimulated) {
        this.telemetry.cpu0Usage = Math.min(85, Math.max(15, this.telemetry.cpu0Usage + (Math.random() * 8 - 4)));
        this.telemetry.cpu1Usage = Math.min(95, Math.max(20, this.telemetry.cpu1Usage + (Math.random() * 10 - 5)));
        this.telemetry.freeHeapKb = Math.round(284 + Math.sin(Date.now() / 5000) * 12);
        this.telemetry.cameraFps = +(18.0 + Math.random() * 1.5).toFixed(1);
      }
    }, 2000);
  }
}

export const wsService = new WebSocketService();
