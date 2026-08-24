# Raycaster Changelog

This document logs recent development changes and enhancements made to the Raycaster 3D engine in `side-scroller`.

## [2026-08-24] - Breakable Furniture System (Chairs & Tables)

### 1. Dynamic Breakable Furniture & Destruction Physics
- **Manager & Types** ([`src/scenes/raycast/RaycastBreakableManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastBreakableManager.ts), [`src/scenes/raycast/types.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/types.ts)):
  - Implemented `RaycastBreakableManager` to detect, render, collide with, and break interactive furniture objects (`chair` and `table`).
  - Added `RaycastBreakable` interface tracking `health`, `maxHealth`, `isBroken`, `hitRadius`, `blocksMovement`, and intact/broken textures.
- **Broken State Textures & 1px Column Slicing** ([`src/scenes/raycast/RaycastBreakableManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastBreakableManager.ts)):
  - Pre-loads and slices `assets/chair_broken.png` and `assets/table_broken.png` with `SCALE_MODES.NEAREST` into 1px vertical column textures.
  - Seamlessly swaps the sprite's texture and column slices to broken rubble upon destruction, maintaining floor anchoring.
- **Raycast Shooting & Ballistics Integration** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)):
  - Crosshair hit testing now performs ray-cylinder intersection against unbroken furniture in front of walls.
  - If a bullet hits a chair or table before an enemy or wall, it deals damage, destroys the furniture with an impact sound effect (`explosion_sound`), and notifies the player with a HUD toast (`[!] Smashed Chair/Table`).
  - Once broken, bullets pass straight through the rubble to hit enemies and walls behind them.
- **Player Movement Collision & Obstacle Clearing** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)):
  - Unbroken tables and chairs block player movement (`checkCollision`).
  - Destroying furniture removes its movement collision, allowing the player to walk freely over the broken debris.

---

### 2. Global Nearest-Neighbor Texture Sampling (`SCALE_MODES.NEAREST`)
- **Global Application Settings** ([`src/index.ts`](file:///D:/Projects/side-scroller/src/index.ts)):
  - Configured `BaseTexture.defaultOptions.scaleMode = SCALE_MODES.NEAREST`.
  - Ensures every texture, sprite, spritesheet, wall slice, pickup, furniture prop, and UI asset throughout the application defaults to crisp nearest-neighbor point sampling.

---

### 3. Object Layer Positioning, Animated Keycards & Locked Doors System
- **Sub-Tile Object Positioning** ([`src/scenes/raycast/RaycastPickupManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastPickupManager.ts), [`src/scenes/raycast/RaycastBreakableManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastBreakableManager.ts)):
  - Extended map parser to extract fractional $(x, y)$ world coordinates from Tiled object layers (`PositionedObjects`, `Pickups`) using `(obj.x + obj.width/2)/tileW` and `(obj.y - obj.height/2)/tileH`.
  - Enables placing items directly on tables, precise chair alignments, and custom `scale`, `vOffset`, `z`, and `anchor` overrides.
- **Native `AnimatedSprite` Keycards (`keycards.json`)** ([`src/scenes/raycast/RaycastPickupManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastPickupManager.ts), [`assets/keycards.json`](file:///D:/Projects/side-scroller/assets/keycards.json)):
  - Implemented PixiJS native `AnimatedSprite` for keycards, correctly handling FreeTexPacker `"rotated": true` atlas UV transformations and frame orientations.
  - Features smooth 6-frame spinning animation, per-column `Graphics` stencil masking for partial wall occlusion, distance shading, and dynamic depth sorting.
- **Keycard Inventory & HUD Display** ([`src/scenes/raycast/RaycastHUD.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastHUD.ts), [`src/scenes/raycast/RaycastPlayerController.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastPlayerController.ts)):
  - Player inventory tracks collected keycards (`blue`, `green`, `red`).
  - Upon pickup, the static first frame (`key_card_<color>_1.png`) is added to the top-left HUD `KEYS` badge with a sleek border and audio-visual feedback.
- **Locked Doors & Security Access** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)):
  - Parses the `Keys` tile layer to associate doors with specific required keycards.
  - Interacting (`E` / Action button) with a locked door verifies the player's inventory:
    - **Keycard present**: Unlocks and opens the door with an `[!] Access Granted` notification.
    - **Keycard missing**: Blocks door opening with an `[X] Access Denied! Requires <Color> Keycard` notification and red alert flash.
