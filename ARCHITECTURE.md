# Architecture & Decoupling Blueprint (`ARCHITECTURE.md`)

> **Target Goal:** Refactor this monolithic Pixi.js v7 raycaster codebase (`side-scroller` / Star Wars Raycaster) into a strict, framework-agnostic monorepo where all simulation, raycasting math, map parsing, AI, physics, and game state have **zero dependency** on `pixi.js`, `@pixi/sound`, or browser DOM APIs—enabling a future **Sony PS Vita** port (C/C++ via VitaSDK + `vitaGL`/`sceGxm`, or Lua) by implementing only platform rendering, audio, input, and storage adapters.

---

## 1. Current Dependency Audit

A static audit of all **129 source and shader files** under `src/` reveals **54 pure TypeScript / GLSL files** and **75 files tightly coupled** to `pixi.js`, `@pixi/sound`, or DOM/browser APIs. The central bottleneck is `src/scenes/RaycastScene.ts` (**6,720 lines**), which acts as a monolithic God Object fusing DDA raycasting, Tiled XML/JSON parsing, WebGL shader management, column sprite pooling, collision physics, door/trigger graphs, browser input listeners, and audio playback.

### 1.1 Core Raycaster Engine & Scene Orchestration

| File | Lines | Pixi.js | Audio (`@pixi/sound`) | DOM / Browser | Tight Coupling Pinpoints |
| :--- | ---: | :---: | :---: | :--- | :--- |
| `src/scenes/RaycastScene.ts` | 6,720 | **YES** | **YES** | `window`, `document`, `navigator`, `canvas/2D`, `fetch`, `setTimeout`, DOM events | Fuses `castRay()`, `cullThinWalls()`, `tryMove()`, `updateDoors()`, and `parseTiledMap()` directly with `Container`/`Sprite`/`Mesh`/`Shader`/`Texture` pools, `document.pointerLockElement`, `window.addEventListener`, `DOMParser` (external `.tsx`), `HTMLCanvasElement` (skybox stitching & floor/ceiling atlas), `fetch()`, and `sound.play()`/`sound.add()`. |
| `src/scenes/raycast/types.ts` | 276 | **YES** | no | — | Leaks `AnimatedSprite`, `Graphics`, and `Texture` into core data models (`RaycastPickupItem.animatedSprite`, `RaycastPickupItem.occlusionMask`, `MapObject.customTexture`, `MapObject.customSlices`). Also re-exports `EnemyVoicelineManager` (pulling `@pixi/sound` transitively). |
| `src/scenes/raycast/RaycastPlayerController.ts` | 608 | no* | **YES** | — | Core player state (HP, shield, ammo, stamina, weapon switching, footsteps, head bob) imports `RaycastHUD` and `RaycastWeaponView` (transitive Pixi coupling) and directly calls `sound.add()` / `sound.play()` for footsteps and weapon SFX. |
| `src/scenes/raycast/RaycastEnemy.ts` | 2,024 | **YES** | **YES** | — | AI state machine (`PATROL`/`CHASE`/`ATTACK`/`ALERT`/`DEAD`), LOS, and A* path following are merged with `AnimatedSprite`, `Spritesheet`, `Texture`, `Graphics` occlusion masks, and `sound.play()`/`IMediaInstance` (alert & hover loop audio). |
| `src/scenes/raycast/RaycastEnemyManager.ts` | 2,685 | **YES** | **YES** | — | Wave spawning, Tiled enemy parsing, enemy-vs-enemy separation, and projectile hit detection are coupled to `Assets.load()`, `Container`, `Graphics`, `Spritesheet`, `sound.add()`, and per-frame billboard projection + Z-buffer clipping. |
| `src/scenes/raycast/RaycastAlly.ts` | 593 | **YES** | no | — | Companion AI & path following coupled to `AnimatedSprite`, `Spritesheet`, `Texture` via `RaycastDirectionalObject`. |
| `src/scenes/raycast/RaycastAllyManager.ts` | 528 | **YES** | **YES** | — | Ally spawning & interaction prompts coupled to `Assets.load()`, `Container`, `Graphics`, `sound.play()`. |
| `src/scenes/raycast/RaycastDirectionalObject.ts` | 407 | **YES** | no | — | 8-directional angle-sector math (`calculateDirectionalSector`) is pure math, but lives on a base class owning `AnimatedSprite`, `Graphics` occlusion masks, and `Texture` arrays. |
| `src/scenes/raycast/RaycastStationaryObject.ts` | 164 | **YES** | no | — | Static directional prop state coupled to `AnimatedSprite` / `Texture`. |
| `src/scenes/raycast/RaycastStationaryObjectManager.ts` | 501 | **YES** | no | — | Prop collision/raycast hit tests coupled to `Assets.load()`, `Container`, `Graphics` (occlusion masks). |
| `src/scenes/raycast/RaycastLaserManager.ts` | 861 | **YES** | **YES** | — | Projectile kinematics, wall/enemy/player hit detection, and impact timers are coupled to `Sprite` pooling, `Assets.load()`, `Texture`, and `sound.play()`. |
| `src/scenes/raycast/ThermalDetonatorManager.ts` | 638 | **YES** | **YES** | `setTimeout` | Grenade parabolic arc physics, bounce, fuse timer, and splash damage are coupled to `Assets.load()`, `Sprite`/`AnimatedSprite` rendering, `sound.play()`, and wall-clock `setTimeout`. |
| `src/scenes/raycast/RaycastPickupManager.ts` | 1,226 | **YES** | **YES** | — | Pickup spawning, collection radii, and item drops are coupled to `Assets.load()`, 1px `Texture` slicing (`new Texture(baseTex, new Rectangle(...))`), `AnimatedSprite`, `Graphics` masks, and `sound.play()`. |
| `src/scenes/raycast/RaycastBreakableManager.ts` | 827 | **YES** | **YES** | — | Breakable prop/wall HP, hit detection, and link-triggering are coupled to `Assets.load()`, 1px `Texture` slicing, and `sound.play("explosion_sound")`. |
| `src/scenes/raycast/RaycastStairsManager.ts` | 504 | **YES** | **YES** | — | Stair node parsing, elevation transitions, and teleportation logic are coupled to `Container`, `StarWarsWipeTransition` (WebGL shader), and `sound.add()`/`sound.play()`. |
| `src/scenes/raycast/EnemyVoicelineManager.ts` | 824 | no | **YES** | `setTimeout`, `WebAudioContext` | Cooldown/priority queue logic is coupled directly to `@pixi/sound` (`sound.play`, `sound.stop`, `webaudio.WebAudioContext`) and `setTimeout` timers for queue advancement. |
| `src/scenes/raycast/RaycastSaveManager.ts` | 170 | no | no | `localStorage` | Save schema serialization is clean, but directly reads/writes `localStorage` and imports `RaycastPlayerController`. |
| `src/scenes/raycast/DestructableWall.ts` | 348 | no | no | — | **Pure TS.** Ready to move directly into `@game/map-builder` / `@game/game-state`. |
| `src/scenes/raycast/DestructableWallManager.ts` | 310 | no | no | — | **Pure TS.** Ready to move directly into `@game/game-state`. |
| `src/scenes/raycast/tiledUtils.ts` | 181 | no | no | — | **Pure TS.** Tiled GID flag decoding & chunk iteration. Ready for `@game/map-builder`. |
| `src/scenes/raycast/StormtrooperVoicelineManager.ts` | 2 | no | no | — | **Pure TS** (legacy re-export stub). |

