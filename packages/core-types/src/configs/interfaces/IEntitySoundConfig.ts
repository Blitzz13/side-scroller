import { ISoundConfig } from "./ISoundConfig";

export interface IEntitySoundConfig {
    deathSound: ISoundConfig,
    shootSounds?: ISoundConfig[],
    idleSound?: ISoundConfig,
}