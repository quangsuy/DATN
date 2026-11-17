import type { GameMode, GamePhase, RobotStatusType } from '../types';
// WebSocket Protocol Types and Packet Payloads for ESP32-S3
// Three Men's Morris Autonomous Vehicle System

export type WSClientAction =
  | { type: 'hello' }
  | { type: 'join_game'; mode: GameMode; player_team: 1 | 2; first_player: 1 | 2 }
  | { type: 'select_move'; player: 1 | 2; robot_id: number; from_node: number | null; to_node: number }
  | { type: 'reset_game' }
  | { type: 'ping' }
  | { type: 'emergency_stop' }
  | { type: 'calibrate_camera' }
  | { type: 'set_team_color'; team: 1 | 2; r: number; g: number; b: number; brightness: number };

export type WSServerEvent =
  | { type: 'hello_ack'; mode?: GameMode; player_team?: 1 | 2; first_player?: 1 | 2 }
  | { type: 'reset_game' }
  | {
      type: 'game_state';
      mode: GameMode;
      phase: GamePhase;
      current_player: 1 | 2;
      board: (number | null)[];
      turn_count: number;
      winner: 1 | 2 | null;
      winning_line: number[] | null;
    }
  | {
      type: 'move_start';
      robot_id: number;
      start: number | string;
      goal: number | string;
      path: (number | string)[];
      waypoints: { x: number; y: number; label?: string }[];
      duration_ms?: number;
    }
  | {
      type: 'robot_status';
      robot_id: number;
      status: RobotStatusType;
      position: string;
      battery?: number;
      speed_pwm?: number;
    }
  | {
      type: 'move_complete';
      robot_id: number;
      goal: number | string;
      board: (number | null)[];
      auxiliary?: boolean;
    }
  | {
      type: 'game_over';
      winner: 1 | 2;
      winning_line: number[];
      board: (number | null)[];
    }
  | {
      type: 'evasion_step';
      action: 'clear_bay_entrance' | 'restore_blocking_robot' | 'push';
      robot_id: number;
      from_node: number;
      to_node: number;
    }
  | { type: 'fault'; robot_id?: number; message: string }
  | { type: 'pong' }
  | { type: 'camera_state'; status: 'calibrating' | 'online' | 'offline' }
  | {
      type: 'team_color_applied';
      team: 1 | 2;
      r: number;
      g: number;
      b: number;
      brightness: number;
    }
  | {
      type: 'ai_thinking';
      player: 1 | 2;
      depth: number;
    }
  | {
      type: 'ai_decision';
      robot_id: number;
      from: number | null;
      to: number;
      eval_score: number;
      nodes_searched: number;
      calc_ms: number;
    }
  | {
      type: 'astar_result';
      planner?: 'direct_edge' | 'astar';
      start: number;
      goal: number;
      path: number[];
      cost: number;
      explored_count: number;
      calc_ms: number;
    }
  | {
      type: 'system_telemetry';
      free_heap_kb: number;
      min_heap_kb: number;
      camera_fps: number;
      espnow_active_peers: number;
      core0_load: number;
      core1_load: number;
    }
  | {
      type: 'camera_frame_metadata';
      board_detected: boolean;
      confidence: number;
      detected_pieces: { id: number; node: number }[];
    };
