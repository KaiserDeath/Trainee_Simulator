import { useState } from 'react';

import { changeHubPassword } from '../../api/client';

export default function HubPasswordPanel() {
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
      setNotice('Password changed.');
    } catch (error) {
      setNotice(error?.response?.data?.error?.message || 'Password could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  return <details className="hub-password-panel">
    <summary>Change my password</summary>
    <form className="hub-account-form" onSubmit={submit}>
      <label>Current password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
      <label>New password<input type="password" autoComplete="new-password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
      <button className="hub-primary-button" type="submit" disabled={busy}>{busy ? 'Changing…' : 'Change password'}</button>
    </form>
    {notice && <p role="status">{notice}</p>}
  </details>;
}
