// WebSocket Manager with Authoritative Pi Backend + Offline Demo Simulation Fallback
import { WSServerEvent, WSClientAction } from './protocol';
import { GameEventLog, SystemTelemetry, EventPayload, GameMode, GamePhase } from '../types';
import { BOARD_NODES } from '../game/gameRules';

type EventListener = (event: WSServerEvent) => void;

const WINNING_LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const NODE_COORDS_MM: Record<number, { x: number; y: number }> = {
  0: { x: 0, y: 0 },
  1: { x: 100, y: 0 },
  2: { x: 200, y: 0 },
  3: { x: 0, y: 100 },
  4: { x: 100, y: 100 },
  5: { x: 200, y: 100 },
  6: { x: 0, y: 200 },
  7: { x: 100, y: 200 },
  8: { x: 200, y: 200 },
};

const BAY_COORDS_MM: Record<number, { x: number; y: number }> = {
  1: { x: -45, y: 0 },
  2: { x: -45, y: 100 },
  3: { x: -45, y: 200 },
  4: { x: 245, y: 0 },
  5: { x: 245, y: 100 },
  6: { x: 245, y: 200 },
};

const BAY_ENTRY_NODES: Record<number, number> = { 1: 0, 2: 3, 3: 6, 4: 2, 5: 5, 6: 8 };

class LocalSimulationEngine {
  public mode: GameMode = 'pva';
  public playerTeam: 1 | 2 = 1;
  public firstPlayer: 1 | 2 = 1;
  public currentPlayer: 1 | 2 = 1;
  public phase: GamePhase = 'drop';
  public board: (number | null)[] = Array(9).fill(null);
  public turnCount: number = 1;
  public placedCount: Record<1 | 2, number> = { 1: 0, 2: 0 };
  public winner: 1 | 2 | null = null;
  public winningLine: number[] | null = null;
  public robotNodes: Record<number, number | null> = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
  private busy: boolean = false;
  private timers: any[] = [];

  constructor(private emit: (event: WSServerEvent) => void) {}

