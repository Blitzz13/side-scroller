import { Container } from "pixi.js";

export interface IEntity{
    dispose(force?: boolean): void;
}