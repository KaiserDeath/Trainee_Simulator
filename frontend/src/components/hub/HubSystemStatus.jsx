import { useState } from 'react';
import { useHubLocale } from '../../i18n/HubLocaleContext';
import { getHubRuntimeMetrics } from '../../api/client';
export default function HubSystemStatus() {
  const {
    t,
    formatDate
  } = useHubLocale();
  const [data, setData] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  async function load() {
    setBusy(true);
    setError(false);
    try {
      setData((await getHubRuntimeMetrics()).data);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return <section><h1>{t('System status')}</h1><p>{t('Queue diagnostics are a snapshot. HTTP counters are not provider billed usage.')}</p><button type="button" disabled={busy} onClick={load}>{t('Update snapshot')}</button>{error && <p role="alert">{t('The snapshot could not be updated. Previously loaded records remain visible; retry Update.')}</p>}{data?.queue && <><p>{t('Snapshot retrieved at {0}', [formatDate(data.queue.retrievedAt)])}</p><dl className="hub-status-grid">{[['Ready', data.queue.ready], ['Running', data.queue.running], ['Dead jobs', data.queue.dead], ['Expired leases', data.queue.expiredLeases]].map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value ?? '—'}</dd></div>)}</dl></>}</section>;
}
