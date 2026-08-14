# Floor Rendering Implementation & Changes

## Overview
This document details the implementation of textured floor raycasting in the raycaster engine (`RaycastScene`), enabling dynamic multi-surface floor rendering parsed directly from the `Floor` layer of Tiled map files (such as `assets/level2.json`).

---

## Key Changes Made

### 1. `Floor` Layer Parsing (`src/scenes/RaycastScene.ts`)
- **Floor Grid Matrix**: Added `private floorMap: number[][]` to store floor tile IDs per grid cell `[y][x]`.
- **Tiled Map Integration**: Updated `parseTiledMap()` to inspect the `Floor` tile layer from `level2.json`, translating global tile GIDs to 0-indexed tileset IDs (`tileGid - firstgid`).
- **Tile-to-Texture Mapping**: Mapped floor tile IDs to their loaded texture instances in `this.textures`.

### 2. Texture Pixel Extraction & Direct Memory Access
- Added `extractTexturePixels()` to convert loaded `pixi.js` `Texture` instances into raw `Uint32Array` buffers during level initialization (`loadLevel()`).
- Stored raw texture data in `this.rawTextureData`, allowing high-performance, single-cycle 32-bit pixel lookups (`0xAABBGGRR`) without GPU readbacks.

### 3. Background Render Target & Sprite
- Added an offscreen canvas (`this.bgCanvas`), 2D context (`this.bgCtx`), and `ImageData` pixel buffer (`this.bgImageData` / `this.bgBuffer32`).
- Wrapped the canvas in a Pixi `Texture` (`this.bgTexture`) and `Sprite` (`this.bgSprite`), placed behind the wall column sprites.
- Implemented `initSkyGradient()` to precalculate an atmospheric sky gradient for the top half of the screen (`y = 0` to `horizon`), which is blitted to the background buffer in microseconds using typed array `set()`.

### 4. Scanline Floor Raycasting (`renderFloorAndCeiling`)
- Implemented perspective floor raycasting for all scanlines below the horizon (`y = 360` to `720`):
  1. **Row Distance**: Calculates the distance from the player camera to the floor plane:
     $$\text{rowDistance} = \frac{\text{posZ}}{y - \text{horizon}}$$
  2. **World Step**: Computes the world-space delta per horizontal pixel:
     $$\text{step} = \frac{\text{rowDistance} \times (\text{rayDir}_1 - \text{rayDir}_0)}{\text{screenWidth}}$$
  3. **Tile Query & UV Wrapping**: For each pixel, computes world coordinates $(\text{floorX}, \text{floorY})$, queries `floorMap[cellY][cellX]`, and wraps sub-tile fractional UVs $(\text{tx}, \text{ty})$ to texture dimensions.
  4. **Distance Shading**: Applies distance-based depth dimming / fog along each scanline.

### 5. Performance Optimization in `renderScene`
- Removed the previous loop that executed 2,560 individual `Graphics.drawRect` operations per frame.
- The background (sky + floor) is now rendered to a single texture buffer and uploaded to the GPU, leaving only active wall column sprites to be rendered on top.

### 6. Map Configuration (`assets/level2.json`)
- Updated the `Floor` layer in `assets/level2.json` to feature distinct surfaces:
  - **Indoor Rooms**: Configured with Tile ID `5` (`inside_floor.jpg`).
  - **Corridors & Outdoors**: Configured with Tile ID `6` (`floor.png`).

---

## How to Add or Change Floor Surfaces

To add new floor surfaces or customize room floors in `level2.json`:

1. Open `assets/level2.json` in Tiled (or edit the JSON directly).
2. Add new tiles to the tileset with their respective image paths.
3. Paint any tile ID onto the **Floor** layer.
4. `RaycastScene` will automatically:
   - Load the image asset.
   - Extract the pixel buffer.
   - Render the corresponding floor texture in real time when walking through that area.
