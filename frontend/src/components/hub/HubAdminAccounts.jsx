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
  const [page,setPage]=useState(null);
  const [search,setSearch]=useState('');
  const [appliedSearch,setAppliedSearch]=useState('');
  const [form, setForm] = useState({ firstName: '', surname: '', role: 'TRAINER', preferredLocale: 'en' });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await getHubAdminAccounts({});
    setAccounts(response.data.accounts || []);setPage(response.data.page);setAppliedSearch('');
  }, []);

  useEffect(() => {
    let cancelled = false;
    getHubAdminAccounts({})
      .then((response) => {
        if (!cancelled) {setAccounts(response.data.accounts || []);setPage(response.data.page);}
      })
      .catch(() => {
        if (!cancelled) setNotice(hubMessage("Accounts could not be loaded."));
      });
    return () => { cancelled = true; };
  }, []);

  const findAccounts=async(append=false)=>{setBusy(true);try{const response=await getHubAdminAccounts({search:append?appliedSearch:search,cursor:append?page?.nextCursor:undefined});setAccounts(current=>append?[...new Map([...current,...response.data.accounts].map(row=>[row.id,row])).values()]:response.data.accounts);setPage(response.data.page);if(!append)setAppliedSearch(search);}catch{setNotice(hubMessage("Accounts could not be loaded."));}finally{setBusy(false);}};
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
      setNotice(hubMessage("Account created. Username: {0}. Temporary password: {1}. Share it securely; it is shown only now.", [username, response.data.initialPassword]));
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
      const response = await resetHubStaffPassword(account.id);
      setNotice(hubMessage("Temporary password for {0}: {1}. Share it securely; it is shown only now.", [account.username, response.data.initialPassword]));
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
      <form onSubmit={event=>{event.preventDefault();void findAccounts();}}><label>{t("Search directory")}<input type="search" value={search} onChange={event=>setSearch(event.target.value)}/></label><button disabled={busy}>{t("Search directory")}</button></form>
      {page&&<p>{t("Loaded {0} of {1} matching accounts.",[accounts.length,page.total])}</p>}
      {page?.nextCursor&&<button type="button" disabled={busy} onClick={()=>findAccounts(true)}>{t("Load more")}</button>}
      <div className="hub-account-table-wrap hub-mobile-directory" tabIndex={0} role="region" aria-label={t("Table data")}>
        <table className="hub-trainer-table">
          <thead><tr><th>{t("Username")}</th><th>{t("Full name")}</th><th>{t("Role")}</th><th>{t("Status")}</th><th>{t("Staff password")}</th></tr></thead>
          <tbody>
            {accounts.map((account) => {
              const postulante = account.roles.includes('POSTULANTE');
              return <tr key={account.id}>
                <td data-label={t("Username")}>{account.username || t("Not migrated")}</td><td data-label={t("Full name")}>{account.displayName}</td><td data-label={t("Role")}>{account.roles.map(role=>t(role)).join(', ')}</td><td data-label={t("Status")}>{t(account.status)}</td>
                <td data-label={t("Staff password")} className="hub-directory-actions">{postulante ? t("No reset available") : <button type="button" disabled={busy} onClick={() => resetPassword(account)}>{t("Generate temporary password")}</button>}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
