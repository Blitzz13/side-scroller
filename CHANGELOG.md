# Raycaster Changelog

This document logs recent development changes and enhancements made to the Raycaster 3D engine in `side-scroller`.

---

## [2026-08-18] - 2.5D Billboard Objects & Items System

### 1. `Objects` Layer Parsing
- Added `MapObject` interface (`x`, `y`, `texture`, `distance`) and `private mapObjects: MapObject[]` to [`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts).
- Updated `parseTiledMap()` to dynamically parse the `Objects` layer (supporting tilelayers and object layers) from Tiled maps (e.g. `level2.json`).
- Automatically places objects at cell centers (`x + 0.5`, `y + 0.5`) with 0-indexed tileset texture IDs (`tileGid - firstgid`).

### 2. Camera-Space 3D Sprite Projection & Custom Scaling
- Implemented standard camera-space matrix transformation:
  - $\text{invDet} = \frac{1}{\text{player.planeX} \cdot \text{player.dirY} - \text{player.dirX} \cdot \text{player.planeY}}$
  - $\text{transformX} = \text{invDet} \cdot (\text{player.dirY} \cdot dx - \text{player.dirX} \cdot dy)$
  - $\text{transformY} = \text{invDet} \cdot (-\text{player.planeY} \cdot dx + \text{player.planeX} \cdot dy)$
- **Per-Tile & Per-Object Scaling and Elevation from Tiled**:
  - Supports `scale`, `scaleX`, `scaleY`, `z` / `elevation`, `vOffset` / `yOffset`, and `anchor` (`"ceiling"`, `"floor"`, `"center"`) defined in Tiled custom properties or object instances.
- **Automatic Image Size Scaling**:
  - When no explicit scale is provided, automatically scales sprite height relative to standard 512px wall units.
- **Natural Aspect Ratio Preservation**:
  - Calculates horizontal width $\text{spriteWidth} = \text{spriteHeight} \times (\text{texture.width} / \text{texture.height})$.

### 3. Z-Buffer Wall Occlusion & Painter's Algorithm Sorting
- **1D Depth Buffer (`zBuffer`)**: Stored per-column closest wall distance during raycasting.
- **Farthest-to-Closest Sorting**: Sorted all visible map objects by distance every frame.
- **Per-Stripe Occlusion**: For every vertical stripe of the billboard sprite, compared sprite depth $\text{transformY} < \text{zBuffer}[\text{stripe}]$ so objects naturally hide behind walls and thin partitions.

### 4. Zero-Allocation Pooled Sprite Rendering & Depth Shading
- Pre-allocated `objectSpritePool` inside a dedicated `objectContainer` layered on top of walls.
- Reuses pre-sliced column textures (`columnTextures`) with zero runtime texture allocations.
- Applied atmospheric distance dimming and depth tinting matching the scene's lighting model.

---

## [2026-08-18] - Deep CPU Optimization Pass (Flat Arrays, Zero-Allocation Hot Paths)

### Root Cause of FPS Drops (87 FPS in Certain Views)
When standing in specific positions looking down long corridors or into open rooms, the vast majority of screen pixels are **not** occluded by walls, forcing the CPU to:
1. Process up to **921,600 floor/ceiling pixels** per frame with per-pixel hash-map lookups and jagged array double-dereferences.
2. Allocate thousands of **template literal strings** (`\`${mapX},${mapY}\``) per frame inside the DDA raycasting loop for door state lookups, causing GC pressure.
3. Perform **string comparison** tile type checks (`=== "door"`) in the hottest inner loops.

### Optimizations Implemented:
1. **Flat Typed Array Maps** (`Int32Array`):
   - Replaced jagged `number[][]` maps (`this.map`, `floorMap`, `ceilingMap`) with flat `Int32Array` (`mapFlat`, `floorMapFlat`, `ceilingMapFlat`) using `y * mapWidth + x` indexing.
   - Eliminates double pointer dereference and improves CPU cache locality for sequential access.
2. **Numeric Tile Type Flags** (`Uint8Array`):
   - Replaced `Record<number, string>` tile type lookups (`this.tileTypes[tile]`) with pre-computed `Uint8Array` flags (`TILE_EMPTY=0`, `TILE_WALL=1`, `TILE_DOOR=2`, `TILE_THIN=3`).
   - Eliminates string hash lookups and string comparisons in the DDA loop and renderScene.
