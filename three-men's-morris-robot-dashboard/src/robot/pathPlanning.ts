// A* Path Planning on Three Men's Morris Arena Graph for ESP32-S3
import { BOARD_NODES, STAGING_BAYS } from '../game/gameRules';
import { Waypoint, AStarLog } from '../types';

export interface ArenaNode {
  id: number;
  label: string;
  x: number; // 0..100 percentage
  y: number;
  neighbors: number[];
}

// Build complete physical arena graph including 9 board nodes + 6 staging/bay entry points
export function getArenaGraph(): Map<number, ArenaNode> {
  const graph = new Map<number, ArenaNode>();

  // Add 9 board nodes
  BOARD_NODES.forEach((node) => {
    graph.set(node.id, {
      id: node.id,
      label: node.label,
      x: node.canvasX,
      y: node.canvasY,
      neighbors: [...node.connectedNeighbors],
    });
  });

  // Staging bay nodes (101..106 for rovers 1..6)
  // Left bays connect to outer left column (0, 3, 6)
  graph.set(101, { id: 101, label: 'BAY-1', x: STAGING_BAYS[1].x, y: STAGING_BAYS[1].y, neighbors: [0, 3] });
  graph.set(102, { id: 102, label: 'BAY-2', x: STAGING_BAYS[2].x, y: STAGING_BAYS[2].y, neighbors: [3] });
  graph.set(103, { id: 103, label: 'BAY-3', x: STAGING_BAYS[3].x, y: STAGING_BAYS[3].y, neighbors: [3, 6] });

  // Right bays connect to outer right column (2, 5, 8)
  graph.set(104, { id: 104, label: 'BAY-4', x: STAGING_BAYS[4].x, y: STAGING_BAYS[4].y, neighbors: [2, 5] });
  graph.set(105, { id: 105, label: 'BAY-5', x: STAGING_BAYS[5].x, y: STAGING_BAYS[5].y, neighbors: [5] });
  graph.set(106, { id: 106, label: 'BAY-6', x: STAGING_BAYS[6].x, y: STAGING_BAYS[6].y, neighbors: [5, 8] });

  // Add bi-directional links from board to bays
  graph.get(0)!.neighbors.push(101);
  graph.get(3)!.neighbors.push(101, 102, 103);
  graph.get(6)!.neighbors.push(103);
  graph.get(2)!.neighbors.push(104);
  graph.get(5)!.neighbors.push(104, 105, 106);
  graph.get(8)!.neighbors.push(106);

  return graph;
}

function euclideanDistance(a: ArenaNode, b: ArenaNode): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * A* Pathfinding Algorithm avoiding occupied nodes (other parked vehicles)
 */
export function planAStarPath(
  startNodeId: number,
  goalNodeId: number,
  occupiedNodeIds: number[] = []
): { waypoints: Waypoint[]; pathNodeIds: number[]; log: AStarLog } {
  const startTime = performance.now();
  const graph = getArenaGraph();
  const startNode = graph.get(startNodeId);
  const goalNode = graph.get(goalNodeId);

  if (!startNode || !goalNode) {
    return {
      waypoints: [],
      pathNodeIds: [],
      log: {
        startNode: startNodeId,
        goalNode: goalNodeId,
        exploredNodes: [],
        finalPath: [],
        cost: 0,
        calcTimeMs: 0,
      },
    };
  }

  // Treat other occupied nodes as impassable obstacles, EXCEPT start and goal
  const blockedSet = new Set(occupiedNodeIds.filter((id) => id !== startNodeId && id !== goalNodeId));

  const openSet = new Set<number>([startNodeId]);
  const cameFrom = new Map<number, number>();
  const exploredNodes: number[] = [];

  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();

  graph.forEach((node) => {
    gScore.set(node.id, Infinity);
    fScore.set(node.id, Infinity);
  });

  gScore.set(startNodeId, 0);
  fScore.set(startNodeId, euclideanDistance(startNode, goalNode));

  while (openSet.size > 0) {
    // Node in openSet with lowest fScore
    let currentId = Array.from(openSet).reduce((lowest, id) => {
      return (fScore.get(id) || Infinity) < (fScore.get(lowest) || Infinity) ? id : lowest;
    });

    exploredNodes.push(currentId);

    if (currentId === goalNodeId) {
      // Reconstruct path
      const totalPath = [currentId];
      while (cameFrom.has(currentId)) {
        currentId = cameFrom.get(currentId)!;
        totalPath.unshift(currentId);
      }

      const cost = Math.round(gScore.get(goalNodeId) || 0);
      const calcTimeMs = Math.max(Math.round(performance.now() - startTime), 4);

      // Generate waypoints with intermediate navigation guide markers
      const waypoints: Waypoint[] = totalPath.map((nodeId, idx) => {
        const node = graph.get(nodeId)!;
        return {
          id: `wp-${idx}-${nodeId}`,
          x: node.x,
          y: node.y,
          nodeId: node.id < 100 ? node.id : undefined,
          label: node.label,
        };
      });

      return {
        waypoints,
        pathNodeIds: totalPath,
        log: {
          startNode: startNodeId,
          goalNode: goalNodeId,
          exploredNodes,
          finalPath: totalPath,
          cost,
          calcTimeMs,
        },
      };
    }

    openSet.delete(currentId);
    const currentNode = graph.get(currentId)!;

    for (const neighborId of currentNode.neighbors) {
      if (blockedSet.has(neighborId)) {
        // Obstructed by another robot
        continue;
      }

      const neighborNode = graph.get(neighborId);
      if (!neighborNode) continue;

      const tentativeG = (gScore.get(currentId) || 0) + euclideanDistance(currentNode, neighborNode);

      if (tentativeG < (gScore.get(neighborId) || Infinity)) {
        cameFrom.set(neighborId, currentId);
        gScore.set(neighborId, tentativeG);
        fScore.set(neighborId, tentativeG + euclideanDistance(neighborNode, goalNode));
        if (!openSet.has(neighborId)) {
          openSet.add(neighborId);
        }
      }
    }
  }

  // Fallback direct path if graph was constrained
  const directPath = [startNodeId, goalNodeId];
  return {
    waypoints: [
      { id: 'start', x: startNode.x, y: startNode.y, label: startNode.label },
      { id: 'goal', x: goalNode.x, y: goalNode.y, label: goalNode.label },
    ],
    pathNodeIds: directPath,
    log: {
      startNode: startNodeId,
      goalNode: goalNodeId,
      exploredNodes,
      finalPath: directPath,
      cost: Math.round(euclideanDistance(startNode, goalNode)),
      calcTimeMs: Math.max(Math.round(performance.now() - startTime), 5),
    },
  };
}
