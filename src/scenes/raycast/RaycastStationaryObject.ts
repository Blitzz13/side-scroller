import { AnimatedSprite, MIPMAP_MODES, SCALE_MODES, Spritesheet, Texture } from "pixi.js";
import { RaycastDirectionalObject } from "./RaycastDirectionalObject";

export interface StationaryObjectOptions {
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  vOffset?: number;
  z?: number;
  anchor?: string;
  referenceHeight?: number;
  hitRadius?: number;
  blocksMovement?: boolean;
}

/**
 * 8-directional stationary object (e.g. isb_holotable, terminals, stationary droids).
 * Extends RaycastDirectionalObject to inherit 8-directional trigonometry, sector selection,
 * horizontal sprite flipping, and zero-allocation 3D raycast rendering.
 */
export class RaycastStationaryObject extends RaycastDirectionalObject {
  public name: string;
  public tileId: number;

  constructor(
    id: number,
    name: string,
    tileId: number,
    x: number,
    y: number,
    dirX: number = 0,
    dirY: number = 1,
    spritesheet?: Spritesheet,
    options?: StationaryObjectOptions
  ) {
    const scale = options?.scale ?? 0.55;
    const refHeight = options?.referenceHeight ?? 142;
    super(id, x, y, dirX, dirY, scale, refHeight);

    this.name = name;
    this.tileId = tileId;
    this.scaleX = options?.scaleX;
    this.scaleY = options?.scaleY;
    this.currentVOffset = options?.vOffset ?? 0;
    this.z = options?.z;
    this.anchor = options?.anchor ?? "floor";
    this.hitRadius = options?.hitRadius ?? 0.45;
    this.blocksMovement = options?.blocksMovement ?? true;
    this.prefix = name;

    if (spritesheet) {
      this.initFromSpritesheet(spritesheet);
    }
  }

  public initFromSpritesheet(spritesheet: Spritesheet): void {
    if (spritesheet.baseTexture) {
      spritesheet.baseTexture.scaleMode = SCALE_MODES.NEAREST;
      spritesheet.baseTexture.mipmap = MIPMAP_MODES.OFF;
      spritesheet.baseTexture.update();
    }

    const texs = spritesheet.textures;

    const getSingle = (candidateNames: string[]): Texture[] => {
      for (const name of candidateNames) {
        const t =
          texs[`${name}.png`] ||
          texs[name] ||
          texs[`${name}_1.png`] ||
          texs[`${name}_1`];
        if (t) return [t];
      }
      return [Texture.WHITE];
    };

    const p = this.prefix;

    this.animations = {
      towards: getSingle([`${p}_towards`, "towards"]),
      towards_left_diagonal: getSingle([
        `${p}_towards_left`,
        `${p}_towards_left_diagonal`,
        "towards_left",
        "towards_left_diagonal",
      ]),
      left: getSingle([`${p}_left`, "left"]),
      away_left_diagonal: getSingle([
        `${p}_away_left`,
        `${p}_away_left_diagonal`,
        "away_left",
        "away_left_diagonal",
      ]),
      away: getSingle([`${p}_away`, "away"]),
    };

    const initialTextures = this.animations.towards || [Texture.WHITE];
    this.animatedSprite = new AnimatedSprite(initialTextures);
    this.animatedSprite.anchor.set(0.5, 1.0);
    this.animatedSprite.animationSpeed = 0.16;
    this.animatedSprite.roundPixels = true;
    this.animatedSprite.visible = false;
    this.currentAnimKey = "towards";
  }
}
