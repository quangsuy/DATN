// TypeScript Definitions for Three Men's Morris Autonomous Robot System
// Đề tài tốt nghiệp: Hệ thống cờ người tự hành Raspberry Pi 3 & ESP32

export type ScreenType = 'home' | 'game_mode' | 'game' | 'dashboard' | 'settings';

export type GameMode = 'pvp' | 'pva'; // Player vs Player or Player vs AI (Minimax)
export type PlayerColor = 'cyan' | 'orange'; // Player 1 (Cyan/Blue) vs Player 2 (Orange/Amber)

/** Màu LED đội dưới dạng hex string, ví dụ '#00ffff' */
export interface TeamColors {
  team1: string; // Màu đội 1 (hex)
  team2: string; // Màu đội 2 (hex)
}

export type GamePhase = 'drop' | 'move' | 'game_over';

export interface BoardNode {
  id: number; // 0 to 8
  label: string; // 'A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3', 'C3'
  gridX: number; // 0, 1, 2
  gridY: number; // 0, 1, 2
  canvasX: number; // percentage 0..100
  canvasY: number; // percentage 0..100
  connectedNeighbors: number[]; // valid lines in Three Men's Morris
}

export type RobotStatusType = 'idle' | 'moving' | 'arrived' | 'error' | 'offline';

export interface RobotInfo {
  id: number; // 1 to 6
  team: 1 | 2; // 1: Player 1, 2: Player 2 / AI
  name: string; // e.g., "Rover-01"
  status: RobotStatusType;
  currentNode: number | null; // null if in staging/home bay
  targetNode: number | null;
  signalDbm: number; // RSSI e.g. -45 dBm
  macAddress: string; // ESP-NOW MAC
  speedPwm: number; // 0..255
  firmwareVersion: string;
  ledColor?: string; // Màu LED hiện tại (hex), undefined = chưa set
}

export interface Waypoint {
  id: number | string;
  x: number; // percentage on board or canvas
  y: number;
  nodeId?: number;
  label?: string;
}

export interface MoveStep {
  robotId: number;
  fromNode: number | null; // null if drop phase
  toNode: number;
  waypoints: Waypoint[];
  currentWaypointIndex: number;
  isCompleted: boolean;
}

export interface AStarLog {
  startNode: number;
  goalNode: number;
  exploredNodes: number[];
  finalPath: number[];
  cost: number;
  calcTimeMs: number;
}

export interface MinimaxLog {
  evalScore: number;
  depth: number;
  nodesSearched: number;
  chosenPiece: number | null; // robotId
  chosenMove: { from: number | null; to: number };
  calcTimeMs: number;
}

export interface SystemTelemetry {
  esp32Status: 'online' | 'offline' | 'simulated';
  wifiStatus: 'connected' | 'disconnected';
  wifiSsid: string;
  ipAddress: string;
  rssi: number;
  webSocketStatus: 'connected' | 'connecting' | 'disconnected';
  cameraStatus: 'online' | 'offline';
  cameraFps: number;
  espNowStatus: 'active' | 'degraded' | 'offline';
  freeRtosState: 'running' | 'warning' | 'halted';
  freeHeapKb: number;
  minHeapKb: number;
  cpu0Usage: number; // Core 0: Wi-Fi, WebSocket, ESP-NOW
  cpu1Usage: number; // Core 1: Image Proc, Minimax, A*
  simulationMode: boolean;
}

/** Payload structured thay cho `any`. */
export type EventPayload = Record<string, unknown>;

export interface GameEventLog {
  id: string;
  timestamp: string;
  type: 'info' | 'move' | 'ai' | 'astar' | 'espnow' | 'camera' | 'warn';
  message: string;
  payload?: EventPayload;
}
