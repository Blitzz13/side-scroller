import {
  AnimatedSprite,
  Assets,
  Container,
  Graphics,
  Rectangle,
  SCALE_MODES,
  Spritesheet,
  Texture,
} from "pixi.js";
import { sound } from "@pixi/sound";
import {
  MapObject,
  RaycastPickupItem,
  RaycastPickupType,
  RaycastWeaponType,
  TileMeta,
  getRaycastPickupConfig,
  getRaycastWeaponConfig,
} from "./types";
import { gameConfig } from "../../configs/GameConfig";

export class RaycastPickupManager {
  private container: Container | null = null;
  private pickups: RaycastPickupItem[] = [];
  private staticObjects: MapObject[] = [];
  private nextId: number = 1;
  private keycardSpritesheet: Spritesheet | null = null;
  private keycardAnimationFrames: Record<string, Texture[]> = {};
  private pickupTextures: Record<string, Texture> = {};
  private pickupSlices: Record<string, Texture[]> = {};
  private shieldAnimationFrames: Texture[] = [];
  private shieldSpritesheet: any = null;

  constructor(container?: Container) {
    if (container) {
      this.container = container;
    }
  }

  public setContainer(container: Container): void {
    this.container = container;
    // Bind any existing pickups that were parsed before container was assigned
    for (const pickup of this.pickups) {
      if (pickup.keyColor && !pickup.animatedSprite) {
        this.spawnKeycardSprite(pickup);
      } else if (pickup.type === RaycastPickupType.SHIELD && !pickup.animatedSprite) {
        this.spawnShieldSprite(pickup);
      }
    }
  }

  public async initTextures(): Promise<void> {
    await this.initKeycardTextures();
    await this.initShieldTextures();

    const standardPickups = [
      { key: "weapon", path: "assets/raycast/pickups/e_11_item.png" },
      { key: "health", path: "assets/raycast/pickups/health.png" },
      { key: "ammo", path: "assets/ammo.png" },
      { key: "thermal_detonator_belt", path: "assets/raycast/pickups/thermal_detonator_belt.png" },
      { key: "thermal_detonator_pickup", path: "assets/raycast/pickups/thermal_detonator_pickup.png" },
      { key: "shield", path: "assets/raycast/pickups/shield_unit.png" },
    ];

    for (const p of standardPickups) {
      try {
        const tex = await Assets.load(p.path);
        if (tex) {
          if (tex.baseTexture) {
            tex.baseTexture.scaleMode = SCALE_MODES.NEAREST;
          }
          this.pickupTextures[p.key] = tex;
          this.pickupSlices[p.key] = this.sliceTexture(tex);
        }
      } catch (err) {
        console.warn(`Failed to load pickup texture ${p.path}:`, err);
      }
    }
  }

  private sliceTexture(texture: Texture): Texture[] {
    const slices: Texture[] = [];
    const texW = texture.width || 64;
    const texH = texture.height || 64;
    for (let x = 0; x < texW; x++) {
      slices.push(
        new Texture(texture.baseTexture, new Rectangle(x, 0, 1, texH))
      );
    }
    return slices;
  }

  public async initKeycardTextures(): Promise<void> {
    try {
      let sheet: any = null;
      if (Assets.cache.has("keycards")) {
        sheet = Assets.get("keycards");
      } else if (Assets.cache.has("./assets/keycards.json")) {
        sheet = Assets.get("./assets/keycards.json");
      } else if (Assets.cache.has("assets/keycards.json")) {
        sheet = Assets.get("assets/keycards.json");
      } else {
        sheet = await Assets.load("./assets/keycards.json");
      }

      if (sheet) {
        if (sheet.baseTexture) {
          sheet.baseTexture.scaleMode = SCALE_MODES.NEAREST;
        }
        this.keycardSpritesheet = sheet;

        const colors = ["blue", "green", "red"];
        for (const color of colors) {
          this.keycardAnimationFrames[color] = [];
          for (let i = 1; i <= 6; i++) {
            const frameName = `keycard/key_card_${color}_${i}.png`;
            const tex = sheet.textures[frameName];
            if (tex) {
              if (tex.baseTexture) {
                tex.baseTexture.scaleMode = SCALE_MODES.NEAREST;
              }
              this.keycardAnimationFrames[color].push(tex);
            }
          }
        }

        // Attach AnimatedSprite to any pickups waiting for spritesheet
        for (const pickup of this.pickups) {
          if (pickup.keyColor && !pickup.animatedSprite) {
            this.spawnKeycardSprite(pickup);
          }
        }
      }
    } catch (err) {
      console.warn("Failed to load keycards spritesheet:", err);
    }
  }

