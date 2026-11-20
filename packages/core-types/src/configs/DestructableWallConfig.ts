export interface IDestructibleWallExplosionConfig {
  /** Number of scaled down explosions to play in sequence */
  count: number;
  /** Delay in milliseconds between each explosion starting */
  intervalMs: number;
  /** Scale factor for the explosion sprite (e.g. 0.42 compared to normal 0.85) */
  scale: number;
  /** Spatial random jitter spread in X (world units) */
  spreadX: number;
  /** Spatial random jitter spread in Y (world units) */
  spreadY: number;
  /** Spatial random jitter spread in Z (vertical world units) */
  spreadZ: number;
  /** Audio volume for each explosion sound burst */
  soundVolume: number;
}

export interface IDestructibleWallConfig {
  /** Health points of the destructible wall (e.g. 50 = 2 blaster shots) */
  health: number;
  /** Explosion sequence settings */
  explosion: IDestructibleWallExplosionConfig;
}

export const defaultDestructibleWallConfig: IDestructibleWallConfig = {
  health: 50,
  explosion: {
    count: 4,
    intervalMs: 110,
    scale: 0.42,
    spreadX: 0.28,
    spreadY: 0.28,
    spreadZ: 0.18,
    soundVolume: 0.38,
  },
};
