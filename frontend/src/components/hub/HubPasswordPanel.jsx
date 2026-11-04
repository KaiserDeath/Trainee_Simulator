import {hubServerMessage} from '../../i18n/hubLocale';
import {hubMessage} from '../../i18n/hubLocale';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import { useState } from 'react';

import { changeHubPassword } from '../../api/client';

export default function HubPasswordPanel() {
  const {t} = useHubLocale();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      await changeHubPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setNotice(hubMessage("Password changed."));
    } catch (error) {
      setNotice(hubServerMessage(error?.response?.data?.error?.message || hubMessage("Password could not be changed."), hubMessage("Password could not be changed.")));
    } finally {
      setBusy(false);
    }
  };

  return <details className="hub-password-panel">
    <summary>{t("Change my password")}</summary>
    <form className="hub-account-form" onSubmit={submit}>
      <label>{t("Current password")}<input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
      <label>{t("New password")}<input type="password" autoComplete="new-password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
      <button className="hub-primary-button" type="submit" disabled={busy}>{busy ? t("Changing…") : t("Change password")}</button>
    </form>
    {notice && <p role="status">{t(notice)}</p>}
  </details>;
}
