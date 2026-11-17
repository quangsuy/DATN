"""Focused tests for Pi board route planning."""

import unittest

from .board_planner import direct_move_trajectory, plan_node_route, pose_to_node_trajectory, route_to_trajectory


BOARD_NODES_MM = {
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


class BoardPlannerTests(unittest.TestCase):
    def test_direct_move_trajectory_requires_a_legal_board_edge(self):
        path = direct_move_trajectory(0, 4, BOARD_NODES_MM)

        self.assertEqual(path.node_ids, (0, 4))
        self.assertAlmostEqual(path.cost_mm, 141.4213, places=3)
        with self.assertRaises(ValueError):
            direct_move_trajectory(0, 8, BOARD_NODES_MM)

    def test_route_avoids_occupied_intermediate_node(self):
        route = plan_node_route(0, 8, occupied_nodes=(4,))

        self.assertEqual(route[0], 0)
        self.assertEqual(route[-1], 8)
        self.assertNotIn(4, route[1:-1])

    def test_route_is_rejected_when_no_path_exists(self):
        with self.assertRaises(ValueError):
            plan_node_route(0, 8, occupied_nodes=(1, 3, 4))

    def test_trajectory_matches_controller_shape(self):
        path = route_to_trajectory((0, 4, 8), BOARD_NODES_MM, speed_mm_s=100.0)

        self.assertEqual(path.node_ids, (0, 4, 8))
        self.assertEqual(path.waypoints[0], (0.0, 0.0, 0.0, 0.0, 0))
        self.assertAlmostEqual(path.waypoints[-1][0], 200.0)
        self.assertAlmostEqual(path.waypoints[-1][1], 200.0)
        self.assertAlmostEqual(path.cost_mm, 282.8427, places=3)

    def test_staging_pose_creates_direct_trajectory(self):
        path = pose_to_node_trajectory((-150.0, 0.0, 0.0), 0, BOARD_NODES_MM)

        self.assertEqual(path.node_ids, (0,))
        self.assertEqual(path.waypoints[0], (-150.0, 0.0, 0.0, 0.0, 0))
        self.assertEqual(path.waypoints[-1][0:2], (0.0, 0.0))


if __name__ == "__main__":
    unittest.main()
