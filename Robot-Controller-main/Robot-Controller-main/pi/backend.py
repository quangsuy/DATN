from collections import deque
"""Authoritative Three Men's Morris backend for the Raspberry Pi.

The backend owns game state and emits frontend-facing events. Hardware transport
is injected so simulation can be tested without a camera, serial port, or robot.
"""

from dataclasses import dataclass, field
from time import monotonic
from typing import Any, Callable, Dict, List, Optional, Tuple

from .board_planner import MotionPath, direct_move_trajectory, plan_node_route, pose_to_node_trajectory, route_to_trajectory
from .board_model import BOARD_NEIGHBORS, Board, PointMm
from .minimax import DEFAULT_EXPERIENCE, ExperienceMemory, MinimaxDecision, choose_move
from .morris_game import GameState, IllegalMove, Move, apply_move, new_game

Event = Dict[str, Any]
EventSink = Callable[[Event], None]


DEFAULT_BOARD_NODES_MM: Dict[int, PointMm] = {
    0: (0.0, 0.0),
    1: (100.0, 0.0),
    2: (200.0, 0.0),
    3: (0.0, 100.0),
    4: (100.0, 100.0),
    5: (200.0, 100.0),
    6: (0.0, 200.0),
    7: (100.0, 200.0),
    8: (200.0, 200.0),
}

DEFAULT_BAYS_MM: Dict[int, PointMm] = {
    1: (-150.0, 0.0),
    2: (-150.0, 100.0),
    3: (-150.0, 200.0),
    4: (350.0, 0.0),
    5: (350.0, 100.0),
    6: (350.0, 200.0),
}

BAY_ENTRY_NODES = {1: 0, 2: 3, 3: 6, 4: 2, 5: 5, 6: 8}
MOTION_SPEED_MM_S = 40.0


@dataclass
class RobotRuntime:
    robot_id: int
    team: int
    status: str = "idle"
    current_node: Optional[int] = None
    battery: Optional[int] = None
    speed_pwm: Optional[int] = None
    position: str = "BAY"


class SimulationTransport:
    """Transport that acknowledges commands immediately for offline demos."""

    def execute(self, robot_id: int, path: MotionPath, move_id: int = 0) -> Dict[str, Any]:
        return {"robot_id": robot_id, "status": "completed", "path": path, "move_id": move_id}

    def emergency_stop(self) -> None:
        return None


