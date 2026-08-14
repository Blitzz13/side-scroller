# Raycaster Changelog

This document logs recent development changes and enhancements made to the Raycaster 3D engine in `side-scroller`.

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

## File Modification Summary

| File | Changes Made |
| :--- | :--- |
| [`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts) | Implemented thin wall frustum culling (`cullThinWalls`), solid wall occlusion culling in `castRay`, and viewport culling in `renderScene`. |
| [`src/configs/GameConfig.ts`](file:///D:/Projects/side-scroller/src/configs/GameConfig.ts) | Added `ceiling_1.jpg`, `ceiling_2.jpg`, and `ceiling_3.jpg` to the environment bundle. |
| [`assets/level2.json`](file:///D:/Projects/side-scroller/assets/level2.json) | Configured `Floor` and `Ceiling` tile layers with indoor and outdoor surfaces. |
| [`RAYCAST_ENGINE.md`](file:///D:/Projects/side-scroller/RAYCAST_ENGINE.md) | Comprehensive system and architecture documentation. |
| [`CHANGELOG.md`](file:///D:/Projects/side-scroller/CHANGELOG.md) | Log of all recent changes and implementation details. |
