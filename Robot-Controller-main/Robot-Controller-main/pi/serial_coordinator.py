"""USB Serial transport from Raspberry Pi to the ESP32 Coordinator."""

import json
import math
from dataclasses import dataclass, field
from time import monotonic
from typing import Any, Callable, Dict, List, Optional

from .board_planner import MotionPath
from .coordinator_protocol import Envelope, ProtocolError, decode_message, encode_message, led_color_message, ping_message, waypoint_message


@dataclass
class SerialCoordinatorTransport:
    serial_port: Any
    ack_timeout_s: float = 20.0
    speed: int = 120
    sequence: int = 0
    on_event: Optional[Callable[[Dict[str, Any]], None]] = None
    last_roster: Dict[str, Any] = field(
        default_factory=lambda: {
            "active_peers": 0,
            "total_robots": 6,
            "online_ids": [],
            "missing_ids": [1, 2, 3, 4, 5, 6],
        }
    )
    robot_states: Dict[int, Dict[str, Any]] = field(default_factory=dict)
    last_fault: Optional[Dict[str, Any]] = None

    def _next_sequence(self) -> int:
        value = self.sequence
        self.sequence = (self.sequence + 1) % 65536
        return value

    def _handle_async_message(self, message: Envelope) -> None:
        """Xu ly cac goi tin phan hoi nguoc tu Xe -> Coordinator -> Pi 3 (robot_status, system_info, fault)."""
        payload = dict(message.payload)
        if message.message_type == "robot_status":
            rid = int(payload.get("robot_id", 0))
            if 1 <= rid <= 6:
                self.robot_states[rid] = payload
                status_str = str(payload.get("status", "idle"))
                online_set = set(self.last_roster.get("online_ids", []))
                if status_str == "offline":
                    online_set.discard(rid)
                else:
                    online_set.add(rid)
                online_ids = sorted(online_set)
                missing_ids = [i for i in range(1, 7) if i not in online_set]
                self.last_roster = {
                    "active_peers": len(online_ids),
                    "total_robots": 6,
                    "online_ids": online_ids,
                    "missing_ids": missing_ids,
                }
        elif message.message_type == "system_info":
            online_ids = [int(x) for x in payload.get("online_ids", []) if 1 <= int(x) <= 6]
            missing_ids = [int(x) for x in payload.get("missing_ids", []) if 1 <= int(x) <= 6]
            if online_ids or missing_ids:
                self.last_roster = {
                    "active_peers": int(payload.get("active_peers", len(online_ids))),
                    "total_robots": int(payload.get("total_robots", 6)),
                    "online_ids": online_ids,
                    "missing_ids": missing_ids,
                }
        elif message.message_type == "fault":
            self.last_fault = payload

        if callable(self.on_event):
            self.on_event({"type": message.message_type, **payload})

    def _update_roster_from_ack(self, payload: Dict[str, Any]) -> None:
        if "online_ids" in payload or "missing_ids" in payload:
            online_ids = [int(x) for x in payload.get("online_ids", []) if 1 <= int(x) <= 6]
            missing_ids = [int(x) for x in payload.get("missing_ids", []) if 1 <= int(x) <= 6]
            self.last_roster = {
                "active_peers": int(payload.get("active_peers", len(online_ids))),
                "total_robots": int(payload.get("total_robots", 6)),
                "online_ids": online_ids,
                "missing_ids": missing_ids,
            }

    def _wait_for_ack_envelope(self, sequence: int) -> Optional[Envelope]:
        deadline = monotonic() + self.ack_timeout_s
        while monotonic() < deadline:
            line = self.serial_port.readline()
            if not line:
                continue
            try:
                message = decode_message(line)
            except ProtocolError:
                continue
            if message.message_type != "ack":
                self._handle_async_message(message)
                continue
            if message.sequence != sequence:
                continue
            self._update_roster_from_ack(message.payload)
            return message
        return None

    def _wait_for_ack(self, sequence: int) -> bool:
        envelope = self._wait_for_ack_envelope(sequence)
        if envelope is None:
            return False
        return envelope.payload.get("status") in ("completed", "reached")

    def execute(self, robot_id: int, path: MotionPath, move_id: int = 0) -> dict:
        """Send each waypoint in the path and wait for ACK before advancing.

        ``move_id`` uniquely identifies this logical game move and is embedded
        in every waypoint packet so the ESP32 Coordinator can correlate them.
        """
        for index, waypoint in enumerate(path.waypoints):
            sequence = self._next_sequence()
            packet = waypoint_message(
                sequence=sequence,
                robot_id=robot_id,
                move_id=move_id,          # fixed: use the logical move_id, not sequence
                waypoint_index=index,
                waypoint_count=len(path.waypoints),
                x_mm=round(waypoint[0]),
                y_mm=round(waypoint[1]),
                heading_mrad=round(waypoint[2] * 1000),
                speed=self.speed,
            )
            try:
                self.serial_port.write(packet)
            except Exception as error:
                return {"status": "write_error", "error": str(error), "waypoint_index": index}
            if not self._wait_for_ack(sequence):
                return {"status": "timeout", "sequence": sequence, "waypoint_index": index}
        return {"status": "completed"}

    def set_led(self, robot_id: int, r: int, g: int, b: int, brightness: int = 200) -> bool:
        """Dat mau 5 LED tren xe: Pi -> Coordinator (set_led) -> ESP-NOW ROBOT_CMD_SET_LED."""
        sequence = self._next_sequence()
        packet = led_color_message(sequence, robot_id, r, g, b, brightness)
        try:
            self.serial_port.write(packet)
        except Exception:
            return False
        return self._wait_for_ack(sequence)

    def ping_robot(self, robot_id: int, timeout_s: float = 0.6) -> bool:
        """Gửi gói tin khởi động/kiểm tra (ROBOT_CMD_PING) tới xe robot_id và chờ PONG."""
        sequence = self._next_sequence()
        packet = ping_message(sequence, robot_id)
        old_timeout = self.ack_timeout_s
        self.ack_timeout_s = timeout_s
        try:
            self.serial_port.write(packet)
            return self._wait_for_ack(sequence)
        except Exception:
            return False
        finally:
            self.ack_timeout_s = old_timeout

    def ping_roster(self, timeout_s: float = 0.8) -> Dict[str, Any]:
        """Điểm danh đồng loạt cả 6 xe (robot_id=0) trong 1 cửa sổ 400ms.

        Trả về dict chứa:
          - status: 'completed' | 'timeout'
          - active_peers: sĩ số xe online
          - total_robots: 6
          - online_ids: danh sách ID xe có mặt (phản hồi PONG)
          - missing_ids: danh sách ID xe vắng mặt / offline
        """
        sequence = self._next_sequence()
        packet = ping_message(sequence, 0)
        old_timeout = self.ack_timeout_s
        self.ack_timeout_s = timeout_s
        try:
            self.serial_port.write(packet)
            envelope = self._wait_for_ack_envelope(sequence)
            if envelope is not None and ("online_ids" in envelope.payload or "missing_ids" in envelope.payload):
                online_ids = [int(x) for x in envelope.payload.get("online_ids", []) if 1 <= int(x) <= 6]
                missing_ids = [int(x) for x in envelope.payload.get("missing_ids", []) if 1 <= int(x) <= 6]
                return {
                    "status": str(envelope.payload.get("status", "completed")),
                    "active_peers": int(envelope.payload.get("active_peers", len(online_ids))),
                    "total_robots": int(envelope.payload.get("total_robots", 6)),
                    "online_ids": online_ids,
                    "missing_ids": missing_ids,
                }
        except Exception:
            pass
        finally:
            self.ack_timeout_s = old_timeout

        # Fallback: nếu firmware Coordinator cũ chưa trả mảng online_ids, quét từng xe 1..6
        online_ids: List[int] = []
        missing_ids: List[int] = []
        for rid in range(1, 7):
            if self.ping_robot(rid, timeout_s=min(0.45, timeout_s)):
                online_ids.append(rid)
            else:
                missing_ids.append(rid)
        self.last_roster = {
            "active_peers": len(online_ids),
            "total_robots": 6,
            "online_ids": online_ids,
            "missing_ids": missing_ids,
        }
        return {"status": "completed", **self.last_roster}

    def emergency_stop(self) -> None:
        sequence = self._next_sequence()
        try:
            self.serial_port.write(encode_message(sequence, "emergency_stop", {"scope": "all"}))
        except Exception:
            return None


def open_serial_transport(device: str, baudrate: int = 115200, timeout_s: float = 0.05) -> SerialCoordinatorTransport:
    """Open a pyserial device only when hardware mode is requested."""
    try:
        import serial
    except ImportError as error:
        raise RuntimeError("install the optional 'pyserial' package for hardware mode") from error
    return SerialCoordinatorTransport(serial.Serial(device, baudrate=baudrate, timeout=timeout_s))
