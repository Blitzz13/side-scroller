# Raycaster Elevation & Stairs — Step-by-Step Implementation Guide

> **Reference**: SDL2 raycaster implementation in `sdl2-raycast-master/`
> **Target**: `src/scenes/RaycastScene.ts` and supporting modules in `src/scenes/raycast/`
> **Map Specification**: `assets/level2.json` (Group layers with `elevation` property)

---

## Overview

Add verticality and multi-elevation levels to the raycaster engine. The player can walk up and down stairs between elevation levels gradually (like a slope). Each elevation level is exactly **1 tile high** (e.g. Elevation 0 at $Z = 0.0$, Elevation 1 at $Z = 1.0$). The upper level must look identical in fidelity to the ground level — walls, floor, ceiling, doors, enemies, and objects all work correctly.

### Map Layer Architecture in `assets/level2.json`

`assets/level2.json` structures all content into **Group Layers** with custom `elevation` properties:

```
level2.json
├── Elevation1 (group, id: 12, elevation: 1)
│   ├── Floor (tile layer, id: 19) — Upper level floor (tile 5 on cols 20..23)
│   └── Walls (tile layer, id: 13) — Upper level perimeter walls (tile 1)
└── Elevation0 (group, id: 20, elevation: 0)
    ├── Floor (tile layer, id: 4) — Ground level floor (tile 6 on cols 0..19)
    ├── Objects (tile layer, id: 6) — Ground level items/pickups
    ├── PositionedObjects (object group, id: 11) — Tables, chairs, keycards, power cells
    ├── Walls (tile layer, id: 1) — Ground level walls (tiles 1, 3, 16)
    ├── Enemies (tile layer, id: 7) — Storm troopers
    ├── Stairs (tile layer, id: 14) — Stair tile (tile 16 at x=19, y=10)
    ├── Doors (tile layer, id: 3) — Metal doors (tile 4)
    ├── DoorProtectors (object group, id: 18) — Destructible barrier walls
    ├── ThinWalls (tile layer, id: 2) — Fences / grilles (tile 2)
    ├── Keys (tile layer, id: 10) — Blue keycards (tile 15)
    └── Ceiling (tile layer, id: 5) — Ground level ceilings (tiles 8, 7, 9)
```

---

## Technical Concept Comparison (SDL2 Reference vs TypeScript Raycaster)

| Concept | SDL2 Raycaster (`sdl2-raycast-master/src/main.cpp`) | Our TypeScript Raycaster (`RaycastScene.ts`) |
| :--- | :--- | :--- |
| **Elevation Storage** | Multi-level 3D grid arrays (`g_map`, `g_map2`, `g_map3`) | Per-cell `floorElevationFlat` and `ceilingElevationFlat` arrays |
| **Ground Height Query** | `slopeHeightAt(worldX, worldY)` | `getFloorZ(worldX, worldY)` |
| **Stair / Slope Math** | Checks sloped `ThickWall` bounding box & linear interpolation along axis | `StairDescriptor` interpolating $Z$ based on cell fraction and stair direction |
| **Player Vertical Movement** | `player.z` updated with gravity/climb snapping | `player.z` smoothly interpolating to `targetFloorZ` each frame |
| **Step Collision** | Steps over if $\Delta Z \le \text{TILE\_SIZE}/4$; blocks if higher | `tryMove()` blocks if $\Delta Z > 0.35$ on non-stair cells |
| **Wall Projection** | `wallScreenY = (displayH - wallH)/2 + playerScreenZ + pitch - (level * wallH)` | `wallBottomY = H/2 + playerScreenZ - (wallBaseZ * lineHeight)` |
| **Elevation Step Face** | Sloped wall sides & grid transition strips | Step risers generated in DDA when crossing differing floor elevation cells |
| **Floor/Ceiling Scanlines** | `rowDist = (eyeHeight * viewDist) / (y - centerPlane)` | `eyeHeight = 0.5 + player.z`, sampling per-cell floor/ceiling elevation textures |
| **Entity Elevation** | Sprite screen position offset by `playerScreenZ` | Screen Y adjusted by `(objFloorZ - player.z) * baseHeight` |

---

## Step 1: Add Elevation Data Structures & Types

**File**: `src/scenes/raycast/types.ts`

```typescript
export interface StairDescriptor {
  gridX: number;
  gridY: number;
  fromZ: number;         // Starting elevation (e.g. 0.0)
  toZ: number;           // Ending elevation (e.g. 1.0)
  direction: "north" | "south" | "east" | "west";
  textureId: number;
}
```

