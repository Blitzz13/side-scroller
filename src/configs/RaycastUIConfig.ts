import { SettingsManager } from "../managers/SettingsManager";

export interface IRaycastUIConfig {
  loading: {
    barWidth: number;
    barHeight: number;
    barRadius: number;
    barCenterOffsetY: number;
    titleFontSize: number;
    titleOffsetY: number;
    titleLetterSpacing: number;
    statusFontSize: number;
    statusOffsetY: number;
    statusLetterSpacing: number;
  };
  subtitles: {
    speakerFontSize: number;
    speakerLetterSpacing: number;
    bodyFontSize: number;
    maxWidthRatio: number;
    maxWidthCap: number;
    bottomOffset: number;
    paddingX: number;
    paddingY: number;
    speakerBodyGap: number;
    cornerRadius: number;
  };
  hud: {
    keycardBoxX: number;
    keycardBoxY: number;
    keycardBoxHeight: number;
    keycardBoxMinWidth: number;
    keycardBoxPaddingRight: number;
    keycardLabelFontSize: number;
    keycardLabelX: number;
    keycardLabelY: number;
    keycardLabelLetterSpacing: number;
    keycardIconScale: number;
    keycardIconStartX: number;
    keycardIconY: number;
    keycardIconSpacing: number;
    promptFontSize: number;
    promptOffsetY: number;
    promptPadX: number;
    promptPadY: number;
    toastFontSize: number;
    toastY: number;
    toastPadX: number;
    toastPadY: number;
    healthFontSize: number;
    shieldFontSize: number;
    weaponNameFontSize: number;
    ammoFontSize: number;
    ammoDetonatorFontSize: number;
    switchHintFontSize: number;
    sprintFontSize: number;
  };
  objectives: {
    panelMaxWidth: number;
    panelMaxHeight: number;
    fontFamily: string;
    maxTextDpr: number;
    linearTextScaling: boolean;
    headerFontSize: number;
    titleActiveFontSize: number;
    titleCompletedFontSize: number;
    descriptionFontSize: number;
    descriptionLineHeight: number;
    descriptionColor: number;
    descriptionDropShadow: boolean;
    tagFontSize: number;
    footerFontSize: number;
    emptyFontSize: number;
    allDoneFontSize: number;
    closeButtonRadius: number;
    closeButtonFontSize: number;
    closeButtonOffsetX: number;
    closeButtonOffsetY: number;
  };
  minimap: {
    titleFontSize: number;
    headerInfoFontSize: number;
    legendFontSize: number;
  };
}

export const DESKTOP_RAYCAST_UI_CONFIG: IRaycastUIConfig = {
  loading: {
    barWidth: 360,
    barHeight: 18,
    barRadius: 9,
    barCenterOffsetY: 30,
    titleFontSize: 22,
    titleOffsetY: 50,
    titleLetterSpacing: 4,
    statusFontSize: 14,
    statusOffsetY: 14,
    statusLetterSpacing: 1,
  },
  subtitles: {
    speakerFontSize: 13,
    speakerLetterSpacing: 2,
    bodyFontSize: 18,
    maxWidthRatio: 0.7,
    maxWidthCap: 820,
    bottomOffset: 70,
    paddingX: 18,
    paddingY: 10,
    speakerBodyGap: 4,
    cornerRadius: 8,
  },
  hud: {
    keycardBoxX: 24,
    keycardBoxY: 24,
    keycardBoxHeight: 26,
    keycardBoxMinWidth: 70,
    keycardBoxPaddingRight: 6,
    keycardLabelFontSize: 11,
    keycardLabelX: 8,
    keycardLabelY: 6,
    keycardLabelLetterSpacing: 1,
    keycardIconScale: 0.6,
    keycardIconStartX: 48,
    keycardIconY: 4,
    keycardIconSpacing: 20,
    promptFontSize: 14,
    promptOffsetY: 70,
    promptPadX: 18,
    promptPadY: 7,
    toastFontSize: 18,
    toastY: 45,
    toastPadX: 20,
    toastPadY: 8,
    healthFontSize: 14,
    shieldFontSize: 14,
    weaponNameFontSize: 14,
    ammoFontSize: 20,
    ammoDetonatorFontSize: 16,
    switchHintFontSize: 10,
    sprintFontSize: 11,
  },
  objectives: {
    panelMaxWidth: 680,
    panelMaxHeight: 480,
    fontFamily: "Arial, sans-serif",
    maxTextDpr: 3,
    linearTextScaling: false,
    headerFontSize: 18,
    titleActiveFontSize: 16,
    titleCompletedFontSize: 14,
    descriptionFontSize: 12.5,
    descriptionLineHeight: 16,
    descriptionColor: 0xbbddee,
    descriptionDropShadow: false,
    tagFontSize: 11,
    footerFontSize: 12,
    emptyFontSize: 15,
    allDoneFontSize: 13,
    closeButtonRadius: 14,
    closeButtonFontSize: 13,
    closeButtonOffsetX: 22,
    closeButtonOffsetY: 20,
  },
  minimap: {
    titleFontSize: 15,
    headerInfoFontSize: 11,
    legendFontSize: 10,
  },
};