- **Table Surface Attachment & Zero-Parallax Drift Fix** ([`src/scenes/raycast/RaycastPickupManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastPickupManager.ts)):
  - Implemented `bindBreakables()` to attach items placed on furniture directly to their host object's world $(X, Y)$ coordinate and table top surface height.
  - Guarantees 1:1 identical raycast camera projection between the keycard and the table, completely eliminating perspective parallax drift when the player walks or strafes sideways.
  - Automatically drops resting items to floor debris level if the supporting table is smashed.
- **Extended Pickup Enum** ([`src/enums/RaycastPickupType.ts`](file:///D:/Projects/side-scroller/src/enums/RaycastPickupType.ts), [`src/configs/RaycastPickupConfigs.ts`](file:///D:/Projects/side-scroller/src/configs/RaycastPickupConfigs.ts)):
  - Added `BLUE_KEYCARD`, `GREEN_KEYCARD`, `RED_KEYCARD`, and `KEYCARD` to `RaycastPickupType`.
- **Enemy Loot Drop Texture & Ammo Fix** ([`src/scenes/raycast/RaycastPickupManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastPickupManager.ts), [`src/scenes/raycast/RaycastEnemyManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemyManager.ts)):
  - Fixed argument ordering in `spawnPickup()` and added overload guards so dropped weapons correctly award ammo (+20) and equip the E-11 blaster.
  - Pre-loads and pre-slices standard pickup textures (`assets/E-11-item.png`, `assets/health.png`, `assets/ammo.png`) in `initTextures()`, ensuring dynamically spawned weapon drops render visibly on the floor.
- **Configurable Pickup Radius** ([`src/configs/RaycastPickupConfigs.ts`](file:///D:/Projects/side-scroller/src/configs/RaycastPickupConfigs.ts), [`src/scenes/raycast/RaycastPickupManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastPickupManager.ts)):
  - Added `pickupRadius` support to `IRaycastPickupConfig`, item instances, and Tiled custom properties.
  - Increased default keycard pickup radius to `0.9` (up from `0.55`), allowing effortless card collection while standing near furniture or across tables.
- **Centered Recessed Doors & Configurable Slide Modes (`slide_up` vs `slide_sideways`)** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts), [`src/scenes/raycast/types.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/types.ts)):
  - Re-engineered DDA door raycasting to place doors at $0.5$ tile depth (in the exact middle of the wall depth), with realistic interior doorframe jamb geometry.
  - Added configurable slide animation modes:
    - `"slide_up"`: Sci-fi blast door lifts up vertically into the ceiling recess, with multi-hit raycasting allowing full visual transparency to the room behind/underneath the rising panel.
    - `"slide_sideways"`: Classic sliding door retracts horizontally into the adjacent doorframe.
  - Configurable globally via `defaultDoorSlide`, in Tiled tileset/tile custom property (`"slide": "up" | "sideways"`), or programmatically via `setDoorSlideMode(x, y, mode)`.

---

## [2026-08-23] - Configurable Enemy AI, 8-Directional Sprites, Combat System & Weapon Drops

### 1. Extensible Enemy Configuration System
- **Interface & Types** ([`src/configs/interfaces/IRaycastEnemyConfig.ts`](file:///D:/Projects/side-scroller/src/configs/interfaces/IRaycastEnemyConfig.ts), [`src/enums/RaycastEnemyType.ts`](file:///D:/Projects/side-scroller/src/enums/RaycastEnemyType.ts), [`src/scenes/raycast/types.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/types.ts)):
  - Created `IRaycastEnemyConfig` interface and `RaycastEnemyType` enum.
  - Supported configurable parameters:
    - `maxHealth`, `speed`, `sightRange`, `attackRange`, `minDistance`, `rateOfFire`, `damage`, `accuracy`, `scale`, `spritesheet`.
    - `dropWeapon`, `dropAmmo`, `dropChance`.
    - `painSounds`, `deathSounds`, `attackSounds`.
