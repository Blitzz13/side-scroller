import { Container } from "pixi.js";
import { sound } from "@pixi/sound";
import { TileType } from "../../enums/TileType";
import { TileMeta } from "./types";
import { StarWarsWipeTransition } from "./StarWarsWipeTransition";

export interface StairNode {
  x: number;
  y: number;
  gid: number;
  tileId: number;
  stairType: "up" | "down" | "generic";
  partner?: StairNode;
}

export interface IRaycastSceneContext {
  map: number[][];
  mapFlat?: Int32Array;
  mapWidth: number;
  mapHeight: number;
  tileTypes: Record<number, string>;
  tileTypeFlags?: Uint8Array;
  doorStatesFlat?: Float64Array;
  destructableWallManager?: any;
  breakableManager?: any;
  setPlayerPosition: (x: number, y: number, dirX: number, dirY: number) => void;
  getPlayer: () => { x: number; y: number; dirX: number; dirY: number; planeX: number; planeY: number };
  getHUD: () => any;
  getWorldContainer: () => Container;
  getWeaponView: () => any;
  addChild: (child: any) => any;
}

export class RaycastStairsManager {
  private scene: IRaycastSceneContext;
  private stairs: Map<string, StairNode> = new Map();
  private stairList: StairNode[] = [];
  private wipeTransition: StarWarsWipeTransition;

  // Stair footstep audio playback sequence
  private isStairStepActive: boolean = false;
  private stairStepCounter: number = 0;
  private totalStairSteps: number = 4;
  private stairStepTimer: number = 0;
  private readonly stairStepInterval: number = 0.16;
  private stairStepType: "up" | "down" | "generic" = "generic";

  constructor(scene: IRaycastSceneContext) {
    this.scene = scene;
    this.wipeTransition = new StarWarsWipeTransition(scene as any);
  }

  public getWipeTransition(): StarWarsWipeTransition {
    return this.wipeTransition;
  }

  public isTransitioning(): boolean {
    return this.wipeTransition.isTransitioning();
  }

  public getStairAt(x: number, y: number): StairNode | undefined {
    return this.stairs.get(`${x},${y}`);
  }

  public parseMapStairs(
    mapData: any,
    firstgid: number,
    tileMeta: Record<number, TileMeta>
  ): void {
    this.stairs.clear();
    this.stairList = [];

    const collectLayers = (layers: any[]): any[] => {
      let flat: any[] = [];
      for (const l of layers) {
        if (l.layers && Array.isArray(l.layers)) {
          flat = flat.concat(collectLayers(l.layers));
        } else {
          flat.push(l);
        }
      }
      return flat;
    };

    const allLayers = collectLayers(mapData.layers || []);

    // 1. Scan layers for stairs
    for (const layer of allLayers) {
      const isStairLayer = layer.name && layer.name.toLowerCase().includes("stair");
      if (layer.data) {
        layer.data.forEach((gid: number, index: number) => {
          if (gid === 0) return;
          const x = index % layer.width;
          const y = Math.floor(index / layer.width);
          if (x < 0 || x >= this.scene.mapWidth || y < 0 || y >= this.scene.mapHeight) {
            return;
          }

          const tileId = gid - firstgid;
          const meta = tileMeta[tileId] || {};
          const typeStr = (meta.tileType || meta.type || this.scene.tileTypes[gid] || "").toLowerCase();
          const imgStr = (meta.image || "").toLowerCase();

          const isStairTile =
            isStairLayer ||
            typeStr.includes("stair") ||
            imgStr.includes("stair") ||
            tileId === 15 ||
            tileId === 25 ||
            tileId === 26;

          if (isStairTile) {
            let stairType: "up" | "down" | "generic" = "generic";
            if (
              imgStr.includes("stairs_up") ||
              typeStr.includes("up") ||
              (meta as any).stairType === "up" ||
              tileId === 15 ||
              tileId === 25
            ) {
              stairType = "up";
            } else if (
              imgStr.includes("stairs_down") ||
              typeStr.includes("down") ||
              (meta as any).stairType === "down" ||
              tileId === 26
            ) {
              stairType = "down";
            }

            const node: StairNode = {
              x,
              y,
              gid,
              tileId,
              stairType,
            };

            this.stairs.set(`${x},${y}`, node);
            this.stairList.push(node);

            // Populate the scene's collision and raycast map with the stair tile
            this.scene.map[y][x] = gid;
            this.scene.tileTypes[gid] = TileType.STAIRS;
          }
        });
      }
    }

    // 2. Automatically pair each stairs tile with its adjacent reverse neighbor
    // "next to the stairs up or down there will always be the reverse. The revers will be either top bottom left or right of it."
    const directions = [
      [1, 0],   // right
      [-1, 0],  // left
      [0, 1],   // bottom
      [0, -1],  // top
    ];

    for (const stair of this.stairList) {
      if (stair.partner) continue;

      // First try to find adjacent neighbor with the opposite stairType
      let paired = false;
      for (const [dx, dy] of directions) {
        const nx = stair.x + dx;
        const ny = stair.y + dy;
        const neighbor = this.stairs.get(`${nx},${ny}`);
        if (neighbor && !neighbor.partner) {
          const isOpposite =
            (stair.stairType === "up" && neighbor.stairType === "down") ||
            (stair.stairType === "down" && neighbor.stairType === "up");
          if (isOpposite) {
            stair.partner = neighbor;
            neighbor.partner = stair;
            paired = true;
            break;
          }
        }
      }

      // If no exact opposite is found, pair with any adjacent unpaired stair tile
      if (!paired) {
        for (const [dx, dy] of directions) {
          const nx = stair.x + dx;
          const ny = stair.y + dy;
          const neighbor = this.stairs.get(`${nx},${ny}`);
          if (neighbor && !neighbor.partner) {
            stair.partner = neighbor;
            neighbor.partner = stair;
            break;
          }
        }
      }
    }

    console.log(
      `[RaycastStairsManager] Initialized ${this.stairList.length} stair tiles with ${
        this.stairList.filter((s) => !!s.partner).length / 2
      } paired connections.`
    );
  }

