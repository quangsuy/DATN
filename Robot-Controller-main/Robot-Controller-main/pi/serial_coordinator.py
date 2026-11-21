"""USB Serial transport from Raspberry Pi to the ESP32 Coordinator."""

import json
import math
from dataclasses import dataclass
from time import monotonic
from typing import Any, Optional

from .board_planner import MotionPath
from .coordinator_protocol import ProtocolError, decode_message, encode_message, led_color_message, ping_message, waypoint_message


@dataclass
class SerialCoordinatorTransport:
    serial_port: Any
    ack_timeout_s: float = 20.0
    speed: int = 120
    sequence: int = 0

    def _next_sequence(self) -> int:
        value = self.sequence
        self.sequence = (self.sequence + 1) % 65536
        return value

    def _wait_for_ack(self, sequence: int) -> bool:
        deadline = monotonic() + self.ack_timeout_s
        while monotonic() < deadline:
            line = self.serial_port.readline()
            if not line:
                continue
            try:
                message = decode_message(line)
            except ProtocolError:
                continue
            if message.sequence != sequence:
                continue
            if message.message_type == "ack":
                return message.payload.get("status") in ("completed", "reached")
        return False

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