### 1.2 Objectives, Subtitles & Plugins

| File | Lines | Pixi.js | Audio | DOM / Browser | Tight Coupling Pinpoints |
| :--- | ---: | :---: | :---: | :--- | :--- |
| `src/scenes/raycast/objectives/RaycastTriggerManager.ts` | 782 | **YES** | **YES** | `fetch`, `setTimeout`, `AudioContext` | Extends `PIXI.utils.EventEmitter`; trigger zone AABB/wait logic is coupled to `sound.add()`/`sound.play()`, `fetch(..., { method: "HEAD" })` audio probing, and `setTimeout`. |
| `src/scenes/raycast/objectives/RaycastObjectiveManager.ts` | 199 | **YES** | no | `fetch`, `setTimeout` | Extends `PIXI.utils.EventEmitter`; loads mission JSON via `Assets.load()`/`fetch()` and delays notifications via `setTimeout`. |
| `src/scenes/raycast/objectives/RaycastMissionManager.ts` | 121 | **YES** | no | — | Couples `RaycastObjectiveManager` + `RaycastTriggerManager` with `ObjectivesUI` (`Container`). |
| `src/scenes/raycast/objectives/ObjectivesUI.ts` | 417 | **YES** | no | `window`, `performance.now`, `setTimeout` | Pure UI view (belongs in `@game/renderer-pixi`). |
| `src/scenes/raycast/objectives/ObjectiveTypes.ts`, `index.ts` | 68 | no | no | — | **Pure TS.** |
| `src/scenes/raycast/subtitles/SubtitleManager.ts` | 82 | no | no | `fetch` | Loads `dialog.json` directly via browser `fetch()`. |
| `src/scenes/raycast/subtitles/RaycastSubtitles.ts` | 182 | **YES** | no | `window` | Pure UI view (belongs in `@game/renderer-pixi`). |
| `src/scenes/raycast/subtitles/SubtitleTypes.ts`, `index.ts` | 50 | no | no | — | **Pure TS.** |
| `src/plugins/pathfinding/AStarPathfinder.ts`, `index.ts` | 567 | no | no | — | **Pure TS.** Binary heap A* + path follower. Already framework-agnostic; ready for `@game/ai-system`. |
| `src/plugins/minimap/MinimapDiscovery.ts`, `MinimapTypes.ts`, `index.ts` | 394 | no | no | — | **Pure TS.** Fog-of-war discovery grid. Ready for `@game/game-state`. |
| `src/plugins/minimap/RaycastMinimap.ts`, `MinimapRenderer.ts`, `MinimapUI.ts` | 1,095 | **YES** | no | `window` | Pure Pixi rendering & UI wrapper around `MinimapDiscovery` (belongs in `@game/renderer-pixi`). |

### 1.3 View / UI / Shaders / Entrypoint / Settings

| File(s) | Lines | Pixi.js | Audio | DOM / Browser | Tight Coupling Pinpoints |
| :--- | ---: | :---: | :---: | :--- | :--- |
| `src/index.ts` | 336 | **YES** | **YES** | `window`, `document`, `navigator`, `canvas`, DOM events | Bootstraps `PIXI.Application`, `Ticker`, `pixi-stats`, scene routing, audio unlock listeners, and fullscreen. Belongs in `@game/platform-web`. |
| `src/Utils.ts` | 112 | **YES** | no | `window`, `document`, `localStorage`, `setTimeout` | Mixes `Assets.load()`, `Sprite`/`AnimatedSprite` helpers, fullscreen DOM calls, and `localStorage`. |
| `src/managers/SettingsManager.ts` | 234 | no | **YES** | `window`, `localStorage`, `navigator` | Settings data model directly mutates `@pixi/sound` global/alias volumes, probes `window.matchMedia("(pointer: coarse)")`, and writes `localStorage`. |
| `src/scenes/raycast/RaycastHUD.ts`, `RaycastWeaponView.ts`, `RaycastDebugMenu.ts`, `StarWarsWipeTransition.ts` | 2,310 | **YES** | **YES** (WeaponView) | `window`, `navigator`, `performance.now` | Presentation layer (`@game/renderer-pixi`), except `RaycastWeaponView` directly invokes `sound.play()` and tracks weapon fire cooldown/animation state that should live in simulation. |
| `src/ui/*` (8 files: `MobileControls.ts`, `TouchLookArea.ts`, `VirtualJoystick.ts`, `VirtualButton.ts`, `InGameMenu.ts`, `RaycastLoadingOverlay.ts`, `HUD.ts`, `Instructions.ts`) | 1,738 | **YES** | **YES** (Menus) | `window`, `document`, Touch/Pointer events | Platform UI & touch input adapters (`@game/input-web` + `@game/renderer-pixi`). |
| `src/scenes/*` (9 non-raycast scenes: `BaseScene.ts`, `MainMenu.ts`, `LevelSelectScene.ts`, `LevelEndScene.ts`, `StarWarsIntroScene.ts`, `CutsceneScene.ts`, `CreditsScene.ts`, `EndGame.ts`, `EndlessLevel.ts`) | 4,530 | **YES** | **YES** | `window`, `document`, `navigator`, `canvas`, DOM events | Menu/cutscene presentation + legacy 2D side-scroller (`EndlessLevel.ts`). |
| `src/scenes/raycast/shaders/*` (8 `.vert`/`.frag` files) | 340 | no | no | — | WebGL1 GLSL ES 1.00 shaders (`floorCeiling`, `skybox`, `starWarsWipe`, `starWarsCrawl`). Belong in `@game/renderer-pixi`. |

### 1.4 Configs, Enums & Legacy 2D Side-Scroller Files

* **Pure TS Raycast Configs & Interfaces (18 files, 0 platform coupling):** `RaycastEnemyConfigs.ts`, `RaycastWeaponConfigs.ts`, `RaycastPickupConfigs.ts`, `RaycastLevelConfig.ts`, `RaycastUIConfig.ts`, `DestructableWallConfig.ts`, `EnemyVoicelineConfig.ts`, `StormtrooperVoicelineConfig.ts`, `SkyboxConfig.ts`, `SoundConfig.ts`, plus `src/configs/interfaces/IRaycast*.ts`, `IEnemyVoicelineConfig.ts`, `IEntitySoundConfig.ts`, `ISoundConfig.ts`, `IStormtrooperVoicelineConfig.ts`, and `src/shaders.d.ts`.
* **Pure TS Enums (14 files, 0 platform coupling):** All files under `src/enums/*` (`Align`, `Anchor`, `DoorOpen`, `EnemyType`, `FlatWallRotation`, `GameEvent`, `PickUpType`, `RaycastEnemyType`, `RaycastPickupType`, `RaycastWeaponType`, `Scene`, `TileType`, `VoicelineCategory`, `Weapons`) and `src/characters/interfaces/IDisposable.ts`.
* **Coupled Configs (13 files):** `GameConfig.ts` (713 lines—imports Pixi manifest types and reads `window.innerWidth`/mobile heuristics), `CreditsConfig.ts` (reads `navigator`), and legacy 2D side-scroller configs (`PlayerConfigs.ts`, `EnemyConfigs.ts`, `PickUpConfigs.ts`, `HUDConfigs.ts`, `InstructionsConfig.ts`, `ScoreboardConfig.ts`, and their `interfaces/I*.ts` referencing `PIXI.TextStyle` / `Texture`).
* **Legacy 2D Side-Scroller Entities (7 files):** `src/characters/Player.ts`, `src/characters/Enemy.ts`, `src/characters/interfaces/IBullet.ts`, `src/misc/Button.ts`, `src/misc/Environment.ts`, `src/misc/PickUp.ts`, `src/misc/Scoreboard.ts` (all coupled to Pixi/Sound/DOM; can be archived or isolated in `apps/web-legacy/`).

