import {useHubLocale} from '../../i18n/HubLocaleContext';
import {hubActivityHandler} from './hubModuleContract';
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
  const {t}=useHubLocale();
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
      {paragraphs.map((paragraph, index) => <p key={`paragraph-${index}`}>{t(paragraph)}</p>)}
      {content?.summary && <p>{t(content.summary)}</p>}
      {lists.map(([title, items]) => (
        <section key={title}>
          <h4>{t(title)}</h4>
          <ul>{items.map((item, index) => <li key={`${title}-${index}`}>{t(item)}</li>)}</ul>
        </section>
      ))}
      {sections.map((section, index) => (
        <section key={section.id || `section-${index}`}>
          {section.title && <h4>{t(section.title)}</h4>}
          {(section.paragraphs || []).map((paragraph, paragraphIndex) => (
            <p key={`section-${index}-paragraph-${paragraphIndex}`}>{t(paragraph)}</p>
          ))}
          {section.items?.length > 0 && (
            <ul>
              {section.items.map((item, itemIndex) => (
                <li key={typeof item === 'string' ? `${item}-${itemIndex}` : item.id || itemIndex}>
                  {t(typeof item === 'string' ? item : item.text || item.label)}
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
  const {t} = useHubLocale();
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
          {t(activity.content.introduction || activity.content.instructions || activity.content.summary)}
        </p>
      )}
      <fieldset className="hub-checklist" disabled={disabled}>
        <legend className="sr-only">{t(activity.title)}{t(" checklist")}</legend>
        {items.map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={checked.has(item.id)}
              onChange={() => toggleItem(item.id)}
            />
            <span>{t(item.label)}</span>
          </label>
        ))}
      </fieldset>
      {!activity.completed && (
        <button className="hub-primary-button" type="button" disabled={disabled || !allChecked} onClick={() => onComplete({})}>{t("Complete checklist")}</button>
      )}
    </div>
  );
}

function AcknowledgementContent({ activity, disabled, onComplete }) {
  const {t} = useHubLocale();
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div>
      {(activity.content?.body || activity.content?.summary || activity.content?.instructions) && (
        <p className="hub-activity-intro">
          {t(activity.content.body || activity.content.summary || activity.content.instructions)}
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
            <span>{t(activity.content?.statement || "I acknowledge that I have reviewed this assigned material.")}</span>
          </label>
          <button
            className="hub-primary-button"
            type="button"
            disabled={disabled || !acknowledged}
            onClick={() => onComplete({ acknowledged: true })}
          >{t("Record acknowledgement")}</button>
        </>
      )}
    </div>
  );
}

function PolicyBlockedContent({ activity }) {
  const {t} = useHubLocale();
  return (
    <div className="hub-policy-block" role="status">
      <strong>{t("Approved configuration required")}</strong>
      <p>{t(activity.content?.blockedReason || "This simulator activity remains unavailable until its business policy is approved.")}</p>
    </div>
  );
}

export default function HubActivityRenderer({ activity, busy, onComplete }) {
  const {t} = useHubLocale();
  const type = activity.type?.toLowerCase();
  const handler = hubActivityHandler(activity);
  const disabled = busy || activity.completed || activity.readOnly;

  return (
    <article className="hub-activity-card" aria-labelledby={`activity-${activity.id}-title`}>
      <header className="hub-activity-header">
        <div>
          <span className="hub-eyebrow">{t(type || t("Activity"))}</span>
          <h3 id={`activity-${activity.id}-title`}>{t(activity.title)}</h3>
        </div>
        <span className={`hub-status ${activity.completed ? 'is-complete' : ''}`}>
          {activity.completed ? t("Completed") : t("Assigned")}
        </span>
      </header>

      {(activity.provisional || activity.scored === false) && (
        <p className="hub-content-classification">
          {activity.provisional ? t("Provisional") : t("Validated")} · {activity.scored === false ? t("Non-scored") : t("Scoring status assigned by server")}
        </p>
      )}

      {activity.summary && <p className="hub-activity-summary">{t(activity.summary)}</p>}
      {(activity.content?.mediaAssetIds||[]).map((id,index)=><HubMediaItem key={id} assetId={id} label={t("Open training asset {0}", [index+1])}/>)}
      {handler==='official'&&<p className="hub-inline-notice">{t("Open the corresponding assessment in Checkpoint and readiness results. This module completes after an official successful result is submitted.")}</p>}

      {handler === 'article' && (
        <>
          <ArticleContent content={activity.content} />
          {!activity.completed && (
            <button className="hub-primary-button" type="button" disabled={disabled} onClick={() => onComplete({})}>{t("Mark article complete")}</button>
          )}
        </>
      )}
      {handler === 'checklist' && (
        <ChecklistContent activity={activity} disabled={disabled} onComplete={onComplete} />
      )}
      {handler === 'acknowledgement' && (
        <AcknowledgementContent activity={activity} disabled={disabled} onComplete={onComplete} />
      )}
      {handler === 'account' && <HubAccountPracticeActivity activity={activity} disabled={disabled} onComplete={onComplete} />}
      {handler === 'password' && <HubPasswordResetActivity activity={activity} disabled={disabled} onComplete={onComplete} />}
      {handler === 'exception' && <HubExceptionPracticeActivity activity={activity} disabled={disabled} onComplete={onComplete} />}
      {handler === 'mixed'&&<HubMixedPracticeActivity activity={activity} busy={busy} onComplete={onComplete}/>}
      {handler === 'ruleLab' && (
        <HubAccountIdLabActivity activity={activity} disabled={disabled} onComplete={onComplete} />
      )}
      {['balance','addCredits','withdrawCredits','search'].includes(handler) && (
        handler === 'balance'
          ? <HubFocusedBalanceActivity activity={activity} disabled={disabled} onComplete={onComplete} />
          : handler === 'addCredits'
            ? <HubAddCreditsActivity activity={activity} disabled={disabled} onComplete={onComplete} />
            : handler === 'withdrawCredits'
              ? <HubWithdrawCreditsActivity activity={activity} disabled={disabled} onComplete={onComplete} />
            : <HubExactPlayerSearchActivity activity={activity} disabled={disabled} onComplete={onComplete} />
      )}
      {handler === 'policyBlocked' && (
        <PolicyBlockedContent activity={activity} />
      )}
      {handler === 'unsupported' && (
        <p className="hub-inline-notice" role="status">{t("This assigned activity type is not available in the current Hub foundation.")}</p>
      )}
      {busy && <p className="hub-saving" role="status">{t("Saving progress…")}</p>}
    </article>
  );
}
