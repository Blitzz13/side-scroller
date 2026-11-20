/**
 * Utility functions for parsing Tiled maps (both standard flat arrays and infinite chunked layers),
 * decoding Tiled GID flip/rotation bits, and calculating bounding boxes.
 */

export interface TiledGidInfo {
  gid: number;
  dirX: number;
  dirY: number;
  flippedHorizontally: boolean;
  flippedVertically: boolean;
  flippedDiagonally: boolean;
}

export const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
export const FLIPPED_VERTICALLY_FLAG = 0x40000000;
export const FLIPPED_DIAGONALLY_FLAG = 0x20000000;
export const GID_MASK = 0x1fffffff;

/**
 * Extracts base GID and facing direction from raw Tiled GID with flip/rotation bits.
 * By default in this raycaster, sprites/spawns point DOWN / SOUTH: dirX = 0, dirY = 1.
 */
export function extractTiledGidAndRotation(rawGid: number): TiledGidInfo {
  const unsignedGid = rawGid >>> 0;
  const gid = unsignedGid & GID_MASK;

  const h = (unsignedGid & FLIPPED_HORIZONTALLY_FLAG) !== 0;
  const v = (unsignedGid & FLIPPED_VERTICALLY_FLAG) !== 0;
  const d = (unsignedGid & FLIPPED_DIAGONALLY_FLAG) !== 0;

  // Default facing vector: Down / South (0, 1)
  let dx = 0;
  let dy = 1;

  // 1. Diagonal flip swaps X and Y
  if (d) {
    const tmp = dx;
    dx = dy;
    dy = tmp;
  }
  // 2. Horizontal flip negates X
  if (h) {
    dx = -dx;
  }
  // 3. Vertical flip negates Y
  if (v) {
    dy = -dy;
  }

  // Normalize
  const len = Math.hypot(dx, dy) || 1.0;
  dx /= len;
  dy /= len;

  return {
    gid,
    dirX: Math.round(dx),
    dirY: Math.round(dy),
    flippedHorizontally: h,
    flippedVertically: v,
    flippedDiagonally: d,
  };
}

/**
 * Iterates through every tile in a layer, seamlessly handling both:
 * - Fixed maps with `layer.data` (flat 1D array)
 * - Infinite maps with `layer.chunks` (array of chunk objects)
 */
export function forEachTileInLayer(
  layer: any,
  callback: (rawGid: number, x: number, y: number) => void
): void {
  if (!layer) return;

  if (Array.isArray(layer.data)) {
    const width = layer.width || 1;
    layer.data.forEach((rawGid: number, index: number) => {
      const x = index % width;
      const y = Math.floor(index / width);
      callback(rawGid, x, y);
    });
  } else if (Array.isArray(layer.chunks)) {
    layer.chunks.forEach((chunk: any) => {
      const cw = chunk.width || 16;
      if (Array.isArray(chunk.data)) {
        chunk.data.forEach((rawGid: number, index: number) => {
          const x = chunk.x + (index % cw);
          const y = chunk.y + Math.floor(index / cw);
          callback(rawGid, x, y);
        });
      }
    });
  }
}

/**
 * Calculates map dimensions and non-negative offsets for infinite or standard Tiled maps.
 */
export function calculateMapBounds(
  mapData: any,
  allLayers: any[]
): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  offsetX: number;
  offsetY: number;
  mapWidth: number;
  mapHeight: number;
} {
  if (!mapData.infinite) {
    return {
      minX: 0,
      minY: 0,
      maxX: (mapData.width || 24) - 1,
      maxY: (mapData.height || 20) - 1,
      offsetX: 0,
      offsetY: 0,
      mapWidth: mapData.width || 24,
      mapHeight: mapData.height || 20,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const layer of allLayers) {
    forEachTileInLayer(layer, (rawGid, x, y) => {
      if (rawGid !== 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    });
    if (layer.objects && Array.isArray(layer.objects)) {
      const tileW = mapData.tilewidth || 64;
      const tileH = mapData.tileheight || 64;
      layer.objects.forEach((obj: any) => {
        const gx1 = Math.floor(obj.x / tileW);
        const gy1 = Math.floor(obj.y / tileH);
        const gx2 = Math.floor((obj.x + (obj.width || tileW)) / tileW);
        const gy2 = Math.floor((obj.y + (obj.height || tileH)) / tileH);
        minX = Math.min(minX, gx1, gx2);
        minY = Math.min(minY, gy1, gy2);
        maxX = Math.max(maxX, gx1, gx2);
        maxY = Math.max(maxY, gy1, gy2);
      });
    }
  }

  if (minX === Infinity) {
    minX = 0;
    minY = 0;
    maxX = (mapData.width || 24) - 1;
    maxY = (mapData.height || 20) - 1;
  }

  const offsetX = minX < 0 ? -minX : 0;
  const offsetY = minY < 0 ? -minY : 0;
  const mapWidth = Math.max(mapData.width || 24, maxX + 1 + offsetX);
  const mapHeight = Math.max(mapData.height || 20, maxY + 1 + offsetY);

  return {
    minX,
    minY,
    maxX,
    maxY,
    offsetX,
    offsetY,
    mapWidth,
    mapHeight,
  };
}

