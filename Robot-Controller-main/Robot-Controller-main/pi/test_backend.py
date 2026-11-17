"""Integration tests for the authoritative Raspberry Pi backend."""

import unittest

from .backend import MorrisBackend
from .morris_game import IllegalMove, Move


class BackendTests(unittest.TestCase):
    def test_pva_honors_human_team_and_first_player(self):
        backend = MorrisBackend()
        backend.join_game("pva", player_team=2, first_player=2)

        self.assertEqual(backend.state.current_player, 2)
        with self.assertRaises(IllegalMove):
            backend.request_move(1, None, 0, robot_id=1)

        backend.request_move(2, None, 0, robot_id=4)
        self.assertEqual(backend.state.current_player, 1)

    def test_transport_exception_marks_robot_as_failed(self):
        class BrokenTransport:
            def execute(self, robot_id, path, move_id=0):
                raise OSError("USB disconnected")

            def emergency_stop(self):
                pass

        backend = MorrisBackend(transport=BrokenTransport())
        with self.assertRaises(RuntimeError):
            backend.request_move(1, None, 0, robot_id=1)

        self.assertEqual(backend.robots[1].status, "error")
        self.assertIsNone(backend.moving_robot_id)
        with self.assertRaises(IllegalMove):
            backend.request_move(1, None, 1, robot_id=1)

    def test_hardware_stop_requires_position_resynchronization(self):
        class HardwareTransport:
            def execute(self, robot_id, path, move_id=0):
                return {"status": "completed"}

            def emergency_stop(self):
                pass

        backend = MorrisBackend(transport=HardwareTransport())
        backend.emergency_stop()
        with self.assertRaises(IllegalMove):
            backend.request_move(1, None, 0, robot_id=1)

        backend.resync_positions({robot_id: None for robot_id in range(1, 7)})
        backend.request_move(1, None, 0, robot_id=1)

    def test_drop_path_uses_obstacle_aware_route_from_bay(self):
        backend = MorrisBackend()
        backend.robots[2].current_node = 3

        path = backend._path_for_move(backend.robots[1], Move(1, None, 2, 1))

        self.assertNotIn(3, path.node_ids[1:-1])
        self.assertEqual(path.waypoints[0][:2], (-150.0, 0.0))

    def test_drop_evasion_temporarily_clears_blocked_bay_entrance(self):
        backend = MorrisBackend()
        backend.join_game("pvp", player_team=1, first_player=2)
        backend.robots[1].current_node = 2
        events = []
        backend.subscribe(events.append)

        backend.request_move(2, None, 1, robot_id=4)

        self.assertEqual(backend.state.board[1], 2)
        self.assertEqual(backend.robots[1].current_node, 2)
        self.assertEqual(backend.robots[4].current_node, 1)
        self.assertEqual(
            [event["action"] for event in events if event["type"] == "evasion_step"],
            ["clear_bay_entrance", "restore_blocking_robot"],
        )

    def test_simulation_move_emits_frontend_events_and_commits_state(self):
        backend = MorrisBackend()
        events = []
        backend.subscribe(events.append)

        backend.request_move(1, None, 0, robot_id=1)

        event_types = [event["type"] for event in events]
        self.assertEqual(backend.state.board[0], 1)
        self.assertIn("move_start", event_types)
        self.assertIn("robot_status", event_types)
        self.assertIn("move_complete", event_types)
        self.assertEqual(backend.robots[1].current_node, 0)

    def test_backend_rejects_move_during_active_motion(self):
        class PendingTransport:
            def execute(self, robot_id, path, move_id=0):
                return {"status": "pending"}

            def emergency_stop(self):
                pass

        backend = MorrisBackend(transport=PendingTransport())
        with self.assertRaises(RuntimeError):
            backend.request_move(1, None, 0, robot_id=1)
        self.assertIsNone(backend.state.board[0])

    def test_pva_auto_runs_ai_after_human_move(self):
        backend = MorrisBackend()
        backend.join_game("pva", 1)
        backend.request_move(1, None, 0, robot_id=1)
        backend.ai_move()

        self.assertEqual(backend.state.current_player, 1)
        self.assertEqual(sum(cell is not None for cell in backend.state.board), 2)

    def test_emergency_stop_emits_fault(self):
        backend = MorrisBackend()
        events = []
        backend.subscribe(events.append)

        backend.emergency_stop()

        self.assertEqual(events[-1]["type"], "fault")


if __name__ == "__main__":
    unittest.main()
