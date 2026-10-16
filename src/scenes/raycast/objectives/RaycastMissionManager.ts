import { Container } from "pixi.js";
import { IMissionManagerCallbacks } from "./ObjectiveTypes";
import { RaycastObjectiveManager } from "./RaycastObjectiveManager";
import { RaycastTriggerManager } from "./RaycastTriggerManager";
import { ObjectivesUI } from "./ObjectivesUI";

export class RaycastMissionManager {
  private objectiveManager: RaycastObjectiveManager;
  private triggerManager: RaycastTriggerManager;
  private ui: ObjectivesUI;

  constructor(callbacks: IMissionManagerCallbacks = {}) {
    this.objectiveManager = new RaycastObjectiveManager(callbacks);
    this.triggerManager = new RaycastTriggerManager(this.objectiveManager, callbacks);
    this.ui = new ObjectivesUI(this.objectiveManager);
  }

  public async init(
    mapData: any,
    levelName: string,
    offsetX: number = 0,
    offsetY: number = 0
  ): Promise<void> {
    await this.objectiveManager.loadObjectives(levelName);
    this.triggerManager.parseMapTriggers(mapData, levelName, offsetX, offsetY);
  }

  public getActivePrompt(): string | null {
    return this.triggerManager.getActivePromptText();
  }

  public areAllObjectivesCompleted(): boolean {
    return this.objectiveManager.areAllObjectivesCompleted();
  }

  public canExitLevel(): boolean {
    return this.objectiveManager.canExitLevel();
  }

  public completeRemainingObjectives(): void {
    this.objectiveManager.completeRemainingObjectives();
  }

  public hasObjectives(): boolean {
    return this.objectiveManager.hasObjectives();
  }

  public update(playerX: number, playerY: number): void {
    this.triggerManager.update(playerX, playerY);
  }

  public handleInteract(): boolean {
    return this.triggerManager.handleInteract();
  }

  public completeObjective(key: string): boolean {
    return this.objectiveManager.completeObjective(key);
  }

  public toggleObjectives(): void {
    this.ui.toggle();
  }

  public showObjectives(): void {
    this.ui.show();
  }

  public hideObjectives(): void {
    this.ui.hide();
  }

  public get isObjectivesOpen(): boolean {
    return this.ui.isVisibleOpen;
  }

  public getUIContainer(): Container {
    return this.ui;
  }

  public getObjectiveManager(): RaycastObjectiveManager {
    return this.objectiveManager;
  }

  public getTriggerManager(): RaycastTriggerManager {
    return this.triggerManager;
  }

  public destroy(): void {
    this.triggerManager.dispose();
    this.ui.destroy({ children: true });
  }
}
