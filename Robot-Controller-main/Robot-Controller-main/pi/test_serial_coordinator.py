"""Tests for the Pi Serial Coordinator adapter using a fake serial port."""

import unittest

from .board_planner import MotionPath
from .coordinator_protocol import decode_message, encode_message
from .serial_coordinator import SerialCoordinatorTransport


class FakeSerial:
    def __init__(self):
        self.writes = []
        self.responses = []

    def write(self, data):
        self.writes.append(data)
        message = decode_message(data)
        self.responses.append(encode_message(message.sequence, "ack", {"status": "completed"}))

    def readline(self):
        return self.responses.pop(0) if self.responses else b""


def _two_waypoint_path() -> MotionPath:
    return MotionPath(
        node_ids=(0, 1),
        waypoints=((0.0, 0.0, 0.0, 0.0, 0), (100.0, 0.0, 0.0, 1.0, 0)),
        cost_mm=100.0,
    )


class SerialCoordinatorTests(unittest.TestCase):
    def test_execute_sends_each_trajectory_waypoint(self):
        serial_port = FakeSerial()
        transport = SerialCoordinatorTransport(serial_port, ack_timeout_s=0.01)

        result = transport.execute(1, _two_waypoint_path())

        self.assertEqual(result["status"], "completed")
        self.assertEqual(len(serial_port.writes), 2)
        self.assertEqual(decode_message(serial_port.writes[1]).payload["x_mm"], 100)

    def test_emergency_stop_uses_high_level_command(self):
        serial_port = FakeSerial()
        transport = SerialCoordinatorTransport(serial_port)

        transport.emergency_stop()

        message = decode_message(serial_port.writes[0])
        self.assertEqual(message.message_type, "emergency_stop")
        self.assertEqual(message.payload["scope"], "all")

    def test_move_id_is_consistent_across_all_waypoints(self):
        """Every waypoint in one execute() call must carry the same move_id.

        Before the fix, move_id was set to the sequence counter which
        increments per waypoint, so each waypoint had a different move_id.
        The ESP32 Coordinator would be unable to group them into one move.
        """
        serial_port = FakeSerial()
        transport = SerialCoordinatorTransport(serial_port, ack_timeout_s=0.01)
        logical_move_id = 7

        transport.execute(1, _two_waypoint_path(), move_id=logical_move_id)

        move_ids = [
            decode_message(raw).payload["move_id"]
            for raw in serial_port.writes
        ]
        # All waypoints must share the same logical move_id.
        self.assertTrue(all(mid == logical_move_id for mid in move_ids),
                        f"move_ids were not all {logical_move_id}: {move_ids}")

    def test_move_id_differs_from_sequence_counter(self):
        """move_id must remain stable even though the sequence counter advances."""
        serial_port = FakeSerial()
        transport = SerialCoordinatorTransport(serial_port, ack_timeout_s=0.01)

        transport.execute(1, _two_waypoint_path(), move_id=42)

        packets = [decode_message(raw) for raw in serial_port.writes]
        # Sequence numbers advance (0, 1) but move_id stays 42.
        sequences = [p.sequence for p in packets]
        move_ids = [p.payload["move_id"] for p in packets]
        self.assertEqual(len(set(sequences)), 2, "sequence numbers must be unique")
        self.assertEqual(set(move_ids), {42}, "move_id must be fixed at 42")


if __name__ == "__main__":
    unittest.main()
