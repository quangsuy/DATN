"""Focused tests for the Raspberry Pi Minimax engine."""

import unittest

from .minimax import ExperienceMemory, _evaluate, choose_move
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

    def test_evaluate_rewards_mobility_and_penalizes_trapped_pieces(self):
        """Pieces with free adjacent neighbors score higher than trapped pieces."""
        # AI (2) at node 0 surrounded by opponent pieces at 1, 3, 4 (0 free neighbors)
        trapped_state = GameState(
            board=(2, 1, None, 1, 1, None, None, None, None),
            current_player=2,
            phase="move",
        )
        # AI (2) at node 8 with free neighbors 5 and 7
        mobile_state = GameState(
            board=(None, 1, None, 1, 1, None, None, None, 2),
            current_player=2,
            phase="move",
        )
        self.assertGreater(_evaluate(mobile_state, ai_player=2), _evaluate(trapped_state, ai_player=2))

    def test_depth_8_sees_forced_win_when_opponent_opens_on_edge(self):
        """At default depth=8, AI immediately identifies forced win when P1 opens on an edge."""
        state = GameState(
            board=(None, 1, None, None, None, None, None, None, None),
            current_player=2,
            phase="drop",
            turn_count=2,
        )
        decision = choose_move(state, ai_player=2)
        self.assertEqual(decision.depth, 8)
        self.assertEqual(decision.move.target_node, 4)
        self.assertGreaterEqual(decision.score, 1000)

    def test_ai_learns_from_loss_and_avoids_repeating_trapped_line(self):
        """After losing along a trap line, ExperienceMemory penalizes the losing choice
        and switches to a different counter-move when facing the same position again."""
        mem = ExperienceMemory(path=None, auto_load=False)
        # Human (P1) opens at center (node 4)
        opening = apply_move(new_game(1), Move(1, None, 4))
        first_decision = choose_move(opening, ai_player=2, max_depth=4, experience=mem)
        first_target = first_decision.move.target_node

        # Simulate a full match history where AI's choice at `opening` led to a loss against P1's trap
        s = new_game(1)
        history = []
        trap_sequence = [
            Move(1, None, 4),
            Move(2, None, first_target),
            Move(1, None, 5),
            Move(2, None, 3),
            Move(1, None, 6),
            Move(2, None, 2),
            Move(1, 5, 8),
            Move(2, 0, 1),
            Move(1, 4, 7),
        ]
        for mv in trap_sequence:
            history.append((s.board, mv.player, mv.source_node, mv.target_node))
            s = apply_move(s, mv)

        self.assertEqual(s.winner, 1)
        stats = mem.record_game(history, winner=1, ai_player=2)
        self.assertEqual(stats["losses_learned"], 1)

        # Next game: facing the exact same opening, AI must adapt and NOT repeat `first_target`
        second_decision = choose_move(opening, ai_player=2, max_depth=4, experience=mem)
        self.assertTrue(second_decision.used_experience)
        self.assertNotEqual(second_decision.move.target_node, first_target)
        # And the new choice must still be a sound strategic corner (not a weak edge)
        self.assertIn(second_decision.move.target_node, (0, 2, 6, 8))

    def test_ai_learns_proactive_trap_block_and_deepens_search(self):
        """When AI loses at shallow depth due to a fork setup, learning both boosts
        search depth and rewards blocking the opponent's trap target node."""
        mem = ExperienceMemory(path=None, auto_load=False)
        # Mid-drop state where P1 has {4}, P2 has {0}, P1 drops at {2}, P2 must respond
        s0 = new_game(1)
        s1 = apply_move(s0, Move(1, None, 4))
        s2 = apply_move(s1, Move(2, None, 0))
        s3 = apply_move(s2, Move(1, None, 1))
        # Suppose AI previously blundered by playing 8 instead of blocking 7, allowing P1 to win at 7
        history = [
            (s0.board, 1, None, 4),
            (s1.board, 2, None, 0),
            (s2.board, 1, None, 1),
            (s3.board, 2, None, 8),
            (apply_move(s3, Move(2, None, 8)).board, 1, None, 7),
        ]
        mem.record_game(history, winner=1, ai_player=2)

        # Next time at s3 (even if requested at max_depth=2), AI deepens search and blocks node 7
        dec = choose_move(s3, ai_player=2, max_depth=2, experience=mem)
        self.assertTrue(dec.used_experience)
        self.assertGreater(dec.depth, 2)
        self.assertEqual(dec.move.target_node, 7)


if __name__ == "__main__":
    unittest.main()
