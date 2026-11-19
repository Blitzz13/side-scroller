/**
 * Universal A* (A-Star) Pathfinding Plugin
 *
 * A reusable, modular pathfinder for 2D grid maps (tilemaps, side-scrollers, top-down, raycast).
 *
 * Features:
 * - 4-directional and 8-directional movement.
 * - Corner-cutting prevention for diagonal steps around convex obstacles.
 * - Pluggable heuristics (Manhattan, Octile, Euclidean, Chebyshev).
 * - High performance Min-Heap (Priority Queue) with O(log N) operations.
 * - String pulling / raycast path smoothing for natural navigation paths.
 * - Built-in AStarPathFollower agent helper for waypoint traversal and arrival handling.
 */

export interface IPathNode {
  x: number;
  y: number;
}

export interface IAStarGrid {
  readonly width: number;
  readonly height: number;
  isWalkable(x: number, y: number): boolean;
  getCost?(x: number, y: number): number;
}

export interface IAStarOptions {
  /** Allow 8-directional diagonal movement. Default: true */
  allowDiagonal?: boolean;
  /** Prevent cutting corners diagonally around solid walls. Default: true */
  preventCornerCutting?: boolean;
  /** Heuristic function to use. Default: "octile" */
  heuristic?: "manhattan" | "euclidean" | "octile" | "chebyshev";
  /** Maximum number of node iterations before aborting search (safety against unreachable goals). Default: 2500 */
  maxIterations?: number;
  /** Heuristic weight multiplier (1.0 = optimal, >1.0 = faster greedy search). Default: 1.0 */
  weight?: number;
}

interface InternalNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent?: InternalNode;
  opened?: boolean;
  closed?: boolean;
}

/**
 * Min-Heap Priority Queue for A* Open Set
 */
class MinHeap<T> {
  private data: T[] = [];
  private scoreFn: (item: T) => number;

  constructor(scoreFn: (item: T) => number) {
    this.scoreFn = scoreFn;
  }

  public get size(): number {
    return this.data.length;
  }

  public push(item: T): void {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  public pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const bottom = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = bottom;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    const item = this.data[index];
    const itemScore = this.scoreFn(item);

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.data[parentIndex];
      if (itemScore >= this.scoreFn(parent)) break;
      this.data[index] = parent;
      index = parentIndex;
    }
    this.data[index] = item;
  }

  private sinkDown(index: number): void {
    const length = this.data.length;
    const item = this.data[index];
    const itemScore = this.scoreFn(item);

    while (true) {
      let swapIndex = -1;
      let minScore = itemScore;

      const leftChildIndex = 2 * index + 1;
      const rightChildIndex = 2 * index + 2;

      if (leftChildIndex < length) {
        const leftScore = this.scoreFn(this.data[leftChildIndex]);
        if (leftScore < minScore) {
          minScore = leftScore;
          swapIndex = leftChildIndex;
        }
      }

      if (rightChildIndex < length) {
        const rightScore = this.scoreFn(this.data[rightChildIndex]);
        if (rightScore < minScore) {
          swapIndex = rightChildIndex;
        }
      }

      if (swapIndex === -1) break;

      this.data[index] = this.data[swapIndex];
      this.data[swapIndex] = item;
      index = swapIndex;
    }
  }

  public clear(): void {
    this.data.length = 0;
  }
}

export class AStarPathfinder {
  private grid: IAStarGrid;
  private options: Required<IAStarOptions>;

  private static readonly SQRT2 = Math.SQRT2;

  constructor(grid: IAStarGrid, options?: IAStarOptions) {
    this.grid = grid;
    this.options = {
      allowDiagonal: options?.allowDiagonal ?? true,
      preventCornerCutting: options?.preventCornerCutting ?? true,
      heuristic: options?.heuristic ?? "octile",
      maxIterations: options?.maxIterations ?? 2500,
      weight: options?.weight ?? 1.0,
    };
  }

  public setGrid(grid: IAStarGrid): void {
    this.grid = grid;
  }

  public getGrid(): IAStarGrid {
    return this.grid;
  }