  public async initShieldTextures(): Promise<void> {
    try {
      let sheet: any = null;
      if (Assets.cache.has("shield_unit")) {
        sheet = Assets.get("shield_unit");
      } else if (Assets.cache.has("./assets/raycast/pickups/shield_unit.json")) {
        sheet = Assets.get("./assets/raycast/pickups/shield_unit.json");
      } else if (Assets.cache.has("assets/raycast/pickups/shield_unit.json")) {
        sheet = Assets.get("assets/raycast/pickups/shield_unit.json");
      } else {
        sheet = await Assets.load("./assets/raycast/pickups/shield_unit.json");
      }

      if (sheet) {
        if (sheet.baseTexture) {
          sheet.baseTexture.scaleMode = SCALE_MODES.NEAREST;
        }
        this.shieldSpritesheet = sheet;
        this.shieldAnimationFrames = [];
        for (let i = 1; i <= 2; i++) {
          const frameName = `shield_unit_${i}.png`;
          const tex = sheet.textures ? sheet.textures[frameName] : null;
          if (tex) {
            if (tex.baseTexture) {
              tex.baseTexture.scaleMode = SCALE_MODES.NEAREST;
            }
            this.shieldAnimationFrames.push(tex);
          }
        }

        if (this.shieldAnimationFrames.length > 0) {
          this.pickupTextures["shield"] = this.shieldAnimationFrames[0];
          this.pickupSlices["shield"] = this.sliceTexture(this.shieldAnimationFrames[0]);
        }

        // Attach AnimatedSprite to any pickups waiting for spritesheet
        for (const pickup of this.pickups) {
          if (pickup.type === RaycastPickupType.SHIELD && !pickup.animatedSprite) {
            this.spawnShieldSprite(pickup);
          }
        }
      }
    } catch (err) {
      console.warn("Failed to load shield_unit spritesheet:", err);
    }
  }

  public update(delta: number): void {
    // AnimatedSprites are automatically ticked by Pixi's Shared Ticker
  }

  public bindBreakables(breakables: any[]): void {
    for (const pickup of this.pickups) {
      // Find if pickup is placed on top of any table/chair
      const table = breakables.find((b) => {
        const dx = b.x - pickup.x;
        const dy = b.y - pickup.y;
        return Math.sqrt(dx * dx + dy * dy) < 0.6;
      });
      if (table) {
        pickup.x = table.x;
        pickup.y = table.y;
        pickup.parentBreakable = table;
      }
    }
  }

  private spawnKeycardSprite(pickup: RaycastPickupItem): void {
    if (!this.container || !pickup.keyColor) return;
    const frames = this.keycardAnimationFrames[pickup.keyColor];
    if (!frames || frames.length === 0) return;

    const animSprite = new AnimatedSprite(frames);
    animSprite.animationSpeed = 0.14;
    animSprite.play();
    animSprite.roundPixels = true;
    animSprite.anchor.set(0.5, 0.5);
    animSprite.visible = false;

    const mask = new Graphics();
    animSprite.mask = mask;

    this.container.addChild(mask);
    this.container.addChild(animSprite);

    pickup.animatedSprite = animSprite;
    pickup.occlusionMask = mask;
  }

  private spawnShieldSprite(pickup: RaycastPickupItem): void {
    if (!this.container) return;
    const frames = this.shieldAnimationFrames;
    if (!frames || frames.length === 0) return;

    const animSprite = new AnimatedSprite(frames);
    animSprite.animationSpeed = 0.06;
    animSprite.play();
    animSprite.roundPixels = true;
    animSprite.anchor.set(0.5, 1.0);
    animSprite.visible = false;

    const mask = new Graphics();
    animSprite.mask = mask;

    this.container.addChild(mask);
    this.container.addChild(animSprite);

    pickup.animatedSprite = animSprite;
    pickup.occlusionMask = mask;
  }

