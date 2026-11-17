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


if __name__ == "__main__":
    unittest.main()
