# Raycaster Changelog

This document logs recent development changes and enhancements made to the Raycaster 3D engine in `side-scroller`.

## [2026-09-06] - Player Energy Shield System & Animated Shield Pickups

### 1. Dynamic Energy Shield Mechanics & Partial Damage Absorption
- **Damage Negation & Mitigation** ([`src/scenes/raycast/RaycastPlayerController.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastPlayerController.ts)):
  - Added player shield capability (`shield: 0`, `maxShield: 100`) to the player state.
  - Implemented 65% damage absorption: when attacked, incoming damage splits so that 65% is absorbed and drained from the energy shield (`shieldAbsorbed = Math.min(shield, Math.ceil(damage * 0.65))`), while the remaining 35% penetrates through to player health.
  - When the shield is fully depleted to 0, 100% of damage impacts player health directly.
  - Added emerald-green directional screen deflection flash (`0x00e676`) when shield absorbs damage, matching the green shield generator aesthetic.
  - Added shield pickup collection method `addShield(amount)` with neon-green HUD toast notification and flash effect.

### 2. Animated Shield Pickup Integration
- **FreeTexPacker Spritesheet Animation** ([`src/scenes/raycast/RaycastPickupManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastPickupManager.ts), [`src/configs/RaycastPickupConfigs.ts`](file:///D:/Projects/side-scroller/src/configs/RaycastPickupConfigs.ts), [`src/enums/RaycastPickupType.ts`](file:///D:/Projects/side-scroller/src/enums/RaycastPickupType.ts)):
  - Integrated `assets/raycast/pickups/shield_unit.json` and `shield_unit.png` into the asset pipeline and pickup manager.
  - Automatically loads and parses the spritesheet into a 2-frame loop (`shield_unit_1.png` and `shield_unit_2.png`) with animated pulsation (`animationSpeed = 0.05`).
  - Added new enum `RaycastPickupType.SHIELD = 9` and config `raycastShieldPickupConfig` granting +25 shield.
  - Replaced hardcoded reference height (`30px`) in pickup rendering with dynamic reference height based on actual texture dimensions, ensuring pixel-perfect world scaling for both keycards and shield units without distortion.
  - Added map loader recognition for `shield_unit` in TMX object and tile layers (`tile 19` in `StarWarsTileset.tsx`).

### 3. Tactical HUD Shield Gauge & Centered Alignment
- **Dual Health & Shield Status Display** ([`src/scenes/raycast/RaycastHUD.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastHUD.ts)):
  - Redesigned and expanded the player status container to 240×72px with symmetric weapon dock alignment.
  - Aligned the health icon and shield crest emblem to the exact same horizontal centerline (`iconCenterX = 26px`), eliminating prior horizontal offset.
  - Vertically centered Row 1 (health icon, "100 HP" text, health bar) at `Y = 19px` and Row 2 (shield icon, "XX SHD" text, shield bar) at `Y = 53px`.
  - Upgraded the shield crest emblem to a neon green theme (`#00ff66` rim, `#00c853` translucent fill, `#69f0ae` deflector chevrons) matching the glowing green dome of the `shield_unit` pickup.
  - Formatted the readout text (`XX SHD`) and shield gauge fill (`#00e676`) in vibrant matching green.
  - Converted the health bar from green to vibrant scarlet red (`#ff3344`) with deep crimson (`#cc1111`) at critical HP ($\le 25\%$), creating a sharp visual distinction from the green energy shield.
  - Dynamically updates whenever shield points are gained or depleted.

## [2026-09-05] - Hardware-Accelerated GPU Floor & Ceiling Raycasting & Modular Shaders

### 1. Hardware-Accelerated GLSL Floor & Ceiling Raycasting
- **Full GPU Acceleration** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)):
  - Completely replaced the CPU software rasterizer (`renderFloorAndCeiling()`) which was looping over 921,600 pixels per frame and performing synchronous `putImageData()` + `bgTexture.update()` GPU uploads.
  - Implemented a hardware-accelerated full-screen quad using PixiJS `Mesh<Shader>` and `MeshGeometry` rendered in the `backgroundContainer` (`zIndex: 0`).
  - Floor and ceiling perspective raycasting, map sampling, texture atlas decoding, distance shading, fog, and sky gradients are now computed in parallel on the GPU at native 1280×720 resolution.
  - CPU cost per frame reduced from ~12–18ms to <0.005ms (passing 6 float uniform values `uPlayerPos`, `uDir`, `uPlane`), completely eliminating GPU texture bus stalls (`texSubImage2D`).

### 2. GPU Texture Atlas & Map Lookup Baking
- **One-Time Map Load Baking** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)):
  - Added `buildFloorCeilingTextures()` to compile all unique floor and ceiling textures into a single 2D texture atlas (`uAtlas`) with `SCALE_MODES.NEAREST` filtering.
  - Generates a compact 2D map lookup texture (`uMapTexture`) with dimensions matching the map grid (`mapWidth` × `mapHeight`), where the Red channel encodes the floor tile atlas index (+1) and the Green channel encodes the ceiling tile atlas index (+1).
  - Enables single-pass texture sampling inside the fragment shader without dynamic branching or multidimensional texture arrays.

