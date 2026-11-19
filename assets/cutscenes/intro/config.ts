export interface IStarWarsIntroConfig {
  /** Relative asset path to the audio mp3 */
  audioFile: string;
  /** Relative asset path to the intro text json */
  jsonFile: string;
  /** Relative asset path to the starry background image */
  backgroundImage: string;
  /** Target scene to load after intro finishes (Cutscene) */
  targetScene: string;
  /** Name of the level to pass along to subsequent scenes */
  targetLevel: string;
  /** Second into the intro when audio starts playing (0 = immediately on scene load) */
  audioStartTime: number;
  /** Duration of the blue "A long time ago..." card in seconds (0 = skip card) */
  blueCardDuration: number;
  /** Color of the blue prologue card text (hex number) */
  blueCardColor: number;
  /** Duration of the receding title logo animation in seconds */
  logoDuration: number;
  /** Seconds after logo appears when the 3D crawl text starts emerging (e.g. 4.8) */
  crawlStartDelay: number;
  /** Crawl scroll speed multiplier */
  crawlSpeed: number;
  /** Crawl text yellow color (hex string or CSS color) */
  crawlColor: string;
  /** Optional episode header (e.g. "PART I", or empty "" to omit) */
  episodeHeader: string;
  /** Episode title header color */
  episodeHeaderColor: string;
  /** Font size for crawl body */
  crawlFontSize: number;
  /** Line spacing */
  crawlLineHeight: number;
  /** Vanishing horizon Y normalized coordinate (0.0 = top, 1.0 = bottom) */
  horizonY: number;
  /** Horizontal trapezoid perspective taper convergence factor */
  taper: number;
  /** 3D Perspective tilt / vertical depth compression factor */
  perspectiveK: number;
  /** Distance fog fade height near horizon */
  topFade: number;
  /** Bottom screen entry fade height */
  bottomFade: number;
  /** Song playback time in seconds when camera starts slowly rotating/tilting down (1:16 = 76.0) */
  cameraPanDownStartTime: number;
  /** Song playback time in seconds when screen begins fading to black (1:22 = 82.0) */
  fadeToBlackStartTime: number;
  /** Camera tilt/pan down speed in pixels per second */
  panDownSpeed: number;
  /** Total song duration in seconds before completing scene */
  songDuration: number;
  /** Skip button text */
  skipText: string;
}

export const introConfig: IStarWarsIntroConfig = {
  audioFile: "assets/cutscenes/intro/intro_theme.mp3",
  jsonFile: "assets/cutscenes/intro/intro.json",
  backgroundImage: "assets/cutscenes/intro/star_background.jpg",
  targetScene: "Cutscene",
  targetLevel: "level1",
  audioStartTime: 2,
  blueCardDuration: 4,
  blueCardColor: 0x4bd5ee,
  logoDuration: 18,
  crawlStartDelay: 6.8,
  crawlSpeed: 0.010,
  crawlColor: "#FFE81F",
  episodeHeader: "PART I",
  episodeHeaderColor: "#FFE81F",
  crawlFontSize: 34,
  crawlLineHeight: 50,
  horizonY: 0.18,
  taper: 1.15,
  perspectiveK: 0.22,
  topFade: 0.18,
  bottomFade: 0.08,
  cameraPanDownStartTime: 76.0,
  fadeToBlackStartTime: 82.0,
  panDownSpeed: 24.0,
  songDuration: 89.36,
  skipText: "SKIP [ESC]",
};

export default introConfig;
