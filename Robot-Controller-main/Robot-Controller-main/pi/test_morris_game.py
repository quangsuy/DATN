"""Focused tests for the Raspberry Pi game state module."""

import unittest

from .morris_game import IllegalMove, Move, apply_move, new_game, valid_moves


class MorrisGameTests(unittest.TestCase):
    def test_drop_phase_switches_player_and_keeps_board_immutable(self):
        initial = new_game()
        next_state = apply_move(initial, Move(1, None, 0))

        self.assertEqual(initial.board, (None,) * 9)
        self.assertEqual(next_state.board[0], 1)
        self.assertEqual(next_state.current_player, 2)
        self.assertEqual(next_state.phase, "drop")

    def test_phase_changes_after_both_players_place_three_pieces(self):
        state = new_game()
        for move in (
            Move(1, None, 0),
            Move(2, None, 2),
            Move(1, None, 3),
            Move(2, None, 5),
            Move(1, None, 7),
            Move(2, None, 6),
        ):
            state = apply_move(state, move)

        self.assertEqual(state.phase, "move")
        self.assertEqual(len(valid_moves(state)), 5)

    def test_movement_requires_an_adjacent_empty_node(self):
        state = new_game()
        for move in (
            Move(1, None, 0),
            Move(2, None, 2),
            Move(1, None, 3),
            Move(2, None, 5),
            Move(1, None, 7),
            Move(2, None, 6),
        ):
            state = apply_move(state, move)

        with self.assertRaises(IllegalMove):
            apply_move(state, Move(1, 0, 8))

    def test_winning_move_ends_game(self):
        state = new_game()
        for move in (
            Move(1, None, 0),
            Move(2, None, 3),
            Move(1, None, 1),
            Move(2, None, 4),
            Move(1, None, 2),
        ):
            state = apply_move(state, move)

        self.assertEqual(state.phase, "game_over")
        self.assertEqual(state.winner, 1)
        self.assertEqual(state.winning_line, (0, 1, 2))

    def test_fivefold_repetition_declares_draw_and_ends_game(self):
        state = new_game()
        # Drop 6 pieces without forming a winning line:
        # P1 at 0, 2, 7; P2 at 1, 3, 5 (empty: 4, 6, 8)
        for move in (
            Move(1, None, 0),
            Move(2, None, 1),
            Move(1, None, 2),
            Move(2, None, 3),
            Move(1, None, 7),
            Move(2, None, 5),
        ):
            state = apply_move(state, move)

        self.assertEqual(state.phase, "move")
        self.assertFalse(state.is_draw)

        # Initial move-phase position is occurrence #1 for (board, current_player=1).
        # Repeat oscillation 4 more times -> total 5 occurrences -> automatic draw!
        for cycle in range(4):
            state = apply_move(state, Move(1, 7, 6))
            state = apply_move(state, Move(2, 5, 8))
            state = apply_move(state, Move(1, 6, 7))
            state = apply_move(state, Move(2, 8, 5))
            if cycle < 3:
                self.assertFalse(state.is_draw)

        self.assertTrue(state.is_draw)
        self.assertEqual(state.draw_reason, "fivefold_repetition")
        self.assertEqual(state.phase, "game_over")
        self.assertIsNone(state.winner)
        self.assertEqual(valid_moves(state), [])

    def test_fifty_move_rule_declares_draw(self):
        from .morris_game import GameState

        # Start in move phase at move_count=49 so the 50th movement ply triggers fifty_move_rule
        state = GameState(
            board=(1, 2, 1, 2, None, 2, None, 1, None),
            current_player=1,
            phase="move",
            turn_count=55,
            move_count=49,
        )
        next_state = apply_move(state, Move(1, 7, 6))
        self.assertTrue(next_state.is_draw)
        self.assertEqual(next_state.draw_reason, "fifty_move_rule")
        self.assertEqual(next_state.phase, "game_over")
        self.assertIsNone(next_state.winner)


if __name__ == "__main__":
    unittest.main()