  public parseMapPickups(
    mapData: any,
    tileMeta: Record<number, TileMeta>,
    tileTypes: Record<number, string>,
    firstgid: number
  ): void {
    this.dispose();
    this.pickups = [];
    this.staticObjects = [];
    this.nextId = 1;

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

    const objectLayers = allLayers.filter(
      (layer: any) =>
        layer.type === "objectgroup" ||
        (layer.name &&
          (layer.name.toLowerCase().includes("object") ||
            layer.name.toLowerCase().includes("item") ||
            layer.name.toLowerCase().includes("prop") ||
            layer.name.toLowerCase().includes("decor") ||
            layer.name.toLowerCase().includes("pickup")))
    );

    for (const layer of objectLayers) {
      let layerScale: number | undefined;
      let layerScaleX: number | undefined;
      let layerScaleY: number | undefined;
      let layerVOffset: number | undefined;
      let layerZ: number | undefined;
      let layerAnchor: string | undefined;

      if (layer.properties) {
        layer.properties.forEach((prop: any) => {
          const pName = prop.name.toLowerCase();
          const pVal = prop.value;
          if (pName === "scale" || pName === "size") layerScale = parseFloat(pVal);
          if (pName === "scalex" || pName === "sizex") layerScaleX = parseFloat(pVal);
          if (pName === "scaley" || pName === "sizey") layerScaleY = parseFloat(pVal);
          if (
            pName === "voffset" ||
            pName === "yoffset" ||
            pName === "offset" ||
            pName === "heightoffset"
          ) {
            layerVOffset = parseFloat(pVal);
          }
          if (
            pName === "z" ||
            pName === "elevation" ||
            pName === "altitude" ||
            pName === "height"
          ) {
            layerZ = parseFloat(pVal);
          }
          if (
            pName === "anchor" ||
            pName === "position" ||
            pName === "align" ||
            pName === "valign"
          ) {
            layerAnchor = String(pVal).toLowerCase();
          }
        });
      }

      const lowerName = layer.name ? layer.name.toLowerCase() : "";
      if (!layerAnchor) {
        if (lowerName.includes("ceiling") || lowerName.includes("top")) layerAnchor = "ceiling";
        else if (
          lowerName.includes("floor") ||
          lowerName.includes("ground") ||
          lowerName.includes("bottom")
        )
          layerAnchor = "floor";
      }

      if (layer.data) {
        // Tile Layer
        layer.data.forEach((tileGid: number, index: number) => {
          if (tileGid !== 0) {
            const x = (index % layer.width) + 0.5;
            const y = Math.floor(index / layer.width) + 0.5;
            const adjustedTileId = tileGid - firstgid;
            const meta = tileMeta[adjustedTileId] || {};
            const typeStr = (meta.type || tileTypes[tileGid] || "").toLowerCase();
            const imgStr = (meta.image || "").toLowerCase();

            const isKeycard =
              typeStr.includes("keycard") ||
              typeStr.includes("card") ||
              imgStr.includes("key_card") ||
              imgStr.includes("keycard");

            const isDetonator =
              typeStr.includes("detonator") ||
              typeStr.includes("thermal") ||
              imgStr.includes("detonator") ||
              imgStr.includes("thermal");

            const isShield =
              typeStr.includes("shield") ||
              imgStr.includes("shield");

            const isPickup =
              isKeycard ||
              isDetonator ||
              isShield ||
              meta.tileClass === "PickupItem" ||
              typeStr === "weapon" ||
              typeStr === "health" ||
              typeStr === "ammo";

            if (isPickup) {
              let keyColor: string | undefined;
              let pickupType: RaycastPickupType;

              if (isKeycard) {
                if (typeStr.includes("green") || imgStr.includes("green")) {
                  keyColor = "green";
                  pickupType = RaycastPickupType.GREEN_KEYCARD;
                } else if (typeStr.includes("red") || imgStr.includes("red")) {
                  keyColor = "red";
                  pickupType = RaycastPickupType.RED_KEYCARD;
                } else {
                  keyColor = "blue";
                  pickupType = RaycastPickupType.BLUE_KEYCARD;
                }
              } else if (isDetonator) {
                if (typeStr.includes("belt") || imgStr.includes("belt")) {
                  pickupType = RaycastPickupType.THERMAL_DETONATOR_BELT;
                } else {
                  pickupType = RaycastPickupType.THERMAL_DETONATOR_SINGLE;
                }
              } else if (isShield) {
                pickupType = RaycastPickupType.SHIELD;
              } else {
                const pConfig = getRaycastPickupConfig(typeStr);
                pickupType =
                  pConfig?.type ??
                  (typeStr.includes("weapon")
                    ? RaycastPickupType.WEAPON
                    : typeStr.includes("ammo")
                    ? RaycastPickupType.AMMO
                    : RaycastPickupType.HEALTH);
              }

              const pConfig =
                pickupType === RaycastPickupType.WEAPON && meta.weaponType
                  ? getRaycastPickupConfig(meta.weaponType) || getRaycastPickupConfig(pickupType)
                  : getRaycastPickupConfig(pickupType) || getRaycastPickupConfig(typeStr);
              const weaponConfig = getRaycastWeaponConfig(meta.weaponType || "e_11");
              const weaponEnum: RaycastWeaponType | undefined =
                pickupType === RaycastPickupType.WEAPON
                  ? weaponConfig?.type ?? RaycastWeaponType.E11
                  : undefined;

              const scale = layerScale ?? meta.scale ?? pConfig?.scale ?? 0.25;
              const scaleX = layerScaleX ?? meta.scaleX ?? pConfig?.scaleX ?? scale;
              const scaleY = layerScaleY ?? meta.scaleY ?? pConfig?.scaleY ?? scale;
              const vOffset = layerVOffset ?? meta.vOffset ?? pConfig?.vOffset;
              const z = layerZ ?? meta.z ?? pConfig?.z;
              const anchor = layerAnchor ?? meta.anchor ?? pConfig?.anchor ?? (isKeycard ? "center" : "floor");

              const item: RaycastPickupItem = {
                id: this.nextId++,
                x,
                y,
                texture: adjustedTileId,
                type: pickupType,
                weaponType: weaponEnum,
                keyColor,
                amount: meta.amount ?? pConfig?.amount ?? 1,
                collected: false,
                scale,
                scaleX,
                scaleY,
                vOffset,
                z,
                anchor,
                pickupRadius: pConfig?.pickupRadius ?? (keyColor ? 0.9 : undefined),
                config: pConfig,
              };

              this.pickups.push(item);
              if (keyColor) {
                this.spawnKeycardSprite(item);
              } else if (pickupType === RaycastPickupType.SHIELD) {
                this.spawnShieldSprite(item);
              }
            } else {
              const isBreakable =
                imgStr.includes("chair") ||
                imgStr.includes("table") ||
                imgStr.includes("power_cell") ||
                imgStr.includes("powercell") ||
                typeStr.includes("chair") ||
                typeStr.includes("table") ||
                typeStr.includes("power_cell") ||
                typeStr.includes("powercell") ||
                meta.tileClass === "DestructableWall";

              if (!isBreakable) {
                const scale = layerScale ?? meta.scale;
                const scaleX = layerScaleX ?? meta.scaleX ?? scale;
                const scaleY = layerScaleY ?? meta.scaleY ?? scale;
                const vOffset = layerVOffset ?? meta.vOffset;
                const z = layerZ ?? meta.z;
                const anchor = layerAnchor ?? meta.anchor ?? "floor";

                this.staticObjects.push({
                  x,
                  y,
                  texture: adjustedTileId,
                  scale,
                  scaleX,
                  scaleY,
                  vOffset,
                  z,
                  anchor,
                });
              }
            }
          }
        });
      } else if (layer.objects) {
        // Object Layer
        const tileW = mapData.tilewidth || 64;
        const tileH = mapData.tileheight || 64;

        layer.objects.forEach((obj: any) => {
          const gid = obj.gid ?? 0;
          if (gid !== 0) {
            const adjustedTileId = gid - firstgid;
            const meta = tileMeta[adjustedTileId] || {};

            let objScale = layerScale ?? meta.scale;
            let objScaleX = layerScaleX ?? meta.scaleX ?? objScale;
            let objScaleY = layerScaleY ?? meta.scaleY ?? objScale;
            let objVOffset = layerVOffset ?? meta.vOffset;
            let objZ = layerZ ?? meta.z;
            let objAnchor = layerAnchor ?? meta.anchor;
            let objType = meta.type || tileTypes[gid] || "";
            let objWeaponType = meta.weaponType;
            let objAmount = meta.amount ?? 20;
            let objPickupRadius: number | undefined;

            if (obj.properties) {
              obj.properties.forEach((prop: any) => {
                const pName = prop.name.toLowerCase();
                const pVal = prop.value;
                if (pName === "scale" || pName === "size") objScale = parseFloat(pVal);
                if (pName === "scalex" || pName === "sizex") objScaleX = parseFloat(pVal);
                if (pName === "scaley" || pName === "sizey") objScaleY = parseFloat(pVal);
                if (
                  pName === "voffset" ||
                  pName === "yoffset" ||
                  pName === "offset" ||
                  pName === "heightoffset"
                ) {
                  objVOffset = parseFloat(pVal);
                }
                if (
                  pName === "z" ||
                  pName === "elevation" ||
                  pName === "altitude" ||
                  pName === "height"
                ) {
                  objZ = parseFloat(pVal);
                }
                if (
                  pName === "anchor" ||
                  pName === "position" ||
                  pName === "align" ||
                  pName === "valign"
                ) {
                  objAnchor = String(pVal).toLowerCase();
                }
                if (pName === "pickupradius" || pName === "radius" || pName === "hitradius") {
                  objPickupRadius = parseFloat(pVal);
                }
                if (pName === "type") objType = String(pVal);
                if (pName === "weapontype") objWeaponType = String(pVal);
                if (pName === "amount") objAmount = parseInt(pVal, 10);
                if (pName === "object" && typeof pVal === "object" && pVal !== null) {
                  if (pVal.scale !== undefined) objScale = parseFloat(pVal.scale);
                  if (pVal.anchor !== undefined) objAnchor = String(pVal.anchor).toLowerCase();
                  if (pVal.pickupRadius !== undefined || pVal.radius !== undefined) {
                    objPickupRadius = parseFloat(pVal.pickupRadius ?? pVal.radius);
                  }
                }
              });
            }

            const objW = obj.width || tileW;
            const objH = obj.height || tileH;
            const x = (obj.x + objW / 2) / tileW;
            const y = (obj.y - objH / 2) / tileH;
            const normalizedType = (objType || meta.type || "").toLowerCase();
            const imgStr = (meta.image || "").toLowerCase();

            const isKeycard =
              normalizedType.includes("keycard") ||
              normalizedType.includes("card") ||
              imgStr.includes("key_card") ||
              imgStr.includes("keycard") ||
              (obj.name && obj.name.toLowerCase().includes("keycard"));

            const isDetonator =
              normalizedType.includes("detonator") ||
              normalizedType.includes("thermal") ||
              imgStr.includes("detonator") ||
              imgStr.includes("thermal") ||
              (obj.name && obj.name.toLowerCase().includes("detonator"));

            const isShield =
              normalizedType.includes("shield") ||
              imgStr.includes("shield") ||
              (obj.name && obj.name.toLowerCase().includes("shield"));

            const isPickup =
              isKeycard ||
              isDetonator ||
              isShield ||
              obj.type === "PickupItem" ||
              meta.tileClass === "PickupItem" ||
              normalizedType === "weapon" ||
              normalizedType === "health" ||
              normalizedType === "ammo";

            if (!objAnchor) {
              objAnchor = isKeycard ? "center" : "floor";
            }

            if (isPickup) {
              let keyColor: string | undefined;
              let pickupType: RaycastPickupType;

              if (isKeycard) {
                if (normalizedType.includes("green") || imgStr.includes("green")) {
                  keyColor = "green";
                  pickupType = RaycastPickupType.GREEN_KEYCARD;
                } else if (normalizedType.includes("red") || imgStr.includes("red")) {
                  keyColor = "red";
                  pickupType = RaycastPickupType.RED_KEYCARD;
                } else {
                  keyColor = "blue";
                  pickupType = RaycastPickupType.BLUE_KEYCARD;
                }
              } else if (isDetonator) {
                if (normalizedType.includes("belt") || imgStr.includes("belt") || (obj.name && obj.name.toLowerCase().includes("belt"))) {
                  pickupType = RaycastPickupType.THERMAL_DETONATOR_BELT;
                } else {
                  pickupType = RaycastPickupType.THERMAL_DETONATOR_SINGLE;
                }
              } else if (isShield) {
                pickupType = RaycastPickupType.SHIELD;
              } else {
                const pConfig = getRaycastPickupConfig(normalizedType);
                pickupType =
                  pConfig?.type ??
                  (normalizedType.includes("weapon")
                    ? RaycastPickupType.WEAPON
                    : normalizedType.includes("ammo")
                    ? RaycastPickupType.AMMO
                    : RaycastPickupType.HEALTH);
              }

              const pConfig =
                pickupType === RaycastPickupType.WEAPON && objWeaponType
                  ? getRaycastPickupConfig(objWeaponType) || getRaycastPickupConfig(pickupType)
                  : getRaycastPickupConfig(pickupType) || getRaycastPickupConfig(normalizedType);
              const weaponConfig = getRaycastWeaponConfig(objWeaponType || "e_11");
              const weaponEnum: RaycastWeaponType | undefined =
                pickupType === RaycastPickupType.WEAPON
                  ? weaponConfig?.type ?? RaycastWeaponType.E11
                  : undefined;

              const scale = objScale ?? pConfig?.scale ?? 0.25;
              const scaleX = objScaleX ?? pConfig?.scaleX ?? scale;
              const scaleY = objScaleY ?? pConfig?.scaleY ?? scale;
              const vOffset = objVOffset ?? pConfig?.vOffset;
              const z = objZ ?? pConfig?.z;
              const anchor = objAnchor ?? pConfig?.anchor ?? (isKeycard ? "center" : "floor");

              const item: RaycastPickupItem = {
                id: this.nextId++,
                x,
                y,
                texture: adjustedTileId,
                type: pickupType,
                weaponType: weaponEnum,
                keyColor,
                amount: objAmount || pConfig?.amount || 1,
                collected: false,
                scale,
                scaleX,
                scaleY,
                vOffset,
                z,
                anchor,
                pickupRadius: objPickupRadius ?? pConfig?.pickupRadius ?? (keyColor ? 0.9 : undefined),
                config: pConfig,
              };

              this.pickups.push(item);
              if (keyColor) {
                this.spawnKeycardSprite(item);
              } else if (pickupType === RaycastPickupType.SHIELD) {
                this.spawnShieldSprite(item);
              }
            } else {
              const isBreakable =
                imgStr.includes("chair") ||
                imgStr.includes("table") ||
                imgStr.includes("power_cell") ||
                imgStr.includes("powercell") ||
                (obj.name || "").toLowerCase().includes("chair") ||
                (obj.name || "").toLowerCase().includes("table") ||
                (obj.name || "").toLowerCase().includes("power_cell") ||
                (obj.name || "").toLowerCase().includes("powercell") ||
                normalizedType.includes("chair") ||
                normalizedType.includes("table") ||
                normalizedType.includes("power_cell") ||
                normalizedType.includes("powercell") ||
                obj.type === "DestructableWall" ||
                normalizedType.includes("destructablewall") ||
                (layer.name && layer.name.toLowerCase().includes("doorprotector"));

              if (!isBreakable) {
                this.staticObjects.push({
                  x,
                  y,
                  texture: adjustedTileId,
                  scale: objScale,
                  scaleX: objScaleX,
                  scaleY: objScaleY,
                  vOffset: objVOffset,
                  z: objZ,
                  anchor: objAnchor,
                });
              }
            }
          }
        });
      }
    }
  }