  public isCellWalkable(x: number, y: number): boolean {
    if (x < 0 || x >= this.scene.mapWidth || y < 0 || y >= this.scene.mapHeight) {
      return false;
    }

    // A stair block itself is a solid raycast wall and not walkable
    if (this.stairs.has(`${x},${y}`)) {
      return false;
    }

    const tile = this.scene.map[y]?.[x] ?? 0;
    if (tile !== 0) {
      // Check if it's an open door
      if (this.scene.tileTypeFlags && this.scene.doorStatesFlat) {
        const flatIdx = y * this.scene.mapWidth + x;
        const isDoor = this.scene.tileTypes[tile] === "door" || this.scene.tileTypes[tile] === TileType.DOOR;
        const isDoorOpen = isDoor && Math.abs(this.scene.doorStatesFlat[flatIdx]) >= 0.7;
        if (!isDoorOpen) return false;
      } else {
        return false;
      }
    }

    // Check destructible walls and breakables
    if (this.scene.destructableWallManager?.checkCollision(x + 0.5, y + 0.5)) {
      return false;
    }
    if (this.scene.breakableManager?.checkCollision(x + 0.5, y + 0.5)) {
      return false;
    }

    return true;
  }

  /**
   * Finds the "next free block in front of the stairs teleported"
   */
  public findFreeBlockInFront(
    destinationStair: StairNode,
    sourceStair: StairNode
  ): { x: number; y: number; dirX: number; dirY: number } {
    const dx = destinationStair.x - sourceStair.x;
    const dy = destinationStair.y - sourceStair.y;

    // 1. Direct continuation in the traversal direction
    const frontX = destinationStair.x + dx;
    const frontY = destinationStair.y + dy;
    if (this.isCellWalkable(frontX, frontY)) {
      return { x: frontX, y: frontY, dirX: dx, dirY: dy };
    }

    // 2. Check further ahead in line (step 2 to 4)
    for (let step = 2; step <= 4; step++) {
      const stepX = destinationStair.x + step * dx;
      const stepY = destinationStair.y + step * dy;
      if (this.isCellWalkable(stepX, stepY)) {
        return { x: stepX, y: stepY, dirX: dx, dirY: dy };
      }
    }

    // 3. Check other orthogonal neighbors around destinationStair (excluding sourceStair)
    const neighbors = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    for (const [nx, ny] of neighbors) {
      const candidateX = destinationStair.x + nx;
      const candidateY = destinationStair.y + ny;
      if (candidateX === sourceStair.x && candidateY === sourceStair.y) {
        continue;
      }
      if (this.isCellWalkable(candidateX, candidateY)) {
        return { x: candidateX, y: candidateY, dirX: nx, dirY: ny };
      }
    }

    // 4. Fallback: even if blocked, return the direct front
    return { x: frontX, y: frontY, dirX: dx, dirY: dy };
  }

  public getNearbyStair(
    playerX: number,
    playerY: number,
    dirX?: number,
    dirY?: number
  ): StairNode | null {
    if (this.isTransitioning()) return null;

    // 1. Check facing direction ahead of player
    if (dirX !== undefined && dirY !== undefined) {
      const forwardDists = [0.6, 0.9, 1.25];
      for (const d of forwardDists) {
        const lx = Math.floor(playerX + dirX * d);
        const ly = Math.floor(playerY + dirY * d);
        const stair = this.stairs.get(`${lx},${ly}`);
        if (stair) {
          return stair;
        }
      }
    }

    // 2. Check adjacent cells (current cell + 4 cardinal neighbors)
    const px = Math.floor(playerX);
    const py = Math.floor(playerY);
    const offsets = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    for (const [ox, oy] of offsets) {
      const stair = this.stairs.get(`${px + ox},${py + oy}`);
      if (stair) {
        // Player center to stair cell center distance check
        const dist = Math.hypot(playerX - (stair.x + 0.5), playerY - (stair.y + 0.5));
        if (dist <= 1.38) {
          return stair;
        }
      }
    }

    return null;
  }

