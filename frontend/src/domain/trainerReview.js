// Presentation contract v1. These projections never alter recorded scores.
export const EXPLANATION_VERSION = 1;
const catalog = {
  Operation: ['terminal-action', 'Terminal action differs', 'Compare the recorded terminal decision with the expected decision.'],
  'Game amount': ['game-amount', 'Game amount differs', 'Verify the account and exact requested credits before accepting a transaction.'],
  'Game action': ['game-action-evidence', 'Matching game action unavailable', 'Inspect the game evidence. For reconciliation, verify the existing movement; never execute it again.'],
  'Game ID': ['account-id', 'Account ID differs', 'Verify the requested account ID against the recorded account.'],
  Kiosk: ['kiosk', 'Kiosk differs', 'Verify the requested kiosk.'],
  Balance: ['balance-evidence', 'Balance check differs', 'Verify the recorded balance and refresh evidence.'],
  Password: ['password-evidence', 'Password check differs', 'Review the redacted password-match check.'],
  'Backoffice password': ['backoffice-password-evidence', 'Backoffice password check differs', 'Review the redacted password-match check.'],
  'Customer reservation': ['reservation-evidence', 'Reservation check differs', 'Review the recorded reservation state.'],
  'Mobile ID and Mobile Password': ['account-creation-evidence', 'Account creation check differs', 'Verify account creation evidence and the requested account.'],
  'Game ID and password': ['account-creation-evidence', 'Account creation check differs', 'Verify account creation evidence and the requested account.']
};
export const requirements = (op) => op.validationRequirements || op.validation_requirements || [];
export const sentResult = (op) => op.sentResult || op.sent_result || op.status || 'UNKNOWN';
export function reviewResult(op) {
  if (String(sentResult(op)).toUpperCase() === 'PENDING') return 'Pending';
  if (!['APPROVED', 'CANCELLED'].includes(String(sentResult(op)).toUpperCase())) return 'Unverified';
  const checks = requirements(op);
  if (!checks.length || checks.some((check) => typeof check.ok !== 'boolean' || check.sent == null || check.sent === '' || check.expected == null || check.expected === '' || /missing|unknown|no match|not updated/i.test(String(check.sent)))) return 'Unverified';
  return checks.every((check) => check.ok) ? 'Correct' : 'Incorrect';
}
export function requirementValue(value, label) {
  if (value == null || value === '') return 'Not recorded';
  if (/password/i.test(label) && !['Match', 'No match', 'Updated', 'Not updated', 'Matches submitted value', 'Matches', 'Provided', 'Missing'].includes(String(value))) return 'Redacted';
  return typeof value === 'number' && /amount|balance/i.test(label) ? `${value} credits` : String(value);
}
export function explain(check) {
  const entry = catalog[check.label];
  return {
    code: entry?.[0] || 'unsupported-check', version: EXPLANATION_VERSION,
    title: check.ok === true ? `${check.label}: check passed` : entry?.[1] || `${check.label}: inspect evidence`,
    instruction: entry?.[2] || 'Inspect the structured evidence; no supported corrective procedure is available.',
    explanation: `Report check: expected ${requirementValue(check.expected, check.label)}; recorded ${requirementValue(check.sent, check.label)}.`,
  };
}
export function duration(seconds) {
  if (seconds == null || seconds === '' || !Number.isFinite(Number(seconds))) return 'Not recorded';
  return `${Math.max(0, Math.round(Number(seconds)))}s`;
}