  public getVisibleMapObjects(): MapObject[] {
    const list: MapObject[] = [];

    // Add uncollected non-animated pickups (keycards with AnimatedSprite are rendered via render())
    for (const pickup of this.pickups) {
      if (!pickup.collected && !pickup.animatedSprite) {
        const pTypeKey =
          pickup.type === RaycastPickupType.WEAPON
            ? "weapon"
            : pickup.type === RaycastPickupType.AMMO
            ? "ammo"
            : pickup.type === RaycastPickupType.THERMAL_DETONATOR_BELT
            ? "thermal_detonator_belt"
            : pickup.type === RaycastPickupType.THERMAL_DETONATOR_SINGLE
            ? "thermal_detonator_pickup"
            : pickup.type === RaycastPickupType.SHIELD
            ? "shield"
            : "health";

        const customTex = this.pickupTextures[pTypeKey];
        const customSlices = this.pickupSlices[pTypeKey];

        list.push({
          x: pickup.x,
          y: pickup.y,
          texture: pickup.texture,
          customTexture: customTex,
          customSlices: customSlices,
          scale: pickup.scale ?? pickup.config?.scale,
          scaleX: pickup.scaleX ?? pickup.config?.scaleX ?? pickup.scale ?? pickup.config?.scale,
          scaleY: pickup.scaleY ?? pickup.config?.scaleY ?? pickup.scale ?? pickup.config?.scale,
          vOffset: pickup.vOffset ?? pickup.config?.vOffset,
          z: pickup.z ?? pickup.config?.z,
          anchor: pickup.anchor ?? pickup.config?.anchor ?? "floor",
          pickupRef: pickup,
        });
      }
    }

    // Add static objects
    for (const obj of this.staticObjects) {
      list.push(obj);
    }

    return list;
  }