---

## 2. Target Monorepo / Package Structure

Adopt a workspace monorepo (npm/pnpm workspaces + TypeScript Project References) enforcing a **strict one-way dependency graph**: Core packages have **zero** dependencies on `pixi.js`, `@pixi/sound`, `dom` (`tsconfig` `"lib": ["ES2022"]` without `"DOM"`).

```text
star-wars-raycaster/
├── package.json                       # Workspace root (pnpm/npm workspaces)
├── tsconfig.base.json                 # Strict TS, NO "DOM" lib by default
├── packages/
│   ├── core-types/                    # @game/core-types (Zero deps, pure PODs & enums)
│   │   ├── src/
│   │   │   ├── enums/                 # TileType, DoorOpen, RaycastWeaponType, etc.
│   │   │   ├── configs/               # Weapon, Enemy, Pickup, Skybox, Voiceline configs
│   │   │   ├── events/                # Typed EventBus, AudioEvent, GameEvent contracts
│   │   │   └── interfaces/            # IRenderer, IAudioBackend, IInputSource, IStorage, IAssetProvider
│   │   └── package.json
│   │
│   ├── core-math/                     # @game/core-math (Zero deps, pure math & visibility)
│   │   ├── src/
│   │   │   ├── FixedMath.ts           # Vec2, angle helpers, 8-dir sector math
│   │   │   ├── Raycaster.ts           # DDA castRay(), thin-wall intersection, Z-buffer
│   │   │   ├── FrustumCuller.ts       # cullThinWalls(), billboard frustum/distance cull
│   │   │   ├── Collision.ts           # Circle-vs-grid, circle-vs-thinwall, ray-vs-circle
│   │   │   └── FrameBufferTypes.ts    # RayColumnHit, RenderFrameSnapshot, BillboardDrawCmd
│   │   └── package.json
│   │
│   ├── map-builder/                   # @game/map-builder (Depends on: core-types)
│   │   ├── src/
│   │   │   ├── LevelData.ts           # Flat typed-array WorldGrid (Int32Array/Uint8Array)
│   │   │   ├── TiledParser.ts         # Pure JSON/XML Tiled -> LevelData compiler
│   │   │   ├── BinaryLevelCodec.ts    # Pack/unpack compact .lvl binary format (for Vita/Web)
│   │   │   └── tiledUtils.ts          # GID bit-flag extraction & chunk iteration
│   │   └── package.json
│   │
│   ├── ai-system/                     # @game/ai-system (Depends on: core-types, core-math, map-builder)
│   │   ├── src/
│   │   │   ├── AStarPathfinder.ts     # Existing pure binary-heap A* + PathFollower
│   │   │   ├── EnemyAI.ts             # Pure state machine (PATROL/CHASE/ATTACK/DEAD)
│   │   │   ├── AllyAI.ts              # Companion follow/interact logic
│   │   │   ├── LineOfSight.ts         # Grid DDA LOS & target acquisition
│   │   │   └── VoicelineScheduler.ts  # Pure cooldown/priority queue emitting AudioEvents
│   │   └── package.json
│   │
│   ├── game-state/                    # @game/game-state (Depends on: core-types, core-math, map-builder, ai-system)
│   │   ├── src/
│   │   │   ├── SimulationWorld.ts     # Top-level deterministic fixed-timestep world (replaces RaycastScene logic)
│   │   │   ├── PlayerSystem.ts        # Movement, stamina, HP/shield, weapon fire/cooldowns
│   │   │   ├── DoorAndLinkSystem.ts   # Door animation, keycards, linkIds graph, triggers
│   │   │   ├── CombatSystem.ts        # Lasers, thermal detonators, breakables, destructible walls
│   │   │   ├── PickupSystem.ts        # Pickup collection, drops, inventory
│   │   │   ├── StairsSystem.ts        # Elevation nodes & level transition requests
│   │   │   ├── MissionSystem.ts       # Objectives, trigger zones, subtitles queue
│   │   │   ├── MinimapDiscovery.ts    # Existing pure fog-of-war tracker
│   │   │   └── SaveSerializer.ts      # Pure JSON/binary save state codec (no localStorage)
│   │   └── package.json
│   │
│   ├── renderer-pixi/                 # @game/renderer-pixi (Depends on: core-types, core-math, pixi.js)
│   │   ├── src/
│   │   │   ├── PixiRaycasterRenderer.ts # Consumes RenderFrameSnapshot -> column sprites + meshes
│   │   │   ├── FloorCeilingPass.ts    # floorCeiling.vert/frag + atlas/map texture builder
│   │   │   ├── SkyboxPass.ts          # skybox.vert/frag + cubemap/panoramic stitching
│   │   │   ├── BillboardPass.ts       # Sprite pools, AnimatedSprite cache, occlusion clipping
│   │   │   ├── WeaponViewPixi.ts      # First-person weapon & muzzle flash view
│   │   │   ├── HUDPixi.ts             # HUD, ObjectivesUI, RaycastSubtitles, MinimapRenderer
│   │   │   ├── TransitionsPixi.ts     # StarWarsWipeTransition, StarWarsCrawl
│   │   │   └── shaders/               # *.vert, *.frag
│   │   └── package.json
│   │
│   ├── audio-web/                     # @game/audio-web (Depends on: core-types, @pixi/sound)
│   │   ├── src/
│   │   │   ├── PixiSoundAdapter.ts    # Subscribes to AudioEventBus -> @pixi/sound + WebAudio
│   │   │   ├── MusicController.ts     # Calm/battle/alarm crossfading & override stack
│   │   │   └── SpatialAudioWeb.ts     # Distance attenuation & stereo panner
│   │   └── package.json
│   │
│   ├── input-web/                     # @game/input-web (Depends on: core-types)
│   │   ├── src/
│   │   │   ├── WebInputAdapter.ts     # Keyboard, Pointer Lock mouse, wheel -> InputFrame
│   │   │   ├── GamepadWebAdapter.ts   # HTML5 Gamepad API (maps directly to Vita layout!)
│   │   │   └── MobileTouchAdapter.ts  # VirtualJoystick, TouchLookArea, VirtualButton
│   │   └── package.json
│   │
│   └── platform-web/                  # @game/platform-web (Thin browser shell; depends on all above)
│       ├── src/
│       │   ├── main.ts                # Bootstraps PIXI.Application, fixed-step loop, adapters
│       │   ├── WebAssetProvider.ts    # fetch() / PIXI.Assets / DOMParser(.tsx) loader
│       │   ├── WebStorageAdapter.ts   # localStorage wrapper for Saves & Settings
│       │   └── scenes/                # MainMenu, LevelSelect, Cutscene, Credits, RaycastHost
│       └── package.json
│
└── native-vita/                       # (Future) C/C++ VitaSDK port sharing identical data contracts
    ├── CMakeLists.txt
    ├── src/
    │   ├── core/                      # 1:1 C++20 port of core-math, map-builder, ai-system, game-state
    │   ├── renderer_gxm/              # vitaGL / sceGxm renderer consuming RenderFrameSnapshot
    │   ├── audio_vita/                # sceAudio / SoLoud / SDL2_mixer consuming AudioEventBus
    │   └── input_vita/                # sceCtrlPeekBufferPositive -> InputFrame
    └── tools/
        └── pack_levels.ts             # Build-time CLI using @game/map-builder -> .lvl binaries
```

