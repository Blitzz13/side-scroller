import { EnemyType } from "./enums/EnemyType";

export function saveScore(key: string,score: Map<EnemyType, number>) {
    const scoreObject = Object.fromEntries(score);
    const scoreJSON = JSON.stringify(scoreObject);
    localStorage.setItem(key, scoreJSON);
}

export function retrieveScore(key: string): Map<EnemyType, number> | null {
    const killsJSON = localStorage.getItem(key);
    if (killsJSON) {
        const killsObject = JSON.parse(killsJSON);
        return new Map(Object.entries(killsObject)) as Map<EnemyType, number>;
    }

    return null;
}
