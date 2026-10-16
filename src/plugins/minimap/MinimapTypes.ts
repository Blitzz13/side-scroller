export enum MinimapTileType {
  EMPTY = 0,
  WALL = 1,
  DOOR = 2,
  THIN = 3,
}

export interface IDiscoveredMapObject {
  id: string;
  x: number;
  y: number;
  category: "keycard" | "health" | "shield" | "weapon" | "ammo" | "terminal" | "exit" | "stairs";
  label: string;
  color: number;
  subColor?: number;
  isCollected?: boolean;
  stairType?: "up" | "down" | "generic";
}

export interface IMinimapDataSource {
  getMapWidth(): number;
  getMapHeight(): number;
  getMapFlat(): Int32Array | number[];
  getTileTypeFlags(): Uint8Array | number[];
  getDoorStatesFlat?(): Float64Array | number[];
  getLockedDoors?(): Record<string, string>;
  getUnlockedKeycardDoors?(): Set<string>;
  getThinWalls?(): Array<{ x1: number; y1: number; x2: number; y2: number }>;
  getDestructableWalls?(): Array<{ x: number; y: number; isDestroyed?: boolean }>;
  getLevelFinishZones?(): Array<{ x1: number; y1: number; x2: number; y2: number; enabled?: boolean; targetLevel?: string }>;
  getPlayer(): { x: number; y: number; dirX: number; dirY: number };
  getActiveEnemies?(): Array<{ x: number; y: number; isDead?: boolean; isAlerted?: boolean }>;
  getPickups?(): Array<{ id: number; x: number; y: number; type: any; keyColor?: string; collected?: boolean; amount?: number; weaponType?: any }>;
  getStationaryObjects?(): Array<{ x: number; y: number; name?: string }>;
  getStairs?(): Array<{ x: number; y: number; stairType: "up" | "down" | "generic" }>;
  getLevelName?(): string;
}

export interface IRaycastMinimapOptions {
  width?: number;
  height?: number;
  modalWidth?: number;
  modalHeight?: number;
  showEnemies?: boolean;
  showFovCone?: boolean;
  fogOfWar?: boolean;
}

export interface IMinimapViewportMetrics {
  cellSize: number;
  mapOffsetX: number;
  mapOffsetY: number;
  viewportW: number;
  viewportH: number;
}