- **Global Registry** ([`src/configs/RaycastEnemyConfigs.ts`](file:///D:/Projects/side-scroller/src/configs/RaycastEnemyConfigs.ts)):
  - Configured `stormtrooperConfig` for the Imperial Stormtrooper with `assets/storm_trooper.json` animations, sound effects, and 100% E-11 blaster rifle drop upon death.
  - Implemented `getRaycastEnemyConfig()` helper for flexible enemy retrieval and easy addition of new enemy types.

---

### 2. Stormtrooper Enemy AI & Combat Engine
- **Finite State Machine & Navigation** ([`src/scenes/raycast/RaycastEnemy.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemy.ts)):
  - **`idle`**: Stands and scans for the player within `sightRange`.
  - **`chase`**: Pursues the player across the map, navigating around solid walls, closed doors, and thin walls with collision checking. Plays 6-frame walking animations matching direction.
  - **`attack`**: Halts at configurable `attackRange` (maintaining `minDistance`), faces player, enters shooting pose (`storm_trooper/shooting.png`), plays blaster firing sound, and deals damage to the player based on distance-adjusted accuracy.
  - **`dead`**: Plays 6-stage death animation sequence (`death_1_1` -> `death_1_6`) and remains as a corpse on the floor.
- **Line-of-Sight (LOS) Traversal** ([`src/scenes/raycast/RaycastEnemyManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemyManager.ts)):
  - Implemented DDA raycasting traversal to check clear visibility between enemies and the player across solid walls and open/closed doors.
- **Player Hit Detection & Damage** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)):
  - Integrated ray-cylinder intersection to hit test living enemies along the player's crosshair aiming vector.
  - Deals weapon damage, triggers pain sound effect (`stormtrooper_pain_1.mp3`), red flash visual effect, and alerts idle enemies.
  - When neutralized: triggers death sound effect (`stormtrooper_death_1.mp3`), spawns an `E-11` weapon pickup on the ground, and notifies the player via HUD toast.

---

### 3. 8-Directional PixiJS `AnimatedSprite` & Atlas Rotation Support
- **Directional Sprite Math** ([`src/scenes/raycast/RaycastEnemy.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemy.ts)):
  - Evaluates relative viewing angle $\Delta = \theta_{\text{toPlayer}} - \theta_{\text{facing}}$ into 8 orientations (`towards`, `towards_left_diagonal`, `left`, `away_left_diagonal`, `away` with horizontal mirroring for right sides).
- **Native `AnimatedSprite` Integration** ([`src/scenes/raycast/RaycastEnemy.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemy.ts), [`src/scenes/raycast/RaycastEnemyManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemyManager.ts)):
  - Upgraded enemy rendering to PixiJS `AnimatedSprite`, leveraging Pixi's built-in UV rotation matrices for spritesheets with `"rotated": true` packed frames.
  - Fixes sideways/corrupted sprite rendering on rotated atlas frames.
  - Smooth hardware-accelerated 6-frame walk animations, shooting pose, and death sequence.

---

### 4. Proportional Frame Height Scaling (`referenceHeight`)
- **Config & Rendering** ([`src/configs/interfaces/IRaycastEnemyConfig.ts`](file:///D:/Projects/side-scroller/src/configs/interfaces/IRaycastEnemyConfig.ts), [`src/scenes/raycast/RaycastEnemyManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemyManager.ts), [`src/configs/RaycastEnemyConfigs.ts`](file:///D:/Projects/side-scroller/src/configs/RaycastEnemyConfigs.ts)):
  - Added `referenceHeight` config property (default `67`) — the pixel height of the enemy's standard standing frame.
  - Sprite width and height are now scaled as `baseHeight × scale × (texDim / referenceHeight)`, so death/falling frames (which shrink from 67px to ~20px) render at their natural proportional size instead of being stretched to full standing height.

---

### 5. Display Layer Ordering Fix
- **Container Hierarchy** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)):
  - Fixed enemy sprites rendering on top of the weapon view and crosshair HUD.
  - Reordered `addChild` calls so `enemyContainer` is added before `weaponView` and `hud`, ensuring correct front-to-back layering: `bgSprite` → wall columns → `objectContainer` (pickups) → `enemyContainer` → `weaponView` → `hud` → mobile controls.