  public render(
    playerX: number,
    playerY: number,
    dirX: number,
    dirY: number,
    planeX: number,
    planeY: number,
    zBuffer: Float64Array,
    maxRenderDistance: number
  ): void {
    const screenW = gameConfig.width;
    const screenH = gameConfig.height;
    const invDet = 1.0 / (planeX * dirY - dirX * planeY);

    for (const pickup of this.pickups) {
      const sprite = pickup.animatedSprite;
      if (!sprite) continue;

      if (pickup.collected) {
        sprite.visible = false;
        if (pickup.occlusionMask) pickup.occlusionMask.clear();
        continue;
      }

      // If attached to a breakable table/chair, follow its position and state
      let posX = pickup.x;
      let posY = pickup.y;
      let onBrokenTable = false;

      if (pickup.parentBreakable) {
        posX = pickup.parentBreakable.x;
        posY = pickup.parentBreakable.y;
        if (pickup.parentBreakable.isBroken) {
          onBrokenTable = true;
        }
      }

      const dx = posX - playerX;
      const dy = posY - playerY;

      // Transform into camera space
      const transformX = invDet * (dirY * dx - dirX * dy);
      const transformY = invDet * (-planeY * dx + planeX * dy);

      if (transformY <= 0.1 || transformY > maxRenderDistance) {
        sprite.visible = false;
        if (pickup.occlusionMask) pickup.occlusionMask.clear();
        continue;
      }

      const spriteScreenX = Math.floor(
        (screenW / 2) * (1 + transformX / transformY)
      );
      const baseHeight = Math.abs(Math.floor(screenH / transformY));
      const scale = pickup.scale ?? pickup.config?.scale ?? 0.20;

      const curTex = sprite.texture;
      const texW = curTex ? (curTex.orig?.width || curTex.width || 25) : 25;
      const texH = curTex ? (curTex.orig?.height || curTex.height || 30) : 30;
      const refHeight = texH || 30;

      const baseScale = (baseHeight * scale) / refHeight;
      sprite.scale.set(baseScale, baseScale);

      const spriteWidth = Math.max(
        1,
        Math.floor(baseHeight * scale * (texW / refHeight))
      );
      const spriteHeight = Math.max(
        1,
        Math.floor(baseHeight * scale)
      );

      const halfW = spriteWidth / 2;
      const drawStartX = Math.max(0, Math.floor(spriteScreenX - halfW));
      const drawEndX = Math.min(screenW - 1, Math.floor(spriteScreenX + halfW));

      // Calculate screen Y based on anchor & elevation
      let screenY: number;
      if (pickup.parentBreakable) {
        if (onBrokenTable) {
          // Table broken - keycard rests on floor rubble
          sprite.anchor.set(0.5, 1.0);
          screenY = Math.floor(screenH / 2 + baseHeight / 2);
        } else {
          // Table intact - bottom of card rests directly on table surface (table height is 0.38)
          sprite.anchor.set(0.5, 1.0);
          screenY = Math.floor(screenH / 2 + (0.5 - 0.38) * baseHeight);
        }
      } else if (pickup.anchor === "floor") {
        sprite.anchor.set(0.5, 1.0);
        screenY = Math.floor(screenH / 2 + baseHeight / 2);
      } else if (pickup.anchor === "ceiling") {
        sprite.anchor.set(0.5, 0.0);
        screenY = Math.floor(screenH / 2 - baseHeight / 2);
      } else {
        // "center" anchor
        sprite.anchor.set(0.5, 0.5);
        const vOff = pickup.vOffset !== undefined ? pickup.vOffset : (pickup.z !== undefined ? -pickup.z : 0);
        screenY = Math.floor(screenH / 2 + vOff * baseHeight);
      }

      // Per-column occlusion mask with Graphics stencil
      const mask = pickup.occlusionMask;
      if (mask) {
        mask.clear();
        let runStart = -1;
        let anyVisible = false;

        for (let col = drawStartX; col <= drawEndX; col++) {
          if (transformY < zBuffer[col]) {
            if (runStart < 0) runStart = col;
            anyVisible = true;
          } else {
            if (runStart >= 0) {
              mask.beginFill(0xffffff);
              mask.drawRect(runStart, 0, col - runStart, screenH);
              mask.endFill();
              runStart = -1;
            }
          }
        }
        if (runStart >= 0) {
          mask.beginFill(0xffffff);
          mask.drawRect(runStart, 0, drawEndX - runStart + 1, screenH);
          mask.endFill();
        }

        if (!anyVisible && drawStartX <= drawEndX) {
          sprite.visible = false;
          continue;
        }
      }

      sprite.visible = true;
      sprite.x = spriteScreenX;
      sprite.y = screenY;
      sprite.width = spriteWidth;
      sprite.height = spriteHeight;

      // Distance shading
      const shade = Math.max(
        0.2,
        Math.min(1.0, 1.0 - (transformY / maxRenderDistance) * 0.75)
      );
      const shadeInt = (shade * 255) | 0;
      sprite.tint = (shadeInt << 16) | (shadeInt << 8) | shadeInt;

      // Depth sorting
      sprite.zIndex = 1000 - Math.floor(transformY * 10);
    }
  }

