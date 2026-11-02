import { BarChart3, Users, Settings2 } from 'lucide-react';

export default function DashboardSidebar({ dashboardSection, onNavigate }) {
  return <aside id="trainer-sidebar" className="trainer-navigation" aria-label="Trainer navigation and controls">
    <div className="trainer-brand"><span>T</span><div><h1>Trez Trainer</h1><small>Operator training</small></div></div>
    <nav aria-label="Trainer sections">{[
      ['trainees', 'Sessions & reports', Users],
      ['statistics', 'Statistics', BarChart3],
      ['settings', 'Settings', Settings2],
    ].map(([id, label, Icon]) => <button type="button" key={id} aria-current={dashboardSection === id ? 'page' : undefined} onClick={() => onNavigate(id)}><Icon size={19} aria-hidden="true" /><span>{label}</span></button>)}</nav>
    <div className="trainer-navigation-note">Training workspace<small>Session evidence and simulator controls</small></div>
  </aside>;
}

export function TrainerSettings({ handleMaxOpmChange, handleMinOpmChange, handleTimeoutChange, maxOpm, minOpm, saveStatus, sessionTimeoutMinutes }) {
  return <div className="trainer-settings-page">
    <header className="trainer-page-heading"><div><h2>Simulator settings</h2><p>Global defaults and operation generation rate.</p></div><div role="status"><SaveStatus status={saveStatus} /></div></header>
    <section className="trainer-surface trainer-settings-form" aria-label="Simulator generation settings">
      <h3>Session & workload</h3><p>Changes save automatically. Rate changes apply on the next generation cycle.</p>
      <NumberField label="Session limit" min="1" suffix="min" value={sessionTimeoutMinutes} onChange={handleTimeoutChange} />
      <div className="trainer-rate-fields"><NumberField label="Min operations/min" min="0" value={minOpm} onChange={handleMinOpmChange} /><NumberField label="Max operations/min" min="0" value={maxOpm} onChange={handleMaxOpmChange} /></div>
      <p>The rate includes Add Credits, Withdraw Credits, Create Account, Reset Password, and Refresh Balance requests combined.</p>
      <div className="trainer-queue-note"><strong>Queue capacity: 20 pending operations per session</strong><span>Generation pauses at capacity and resumes when operations are resolved. The rate is a generation target, subject to available balances and eligible accounts.</span></div>
      <p>The session limit is the default for new sessions. Existing sessions retain their assigned duration.</p>
    </section>
  </div>;
}

function NumberField({
  label,
  min,
  onChange,
  suffix,
  value
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">

        {label}
      </span>
      <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950/70 focus-within:border-cyan-500/50 focus-within:ring-2 focus-within:ring-cyan-500/10">
        <input
          type="number"
          min={min}
          value={value}
          onChange={(event) =>
            onChange(Number(event.target.value))
          }
          className="min-w-0 flex-1 rounded-lg bg-transparent px-3 py-2 text-sm font-semibold text-white outline-none"
          aria-label={label}
        />
        {suffix && (
          <span className="pr-3 text-xs font-medium text-slate-500">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function SaveStatus({ status }) {
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-300">

        Syncing
      </span>
    );
  }

  if (status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300">

        Saved
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-300">

        Failed
      </span>
    );
  }

  return (
    <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] font-semibold text-slate-500">
      Ready
    </span>
  );
}