  public setOptions(options: Partial<IAStarOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Calculates the shortest path between start (startX, startY) and target (endX, endY).
   * Coordinates are grid integer coordinates.
   *
   * @returns Array of path nodes from start to goal, or an empty array if unreachable.
   */
  public findPath(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): IPathNode[] {
    const sx = Math.floor(startX);
    const sy = Math.floor(startY);
    const gx = Math.floor(endX);
    const gy = Math.floor(endY);

    const { width, height } = this.grid;

    // Bounds validation
    if (sx < 0 || sx >= width || sy < 0 || sy >= height) return [];
    if (gx < 0 || gx >= width || gy < 0 || gy >= height) return [];

    // If already at destination
    if (sx === gx && sy === gy) {
      return [{ x: sx, y: sy }];
    }

    // If destination is solid, find nearest walkable neighbor as fallback goal
    let targetX = gx;
    let targetY = gy;
    if (!this.grid.isWalkable(targetX, targetY)) {
      const nearest = this.findNearestWalkableNeighbor(targetX, targetY, sx, sy);
      if (!nearest) return [];
      targetX = nearest.x;
      targetY = nearest.y;
      if (sx === targetX && sy === targetY) {
        return [{ x: sx, y: sy }];
      }
    }

    // If start is solid (e.g. pushed slightly into boundary), find nearest walkable neighbor for start
    let startXCell = sx;
    let startYCell = sy;
    if (!this.grid.isWalkable(startXCell, startYCell)) {
      const nearestStart = this.findNearestWalkableNeighbor(startXCell, startYCell, targetX, targetY);
      if (nearestStart) {
        startXCell = nearestStart.x;
        startYCell = nearestStart.y;
      }
    }

    const openHeap = new MinHeap<InternalNode>((n) => n.f);
    const nodeMap = new Map<number, InternalNode>();

    const getNode = (x: number, y: number): InternalNode => {
      const key = y * width + x;
      let node = nodeMap.get(key);
      if (!node) {
        node = { x, y, g: Infinity, h: 0, f: Infinity };
        nodeMap.set(key, node);
      }
      return node;
    };

    const startNode = getNode(startXCell, startYCell);
    startNode.g = 0;
    startNode.h = this.calculateHeuristic(sx, sy, targetX, targetY);
    startNode.f = startNode.h * this.options.weight;
    startNode.opened = true;
    openHeap.push(startNode);

    let iterations = 0;
    const maxIters = this.options.maxIterations;

    while (openHeap.size > 0 && iterations < maxIters) {
      iterations++;
      const current = openHeap.pop()!;
      current.closed = true;

      // Reached goal!
      if (current.x === targetX && current.y === targetY) {
        return this.reconstructPath(current);
      }

      const neighbors = this.getValidNeighbors(current.x, current.y);
      for (let i = 0; i < neighbors.length; i++) {
        const [nx, ny, stepCost] = neighbors[i];
        const neighborNode = getNode(nx, ny);

        if (neighborNode.closed) continue;

        const tileCost = this.grid.getCost ? this.grid.getCost(nx, ny) : 1.0;
        const tentativeG = current.g + stepCost * tileCost;

        if (!neighborNode.opened || tentativeG < neighborNode.g) {
          neighborNode.parent = current;
          neighborNode.g = tentativeG;
          neighborNode.h = this.calculateHeuristic(nx, ny, targetX, targetY);
          neighborNode.f = neighborNode.g + neighborNode.h * this.options.weight;

          if (!neighborNode.opened) {
            neighborNode.opened = true;
            openHeap.push(neighborNode);
          }
        }
      }
    }

    // If max iterations reached, return best partial path towards goal
    let bestNode: InternalNode | null = null;
    let bestH = Infinity;
    nodeMap.forEach((node) => {
      if (node.closed && node.h < bestH) {
        bestH = node.h;
        bestNode = node;
      }
    });

    if (bestNode && ((bestNode as InternalNode).x !== startXCell || (bestNode as InternalNode).y !== startYCell)) {
      return this.reconstructPath(bestNode);
    }

    return [];
  }

  /**
   * Generates neighbors around (cx, cy) taking into account diagonal movement rules
   * and corner cutting prevention.
   */
  private getValidNeighbors(cx: number, cy: number): Array<[number, number, number]> {
    const results: Array<[number, number, number]> = [];
    const { width, height } = this.grid;

    // Cardinal neighbor walkability checks
    const n = cy > 0 && this.grid.isWalkable(cx, cy - 1);
    const s = cy < height - 1 && this.grid.isWalkable(cx, cy + 1);
    const w = cx > 0 && this.grid.isWalkable(cx - 1, cy);
    const e = cx < width - 1 && this.grid.isWalkable(cx + 1, cy);

    // Diagonals with corner cutting check (pushed first to prioritize natural diagonal traversal on equal cost ties)
    if (this.options.allowDiagonal) {
      const preventCorner = this.options.preventCornerCutting;

      // North-West
      if (cx > 0 && cy > 0 && this.grid.isWalkable(cx - 1, cy - 1)) {
        if (!preventCorner || (n && w)) {
          results.push([cx - 1, cy - 1, AStarPathfinder.SQRT2]);
        }
      }

      // North-East
      if (cx < width - 1 && cy > 0 && this.grid.isWalkable(cx + 1, cy - 1)) {
        if (!preventCorner || (n && e)) {
          results.push([cx + 1, cy - 1, AStarPathfinder.SQRT2]);
        }
      }

      // South-West
      if (cx > 0 && cy < height - 1 && this.grid.isWalkable(cx - 1, cy + 1)) {
        if (!preventCorner || (s && w)) {
          results.push([cx - 1, cy + 1, AStarPathfinder.SQRT2]);
        }
      }

      // South-East
      if (cx < width - 1 && cy < height - 1 && this.grid.isWalkable(cx + 1, cy + 1)) {
        if (!preventCorner || (s && e)) {
          results.push([cx + 1, cy + 1, AStarPathfinder.SQRT2]);
        }
      }
    }

    // Cardinal directions
    if (n) results.push([cx, cy - 1, 1]);
    if (s) results.push([cx, cy + 1, 1]);
    if (w) results.push([cx - 1, cy, 1]);
    if (e) results.push([cx + 1, cy, 1]);

    return results;
  }

  private calculateHeuristic(x1: number, y1: number, x2: number, y2: number): number {
    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);

    switch (this.options.heuristic) {
      case "manhattan":
        return dx + dy;
      case "euclidean":
        return Math.hypot(dx, dy);
      case "chebyshev":
        return Math.max(dx, dy);
      case "octile":
      default:
        // Optimal for 8-directional grids
        return (dx + dy) + (AStarPathfinder.SQRT2 - 2) * Math.min(dx, dy);
    }
  }

