// Three Men's Morris Game Logic & Board Graph Geometry
import { BoardNode } from '../types';

export const BOARD_NODES: BoardNode[] = [
  // Row 1
  { id: 0, label: 'A1', gridX: 0, gridY: 0, canvasX: 18, canvasY: 18, connectedNeighbors: [1, 3, 4] },
  { id: 1, label: 'B1', gridX: 1, gridY: 0, canvasX: 50, canvasY: 18, connectedNeighbors: [0, 2, 4] },
  { id: 2, label: 'C1', gridX: 2, gridY: 0, canvasX: 82, canvasY: 18, connectedNeighbors: [1, 5, 4] },
  // Row 2
  { id: 3, label: 'A2', gridX: 0, gridY: 1, canvasX: 18, canvasY: 50, connectedNeighbors: [0, 6, 4] },
  { id: 4, label: 'B2', gridX: 1, gridY: 1, canvasX: 50, canvasY: 50, connectedNeighbors: [0, 1, 2, 3, 5, 6, 7, 8] },
  { id: 5, label: 'C2', gridX: 2, gridY: 1, canvasX: 82, canvasY: 50, connectedNeighbors: [2, 8, 4] },
  // Row 3
  { id: 6, label: 'A3', gridX: 0, gridY: 2, canvasX: 18, canvasY: 82, connectedNeighbors: [3, 7, 4] },
  { id: 7, label: 'B3', gridX: 1, gridY: 2, canvasX: 50, canvasY: 82, connectedNeighbors: [6, 8, 4] },
  { id: 8, label: 'C3', gridX: 2, gridY: 2, canvasX: 82, canvasY: 82, connectedNeighbors: [5, 7, 4] },
];

export const BOARD_LINES: [number, number][] = [
  // Horizontals
  [0, 1], [1, 2],
  [3, 4], [4, 5],
  [6, 7], [7, 8],
  // Verticals
  [0, 3], [3, 6],
  [1, 4], [4, 7],
  [2, 5], [5, 8],
  // Diagonals
  [0, 4], [4, 8],
  [2, 4], [4, 6],
];

export const WINNING_COMBINATIONS: number[][] = [
  // Rows
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  // Columns
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  // Diagonals
  [0, 4, 8],
  [2, 4, 6],
];

export interface StagingBay {
  x: number;
  y: number;
  label: string;
}

// Physical staging parking slots for rovers outside the main grid lines
export const STAGING_BAYS: Record<number, StagingBay> = {
  1: { x: 5, y: 22, label: 'BAY-1' },
  2: { x: 5, y: 50, label: 'BAY-2' },
  3: { x: 5, y: 78, label: 'BAY-3' },
  4: { x: 95, y: 22, label: 'BAY-4' },
  5: { x: 95, y: 50, label: 'BAY-5' },
  6: { x: 95, y: 78, label: 'BAY-6' },
};

/**
 * Check if a player has aligned 3 pieces on the board
 */
export function checkWinner(board: (number | null)[]): { winner: 1 | 2 | null; line: number[] | null } {
  for (const combo of WINNING_COMBINATIONS) {
    const [a, b, c] = combo;
    if (board[a] !== null && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a] as 1 | 2, line: combo };
    }
  }
  return { winner: null, line: null };
}

/**
 * Get valid destinations for a given node in movement phase
 */
export function getValidDestinations(nodeId: number, board: (number | null)[]): number[] {
  const node = BOARD_NODES[nodeId];
  if (!node) return [];
  // Must be an adjacent connected neighbor AND currently empty
  return node.connectedNeighbors.filter((neighborId) => board[neighborId] === null);
}

/**
 * Count pieces placed by a player
 */
export function countPlacedPieces(board: (number | null)[], player: 1 | 2): number {
  return board.filter((cell) => cell === player).length;
}