### 3. Modular Shaders & IDE IntelliSense Support
- **Extracted Shader Files** ([`src/scenes/raycast/shaders/floorCeiling.vert`](file:///D:/Projects/side-scroller/src/scenes/raycast/shaders/floorCeiling.vert), [`src/scenes/raycast/shaders/floorCeiling.frag`](file:///D:/Projects/side-scroller/src/scenes/raycast/shaders/floorCeiling.frag)):
  - Extracted GLSL vertex and fragment shaders into standalone `.vert` and `.frag` source files for full IDE syntax highlighting, linting, and IntelliSense.
  - Added TypeScript module declarations in [`src/shaders.d.ts`](file:///D:/Projects/side-scroller/src/shaders.d.ts) for `*.vert`, `*.frag`, and `*.glsl` files.
  - Configured Webpack 5 native asset modules (`type: "asset/source"`) in [`webpack.config.ts`](file:///D:/Projects/side-scroller/webpack.config.ts) and [`webpack.dev.ts`](file:///D:/Projects/side-scroller/webpack.dev.ts) for zero-dependency raw string imports.

### 4. Build Configuration & TypeScript Strict Typings Fixes
- **TypeScript & Webpack Configuration** ([`tsconfig.json`](file:///D:/Projects/side-scroller/tsconfig.json), [`webpack.config.ts`](file:///D:/Projects/side-scroller/webpack.config.ts)):
  - Added `"types": ["node"]` and `"skipLibCheck": true` to `tsconfig.json` to resolve missing Node.js ambient declarations (`path`, `__dirname`, `module`).
  - Converted `webpack.config.ts` from CommonJS `require()` to ESM imports (`import * as path from "path"`).
  - Fixed strict typing in `CopyPlugin` transform option (`absoluteFilename?: string`).
  - Handled TypeScript 5+ `IArrayBuffer` type variance for PixiJS `MeshGeometry` buffers.

### 5. Enemy 3D Blaster Laser Projectiles & Real-Time Combat Physics
- **3D Enemy Blaster Simulation** ([`src/scenes/raycast/RaycastLaserManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastLaserManager.ts), [`src/scenes/raycast/RaycastEnemyManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemyManager.ts), [`src/scenes/raycast/RaycastEnemy.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemy.ts)):
  - Upgraded enemy attacks from instantaneous dice-roll hitscan to true physical 3D flying laser projectiles with crimson glowing blaster bolts (`tint: 0xff3322`).
  - Enemy bolts originate at the enemy's world position at rifle height ($Z = 0.55$) and fly towards the player at high velocity ($28.0\text{ units/sec}$).
  - Added real-time collision detection against the player cylinder ($r = 0.42$) and breakable furniture cover (tables/chairs), damaging cover or player upon impact.
  - Implemented cinematic near-miss dispersion: inaccurate shots intentionally deviate slightly to the left/right ($0.35$–$0.80$ units), allowing red blaster bolts to whiz visibly past the camera and crash into walls behind the player with multi-colored plasma sparks.
  - Enabled reactive player dodging: players can actively strafe out of the line of fire to evade incoming enemy blaster bolts.
  - Integrated tactical impact feedback: hits trigger player damage, camera screen shake ($5\text{px}$), red screen flash, and HUD warning toast (`[-] Hit by Blaster Fire!`).

### 6. Health Pickup Texture Asset Update
- **Pixel-Art Health Pickup Integration** ([`src/configs/RaycastPickupConfigs.ts`](file:///D:/Projects/side-scroller/src/configs/RaycastPickupConfigs.ts), [`src/scenes/raycast/RaycastPickupManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastPickupManager.ts), [`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts), [`assets/raycast/levels/StarWarsTileset/StarWarsTileset.tsx`](file:///D:/Projects/side-scroller/assets/raycast/levels/StarWarsTileset/StarWarsTileset.tsx)):
  - Replaced the legacy 613×569 2D health icon with the dedicated pixel-art medpack sprite [`assets/raycast/pickups/health.png`](file:///D:/Projects/side-scroller/assets/raycast/pickups/health.png) ($28 \times 19\text{px}$).
  - Updated pickup configuration, pre-slicing texture pipeline, tileset definitions, and scene asset loader to ensure the crisp medpack sprite renders in the 3D world with nearest-neighbor scaling.

## [2026-09-04] - 3D Blaster Laser Projectiles & Weapon Muzzle Integration

### 1. 3D Laser Projectile Physics & Rendering Engine
- **Raycast Laser Manager** ([`src/scenes/raycast/RaycastLaserManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastLaserManager.ts)):
  - Built a dedicated 3D laser projectile system using `assets/laser.png` with additive blending (`BLEND_MODES.ADD`) for intense sci-fi blaster glow.
  - Laser bolts are simulated in full 3D world space at high velocity (38.0 units/sec) towards targeted enemies, breakables, or walls.
  - Implemented 3D perspective foreshortening: near the weapon muzzle, bolt is elongated (4:1) along its firing trajectory; as it travels outward into the distance, perspective along the line of sight naturally compresses it into a compact, symmetrical rounded plasma pulse (1:1), eliminating awkward directional tilts and mid-air rotation.
  - Implemented 3D perspective scaling: bolt starts large at the weapon barrel tip and scales inversely with camera depth `transformY`.
  - Full Z-buffer occlusion testing prevents laser bolts from rendering in front of closer walls.

### 2. Weapon Muzzle Projection Integration
- **Barrel Origin Calculation** ([`src/scenes/raycast/RaycastWeaponView.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastWeaponView.ts)):
  - Added `getMuzzlePosition()` to compute the exact screen coordinates `(muzzleX, muzzleY)` of the weapon's barrel, taking recoil displacement and rotation into account.
  - Inverted camera projection math maps `(muzzleX, muzzleY)` at near-camera depth `d0 = 0.35` to world space `(startX, startY, startZ)`, guaranteeing the laser shoots directly out of the weapon barrel.

### 3. Target Acquisition & Impact VFX
- **Aim Cone Targeting & Impact Sparks** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)):
  - Replaced instant hitscan damage with physical 3D flying laser projectiles.
  - Automatically targets enemies in the aiming cone, props, or distant walls.
  - On impact with enemies or obstacles, spawns procedural multi-colored plasma sparks and flash circles, applying damage and notifying the HUD upon kill or destruction.

## [2026-09-04] - Mobile Weapon Switching & Touch Controls Fix

### 1. Dedicated Mobile Weapon Switch Virtual Button
- **On-Screen `[WPN]` Button** ([`src/ui/MobileControls.ts`](file:///D:/Projects/side-scroller/src/ui/MobileControls.ts)):
  - Added dedicated `btnWeapon: VirtualButton` with `[WPN]` label positioned at `(screenW - 180, screenH - 230)` right beside the action button `[E]` and above quick-turn `[>]`.
  - Configured tap handler to emit `"switchWeapon"`.
  - Properly disposed in `MobileControls.dispose()`.

### 2. Multi-Target Touch & Tap Weapon Switching
- **Interactive Weapon Sprite** ([`src/scenes/raycast/RaycastWeaponView.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastWeaponView.ts)):
  - Enabled `weaponSprite.eventMode = "static"` and `cursor = "pointer"`.
  - Added `pointerdown` and `pointertap` listeners that emit `"switchWeapon"` when the player taps their equipped weapon on-screen.
- **HUD & Weapon View Tap Proxy** ([`src/ui/TouchLookArea.ts`](file:///D:/Projects/side-scroller/src/ui/TouchLookArea.ts), [`src/ui/MobileControls.ts`](file:///D:/Projects/side-scroller/src/ui/MobileControls.ts)):
  - Added tap detection to `TouchLookArea` for short-duration stationary touches (`< 12px` movement, `< 350ms`).
  - Tapping either the HUD weapon box (bottom-right) or the equipped weapon area forwards to `"switchWeapon"`.
  - Added `stopPropagation()` to `VirtualButton` so button presses do not conflict with the look area or display objects underneath.

### 3. Comprehensive Weapon Cycling Feedback
- **Scene & Controller Wiring** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts), [`src/scenes/raycast/RaycastPlayerController.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastPlayerController.ts), [`src/scenes/raycast/RaycastHUD.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastHUD.ts)):
  - Connected `mobileControls.on("switchWeapon")` and `weaponView.on("switchWeapon")` to `playerController.cycleWeapon(1)`.
  - Updated `cycleWeapon()` to display informative toast notifications if the player has only 1 weapon in inventory or if alternate weapons are out of ammo, providing instant visual feedback.
  - Added `hud.adaptForMobile()` to display `[TAP / WPN]` instead of desktop key hints `[1-3 / TAP]`.

## [2026-09-04] - Raycaster Engine Performance Overhaul

### 1. Hierarchical Layer Containers & Scene Isolation
- **Layered Display Architecture** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)):
  - Removed 7,680 individual wall slice sprites from the root scene container.
  - Created a designated container hierarchy with explicit `zIndex` sorting:
    - `worldContainer`: Root 3D world container (`sortableChildren = true`).
    - `backgroundContainer` (`zIndex = 0`): Houses floor/ceiling `bgSprite` and fallback `graphics`.
    - `wallContainer` (`zIndex = 10`): Contains all pooled wall column sprites.
    - `objectContainer` (`zIndex = 20`): Contains billboard object sprites.
    - `animatedPickupContainer` (`zIndex = 30`): Contains keycards and interactive pickups.
    - `enemyContainer` (`zIndex = 40`): Contains 3D animated enemy billboards.
    - `detonatorContainer` (`zIndex = 50`): Contains in-flight projectiles and explosion VFX.
  - **Stationary Screen Shake**: Screen shake now transforms `worldContainer` directly instead of the scene root, keeping HUD, weapon view, and mobile controls stationary while eliminating transform invalidation across thousands of DisplayObjects.

### 2. Native 1:1 Crisp Floor & Ceiling Buffer with Row Occlusion Culling
- **Uncompromised 1:1 Crisp Fidelity** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)):
  - Maintained full 1280×720 native pixel fidelity for floor and ceiling with zero blurriness and zero resolution scaling.
  - Implemented `globalMaxWallTop` and `globalMinWallBottom` bounds calculation to completely skip scanline rows that are 100% occluded behind solid walls.
  - Added direct 32-bit pixel copy (`buf[idx] = rawPix | 0xff000000`) for full-brightness tiles near the player.

### 3. Wall Sprite Visibility Deltas
- **Delta-Based Visibility Updates** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)):
  - Replaced the brute-force `for..of` loop across all 7,680 column sprites with `prevHitCounts` tracking.
  - Only sets `sprite.visible = false` for the delta between the previous frame's hit count and current hit count.
  - Eliminates 1,280 iterator allocations and thousands of unnecessary DisplayObject visibility toggles per frame.