  public checkPlayerPickups(
    playerX: number,
    playerY: number,
    pickupRadius: number = 0.55
  ): RaycastPickupItem[] {
    const collectedList: RaycastPickupItem[] = [];

    for (const item of this.pickups) {
      if (!item.collected) {
        const posX = item.parentBreakable ? item.parentBreakable.x : item.x;
        const posY = item.parentBreakable ? item.parentBreakable.y : item.y;
        const dx = posX - playerX;
        const dy = posY - playerY;
        const distSq = dx * dx + dy * dy;

        const effectiveRadius =
          item.pickupRadius ??
          item.config?.pickupRadius ??
          (item.keyColor ? 0.9 : pickupRadius);

        if (distSq <= effectiveRadius * effectiveRadius) {
          item.collected = true;
          if (item.animatedSprite) {
            item.animatedSprite.visible = false;
          }
          if (item.occlusionMask) {
            item.occlusionMask.clear();
          }
          collectedList.push(item);

          if (item.config?.pickUpSound?.src) {
            try {
              sound.play(item.config.pickUpSound.src, {
                volume: item.config.pickUpSound.volume,
                loop: item.config.pickUpSound.loop,
              });
            } catch (e) {
              console.warn("Failed to play pickup sound:", e);
            }
          }
        }
      }
    }

    return collectedList;
  }

