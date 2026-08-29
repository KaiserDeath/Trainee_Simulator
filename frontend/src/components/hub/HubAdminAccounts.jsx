import { useCallback, useEffect, useState } from 'react';

import {
  createHubAccount,
  getHubAdminAccounts,
  resetHubStaffPassword,
} from '../../api/client';

export default function HubAdminAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ firstName: '', surname: '', role: 'TRAINER', preferredLocale: 'en' });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await getHubAdminAccounts();
    setAccounts(response.data.accounts || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getHubAdminAccounts()
      .then((response) => {
        if (!cancelled) setAccounts(response.data.accounts || []);
      })
      .catch(() => {
        if (!cancelled) setNotice('Accounts could not be loaded.');
      });
    return () => { cancelled = true; };
  }, []);

  const update = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const response = await createHubAccount({
        firstName: form.firstName,
        surname: form.surname,
        roles: [form.role.toLowerCase()],
        preferredLocale: form.preferredLocale,
      });
      const username = response.data.identity.username;
      setNotice(`Account created. Username and initial password: ${username}`);
      setForm({ firstName: '', surname: '', role: 'TRAINER', preferredLocale: 'en' });
      await load();
    } catch (error) {
      setNotice(error?.response?.data?.error?.message || 'The account could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (account) => {
    setBusy(true);
    setNotice('');
    try {
      await resetHubStaffPassword(account.id);
      setNotice(`${account.username}'s password was reset to ${account.username}.`);
    } catch (error) {
      setNotice(error?.response?.data?.error?.message || 'The password could not be reset.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="hub-admin-accounts" aria-labelledby="hub-admin-accounts-title">
      <p className="hub-eyebrow">ADMIN</p>
      <h2 id="hub-admin-accounts-title">TRAINER account administration</h2>
      <form className="hub-account-form" onSubmit={submit}>
        <label>First name<input required value={form.firstName} onChange={update('firstName')} /></label>
        <label>First surname<input required value={form.surname} onChange={update('surname')} /></label>
        <label>Role<input value="TRAINER" readOnly /></label>
        <label>Language<select value={form.preferredLocale} onChange={update('preferredLocale')}><option value="en">English</option><option value="es">Español</option></select></label>
        <button className="hub-primary-button" type="submit" disabled={busy}>{busy ? 'Working…' : 'Create account'}</button>
      </form>
      {notice && <p className="hub-inline-notice" role="status">{notice}</p>}
      <div className="hub-account-table-wrap">
        <table className="hub-trainer-table">
          <thead><tr><th>Username</th><th>Full name</th><th>Role</th><th>Status</th><th>Staff password</th></tr></thead>
          <tbody>
            {accounts.map((account) => {
              const postulante = account.roles.includes('POSTULANTE');
              return <tr key={account.id}>
                <td>{account.username || 'Not migrated'}</td><td>{account.displayName}</td><td>{account.roles.join(', ')}</td><td>{account.status}</td>
                <td>{postulante ? 'No reset available' : <button type="button" disabled={busy} onClick={() => resetPassword(account)}>Reset to username</button>}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