### 4. Zero-Allocation Tick & Render Loops
- **Pre-Indexed Door Animations**:
  - Pre-indexes all map door positions into `doorEntries` during level load.
  - `updateDoors(delta)` now operates strictly over active animated doors using flat array indices (`doorStatesFlat`), eliminating per-frame string concatenation, string splitting (`split(",")`), and `parseInt()`.
- **Pre-Allocated Thin Wall Buffers**:
  - Replaced per-frame `thinWalls.concat()` calls with an in-place reusable `allThinWalls` array.
  - `cullThinWalls()` now reuses `activeThinWalls` without array reallocation.
- **Pre-Allocated Object Collection & Static Sort**:
  - Billboard object collection in `renderScene()` clears and pushes into `this.mapObjects` without `.concat()`.
  - Sorts with static comparator `RaycastScene.compareObjects`, eliminating closure allocations.
- **Cached Input Vectors**:
  - Replaced `{ x: 0, y: 0 }` fallback allocations in `updatePlayer` and `tick` with static `RaycastScene.ZERO_VECTOR`.
  - Replaced `nearbyOffsets` array and `Set` in `tryOpenDoor` with static lookup tables.


## [2026-09-04] - Generic Enemy Voicelines, Concurrency Control & Audio Death Cutoff

### 1. Generic Enemy Voiceline Architecture & Extensibility
- **Generalized Enemy Architecture** ([`src/scenes/raycast/EnemyVoicelineManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/EnemyVoicelineManager.ts), [`src/configs/interfaces/IEnemyVoicelineConfig.ts`](file:///D:/Projects/side-scroller/src/configs/interfaces/IEnemyVoicelineConfig.ts), [`src/configs/EnemyVoicelineConfig.ts`](file:///D:/Projects/side-scroller/src/configs/EnemyVoicelineConfig.ts)):
  - Refactored and generalized the voice system from Stormtrooper-specific classes to an extensible enemy framework: `EnemyVoicelineManager`, `IEnemyVoicelineConfig`, `IEnemyVoicePool`, and `enemyVoicelineConfig`.
  - Added backward-compatibility aliases ([`src/scenes/raycast/StormtrooperVoicelineManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/StormtrooperVoicelineManager.ts), [`src/configs/interfaces/IStormtrooperVoicelineConfig.ts`](file:///D:/Projects/side-scroller/src/configs/interfaces/IStormtrooperVoicelineConfig.ts), [`src/configs/StormtrooperVoicelineConfig.ts`](file:///D:/Projects/side-scroller/src/configs/StormtrooperVoicelineConfig.ts)) ensuring legacy references remain fully functional.
- **Dynamic Voice Pool Hierarchy & Registry**:
  - Implemented 3-tier dynamic voice pool resolution via `getVoicePool(enemy)`:
    1. **Enemy instance override**: `enemy.config.voicelines` (per-enemy custom pool in `IRaycastEnemyConfig`).
    2. **Registered enemy type pool**: `voicePools[enemyType]` (e.g. `registerEnemyVoicePool("officer", pool)` or `"droid"`).
    3. **Default voice pool**: Fallback pool defined in `defaultVoicePool`.
  - Enables adding new enemy types (Imperial Officers, Battle Droids, Commanders) or individual boss voice sets without modifying manager code.

### 2. Situational Audio Triggers & Asset Integration
- **Sound Asset Registration** ([`src/configs/GameConfig.ts`](file:///D:/Projects/side-scroller/src/configs/GameConfig.ts), [`src/configs/EnemyVoicelineConfig.ts`](file:///D:/Projects/side-scroller/src/configs/EnemyVoicelineConfig.ts)):
  - Registered authentic Stormtrooper audio assets in the PixiJS sound manifest:
    - `"stormtrooper_grenade"`: [`assets/raycast/voicelines/storm_trooper/grenade_grenade.mp3`](file:///D:/Projects/side-scroller/assets/raycast/voicelines/storm_trooper/grenade_grenade.mp3)
    - `"stormtrooper_hear_something"`: [`assets/raycast/voicelines/storm_trooper/i_hear_something.mp3`](file:///D:/Projects/side-scroller/assets/raycast/voicelines/storm_trooper/i_hear_something.mp3)
    - `"stormtrooper_rebel_scum"`: [`assets/raycast/voicelines/storm_trooper/rebel_scum.mp3`](file:///D:/Projects/side-scroller/assets/raycast/voicelines/storm_trooper/rebel_scum.mp3)
    - `"stormtrooper_there_he_is"`: [`assets/raycast/voicelines/storm_trooper/there_he_is.mp3`](file:///D:/Projects/side-scroller/assets/raycast/voicelines/storm_trooper/there_he_is.mp3)
- **Contextual State Triggers** ([`src/scenes/raycast/RaycastEnemyManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemyManager.ts)):
  - **Player Spotted Callouts**: When an enemy gains line of sight to the player (`hasLOS = true`), randomly selects between `"stormtrooper_rebel_scum"` and `"stormtrooper_there_he_is"`.
  - **Suspicious Proximity Callouts**: When the player is close ($dist \le hearingRange$, default $7.0$ grid units) but out of sight (`hasLOS = false`, e.g. behind walls or closed doors), triggers `"stormtrooper_hear_something"`.
  - **Grenade Detection**: When a thermal detonator is thrown, nearby enemies react with `"stormtrooper_grenade"`.

### 3. Concurrency Limiting, Priority Queue & Spacing
- **Configurable Concurrency & Spacing Controls** ([`src/configs/EnemyVoicelineConfig.ts`](file:///D:/Projects/side-scroller/src/configs/EnemyVoicelineConfig.ts), [`src/scenes/raycast/EnemyVoicelineManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/EnemyVoicelineManager.ts)):
  - `maxConcurrentVoicelines: 1`: Limits how many voice lines can play at once across all enemies, preventing cacophonous speech overlap.
  - `voicelineSpacing: 2500` ms: Enforces natural conversational spacing between consecutive voice lines.
  - Runtime setters `setMaxConcurrentVoicelines(count)` and `setVoicelineSpacing(spacingMs)` allow dynamic tuning.
- **Priority Queue & Cooldowns**:
  - Implemented priority queue (`QueuedVoiceline`) that prioritizes high-urgency callouts (grenades > spotted > suspicious) and discards stale audio requests (`maxAgeMs`).
  - Per-category cooldowns to prevent repetitive spam: `spottedCooldown: 7000` ms, `suspiciousCooldown: 10000` ms, `grenadeCooldown: 1200` ms.
- **Spatial Panning & Volume Attenuation**:
  - Automatically calculates 3D directional panning based on angle to player camera and distance attenuation with configurable `minSpatialVolume: 0.5`.

### 4. Emergency Priority & Guaranteed Grenade Shouts
- **Zero-Latency Grenade Windup Trigger** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)):
  - Triggered immediately when the player initiates a throw in `playThrowAnimation()` rather than waiting for projectile release, ensuring immediate audible feedback.
- **Emergency Priority Interruption** ([`src/scenes/raycast/EnemyVoicelineManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/EnemyVoicelineManager.ts)):
  - Grenade alerts bypass normal conversational spacing checks.
  - If voice channels are full (`activeHandles.size >= maxConcurrentVoicelines`), casual chatter ("i hear something", "rebel scum") is immediately interrupted and stopped to play the grenade shout.
- **Reliable Fallback Positioning**:
  - Finds the closest alive enemy to shout; if all enemies on the map are eliminated or out of range, audio falls back to player coordinates at high volume ($0.95$) so the player is guaranteed to hear the reaction every time.

### 5. Instant Sound & Voiceline Cutoff on Enemy Death
- **Active Sound Instance Tracking** ([`src/scenes/raycast/RaycastEnemy.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemy.ts)):
  - Added `activeSoundInstances` and `trackSoundInstance(res)` to track all running `@pixi/sound` instances (pain sounds, attack sounds, voice clips).
  - Added `stopActiveSounds()` which stops every playing audio instance immediately.
- **Immediate Termination on Fatal Damage**:
  - In `takeDamage()`, when health reaches 0, `stopActiveSounds()` is executed synchronously alongside `onDeathCallback`.
  - Invokes `EnemyVoicelineManager.onEnemyDeath(enemyId)`:
    - Immediately calls `.stop()` on any active voice lines belonging to the slain enemy.
    - Purges any pending lines for that enemy from the voiceline queue.
    - Adds enemy ID to `deadEnemyIds` to reject any pending asynchronous playback callbacks.
    - Protects grenade shouts from cutoff if the enemy is eliminated by the grenade explosion while shouting.
- **Disposal Safety**:
  - `dispose()` calls `stopActiveSounds()` to prevent orphaned audio playback when enemies are cleared or scenes unload.

---

## [2026-09-02] - Tiled Custom Types Refactor & Bidirectional Door Sliding

### 1. Tiled Custom Types Schema Architecture
- **Dedicated Enum Modules** ([`src/enums/DoorOpen.ts`](file:///D:/Projects/side-scroller/src/enums/DoorOpen.ts), [`src/enums/TileType.ts`](file:///D:/Projects/side-scroller/src/enums/TileType.ts), [`src/enums/Align.ts`](file:///D:/Projects/side-scroller/src/enums/Align.ts), [`src/enums/Anchor.ts`](file:///D:/Projects/side-scroller/src/enums/Anchor.ts), [`src/enums/FlatWallRotation.ts`](file:///D:/Projects/side-scroller/src/enums/FlatWallRotation.ts), [`src/enums/Weapons.ts`](file:///D:/Projects/side-scroller/src/enums/Weapons.ts), [`src/enums/PickUpType.ts`](file:///D:/Projects/side-scroller/src/enums/PickUpType.ts)):
  - Added string enums matching the Tiled custom type definitions:
    - `DoorOpen`: `"Up"`, `"Left"`, `"Right"`.
    - `TileType`: `"door"`, `"thinWall"`, `"thickWall"`, `"ceiling"`, `"floor"`, `"stairs"`.
    - `Align`: `"-"`, `"left"`, `"right"`, `"top"`, `"bottom"`, `"center"`.
    - `Anchor`: `"ceiling"`, `"floor"`, `"center"`, `"-"`.
    - `FlatWallRotation`: `"-"`, `"vertical"`, `"horizontal"`.
    - `Weapons`: `"e_11"`, `"-"`, `"thermal_detonator"`, `"dh_17"`.
    - `PickupType`: `"weapon"`, `"ammo"`, `"health"`, `"shield"`, `"-"`, `"blue_keycard"`, `"red_keycard"`, `"green_keycard"`.
- **Tiled Class Interfaces** ([`src/scenes/raycast/types.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/types.ts)):
  - Added `ITile`, `IDestructableWall`, `IObject`, `IPickupItem`, and `IWeapon` representing Tiled classes with member properties and typed enum links.
  - Extended `TileMeta` with `open` and `tileType`.
  - Updated `DoorSlideMode` to support `DoorOpen` enum (`"Up"`, `"Left"`, `"Right"`).

### 2. TSX Tileset Auto-Loader & Source Resolution
- **StarWarsTileset.tsx Integration** ([`assets/raycast/levels/StarWarsTileset/StarWarsTileset.tsx`](file:///D:/Projects/side-scroller/assets/raycast/levels/StarWarsTileset/StarWarsTileset.tsx)):
  - Placed external TSX tileset into the project matching `"source": "StarWarsTileset/StarWarsTileset.tsx"` in `test_level.json`.
- **`loadExternalTileset` Runtime Parser** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)):
  - In `setupScene()`, detects if `tileset.source` is defined without embedded `tiles`, asynchronously fetching and parsing the TSX XML via `DOMParser`.
  - Populates all 19 tiles, extracting image paths, custom properties, and classes.
  - Maps image names (`basic_imperial_wall.jpg`, `fence.png`, `metal_door.jpg`, etc.) directly to assets inside `assets/`.
- **`Tile` Class Defaults**:
  - In `parseTiledMap()`, tiles with `type="Tile"` automatically inherit class defaults (`tileType = "door"`, `open = "Up"`).
  - Explicit properties `"tileType"` and `"open"` override defaults accordingly.

### 3. Bidirectional Horizontal Sliding & Vertical Ceiling Doors
- **Door Sliding Raycasting** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)):
  - **`DoorOpen.UP` (`"Up"`)**: Slides vertically into the ceiling recess with uncompressed UV scrolling.
  - **`DoorOpen.LEFT` (`"Left"`)**: Horizontal slide to the left ($offset \le 1.0 - open$). Door UV translates with `texX = offset + open`, opening a gap on the right.
  - **`DoorOpen.RIGHT` (`"Right"`)**: Horizontal slide to the right ($offset \ge open$). Door UV translates with `texX = offset - open`, opening a gap on the left.
- **In-Game Toggle Hotkey**:
  - Pressing <kbd>V</kbd> cycles between `UP (Ceiling)` $\to$ `LEFT` $\to$ `RIGHT` with instant HUD toast feedback.

---

## [2026-09-01] - Thermal Detonator Weapon, Throwable 3D Physics, AOE Explosions & Enemy Fixes

### 1. Thermal Detonator Throwable Weapon & Multi-Weapon Inventory
- **Weapon Definition & Configuration** ([`src/enums/RaycastWeaponType.ts`](file:///D:/Projects/side-scroller/src/enums/RaycastWeaponType.ts), [`src/configs/interfaces/IRaycastWeaponConfig.ts`](file:///D:/Projects/side-scroller/src/configs/interfaces/IRaycastWeaponConfig.ts), [`src/configs/RaycastWeaponConfigs.ts`](file:///D:/Projects/side-scroller/src/configs/RaycastWeaponConfigs.ts)):
  - Added `RaycastWeaponType.THERMAL_DETONATOR`.
  - Configured `thermalDetonatorConfig` with high explosive damage (`damage: 150`), `isThrowable: true`, configurable fuse timer (`fuseTime: 2.0`), and blast radius (`explosionRadius: 3.5`).
- **Configurable Screen Positioning & Scale** ([`src/configs/RaycastWeaponConfigs.ts`](file:///D:/Projects/side-scroller/src/configs/RaycastWeaponConfigs.ts), [`src/scenes/raycast/RaycastWeaponView.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastWeaponView.ts)):
  - Extended `IRaycastWeaponConfig` and `RaycastWeaponView` with per-weapon `viewPosX`, `viewPosY`, `viewScale`, `anchorX`, and `anchorY` settings.
  - Allows full customization of where throwable and firearm weapons rest on the screen and their display scale.
- **First-Person Throw Animation** ([`src/scenes/raycast/RaycastWeaponView.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastWeaponView.ts)):
  - Implemented `playThrowAnimation(onRelease, onComplete)`:
    - **Windup phase**: Weapon pulls back and slightly up.
    - **Toss phase**: Swings forward and down offscreen, releasing the 3D projectile into the world at peak toss (`progress = 0.45`).
    - **Recovery/Draw phase**: Draws the next detonator from below the screen (or switches back to primary weapon if ammo depleted).
- **DH-17 Blaster Pistol as Default Starting Weapon** ([`src/configs/RaycastWeaponConfigs.ts`](file:///D:/Projects/side-scroller/src/configs/RaycastWeaponConfigs.ts), [`src/scenes/raycast/RaycastPlayerController.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastPlayerController.ts), [`src/configs/GameConfig.ts`](file:///D:/Projects/side-scroller/src/configs/GameConfig.ts)):
  - Added `RaycastWeaponType.DH17` enum and `dh17Config` using [`assets/raycast/weapons/dh_17.png`](file:///D:/Projects/side-scroller/assets/raycast/weapons/dh_17.png) and authentic firing sound [`assets/sounds/dh_17_blaster.mp3`](file:///D:/Projects/side-scroller/assets/sounds/dh_17_blaster.mp3).
  - Player now begins the game equipped with the **DH-17 Blaster Pistol** with 30 starting ammo instead of the E-11.
  - The E-11 Blaster Rifle can still be acquired as a weapon drop from defeated Stormtroopers or map pickups.
- **E-11 Blaster Rifle Right-Click Automatic Fire Mode** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts), [`src/scenes/raycast/RaycastPlayerController.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastPlayerController.ts), [`src/configs/RaycastWeaponConfigs.ts`](file:///D:/Projects/side-scroller/src/configs/RaycastWeaponConfigs.ts)):
  - Added full-auto firing mode when holding the right mouse button with the E-11 Blaster Rifle equipped.
  - Supported `autoFireRate: 140` ms (~7.1 shots/sec) in `IRaycastWeaponConfig` and `e11Config` for rapid blaster fire.
  - Registered `contextmenu`, `mouseup`, and `blur` window listeners to prevent browser context menu interruptions and ensure smooth button release detection.
  - Auto-switches to E-11 when right-clicking if the player owns the rifle in their inventory, with immediate first shot execution and a clear HUD hint if the weapon is not yet owned.
- **Multi-Weapon Inventory & Switching Controls** ([`src/scenes/raycast/RaycastPlayerController.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastPlayerController.ts), [`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts), [`src/scenes/raycast/RaycastHUD.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastHUD.ts)):
  - Player inventory now tracks separate ammo counters for all owned weapons (`DH-17`, `E-11`, `Thermal Detonator`).
  - Added weapon switching support:
    - Key `1`: Equip DH-17 Blaster Pistol.
    - Key `2`: Equip E-11 Blaster Rifle.
    - Key `3`: Equip Thermal Detonator.
    - Key `Q`: Cycle previous weapon.
    - Mouse Wheel: Cycle next/previous weapon.
    - HUD Weapon Box Click/Tap: Interactive weapon switcher with `[1-3 / TAP]` switch hint.
- **Door Opening Audio Effect (`assets/sounds/door_1.mp3`)** ([`src/configs/GameConfig.ts`](file:///D:/Projects/side-scroller/src/configs/GameConfig.ts), [`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)):
  - Registered `door_1` in the manifest `sounds` bundle pointing to [`assets/sounds/door_1.mp3`](file:///D:/Projects/side-scroller/assets/sounds/door_1.mp3).
  - Integrated audio playback into `tryOpenDoor()` so the sound plays whenever a door slides open or closed upon interaction.
- **Configurable Vertical (Up / Down) & Horizontal Sliding Doors** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts), [`src/configs/GameConfig.ts`](file:///D:/Projects/side-scroller/src/configs/GameConfig.ts), [`src/scenes/raycast/types.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/types.ts), [`assets/raycast/levels/test_level.json`](file:///D:/Projects/side-scroller/assets/raycast/levels/test_level.json)):
  - Added full support for three door slide modes:
    - `"slide_up"`: Door rises smoothly into the ceiling recess to open, drops down to close.
    - `"slide_down"`: Door sinks smoothly into the floor recess to open, rises up to close.
    - `"slide_sideways"`: Classic horizontal sliding door (left/right).
  - **Zero-Distortion Texture Projection**: Implemented dynamic zero-allocation UV cropping pool (`doorColumnTextures`) so vertical doors realistically slide into the ceiling or floor without stretching, squashing, or accordion distortion.
  - **Ceiling & Floor Occlusion**: Accurately occludes ceiling pixels above rising doors and floor pixels below sinking doors while rendering the rooms and floors behind open door apertures.
  - **Configurable via 4 Methods**:
    1. Global default in `GameConfig.ts` (`gameConfig.defaultDoorSlide = "slide_up"`).
    2. Per-tile / per-door property in Tiled level JSON (`"slide": "up" | "down" | "sideways"`).
    3. Programmatically via `scene.setDefaultDoorSlideMode(mode)` or `scene.setDoorSlideMode(x, y, mode)`.
  - **Eliminated Phantom Cell-Entrance Wall**: Removed legacy fallback that drew a flat door texture across the grid cube's outer entry boundary (`distance = dist`) when rays missed the center door plane. Freestanding doors and angled doorway views no longer display flickering partial textures or spurious solid door faces on cube boundaries.
  - **Door Edge & Jamb Raycasting**: Resolved door side-cutting where diagonal screen columns crossing the perpendicular grid axis were prematurely flagged as solid jambs. All rays intersecting the door plane between `[0, 1]` now uniformly slide up across the entire doorway width.
  - **Aperture Floor/Ceiling Occlusion**: Open/opening doors (`open >= 0.05`) no longer set ceiling occlusion bounds (`wTop = 0`), which previously caused the background buffer to skip ceiling rendering and leave stale ceiling pixels from previous camera angles when turning quickly.
  - **Pool Reference Safety**: Replaced array reference shifting in hit deduplication with in-place rotation to maintain distinct object instances across frames.

---

### 2. Pickups System (Thermal Detonator Belt & Single)
- **Pickup Types & Amounts** ([`src/enums/RaycastPickupType.ts`](file:///D:/Projects/side-scroller/src/enums/RaycastPickupType.ts), [`src/configs/RaycastPickupConfigs.ts`](file:///D:/Projects/side-scroller/src/configs/RaycastPickupConfigs.ts)):
  - Added `RaycastPickupType.THERMAL_DETONATOR_SINGLE` (awards 1 detonator) and `RaycastPickupType.THERMAL_DETONATOR_BELT` (awards 5 detonators).
  - Preloaded textures in `GameConfig.ts` (`assets/raycast/pickups/thermal_detonator_pickup.png` and `assets/raycast/pickups/thermal_detonator_belt.png`).
- **3D World Billboard Rendering & Map Parsing** ([`src/scenes/raycast/RaycastPickupManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastPickupManager.ts)):
  - Slices pickup textures into 1px vertical column textures for zero-allocation billboard rendering with Z-buffer depth testing.
  - Automatically parses tile layers and object layers with `type="thermal_detonator"`, `type="thermal_detonator_belt"`, or matching image filenames.

---

### 3. 3D Projectile Physics, Ground Landing & Configurable Bounciness
- **Detonator Manager** ([`src/scenes/raycast/ThermalDetonatorManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/ThermalDetonatorManager.ts)):
  - Created `ThermalDetonatorManager` handling 3D flight physics, bouncing, floor friction, wall collisions, fuse countdown, LED indicator blinking, and explosion animation.
- **Configurable Bounciness & Physics Damping** ([`src/configs/RaycastWeaponConfigs.ts`](file:///D:/Projects/side-scroller/src/configs/RaycastWeaponConfigs.ts), [`src/configs/interfaces/IRaycastWeaponConfig.ts`](file:///D:/Projects/side-scroller/src/configs/interfaces/IRaycastWeaponConfig.ts), [`src/scenes/raycast/ThermalDetonatorManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/ThermalDetonatorManager.ts)):
  - `throwSpeed`: Initial horizontal throwing velocity (`8.5`).
  - `bounciness`: Floor bounce restitution (`0.28`). Lower values produce a realistic, heavy grenade thud with 1–2 low hops rather than bouncing wildly.
  - `wallBounciness`: Wall bounce restitution (`0.30`). Rebounds realistically off walls, doors, and security barriers.
  - `friction`: Ground rolling friction (`0.80`). Rolls smoothly to a stop on the floor.
  - `maxBounces`: Maximum bounce limit (`2`) before settling into ground rolling mode.
- **Z-Buffer Occlusion**:
  - Active detonator in-flight and on the ground is converted to 3D billboard objects and rendered column-by-column against the camera Z-buffer.

---

### 4. Animated 3D Explosion & AOE Damage System
- **Explosion Animation (`assets/explosion.json`)** ([`src/scenes/raycast/ThermalDetonatorManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/ThermalDetonatorManager.ts)):
  - Loads 17 frames (`explosion_00.png` through `explosion_16.png`) from `assets/explosion.json`.
  - Spawns at 3D detonation coordinates with perspective scaling and per-column run-length Graphics occlusion masks matching raycast walls.
  - Plays explosion audio effect (`explosion_sound`).
- **Screen Shake & Proximity Feedback** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts)):
  - Added camera screen shake decaying over time with intensity scaled inversely to the player's distance from the blast.
- **Area-of-Effect (AOE) Damage** ([`src/scenes/RaycastScene.ts`](file:///D:/Projects/side-scroller/src/scenes/RaycastScene.ts), [`src/scenes/raycast/RaycastEnemyManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemyManager.ts), [`src/scenes/raycast/RaycastBreakableManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastBreakableManager.ts)):
  - Implemented `applyAreaDamage()` in `RaycastEnemyManager` with distance falloff damage for all enemies inside `explosionRadius`.
  - Implemented `applyAreaDamage()` in `RaycastBreakableManager` to destroy chairs, tables, and power cells within the blast radius (triggering security barrier deactivation).
  - Player takes splash damage if caught within the blast radius, complete with screen flash and HUD warning toast.

---

### 5. Stormtrooper Spritesheet & Visibility Fixes
- **Asset Path Correction** ([`src/configs/RaycastEnemyConfigs.ts`](file:///D:/Projects/side-scroller/src/configs/RaycastEnemyConfigs.ts), [`src/scenes/raycast/RaycastEnemyManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemyManager.ts)):
  - Updated `stormtrooperConfig.spritesheet` and `initSpritesheets()` to load `assets/raycast/enemies/storm_trooper.json` (resolving 404 error caused by earlier asset restructuring).
  - Added multi-path fallback resolver supporting alias `"storm_trooper"` and registered sheets under all key formats.
- **Recursive Group Layer Support** ([`src/scenes/raycast/RaycastEnemyManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemyManager.ts)):
  - Added `collectLayers()` to recursively unpack any group layers (e.g. elevation groups) when scanning for enemy spawn layers.
- **Starting Area Proximity Spawn** ([`src/scenes/raycast/RaycastEnemyManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemyManager.ts)):
  - Automatically spawns a Stormtrooper at `(5.5, 5.0)` in the starting corridor if no map enemies exist within range 8 of the player spawn `(2, 5)`, ensuring immediate visibility and testing.
- **Occlusion Mask Refinement** ([`src/scenes/raycast/RaycastEnemyManager.ts`](file:///D:/Projects/side-scroller/src/scenes/raycast/RaycastEnemyManager.ts)):
  - Enhanced run-length occlusion masking and offscreen bounds culling to prevent false full-occlusion when sprites are partially visible.

---

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
  - Pre-loads and pre-slices standard pickup textures (`assets/raycast/pickups/e_11_item.png`, `assets/health.png`, `assets/ammo.png`) in `initTextures()`, ensuring dynamically spawned weapon drops render visibly on the floor.
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