  private reconstructPath(endNode: InternalNode): IPathNode[] {
    const path: IPathNode[] = [];
    let current: InternalNode | undefined = endNode;
    while (current) {
      path.push({ x: current.x, y: current.y });
      current = current.parent;
    }
    path.reverse();
    return path;
  }

  private findNearestWalkableNeighbor(
    tx: number,
    ty: number,
    fromX: number,
    fromY: number
  ): IPathNode | null {
    const cardinalNeighbors = [
      { x: tx + 1, y: ty },
      { x: tx - 1, y: ty },
      { x: tx, y: ty + 1 },
      { x: tx, y: ty - 1 },
    ];

    let best: IPathNode | null = null;
    let bestDist = Infinity;

    for (const n of cardinalNeighbors) {
      if (
        n.x >= 0 &&
        n.x < this.grid.width &&
        n.y >= 0 &&
        n.y < this.grid.height &&
        this.grid.isWalkable(n.x, n.y)
      ) {
        const d = Math.hypot(n.x - fromX, n.y - fromY);
        if (d < bestDist) {
          bestDist = d;
          best = n;
        }
      }
    }

    return best;
  }

  /**
   * Smooths an A* path using line-of-sight shortcutting (string pulling).
   * Eliminates zigzag steps when clear lines exist between non-adjacent waypoints.
   *
   * @param rawPath Array of raw path nodes.
   * @param isLineClear Callback that returns true if line segment between (x1, y1) and (x2, y2) has clearance.
   * @returns Smoothed path with unnecessary intermediate nodes removed.
   */
  public static smoothPath(
    rawPath: IPathNode[],
    isLineClear: (x1: number, y1: number, x2: number, y2: number) => boolean,
    isCrucialNode?: (node: IPathNode) => boolean
  ): Array<IPathNode & { isCrucial?: boolean }> {
    if (rawPath.length <= 2) {
      return rawPath.map((n) => ({ ...n, isCrucial: isCrucialNode ? isCrucialNode(n) : false }));
    }

    const smoothed: Array<IPathNode & { isCrucial?: boolean }> = [
      { ...rawPath[0], isCrucial: isCrucialNode ? isCrucialNode(rawPath[0]) : false }
    ];
    let currentIdx = 0;

    while (currentIdx < rawPath.length - 1) {
      // Find the next crucial waypoint (e.g. doorway) that must be preserved
      let limitIdx = rawPath.length - 1;
      if (isCrucialNode) {
        for (let i = currentIdx + 1; i < rawPath.length; i++) {
          if (isCrucialNode(rawPath[i])) {
            limitIdx = i;
            break;
          }
        }
      }

      let furthestIdx = currentIdx + 1;

      // Look ahead up to limitIdx
      for (let testIdx = limitIdx; testIdx > currentIdx + 1; testIdx--) {
        const p1 = rawPath[currentIdx];
        const p2 = rawPath[testIdx];
        if (isLineClear(p1.x + 0.5, p1.y + 0.5, p2.x + 0.5, p2.y + 0.5)) {
          furthestIdx = testIdx;
          break;
        }
      }

      const nodeToPush = rawPath[furthestIdx];
      smoothed.push({
        ...nodeToPush,
        isCrucial: isCrucialNode ? isCrucialNode(nodeToPush) : false,
      });
      currentIdx = furthestIdx;
    }

    return smoothed;
  }
}

