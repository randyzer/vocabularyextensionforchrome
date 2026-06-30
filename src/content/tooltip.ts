import { UNDO_WINDOW_MS } from '../shared/constants';
import type { DictionaryEntry } from '../shared/models';

export interface TooltipHandle {
  show(entry: DictionaryEntry, rect: DOMRect): void;
  showSaved(onUndo: () => void): void;
  showError(message: string): void;
  hide(): void;
  destroy(): void;
}

export function createTooltip(): TooltipHandle {
  const host = document.createElement('div');
  host.dataset.contextVocabularyUi = 'true';
  host.dataset.state = 'hidden';

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .card {
      position: fixed;
      z-index: 2147483647;
      width: 280px;
      padding: 12px;
      border: 1px solid #d7d2c8;
      border-radius: 10px;
      background: #fffdf8;
      color: #201f1c;
      box-shadow: 0 8px 24px rgb(0 0 0 / 16%);
      font: 14px/1.45 system-ui, sans-serif;
    }
    h2 { margin: 0 0 6px; font-size: 18px; }
    ol { margin: 6px 0; padding-left: 20px; }
    button { font: inherit; }
    [hidden] { display: none; }
  `;

  const card = document.createElement('section');
  card.className = 'card';
  card.hidden = true;
  shadow.append(style, card);
  document.documentElement.append(host);

  function position(rect: DOMRect): void {
    const top = rect.bottom + 228 < window.innerHeight
      ? rect.bottom + 8
      : Math.max(8, rect.top - 180);
    const left = Math.min(
      Math.max(8, rect.left),
      window.innerWidth - 296,
    );
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  }

  return {
    show(entry, rect) {
      card.replaceChildren();

      const title = document.createElement('h2');
      title.textContent = entry.lemma;
      const phonetic = document.createElement('div');
      phonetic.textContent = entry.phonetic ? `/${entry.phonetic}/` : '';
      const definitions = document.createElement('ol');

      for (const text of entry.definitionsZh.slice(0, 3)) {
        const item = document.createElement('li');
        item.textContent = text;
        definitions.append(item);
      }

      card.append(title, phonetic, definitions);
      position(rect);
      card.hidden = false;
      host.dataset.state = 'visible';
    },

    showSaved(onUndo) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '已保存 · 撤销';
      button.addEventListener('click', onUndo, { once: true });
      card.append(button);
      window.setTimeout(() => button.remove(), UNDO_WINDOW_MS);
    },

    showError(message) {
      card.replaceChildren(document.createTextNode(message));
      card.hidden = false;
      host.dataset.state = 'visible';
    },

    hide() {
      card.hidden = true;
      host.dataset.state = 'hidden';
    },

    destroy() {
      host.remove();
    },
  };
}
