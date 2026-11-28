import type { StudioProject, StudioScene } from '../types/studio';
import { containsRuntimeResources } from './sceneEngine';

export interface CompositionSnapshot {
  scenes: StudioScene[];
  activeSceneId: string;
}

export interface CompositionHistoryEntry {
  before: CompositionSnapshot;
  after: CompositionSnapshot;
  label: string;
  groupKey?: string;
  timestamp: number;
}

export interface CompositionHistoryStatus {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  undoCount: number;
  redoCount: number;
}

export function cloneCompositionSnapshot(
  source: Pick<StudioProject, 'scenes' | 'activeSceneId'> | CompositionSnapshot
): CompositionSnapshot {
  if (containsRuntimeResources(source.scenes)) {
    throw new Error(
      'El historial de composición solo admite datos serializables de escena sin recursos multimedia vivos.'
    );
  }
  const clonedScenes =
    typeof globalThis.structuredClone === 'function'
      ? globalThis.structuredClone(source.scenes)
      : (JSON.parse(JSON.stringify(source.scenes)) as StudioScene[]);
  return {
    scenes: clonedScenes,
    activeSceneId: source.activeSceneId,
  };
}

function snapshotsEqual(a: CompositionSnapshot, b: CompositionSnapshot): boolean {
  if (a.activeSceneId !== b.activeSceneId) return false;
  if (a.scenes.length !== b.scenes.length) return false;
  return JSON.stringify(a.scenes) === JSON.stringify(b.scenes);
}

export class CompositionHistory {
  private readonly maxEntries: number;
  private readonly coalesceWindowMs: number;
  private undoStack: CompositionHistoryEntry[] = [];
  private redoStack: CompositionHistoryEntry[] = [];
  private activeGesture: { before: CompositionSnapshot; label: string } | null = null;

  constructor(options?: { maxEntries?: number; coalesceWindowMs?: number }) {
    this.maxEntries = Math.max(5, options?.maxEntries ?? 40);
    this.coalesceWindowMs = Math.max(0, options?.coalesceWindowMs ?? 900);
  }

  beginGesture(
    before: Pick<StudioProject, 'scenes' | 'activeSceneId'> | CompositionSnapshot,
    label: string
  ): void {
    if (this.activeGesture) return;
    this.activeGesture = {
      before: cloneCompositionSnapshot(before),
      label,
    };
  }

  hasActiveGesture(): boolean {
    return this.activeGesture !== null;
  }

  commitGesture(
    after: Pick<StudioProject, 'scenes' | 'activeSceneId'> | CompositionSnapshot,
    label?: string,
    now = Date.now()
  ): boolean {
    if (!this.activeGesture) return false;
    const gesture = this.activeGesture;
    this.activeGesture = null;

    const afterSnap = cloneCompositionSnapshot(after);
    if (snapshotsEqual(gesture.before, afterSnap)) {
      return false;
    }

    this.pushEntry({
      before: gesture.before,
      after: afterSnap,
      label: label ?? gesture.label,
      timestamp: now,
    });
    return true;
  }

  cancelGesture(): void {
    this.activeGesture = null;
  }

  recordChange(
    before: Pick<StudioProject, 'scenes' | 'activeSceneId'> | CompositionSnapshot,
    after: Pick<StudioProject, 'scenes' | 'activeSceneId'> | CompositionSnapshot,
    options: { label: string; groupKey?: string; now?: number }
  ): boolean {
    if (this.activeGesture) {
      return false;
    }

    const beforeSnap = cloneCompositionSnapshot(before);
    const afterSnap = cloneCompositionSnapshot(after);
    if (snapshotsEqual(beforeSnap, afterSnap)) {
      return false;
    }

    const timestamp = options.now ?? Date.now();
    const top = this.undoStack[this.undoStack.length - 1];
    if (
      options.groupKey &&
      top &&
      top.groupKey === options.groupKey &&
      timestamp - top.timestamp <= this.coalesceWindowMs
    ) {
      top.after = afterSnap;
      top.timestamp = timestamp;
      top.label = options.label;
      this.redoStack = [];
      return true;
    }

    this.pushEntry({
      before: beforeSnap,
      after: afterSnap,
      label: options.label,
      groupKey: options.groupKey,
      timestamp,
    });
    return true;
  }

  undo(): { snapshot: CompositionSnapshot; label: string } | null {
    this.activeGesture = null;
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push(entry);
    return {
      snapshot: cloneCompositionSnapshot(entry.before),
      label: entry.label,
    };
  }

  redo(): { snapshot: CompositionSnapshot; label: string } | null {
    this.activeGesture = null;
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push(entry);
    return {
      snapshot: cloneCompositionSnapshot(entry.after),
      label: entry.label,
    };
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getStatus(): CompositionHistoryStatus {
    const topUndo = this.undoStack[this.undoStack.length - 1];
    const topRedo = this.redoStack[this.redoStack.length - 1];
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoLabel: topUndo?.label ?? null,
      redoLabel: topRedo?.label ?? null,
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
    };
  }

  clear(): void {
    this.activeGesture = null;
    this.undoStack = [];
    this.redoStack = [];
  }

  private pushEntry(entry: CompositionHistoryEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxEntries) {
      this.undoStack.splice(0, this.undoStack.length - this.maxEntries);
    }
    this.redoStack = [];
  }
}