/**
 * Path Follower agent controller for entities traversing an A* path.
 */
export class AStarPathFollower {
  private waypoints: Array<{ x: number; y: number; isCrucial?: boolean }> = [];
  private currentIndex: number = 0;

  /**
   * Loads a new path of waypoints into the follower.
   * Automatically offsets integer cell coordinates to tile centers (x + 0.5, y + 0.5).
   */
  public setPath(path: Array<IPathNode & { isCrucial?: boolean }>, offsetToCenter: boolean = true): void {
    if (offsetToCenter) {
      this.waypoints = path.map((n) => ({ x: n.x + 0.5, y: n.y + 0.5, isCrucial: n.isCrucial }));
    } else {
      this.waypoints = path.map((n) => ({ x: n.x, y: n.y, isCrucial: n.isCrucial }));
    }
    this.currentIndex = 0;
  }

  public clear(): void {
    this.waypoints = [];
    this.currentIndex = 0;
  }

  public hasPath(): boolean {
    return this.waypoints.length > 0 && this.currentIndex < this.waypoints.length;
  }

  public get waypointsRemaining(): number {
    return Math.max(0, this.waypoints.length - this.currentIndex);
  }

  public getCurrentWaypoint(): { x: number; y: number; isCrucial?: boolean } | null {
    if (!this.hasPath()) return null;
    return this.waypoints[this.currentIndex];
  }

  public getNextWaypoint(lookahead: number = 1): { x: number; y: number; isCrucial?: boolean } | null {
    const idx = this.currentIndex + lookahead;
    if (idx < this.waypoints.length) {
      return this.waypoints[idx];
    }
    return null;
  }

  /**
   * Advances through waypoints based on distance to current waypoint.
   * Supports lookahead shortcutting to future waypoints if direct line of sight is clear,
   * but strictly preserves crucial doorway waypoints to avoid scraping door frames.
   *
   * @param currentX Entity X coordinate
   * @param currentY Entity Y coordinate
   * @param arrivalRadius Radius threshold to consider waypoint reached (default: 0.35)
   * @param isLineClear Optional line-of-sight clearance callback to enable lookahead shortcutting
   * @returns Current active target waypoint, or null if path completed
   */
  public advance(
    currentX: number,
    currentY: number,
    arrivalRadius: number = 0.35,
    isLineClear?: (x1: number, y1: number, x2: number, y2: number) => boolean
  ): { x: number; y: number; isCrucial?: boolean } | null {
    // Lookahead shortcutting: if entity has clear line of sight to a future waypoint, skip intermediate nodes!
    // Never shortcut across crucial waypoints (doorway entry, door, exit) so entities remain centered through doors!
    if (isLineClear && this.hasPath()) {
      for (let testIdx = Math.min(this.waypoints.length - 1, this.currentIndex + 8); testIdx > this.currentIndex; testIdx--) {
        let hasCrucial = false;
        for (let k = this.currentIndex; k <= testIdx; k++) {
          if (this.waypoints[k]?.isCrucial) {
            hasCrucial = true;
            break;
          }
        }
        if (hasCrucial) continue;

        const wp = this.waypoints[testIdx];
        if (isLineClear(currentX, currentY, wp.x, wp.y)) {
          this.currentIndex = testIdx;
          break;
        }
      }
    }

    while (this.hasPath()) {
      const wp = this.waypoints[this.currentIndex];
      const dist = Math.hypot(wp.x - currentX, wp.y - currentY);
      if (dist <= arrivalRadius) {
        this.currentIndex++;
      } else {
        break;
      }
    }
    return this.getCurrentWaypoint();
  }
}
