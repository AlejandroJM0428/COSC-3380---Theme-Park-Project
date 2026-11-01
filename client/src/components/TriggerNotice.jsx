// Shows a database trigger at work. Two looks:
//   variant="blocked": a trigger stopped the action (for example a double-booking). Friendly words first,
//                      the trigger's name, table and rule underneath.
//   variant="fired":   the action worked and these triggers ran. Each gets a one-line result.
//
// notice = { variant, message, trigger?, fired?, title? }   trigger / fired[] = { name, table, timing, event, rule, result? }
// The wording for the blocked look is in BLOCKED_COPY, keyed by trigger name. Add a line there to give a trigger its own words.
const BLOCKED_COPY = {
  trg_Ticket_BI_Guard: {
    title: 'Hold on, that was fast!',
    help: 'You already have a ticket for that day. Check your tickets before booking another one.',
    action: { label: 'View my tickets', tab: 'tickets' },
  },
  trg_Membership_BI: {
    title: 'You are already covered',
    help: 'A membership can only run once at a time, so the park kept your current one.',
    action: { label: 'View my membership', tab: 'membership' },
  },
  trg_Ticket_BI: {
    title: 'That ticket could not be booked',
    help: 'Try another date, or check what your membership covers.',
  },
}
const FALLBACK_COPY = { title: 'A park rule stopped that', help: 'Nothing was charged. Change the details and try again.' }

function Chip({ t }) {
  return (
    <code className="pt-trg-chip">
      {t.name}
      <span> · {t.timing} {t.event} on {t.table}</span>
    </code>
  )
}

export default function TriggerNotice({ notice, onDismiss, onGo }) {
  if (!notice) return null

  if (notice.variant === 'fired') {
    return (
      <section className="pt-trg pt-trg-fired" role="status" aria-label="Database triggers that ran">
        <div className="pt-trg-head">
          <span className="pt-trg-bolt" aria-hidden="true">⚡</span>
          <div>
            <p className="pt-trg-kicker">Database triggers ran</p>
            <h2 className="pt-trg-title">{notice.title ?? 'All set'}</h2>
            {notice.message && <p className="pt-trg-msg">{notice.message}</p>}
          </div>
          <button type="button" className="pt-trg-x" aria-label="Dismiss" onClick={onDismiss}>×</button>
        </div>
        {notice.fired?.length > 0 && (
          <ul className="pt-trg-list">
            {notice.fired.map((t) => (
              <li key={t.name}>
                <Chip t={t} />
                <p>{t.result ?? t.rule}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  const trigger = notice.trigger
  const copy = BLOCKED_COPY[trigger?.name] ?? FALLBACK_COPY
  return (
    <section className="pt-trg pt-trg-blocked" role="alert" aria-label="A database trigger stopped this">
      <div className="pt-trg-head">
        <span className="pt-trg-bolt" aria-hidden="true">⚡</span>
        <div>
          <p className="pt-trg-kicker">Database trigger fired</p>
          <h2 className="pt-trg-title">{copy.title}</h2>
          <p className="pt-trg-msg">{notice.message}</p>
          <p className="pt-trg-help">{copy.help}</p>
        </div>
        <button type="button" className="pt-trg-x" aria-label="Dismiss" onClick={onDismiss}>×</button>
      </div>
      {trigger && (
        <div className="pt-trg-detail">
          <Chip t={trigger} />
          <p>{trigger.rule}</p>
        </div>
      )}
      {copy.action && (
        <div className="pt-trg-actions">
          <button type="button" className="pt-btn pt-btn-sm" onClick={() => { onGo?.(copy.action.tab); onDismiss?.() }}>{copy.action.label}</button>
        </div>
      )}
    </section>
  )
}