### Dependency Rules (Enforce via ESLint `no-restricted-imports` + `tsconfig` `"lib": ["ES2022"]`)

```text
@game/core-types  <──  @game/core-math  <──  @game/ai-system
       ▲                      ▲                     ▲
       │                      │                     │
@game/map-builder ────────────┴──────────► @game/game-state
                                                    │
         ┌────────────────────┬─────────────────────┼────────────────────┐
         ▼                    ▼                     ▼                    ▼
@game/renderer-pixi    @game/audio-web       @game/input-web    @game/platform-web
  (pixi.js only)      (@pixi/sound only)       (DOM only)       (composition root)
```

---

## 3. System-by-System Decoupling Specs

### 3.1 Raycasting & Visibility Math (`@game/core-math`)

Currently, `castRay()` and `cullThinWalls()` in `RaycastScene.ts` read directly from scene fields and immediately drive Pixi `Sprite` pools inside `renderScene()`. Decouple raycasting into a pure, allocation-free solver that populates pre-allocated flat typed arrays (`RenderFrameSnapshot`) each frame.

#### Data Contracts

```ts
// @game/core-math/src/FrameBufferTypes.ts

export interface CameraState {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  planeX: number;
  planeY: number;
  /** Viewport resolution in logical render columns (e.g. 1280x720 web, 960x544 Vita) */
  screenWidth: number;
  screenHeight: number;
  /** Vertical bob/shake offset in pixels */
  pitchOffsetPx: number;
  shakeOffsetX: number;
  shakeOffsetY: number;
  maxRenderDistance: number;
}

export const enum HitKind {
  SOLID_WALL = 0,
  DOOR = 1,
  THIN_WALL = 2,
}

/**
 * Structure-of-Arrays (SoA) column hit buffer.
 * Zero object allocations per frame; maps 1:1 to C structs/arrays on PS Vita.
 * Indexed by: idx = col * maxHitsPerColumn + hitIndex
 */
export interface ColumnHitBuffers {
  readonly screenWidth: number;
  readonly maxHitsPerColumn: number; // e.g. 16
  hitCounts: Int32Array;             // [screenWidth]
  distance: Float32Array;            // [screenWidth * maxHitsPerColumn]
  texId: Int32Array;                 // [screenWidth * maxHitsPerColumn]
  texU: Float32Array;                // normalized [0..1) horizontal texture coord
  side: Uint8Array;                  // 0 = X-side, 1 = Y-side, 2 = thin wall
  kind: Uint8Array;                  // HitKind
  doorSlideMode: Uint8Array;         // 0=LEFT, 1=UP, 3=RIGHT
  doorOpenAmount: Float32Array;      // [0..1]
  gridX: Int16Array;
  gridY: Int16Array;

  // Per-column occlusion outputs for floor/ceiling & billboard clipping
  zBuffer: Float32Array;             // [screenWidth] nearest opaque wall distance
  wallTop: Int16Array;               // [screenWidth] top pixel of nearest opaque wall
  wallBottom: Int16Array;            // [screenWidth] bottom pixel of nearest opaque wall
  doorDistBuffer: Float32Array;      // [screenWidth] nearest vertical-sliding door distance
  doorBottomBuffer: Int16Array;      // [screenWidth] bottom pixel of vertical-sliding door
}

export interface BillboardDrawCmd {
  entityId: number;
  assetKeyId: number;                // Integer ID resolved via AssetManifest (no strings in hot loop)
  animFrame: number;
  directionSector: number;           // 0..7 for 8-directional entities, 0 for static
  flipX: boolean;
  worldX: number;
  worldY: number;
  worldZ: number;
  transformY: number;                // Camera-space depth (for sorting & Z-buffer test)
  screenX: number;
  screenWidthPx: number;
  screenHeightPx: number;
  vOffsetPx: number;
  tintRgb: number;                   // 0xRRGGBB
  alpha: number;
  clipStartX: number;                // Pre-clipped visible horizontal span
  clipEndX: number;
}
```

#### State Separation
* **Moves to Core (`@game/core-math`):** `CameraState`, `ColumnHitBuffers` (flat `Float32Array`/`Int32Array`/`Uint8Array`), `cullThinWalls()` into a reusable `Int32Array` of visible thin-wall indices, `castAllColumns()`, 8-directional sector angle math (extracted from `RaycastDirectionalObject.ts`), and billboard projection/depth sorting.
* **Stays in Pixi Adapter (`@game/renderer-pixi`):** `spritePool`, `thinWallSpritePool`, `objectSpritePool`, `columnTextures` (1px `Texture` slices), `wallBoundsData` (`Uint8Array` uploaded to `uWallBoundsTex`), and `AnimatedSprite` / `Graphics` occlusion masks.

---

### 3.2 Map/Level Data & Serialization (`@game/map-builder`)

Currently, `RaycastScene.parseTiledMap()` and `loadExternalTileset()` mix Tiled JSON/XML parsing, `DOMParser` calls, `Assets.load()`, and live entity instantiation. Decouple this into a two-stage pipeline: **Tiled JSON/TSX -> Immutable `CompiledLevelData`** (which can also be pre-compiled at build time to a compact binary `.lvl` file for PS Vita).

#### Data Contracts

```ts
// @game/map-builder/src/LevelData.ts

export interface CompiledThinWall {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  texId: number;
  orientation: 0 | 1; // 0 = vertical, 1 = horizontal
  destructibleId: number; // -1 if indestructible
}

export interface CompiledSpawnPoint {
  entityKind: "player" | "enemy" | "ally" | "pickup" | "breakable" | "stationary" | "stair" | "trigger" | "finish_zone";
  objId: number;
  subType: string;
  x: number;
  y: number;
  rotationRad: number;
  gridX: number;
  gridY: number;
  texId: number;
  properties: Record<string, string | number | boolean>;
  linkIds: number[];
}

export interface CompiledLevelData {
  readonly schemaVersion: number;
  readonly levelId: string;
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;

  // Flat row-major grids (index = y * width + x)
  readonly wallGrid: Int32Array;
  readonly floorGrid: Int32Array;
  readonly ceilingGrid: Int32Array;
  readonly tileTypeFlags: Uint8Array;       // 0=EMPTY, 1=WALL, 2=DOOR, 3=THIN
  readonly doorOrientations: Uint8Array;    // 0=NS, 1=EW
  readonly doorSlideModes: Uint8Array;      // 0=LEFT, 1=UP, 3=RIGHT
  readonly surfaceTypes: Uint8Array;        // 0=DEFAULT, 1=WATER

  // Bounds of non-zero ceiling tiles [minX, minY, maxX, maxY]
  readonly ceilingBounds: Int16Array;

  // Static geometry & metadata tables
  readonly thinWalls: CompiledThinWall[];
  readonly tileMetaById: Map<number, TileMeta>;
  readonly spawns: CompiledSpawnPoint[];
  readonly skyboxId: string | null;
  readonly bgMusicId: string | null;
  readonly usedTextureIds: Int32Array;
}

export interface ILevelLoader {
  loadLevel(levelId: string): Promise<CompiledLevelData>;
}
```

