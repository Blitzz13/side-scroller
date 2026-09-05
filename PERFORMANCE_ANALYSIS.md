# Raycaster Performance Analysis

> **Date**: 2026-09-04  
> **Symptom**: Low FPS despite debug tools showing only ~20 draw calls and ~26 texture changes.  
> **Root Cause**: The bottleneck is **CPU-bound**, not GPU-bound. WebGL batching is working efficiently (hence low draw calls), but the JavaScript main thread is saturated with per-pixel software rendering, thousands of DisplayObject transform updates, and per-frame garbage-generating allocations.

---

## 🔴 CRITICAL — Severe FPS Killers

### 1. Full-Screen CPU Software Rendering + Per-Frame GPU Texture Upload

**Files**: [`RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)  
**Location**: [`renderFloorAndCeiling()`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts#L2086-L2286)

The floor and ceiling are rendered entirely in JavaScript using a classic Wolf3D-style software raycaster. Every single frame, the engine:

1. **Iterates over every pixel** of the screen (~921,600 pixels at 1280×720) in two nested loops — one for the ceiling half (lines 2121–2193) and one for the floor half (lines 2196–2278).
2. For each pixel: performs texture lookups from `Uint32Array`, applies per-pixel distance shading with bit shifts and multiplies, and writes the result to `bgBuffer32`.
3. **Uploads the entire frame buffer to GPU** via `putImageData()` → `bgTexture.update()` (lines 2280–2285), forcing a full 1280×720 texture re-upload every frame.

```
Per frame cost:
  ~920K pixel iterations × (bounds check + texel fetch + shade + write) = ~5-15ms on mid-range CPUs
  + Full texture upload to GPU = ~1-3ms
  ≈ 6-18ms per frame (33-100% of a 60fps budget)
```

**Why it's critical**: This single method can consume the entire 16.6ms frame budget on its own. The `putImageData` + `texture.update()` path forces a synchronous CPU→GPU transfer that blocks the render pipeline.

**Proposed fix**: Replace with a GPU-side GLSL fragment shader (PixiJS `Filter` or `Mesh` with custom shader material) that receives player position, direction, and plane vectors as uniforms. The GPU can perform the raycasting math across all pixels in parallel, eliminating the CPU loop and the texture upload entirely.

---

### 2. Thousands of 1px-Wide Sprite Slices for Wall Columns

**Files**: [`RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)  
**Location**: Constructor pool allocation (lines 203–233), [`renderScene()`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts#L2358-L2432)

Walls are rendered using **1,280 × 6 = 7,680 pre-allocated Sprite objects** (`spritePool`). Every frame:

1. All sprites in each column are set to `visible = false` (line 2363–2365) — touching 7,680 DisplayObjects.
2. Active wall sprites get their `texture`, `y`, `height`, `tint`, and `visible` updated (lines 2386–2425).
3. Each Sprite triggers PixiJS to recalculate its local/world transform matrix.

```
Per frame cost:
  7,680 sprites × visibility reset = ~0.5ms
  ~1,280 active sprites × (texture swap + transform update) = ~1-2ms
  ≈ 1.5-2.5ms per frame
```

**Why it's critical**: Even though PixiJS batches these into few draw calls (explaining the low draw call count in debug), the CPU cost to process thousands of DisplayObject transforms remains. PixiJS still traverses the entire display list, checks bounds, and computes world matrices for all 7,680 sprites.

**Proposed fix**: 
- **Option A (Incremental)**: Render wall columns into the same software pixel buffer as floor/ceiling, eliminating all wall Sprites entirely.
- **Option B (GPU)**: Use a single `PIXI.Mesh` with a custom `Geometry` where vertex positions and texture UVs are updated via a single typed array buffer. One Mesh = one draw call with zero DisplayObject overhead.
- **Option C (Hybrid)**: Use a 2D Canvas for walls too and composite fewer, larger screen-region textures.

---

### 3. Per-Pixel Billboard Object Rendering via 1px Sprite Slices

**Files**: [`RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)  
**Location**: [`renderObjects()`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts#L2481-L2671)

Billboard objects (pickups, breakables, detonators) use the same 1px-wide sprite slice technique as walls. The inner loop at lines 2635–2663 creates **one Sprite per visible pixel column** of each object:

```typescript
for (let stripe = clipStartX; stripe < clipEndX; stripe++) {  // L2635
    // One sprite per pixel column!
    sprite.texture = slices[sliceIndex];    // L2655
    sprite.x = stripe;                      // L2656
    sprite.height = actualHeight;           // L2659
}
```

An object that appears 200 pixels wide on screen uses **200 individual Sprites**. With multiple objects on screen, this can easily reach 500–1,000+ active sprites.

Additionally, the pool starts with 1,000 pre-allocated sprites (line 239) and can **grow dynamically** with `new Sprite()` allocations mid-frame (lines 2648–2651), causing GC pressure during gameplay.

**Proposed fix**: Render each billboard as a **single scaled Sprite** with a custom fragment shader that samples the Z-buffer for per-pixel occlusion, or use the software buffer approach and skip PixiJS sprites for these entirely.

---

## 🟠 HIGH — Significant Overhead

### 4. String Dictionary + `split()/parseInt()` in Per-Frame Door Updates

**Files**: [`RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)  
**Location**: [`updateDoors()`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts#L1627-L1650)

The door state system uses a dual-track approach: a string-keyed `Record<string, number>` (`doorStates`) for gameplay logic and a flat `Float64Array` (`doorStatesFlat`) for raycasting. Every frame, `updateDoors()` iterates all doors:

```typescript
for (const key in this.doorStates) {           // L1628: string iteration
    // ... update state ...
    const parts = key.split(",");               // L1645: allocates string array
    const flatIdx = parseInt(parts[1]) * ...;   // L1646: string parsing
    this.doorStatesFlat[flatIdx] = ...;         // L1647: sync
}
```

Each door generates **3 temporary objects per frame** (`split()` result array + 2 substring references). With 10–20 doors on a map, this produces 30–60 throwaway objects per frame (1,800–3,600/sec), creating steady GC pressure.

**Proposed fix**: Eliminate `doorStates` entirely. Store an auxiliary flat array of door cell indices (e.g. `doorIndices: Uint32Array`) and iterate that with pure numeric operations. No strings, no parsing, no allocations.

---

### 5. Per-Frame Array Allocations in `renderScene()` and `tick()`

**Files**: [`RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)

Multiple per-frame allocations that create GC pressure:

| Location | Code | Allocation |
|----------|------|------------|
| [L1475](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts#L1475) | `this.thinWalls.concat(...)` | New array every frame |
| [L1724](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts#L1724) | `this.thinWalls.concat(...)` (again in `cullThinWalls`) | Duplicate new array |
| [L1718](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts#L1718) | `this.activeThinWalls = []` | New array every frame |
| [L2438](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts#L2438) | `pickups.concat(breakables).concat(detonators)` | 2 new arrays every frame |
| [L2508](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts#L2508) | `this.mapObjects.sort(...)` | Sort callback closure |
| [L1515](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts#L1515) | `{ x: 0, y: 0 }` fallback | New object literal every frame when no mobile controls |
| [L1538](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts#L1538) | `{ x: 0, y: 0 }` fallback (again in `updatePlayer`) | Duplicate allocation |

**Proposed fix**: Pre-allocate reusable arrays and objects. Use a single `allThinWalls` array that gets `.length = 0` + manual push instead of `concat()`. Cache the zero vector as a static constant.

---

### 6. `sortableChildren = true` on Three Containers

**Files**: [`RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)  
**Location**: Constructor (lines 249, 254, 274)

Three containers have `sortableChildren = true`:
- `animatedPickupContainer` (line 249)
- `enemyContainer` (line 254)  
- `detonatorContainer` (line 274)

When `sortableChildren` is enabled, PixiJS triggers a full child array sort (using `Array.prototype.sort()`) every frame if `sortDirty` is flagged. Each sort operation:
- Allocates closure objects for the comparator
- Performs O(n log n) comparisons
- May shuffle the internal children array (cache-unfriendly)

**Proposed fix**: For objects that are already depth-tested by the custom Z-buffer in `renderObjects()`, PixiJS-level Z-sorting is redundant. Disable `sortableChildren` and manage render order manually by controlling `addChild` order, or batch into a single Mesh.

---

## 🟡 MEDIUM — Moderate Overhead

### 7. Redundant `for-of` Visibility Reset for Column Sprites

**Files**: [`RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)  
**Location**: [Line 2363](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts#L2363)

```typescript
for (const sprite of this.spritePool[i]) {
    sprite.visible = false;
}
```

This iterates all 6 sprites per column (7,680 total) using `for-of` which creates an iterator object. Only 1-2 sprites per column are typically active, but all 6 are touched.

**Proposed fix**: Track the previous frame's active sprite count per column and only reset those. Use indexed `for` loops instead of `for-of` to avoid iterator allocation.

---

### 8. `graphics.clear()` Every Frame

**Files**: [`RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)  
**Location**: [Line 2292](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts#L2292)

```typescript
this.graphics.clear();
```

The `Graphics` object is used as a fallback for untextured wall columns (lines 2427–2429). `clear()` deallocates the internal geometry data every frame, even when the Graphics object may not be used. If all walls have textures, this is a wasted call that still triggers internal PixiJS bookkeeping.

**Proposed fix**: Only call `graphics.clear()` if it was actually drawn to in the previous frame. Or remove the `Graphics` fallback entirely if all tiles are guaranteed to have textures.

---

### 9. `thinWalls.concat()` Called Twice Per Frame

**Files**: [`RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)  
**Location**: [`tick()`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts#L1475) and [`cullThinWalls()`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts#L1724)

The exact same `this.thinWalls.concat(destructableWallManager.getThinWalls())` is computed **twice** every frame — once in `tick()` for enemy/detonator updates, and again in `cullThinWalls()` for rendering. Each `concat()` allocates a new array.

**Proposed fix**: Compute once at the start of `tick()` and pass the result to both consumers.

---

## 🟢 LOW — Minor Issues

### 10. `tryOpenDoor()` Allocates Arrays on Every Call

**Files**: [`RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)  
**Location**: [Line 1658](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts#L1658)

```typescript
const nearbyOffsets = [
    [lookX - px, lookY - py], [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
];
const tested = new Set<string>();
```

Allocates a 2D array and a `Set` every time the player presses the interact key. Not per-frame, but avoidable.

**Proposed fix**: Pre-allocate a static offsets array and reuse it.

---

### 11. Distance Shading Recomputed Per-Pixel Instead of Per-Row

**Files**: [`RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)  
**Location**: [`renderFloorAndCeiling()`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts#L2137-L2138)

The `shade` and `shadeInt` values are computed per-row, which is correct. However, the `Math.max` and `Math.min` clamping on line 2138 could be pre-computed into a lookup table indexed by screen row `y`, avoiding the branch + clamp on every row.

---

## Architecture Recommendations

### Short-Term (Keep Software Renderer)

1. **Merge walls into the pixel buffer**: Instead of 7,680 Sprite slices, draw wall columns directly into `bgBuffer32` alongside floor/ceiling. This eliminates thousands of DisplayObjects and reduces the display list to just the background sprite + overlays.

2. **Merge billboard objects into the pixel buffer**: Draw pickups/breakables as textured columns into the same buffer with Z-buffer checks. Eliminates the 1,000-sprite object pool.

3. **Eliminate string-keyed door states**: Use only `doorStatesFlat` with a pre-built `doorIndices` list.

4. **Pre-allocate all reusable arrays**: Zero-allocation tick loop.

### Medium-Term (Hybrid GPU)

5. **Split rendering into layered containers**:
   - `Layer 0`: Single `Sprite` for the full software-rendered background (floor + ceiling + walls + static objects) — uploaded once per frame.
   - `Layer 1`: A small number of full-size `Sprite` objects for animated enemies/pickups (rendered by PixiJS natively with proper transforms).
   - `Layer 2`: Weapon view + HUD.

6. **Reduce render resolution**: Render the software buffer at half resolution (640×360) and upscale with nearest-neighbor filtering. Classic raycasters look authentic at lower resolutions and this cuts pixel iteration by 4×.

### Long-Term (Full GPU)

7. **GPU Floor/Ceiling Shader**: Custom GLSL fragment shader that performs the raycasting math on the GPU. Pass the floor/ceiling tile maps as a data texture uniform.

8. **GPU Wall Rendering**: Use a single `Mesh` with dynamically updated vertex buffer for wall columns, batching all walls into one draw call with zero DisplayObject overhead.