---

### 6. Per-Column Partial Wall Occlusion
- **Graphics Mask System** ([`src/scenes/raycast/RaycastEnemyManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemyManager.ts), [`src/scenes/raycast/RaycastEnemy.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemy.ts)):
  - Replaced all-or-nothing 3-point occlusion test with per-column `Graphics` mask per enemy.
  - Each frame, iterates across the sprite's screen columns and checks `transformY < zBuffer[col]`. Consecutive visible columns are coalesced into rectangular mask runs for efficiency.
  - Enemies now smoothly emerge from behind wall edges column-by-column instead of popping in/out as a whole sprite.

---

### 7. Crisp Pixel-Art Texture Filtering (`SCALE_MODES.NEAREST`)
- **Nearest-Neighbor Filtering** ([`src/scenes/raycast/RaycastEnemy.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemy.ts), [`src/scenes/raycast/RaycastEnemyManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemyManager.ts)):
  - Configured `SCALE_MODES.NEAREST` on the stormtrooper spritesheet base texture (`baseTexture.scaleMode = SCALE_MODES.NEAREST`), replacing bilinear smoothing with pixel-crisp nearest-neighbor texture sampling.
  - Enabled `roundPixels = true` on `AnimatedSprite` to avoid subpixel antialiasing blur.

---

### 8. Enemy Death Pain Tint Fix
- **Pain Timer Countdown on Death** ([`src/scenes/raycast/RaycastEnemy.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemy.ts)):
  - Moved `this.painTimer` decrement above the `if (this.state === "dead") return;` early return in `update()`.
  - Fixes the bug where defeated enemies remained tinted red indefinitely because their pain timers never counted down after transitioning to the `"dead"` state.

---

## [2026-08-23] - Mobile High-DPI Text Sharpness & Configurable Muzzle Flash System

### 1. High-DPI (Retina) Resolution & Mobile Text Sharpness
- **Canvas Backing Store & Auto-Density** ([`src/index.ts`](file:///D:/Projects/side-scroller/src/index.ts)):
  - Configured `autoDensity: true`, `antialias: true`, and `resolution: Math.max(1, Math.min(window.devicePixelRatio || 1, 3))` on the PixiJS `Application`.
  - Fixes blurry rendering on mobile phones and Retina screens by matching the canvas backing store to the device's physical pixel grid 1:1 instead of upscaling a low-resolution buffer.
- **High-Density Vector Text in HUD** ([`src/scenes/raycast/RaycastHUD.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastHUD.ts)):
  - Replaced downscaled `BitmapText` with high-density vector `Text` for Health (`100 HP`), Weapon name (`UNARMED` / weapon title), Ammo counter (`--` / `XX AMMO`), and Toast notifications.
  - Set explicit `resolution` matching device pixel density with bold typography, crisp letter spacing, and clean drop shadows.
