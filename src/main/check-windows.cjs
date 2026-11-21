'use strict';
const { NativeWorker } = require('./ai-monitor-main.cjs');
const { observe, PROVIDERS } = require('./ai-monitor-model.cjs');
const { t } = require('../shared/i18n.cjs');

async function check(worker, write = console.log) {
  const result = await worker.request('windows');
  if (!result?.ok) throw new Error(result?.error || t('checkWindows.unavailable'));
  write(t('checkWindows.started'));
  let identified = 0, readable = 0;
  for (const target of result.windows || []) {
    let snapshot;
    try { snapshot = await worker.request('read', { target }); }
    catch { write(t('checkWindows.unresponsive')); continue; }
    if (!Object.hasOwn(PROVIDERS, snapshot?.provider || '')) continue;
    identified++;
    const observation = observe(snapshot, snapshot.provider);
    const name = PROVIDERS[snapshot.provider].name;
    if (!observation.valid) {
      const reason = observation.login
        ? t('checkWindows.loginFirst')
        : snapshot.truncated
          ? t('checkWindows.tooMuchInfo')
          : t('checkWindows.keepSeparateWindow');
      write(t('checkWindows.unreadable', { name, reason }));
      continue;
    }
    readable++;
    write(t('checkWindows.summaryRow', {
      name,
      input: observation.composer ? t('checkWindows.composerFound') : t('checkWindows.stopFound'),
      assistant: observation.assistant ? t('checkWindows.recognized') : t('checkWindows.notYetRecognized'),
      completed: observation.completed ? t('checkWindows.recognized') : t('checkWindows.notYetRecognized')
    }));
  }
  if (!identified) write(t('checkWindows.noneFound'));
  else if (readable) write(t('checkWindows.readyToConnect'));
  write(t('checkWindows.safeReadOnly'));
  return { identified, readable };
}
if (require.main === module) {
  const worker = new NativeWorker();
  check(worker).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => worker.close());
}
module.exports = { check };
