import type { Capture, WeeklyDigest } from '../../shared/models';
import { send } from '../api';
import { createCaptureCard } from '../components/capture-card';

export async function renderCurrent(
  container: HTMLElement,
  refresh: () => void,
): Promise<void> {
  const digests = await send<WeeklyDigest[]>({ type: 'LIST_DIGESTS' });
  const latestPeriodEnd = digests[0]?.periodEnd;
  const captures = await send<Capture[]>({
    type: 'LIST_CAPTURES',
    filter: latestPeriodEnd ? { from: latestPeriodEnd } : {},
  });

  container.replaceChildren();

  if (captures.length === 0) {
    container.textContent = '还没有收藏的语境句子。';
    return;
  }

  for (const capture of captures) {
    container.append(createCaptureCard(capture, refresh));
  }
}
