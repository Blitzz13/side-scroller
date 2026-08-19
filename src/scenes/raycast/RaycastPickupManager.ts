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

export class RaycastPickupManager {
  private pickups: RaycastPickupItem[] = [];
  private staticObjects: MapObject[] = [];
  private nextId: number = 1;

  public parseMapPickups(
    mapData: any,
    tileMeta: Record<number, TileMeta>,
    tileTypes: Record<number, string>,
    firstgid: number
  ): void {
    this.pickups = [];
    this.staticObjects = [];
    this.nextId = 1;

    const objectLayers = mapData.layers.filter(
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

            const isPickup =
              meta.tileClass === "PickupItem" ||
              typeStr === "weapon" ||
              typeStr === "health" ||
              typeStr === "ammo";

            const scale = layerScale ?? meta.scale ?? 0.25;
            const scaleX = layerScaleX ?? meta.scaleX ?? scale;
            const scaleY = layerScaleY ?? meta.scaleY ?? scale;
            const vOffset = layerVOffset ?? meta.vOffset;
            const z = layerZ ?? meta.z;
            const anchor = layerAnchor ?? meta.anchor ?? "floor";

            if (isPickup) {
              const pConfig = getRaycastPickupConfig(typeStr);
              const pickupType: RaycastPickupType =
                pConfig?.type ??
                (typeStr.includes("weapon")
                  ? RaycastPickupType.WEAPON
                  : typeStr.includes("ammo")
                  ? RaycastPickupType.AMMO
                  : RaycastPickupType.HEALTH);

              const weaponConfig = getRaycastWeaponConfig(meta.weaponType || "e_11");
              const weaponEnum: RaycastWeaponType | undefined =
                pickupType === RaycastPickupType.WEAPON
                  ? weaponConfig?.type ?? RaycastWeaponType.E11
                  : undefined;

              this.pickups.push({
                id: this.nextId++,
                x,
                y,
                texture: adjustedTileId,
                type: pickupType,
                weaponType: weaponEnum,
                amount: meta.amount ?? pConfig?.amount ?? 20,
                collected: false,
                scale,
                scaleX,
                scaleY,
                vOffset,
                z,
                anchor,
                config: pConfig,
              });
            } else {
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

            let objScale = layerScale ?? meta.scale ?? 0.25;
            let objScaleX = layerScaleX ?? meta.scaleX ?? objScale;
            let objScaleY = layerScaleY ?? meta.scaleY ?? objScale;
            let objVOffset = layerVOffset ?? meta.vOffset;
            let objZ = layerZ ?? meta.z;
            let objAnchor = layerAnchor ?? meta.anchor ?? "floor";
            let objType = meta.type || tileTypes[gid] || "";
            let objWeaponType = meta.weaponType;
            let objAmount = meta.amount ?? 20;

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
                if (pName === "type") objType = String(pVal);
                if (pName === "weapontype") objWeaponType = String(pVal);
                if (pName === "amount") objAmount = parseInt(pVal, 10);
                if (pName === "object" && typeof pVal === "object" && pVal !== null) {
                  if (pVal.scale !== undefined) objScale = parseFloat(pVal.scale);
                  if (pVal.anchor !== undefined) objAnchor = String(pVal.anchor).toLowerCase();
                }
              });
            }

            if (obj.width && obj.height && objScale === undefined && objScaleY === undefined) {
              objScaleY = obj.height / tileH;
              objScaleX = obj.width / tileW;
            }

            const x = (obj.x + (obj.width || tileW) / 2) / tileW;
            const y = (obj.y - (obj.height || tileH) / 2) / tileH;
            const normalizedType = objType.toLowerCase();

            const isPickup =
              obj.type === "PickupItem" ||
              meta.tileClass === "PickupItem" ||
              normalizedType === "weapon" ||
              normalizedType === "health" ||
              normalizedType === "ammo";

            if (isPickup) {
              const pConfig = getRaycastPickupConfig(normalizedType);
              const pickupType: RaycastPickupType =
                pConfig?.type ??
                (normalizedType.includes("weapon")
                  ? RaycastPickupType.WEAPON
                  : normalizedType.includes("ammo")
                  ? RaycastPickupType.AMMO
                  : RaycastPickupType.HEALTH);

              const weaponConfig = getRaycastWeaponConfig(objWeaponType || "e_11");
              const weaponEnum: RaycastWeaponType | undefined =
                pickupType === RaycastPickupType.WEAPON
                  ? weaponConfig?.type ?? RaycastWeaponType.E11
                  : undefined;

              this.pickups.push({
                id: this.nextId++,
                x,
                y,
                texture: adjustedTileId,
                type: pickupType,
                weaponType: weaponEnum,
                amount: objAmount || pConfig?.amount || 20,
                collected: false,
                scale: objScale,
                scaleX: objScaleX,
                scaleY: objScaleY,
                vOffset: objVOffset,
                z: objZ,
                anchor: objAnchor,
                config: pConfig,
              });
            } else {
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
        });
      }
    }
  }

  public getVisibleMapObjects(): MapObject[] {
    const list: MapObject[] = [];

    // Add uncollected pickups
    for (const pickup of this.pickups) {
      if (!pickup.collected) {
        list.push({
          x: pickup.x,
          y: pickup.y,
          texture: pickup.texture,
          scale: pickup.scale,
          scaleX: pickup.scaleX,
          scaleY: pickup.scaleY,
          vOffset: pickup.vOffset,
          z: pickup.z,
          anchor: pickup.anchor,
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

  public checkPlayerPickups(
    playerX: number,
    playerY: number,
    pickupRadius: number = 0.55
  ): RaycastPickupItem[] {
    const collected: RaycastPickupItem[] = [];

    for (const pickup of this.pickups) {
      if (pickup.collected) continue;

      const dx = pickup.x - playerX;
      const dy = pickup.y - playerY;
      const distSq = dx * dx + dy * dy;

      if (distSq <= pickupRadius * pickupRadius) {
        pickup.collected = true;
        collected.push(pickup);

        // Play appropriate pickup sound from config or default fallback
        try {
          const snd =
            pickup.config?.pickUpSound ??
            (pickup.type === RaycastPickupType.HEALTH
              ? { src: "repair_sound", volume: 1, loop: false }
              : { src: "reload_sound", volume: 1, loop: false });

          sound.play(snd.src, { volume: snd.volume, loop: snd.loop });
        } catch (e) {
          console.warn("Could not play pickup sound:", e);
        }
      }
    }

    return collected;
  }

  public get activePickupsCount(): number {
    return this.pickups.filter((p) => !p.collected).length;
  }

  public dispose(): void {
    this.pickups = [];
    this.staticObjects = [];
  }
}
