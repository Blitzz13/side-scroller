export {
  RaycastSkyboxConfig,
  SKYBOX_CONFIGS,
  getSkyboxConfig,
  getSkyboxConfig as getSkyboxConfigForLevel,
} from "./SkyboxConfig";

export interface RaycastLevelConfig {
  name: string;
}

export const RAYCAST_LEVEL_CONFIGS: Record<string, RaycastLevelConfig> = {
  level1: { name: "Level 1" },
  level2: { name: "Level 2" },
  level3: { name: "Level 3 - Imperial Hangar" },
};