**File**: `src/scenes/RaycastScene.ts`

Add state fields and extend `RayHit`:

```typescript
interface RayHit {
  wallType: number;
  distance: number;
  hitX: number;
  side: number;
  mapX: number;
  mapY: number;
  rayDirX: number;
  rayDirY: number;
  orientation?: "vertical" | "horizontal";
  isDoor?: boolean;
  doorSlide?: "up" | "sideways";
  doorOpen?: number;
  wallZ: number;         // Base elevation Z of wall (e.g. 0.0 or 1.0)
  wallHeight: number;    // Height of wall segment (default 1.0)
  isStepRiser: boolean;  // True if this hit is a step riser between elevations
}

export class RaycastScene extends BaseScene {
  // Flat elevation arrays
  private floorElevationFlat!: Float32Array;    // Floor Z per cell (default 0.0)
  private ceilingElevationFlat!: Float32Array;  // Ceiling Z per cell (default 1.0)
  private stairs: StairDescriptor[] = [];

  // Player vertical tracking
  private player: {
    x: number;
    y: number;
    z: number;           // Current camera Z height (0.0 = ground)
    targetZ: number;     // Target floor Z for smooth interpolation
    dirX: number;
    dirY: number;
    planeX: number;
    planeY: number;
  };
}
```

---

## Step 2: Recursive Group Layer Parsing from Tiled JSON

**File**: `src/scenes/RaycastScene.ts` — `parseTiledMap()`

### 2a. Initialize flat elevation arrays

```typescript
const totalCells = this.mapHeight * this.mapWidth;
this.floorElevationFlat = new Float32Array(totalCells);
this.floorElevationFlat.fill(0.0);

this.ceilingElevationFlat = new Float32Array(totalCells);
this.ceilingElevationFlat.fill(1.0);

this.stairs = [];
```

### 2b. Recursive group layer traversal

```typescript
private parseTiledMap(mapData: any) {
  // ... grid dimensions initialization ...
  const firstgid = mapData.tilesets?.[0]?.firstgid ?? 1;

  const traverseLayers = (layers: any[], parentElevation: number = 0) => {
    for (const layer of layers) {
      if (layer.type === "group") {
        let groupElevation = parentElevation;
        if (layer.properties) {
          for (const prop of layer.properties) {
            if (prop.name === "elevation") {
              groupElevation = parseFloat(prop.value);
            }
          }
        }
        if (layer.layers) {
          traverseLayers(layer.layers, groupElevation);
        }
        continue;
      }

      const layerName = layer.name || "";
      const lowerName = layerName.toLowerCase();

      // 1. Floor Layer
      if (lowerName === "floor" && layer.data) {
        layer.data.forEach((tileGid: number, index: number) => {
          if (tileGid !== 0) {
            const x = index % layer.width;
            const y = Math.floor(index / layer.width);
            const idx = y * this.mapWidth + x;
            this.floorMap[y][x] = tileGid - firstgid;
            this.floorElevationFlat[idx] = parentElevation;
          }
        });
      }

      // 2. Ceiling Layer
      if (lowerName === "ceiling" && layer.data) {
        layer.data.forEach((tileGid: number, index: number) => {
          if (tileGid !== 0) {
            const x = index % layer.width;
            const y = Math.floor(index / layer.width);
            const idx = y * this.mapWidth + x;
            this.ceilingMap[y][x] = tileGid - firstgid;
            this.ceilingElevationFlat[idx] = parentElevation + 1.0;
          }
        });
      }

      // 3. Walls Layer
      if (lowerName === "walls" && layer.data) {
        layer.data.forEach((tileGid: number, index: number) => {
          if (tileGid !== 0) {
            const x = index % layer.width;
            const y = Math.floor(index / layer.width);
            const idx = y * this.mapWidth + x;
            const adjustedTileId = tileGid - firstgid;
            const meta = this.tileMeta[adjustedTileId] || {};
            const imgStr = (meta.image || "").toLowerCase();

            // Treat stairs in Walls layer as non-blocking
            if (imgStr.includes("stair") || tileGid === 16) {
              this.map[y][x] = 0; // Walkable
            } else {
              this.map[y][x] = tileGid;
            }
          }
        });
      }

      // 4. Stairs Layer
      if (lowerName === "stairs" && layer.data) {
        layer.data.forEach((tileGid: number, index: number) => {
          if (tileGid !== 0) {
            const x = index % layer.width;
            const y = Math.floor(index / layer.width);
            const idx = y * this.mapWidth + x;
            this.map[y][x] = 0; // Stair cell must be walkable

            this.stairs.push({
              gridX: x,
              gridY: y,
              fromZ: parentElevation,
              toZ: parentElevation + 1.0,
              direction: "east", // Auto-detected below
              textureId: tileGid - firstgid,
            });
          }
        });
      }

      // 5. Doors, ThinWalls, Keys, etc.
      // ... parsed similarly, recording parentElevation ...
    }
  };

  traverseLayers(mapData.layers || [], 0);
  this.finalizeStairs();
}
```