3. **Flat Door State Array** (`Float64Array`):
   - Replaced `Record<string, number>` door state lookups (`this.doorStates[\`${x},${y}\`]`) with `Float64Array` indexed by `y * mapWidth + x`.
   - **Eliminates all template literal string allocations** in the per-ray DDA loop (~thousands per frame).
4. **Flat Texture Data Array** (`rawTexArray`):
   - Replaced `Record<number, RawTextureData>` hash-map lookups with a flat `Array` indexed by tileId for O(1) access.
   - Eliminates object property hash lookups for every floor/ceiling pixel.
5. **Hoisted Field Accesses in Floor/Ceiling Renderer**:
   - All `this.*` property accesses hoisted to local variables at function entry.
   - Pre-computed `invScreenW`, `invMaxDist`, ray direction deltas (`drdx`, `drdy`), and player position as locals.
   - Reduces property chain lookups from ~921,600/frame to 1/frame.
6. **Row-Level Early Termination**:
   - Ceiling rows beyond `MAX_RENDER_DISTANCE` are bulk-filled with sky via `buf.set()`.
   - Floor rows beyond `MAX_RENDER_DISTANCE` are bulk-filled with fog via `buf.fill()`.
   - Skips all per-pixel computation for distant rows.
7. **Global Row-Skip Bounds**:
   - Computes `globalMinWallTop` and `globalMaxWallBottom` across all columns after wall raycasting.
   - Enables future row-level skip optimization in floor/ceiling rendering.

---

## [2026-08-14] - Multi-Surface Floor & Ceiling Raycasting System

### 1. Multi-Surface Textured Floor Raycasting
- **Added `Floor` Layer Parsing**:
  - Added `private floorMap: number[][]` to [`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts).
  - Updated `parseTiledMap()` to parse tile IDs from the `Floor` layer in `level2.json` and convert global tile GIDs to 0-indexed tileset IDs (`tileGid - firstgid`).
- **Scanline Floor Raycaster (`renderFloorAndCeiling`)**:
  - Implemented perspective floor raycasting for all rows below the horizon ($y = 360 \dots 719$).
  - For each pixel, computes world coordinates $(floorX, floorY)$, looks up `floorMap[cellY][cellX]`, samples the corresponding tile texture with fractional UV wrapping, and applies distance-based depth dimming.

---

### 2. Multi-Surface Textured Ceiling Raycasting & Sky Fallback
- **Added `Ceiling` Layer Parsing**:
  - Added `private ceilingMap: number[][]` to [`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts).
  - Updated `parseTiledMap()` to parse tile IDs from the `Ceiling` layer in `level2.json`.
- **Scanline Ceiling Raycaster**:
  - Implemented perspective ceiling raycasting for all rows above the horizon ($y = 0 \dots 359$).
  - Looks up `ceilingMap[cellY][cellX]` to render room-specific ceiling textures (`ceiling_1.jpg`, `ceiling_2.jpg`, `ceiling_3.jpg`).
  - If a cell has no ceiling tile (`tileId = -1` or `0`), it seamlessly falls back to the precalculated atmospheric sky gradient (`skyBuffer`).

---

### 3. High-Performance 32-Bit Direct Memory Pixel Sampling
- **Added `extractTexturePixels()`**:
  - Converts loaded `pixi.js` `Texture` instances into raw `Uint32Array` buffers (`0xAABBGGRR`) once during `loadLevel()`.
  - Stored in `this.rawTextureData`, allowing single-cycle pixel lookups during rendering without GPU readbacks or canvas overhead.

---

### 4. Background Render Target & Optimization
- **Unified Background Target**:
  - Added an offscreen canvas (`bgCanvas`), 2D context (`bgCtx`), `ImageData` (`bgImageData`), and 32-bit pixel buffer (`bgBuffer32`).
  - Wrapped in a single `pixi.js` `Texture` and `Sprite` (`bgSprite`) placed at the base of the scene graph.
- **Removed 2,560 `Graphics.drawRect` Calls Per Frame**:
  - Eliminated the previous per-column solid sky and floor draw calls, dramatically reducing draw calls and GPU driver overhead.

---