@dataclass
class MorrisBackend:
    board_nodes_mm: Dict[int, PointMm] = field(default_factory=lambda: dict(DEFAULT_BOARD_NODES_MM))
    transport: Any = field(default_factory=SimulationTransport)
    event_sinks: List[EventSink] = field(default_factory=list)
    mode: str = "pva"
    player_team: int = 1
    first_player: int = 1
    state: GameState = field(default_factory=new_game)
    move_id: int = 0
    sequence: int = 0
    moving_robot_id: Optional[int] = None
    robots: Dict[int, RobotRuntime] = field(default_factory=dict)
    camera_online: bool = False
    camera_fps: float = 0.0
    board_detected: bool = False
    camera_confidence: float = 0.0
    last_error: Optional[str] = None
    physical_position_valid: bool = True
    experience: ExperienceMemory = field(default_factory=lambda: DEFAULT_EXPERIENCE)
    match_history: List[Tuple[Board, int, Optional[int], int]] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.robots:
            self.robots = {
                robot_id: RobotRuntime(robot_id, 1 if robot_id <= 3 else 2)
                for robot_id in range(1, 7)
            }

    def subscribe(self, sink: EventSink) -> None:
        self.event_sinks.append(sink)

    def _emit(self, event_type: str, **payload: Any) -> Event:
        event = {"type": event_type, **payload}
        for sink in tuple(self.event_sinks):
            sink(event)
        return event

    def snapshot(self) -> Event:
        return self._emit(
            "game_state",
            mode=self.mode,
            phase=self.state.phase,
            current_player=self.state.current_player,
            board=list(self.state.board),
            turn_count=self.state.turn_count,
            winner=self.state.winner,
            winning_line=list(self.state.winning_line) if self.state.winning_line else None,
            is_draw=self.state.is_draw,
            draw_reason=self.state.draw_reason,
        )

    def reset(
        self,
        mode: Optional[str] = None,
        player_team: Optional[int] = None,
        first_player: Optional[int] = None,
    ) -> None:
        if mode is not None:
            if mode not in ("pvp", "pva"):
                raise ValueError("mode must be pvp or pva")
            self.mode = mode
        if player_team is not None:
            if player_team not in (1, 2):
                raise ValueError("player_team must be 1 or 2")
            self.player_team = player_team
        if first_player is not None:
            if first_player not in (1, 2):
                raise ValueError("first_player must be 1 or 2")
            self.first_player = first_player
        self.state = new_game(self.first_player)
        self.physical_position_valid = isinstance(self.transport, SimulationTransport)
        self.move_id = 0
        self.moving_robot_id = None
        self.last_error = None
        self.match_history.clear()
        for robot in self.robots.values():
            robot.status = "idle"
            robot.current_node = None
            robot.position = "BAY" if self.physical_position_valid else "UNKNOWN"
        self._emit("reset_game")
        self.snapshot()

    def join_game(self, mode: str, player_team: int, first_player: int = 1) -> Event:
        self.reset(mode, player_team, first_player)
        return self._emit(
            "hello_ack",
            mode=self.mode,
            player_team=self.player_team,
            first_player=self.first_player,
        )

    def robot_for_move(self, move: Move) -> RobotRuntime:
        if not self.physical_position_valid:
            raise IllegalMove("robot positions require camera resynchronization")
        if move.robot_id is not None:
            robot = self.robots.get(move.robot_id)
            if robot is None or robot.team != move.player:
                raise IllegalMove("robot does not belong to the current player")
            if robot.status == "error":
                raise IllegalMove("robot requires recovery before it can move")
            if move.source_node is None and robot.current_node is not None:
                raise IllegalMove("drop robot is already on the board")
            if move.source_node is not None and robot.current_node != move.source_node:
                raise IllegalMove("robot is not at the source node")
            return robot

        candidates = [robot for robot in self.robots.values() if robot.team == move.player]
        if move.source_node is None:
            candidates = [robot for robot in candidates if robot.current_node is None]
        else:
            candidates = [robot for robot in candidates if robot.current_node == move.source_node]
        if not candidates:
            raise IllegalMove("no robot matches the requested move")
        return candidates[0]

    def _occupied_nodes(self, robot_id: int) -> List[int]:
        return [robot.current_node for robot in self.robots.values() if robot.robot_id != robot_id and robot.current_node is not None]

    def _path_for_move(self, robot: RobotRuntime, move: Move) -> MotionPath:
        start_node = move.source_node
        if start_node is None:
            bay = DEFAULT_BAYS_MM[robot.robot_id]
            entry_node = BAY_ENTRY_NODES[robot.robot_id]
            occupied = self._occupied_nodes(robot.robot_id)

            # Direct bay -> target when target IS the entry node and it is free.
            if entry_node == move.target_node and entry_node not in occupied:
                return pose_to_node_trajectory(
                    (bay[0], bay[1], 0.0),
                    move.target_node,
                    self.board_nodes_mm,
                    speed_mm_s=MOTION_SPEED_MM_S,
                )

            # Entry node occupied: evasion is handled in execute_move before
            # this call; build a direct bay->target trajectory so the planner
            # does not raise here (the displaced blocker has already been moved).
            if entry_node in occupied:
                return pose_to_node_trajectory(
                    (bay[0], bay[1], 0.0),
                    move.target_node,
                    self.board_nodes_mm,
                    speed_mm_s=MOTION_SPEED_MM_S,
                )

            # Normal drop: A* from entry node to target through the board graph.
            # When intermediate nodes are all blocked (board nearly full) fall
            # back to a direct physical trajectory bay->target.  This is safe
            # because no rover occupies the target cell at this point.
            try:
                route = plan_node_route(entry_node, move.target_node, occupied)
                return route_to_trajectory(
                    route,
                    self.board_nodes_mm,
                    start_pose=(bay[0], bay[1], 0.0),
                    speed_mm_s=MOTION_SPEED_MM_S,
                )
            except ValueError:
                # All graph paths blocked -> drive straight from bay to target.
                return pose_to_node_trajectory(
                    (bay[0], bay[1], 0.0),
                    move.target_node,
                    self.board_nodes_mm,
                    speed_mm_s=MOTION_SPEED_MM_S,
                )

        return direct_move_trajectory(
            start_node,
            move.target_node,
            self.board_nodes_mm,
            speed_mm_s=MOTION_SPEED_MM_S,
        )
    def _execute_motion(self, robot: RobotRuntime, path: MotionPath, target_node: int) -> None:
        """Run one physical motion without changing the logical game board."""
        self.move_id += 1
        self.sequence += 1
        self.moving_robot_id = robot.robot_id
        robot.status = "moving"
        robot.position = "MOVING"
        self._emit_robot_status(robot)
        self._emit(
            "move_start",
            robot_id=robot.robot_id,
            start=robot.current_node if robot.current_node is not None else f"BAY-{robot.robot_id}",
            goal=target_node,
            path=list(path.node_ids),
            waypoints=[
                {"x": point[0], "y": point[1], "label": str(node) if index < len(path.node_ids) else f"WP-{index}"}
                for index, point in enumerate(path.waypoints)
                for node in (path.node_ids[index] if index < len(path.node_ids) else path.node_ids[-1],)
            ],
            duration_ms=max(250, int(path.waypoints[-1][3] * 1000)) if path.waypoints else 1000,
        )
        self._emit(
            "astar_result",
            planner="direct_edge" if len(path.node_ids) <= 2 else "astar",
            start=path.node_ids[0] if path.node_ids else robot.robot_id + 100,
            goal=target_node,
            path=list(path.node_ids),
            cost=path.cost_mm,
            explored_count=len(path.node_ids),
            calc_ms=0,
        )
        try:
            result = self.transport.execute(robot.robot_id, path, self.move_id)
        except Exception as error:
            if not isinstance(self.transport, SimulationTransport):
                self.physical_position_valid = False
            self.fail_move(robot.robot_id, "transport_error: %s" % error)
            raise RuntimeError("robot transport failed") from error
        if result.get("status") != "completed":
            self.fail_move(robot.robot_id, str(result.get("status", "transport_error")))
            raise RuntimeError("robot transport did not complete the move")
        robot.current_node = target_node
        robot.status = "arrived"
        robot.position = str(target_node)
        self.moving_robot_id = None
        self._emit_robot_status(robot)
        self._emit(
            "move_complete",
            robot_id=robot.robot_id,
            goal=target_node,
            board=list(self.state.board),
            auxiliary=True,
        )

    def _prepare_drop_evasion(self, robot: RobotRuntime, target_node: int) -> Optional[list]:
        """Sử dụng BFS tìm ô trống gần nhất để trượt các xe đang kẹt ở cửa ngõ (Evasion).
        
        Trả về một Stack chứa danh sách các chuyển động cần thiết để dọn đường.
        """
        entry_node = BAY_ENTRY_NODES[robot.robot_id]

        # Lấy danh sách ID của các xe đang chiếm giữ các ô trên bàn cờ
        occupied_map = {r.current_node: r for r in self.robots.values() if r.current_node is not None}

        # Nếu cửa ngõ không bị chiếm, không cần né
        if entry_node not in occupied_map:
            return None

        # Thuật toán BFS tìm đường đi ngắn nhất đến Ô TRỐNG đầu tiên
        queue = deque([[entry_node]])
        visited = {entry_node}
        sliding_path = None

        while queue:
            path = queue.popleft()
            current = path[-1]

            # Đã tìm thấy một ô trống! (Ô này không chứa xe nào và không phải là đích đến của xe mới)
            if current not in occupied_map and current != target_node:
                sliding_path = path
                break

            # Nếu ô vẫn bị chặn, tiếp tục lan tỏa ra các ô kề cạnh (neighbors)
            for neighbor in BOARD_NEIGHBORS[current]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(path + [neighbor])

        if not sliding_path:
            raise IllegalMove("Toàn bộ bàn cờ đã kẹt cứng, không còn ô trống nào để né!")

        # sliding_path có dạng: [entry_node, n1, n2, empty_node]
        # Ta cần đẩy từng chiếc xe dọc theo đường đi này vào khoảng trống
        evasion_stack = []

        # 1. Quét từ ô trống ngược về cửa ngõ (LIFO)
        for i in range(len(sliding_path) - 1, 0, -1):
            from_node = sliding_path[i - 1]
            to_node = sliding_path[i]
            displaced_robot = occupied_map[from_node]

            # Thực thi di chuyển thật trên sa bàn
            path_trajectory = direct_move_trajectory(
                from_node,
                to_node,
                self.board_nodes_mm,
                speed_mm_s=MOTION_SPEED_MM_S,
            )
            self._execute_motion(displaced_robot, path_trajectory, to_node)

            # Phát sự kiện cho Web hiển thị (dùng clear_bay_entrance để tương thích chuẩn unit test và web)
            self._emit(
                "evasion_step",
                action="clear_bay_entrance",
                robot_id=displaced_robot.robot_id,
                from_node=from_node,
                to_node=to_node,
            )

            # Lưu vào stack để lát nữa phục hồi
            evasion_stack.append((displaced_robot, from_node, to_node))

            # Cập nhật tạm trạng thái logic
            occupied_map[to_node] = displaced_robot
            del occupied_map[from_node]

        # Trả về stack để hàm execute_move gọi lệnh pop() phục hồi sau khi xe chính đã vào bàn
        return evasion_stack

    def _emit_robot_status(self, robot: RobotRuntime) -> None:
        self._emit(
            "robot_status",
            robot_id=robot.robot_id,
            status=robot.status,
            position=robot.position,
            battery=robot.battery,
            speed_pwm=robot.speed_pwm,
        )

    def execute_move(self, move: Move) -> Event:
        if self.moving_robot_id is not None:
            raise IllegalMove("another robot is already moving")
        robot = self.robot_for_move(move)
        next_state = apply_move(self.state, move)
        evasion_stack = []
        if move.source_node is None:
            evasion_stack = self._prepare_drop_evasion(robot, move.target_node) or []
        try:
            try:
                path = self._path_for_move(robot, move)
            except ValueError:
                if not evasion_stack:
                    raise
                bay = DEFAULT_BAYS_MM[robot.robot_id]
                path = pose_to_node_trajectory(
                    (bay[0], bay[1], 0.0),
                    move.target_node,
                    self.board_nodes_mm,
                    speed_mm_s=MOTION_SPEED_MM_S,
                )
            self._execute_motion(robot, path, move.target_node)
            self.match_history.append((self.state.board, move.player, move.source_node, move.target_node))
            self.state = next_state
        except Exception:
            if evasion_stack and not isinstance(self.transport, SimulationTransport):
                self.physical_position_valid = False
            raise

        # Restore displaced robots in LIFO (reverse) order
        while evasion_stack:
            displaced_robot, original_src, temporary_dst = evasion_stack.pop()
            restore_path = direct_move_trajectory(
                temporary_dst,
                original_src,
                self.board_nodes_mm,
                speed_mm_s=MOTION_SPEED_MM_S,
            )
            self._execute_motion(displaced_robot, restore_path, original_src)
            self._emit(
                "evasion_step",
                action="restore_blocking_robot",
                robot_id=displaced_robot.robot_id,
                from_node=temporary_dst,
                to_node=original_src,
            )
        return self.complete_move(robot.robot_id, move.target_node)

    def complete_move(self, robot_id: int, target_node: int) -> Event:
        robot = self.robots[robot_id]
        robot.current_node = target_node
        robot.status = "arrived"
        robot.position = str(target_node)
        self.moving_robot_id = None
        self._emit_robot_status(robot)
        event = self._emit(
            "move_complete",
            robot_id=robot_id,
            goal=target_node,
            board=list(self.state.board),
        )
        if self.state.winner is not None or self.state.is_draw:
            ai_learned = False
            losses_learned = self.experience.losses_learned
            if self.mode == "pva" and self.state.winner is not None:
                ai_player = 2 if self.player_team == 1 else 1
                stats = self.experience.record_game(self.match_history, self.state.winner, ai_player)
                ai_learned = self.state.winner != ai_player
                losses_learned = stats["losses_learned"]
            self._emit(
                "game_over",
                winner=self.state.winner,
                is_draw=self.state.is_draw,
                draw_reason=self.state.draw_reason,
                winning_line=list(self.state.winning_line or ()),
                board=list(self.state.board),
                ai_learned=ai_learned,
                losses_learned=losses_learned,
            )
        self.snapshot()
        return event

    def fail_move(self, robot_id: int, reason: str) -> None:
        robot = self.robots[robot_id]
        robot.status = "error"
        self.moving_robot_id = None
        self.last_error = reason
        self._emit_robot_status(robot)
        self._emit("fault", robot_id=robot_id, message=reason)

    def request_move(self, player: int, source_node: Optional[int], target_node: int, robot_id: Optional[int] = None) -> Event:
        if self.mode == "pva" and player != self.player_team:
            raise IllegalMove("only the human player's team may submit a move")
        move = Move(player, source_node, target_node, robot_id)
        if player != self.state.current_player:
            raise IllegalMove("move belongs to the other player")
        return self.execute_move(move)

    def ai_move(self, depth: int = 8) -> Optional[Event]:
        if (
            self.mode != "pva"
            or self.state.winner is not None
            or self.state.is_draw
            or self.state.current_player == self.player_team
        ):
            return None
        ai_player = 2 if self.player_team == 1 else 1
        self._emit("ai_thinking", player=ai_player, depth=depth)
        started = monotonic()
        decision: MinimaxDecision = choose_move(
            self.state,
            ai_player=ai_player,
            max_depth=depth,
            experience=self.experience,
        )
        if decision.move is None:
            return None
        robot = self.robot_for_move(decision.move)
        self._emit(
            "ai_decision",
            robot_id=robot.robot_id,
            from_node=decision.move.source_node,
            **{"from": decision.move.source_node},
            to=decision.move.target_node,
            depth=decision.depth,
            eval_score=decision.score,
            nodes_searched=decision.nodes_searched,
            calc_ms=max(decision.elapsed_ms, int((monotonic() - started) * 1000)),
            used_experience=decision.used_experience,
            losses_learned=self.experience.losses_learned,
        )
        return self.execute_move(Move(ai_player, decision.move.source_node, decision.move.target_node, robot.robot_id))

    def emergency_stop(self) -> Event:
        self.transport.emergency_stop()
        for robot in self.robots.values():
            if robot.status == "moving":
                robot.status = "error"
                robot.position = "UNKNOWN"
                self._emit_robot_status(robot)
        if not isinstance(self.transport, SimulationTransport):
            self.physical_position_valid = False
            for robot in self.robots.values():
                robot.status = "error"
                robot.position = "UNKNOWN"
        self.moving_robot_id = None
        return self._emit("fault", message="emergency_stop")

    def resync_positions(self, positions: Dict[int, Optional[int]]) -> None:
        """Accept a camera-confirmed robot position map before resuming hardware."""
        for robot_id, node in positions.items():
            robot = self.robots.get(robot_id)
            if robot is None:
                raise ValueError("unknown robot id")
            if node is not None and node not in self.board_nodes_mm:
                raise ValueError("unknown board node")
            robot.current_node = node
            robot.position = "BAY" if node is None else str(node)
            robot.status = "idle"
        if set(positions) == set(self.robots):
            self.physical_position_valid = True

    def set_robot_led(self, robot_id: int, r: int, g: int, b: int, brightness: int = 200) -> None:
        """Gửi lệnh đổi màu LED tới xe robot thông qua transport.

        Trong chế độ simulation, bỏ qua (không lỗi).
        Trong chế độ hardware, gọi set_led trên serial transport nếu hỗ trợ.
        """
        if isinstance(self.transport, SimulationTransport):
            return
        set_led_fn = getattr(self.transport, "set_led", None)
        if callable(set_led_fn):
            set_led_fn(robot_id, r, g, b, brightness)

    def set_simulation_mode(self, enabled: bool, hardware_transport: Any = None) -> Event:
        """Chuyển đổi linh hoạt giữa chế độ Mô phỏng Demo và Phần cứng Thực tế."""
        if enabled:
            if not isinstance(self.transport, SimulationTransport):
                self._saved_hardware_transport = self.transport
            self.transport = SimulationTransport()
            self.physical_position_valid = True
        else:
            hw = hardware_transport or getattr(self, "_saved_hardware_transport", None)
            if hw is not None:
                self.transport = hw
            self.physical_position_valid = True
        return self._emit(
            "simulation_mode",
            enabled=isinstance(self.transport, SimulationTransport),
        )

    def hardware_check(self, camera: Any = None, serial_device: str = "/dev/ttyUSB0") -> Event:
        """Kiểm tra toàn diện phần cứng trước khi vào bàn chơi thực tế:
        1. Camera USB & Hiệu chuẩn 4 góc ArUco (90..93)
        2. Kết nối Serial USB tới ESP32 Coordinator
        3. Gửi gói tin khởi động (ROBOT_CMD_PING) tới 6 xe qua ESP-NOW và kiểm tra phản hồi PONG
        """
        # 1. Camera check
        cam_status: Dict[str, Any] = {}
        if camera is not None and hasattr(camera, "status"):
            cam_status = dict(camera.status())
        camera_online = bool(cam_status.get("online", self.camera_online))
        camera_calibrated = bool(cam_status.get("calibrated", self.board_detected))
        missing_corners = list(cam_status.get("missing_markers", [] if camera_calibrated else [90, 91, 92, 93]))
        markers_seen = list(cam_status.get("markers_seen", []))
        cam_robots = dict(cam_status.get("robots", {}))

        # 2. Coordinator Serial check
        hw_transport = None
        if not isinstance(self.transport, SimulationTransport):
            hw_transport = self.transport
        else:
            hw_transport = getattr(self, "_saved_hardware_transport", None)
        coordinator_error: Optional[str] = None
        if hw_transport is None:
            try:
                from .serial_coordinator import open_serial_transport

                hw_transport = open_serial_transport(serial_device)
                self._saved_hardware_transport = hw_transport
            except Exception as exc:
                coordinator_error = str(exc)

        coordinator_connected = hw_transport is not None

        # 3. Ping 6 robots via Coordinator ESP-NOW (ưu tiên điểm danh đồng loạt robot_id=0)
        robot_checks: List[Dict[str, Any]] = []
        ping_roster_fn = getattr(hw_transport, "ping_roster", None) if hw_transport is not None else None
        ping_fn = getattr(hw_transport, "ping_robot", None) if hw_transport is not None else None

        online_set = set()
        used_batch_roster = False
        if callable(ping_roster_fn):
            try:
                roster_res = ping_roster_fn(timeout_s=0.8)
                if isinstance(roster_res, dict) and ("online_ids" in roster_res or "missing_ids" in roster_res):
                    online_set = {int(x) for x in roster_res.get("online_ids", [])}
                    used_batch_roster = True
            except Exception:
                used_batch_roster = False

        online_ids: List[int] = []
        missing_ids: List[int] = []
        all_robots_ok = True
        for rid in range(1, 7):
            if used_batch_roster:
                espnow_ok = rid in online_set
            elif callable(ping_fn):
                try:
                    espnow_ok = bool(ping_fn(rid, timeout_s=0.45))
                except Exception:
                    espnow_ok = False
            else:
                espnow_ok = False

            if espnow_ok:
                online_ids.append(rid)
            else:
                missing_ids.append(rid)
                all_robots_ok = False

            qr_seen = rid in markers_seen or str(rid) in cam_robots
            pose_info = cam_robots.get(str(rid)) or cam_robots.get(rid)
            if rid in self.robots:
                self.robots[rid].status = "idle" if espnow_ok else "offline"
            robot_checks.append(
                {
                    "robot_id": rid,
                    "team": 1 if rid <= 3 else 2,
                    "espnow_ok": espnow_ok,
                    "qr_seen": qr_seen,
                    "heading_deg": round(pose_info["heading_deg"], 1) if isinstance(pose_info, dict) and "heading_deg" in pose_info else None,
                }
            )

        ready = camera_online and camera_calibrated and coordinator_connected and all_robots_ok
        if coordinator_connected and hw_transport is not None:
            self.transport = hw_transport
            self.physical_position_valid = True

        return self._emit(
            "hardware_check_result",
            ready=ready,
            simulation_mode=isinstance(self.transport, SimulationTransport),
            camera_online=camera_online,
            camera_calibrated=camera_calibrated,
            missing_corners=missing_corners,
            markers_seen=markers_seen,
            coordinator_connected=coordinator_connected,
            coordinator_device=serial_device,
            coordinator_error=coordinator_error,
            active_peers=len(online_ids),
            online_ids=online_ids,
            missing_ids=missing_ids,
            robots=robot_checks,
        )

    def telemetry(self) -> Event:
        return self._emit(
            "system_telemetry",
            free_heap_kb=0,
            min_heap_kb=0,
            camera_fps=self.camera_fps,
            espnow_active_peers=sum(robot.status != "offline" for robot in self.robots.values()),
            core0_load=0,
            core1_load=0,
        )