#### State Separation
* **Moves to Core (`@game/map-builder`):** `tiledUtils.ts`, Tiled layer/chunk flattening, door orientation auto-detection, thin-wall segment generation, tile metadata normalization, and `BinaryLevelCodec` (serialize/deserialize `CompiledLevelData` to/from `ArrayBuffer`).
* **Stays in Platform Adapter (`@game/platform-web`):** `fetch()` of `levelN.json` / `.tsx` files, `DOMParser` XML parsing (wrapped behind a `IXmlParser` interface or eliminated by pre-compiling levels at build time), and `PIXI.Assets` texture loading from `usedTextureIds`.

---

### 3.3 AI & Entity Behavior (`@game/ai-system` & `@game/game-state`)

Currently, `RaycastEnemy` (2,024 lines), `RaycastEnemyManager` (2,685 lines), `RaycastAlly`, `RaycastLaserManager`, `ThermalDetonatorManager`, and `RaycastPickupManager` hold both simulation state and Pixi display objects (`AnimatedSprite`, `Graphics`, `Texture`). Convert all entities to pure data structs updated by deterministic systems.

#### Data Contracts

```ts
// @game/ai-system/src/EnemyTypes.ts

export const enum EnemyBehaviorState {
  IDLE = 0,
  PATROL = 1,
  ALERT = 2,
  CHASE = 3,
  ATTACK = 4,
  PAIN = 5,
  DYING = 6,
  DEAD = 7,
}

export interface EnemyComponent {
  id: number;
  type: RaycastEnemyType;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  facingRad: number;
  radius: number;

  // Combat & Health
  health: number;
  maxHealth: number;
  state: EnemyBehaviorState;
  stateTimerSec: number;
  attackCooldownSec: number;
  painTimerSec: number;
  hitFlashTimerSec: number;

  // Animation state (pure timers; renderer maps [animState, frame] -> Texture)
  animState: "idle" | "walk" | "attack" | "pain" | "death";
  animTimeSec: number;
  animFrame: number;

  // Pathfinding & AI memory
  lastKnownPlayerX: number;
  lastKnownPlayerY: number;
  repathTimerSec: number;
  pathIndex: number;
  pathNodesX: Float32Array; // Fixed-capacity ring/array (e.g. max 64 nodes)
  pathNodesY: Float32Array;
  pathLength: number;

  // Audio / Drop metadata
  hasAlerted: boolean;
  hoverSoundActive: boolean;
  itemDropId: number;       // -1 if none
}

export interface IWorldQuery {
  isSolidForEntity(gx: number, gy: number): boolean;
  hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean;
  tryOpenDoorForAI(gx: number, gy: number, entityX: number, entityY: number): boolean;
  getPlayerPosition(): { x: number; y: number; alive: boolean };
}
```

#### State Separation
* **Moves to Core (`@game/ai-system`, `@game/game-state`):** `AStarPathfinder` (already pure), `EnemyComponent` / `AllyComponent` / `ProjectileComponent` / `DetonatorComponent` / `PickupComponent` / `BreakableComponent` pools, LOS raycasts, projectile kinematics, splash damage, and `VoicelineScheduler` (pure priority queue using `dt` instead of `setTimeout`).
* **Stays in Pixi Adapter (`@game/renderer-pixi`):** Mapping `(enemyType, animState, animFrame, directionSector)` to `Spritesheet` textures, `Sprite` pooling, muzzle flash particles, and occlusion masks.

---

### 3.4 Game Loop & State (`@game/game-state`)

Currently, `RaycastScene.tick(delta)` runs on Pixi's variable `Ticker` (`delta / 60`), mixes `Date.now()` / `performance.now()` / `setTimeout` wall-clock timers, and directly mutates UI and audio. Replace this with a **deterministic fixed-timestep simulation (`FIXED_DT = 1 / 60`)** driven by an external host loop.

#### Data Contracts

```ts
// @game/game-state/src/SimulationWorld.ts

export interface SimulationTickResult {
  readonly frameIndex: number;
  readonly renderSnapshot: RenderFrameSnapshot;
  readonly hudState: HUDStateSnapshot;
  readonly audioEvents: readonly AudioEvent[];
  readonly uiEvents: readonly UIEvent[]; // e.g., SubtitleCue, ObjectiveToast, TransitionRequest, PauseToggle
}

export interface HUDStateSnapshot {
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  ammo: number;
  maxAmmo: number;
  equippedWeapon: RaycastWeaponType | null;
  weaponAnimState: "idle" | "fire" | "alt_fire" | "reload" | "equip";
  weaponAnimProgress: number; // [0..1]
  weaponBobX: number;
  weaponBobY: number;
  keycardsMask: number;       // Bitmask: 1=blue, 2=green, 4=red (replaces Set<string>)
  crosshairTarget: {
    locked: boolean;
    screenX: number;
    screenY: number;
    isHostile: boolean;
  };
  interactionPrompt: string | null;
  damageFlashAlpha: number;
  pickupFlashAlpha: number;
  isAlertActive: boolean;
  isPaused: boolean;
}

export class SimulationWorld {
  public static readonly FIXED_DT = 1 / 60;

  loadLevel(level: CompiledLevelData, saveState?: IRaycastPlayerSave): void;
  /** Advance simulation by exactly one deterministic tick (1/60s). */
  step(input: Readonly<InputFrame>, dt: number): void;
  /** Produce read-only render/HUD/audio snapshots for the current frame. */
  extractFrame(viewportWidth: number, viewportHeight: number, alpha: number): SimulationTickResult;
  serializeSave(): IRaycastSaveData;
}
```

#### State Separation
* **Moves to Core (`@game/game-state`):** All mutable world grids (`wallGrid`, `doorStates: Float32Array`, `doorLockMask: Uint8Array`, `doorDisabledMask: Uint8Array`), `PlayerSystem`, `DoorAndLinkSystem`, `CombatSystem`, `PickupSystem`, `StairsSystem`, `MissionSystem`, `MinimapDiscovery`, and all timers (expressed strictly in accumulated `dt` seconds—zero `setTimeout` or `Date.now()`).
* **Stays in Platform Host (`@game/platform-web`):** `requestAnimationFrame` / `PIXI.Ticker` accumulator loop, `localStorage` persistence (`WebStorageAdapter`), and scene navigation (`MainMenu` <-> `RaycastHost` <-> `LevelEndScene`).

---

### 3.5 Rendering Interface (`@game/renderer-pixi`)

The renderer becomes a **stateless (with respect to gameplay) consumer** of `RenderFrameSnapshot` and `HUDStateSnapshot`. It never mutates player position, enemy HP, or map tiles.

#### Data Contracts

```ts
// @game/core-types/src/interfaces/IRenderer.ts

export interface RenderFrameSnapshot {
  readonly camera: CameraState;
  readonly columns: ColumnHitBuffers;
  readonly billboards: readonly BillboardDrawCmd[];
  readonly billboardCount: number;
  readonly skybox: {
    active: boolean;
    skyboxOnly: boolean;
    assetId: string | null;
    yawRad: number;
    zoom: number;
  };
  readonly animatedWallFrameIndex: number;
  readonly screenWipe: {
    active: boolean;
    progress: number;
    type: number;
  };
}

export interface IGameRenderer {
  readonly viewportWidth: number;
  readonly viewportHeight: number;

  /** Upload level textures, build floor/ceiling atlas & map lookup texture. */
  mountLevel(level: CompiledLevelData, assets: IAssetProvider): Promise<void>;
  /** Render one frame strictly from immutable simulation outputs. */
  render(frame: RenderFrameSnapshot, hud: HUDStateSnapshot, minimap: MinimapSnapshot): void;
  resize(width: number, height: number): void;
  dispose(): void;
}
```