export const MOBILE_RAYCAST_UI_CONFIG: IRaycastUIConfig = {
  loading: {
    barWidth: 460,
    barHeight: 24,
    barRadius: 12,
    barCenterOffsetY: 30,
    titleFontSize: 30,
    titleOffsetY: 58,
    titleLetterSpacing: 4,
    statusFontSize: 22,
    statusOffsetY: 20,
    statusLetterSpacing: 1,
  },
  subtitles: {
    speakerFontSize: 18,
    speakerLetterSpacing: 2,
    bodyFontSize: 25,
    maxWidthRatio: 0.56,
    maxWidthCap: 680,
    bottomOffset: 56,
    paddingX: 22,
    paddingY: 12,
    speakerBodyGap: 6,
    cornerRadius: 10,
  },
  hud: {
    keycardBoxX: 24,
    keycardBoxY: 24,
    keycardBoxHeight: 42,
    keycardBoxMinWidth: 118,
    keycardBoxPaddingRight: 10,
    keycardLabelFontSize: 18,
    keycardLabelX: 12,
    keycardLabelY: 10,
    keycardLabelLetterSpacing: 1.5,
    keycardIconScale: 1.0,
    keycardIconStartX: 78,
    keycardIconY: 7,
    keycardIconSpacing: 32,
    promptFontSize: 20,
    promptOffsetY: 82,
    promptPadX: 24,
    promptPadY: 10,
    toastFontSize: 22,
    toastY: 48,
    toastPadX: 24,
    toastPadY: 10,
    healthFontSize: 16,
    shieldFontSize: 16,
    weaponNameFontSize: 16,
    ammoFontSize: 22,
    ammoDetonatorFontSize: 18,
    switchHintFontSize: 12,
    sprintFontSize: 14,
  },
  objectives: {
    panelMaxWidth: 960,
    panelMaxHeight: 580,
    fontFamily: "Segoe UI, Arial, sans-serif",
    maxTextDpr: 2,
    linearTextScaling: true,
    headerFontSize: 26,
    titleActiveFontSize: 22,
    titleCompletedFontSize: 19,
    descriptionFontSize: 19,
    descriptionLineHeight: 24,
    descriptionColor: 0xdceeff,
    descriptionDropShadow: true,
    tagFontSize: 15,
    footerFontSize: 16,
    emptyFontSize: 22,
    allDoneFontSize: 18,
    closeButtonRadius: 22,
    closeButtonFontSize: 20,
    closeButtonOffsetX: 32,
    closeButtonOffsetY: 32,
  },
  minimap: {
    titleFontSize: 17,
    headerInfoFontSize: 13,
    legendFontSize: 12,
  },
};

export function getRaycastUIConfig(
  isMobile: boolean = SettingsManager.isMobileDevice()
): IRaycastUIConfig {
  return isMobile ? MOBILE_RAYCAST_UI_CONFIG : DESKTOP_RAYCAST_UI_CONFIG;
}
