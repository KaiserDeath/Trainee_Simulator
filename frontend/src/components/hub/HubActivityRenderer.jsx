import { useMemo, useState } from 'react';

import HubAccountIdLabActivity from './HubAccountIdLabActivity';
import HubAddCreditsActivity from './HubAddCreditsActivity';
import HubWithdrawCreditsActivity from './HubWithdrawCreditsActivity';
import HubExactPlayerSearchActivity from './HubExactPlayerSearchActivity';
import HubFocusedBalanceActivity from './HubFocusedBalanceActivity';
import HubAccountPracticeActivity from './HubAccountPracticeActivity';
import HubPasswordResetActivity from './HubPasswordResetActivity';
import HubExceptionPracticeActivity from './HubExceptionPracticeActivity';
import HubMixedPracticeActivity from './HubMixedPracticeActivity';
import HubMediaItem from './HubMediaItem';

const normaliseItems = (items = []) => items.map((item, index) => ({
  id: typeof item === 'string' ? `item-${index}` : item.id || `item-${index}`,
  label: typeof item === 'string' ? item : item.label || item.text || '',
}));

function ArticleContent({ content }) {
  const paragraphs = content?.paragraphs || (content?.body ? [content.body] : []);
  const sections = content?.sections || [];
  const lists = [
    ['Learning objectives', content?.learningObjectives],
    ['Key points', content?.keyPoints],
    ['Topics', content?.topics],
    ['Steps', content?.steps],
  ].filter(([, items]) => items?.length);

  return (
    <div className="hub-prose">
      {paragraphs.map((paragraph, index) => <p key={`paragraph-${index}`}>{paragraph}</p>)}
      {content?.summary && <p>{content.summary}</p>}
      {lists.map(([title, items]) => (
        <section key={title}>
          <h4>{title}</h4>
          <ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul>
        </section>
      ))}
      {sections.map((section, index) => (
        <section key={section.id || `section-${index}`}>
          {section.title && <h4>{section.title}</h4>}
          {(section.paragraphs || []).map((paragraph, paragraphIndex) => (
            <p key={`section-${index}-paragraph-${paragraphIndex}`}>{paragraph}</p>
          ))}
          {section.items?.length > 0 && (
            <ul>
              {section.items.map((item, itemIndex) => (
                <li key={typeof item === 'string' ? `${item}-${itemIndex}` : item.id || itemIndex}>
                  {typeof item === 'string' ? item : item.text || item.label}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function ChecklistContent({ activity, disabled, onComplete }) {
  const items = useMemo(
    () => normaliseItems(activity.content?.items || activity.content?.prompts || activity.content?.steps || []),
    [activity.content?.items, activity.content?.prompts, activity.content?.steps]
  );
  const [checked, setChecked] = useState(() => new Set());
  const allChecked = items.length > 0 && items.every((item) => checked.has(item.id));

  const toggleItem = (itemId) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  return (
    <div>
      {(activity.content?.introduction || activity.content?.instructions || activity.content?.summary) && (
        <p className="hub-activity-intro">
          {activity.content.introduction || activity.content.instructions || activity.content.summary}
        </p>
      )}
      <fieldset className="hub-checklist" disabled={disabled}>
        <legend className="sr-only">{activity.title} checklist</legend>
        {items.map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={checked.has(item.id)}
              onChange={() => toggleItem(item.id)}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </fieldset>
      {!activity.completed && (
        <button className="hub-primary-button" type="button" disabled={disabled || !allChecked} onClick={() => onComplete({})}>
          Complete checklist
        </button>
      )}
    </div>
  );
}

function AcknowledgementContent({ activity, disabled, onComplete }) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div>
      {(activity.content?.body || activity.content?.summary || activity.content?.instructions) && (
        <p className="hub-activity-intro">
          {activity.content.body || activity.content.summary || activity.content.instructions}
        </p>
      )}
      {!activity.completed && (
        <>
          <label className="hub-acknowledgement">
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={disabled}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>{activity.content?.statement || 'I acknowledge that I have reviewed this assigned material.'}</span>
          </label>
          <button
            className="hub-primary-button"
            type="button"
            disabled={disabled || !acknowledged}
            onClick={() => onComplete({ acknowledged: true })}
          >
            Record acknowledgement
          </button>
        </>
      )}
    </div>
  );
}

function PolicyBlockedContent({ activity }) {
  return (
    <div className="hub-policy-block" role="status">
      <strong>Approved configuration required</strong>
      <p>{activity.content?.blockedReason || 'This simulator activity remains unavailable until its business policy is approved.'}</p>
    </div>
  );
}

export default function HubActivityRenderer({ activity, busy, onComplete }) {
  const type = activity.type?.toLowerCase();
  const disabled = busy || activity.completed || activity.readOnly;

  return (
    <article className="hub-activity-card" aria-labelledby={`activity-${activity.id}-title`}>
      <header className="hub-activity-header">
        <div>
          <span className="hub-eyebrow">{type || 'Activity'}</span>
          <h3 id={`activity-${activity.id}-title`}>{activity.title}</h3>
        </div>
        <span className={`hub-status ${activity.completed ? 'is-complete' : ''}`}>
          {activity.completed ? 'Completed' : 'Assigned'}
        </span>
      </header>

      {(activity.provisional || activity.scored === false) && (
        <p className="hub-content-classification">
          {activity.provisional ? 'Provisional' : 'Validated'} · {activity.scored === false ? 'Non-scored' : 'Scoring status assigned by server'}
        </p>
      )}

      {activity.summary && <p className="hub-activity-summary">{activity.summary}</p>}
      {(activity.content?.mediaAssetIds||[]).map((id,index)=><HubMediaItem key={id} assetId={id} label={`Open training asset ${index+1}`}/>)}
      {activity.content?.executionKind==='official_evaluation'&&<p className="hub-inline-notice">Open the corresponding assessment in Checkpoint and readiness results. This module completes after an official successful result is submitted.</p>}

      {type === 'article' && (
        <>
          <ArticleContent content={activity.content} />
          {!activity.completed && (
            <button className="hub-primary-button" type="button" disabled={disabled} onClick={() => onComplete({})}>
              Mark article complete
            </button>
          )}
        </>
      )}
      {type === 'checklist' && (
        <ChecklistContent activity={activity} disabled={disabled} onComplete={onComplete} />
      )}
      {type === 'acknowledgement' && (
        <AcknowledgementContent activity={activity} disabled={disabled} onComplete={onComplete} />
      )}
      {['account_id_lab','account_creation'].includes(activity.content?.executionKind) && <HubAccountPracticeActivity activity={activity} disabled={disabled} onComplete={onComplete} />}
      {activity.content?.executionKind === 'reset_current_account' && <HubPasswordResetActivity activity={activity} disabled={disabled} onComplete={onComplete} />}
      {activity.content?.executionKind === 'exception_decision' && <HubExceptionPracticeActivity activity={activity} disabled={disabled} onComplete={onComplete} />}
      {activity.content?.executionKind==='mixed_practice'&&<HubMixedPracticeActivity activity={activity} busy={busy} onComplete={onComplete}/>}
      {type === 'interactive_rule_lab' && activity.content?.executionKind !== 'account_id_lab' && (
        <HubAccountIdLabActivity activity={activity} disabled={disabled} onComplete={onComplete} />
      )}
      {type === 'focused_practice' && (
        activity.content?.surface === 'balance'
          ? <HubFocusedBalanceActivity activity={activity} disabled={disabled} onComplete={onComplete} />
          : activity.content?.surface === 'add_credits'
            ? <HubAddCreditsActivity activity={activity} disabled={disabled} onComplete={onComplete} />
            : activity.content?.surface === 'withdraw_credits'
              ? <HubWithdrawCreditsActivity activity={activity} disabled={disabled} onComplete={onComplete} />
            : <HubExactPlayerSearchActivity activity={activity} disabled={disabled} onComplete={onComplete} />
      )}
      {type === 'quick_simulation' && activity.content?.policyStatus === 'required' && (
        <PolicyBlockedContent activity={activity} />
      )}
      {activity.content?.executionKind!=='official_evaluation'&&!['article', 'checklist', 'acknowledgement', 'interactive_rule_lab', 'focused_practice', 'quick_simulation'].includes(type) && (
        <p className="hub-inline-notice" role="status">
          This assigned activity type is not available in the current Hub foundation.
        </p>
      )}
      {busy && <p className="hub-saving" role="status">Saving progress…</p>}
    </article>
  );
}
