import { useEffect, useState } from 'react';
import { getHubAdministratorProfile, updateHubAdministratorProfile } from '../../api/client';

export default function HubAdministratorConfiguration({ onSaved }) {
  const [profile, setProfile] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getHubAdministratorProfile().then(({ data }) => {
      if (!cancelled) setProfile(data);
    }).catch(() => {
      if (!cancelled) setNotice('Administrator configuration could not be loaded.');
    });
    return () => { cancelled = true; };
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const { data } = await updateHubAdministratorProfile({ firstName: profile.firstName, surname: profile.surname });
      setProfile(data);
      onSaved?.(`${data.firstName} ${data.surname}`);
      setNotice('Administrator name saved.');
    } catch (error) {
      setNotice(error?.response?.data?.error?.message || 'Administrator name could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="hub-admin-accounts" aria-labelledby="administrator-configuration-title">
    <h2 id="administrator-configuration-title">Administrator configuration</h2>
    {profile && <form className="hub-account-form" onSubmit={save}>
      <label>First name<input required maxLength={120} value={profile.firstName || ''} onChange={(event) => setProfile({ ...profile, firstName: event.target.value })} /></label>
      <label>Surname<input required maxLength={120} value={profile.surname || ''} onChange={(event) => setProfile({ ...profile, surname: event.target.value })} /></label>
      <label>Login username<input readOnly value={profile.username} /></label>
      <button className="hub-primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save administrator name'}</button>
      <p>Your login username and password stay the same when you edit your name.</p>
    </form>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
