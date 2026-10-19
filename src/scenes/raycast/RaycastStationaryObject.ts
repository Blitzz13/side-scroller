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

    const getSequence = (candidatePrefixes: string[]): Texture[] => {
      for (const prefix of candidatePrefixes) {
        // 1. Check numbered sequence: _1.png, _2.png, ...
        const frames: Texture[] = [];
        let i = 1;
        while (true) {
          const t =
            texs[`${prefix}_${i}.png`] ||
            texs[`${prefix}_${i}`] ||
            texs[`${prefix}${i}.png`] ||
            texs[`${prefix}${i}`];
          if (!t) break;
          frames.push(t);
          i++;
        }
        if (frames.length > 0) return frames;

        // 2. Check single frame
        const single =
          texs[`${prefix}.png`] ||
          texs[prefix] ||
          texs[`${prefix}_1.png`] ||
          texs[`${prefix}_1`];
        if (single) return [single];
      }
      return [Texture.WHITE];
    };

    const p = this.prefix;

    this.animations = {
      towards: getSequence([
        `${p}_standing_down`,
        "standing_down",
        `${p}_towards`,
        "towards",
        `${p}_standing_towards`,
        "standing_towards",
        `${p}_walking_towards`,
        "walking_towards",
      ]),
      towards_left_diagonal: getSequence([
        `${p}_standing_towards_left_diagonal`,
        "standing_towards_left_diagonal",
        `${p}_towards_left_diagonal`,
        `${p}_towards_left`,
        "towards_left_diagonal",
        "towards_left",
        `${p}_standing_towards_left`,
        "standing_towards_left",
        `${p}_walking_towards_left_diagonal`,
        "walking_towards_left_diagonal",
      ]),
      left: getSequence([
        `${p}_standing_left`,
        "standing_left",
        `${p}_left`,
        "left",
        `${p}_walking_left`,
        "walking_left",
      ]),
      away_left_diagonal: getSequence([
        `${p}_standing_away_left_diagonal`,
        "standing_away_left_diagonal",
        `${p}_away_left_diagonal`,
        `${p}_away_left`,
        "away_left_diagonal",
        "away_left",
        `${p}_standing_away_left`,
        "standing_away_left",
        `${p}_walking_away_left_diagonal`,
        "walking_away_left_diagonal",
      ]),
      away: getSequence([
        `${p}_standing_away`,
        "standing_away",
        `${p}_away`,
        "away",
        `${p}_walking_away`,
        "walking_away",
      ]),
    };

    const initialTextures = this.animations.towards || [Texture.WHITE];
    this.animatedSprite = new AnimatedSprite(initialTextures);
    this.animatedSprite.anchor.set(0.5, 1.0);
    this.animatedSprite.animationSpeed = 0.16;
    this.animatedSprite.roundPixels = true;
    this.animatedSprite.visible = false;
    this.currentAnimKey = "towards";
    if (initialTextures.length > 1) {
      this.animatedSprite.play();
    }
  }
}