### 5. Asset Pipeline & Map Updates
- **[`src/configs/GameConfig.ts`](file:///D:/Projects/side-scroller/src/configs/GameConfig.ts)**:
  - Added `ceiling_1`, `ceiling_2`, and `ceiling_3` to the asset manifest environment bundle.
- **[`assets/level2.json`](file:///D:/Projects/side-scroller/assets/level2.json)**:
  - Configured multi-surface `Floor` and `Ceiling` layers with distinct textures for indoor rooms, hallways, and outdoor courtyards.
- **Dynamic Tileset Parsing**:
  - Updated `RaycastScene.loadLevel()` to iterate over all tilesets and tiles dynamically, loading all ceiling and floor assets automatically.

---

---

## [2026-08-14] - Performance & Memory Optimizations (Zero-Allocation Pipeline)

### Root Cause of FPS Degradation
When facing away from close walls and looking into open rooms/corridors, multiple surfaces (doors, thin walls, back walls) are hit per column. Previously:
1. `new Texture(texture.baseTexture, new Rectangle(...))` was being instantiated up to **3,840 times per frame** inside `renderScene()`. In PixiJS, creating sub-textures without destruction leaks event listeners and internal caches on `baseTexture`, causing memory bloat and severe Garbage Collection (GC) frame drops.
2. `castRay()` was allocating 1,280 new arrays and thousands of hit object literals per frame.
3. The background floor/ceiling canvas was computing and uploading 921,600 pixels (1280x720) every frame on CPU.

### Optimizations Implemented:
1. **Pre-Sliced Column Textures (`columnTextures`)**:
   - Pre-sliced all textures into 1px width slices once during `loadLevel()`.
   - `renderScene()` now looks up `sprite.texture = this.columnTextures[ray.wallType][clampedTexX]`.
   - **0 Texture/Rectangle allocations per frame**.
2. **Zero-Allocation Ray Hit Pooling (`hitPool`)**:
   - Pre-allocated reusable `RayHit` object pools for all 1,280 columns.
   - Replaced dynamic array allocations and `Array.sort` with in-place insertion sort on the pool.
3. **4x Background Compute Optimization (`640 x 360`)**:
   - The background floor & ceiling is now rendered to a `640 x 360` buffer (230,400 pixels instead of 921,600) and scaled up seamlessly by GPU hardware filtering on `bgSprite`.
4. **Fast Bitwise Power-of-Two Sampling**:
   - Precomputed `isPow2`, `maskX`, and `maskY` for textures to replace slow floating-point modulo `%` with bitwise `&` operations.
5. **Capped Render Distance**:
   - Reduced `MAX_RENDER_DISTANCE` from 50 to 30 units (matching the 20x20 map boundaries) to cull unnecessary DDA steps.

---

## [2026-08-14] - Crisp Native 1280x720 Resolution with Wall Occlusion Culling

### Solution to Blurriness & Rendering Overhead:
1. **Restored Full 1:1 Native Resolution ($1280 \times 720$)**:
   - Upgraded the background render buffer back to native $1280 \times 720$.
   - Eliminates all scaling blur, ensuring pixel-perfect sharpness across all textures.
2. **Span-Based Wall Occlusion Culling**:
   - During the column raycasting pass, calculated per-column vertical occlusion bounds (`wallTop[x]` and `wallBottom[x]`) corresponding to opaque walls and closed doors.
   - **Ceiling Culling**: Any ceiling pixel with $y \ge \text{wallTop}[x]$ is occluded by the front wall and completely skipped.
   - **Floor Culling**: Any floor pixel with $y < \text{wallBottom}[x]$ is occluded by the front wall and completely skipped.
   - Eliminates redundant texture sampling, perspective math, and memory writes for all occluded background areas behind walls.

---

## [2026-08-14] - Multi-Stage Wall Culling (Frustum, Occlusion, and Viewport)

### Wall Culling Features Added:
1. **Thin Wall Frustum Culling (`cullThinWalls`)**:
   - Before firing raycasts for the frame, thin wall endpoints are projected into camera space.
   - Walls behind the player plane ($ty \le 0$) or outside the horizontal field of view ($|tx/ty| > 1.2$) are culled once per frame.
   - The 1,280 screen raycasts only test the subset of visible thin walls (`activeThinWalls`).
2. **Solid Wall Occlusion Culling (Behind Wall Culling)**:
   - When a DDA grid ray hits a solid opaque wall or closed door, it stores `solidWallDist`.
   - Any thin walls situated behind the solid wall ($u \ge \text{solidWallDist}$) in that ray's path are culled immediately without computing intersections or sprite allocations.
3. **Viewport Vertical Culling**:
   - Wall column slices whose projection is completely outside the screen top/bottom (`drawEnd <= 0` or `drawStart >= screenH`) are skipped and kept hidden.

---

## [2026-08-14] - Mobile Touch Controls (Thumbstick, Swipe Look & Action Buttons)

### Mobile UI Components Created:
1. **[`VirtualJoystick.ts`](file:///D:/Projects/side-scroller/src/ui/VirtualJoystick.ts)**:
   - Analog virtual thumbstick with base boundary and draggable knob.
   - Outputs normalized 2D movement vector (`x`, `y` from `-1` to `+1`) for walking and strafing.
2. **[`VirtualButton.ts`](file:///D:/Projects/side-scroller/src/ui/VirtualButton.ts)**:
   - Multi-touch responsive button component supporting press holding (`isPressed`) and tap events.
3. **[`TouchLookArea.ts`](file:///D:/Projects/side-scroller/src/ui/TouchLookArea.ts)**:
   - Full-height touch surface covering the right half of the screen for fluid swipe-to-look camera rotation.
4. **[`MobileControls.ts`](file:///D:/Projects/side-scroller/src/ui/MobileControls.ts)**:
   - Composite overlay container housing:
     - **Left Thumbstick**: Forward/Backward and Strafe Left/Right movement.
     - **Right Swipe Area**: Fluid camera rotation by dragging anywhere on the right screen half.
     - **`<` & `>` Buttons**: Quick turn left / turn right buttons for fine-tuning orientation.
     - **`[E]` Action Button**: Tap to open/close doors.

---

## [2026-08-14] - Android Fullscreen & Dedicated UI Button

### Mobile Fullscreen & Orientation Fixes:
1. **Dedicated Fullscreen Button (`[FS]`)**:
   - Added a visible `[FS]` touch button to the top-right corner of [`MobileControls.ts`](file:///D:/Projects/side-scroller/src/ui/MobileControls.ts).
   - Directly toggles fullscreen using the browser's User Activation token upon tap.
2. **Direct First-Touch Activation**:
   - Switched from `touchstart` to `touchend` and `click` on the canvas/document in [`src/index.ts`](file:///D:/Projects/side-scroller/src/index.ts) to satisfy Chromium's transient user activation policy on Android Chrome and Brave.
3. **Cross-Browser Fullscreen Helper (`toggleFullscreen`)**:
   - Added `toggleFullscreen()` in [`src/Utils.ts`](file:///D:/Projects/side-scroller/src/Utils.ts) supporting `document.documentElement`, `document.body`, and vendor-prefixed APIs.
4. **Pointer Lock Desktop Separation**:
   - Prevented mobile touch events from erroneously trying to request desktop pointer locks.

---

## File Modification Summary

| File | Changes Made |
| :--- | :--- |
| [`src/ui/MobileControls.ts`](file:///D:/Projects/side-scroller/src/ui/MobileControls.ts) | Added dedicated `[FS]` button for reliable mobile fullscreen triggering. |
| [`src/Utils.ts`](file:///D:/Projects/side-scroller/src/Utils.ts) | Implemented cross-browser `toggleFullscreen()` utility. |
| [`src/index.ts`](file:///D:/Projects/side-scroller/src/index.ts) | Updated fullscreen activation handlers for Chrome / Brave mobile compatibility. |
| [`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts) | Disabled pointer lock requests on touch devices to avoid gesture interference. |
| [`src/ui/VirtualJoystick.ts`](file:///D:/Projects/side-scroller/src/ui/VirtualJoystick.ts) | Created touch virtual thumbstick component with clamped knob motion. |
| [`src/ui/VirtualButton.ts`](file:///D:/Projects/side-scroller/src/ui/VirtualButton.ts) | Created touch button component with active press states and tap events. |
| [`src/ui/TouchLookArea.ts`](file:///D:/Projects/side-scroller/src/ui/TouchLookArea.ts) | Created right-side touch look swipe area for camera rotation. |
| [`src/configs/GameConfig.ts`](file:///D:/Projects/side-scroller/src/configs/GameConfig.ts) | Added `ceiling_1.jpg`, `ceiling_2.jpg`, and `ceiling_3.jpg` to the environment bundle. |
| [`assets/level2.json`](file:///D:/Projects/side-scroller/assets/level2.json) | Configured `Floor` and `Ceiling` tile layers with indoor and outdoor surfaces. |
| [`RAYCAST_ENGINE.md`](file:///D:/Projects/side-scroller/RAYCAST_ENGINE.md) | Comprehensive system and architecture documentation. |
| [`CHANGELOG.md`](file:///D:/Projects/side-scroller/CHANGELOG.md) | Log of all recent changes and implementation details. |
