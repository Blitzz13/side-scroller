export interface RaycastSkyboxConfig {
  texture?: string;
  front?: string;
  back?: string;
  cubeMap?: string | string[]; // Directory path (e.g. "assets/common/hangerCubemap") or 6 face URLs [px, nx, py, ny, pz, nz]
  zoom?: number; // Zoom/FOV factor (1.0 = natural 1:1 camera FOV match, 2.2 = realistic hangar vista)
  yaw?: number; // Horizontal rotation in degrees (0 = North, 90 = East, 180 = South, 270 = West)
  repeatX?: number;
  repeatY?: number;
  centerU?: number; // Horizontal coordinate in image [0, 1] to align with North (default 0.5)
  offsetX?: number;
  offsetY?: number;
  skyboxOnly?: boolean;
}

/**
 * Dedicated Skybox Configuration Registry.
 * Decoupled from Tiled level map files so level geometry exported from Tiled
 * doesn't need to contain rendering/skybox parameters.
 */
export const SKYBOX_CONFIGS: Record<string, RaycastSkyboxConfig | null> = {
  level1: null, // Interior cell block - no skybox
  level2: null, // Imperial facility - no skybox
  level3: {
    cubeMap: "assets/common/hangerCubemap",
    zoom: 1.10,
    yaw: 270.0,
    skyboxOnly: false,
  },
};

/**
 * Resolves the active skybox configuration for a level.
 * Uses SKYBOX_CONFIGS as the primary source of truth, decoupled from Tiled level exports.
 * If custom properties are present in the Tiled map, they can optionally override settings.
 */
export function getSkyboxConfig(
  levelName: string,
  mapProperties?: Array<{ name: string; value: any }>
): RaycastSkyboxConfig | null {
  const cleanName = levelName.replace(/^.*[\\\/]/, "").replace(/\.json$/i, "").toLowerCase();
  const baseCfg: Partial<RaycastSkyboxConfig> = SKYBOX_CONFIGS[cleanName] || SKYBOX_CONFIGS[levelName] || {};

  // 1. Optional overrides from Tiled map custom properties (if defined)
  if (mapProperties && Array.isArray(mapProperties)) {
    const skyboxProp = mapProperties.find(
      (p) => p.name.toLowerCase() === "skybox" || p.name.toLowerCase() === "sky"
    );
    const cubeMapProp = mapProperties.find(
      (p) => p.name.toLowerCase() === "cubemap" || p.name.toLowerCase() === "cube_map" || p.name.toLowerCase() === "skyboxcubemap"
    );
    const frontProp = mapProperties.find(
      (p) => p.name.toLowerCase() === "skyboxfront" || p.name.toLowerCase() === "skybox_front"
    );
    const backProp = mapProperties.find(
      (p) => p.name.toLowerCase() === "skyboxback" || p.name.toLowerCase() === "skybox_back"
    );

    if (skyboxProp || cubeMapProp || (frontProp && backProp)) {
      const val = skyboxProp?.value;
      if (val === "none" || val === "null" || val === "false") {
        return null;
      }
      const cubeVal = cubeMapProp ? String(cubeMapProp.value) : undefined;
      const isCubemap =
        Boolean(cubeVal) ||
        (typeof val === "string" && val.toLowerCase().includes("cubemap"));

      const resolvedCubeMap = cubeVal || (isCubemap ? String(val) : baseCfg.cubeMap);
      const zoomProp = mapProperties.find(
        (p) => p.name.toLowerCase() === "skyboxzoom" || p.name.toLowerCase() === "skybox_zoom"
      );
      const yawProp = mapProperties.find(
        (p) => p.name.toLowerCase() === "skyboxyaw" || p.name.toLowerCase() === "skybox_yaw" || p.name.toLowerCase() === "yaw"
      );
      const repeatXProp = mapProperties.find(
        (p) => p.name.toLowerCase() === "skyboxrepeatx" || p.name.toLowerCase() === "skybox_repeat_x"
      );
      const repeatYProp = mapProperties.find(
        (p) => p.name.toLowerCase() === "skyboxrepeaty" || p.name.toLowerCase() === "skybox_repeat_y"
      );
      const centerUProp = mapProperties.find(
        (p) => p.name.toLowerCase() === "skyboxcenteru" || p.name.toLowerCase() === "skybox_center_u"
      );
      const offsetXProp = mapProperties.find(
        (p) => p.name.toLowerCase() === "skyboxoffsetx" || p.name.toLowerCase() === "skybox_offset_x"
      );
      const offsetYProp = mapProperties.find(
        (p) => p.name.toLowerCase() === "skyboxoffsety" || p.name.toLowerCase() === "skybox_offset_y"
      );
      const skyboxOnlyProp = mapProperties.find(
        (p) => p.name.toLowerCase() === "skyboxonly" || p.name.toLowerCase() === "skybox_only"
      );

      return {
        texture: isCubemap ? undefined : (val ? String(val) : baseCfg.texture),
        cubeMap: resolvedCubeMap,
        front: frontProp ? String(frontProp.value) : baseCfg.front,
        back: backProp ? String(backProp.value) : baseCfg.back,
        zoom: zoomProp ? parseFloat(zoomProp.value) : (baseCfg.zoom ?? 2.2),
        yaw: yawProp ? parseFloat(yawProp.value) : (baseCfg.yaw ?? 270.0),
        repeatX: repeatXProp ? parseFloat(repeatXProp.value) : (baseCfg.repeatX ?? 1.0),
        repeatY: repeatYProp ? parseFloat(repeatYProp.value) : (baseCfg.repeatY ?? 1.0),
        centerU: centerUProp ? parseFloat(centerUProp.value) : (baseCfg.centerU ?? 0.5),
        offsetX: offsetXProp ? parseFloat(offsetXProp.value) : (baseCfg.offsetX ?? 0.0),
        offsetY: offsetYProp ? parseFloat(offsetYProp.value) : (baseCfg.offsetY ?? 0.0),
        skyboxOnly: skyboxOnlyProp ? Boolean(skyboxOnlyProp.value) : (baseCfg.skyboxOnly ?? false),
      };
    }
  }

  // 2. Return code registry config if configured
  if (baseCfg && (baseCfg.cubeMap || baseCfg.texture || (baseCfg.front && baseCfg.back))) {
    return {
      zoom: 2.2,
      yaw: 270.0,
      repeatX: 1.0,
      repeatY: 1.0,
      centerU: 0.5,
      offsetX: 0.0,
      offsetY: 0.0,
      skyboxOnly: false,
      ...baseCfg,
    };
  }

  return null;
}
