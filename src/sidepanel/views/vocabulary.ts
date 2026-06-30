import type { Capture } from '../../shared/models';
import { send } from '../api';

export async function renderVocabulary(
  container: HTMLElement,
): Promise<void> {
  const captures = await send<Capture[]>({
    type: 'LIST_CAPTURES',
    filter: {},
  });
  const groups = new Map<string, Capture[]>();

  for (const capture of captures) {
    groups.set(capture.lemma, [...(groups.get(capture.lemma) ?? []), capture]);
  }

  container.replaceChildren();

  if (groups.size === 0) {
    container.textContent = '生词库为空。';
    return;
  }

  for (const [lemma, items] of [...groups].sort(([a], [b]) => (
    a.localeCompare(b)
  ))) {
    const section = document.createElement('section');
    section.className = 'vocabulary-group';

    const heading = document.createElement('h2');
    heading.textContent = `${lemma} · 遇见 ${
      items.reduce((sum, item) => sum + item.encounterCount, 0)
    } 次`;

    const list = document.createElement('ul');

    for (const item of items) {
      const row = document.createElement('li');
      row.textContent = item.sentence;
      list.append(row);
    }

    section.append(heading, list);
    container.append(section);
  }
}
