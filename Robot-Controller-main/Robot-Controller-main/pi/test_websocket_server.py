"""Smoke tests for the VM-friendly WebSocket adapter."""

import asyncio
import json
import unittest

from .backend import MorrisBackend
from .websocket_server import MorrisWebSocketServer, build_backend


class FakeWebSocket:
    remote_address = ("test", 0)

    def __init__(self, messages):
        self.messages = messages
        self.sent = []

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self.messages:
            return self.messages.pop(0)
        await asyncio.sleep(0.01)
        raise StopAsyncIteration

    async def send(self, message):
        self.sent.append(json.loads(message))


class WebSocketServerTests(unittest.TestCase):
    def test_simulation_transport_is_default_and_serial_is_lazy(self):
        backend = build_backend()
        self.assertIsInstance(backend, MorrisBackend)
        self.assertEqual(backend.transport.__class__.__name__, "SimulationTransport")

    def test_handler_accepts_ping_and_sends_ack(self):
        websocket = FakeWebSocket([json.dumps({"type": "ping"})])
        asyncio.run(MorrisWebSocketServer().handler(websocket))

        event_types = [event["type"] for event in websocket.sent]
        self.assertIn("hello_ack", event_types)
        self.assertIn("game_state", event_types)
        self.assertIn("pong", event_types)

    def test_pva_triggers_ai_after_each_human_move(self):
        server = MorrisWebSocketServer()
        events = []
        server.backend.subscribe(events.append)

        server._handle_action({"type": "join_game", "mode": "pva", "player_team": 1, "first_player": 1})
        server._handle_action({"type": "select_move", "player": 1, "robot_id": 1, "from_node": None, "to_node": 0})
        server._handle_action({"type": "select_move", "player": 1, "robot_id": 2, "from_node": None, "to_node": 1})

        ai_decisions = [event for event in events if event["type"] == "ai_decision"]
        self.assertEqual(len(ai_decisions), 2)
        self.assertEqual(sum(cell is not None for cell in server.backend.state.board), 4)


if __name__ == "__main__":
    unittest.main()