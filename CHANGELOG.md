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

## File Modification Summary

| File | Changes Made |
| :--- | :--- |
| [`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts) | Added `floorMap`, `ceilingMap`, `rawTextureData`, `bgCanvas`/`bgSprite`, `extractTexturePixels()`, `initSkyGradient()`, `renderFloorAndCeiling()`, and updated `parseTiledMap()` and `renderScene()`. |
| [`src/configs/GameConfig.ts`](file:///D:/Projects/side-scroller/src/configs/GameConfig.ts) | Added `ceiling_1.jpg`, `ceiling_2.jpg`, and `ceiling_3.jpg` to the environment bundle. |
| [`assets/level2.json`](file:///D:/Projects/side-scroller/assets/level2.json) | Configured `Floor` and `Ceiling` tile layers with indoor and outdoor surfaces. |
| [`RAYCAST_ENGINE.md`](file:///D:/Projects/side-scroller/RAYCAST_ENGINE.md) | Comprehensive system and architecture documentation. |
| [`CHANGELOG.md`](file:///D:/Projects/side-scroller/CHANGELOG.md) | Log of all recent changes and implementation details. |