  public spawnPickup(
    type: RaycastPickupType,
    x: number,
    y: number,
    amount: number | RaycastWeaponType = 20,
    weaponType: RaycastWeaponType = RaycastWeaponType.E11
  ): RaycastPickupItem {
    const pConfig = getRaycastPickupConfig(type);
    let finalAmount = typeof amount === "number" ? amount : 20;
    let finalWeapon: RaycastWeaponType = weaponType;

    // Handle (type, x, y, dropWeapon, dropAmmo) order gracefully
    if (
      typeof (amount as any) === "string" ||
      (typeof amount === "number" && typeof (weaponType as any) === "number" && amount < 10 && weaponType >= 10)
    ) {
      finalWeapon = amount as unknown as RaycastWeaponType;
      finalAmount = typeof weaponType === "number" ? weaponType : 20;
    }

    let keyColor: string | undefined;
    if (type === RaycastPickupType.BLUE_KEYCARD) keyColor = "blue";
    else if (type === RaycastPickupType.GREEN_KEYCARD) keyColor = "green";
    else if (type === RaycastPickupType.RED_KEYCARD) keyColor = "red";

    const item: RaycastPickupItem = {
      id: this.nextId++,
      x,
      y,
      texture: -1,
      type,
      weaponType: finalWeapon,
      keyColor,
      amount: finalAmount,
      collected: false,
      scale: pConfig?.scale ?? 0.25,
      anchor: pConfig?.anchor ?? (keyColor ? "center" : "floor"),
      pickupRadius: pConfig?.pickupRadius ?? (keyColor ? 0.9 : undefined),
      config: pConfig,
    };

    this.pickups.push(item);
    if (keyColor) {
      this.spawnKeycardSprite(item);
    } else if (type === RaycastPickupType.SHIELD) {
      this.spawnShieldSprite(item);
    }
    return item;
  }

  public dispose(): void {
    for (const pickup of this.pickups) {
      if (pickup.animatedSprite) {
        pickup.animatedSprite.destroy();
      }
      if (pickup.occlusionMask) {
        pickup.occlusionMask.destroy();
      }
    }
    this.pickups = [];
    this.staticObjects = [];
  }
}
