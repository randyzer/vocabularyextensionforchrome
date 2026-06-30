import { startContentRuntime } from '../src/content';

export default defineUnlistedScript(async () => {
  const stop = await startContentRuntime();
  window.addEventListener('pagehide', stop, { once: true });
});