### 2c. Auto-detect Stair Direction & Heights

After all layers have been traversed and `floorElevationFlat` is fully populated:

```typescript
private finalizeStairs(): void {
  for (const stair of this.stairs) {
    const { gridX, gridY } = stair;
    const neighbors = [
      { dir: "north" as const, nx: gridX, ny: gridY - 1 },
      { dir: "south" as const, nx: gridX, ny: gridY + 1 },
      { dir: "east"  as const, nx: gridX + 1, ny: gridY },
      { dir: "west"  as const, nx: gridX - 1, ny: gridY },
    ];

    let lowZ = Infinity;
    let highZ = -Infinity;
    let highDir: "north" | "south" | "east" | "west" = "east";

    for (const n of neighbors) {
      if (n.nx >= 0 && n.nx < this.mapWidth && n.ny >= 0 && n.ny < this.mapHeight) {
        const nIdx = n.ny * this.mapWidth + n.nx;
        const nZ = this.floorElevationFlat[nIdx];
        if (nZ < lowZ) lowZ = nZ;
        if (nZ > highZ) {
          highZ = nZ;
          highDir = n.dir;
        }
      }
    }

    stair.fromZ = lowZ === Infinity ? 0.0 : lowZ;
    stair.toZ = highZ === -Infinity ? 1.0 : highZ;
    stair.direction = highDir;

    // For level2.json at (19, 10):
    // West (18, 10) Z=0, East (20, 10) Z=1 -> direction="east", fromZ=0, toZ=1
  }
}
```

---

## Step 3: Player Movement & Slope Physics

**File**: `src/scenes/RaycastScene.ts`

### 3a. `getFloorZ(worldX, worldY)`

```typescript
private getFloorZ(worldX: number, worldY: number): number {
  const cellX = Math.floor(worldX);
  const cellY = Math.floor(worldY);
  if (cellX < 0 || cellX >= this.mapWidth || cellY < 0 || cellY >= this.mapHeight) {
    return 0;
  }

  // Check if position is on a sloped stair
  for (const stair of this.stairs) {
    if (stair.gridX === cellX && stair.gridY === cellY) {
      const fracX = worldX - cellX;
      const fracY = worldY - cellY;
      let t = 0;
      switch (stair.direction) {
        case "east":  t = fracX; break;
        case "west":  t = 1.0 - fracX; break;
        case "south": t = fracY; break;
        case "north": t = 1.0 - fracY; break;
      }
      return stair.fromZ + (stair.toZ - stair.fromZ) * Math.max(0, Math.min(1, t));
    }
  }

  return this.floorElevationFlat[cellY * this.mapWidth + cellX] ?? 0;
}
```

### 3b. Update `updatePlayer()` with Camera Z Interpolation

```typescript
// At the end of updatePlayer():
const targetFloorZ = this.getFloorZ(this.player.x, this.player.y);
this.player.targetZ = targetFloorZ;

const zSpeed = 6.0;
this.player.z += (this.player.targetZ - this.player.z) * Math.min(1.0, zSpeed * delta);

if (Math.abs(this.player.z - this.player.targetZ) < 0.001) {
  this.player.z = this.player.targetZ;
}
```

### 3c. Update `tryMove()` with Height Difference Collision

```typescript
// Inside tryMove(newX, newY):
const currFloorZ = this.getFloorZ(this.player.x, this.player.y);
const nextFloorZ = this.getFloorZ(newX, newY);
const heightDiff = nextFloorZ - currFloorZ;

// Block stepping up a wall/ledge without stairs (max step height = 0.35 tiles)
if (heightDiff > 0.35) {
  return false;
}
```

---

## Step 4: Elevation-Aware Wall Column Projection & Step Risers

**File**: `src/scenes/RaycastScene.ts`

### 4a. DDA Step Riser Generation in `castRay()`

When ray steps from `(prevX, prevY)` to `(mapX, mapY)`:

