import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { HoverController } from '../../src/content/hover-controller';
import { createTooltip } from '../../src/content/tooltip';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  document.documentElement
    .querySelectorAll('[data-context-vocabulary-ui]')
    .forEach((node) => node.remove());
});

describe('HoverController', () => {
  it('looks up after 500ms and auto-saves after another 1000ms', async () => {
    vi.useFakeTimers();
    const lookup = vi.fn().mockResolvedValue({ lookupStatus: 'found' });
    const save = vi.fn().mockResolvedValue(undefined);
    const controller = new HoverController({
      lookup,
      save,
      close: vi.fn(),
    });

    controller.enter({
      word: 'ultimately',
      sentence: 'It was ultimately rejected.',
      wordStart: 7,
      wordEnd: 17,
    });

    await vi.advanceTimersByTimeAsync(499);
    expect(lookup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(lookup).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledOnce();
  });

  it('cancels lookup and save when pointer leaves', async () => {
    vi.useFakeTimers();
    const lookup = vi.fn();
    const save = vi.fn();
    const close = vi.fn();
    const controller = new HoverController({ lookup, save, close });

    controller.enter({
      word: 'cancelled',
      sentence: 'This is cancelled.',
      wordStart: 8,
      wordEnd: 17,
    });
    controller.leave();
    await vi.runAllTimersAsync();

    expect(lookup).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not save dictionary misses', async () => {
    vi.useFakeTimers();
    const lookup = vi.fn().mockResolvedValue({ lookupStatus: 'not_found' });
    const save = vi.fn();
    const controller = new HoverController({
      lookup,
      save,
      close: vi.fn(),
    });

    controller.enter({
      word: 'unlisted',
      sentence: 'This is unlisted.',
      wordStart: 8,
      wordEnd: 16,
    });
    await vi.runAllTimersAsync();

    expect(lookup).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('tooltip', () => {
  it('renders dictionary text without interpreting it as HTML', () => {
    const tooltip = createTooltip();

    tooltip.show({
      lemma: '<img src=x>',
      definitionsZh: ['<script>unsafe()</script>'],
    }, new DOMRect(20, 20, 10, 10));

    const host = document.documentElement.querySelector<HTMLElement>(
      '[data-context-vocabulary-ui]',
    );
    expect(host?.dataset.state).toBe('visible');
    expect(host?.shadowRoot?.querySelector('img')).toBeNull();
    expect(host?.shadowRoot?.querySelector('script')).toBeNull();
    expect(host?.shadowRoot?.textContent).toContain('<img src=x>');
    expect(host?.shadowRoot?.textContent).toContain(
      '<script>unsafe()</script>',
    );
  });

  it('removes the undo action after five seconds', async () => {
    vi.useFakeTimers();
    const undo = vi.fn();
    const tooltip = createTooltip();
    tooltip.show({
      lemma: 'safe',
      definitionsZh: ['安全的'],
    }, new DOMRect(20, 20, 10, 10));
    tooltip.showSaved(undo);

    const host = document.documentElement.querySelector<HTMLElement>(
      '[data-context-vocabulary-ui]',
    );
    const button = host?.shadowRoot?.querySelector('button');
    expect(button).not.toBeNull();
    button?.click();
    expect(undo).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(host?.shadowRoot?.querySelector('button')).toBeNull();
  });
});