  public tryInteractStairs(targetCellX: number, targetCellY: number): boolean {
    if (this.isTransitioning()) return false;

    const stair = this.stairs.get(`${targetCellX},${targetCellY}`);
    if (stair) {
      return this.executeTransition(stair);
    }
    return false;
  }

  public tryInteractNearbyStairs(playerX: number, playerY: number): boolean {
    if (this.isTransitioning()) return false;

    const px = Math.floor(playerX);
    const py = Math.floor(playerY);

    const offsets = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    for (const [ox, oy] of offsets) {
      const stair = this.stairs.get(`${px + ox},${py + oy}`);
      if (stair) {
        return this.executeTransition(stair);
      }
    }

    return false;
  }

  public tryInteract(
    playerX: number,
    playerY: number,
    dirX: number,
    dirY: number
  ): boolean {
    if (this.isTransitioning()) return false;
    const stair = this.getNearbyStair(playerX, playerY, dirX, dirY);
    if (stair) {
      return this.executeTransition(stair);
    }
    return false;
  }

  private executeTransition(stair: StairNode): boolean {
    const partner = stair.partner;
    if (!partner) {
      this.scene.getHUD()?.showToast("[!] These stairs lead nowhere.", 0xffaa00);
      return false;
    }

    const freeBlock = this.findFreeBlockInFront(partner, stair);
    const dx = partner.x - stair.x;
    const dy = partner.y - stair.y;

    // Trigger stair footstep audio sequence (step_1 and step_2) instead of door_1
    this.startStairFootsteps(stair.stairType);

    // Display HUD notification
    const hud = this.scene.getHUD();
    if (hud) {
      if (stair.stairType === "up") {
        hud.showToast("[▲] Ascending Stairs...", 0x00e5ff);
      } else if (stair.stairType === "down") {
        hud.showToast("[▼] Descending Stairs...", 0x00e5ff);
      } else {
        hud.showToast("[!] Moving through Stairs...", 0x00e5ff);
      }
    }

    // Wipe direction matches the traversal vector
    const wipeDir = dx !== 0 || dy !== 0 ? { x: dx, y: dy } : { x: 1, y: 0 };

    this.wipeTransition.start(
      this.scene.getWorldContainer(),
      this.scene.getWeaponView(),
      {
        duration: 0.65,
        wipeDir,
        wipeType: 0.0, // Iconic linear directional screen wipe
        lineColor: [0.0, 0.9, 1.0], // Glowing cyan energy line
        onTeleport: () => {
          this.scene.setPlayerPosition(
            freeBlock.x + 0.5,
            freeBlock.y + 0.5,
            freeBlock.dirX,
            freeBlock.dirY
          );
        },
      }
    );

    return true;
  }

  private startStairFootsteps(stairType: "up" | "down" | "generic"): void {
    this.isStairStepActive = true;
    this.stairStepCounter = 0;
    this.totalStairSteps = 5;
    this.stairStepTimer = 0; // Trigger step 0 immediately
    this.stairStepType = stairType;
  }

  private updateStairSteps(delta: number): void {
    if (!this.isStairStepActive) return;

    this.stairStepTimer -= delta / 60;
    if (this.stairStepTimer <= 0) {
      this.playStairFootstep(this.stairStepCounter, this.stairStepType);
      this.stairStepCounter++;
      if (this.stairStepCounter >= this.totalStairSteps) {
        this.isStairStepActive = false;
      } else {
        this.stairStepTimer = this.stairStepInterval;
      }
    }
  }

  private playStairFootstep(stepIndex: number, stairType: "up" | "down" | "generic"): void {
    const stepSounds = ["step_1", "step_2"];
    const alias = stepSounds[stepIndex % stepSounds.length];

    // Progressive pitch/speed modulation: ascending steps rise slightly, descending steps deepen
    let speed = 1.0;
    if (stairType === "up") {
      speed = 1.04 + stepIndex * 0.02;
    } else if (stairType === "down") {
      speed = 0.98 - stepIndex * 0.015;
    }
    const volume = 0.4;

    if (!sound.exists(alias)) {
      try {
        sound.add(alias, { url: `./assets/raycast/sfx/${alias}.mp3`, preload: true });
      } catch {
        try {
          sound.add(alias, `./assets/raycast/sfx/${alias}.mp3`);
        } catch {}
      }
    }

    try {
      if (sound.exists(alias)) {
        sound.play(alias, { volume, speed });
      }
    } catch (e) {
      console.warn(`Could not play stair footstep sound "${alias}":`, e);
    }
  }

  public update(delta: number): void {
    this.wipeTransition.update(delta);
    this.updateStairSteps(delta);
  }

  public destroy(): void {
    this.isStairStepActive = false;
    this.wipeTransition.destroy();
    this.stairs.clear();
    this.stairList = [];
  }
}
