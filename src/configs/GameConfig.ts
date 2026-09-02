import { AssetsManifest, BitmapFont, RoundedRectangle } from "pixi.js";

export const gameConfig = {
  width: 1280,
  height: 720
}

export function registerFonts(): void {
  const dpr = Math.max(2, Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 3));
  BitmapFont.from(
    "arial32",
    {
      fontFamily: "Arial",
      fontSize: 32,
      lineHeight: 33,
      fill: 0xffffff,
    },
    {
      chars: BitmapFont.ASCII,
      resolution: dpr,
      textureWidth: 1024,
      textureHeight: 1024,
    }
  );
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
          {
            alias: "e_11_blaster",
            src: "./assets/sounds/e_11_blaster.mp3"
          },
          {
            alias: "dh_17_blaster",
            src: "./assets/sounds/dh_17_blaster.mp3"
          },
          {
            alias: "door_1",
            src: "./assets/sounds/door_1.mp3"
          },
          {
            alias: "stormtrooper_pain_1",
            src: "./assets/stormtrooper_pain_1.mp3"
          },
          {
            alias: "stormtrooper_death_1",
            src: "./assets/stormtrooper_death_1.mp3"
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
          },
          {
            name: "imperial_grilled_wall",
            src: "./assets/imperial_grilled_wall.jpg",
          },
          {
            name: "basic_imperial_wall",
            src: "./assets/basic_imperial_wall.jpg",
          },
          {
            name: "inside_floor",
            src: "./assets/inside_floor.jpg",
          },
          {
            name: "metal_door",
            src: "./assets/metal_door.jpg",
          },
          {
            name: "fence",
            src: "./assets/fence.png",
          },
          {
            name: "floor",
            src: "./assets/floor.png",
          },
          {
            name: "ceiling_1",
            src: "./assets/ceiling_1.jpg",
          },
          {
            name: "ceiling_2",
            src: "./assets/ceiling_2.jpg",
          },
          {
            name: "ceiling_3",
            src: "./assets/ceiling_3.jpg",
          },
          {
            name: "level2",
            src: "./assets/raycast/levels/test_level.json",
          },
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
          },
          {
            name: "storm_trooper",
            src: "./assets/raycast/enemies/storm_trooper.json",
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
            name: "e_11_item",
            src: "./assets/raycast/pickups/e_11_item.png",
          },
          {
            name: "e_11_equiped",
            src: "./assets/raycast/weapons/e_11_equiped.png",
          },
          {
            name: "chair",
            src: "./assets/chair.png",
          },
          {
            name: "chair_broken",
            src: "./assets/chair_broken.png",
          },
          {
            name: "table",
            src: "./assets/table.png",
          },
          {
            name: "table_broken",
            src: "./assets/table_broken.png",
          },
          {
            name: "keycards",
            src: "./assets/keycards.json",
          },
          {
            name: "explosion",
            src: "./assets/explosion.json"
          },
          {
            name: "thermal_detonator",
            src: "./assets/raycast/weapons/thermal_detonator.png"
          },
          {
            name: "thermal_detonator_belt",
            src: "./assets/raycast/pickups/thermal_detonator_belt.png"
          },
          {
            name: "thermal_detonator_pickup",
            src: "./assets/raycast/pickups/thermal_detonator_pickup.png"
          },
          {
            name: "dh_17",
            src: "./assets/raycast/weapons/dh_17.png"
          }
        ],
      },
    ],
  };

  export const defaultButtonSize = new RoundedRectangle(0, 0, 210, 55, 15);
