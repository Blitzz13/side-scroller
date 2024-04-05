import { AssetsManifest, BitmapFont } from "pixi.js";

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
    });
  }

export const manifest: AssetsManifest = {
    bundles: [
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
          }
        ],
      },
    ],
  };
