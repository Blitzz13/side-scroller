# Raycaster 3D Engine Documentation

## 1. Overview
The `RaycastScene` engine provides a classic pseudo-3D raycasting renderer built on top of `PixiJS` and TypeScript. It supports fully textured grid walls, thin wall segments, interactive animated sliding doors, multi-surface textured floors, and multi-surface textured ceilings parsed directly from Tiled map JSON files (such as `assets/level2.json`).

---

## 2. Engine Architecture & Rendering Pipeline

### A. Tiled Map Layers Integration
The engine dynamically parses Tiled map layers and tilesets:

| Layer Name | Type | Description |
| :--- | :--- | :--- |
| **`Floor`** | Tile Layer | Grid cells storing floor tile IDs. Supports multi-surface room tiling. |
| **`Ceiling`** | Tile Layer | Grid cells storing ceiling tile IDs. Empty cells (`0`) render the open sky gradient. |
| **`Walls`** | Tile Layer | Standard solid block walls (e.g. `thickWall`) and interactive doors (`door`). |
| **`ThinWalls`** | Tile Layer | Sub-grid thin walls placed along cell centers with automatic horizontal/vertical orientation. |
| **`Doors`** | Tile Layer | Sliding doors that animate open/close on user interaction (`E` key). |

### B. High-Performance Texture Sampling
- **32-Bit Memory Access**: During level load, texture assets are converted to raw `Uint32Array` buffers (`0xAABBGGRR`) via `extractTexturePixels()`.
- **Zero GPU Readbacks**: Pixel lookups are performed directly on typed arrays in memory during scanline raycasting.

### C. Background Rendering Target (Floor & Ceiling)
- An offscreen canvas and `ImageData` buffer render the entire background (`1280 x 720`) in a single pass.
- Wrapped in a single `pixi.js` `Sprite` (`bgSprite`) placed at the base of the scene graph.
- **Top Half ($y = 0 \dots 359$)**: Scanline ceiling raycaster with fallback to `skyBuffer` gradient for open outdoor areas.
- **Bottom Half ($y = 360 \dots 719$)**: Scanline floor raycaster sampling room-specific floor tiles.

### D. Wall Raycasting (DDA Algorithm & Sprite Pooling)
- Column-by-column DDA (Digital Differential Analyzer) raycasting across 1,280 screen columns.
- Supports up to 3 depth hits per column (`MAX_HITS_PER_COLUMN`) to handle see-through thin walls and partially opened doors.
- Vertical slice textures are mapped to pooled `Sprite` columns with distance scaling and shading tints.

---

## 3. Raycasting Mathematics

### A. Camera Model
- **Player Position**: $(p_x, p_y)$
- **Direction Vector**: $(d_x, d_y)$ (normalized unit vector)
- **Camera Plane**: $(c_x, c_y)$ (perpendicular to direction, determines FOV)

### B. Floor & Ceiling Scanlines
For any vertical screen row $y$:
1. **Vertical Distance from Horizon**:
   $$p = |y - \text{horizon}|$$
2. **Row Distance**:
   $$\text{rowDistance} = \frac{\text{cameraHeight}}{p}$$
3. **World Step per Screen Pixel**:
   $$\text{step} = \frac{\text{rowDistance} \times (\text{rayDir}_1 - \text{rayDir}_0)}{\text{screenWidth}}$$
4. **World Coordinates**:
   $$\text{worldX} = p_x + \text{rowDistance} \times \text{rayDir}_{X0}$$
   $$\text{worldY} = p_y + \text{rowDistance} \times \text{rayDir}_{Y0}$$
5. **Tile Query & Texture Wrapping**:
   - Cell: $\text{cellX} = \lfloor\text{worldX}\rfloor$, $\text{cellY} = \lfloor\text{worldY}\rfloor$
   - UVs: $\text{tx} = (\text{worldX} - \text{cellX}) \times \text{texWidth} \pmod{\text{texWidth}}$
   - UVs: $\text{ty} = (\text{worldY} - \text{cellY}) \times \text{texHeight} \pmod{\text{texHeight}}$
6. **Distance Shading / Fog**:
   $$\text{shade} = \text{clamp}\left(1.0 - \frac{\text{rowDistance}}{\text{MAX\_RENDER\_DISTANCE}} \times 0.75, 0.18, 1.0\right)$$

---

## 4. Level Customization Guide

To create or customize rooms in `assets/level2.json` (or via the Tiled editor):

1. **Add Tiles**: Add texture images to the tileset (walls, doors, floors, ceilings).
2. **Floor Layer**: Paint floor tiles on the `Floor` layer (e.g. Tile `5` for indoor metal floor, Tile `6` for outdoor ground).
3. **Ceiling Layer**: Paint ceiling tiles on the `Ceiling` layer (e.g. Tile `7`, `8`, `9` for interior ceilings, or `0` for sky).
4. **Walls & Doors**: Paint walls on the `Walls` layer and doors on the `Doors` layer.
5. **Play**: The engine will automatically load assets, parse all layers, and render the complete environment.

---

## 5. Controls

| Key / Input | Action |
| :--- | :--- |
| **`W` / `S`** | Move Forward / Backward |
| **`A` / `D`** | Strafe Left / Right |
| **Mouse Look** | Rotate View (Click to lock pointer) |
| **`E`** | Open / Close Doors |
