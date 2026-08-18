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
| **`Objects`** | Tile / Object Layer | Billboard 3D sprites (items, weapons, decorations) that always face the camera with Z-buffer occlusion. |

### B. High-Performance Texture Sampling
- **32-Bit Memory Access**: During level load, texture assets are converted to raw `Uint32Array` buffers (`0xAABBGGRR`) via `extractTexturePixels()`.
- **Zero GPU Readbacks**: Pixel lookups are performed directly on typed arrays in memory during scanline raycasting.

### C. Background Rendering Target (Floor & Ceiling) with Occlusion Culling
- An offscreen canvas and `ImageData` buffer render the entire background at native $1280 \times 720$ resolution for maximum pixel clarity.
- **Span-Based Wall Occlusion Culling**:
  - In Pass 1, column raycasting records the top and bottom screen bounds of all solid opaque walls (`wallTop[x]` and `wallBottom[x]`).
  - **Ceiling Culling**: For all rows $y < \text{horizon}$, pixels with $y \ge \text{wallTop}[x]$ are occluded by front walls and skipped entirely.
  - **Floor Culling**: For all rows $y \ge \text{horizon}$, pixels with $y < \text{wallBottom}[x]$ are occluded by front walls and skipped entirely.
  - Only truly visible ceiling and floor pixels are sampled and drawn.

### D. Wall Raycasting & Multi-Stage Culling
- **Thin Wall Frustum Culling (`cullThinWalls`)**:
  - Thin wall endpoints are projected into player camera space once per frame.
  - Walls behind the player plane ($ty \le 0$) or outside the FOV frustum are culled before column raycasting starts.
- **Solid Wall Occlusion Culling**:
  - As soon as a ray hits an opaque solid wall or closed door at `solidWallDist`, any thin walls or back surfaces with distance $u \ge \text{solidWallDist}$ are culled immediately.
- **Viewport Vertical Culling**:
  - Wall column slices projected completely above or below the viewport (`drawEnd <= 0` or `drawStart >= screenH`) are skipped.
- **Pre-Sliced Column Textures (`columnTextures`)**:
  - Vertical slice textures are mapped to pooled `Sprite` columns with zero runtime memory allocations.

### E. Billboard Objects & Items System
- **Dynamic Layer Parsing**: Parses items, pickups, and decorative objects placed in the `Objects` layer of Tiled maps.
- **Full 360° Billboarding**: All objects automatically rotate in 3D camera space to face the player.
- **1D Z-Buffer Occlusion**: Objects test each column against the raycast depth buffer (`zBuffer[x]`), rendering only visible stripes and naturally disappearing behind walls, doorframes, and partitions.
- **Aspect Ratio Preservation**: Automatically scales width based on natural texture dimensions ($W/H$).
- **Zero Runtime Allocations**: Uses pre-allocated pooled 1px vertical sprites inside an `objectContainer`.

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

### C. Billboard Sprite Projection
For each object at $(o_x, o_y)$:
1. **Relative Position**:
   $$dx = o_x - p_x, \quad dy = o_y - p_y$$
2. **Inverse Camera Matrix Transform**:
   $$\text{invDet} = \frac{1}{c_x \cdot d_y - d_x \cdot c_y}$$
   $$\text{transformX} = \text{invDet} \cdot (d_y \cdot dx - d_x \cdot dy)$$
   $$\text{transformY} = \text{invDet} \cdot (-c_y \cdot dx + c_x \cdot dy)$$
3. **Screen Projection**:
   $$\text{screenX} = \left\lfloor\frac{\text{screenW}}{2} \cdot \left(1 + \frac{\text{transformX}}{\text{transformY}}\right)\right\rfloor$$
   $$\text{spriteHeight} = \left|\left\lfloor\frac{\text{screenH}}{\text{transformY}}\right\rfloor\right|, \quad \text{spriteWidth} = \left|\left\lfloor\text{spriteHeight} \times \frac{\text{texWidth}}{\text{texHeight}}\right\rfloor\right|$$
4. **Z-Buffer Occlusion Test**:
   For each screen column $\text{stripe} \in [\text{drawStartX}, \text{drawEndX})$:
   $$\text{Draw stripe if } \text{transformY} < \text{zBuffer}[\text{stripe}]$$

---

## 4. Level Customization Guide

To create or customize rooms in `assets/level2.json` (or via the Tiled editor):

1. **Add Tiles**: Add texture images to the tileset (walls, doors, floors, ceilings, items/props).
2. **Floor Layer**: Paint floor tiles on the `Floor` layer (e.g. Tile `5` for indoor metal floor, Tile `6` for outdoor ground).
3. **Ceiling Layer**: Paint ceiling tiles on the `Ceiling` layer (e.g. Tile `7`, `8`, `9` for interior ceilings, or `0` for sky).
4. **Walls & Doors**: Paint walls on the `Walls` layer and doors on the `Doors` layer.
5. **Objects & Items Layer (`Objects`)**:
   - Place item/prop tiles on the `Objects` layer (e.g. `E-11-item.png`).
   - **Custom Properties in Tiled**:
     | Property Name | Type | Description | Example |
     | :--- | :--- | :--- | :--- |
     | **`anchor`** *(or `position`, `align`)* | `string` | Vertical alignment: `"floor"`, `"ceiling"`, or `"center"`. | `"ceiling"` *(for lamps)*, `"floor"` *(for weapons)* |
     | **`z`** *(or `elevation`, `height`)* | `float` | Exact vertical height factor from `0.0` (floor) to `1.0` (ceiling). | `0.35` *(on a table)*, `0.85` *(high lamp)* |
     | **`scale`** *(or `size`)* | `float` | Uniform scale multiplier (relative to wall height). | `0.35` (35% wall height) |
     | **`scaleX`** / **`scaleY`** | `float` | Independent horizontal or vertical scale multipliers. | `scaleX: 0.5, scaleY: 0.35` |
     | **`vOffset`** *(or `yOffset`, `offset`)* | `float` | Fine vertical shift in world units (`+` moves down, `-` moves up). | `0.05` *(hangs down from ceiling)* |
   - **Automatic Image Size Scaling**: If no `scale` is explicitly set, sprites automatically scale based on their raw texture height relative to standard 512px wall units.
6. **Play**: The engine will automatically load assets, parse all layers, and render the complete environment.

---

## 5. Controls

| Key / Input | Action |
| :--- | :--- |
| **`W` / `S`** | Move Forward / Backward |
| **`A` / `D`** | Strafe Left / Right |
| **Mouse Look** | Rotate View (Click to lock pointer) |
| **`E`** | Open / Close Doors |
