export const HUB_MODULE_CONTRACT_VERSION = 1;

// Explicit built-in handlers only. Definition data cannot select executable code.
const executionHandlers = Object.freeze({
  account_id_lab: 'account', account_creation: 'account',
  reset_current_account: 'password', exception_decision: 'exception',
  mixed_practice: 'mixed', exact_player_search: 'search',
  official_evaluation: 'official',
});
const typeHandlers = Object.freeze({article: 'article', checklist: 'checklist', acknowledgement: 'acknowledgement', interactive_rule_lab: 'ruleLab'});
const surfaceHandlers = Object.freeze({balance: 'balance', add_credits: 'addCredits', withdraw_credits: 'withdrawCredits'});

export function hubActivityHandler(activity) {
  const content = activity?.content || {};
  const kind = content.executionKind;
  if (kind) return Object.hasOwn(executionHandlers, kind) ? executionHandlers[kind] : 'unsupported';
  const type = activity?.type?.toLowerCase();
  if (Object.hasOwn(typeHandlers, type)) return typeHandlers[type];
  if (type === 'focused_practice') return content.surface ? (Object.hasOwn(surfaceHandlers, content.surface) ? surfaceHandlers[content.surface] : 'unsupported') : 'search';
  if (type === 'quick_simulation' && content.policyStatus === 'required') return 'policyBlocked';
  return 'unsupported';
}
