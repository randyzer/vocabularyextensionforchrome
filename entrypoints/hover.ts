import { startContentRuntime } from '../src/content';

export default defineUnlistedScript(() => {
  const stop = startContentRuntime();
  window.addEventListener('pagehide', stop, { once: true });
});