#### State Separation
* **Moves to Core:** `RenderFrameSnapshot`, `HUDStateSnapshot`, `MinimapSnapshot`, weapon bob/recoil math, screen shake decay, and wipe transition progress `[0..1]`.
* **Stays in Pixi Adapter (`@game/renderer-pixi`):** `PIXI.Container` hierarchy (`worldContainer`, `backgroundContainer`, `wallContainer`, `thinWallContainer`, `entityContainer`), `floorCeiling.frag` & `skybox.frag` WebGL meshes, `Sprite` column pools, `RaycastHUD`, `RaycastWeaponView`, `ObjectivesUI`, `RaycastSubtitles`, `MinimapRenderer`, and `RaycastDebugMenu`.

---

### 3.6 Audio Event Bus (`@game/core-types` + `@game/audio-web`)

Currently, **16 separate gameplay files** import `@pixi/sound` directly (`RaycastScene`, `RaycastPlayerController`, `RaycastEnemy`, `RaycastEnemyManager`, `RaycastAllyManager`, `RaycastLaserManager`, `ThermalDetonatorManager`, `RaycastPickupManager`, `RaycastBreakableManager`, `RaycastStairsManager`, `RaycastWeaponView`, `EnemyVoicelineManager`, `RaycastTriggerManager`, `SettingsManager`, etc.). Replace every direct `sound.play()`/`sound.stop()` call with an emitted `AudioEvent` pushed into a per-tick queue.

#### Data Contracts

```ts
// @game/core-types/src/events/AudioEvents.ts

export type AudioChannel = "sfx" | "music" | "voiceline" | "ambient" | "ui";

export type AudioEvent =
  | {
      type: "PLAY_SFX";
      soundId: string;
      channel: AudioChannel;
      volume?: number;
      pitch?: number;
      loop?: boolean;
      instanceKey?: string;         // For stoppable loops (hover droids, prop alarms)
      worldPos?: { x: number; y: number }; // Optional 2D spatial attenuation
    }
  | {
      type: "STOP_KEY";
      instanceKey: string;
      fadeOutSec?: number;
    }
  | {
      type: "SET_MUSIC_STATE";
      trackId: string | null;
      mode: "calm" | "battle" | "override";
      fadeSec?: number;
    }
  | {
      type: "SET_ALARM_ACTIVE";
      active: boolean;
    }
  | {
      type: "PLAY_VOICELINE";
      soundId: string;
      entityId: number;
      priority: number;
      worldPos: { x: number; y: number };
      radioFilter?: boolean;
    }
  | {
      type: "UPDATE_LISTENER";
      x: number;
      y: number;
      dirX: number;
      dirY: number;
    }
  | {
      type: "APPLY_SETTINGS";
      masterVolume: number;
      sfxVolume: number;
      musicVolume: number;
      voiceVolume: number;
      muted: boolean;
    };

export interface IAudioBackend {
  preloadBank(soundIds: readonly string[]): Promise<void>;
  processEvents(events: readonly AudioEvent[]): void;
  dispose(): void;
}
```

#### State Separation
* **Moves to Core:** *When* and *why* a sound triggers (footstep stride distance, enemy alert/death, voiceline cooldown & priority arbitration, trigger-zone delay timers using `dt`, music state transitions).
* **Stays in Audio Adapter (`@game/audio-web`):** `@pixi/sound` registration/preloading, `WebAudioContext` unlocking, spatial volume/panning calculation from `UPDATE_LISTENER`, and optional radio bandpass filter nodes.

---

### 3.7 Input Mapping (`@game/core-types` + `@game/input-web`)

Currently, `RaycastScene.ts` listens to `window` keyboard/mouse events, `document.pointerLockElement`, and polls `MobileControls` directly inside `updatePlayer()`. Abstract all physical inputs into a normalized, platform-agnostic **`InputFrame`** designed to map cleanly to both **Mouse+Keyboard / Touch** and **PS Vita dual-analog + face buttons**.

#### Data Contracts

```ts
// @game/core-types/src/interfaces/InputFrame.ts

export const enum ActionBit {
  FIRE         = 1 << 0, // LMB / Vita R-Trigger
  ALT_FIRE     = 1 << 1, // RMB / Vita L-Trigger
  INTERACT     = 1 << 2, // E / Vita Cross (X)
  SPRINT       = 1 << 3, // Shift / Vita Circle or L3
  JUMP_OR_USE  = 1 << 4, // Space
  WEAPON_NEXT  = 1 << 5, // Wheel Down / Vita Triangle
  WEAPON_PREV  = 1 << 6, // Wheel Up
  WEAPON_1     = 1 << 7, // Key 1 / Vita D-Pad Left
  WEAPON_2     = 1 << 8, // Key 2 / Vita D-Pad Up
  WEAPON_3     = 1 << 9, // Key 3 / Vita D-Pad Right
  TOGGLE_MAP   = 1 << 10, // M / Vita Select
  TOGGLE_PAUSE = 1 << 11, // Esc / Vita Start
  QUICK_TURN   = 1 << 12, // Q / Vita D-Pad Down
}

export interface InputFrame {
  /** Normalized movement axes in [-1.0, 1.0] */
  moveForward: number;     // W/S or Vita Left Stick Y
  moveStrafe: number;      // A/D or Vita Left Stick X
  /** Turning delta in radians for this tick */
  turnDeltaRad: number;    // Mouse movementX * sens, Touch look, or Vita Right Stick X * rotSpeed * dt
  /** Bitmask of ActionBit currently held down */
  actionsHeld: number;
  /** Bitmask of ActionBit pressed on this tick (rising edge) */
  actionsPressed: number;
  /** Bitmask of ActionBit released on this tick (falling edge) */
  actionsReleased: number;
}

export interface IInputSource {
  /** Poll current devices and write into `outFrame`, resetting accumulated mouse deltas. */
  poll(outFrame: InputFrame, dt: number): void;
  setPointerLockEnabled(enabled: boolean): void;
  dispose(): void;
}
```

#### State Separation
* **Moves to Core:** Consuming `InputFrame` (`moveForward`, `moveStrafe`, `turnDeltaRad`, `actionsHeld`, `actionsPressed`) inside `PlayerSystem` and `SimulationWorld`.
* **Stays in Input Adapter (`@game/input-web`):** `keydown`/`keyup`/`mousemove`/`mousedown`/`wheel` listeners, `document.pointerLockElement`, HTML5 Gamepad polling, and `MobileControls` (`VirtualJoystick`, `TouchLookArea`, `VirtualButton`).

---

## 4. PS Vita Portability Readiness Checklist

The Sony PS Vita features a **quad-core ARM Cortex-A9** (3 cores usable by games at ~333–444 MHz), **PowerVR SGX543MP4+ GPU**, **960×544** native resolution, **512 MB RAM** (~256–330 MB usable by homebrew/apps), and **128 MB VRAM**. Refactor the following JS-specific patterns **now** in TypeScript so the C/C++ (VitaSDK + `vitaGL`/`sceGxm`) or Lua port is a straightforward translation.