  public clearTimers() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    this.busy = false;
  }

  private schedule(fn: () => void, ms: number) {
    const t = setTimeout(fn, ms);
    this.timers.push(t);
  }

  public reset(mode?: GameMode, playerTeam?: 1 | 2, firstPlayer?: 1 | 2) {
    this.clearTimers();
    if (mode) this.mode = mode;
    if (playerTeam) this.playerTeam = playerTeam;
    if (firstPlayer) this.firstPlayer = firstPlayer;
    this.currentPlayer = this.firstPlayer;
    this.phase = 'drop';
    this.board = Array(9).fill(null);
    this.turnCount = 1;
    this.placedCount = { 1: 0, 2: 0 };
    this.winner = null;
    this.winningLine = null;
    this.robotNodes = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
    this.emit({ type: 'reset_game' });
    for (let id = 1; id <= 6; id++) {
      this.emit({ type: 'robot_status', robot_id: id, status: 'idle', position: 'BAY' });
    }
    this.snapshot();
    if (this.mode === 'pva' && this.currentPlayer !== this.playerTeam) {
      this.schedule(() => this.runAiTurn(), 450);
    }
  }

  public snapshot() {
    this.emit({
      type: 'game_state',
      mode: this.mode,
      phase: this.phase,
      current_player: this.currentPlayer,
      board: [...this.board],
      turn_count: this.turnCount,
      winner: this.winner,
      winning_line: this.winningLine,
    });
  }

  private checkWin(b: (number | null)[]): { winner: 1 | 2 | null; line: number[] | null } {
    for (const line of WINNING_LINES) {
      const [a, c, d] = line;
      if (b[a] !== null && b[a] === b[c] && b[a] === b[d]) {
        return { winner: b[a] as 1 | 2, line };
      }
    }
    return { winner: null, line: null };
  }

  private bfsRoute(start: number, goal: number, blocked: Set<number>): number[] | null {
    if (start === goal) return [start];
    const queue: number[][] = [[start]];
    const visited = new Set<number>([start]);
    while (queue.length > 0) {
      const path = queue.shift()!;
      const curr = path[path.length - 1];
      for (const nxt of BOARD_NODES[curr].connectedNeighbors) {
        if (nxt === goal) return [...path, nxt];
        if (!visited.has(nxt) && !blocked.has(nxt)) {
          visited.add(nxt);
          queue.push([...path, nxt]);
        }
      }
    }
    return null;
  }

  private findEvasionChain(entryNode: number, targetNode: number): { robotId: number; from: number; to: number }[] {
    const occupiedMap = new Map<number, number>();
    for (let rid = 1; rid <= 6; rid++) {
      const n = this.robotNodes[rid];
      if (n !== null) occupiedMap.set(n, rid);
    }
    if (!occupiedMap.has(entryNode)) return [];

    const queue: number[][] = [[entryNode]];
    const visited = new Set<number>([entryNode]);
    let slidingPath: number[] | null = null;
    while (queue.length > 0) {
      const path = queue.shift()!;
      const curr = path[path.length - 1];
      if (!occupiedMap.has(curr) && curr !== targetNode) {
        slidingPath = path;
        break;
      }
      for (const nb of BOARD_NODES[curr].connectedNeighbors) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push([...path, nb]);
        }
      }
    }
    if (!slidingPath) return [];
    const steps: { robotId: number; from: number; to: number }[] = [];
    for (let i = slidingPath.length - 1; i > 0; i--) {
      const from = slidingPath[i - 1];
      const to = slidingPath[i];
      const rid = occupiedMap.get(from)!;
      steps.push({ robotId: rid, from, to });
      occupiedMap.set(to, rid);
      occupiedMap.delete(from);
    }
    return steps;
  }

  public executeMove(player: 1 | 2, robotId: number, fromNode: number | null, toNode: number) {
    if (this.busy || this.winner !== null) return;
    if (player !== this.currentPlayer) {
      this.emit({ type: 'fault', robot_id: robotId, message: 'Chưa tới lượt của đội này' });
      return;
    }
    if (this.board[toNode] !== null) {
      this.emit({ type: 'fault', robot_id: robotId, message: 'Ô đích đã có xe khác' });
      return;
    }
    if (this.phase === 'drop') {
      if (fromNode !== null || this.robotNodes[robotId] !== null) {
        this.emit({ type: 'fault', robot_id: robotId, message: 'Giai đoạn đặt quân: hãy chọn xe trong bãi đỗ' });
        return;
      }
    } else {
      if (fromNode === null || this.robotNodes[robotId] !== fromNode) {
        this.emit({ type: 'fault', robot_id: robotId, message: 'Xe không nằm ở ô xuất phát' });
        return;
      }
      if (!BOARD_NODES[fromNode].connectedNeighbors.includes(toNode)) {
        this.emit({ type: 'fault', robot_id: robotId, message: 'Nước đi phải theo cạnh nối trực tiếp' });
        return;
      }
    }

    this.busy = true;
    let delayMs = 0;
    const evasionSteps = this.phase === 'drop' ? this.findEvasionChain(BAY_ENTRY_NODES[robotId], toNode) : [];

    // 1. Push blocking robots aside (BFS Stack Evasion)
    evasionSteps.forEach((step) => {
      this.schedule(() => {
        this.emit({
          type: 'evasion_step',
          action: 'clear_bay_entrance',
          robot_id: step.robotId,
          from_node: step.from,
          to_node: step.to,
        });
        this.emitMotion(step.robotId, step.from, step.to, [step.from, step.to], 500, true);
      }, delayMs);
      delayMs += 550;
    });

    // 2. Main robot motion
    this.schedule(() => {
      let nodePath: number[] = [];
      let waypoints: { x: number; y: number; label?: string }[] = [];
      if (fromNode === null) {
        const entry = BAY_ENTRY_NODES[robotId];
        const blocked = new Set<number>();
        for (let r = 1; r <= 6; r++) {
          if (r !== robotId && this.robotNodes[r] !== null) blocked.add(this.robotNodes[r]!);
        }
        evasionSteps.forEach((s) => {
          blocked.delete(s.from);
          blocked.add(s.to);
        });
        nodePath = this.bfsRoute(entry, toNode, blocked) || [entry, toNode];
        const bay = BAY_COORDS_MM[robotId];
        waypoints = [
          { x: bay.x, y: bay.y, label: `BAY-${robotId}` },
          ...nodePath.map((n) => ({ x: NODE_COORDS_MM[n].x, y: NODE_COORDS_MM[n].y, label: BOARD_NODES[n].label })),
        ];
      } else {
        nodePath = [fromNode, toNode];
        waypoints = nodePath.map((n) => ({
          x: NODE_COORDS_MM[n].x,
          y: NODE_COORDS_MM[n].y,
          label: BOARD_NODES[n].label,
        }));
      }

      const durationMs = Math.max(650, (waypoints.length - 1) * 420);
      this.emit({
        type: 'astar_result',
        planner: nodePath.length <= 2 ? 'direct_edge' : 'astar',
        start: fromNode ?? entryNodeFor(robotId),
        goal: toNode,
        path: nodePath,
        cost: (nodePath.length - 1) * 100,
        explored_count: nodePath.length,
        calc_ms: 1,
      });
      this.emit({
        type: 'move_start',
        robot_id: robotId,
        start: fromNode ?? `BAY-${robotId}`,
        goal: toNode,
        path: nodePath,
        waypoints,
        duration_ms: durationMs,
      });
      this.emit({ type: 'robot_status', robot_id: robotId, status: 'moving', position: 'MOVING' });
    }, delayMs);

    const mainMoveDuration = 750;
    delayMs += mainMoveDuration;

    // 3. Restore displaced robots in LIFO order
    [...evasionSteps].reverse().forEach((step) => {
      this.schedule(() => {
        this.emit({
          type: 'evasion_step',
          action: 'restore_blocking_robot',
          robot_id: step.robotId,
          from_node: step.to,
          to_node: step.from,
        });
        this.emitMotion(step.robotId, step.to, step.from, [step.to, step.from], 500, true);
      }, delayMs);
      delayMs += 550;
    });

    // 4. Commit logical board state
    this.schedule(() => {
      if (fromNode !== null) {
        this.board[fromNode] = null;
      } else {
        this.placedCount[player] += 1;
      }
      this.board[toNode] = player;
      this.robotNodes[robotId] = toNode;
      this.turnCount += 1;
      if (this.placedCount[1] >= 3 && this.placedCount[2] >= 3) {
        this.phase = 'move';
      }

      const winCheck = this.checkWin(this.board);
      this.winner = winCheck.winner;
      this.winningLine = winCheck.line;
      if (!this.winner) {
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
      } else {
        this.phase = 'game_over';
      }

      this.emit({ type: 'robot_status', robot_id: robotId, status: 'arrived', position: String(toNode) });
      this.emit({
        type: 'move_complete',
        robot_id: robotId,
        goal: toNode,
        board: [...this.board],
      });

      if (this.winner) {
        this.emit({
          type: 'game_over',
          winner: this.winner,
          winning_line: this.winningLine || [],
          board: [...this.board],
        });
      }
      this.snapshot();
      this.busy = false;

      if (!this.winner && this.mode === 'pva' && this.currentPlayer !== this.playerTeam) {
        this.schedule(() => this.runAiTurn(), 400);
      }
    }, delayMs);
  }

  private emitMotion(robotId: number, from: number, to: number, nodePath: number[], durationMs: number, aux: boolean) {
    this.emit({
      type: 'move_start',
      robot_id: robotId,
      start: from,
      goal: to,
      path: nodePath,
      waypoints: nodePath.map((n) => ({ x: NODE_COORDS_MM[n].x, y: NODE_COORDS_MM[n].y, label: BOARD_NODES[n].label })),
      duration_ms: durationMs,
    });
    this.schedule(() => {
      this.emit({ type: 'robot_status', robot_id: robotId, status: 'arrived', position: String(to) });
      this.emit({
        type: 'move_complete',
        robot_id: robotId,
        goal: to,
        board: [...this.board],
        auxiliary: aux,
      });
    }, durationMs - 40);
  }

  private runAiTurn() {
    if (this.winner !== null || this.busy) return;
    const aiPlayer: 1 | 2 = this.playerTeam === 1 ? 2 : 1;
    if (this.currentPlayer !== aiPlayer) return;

    const searchDepth = 8;
    this.emit({ type: 'ai_thinking', player: aiPlayer, depth: searchDepth });
    const t0 = performance.now();

    this.schedule(() => {
      const decision = this.chooseMinimaxMove(aiPlayer, searchDepth);
      if (!decision) return;
      const calcMs = Math.max(2, Math.round(performance.now() - t0));
      this.emit({
        type: 'ai_decision',
        robot_id: decision.robotId,
        from: decision.from,
        to: decision.to,
        depth: searchDepth,
        eval_score: decision.score,
        nodes_searched: decision.nodes,
        calc_ms: calcMs,
      });
      this.executeMove(aiPlayer, decision.robotId, decision.from, decision.to);
    }, 350);
  }

  private chooseMinimaxMove(
    aiPlayer: 1 | 2,
    maxDepth: number = 8,
  ): { robotId: number; from: number | null; to: number; score: number; nodes: number } | null {
    const humanPlayer: 1 | 2 = aiPlayer === 1 ? 2 : 1;
    let nodesSearched = 0;

    // Transposition Table: key -> { score, depth, flag (0=EXACT, 1=LOWER, 2=UPPER) }
    const tt = new Map<string, { score: number; depth: number; flag: 0 | 1 | 2 }>();

    const boardKey = (b: (number | null)[], p: 1 | 2, placed: Record<1 | 2, number>): string => {
      let s = '';
      for (let i = 0; i < 9; i++) {
        s += b[i] === null ? '0' : String(b[i]);
      }
      return `${s}:${p}:${placed[1]}${placed[2]}`;
    };

    const genMoves = (b: (number | null)[], p: 1 | 2, placed: Record<1 | 2, number>) => {
      const moves: { from: number | null; to: number }[] = [];
      if (placed[p] < 3) {
        for (let i = 0; i < 9; i++) {
          if (b[i] === null) moves.push({ from: null, to: i });
        }
      } else {
        for (let i = 0; i < 9; i++) {
          if (b[i] === p) {
            for (const nb of BOARD_NODES[i].connectedNeighbors) {
              if (b[nb] === null) moves.push({ from: i, to: nb });
            }
          }
        }
      }
      return moves;
    };

    const evaluate = (b: (number | null)[]): number => {
      const w = this.checkWin(b).winner;
      if (w === aiPlayer) return 1000;
      if (w === humanPlayer) return -1000;

      let score = 0;
      // 1. Center node control (node 4 connects all 8 neighbors & 4 winning lines)
      if (b[4] === aiPlayer) score += 30;
      else if (b[4] === humanPlayer) score -= 30;

      // 2. Corner node control (0, 2, 6, 8 each have 3 connections & 3 winning lines)
      for (const corner of [0, 2, 6, 8]) {
        if (b[corner] === aiPlayer) score += 8;
        else if (b[corner] === humanPlayer) score -= 8;
      }

      // 3. Mobility (Độ cơ động) & Trapped-piece penalty (Phạt kẹt góc)
      let aiCount = 0;
      let huCount = 0;
      for (let i = 0; i < 9; i++) {
        const cell = b[i];
        if (cell === null) continue;
        let freeEdges = 0;
        const neighbors = BOARD_NODES[i].connectedNeighbors;
        for (let k = 0; k < neighbors.length; k++) {
          if (b[neighbors[k]] === null) freeEdges++;
        }
        if (cell === aiPlayer) {
          aiCount++;
          score += freeEdges * 5;
          if (freeEdges === 0) score -= 12;
        } else {
          huCount++;
          score -= freeEdges * 5;
          if (freeEdges === 0) score += 12;
        }
      }

      // 4. Two-in-a-row threats & Double-threat Fork (Thế gọng kìm)
      let aiThreats = 0;
      let huThreats = 0;
      for (const [a, c, d] of WINNING_LINES) {
        const ca = b[a];
        const cc = b[c];
        const cd = b[d];
        const aiCnt = (ca === aiPlayer ? 1 : 0) + (cc === aiPlayer ? 1 : 0) + (cd === aiPlayer ? 1 : 0);
        const huCnt = (ca === humanPlayer ? 1 : 0) + (cc === humanPlayer ? 1 : 0) + (cd === humanPlayer ? 1 : 0);
        if (aiCnt === 2 && huCnt === 0) {
          score += 60;
          aiThreats++;
        }
        if (huCnt === 2 && aiCnt === 0) {
          score -= 90;
          huThreats++;
        }
      }

      if (aiThreats >= 2) score += 80;
      if (huThreats >= 2) score -= 110;

      score += (aiCount - huCount) * 4;
      return score;
    };

    const orderMoves = (
      b: (number | null)[],
      p: 1 | 2,
      placed: Record<1 | 2, number>,
      candidates: { from: number | null; to: number }[],
    ) => {
      const entries = candidates.map((m) => {
        const nb = [...b];
        const np = { ...placed };
        if (m.from !== null) nb[m.from] = null;
        else np[p]++;
        nb[m.to] = p;
        const w = this.checkWin(nb).winner;
        let priority: number;
        if (w === aiPlayer) priority = -2000;
        else if (w === humanPlayer) priority = 2000;
        else priority = -evaluate(nb);
        return { priority, move: m, nb, np, winner: w };
      });
      entries.sort((a, bEntry) => (p === aiPlayer ? a.priority - bEntry.priority : bEntry.priority - a.priority));
      return entries;
    };

    const minimax = (
      b: (number | null)[],
      p: 1 | 2,
      placed: Record<1 | 2, number>,
      depth: number,
      alpha: number,
      beta: number,
    ): number => {
      nodesSearched++;
      const w = this.checkWin(b).winner;
      if (w === aiPlayer) return 1000 + depth;
      if (w === humanPlayer) return -1000 - depth;
      if (depth === 0) return evaluate(b);

      const key = boardKey(b, p, placed);
      const cached = tt.get(key);
      if (cached && cached.depth >= depth) {
        if (cached.flag === 0) return cached.score;
        if (cached.flag === 1 && cached.score > alpha) alpha = cached.score;
        if (cached.flag === 2 && cached.score < beta) beta = cached.score;
        if (alpha >= beta) return cached.score;
      }

      const moves = genMoves(b, p, placed);
      if (moves.length === 0) {
        const leaf = evaluate(b);
        tt.set(key, { score: leaf, depth, flag: 0 });
        return leaf;
      }

      const alphaOrig = alpha;
      const betaOrig = beta;
      const ordered = orderMoves(b, p, placed, moves);

      let best: number;
      if (p === aiPlayer) {
        best = -99999;
        for (const entry of ordered) {
          const val = minimax(entry.nb, humanPlayer, entry.np, depth - 1, alpha, beta);
          if (val > best) best = val;
          if (best > alpha) alpha = best;
          if (beta <= alpha) break;
        }
      } else {
        best = 99999;
        for (const entry of ordered) {
          const val = minimax(entry.nb, aiPlayer, entry.np, depth - 1, alpha, beta);
          if (val < best) best = val;
          if (best < beta) beta = best;
          if (beta <= alpha) break;
        }
      }

      const flag: 0 | 1 | 2 = best <= alphaOrig ? 2 : best >= betaOrig ? 1 : 0;
      tt.set(key, { score: best, depth, flag });
      return best;
    };

    const rootMoves = genMoves(this.board, aiPlayer, this.placedCount);
    if (rootMoves.length === 0) return null;

    const orderedRoot = orderMoves(this.board, aiPlayer, this.placedCount, rootMoves);
    let bestMove = orderedRoot[0].move;
    let bestScore = -99999;
    let alpha = -99999;
    const beta = 99999;

    for (const entry of orderedRoot) {
      const sc = minimax(entry.nb, humanPlayer, entry.np, maxDepth - 1, alpha, beta);
      if (sc > bestScore) {
        bestScore = sc;
        bestMove = entry.move;
      }
      if (bestScore > alpha) {
        alpha = bestScore;
      }
    }

    // Match robot ID
    const teamRobots = aiPlayer === 1 ? [1, 2, 3] : [4, 5, 6];
    let chosenRobot = teamRobots[0];
    if (bestMove.from === null) {
      chosenRobot = teamRobots.find((rid) => this.robotNodes[rid] === null) ?? teamRobots[0];
    } else {
      chosenRobot = teamRobots.find((rid) => this.robotNodes[rid] === bestMove.from) ?? teamRobots[0];
    }

    return {
      robotId: chosenRobot,
      from: bestMove.from,
      to: bestMove.to,
      score: bestScore,
      nodes: nodesSearched,
    };
  }
}

