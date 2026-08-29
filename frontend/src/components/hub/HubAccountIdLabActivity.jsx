import { useMemo, useState } from 'react';

import { validateAccountIdentifierAnswer } from '@trez-training/account-id-rules';

const approvedPolicyContext = (content = {}) => {
  const policy = content.policy;
  const versionId = String(content.policyVersionId || '').trim();
  const customerUsername = String(content.customerUsername || '').trim();
  return content.policyStatus === 'approved' && policy && versionId && customerUsername
    ? { policy, versionId, customerUsername }
    : null;
};

export default function HubAccountIdLabActivity({ activity, disabled, onComplete }) {
  const context = useMemo(() => approvedPolicyContext(activity.content), [activity.content]);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null);

  if (!context) {
    return (
      <div className="hub-policy-block" role="status">
        <strong>Approved game policy required</strong>
        <p>{activity.content?.blockedReason || 'This rule activity is unavailable until Trez publishes an approved account-structure policy.'}</p>
        {activity.content?.requirements?.length > 0 && (
          <ul>{activity.content.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul>
        )}
      </div>
    );
  }

  const checkAnswer = () => {
    const next = validateAccountIdentifierAnswer({
      customerUsername: context.customerUsername,
      policy: context.policy,
      selectedPolicyKey: context.policy.key,
      answer,
    });
    setResult(next);
  };

  const finish = () => onComplete({
    policyVersionId: context.versionId,
    policyKey: context.policy.key,
    customerUsername: context.customerUsername,
    answer: answer.trim(),
    validation: result,
  });

  return (
    <div className="hub-rule-lab">
      <p className="hub-activity-intro">Use the server-assigned policy to construct the identifier for <strong>{context.customerUsername}</strong>.</p>
      <dl>
        <div><dt>Policy</dt><dd>{context.policy.label}</dd></div>
        <div><dt>Version</dt><dd>{context.versionId}</dd></div>
      </dl>
      <ol className="hub-rule-segments">
        {context.policy.segments.map((segment) => <li key={segment.key}>{segment.label}</li>)}
      </ol>
      <label>
        Constructed identifier
        <input value={answer} disabled={disabled} onChange={(event) => { setAnswer(event.target.value); setResult(null); }} />
      </label>
      <div className="hub-inline-actions">
        <button type="button" disabled={disabled || !answer.trim()} onClick={checkAnswer}>Check identifier</button>
        <button className="hub-primary-button" type="button" disabled={disabled || !result?.correct} onClick={finish}>Complete rule practice</button>
      </div>
      {result && <p role="status">{result.correct ? 'Identifier matches the assigned policy.' : 'Identifier does not match the assigned policy.'}</p>}
    </div>
  );
}