### 4.1 Memory & Garbage Collection (Zero Per-Frame Allocations)
- [ ] **Eliminate string-keyed coordinate maps (`"${x},${y}"`) in hot paths:** Found **13 occurrences** in `RaycastScene.ts` (`doorStates`, `doorSlideModes`, `lockedDoors`, `unlockedKeycardDoors`, `disabledDoors`) and **6 occurrences** in `RaycastEnemyManager.ts`. Replace every coordinate `Record<string, T>` / `Set<string>` with flat `width * height` typed arrays (`Float32Array`, `Uint8Array` bitmasks) indexed by `y * width + x`.
- [ ] **Eliminate `Object.entries()` / `.filter()` / `.map()` in `tick()`:** Found **25+ calls** across `RaycastScene.ts` and `RaycastEnemyManager.ts` (e.g., `updateDoors` iterating `doorEntries`, finish-zone checks, breakable filtering). Replace with pre-allocated fixed-size arrays + explicit `count` integers and `for (let i = 0; i < count; i++)` loops.
- [ ] **Replace `Array.prototype.sort()` on billboards/hits with in-place insertion/radix sort:** `renderObjects()` sorts `mapObjects` every frame. Insertion sort on nearly-sorted depth arrays (already partially used in `castRay`) avoids closure/comparator allocation and translates directly to C.
- [ ] **Standardize on `Float32Array` instead of `Float64Array`:** `RaycastScene.ts` uses `Float64Array` for `zBuffer`, `doorDistBuffer`, and `doorStatesFlat`. ARM Cortex-A9 NEON / VFPv3 single-precision `float` (`f32`) is significantly faster and halves cache footprint.
- [ ] **Replace `Set<string>` keycards with a `uint8` bitmask:** `RaycastPlayerState.keycards: Set<string>` should become `keycardsMask: number` (`1 << 0` blue, `1 << 1` green, `1 << 2` red).

### 4.2 Determinism & Timers
- [ ] **Remove all `setTimeout` / `setInterval` from gameplay:** Currently used in `RaycastScene.ts` (trigger sound delays), `EnemyVoicelineManager.ts` (queue timers), `ThermalDetonatorManager.ts`, `RaycastObjectiveManager.ts`, and `RaycastTriggerManager.ts`. Replace with `dt`-driven countdown floats inside `SimulationWorld.step()` so pausing automatically freezes all timers and C++ doesn't need async timer threads.
- [ ] **Remove `Date.now()` / `performance.now()` from AI & cooldowns:** Found 5 occurrences in `RaycastEnemy.ts`. Pass simulation clock `simTimeSec` or decrement `cooldownSec -= dt`.
- [ ] **Convert variable `delta / 60` Pixi Ticker math to Fixed-Timestep (`1/60s`):** Decouple simulation ticks from render FPS (crucial on Vita where complex hangar scenes may dip from 60 FPS to 30 FPS).

### 4.3 Resolution Independence (`1280×720` → `960×544`)
- [ ] **Remove hardcoded `gameConfig.width` (`1280`) and `gameConfig.height` (`720`) from core math:** Currently `RaycastScene.ts`, `RaycastEnemyManager.ts`, `RaycastLaserManager.ts`, `ThermalDetonatorManager.ts`, `RaycastDirectionalObject.ts`, and `floorCeiling.frag` (`uWallBoundsTex` comment `1280x1`) assume `1280×720`. Parameterize all projection math, column buffers, and HUD layouts by `CameraState.screenWidth` / `screenHeight` (or normalized `[0..1]` HUD coordinates) so **960×544** (16:9.06, nearly identical aspect ratio to 16:9) works with zero distortion.
- [ ] **Support configurable horizontal raycast resolution scale:** Allow casting `480` columns (half-width, 2px wide quads) as a Vita performance toggle if 960 full-res columns exceed the 16.6ms CPU budget.

### 4.4 Rendering & Shaders (WebGL → PowerVR SGX543MP4+ / `vitaGL` / `sceGxm`)
- [ ] **Replace 1px `Texture` slice `Sprite` pooling with a textured quad batch in the renderer abstraction:** Pixi creates up to `1280 × 16` individual `Sprite` objects referencing 1px-wide sub-textures (`new Texture(baseTex, new Rectangle(x, 0, 1, texH))`). On PS Vita (`vitaGL`/`sceGxm`), you must draw walls as a **single dynamic vertex buffer** (1 quad = 2 triangles / 4 vertices per visible wall strip, sampling UV `[u, 0..1]` from a texture atlas) in 1–2 draw calls. Designing `ColumnHitBuffers` with normalized `texU` (`[0..1)`) ensures the Vita renderer can emit quads directly without 1px texture slicing.
- [ ] **Audit GLSL ES 1.00 shaders for Sony CG (`sceGxm` / `vitaGL`):**
  - `floorCeiling.frag` (109 lines): Uses dependent texture lookups (`uWallBoundsTex` → `uMapTexture` → `uAtlas`). On PowerVR SGX543MP4+ (tile-based deferred renderer), dependent texture reads and dynamic branches (`if (vTextureCoord.y >= wallBounds.r ...)`) can stall pipelines. Keep `uWallBoundsTex` early-out (or better, render floor/ceiling **after** walls with hardware **depth buffer** testing on Vita so SGX HSR rejects occluded floor/ceiling pixels for free!).
  - `skybox.frag` (46 lines): Uses `samplerCube` (`textureCube`) and `atan(vRayDir.y, vRayDir.x)`. On Vita, avoid `atan()` per-pixel in fragment shaders—render a simple 3D skybox cube mesh with hardware projection instead.
  - `starWarsWipe.frag` & `starWarsCrawl.frag`: Straightforward port to CG shaders.
- [ ] **Texture Atlas & 128 MB VRAM Budget:** Avoid loading uncompressed loose PNGs per tile. Pre-pack wall/floor/ceiling tiles and enemy directional spritesheets into power-of-two atlases (`1024×1024` or `2048×2048` max on Vita) and support **PVRTC / DXT / GXT** compressed textures at build time. Enforce `128×128` or `64×64` wall tiles to stay comfortably under 64 MB VRAM.

### 4.5 Assets, Audio & Persistence
- [ ] **Pre-compile Tiled `.json` + `.tsx` XML maps into binary `.lvl` files:** Eliminates runtime `DOMParser` XML parsing (unavailable in C++/VitaSDK) and speeds up Vita level loads from seconds to <20ms.
- [ ] **Remove runtime `fetch(..., { method: "HEAD" })` audio probing:** `RaycastTriggerManager.ts` and `RaycastScene.ts` probe multiple candidate URLs with HTTP `HEAD` requests to find `.mp3`/`.ogg` files. Replace with a static build-time `audio_manifest.json` mapping `soundId -> filePath`.
- [ ] **Audio Format & Memory:** `@pixi/sound` decodes MP3s via WebAudio. On Vita, convert short SFX to uncompressed PCM **WAV** (cached in RAM) and stream long music/voicelines as **OGG Vorbis** or hardware-decoded **ATRAC9 (`.at9`)** via `sceAudio`.
- [ ] **Save Data Abstraction:** Replace `localStorage` in `RaycastSaveManager.ts` and `SettingsManager.ts` with `IStorageAdapter` (`read(key)` / `write(key, data)`), mapping to `ux0:data/<TITLE_ID>/save.json` on PS Vita.

---

## 5. Step-by-Step Migration Order

Follow this incremental sequence so **every phase compiles cleanly and keeps the web game 100% playable** via `npm run dev`.

### Phase 0: Workspace & Boundary Setup (0 Behavior Changes)
1. Convert the repo to an npm/pnpm workspace with `packages/` and `tsconfig.base.json` (with `"lib": ["ES2022"]`—no `"DOM"`—for all core packages).
2. Add ESLint rules forbidding `pixi.js`, `@pixi/sound`, `window`, `document`, and `localStorage` inside `packages/core-*`, `packages/map-builder`, `packages/ai-system`, and `packages/game-state`.
3. Move all **54 already-pure files** (`src/enums/*`, pure `src/configs/*`, `AStarPathfinder.ts`, `MinimapDiscovery.ts`, `DestructableWall.ts`, `DestructableWallManager.ts`, `tiledUtils.ts`, `ObjectiveTypes.ts`, `SubtitleTypes.ts`) into `@game/core-types`, `@game/map-builder`, `@game/ai-system`, and `@game/game-state`, updating import paths.
* **Verify:** `npm run webpack` succeeds; gameplay is identical.

