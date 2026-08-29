import { useRef, useState } from 'react';

const usableTarget = (content = {}) => {
  const target = content.target;
  return content.artifactStatus === 'available'
    && target
    && String(target.identifier || '').trim()
    && String(target.sourceArtifactId || '').trim()
    ? target
    : null;
};

export default function HubExactPlayerSearchActivity({ activity, disabled, onComplete }) {
  const target = usableTarget(activity.content);
  const inputRef = useRef(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pasteObserved, setPasteObserved] = useState(false);
  const [query, setQuery] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  if (!target) {
    return (
      <div className="hub-policy-block" role="status">
        <strong>Module 3 account artifact required</strong>
        <p>{activity.content?.blockedReason || 'The server has not supplied a created-account artifact for this attempt.'}</p>
      </div>
    );
  }

  const exactMatch = query === target.identifier;
  const ready = searchOpen && pasteObserved && exactMatch && confirmed;

  const observeShortcut = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      setSearchOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const finish = () => onComplete({
    sourceArtifactId: target.sourceArtifactId,
    targetGame: target.game || null,
    targetLicense: target.license || null,
    searchProcedure: {
      ctrlFObserved: searchOpen,
      ctrlVObserved: pasteObserved,
      exactQuery: query,
      matchedIdentifier: target.identifier,
      exactMatch,
      confirmed,
    },
  });

  return (
    <div className="hub-search-practice" tabIndex={disabled ? -1 : 0} onKeyDown={observeShortcut}>
      <p className="hub-activity-intro">Focus this exercise and press <kbd>Ctrl</kbd>+<kbd>F</kbd>. Paste the copied Module 3 identifier with <kbd>Ctrl</kbd>+<kbd>V</kbd>.</p>
      <dl>
        {target.game && <div><dt>Game</dt><dd>{target.game}</dd></div>}
        {target.license && <div><dt>License</dt><dd>{target.license}</dd></div>}
      </dl>
      {!searchOpen && <p className="hub-inline-notice" role="status">Waiting for the application-controlled Ctrl+F shortcut.</p>}
      {searchOpen && (
        <label>
          Player search
          <input
            ref={inputRef}
            value={query}
            disabled={disabled}
            onChange={(event) => { setQuery(event.target.value); setConfirmed(false); }}
            onPaste={() => setPasteObserved(true)}
          />
        </label>
      )}
      {searchOpen && query && <p role="status">{exactMatch ? 'Exact player identifier found.' : 'No exact match for this identifier.'}</p>}
      {exactMatch && pasteObserved && (
        <label className="hub-acknowledgement">
          <input type="checkbox" checked={confirmed} disabled={disabled} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>I positively confirmed the exact player without changing account or balance data.</span>
        </label>
      )}
      <button className="hub-primary-button" type="button" disabled={disabled || !ready} onClick={finish}>Complete exact-player search</button>
    </div>
  );
}
