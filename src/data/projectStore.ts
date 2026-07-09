import { initialProjectState } from "./projectMockData";
import type { ProjectState } from "../types";

const storageKey = "accelprojects.projectState.v1";

export function loadProjectState(): ProjectState {
  try {
    const storedState = window.localStorage.getItem(storageKey);

    if (!storedState) {
      return initialProjectState;
    }

    return {
      ...initialProjectState,
      ...JSON.parse(storedState)
    };
  } catch {
    return initialProjectState;
  }
}

export function saveProjectState(state: ProjectState) {
  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

export function resetProjectState() {
  window.localStorage.removeItem(storageKey);
  return initialProjectState;
}