```typescript
const prevFlatIdx = prevY * this.mapWidth + prevX;
const curFlatIdx = mapY * this.mapWidth + mapX;
const prevFloorZ = this.floorElevationFlat[prevFlatIdx] ?? 0;
const curFloorZ = this.floorElevationFlat[curFlatIdx] ?? 0;

if (Math.abs(curFloorZ - prevFloorZ) > 0.01) {
  const riserBaseZ = Math.min(curFloorZ, prevFloorZ);
  const riserHeight = Math.abs(curFloorZ - prevFloorZ);

  if (hitCount < pool.length) {
    const h = pool[hitCount++];
    h.wallType = 0; // Default wall/step texture
    h.distance = dist;
    h.hitX = hitX;
    h.side = side;
    h.mapX = mapX;
    h.mapY = mapY;
    h.rayDirX = rayDirX;
    h.rayDirY = rayDirY;
    h.isDoor = false;
    h.wallZ = riserBaseZ;
    h.wallHeight = riserHeight;
    h.isStepRiser = true;
  }
}
```

### 4b. Wall Slice Projection in `renderScene()`

```typescript
const lineHeight = screenH / ray.distance;
const playerScreenZ = this.player.z * lineHeight;

const wallBaseZ = ray.wallZ ?? 0;
const wallH = ray.wallHeight ?? 1.0;

const wallBottomScreenY = screenH / 2 + playerScreenZ - (wallBaseZ * lineHeight);
const wallTopScreenY = wallBottomScreenY - (wallH * lineHeight);

let drawStart = wallTopScreenY;
let drawEnd = wallBottomScreenY;

if (ray.isDoor && ray.doorSlide === "up" && ray.doorOpen !== undefined && ray.doorOpen > 0) {
  const doorBottom = wallBottomScreenY - ray.doorOpen * lineHeight;
  drawEnd = Math.max(wallTopScreenY, doorBottom);
}
```

---

## Step 5: Multi-Elevation Floor & Ceiling Scanlines

**File**: `src/scenes/RaycastScene.ts` — `renderFloorAndCeiling()`

### 5a. Floor Scanlines ($y \ge \text{horizon}$)

```typescript
const eyeHeight = 0.5 + this.player.z;
const posZ = eyeHeight * screenH;
const rowDist = posZ / p;
```

When sampling the floor pixel at world coordinate `(floorX, floorY)`:

```typescript
const cellFloorZ = floorElevationFlat[cellY * mapW + cellX];
// If sampled cell is on upper elevation (1.0), adjust projection
```

### 5b. Ceiling Scanlines ($y < \text{horizon}$)

```typescript
const eyeHeight = 0.5 + this.player.z;
const defaultCeilZ = 1.0;
const ceilDist = defaultCeilZ - eyeHeight;
const posZ = ceilDist * screenH;
const rowDist = posZ / p;
```

---

## Step 6: Entity, Enemy & Pickup Elevation Support

### 6a. Billboard Objects in `RaycastScene.renderObjects()`

```typescript
const baseHeight = Math.abs(Math.floor(screenH / transformY));
const playerScreenZ = this.player.z * baseHeight;

const objFloorZ = obj.z ?? this.getFloorZ(obj.x, obj.y);
const relZ = objFloorZ - this.player.z;
const elevationOffset = relZ * baseHeight;

const floorY = Math.floor(screenH / 2 + baseHeight / 2) - elevationOffset;
const ceilingY = Math.floor(screenH / 2 - baseHeight / 2) - elevationOffset;
```

### 6b. Supporting Managers Recursive Parsing

Update `RaycastPickupManager`, `RaycastBreakableManager`, `RaycastEnemyManager`, and `DestructableWallManager` to recursively traverse group layers so entities in `Elevation0` and `Elevation1` inherit their group elevation.

---

## Verification & Test Checklist

- [ ] **Build Check**: `npm run build` succeeds with 0 TypeScript/webpack errors.
- [ ] **Level 2 Load**: `assets/level2.json` group layers load and parse cleanly without console warnings.
- [ ] **Ground Floor Rendering**: Rooms in Elevation 0 render with exact visual fidelity.
- [ ] **Stair Transition at (19, 10)**:
  - Walking onto stair at `x=19, y=10` smoothly raises camera from $Z=0$ to $Z=1$.
  - Walking back down smoothly lowers camera from $Z=1$ to $Z=0$.
- [ ] **Upper Platform (cols 20-23)**:
  - Upper floor texture (`floor.png`) renders on the upper platform.
  - Upper perimeter walls render at the elevated height.
  - Player cannot step off the ledge without using the stairs.
- [ ] **Entity Alignment**: Enemies, pickups, and breakables on both elevations render anchored to their respective floors.
- [ ] **Performance**: 60 FPS maintained during elevation transitions.