function entryNodeFor(robotId: number): number {
  return BAY_ENTRY_NODES[robotId] ?? 0;
}

class WebSocketService {
  private socket: WebSocket | null = null;
  private listeners: Set<EventListener> = new Set();
  public url: string = `ws://${window.location.hostname || '127.0.0.1'}:8765`;
  public isConnected: boolean = false;
  // Mặc định bật Chế độ Mô phỏng Demo để mở web lên là chơi & trình chiếu được ngay
  public isSimulated: boolean = true;
  private pendingActions: WSClientAction[] = [];
  private localSim: LocalSimulationEngine;

  // Telemetry state
  public telemetry: SystemTelemetry = {
    esp32Status: 'simulated',
    wifiStatus: 'connected',
    wifiSsid: 'PI3_ROBOT_ARENA',
    ipAddress: window.location.hostname || '192.168.66.107',
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
    simulationMode: true,
  };

  public eventLogs: GameEventLog[] = [];

  constructor() {
    this.localSim = new LocalSimulationEngine((ev) => this.broadcast(ev));
    this.addLog('info', 'Khởi tạo hệ thống điều khiển Three Men\'s Morris (Raspberry Pi 3 & ESP32 Coordinator)');
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
          `Đã kết nối WebSocket tới Pi backend (${this.isSimulated ? 'Chế độ Mô phỏng Demo' : 'Phần cứng Thực tế'}): ${this.url}`,
        );
        // Đồng bộ chế độ mô phỏng/thực tế xuống Pi ngay khi kết nối
        this.socket?.send(JSON.stringify({ type: 'set_simulation_mode', enabled: this.isSimulated }));
        const pendingActions = this.pendingActions.splice(0);
        pendingActions.forEach((action) => this.socket?.send(JSON.stringify(action)));
      };

      this.socket.onmessage = (event) => {
        try {
          const data: WSServerEvent = JSON.parse(event.data);
          // Khi đang ở chế độ Mô phỏng Demo, bỏ qua các sự kiện bàn cờ từ backend thực
          // để tránh xung đột với LocalSimulationEngine (trừ kết quả hardware_check).
          if (this.isSimulated && data.type !== 'hardware_check_result' && data.type !== 'pong') {
            return;
          }
          this.broadcast(data);
          this.addLog('info', `WS RECV: [${data.type}]`, data as unknown as EventPayload);
        } catch {
          this.addLog('warn', `WS RECV non-JSON: ${event.data}`);
        }
      };

      this.socket.onerror = () => {
        this.telemetry.webSocketStatus = 'disconnected';
        if (this.isSimulated) {
          this.addLog('info', 'Pi WebSocket chưa bật — sử dụng Engine Mô phỏng Demo trực tiếp trên trình duyệt.');
        } else {
          this.addLog('warn', `Lỗi kết nối WebSocket tới ${this.url}. Kiểm tra backend Pi 3.`);
        }
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.telemetry.webSocketStatus = 'disconnected';
      };
    } catch {
      this.isConnected = false;
      this.telemetry.webSocketStatus = 'disconnected';
    }
  }

  public disconnect() {
    this.localSim.clearTimers();
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
    this.addLog('info', `Chế độ hoạt động: ${enabled ? 'MÔ PHỎNG DEMO (Web & AI Minimax)' : 'PHẦN CỨNG THỰC TẾ (Pi 3 + Coordinator + 6 Xe)'}`);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'set_simulation_mode', enabled }));
    }
  }

  private handleLocalSimulatedAction(action: WSClientAction) {
    if (action.type === 'join_game') {
      this.localSim.reset(action.mode, action.player_team, action.first_player);
    } else if (action.type === 'reset_game') {
      this.localSim.reset();
    } else if (action.type === 'select_move') {
      this.localSim.executeMove(action.player, action.robot_id, action.from_node, action.to_node);
    } else if (action.type === 'set_team_color') {
      this.broadcast({
        type: 'team_color_applied',
        team: action.team,
        r: action.r,
        g: action.g,
        b: action.b,
        brightness: action.brightness,
      });
    } else if (action.type === 'ping') {
      this.broadcast({ type: 'pong' });
    }
  }

  public send(action: WSClientAction) {
    this.addLog('info', `WS SEND: [${action.type}]`, action as unknown as EventPayload);

    // Chế độ MÔ PHỎNG DEMO: chạy hoàn toàn độc lập trên LocalSimulationEngine
    // để dù không có Camera, không hiệu chuẩn bàn cờ, không có Coordinator hay 6 xe
    // thì giao diện Web và AI Minimax + thuật toán Né đường vẫn chơi được 100%.
    if (this.isSimulated && action.type !== 'hardware_check') {
      this.handleLocalSimulatedAction(action);
      return;
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(action));
    } else if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      this.pendingActions.push(action);
    } else {
      this.addLog('warn', `Không thể gửi [${action.type}]: WebSocket chưa kết nối tới Raspberry Pi 3.`);
    }
  }

  private startTelemetryHeartbeat() {
    setInterval(() => {
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
