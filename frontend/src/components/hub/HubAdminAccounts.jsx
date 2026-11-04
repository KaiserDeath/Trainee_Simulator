import {hubServerMessage} from '../../i18n/hubLocale';
import {hubMessage} from '../../i18n/hubLocale';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import { useCallback, useEffect, useState } from 'react';

import {
  createHubAccount,
  getHubAdminAccounts,
  resetHubStaffPassword,
} from '../../api/client';

export default function HubAdminAccounts() {
  const {t} = useHubLocale();
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
        if (!cancelled) setNotice(hubMessage("Accounts could not be loaded."));
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
      setNotice(hubMessage("Account created. Username and initial password: {0}", [username]));
      setForm({ firstName: '', surname: '', role: 'TRAINER', preferredLocale: 'en' });
      await load();
    } catch (error) {
      setNotice(hubServerMessage(error?.response?.data?.error?.message || hubMessage("The account could not be created."), hubMessage("The account could not be created.")));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (account) => {
    setBusy(true);
    setNotice('');
    try {
      await resetHubStaffPassword(account.id);
      setNotice(hubMessage("{0}'s password was reset to {1}.", [account.username, account.username]));
    } catch (error) {
      setNotice(hubServerMessage(error?.response?.data?.error?.message || hubMessage("The password could not be reset."), hubMessage("The password could not be reset.")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="hub-admin-accounts" aria-labelledby="hub-admin-accounts-title">
      <p className="hub-eyebrow">{t("ADMIN")}</p>
      <h2 id="hub-admin-accounts-title">{t("TRAINER account administration")}</h2>
      <form className="hub-account-form" onSubmit={submit}>
        <label>{t("First name")}<input required value={form.firstName} onChange={update('firstName')} /></label>
        <label>{t("First surname")}<input required value={form.surname} onChange={update('surname')} /></label>
        <label>{t("Role")}<input value={t("TRAINER")} readOnly /></label>
        <label>{t("Language")}<select value={form.preferredLocale} onChange={update('preferredLocale')}><option value="en">{t("English")}</option><option value="es">{t("Español")}</option></select></label>
        <button className="hub-primary-button" type="submit" disabled={busy}>{busy ? t("Working…") : t("Create account")}</button>
      </form>
      {notice && <p className="hub-inline-notice" role="status">{t(notice)}</p>}
      <div className="hub-account-table-wrap hub-mobile-directory" tabIndex={0} role="region" aria-label={t("Table data")}>
        <table className="hub-trainer-table">
          <thead><tr><th>{t("Username")}</th><th>{t("Full name")}</th><th>{t("Role")}</th><th>{t("Status")}</th><th>{t("Staff password")}</th></tr></thead>
          <tbody>
            {accounts.map((account) => {
              const postulante = account.roles.includes('POSTULANTE');
              return <tr key={account.id}>
                <td data-label={t("Username")}>{account.username || t("Not migrated")}</td><td data-label={t("Full name")}>{account.displayName}</td><td data-label={t("Role")}>{account.roles.map(role=>t(role)).join(', ')}</td><td data-label={t("Status")}>{t(account.status)}</td>
                <td data-label={t("Staff password")} className="hub-directory-actions">{postulante ? t("No reset available") : <button type="button" disabled={busy} onClick={() => resetPassword(account)}>{t("Reset to username")}</button>}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