- **Sharp Mobile Virtual Buttons** ([`src/ui/VirtualButton.ts`](file:///D:/Projects/side-scroller/src/ui/VirtualButton.ts)):
  - Upgraded on-screen touch control labels (`FIRE`, `E`, `<`, `>`, `FS`) to high-resolution vector `Text`.
- **High-Density BitmapFont Atlas** ([`src/configs/GameConfig.ts`](file:///D:/Projects/side-scroller/src/configs/GameConfig.ts)):
  - Updated `registerFonts()` to bake the bitmap font texture atlas at `resolution: dpr` on a `1024x1024` sheet, ensuring crispness for any legacy bitmap text across all menus and scoreboards.
- **CSS & Mobile Viewport Enhancements** ([`src/style.css`](file:///D:/Projects/side-scroller/src/style.css), [`webpack.config.ts`](file:///D:/Projects/side-scroller/webpack.config.ts)):
  - Added `-webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;` to `html, body`.
  - Configured `HtmlWebpackPlugin` with mobile viewport meta tag (`viewport-fit=cover`, `user-scalable=no`).

---

### 2. Per-Weapon Configurable Muzzle Flash System
- **Muzzle Flash Interface & Config Options** ([`src/configs/interfaces/IRaycastWeaponConfig.ts`](file:///D:/Projects/side-scroller/src/configs/interfaces/IRaycastWeaponConfig.ts), [`src/scenes/raycast/types.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/types.ts)):
  - Added `IMuzzleFlashConfig`, `IMuzzleFlashLayer`, and `IMuzzleFlashSparks` interfaces and attached `muzzleFlash?: IMuzzleFlashConfig` to `IRaycastWeaponConfig`.
  - Supported parameters:
    - `enabled`: Toggle flash per weapon.
    - `offsetX`, `offsetY`: Position offsets relative to weapon sprite.
    - `followRotation`: Whether flash offset rotates with weapon recoil and tilt (defaults to `true`).
    - `duration`: Visible duration in frames / ticks.
    - `scale`: Overall scale multiplier.
    - `outerColor`, `outerRadius`, `outerAlpha`: Outer plasma glow properties.
    - `innerColor`, `innerRadius`, `innerAlpha`: Mid-layer blaster flash properties.
    - `coreColor`, `coreRadius`, `coreAlpha`: Core spark properties.
    - `layers`: Optional array of custom multi-layer circles (`IMuzzleFlashLayer[]`) for complete visual flexibility.
    - `sparks`: Optional spark / burst ray configuration (`IMuzzleFlashSparks`).
    - `texture`: Optional sprite texture for image-based muzzle flashes.
- **Weapon Configuration Registry** ([`src/configs/RaycastWeaponConfigs.ts`](file:///D:/Projects/side-scroller/src/configs/RaycastWeaponConfigs.ts)):
  - Configured explicit `muzzleFlash` offsets and color layers for the E-11 Blaster Rifle.
- **Dynamic View Rendering** ([`src/scenes/raycast/RaycastWeaponView.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastWeaponView.ts)):
  - Replaced hardcoded constants and manual math in `drawMuzzleFlash()` with dynamic reads from the equipped weapon's `muzzleFlash` config.
  - Added `flashSprite` support for sprite-based muzzle flash assets.

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
| [`src/enums/RaycastEnemyType.ts`](file:///D:/Projects/side-scroller/src/enums/RaycastEnemyType.ts) | Created `RaycastEnemyType` enum. |
| [`src/configs/interfaces/IRaycastEnemyConfig.ts`](file:///D:/Projects/side-scroller/src/configs/interfaces/IRaycastEnemyConfig.ts) | Created `IRaycastEnemyConfig` interface with full combat, AI, audio, and loot drop options. |
| [`src/configs/RaycastEnemyConfigs.ts`](file:///D:/Projects/side-scroller/src/configs/RaycastEnemyConfigs.ts) | Created `stormtrooperConfig` and global `raycastEnemyConfigs` registry. |
| [`src/scenes/raycast/RaycastEnemy.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemy.ts) | Created `RaycastEnemy` entity with 8-direction sprite calculation, state machine, and death animation. |
| [`src/scenes/raycast/RaycastEnemyManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemyManager.ts) | Created `RaycastEnemyManager` for spritesheet pre-slicing, LOS checks, hit testing, AI updates, and loot spawning. |
| [`src/scenes/raycast/RaycastPickupManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastPickupManager.ts) | Added `spawnPickup()` method for runtime item and weapon drops. |
| [`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts) | Integrated enemy manager into raycast loop, player hit detection, and billboard rendering pipeline. |
| [`src/configs/GameConfig.ts`](file:///D:/Projects/side-scroller/src/configs/GameConfig.ts) | Added `stormtrooper_pain_1`, `stormtrooper_death_1`, and `storm_trooper` spritesheet to manifest. |
| [`src/scenes/raycast/types.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/types.ts) | Exported enemy types and extended `MapObject` with custom textures, slices, tint, and flipX. |
| [`src/index.ts`](file:///D:/Projects/side-scroller/src/index.ts) | Added `autoDensity`, `antialias`, and `resolution: devicePixelRatio` to Pixi `Application`. |
| [`src/scenes/raycast/RaycastHUD.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastHUD.ts) | Migrated HUD labels to high-resolution vector `Text` with device pixel density and crisp styling. |
| [`src/ui/VirtualButton.ts`](file:///D:/Projects/side-scroller/src/ui/VirtualButton.ts) | Migrated touch button labels to high-resolution vector `Text`. |
| [`src/style.css`](file:///D:/Projects/side-scroller/src/style.css) | Added font-smoothing rules and full-viewport touch styling. |
| [`webpack.config.ts`](file:///D:/Projects/side-scroller/webpack.config.ts) | Added viewport metadata to `HtmlWebpackPlugin`. |
| [`src/configs/interfaces/IRaycastWeaponConfig.ts`](file:///D:/Projects/side-scroller/src/configs/interfaces/IRaycastWeaponConfig.ts) | Added `IMuzzleFlashConfig`, `IMuzzleFlashLayer`, and `IMuzzleFlashSparks` interfaces. |
| [`src/configs/RaycastWeaponConfigs.ts`](file:///D:/Projects/side-scroller/src/configs/RaycastWeaponConfigs.ts) | Added explicit `muzzleFlash` configuration to `e11Config`. |
| [`src/scenes/raycast/RaycastWeaponView.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastWeaponView.ts) | Made muzzle flash offsets, colors, layers, durations, and sprite textures dynamic from weapon config. |
| [`src/ui/MobileControls.ts`](file:///D:/Projects/side-scroller/src/ui/MobileControls.ts) | Added dedicated `[FS]` button for reliable mobile fullscreen triggering. |
| [`src/Utils.ts`](file:///D:/Projects/side-scroller/src/Utils.ts) | Implemented cross-browser `toggleFullscreen()` utility. |
| [`src/ui/VirtualJoystick.ts`](file:///D:/Projects/side-scroller/src/ui/VirtualJoystick.ts) | Created touch virtual thumbstick component with clamped knob motion. |
| [`src/ui/TouchLookArea.ts`](file:///D:/Projects/side-scroller/src/ui/TouchLookArea.ts) | Created right-side touch look swipe area for camera rotation. |
| [`assets/level2.json`](file:///D:/Projects/side-scroller/assets/level2.json) | Configured `Floor`, `Ceiling`, and `Enemies` tile layers. |
| [`RAYCAST_ENGINE.md`](file:///D:/Projects/side-scroller/RAYCAST_ENGINE.md) | Comprehensive system and architecture documentation. |
| [`CHANGELOG.md`](file:///D:/Projects/side-scroller/CHANGELOG.md) | Log of all recent changes and implementation details. |
