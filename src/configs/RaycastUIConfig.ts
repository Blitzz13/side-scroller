import { SettingsManager } from "../managers/SettingsManager";
import { IRaycastUIConfig, selectRaycastUIConfig } from "@game/core-types";

export type { IRaycastUIConfig } from "@game/core-types";
export { DESKTOP_RAYCAST_UI_CONFIG, MOBILE_RAYCAST_UI_CONFIG } from "@game/core-types";

export function getRaycastUIConfig(
  isMobile: boolean = SettingsManager.isMobileDevice()
): IRaycastUIConfig {
  return selectRaycastUIConfig(isMobile);
}
