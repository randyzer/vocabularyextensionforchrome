import {
  AUTO_SAVE_DELAY_MS,
  HOVER_DELAY_MS,
} from '../shared/constants';
import type { SentenceTarget } from './text-segmentation';

interface HoverDependencies {
  lookup(
    target: SentenceTarget,
  ): Promise<{ lookupStatus: 'found' | 'not_found' }>;
  save(target: SentenceTarget): Promise<unknown>;
  close(): void;
}

export class HoverController {
  private lookupTimer?: number;
  private saveTimer?: number;
  private generation = 0;

  constructor(private readonly dependencies: HoverDependencies) {}

  enter(target: SentenceTarget): void {
    this.cancelTimers();
    const generation = ++this.generation;

    this.lookupTimer = window.setTimeout(async () => {
      const result = await this.dependencies.lookup(target);

      if (
        generation !== this.generation
        || result.lookupStatus !== 'found'
      ) {
        return;
      }

      this.saveTimer = window.setTimeout(() => {
        if (generation === this.generation) {
          void this.dependencies.save(target);
        }
      }, AUTO_SAVE_DELAY_MS);
    }, HOVER_DELAY_MS);
  }

  leave(): void {
    this.generation += 1;
    this.cancelTimers();
    this.dependencies.close();
  }

  destroy(): void {
    this.leave();
  }

  private cancelTimers(): void {
    if (this.lookupTimer !== undefined) {
      window.clearTimeout(this.lookupTimer);
    }
    if (this.saveTimer !== undefined) {
      window.clearTimeout(this.saveTimer);
    }
    this.lookupTimer = undefined;
    this.saveTimer = undefined;
  }
}
