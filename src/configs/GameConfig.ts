import { AssetsManifest, BitmapFont, RoundedRectangle } from "pixi.js";

export const gameConfig = {
  width: 1280,
  height: 720
}

export function registerFonts(): void {
  BitmapFont.from("arial32", {
    fontFamily: "Arial",
    fontSize: 32,
    lineHeight: 33,
    fill: 0xffffff,
  },{
    chars: BitmapFont.ASCII,
  });
}

export const manifest: AssetsManifest = {
    bundles: [
      {
        name: "sounds",
        assets: [
          {
            alias: "menu_theme",
            src: "./assets/sounds/menu_theme.mp3"
          },
          {
            alias: "repair_sound",
            src: "./assets/sounds/repair_sound.mp3"
          },
          {
            alias: "reload_sound",
            src: "./assets/sounds/reload_sound.mp3"
          },
          {
            alias: "battle_theme",
            src: "./assets/sounds/battle_theme.mp3"
          },
          {
            alias: "bomb_sound",
            src: "./assets/sounds/bomb_sound.mp3"
          },
          {
            alias: "explosion_sound",
            src: "./assets/sounds/explosion_sound.mp3"
          },
          {
            alias: "engine_loop",
            src: "./assets/sounds/flying_loop.mp3"
          },
          {
            alias: "end_theme",
            src: "./assets/sounds/end_theme.mp3"
          },
          {
            alias: "blaster_1",
            src: "./assets/sounds/blaster_1.mp3"
          },
          {
            alias: "blaster_2",
            src: "./assets/sounds/blaster_2.mp3"
          },
          {
            alias: "blaster_3",
            src: "./assets/sounds/blaster_3.mp3"
          },
          {
            alias: "blaster_4",
            src: "./assets/sounds/blaster_4.mp3"
          },
        ]
      },
      {
        name: "environment",
        assets: [
          {
            name: "outdoors_area",
            src: "./assets/outdoors_area.jpg",
          },
          {
            name: "menu_background",
            src: "./assets/menu_background.png",
          }
        ],
      },
      {
        name: "characters",
        assets: [
          {
            name: "x_wing",
            src: "./assets/x_wing.png",
          },
          {
            name: "y_wing",
            src: "./assets/y_wing.png",
          },
          {
            name: "laser",
            src: "./assets/laser.png",
          },
          {
            name: "at_st",
            src: "./assets/at_st.json",
          },
          {
            name: "at_at",
            src: "./assets/at_at.json",
          },
          {
            name: "viper_droid",
            src: "./assets/viper_droid.json",
          }
        ],
      },
      {
        name: "objects",
        assets: [
          {
            name: "bullet",
            src: "./assets/bullet.png",
          },
          {
            name: "green_ball",
            src: "./assets/green_ball.png",
          },
          {
            name: "ammo",
            src: "./assets/ammo.png",
          },
          {
            name: "health",
            src: "./assets/health.png",
          },
          {
            name: "explosion",
            src: "./assets/explosion.json"
          }
        ],
      },
    ],
  };

  export const defaultButtonSize = new RoundedRectangle(0, 0, 210, 55, 15);