### Phase 1: Decouple Persistence & Settings (`IStorageAdapter`)
1. Define `IStorageAdapter` in `@game/core-types` and implement `WebStorageAdapter` (`localStorage`) in `@game/platform-web`.
2. Refactor `RaycastSaveManager.ts` → `SaveSerializer.ts` (pure JSON codec) and strip `@pixi/sound` / `localStorage` / `window.matchMedia` out of `SettingsManager.ts`.
* **Verify:** Saving/loading level progress and changing volume/sensitivity in `InGameMenu` still work.

### Phase 2: Introduce the Audio Event Bus (`@game/audio-web`)
1. Create `AudioEvent` types and an `AudioEventQueue` in `@game/core-types`.
2. Build `PixiSoundAdapter` + `MusicController` in `@game/audio-web` wrapping all `@pixi/sound` calls.
3. Replace direct `sound.play()` / `sound.add()` / `sound.stop()` calls one manager at a time (starting with `RaycastPlayerController`, `RaycastBreakableManager`, `RaycastStairsManager`, `RaycastWeaponView`, then `RaycastEnemy`, `RaycastLaserManager`, `ThermalDetonatorManager`, `RaycastPickupManager`, `EnemyVoicelineManager`, `RaycastTriggerManager`, and finally `RaycastScene`).
4. Replace `setTimeout` in `EnemyVoicelineManager` with `dt` countdowns and replace HTTP `HEAD` audio probing with a generated `audioManifest`.
* **Verify:** Zero imports of `@pixi/sound` remain outside `packages/audio-web` and legacy scenes; all SFX, music, alarms, and voicelines play identically.

### Phase 3: Abstract Input into `InputFrame` (`@game/input-web`)
1. Create `InputFrame` and `IInputSource` in `@game/core-types`.
2. Extract keyboard, pointer-lock mouse, wheel, and `MobileControls` polling from `RaycastScene.ts` (`setupControls`, `updatePlayer`) into `WebInputAdapter` and `MobileTouchAdapter` in `@game/input-web`.
3. Add `GamepadWebAdapter` right away to test the exact PS Vita control scheme (dual analog + triggers + face buttons) in the browser.
* **Verify:** Keyboard/mouse, mobile touch, and controller all control movement, aiming, shooting, weapon switching, and doors.

### Phase 4: Extract Map Compilation (`@game/map-builder`)
1. Move `parseTiledMap()`, door orientation detection, thin-wall segment generation, and tile metadata normalization out of `RaycastScene.ts` into `TiledParser.ts`, outputting `CompiledLevelData`.
2. Replace string-keyed `doorStates` / `lockedDoors` / `disabledDoors` maps with flat `Uint8Array` / `Float32Array` arrays on `CompiledLevelData` / runtime world state.
3. Move `loadExternalTileset()` XML parsing behind an injectable `IXmlParser` in `@game/platform-web`.
4. Add a CLI script (`tools/pack_levels.ts`) that compiles Tiled maps to binary `.lvl` files and verify round-trip equality with `TiledParser`.
* **Verify:** All levels load from `CompiledLevelData` with identical walls, thin walls, doors, floors, ceilings, spawns, and triggers.

### Phase 5: Extract Pure Raycasting & Visibility Math (`@game/core-math`)
1. Move `castRay()`, `cullThinWalls()`, and `RaycastDirectionalObject`'s 8-directional sector math into `@game/core-math`.
2. Populate `ColumnHitBuffers` (flat `Float32Array` / `Int32Array` / `Uint8Array`) inside `Raycaster.castAllColumns()`.
3. Strip `Texture` / `AnimatedSprite` / `Graphics` fields from `src/scenes/raycast/types.ts` (`RaycastPickupItem`, `MapObject`).
4. Update `RaycastScene.renderScene()` to consume `ColumnHitBuffers` and `BillboardDrawCmd[]` instead of computing rays inline.
* **Verify:** Visual output is pixel-identical; zero Pixi imports in `@game/core-math`.

### Phase 6: Decouple AI, Combat & Entities from Pixi (`@game/ai-system` & `@game/game-state`)
1. Refactor `RaycastEnemy` + `RaycastEnemyManager` into pure `EnemyComponent` structs + `EnemyAISystem` (zero `AnimatedSprite`, `Container`, `Assets`).
2. Repeat for `RaycastAllyManager`, `RaycastLaserManager`, `ThermalDetonatorManager`, `RaycastPickupManager`, `RaycastBreakableManager`, `RaycastStationaryObjectManager`, `RaycastStairsManager`, and `RaycastMissionManager`/`RaycastTriggerManager` (replacing `PIXI.utils.EventEmitter` with a lightweight typed `EventEmitter` in `@game/core-types` and removing `setTimeout`/`Date.now()`).
3. Move sprite creation, `AnimatedSprite` frame lookup, and occlusion masks into `BillboardPass` inside `@game/renderer-pixi`.
* **Verify:** Combat, A* pathfinding, enemy drops, thermal detonators, breakables, stairs, triggers, and objectives work identically with zero Pixi imports in entity managers.

### Phase 7: Extract `SimulationWorld` & `PixiRaycasterRenderer`
1. Create `SimulationWorld` in `@game/game-state` owning the fixed-timestep (`1/60s`) update order: `InputFrame` → `PlayerSystem` → `DoorAndLinkSystem` → `EnemyAISystem` → `AllyAISystem` → `CombatSystem` → `PickupSystem` → `MissionSystem` → `Raycaster` → `extractFrame()`.
2. Create `PixiRaycasterRenderer` in `@game/renderer-pixi` implementing `IGameRenderer` (absorbing `FloorCeilingPass`, `SkyboxPass`, `BillboardPass`, `RaycastHUD`, `RaycastWeaponView`, `MinimapRenderer`, `ObjectivesUI`, `RaycastSubtitles`).
3. Reduce `RaycastScene.ts` to a thin ~150-line `RaycastHost` in `@game/platform-web` that wires `SimulationWorld` + `PixiRaycasterRenderer` + `PixiSoundAdapter` + `WebInputAdapter` inside a fixed-timestep accumulator loop.
* **Verify:** Full game playthrough passes; headless Node.js unit tests can instantiate `SimulationWorld`, load a level, feed synthetic `InputFrame`s for 1,000 ticks, and assert deterministic player/enemy/door states without a browser!

### Phase 8: PS Vita Readiness Pass & Native Port Kickoff
1. Parameterize `SimulationWorld` and `PixiRaycasterRenderer` to run cleanly at **960×544** (verify in browser by setting canvas logical resolution to `960×544`).
2. Run Chrome DevTools Allocation Profiler on `SimulationWorld.step()` + `Raycaster.castAllColumns()` and eliminate any remaining per-frame heap allocations.
3. Begin `native-vita/` C++20 port using the exact structs from `@game/core-math`, `@game/map-builder` (`.lvl` binary loader), `@game/ai-system`, and `@game/game-state`, paired with a `vitaGL`/`sceGxm` quad-batch renderer, `sceAudio` backend, and `sceCtrl` input adapter.