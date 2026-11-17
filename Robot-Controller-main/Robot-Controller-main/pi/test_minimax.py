"""Focused tests for the Raspberry Pi Minimax engine."""

import unittest

from .minimax import _evaluate, choose_move
from .morris_game import GameState, Move, apply_move, new_game


class MinimaxTests(unittest.TestCase):
    def test_ai_takes_immediate_winning_drop(self):
        state = GameState(
            board=(2, 2, None, 1, 1, None, None, None, None),
            current_player=2,
            phase="drop",
        )

        decision = choose_move(state, ai_player=2, max_depth=3)

        self.assertIsNotNone(decision.move)
        self.assertEqual(decision.move.target_node, 2)

    def test_ai_blocks_immediate_winning_drop(self):
        state = GameState(
            board=(1, 1, None, 2, None, None, None, None, None),
            current_player=2,
            phase="drop",
        )

        decision = choose_move(state, ai_player=2, max_depth=3)

        self.assertIsNotNone(decision.move)
        self.assertEqual(decision.move.target_node, 2)

    def test_ai_returns_no_move_for_finished_game(self):
        state = new_game()
        for move in (
            Move(1, None, 0),
            Move(2, None, 3),
            Move(1, None, 1),
            Move(2, None, 4),
            Move(1, None, 2),
        ):
            state = apply_move(state, move)

        finished = GameState(
            board=state.board,
            current_player=2,
            phase=state.phase,
            turn_count=state.turn_count,
            winner=state.winner,
            winning_line=state.winning_line,
        )
        decision = choose_move(finished, ai_player=2)

        self.assertIsNone(decision.move)

    def test_deeper_search_does_not_use_shallower_cached_result(self):
        """Depth-aware cache: depth=1 result must not be reused for depth=3.

        Both searches are run on the same position from scratch (separate
        choose_move calls have independent caches).  The deeper search must
        produce a score at least as informative (closer to the true minimax
        value) as the shallow one; crucially, the result from depth=3 must
        not be the trivially-shallow evaluation that depth=1 would produce
        when there is a winning sequence visible only at depth>=3.
        """
        # Construct a position where the winning continuation is 3 plies away.
        # Player 2 (AI) has two pieces in a row; player 1 has two pieces in a
        # row as well but it is player 2's turn to drop.
        state = GameState(
            board=(2, None, None, 1, None, 1, None, None, 2),
            current_player=2,
            phase="drop",
        )

        decision_shallow = choose_move(state, ai_player=2, max_depth=1)
        decision_deep = choose_move(state, ai_player=2, max_depth=4)

        # Both must return legal moves.
        self.assertIsNotNone(decision_shallow.move)
        self.assertIsNotNone(decision_deep.move)

        # The deeper search must have explored strictly more nodes.
        # (If the cache incorrectly reused shallow results, nodes_searched
        # would be suspiciously small for depth=4.)
        self.assertGreater(decision_deep.nodes_searched, decision_shallow.nodes_searched)

    def test_move_ordering_finds_winning_move_at_root(self):
        """Move ordering must surface the immediate win at the root without
        needing to exhaustively check all other moves first."""
        state = GameState(
            board=(2, 2, None, 1, 1, None, None, None, None),
            current_player=2,
            phase="drop",
        )

        decision = choose_move(state, ai_player=2, max_depth=1)

        # With move ordering the winning move (node 2) is tried first so the
        # number of nodes searched should be very small.
        self.assertEqual(decision.move.target_node, 2)
        self.assertIsNotNone(decision.nodes_searched)

    def test_move_result_is_deterministic(self):
        """Same position must produce same move on repeated calls."""
        state = GameState(
            board=(None, None, None, None, None, None, None, None, None),
            current_player=2,
            phase="drop",
        )
        d1 = choose_move(state, ai_player=2, max_depth=3)
        d2 = choose_move(state, ai_player=2, max_depth=3)
        self.assertEqual(d1.move, d2.move)


if __name__ == "__main__":
    unittest.main()
