import type { Phase } from "../types";

function safeSequence(phase: Phase) {
  return typeof phase.sortOrder === "number" && Number.isFinite(phase.sortOrder) ? phase.sortOrder : null;
}

export function sortPhases(phases: Phase[]) {
  return [...phases].sort((left, right) => {
    const leftSequence = safeSequence(left);
    const rightSequence = safeSequence(right);

    if (leftSequence !== null && rightSequence !== null && leftSequence !== rightSequence) {
      return leftSequence - rightSequence;
    }

    if (leftSequence !== null && rightSequence === null) {
      return -1;
    }

    if (leftSequence === null && rightSequence !== null) {
      return 1;
    }

    const startCompare = left.startDate.localeCompare(right.startDate);
    if (startCompare !== 0) {
      return startCompare;
    }

    const endCompare = left.endDate.localeCompare(right.endDate);
    if (endCompare !== 0) {
      return endCompare;
    }

    return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
  });
}

export function getPhaseSequenceLabel(phases: Phase[], phaseId: string) {
  const sorted = sortPhases(phases);
  const index = sorted.findIndex((phase) => phase.id === phaseId);

  if (index < 0) {
    return "Unassigned";
  }

  return `${index + 1}. ${sorted[index].name}`;
}

export function normalizePhaseSortOrder(phases: Phase[]) {
  return sortPhases(phases).map((phase, index) => ({
    ...phase,
    sortOrder: safeSequence(phase) ?? index + 1
  }));
}
