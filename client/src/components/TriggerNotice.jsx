// What a guest sees when a park rule stops something or adds something. Guests never see database wording:
// no trigger names, tables or rule text. Two looks:
//   variant="blocked": the action was stopped (for example a double-booking). Plain words and, where it helps, a button.
//   variant="fired":   the action worked. A short confirmation, plus one plain line for each extra the park added.
//
// notice = { variant, message, trigger?, fired?, title? }   trigger / fired[] = { name, result? }
// The wording for the blocked look is in BLOCKED_COPY, keyed by trigger name. Add a line there to give a rule its own words.
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
  trg_Customer_BI_Dependent: {
    title: 'That child could not be added',
    help: 'Dependents must be under 18, and a parent can have up to 6. Check the date of birth and your places in use.',
  },
  trg_Customer_BU_Dependent: {
    title: 'Those details could not be saved',
    help: 'A dependent must be under 18 and the birth date cannot be in the future. Check the date of birth.',
  },
  trg_Ticket_BI_Window: {
    title: 'That date is too far away',
    help: 'Tickets go on sale 180 days before the visit. Pick an earlier date.',
    action: { label: 'Pick another date', tab: 'tickets' },
  },
  trg_Ticket_BU_Window: {
    title: 'That date is too far away',
    help: 'Tickets go on sale 180 days before the visit. Pick an earlier date.',
  },
  trg_TicketRefund_BI: {
    title: 'Too late for a refund',
    help: 'Refunds need at least 2 days notice before the visit. Weather closures are refunded automatically.',
    action: { label: 'View my tickets', tab: 'tickets' },
  },
  trg_Purchase_BI_Alcohol21: {
    title: 'Alcohol needs a guest who is 21 or older',
    help: 'Check the guest\'s date of birth. Pick a non-alcoholic item instead.',
  },
  trg_Purchase_BU_Alcohol21: {
    title: 'Alcohol needs a guest who is 21 or older',
    help: 'Check the guest\'s date of birth. Pick a non-alcoholic item instead.',
  },
  trg_Purchase_BI_DrinkLimit: {
    title: 'Drink limit reached',
    help: 'A ticket can have at most 8 alcoholic drinks per day.',
  },
  trg_Purchase_BU_DrinkLimit: {
    title: 'Drink limit reached',
    help: 'A ticket can have at most 8 alcoholic drinks per day.',
  },
  trg_Membership_BI_Adult: {
    title: 'Memberships are for adults',
    help: 'The membership holder must be 18 or older. Children are covered as dependents on a parent account.',
  },
  trg_Ticket_BI: {
    title: 'That ticket could not be booked',
    help: 'Try another date, or check what your membership covers.',
  },
  trg_Ticket_BI_WeatherClosed: {
    title: 'The park is closed for weather',
    help: 'Tickets for today are paused. You can still book a ticket for another day.',
    action: { label: 'Pick another date', tab: 'tickets' },
  },
  trg_Purchase_BI_WeatherClosed: {
    title: 'The park is closed for weather',
    help: 'Nothing was charged. Purchases resume when the park reopens.',
  },
  trg_GamePlay_BI_WeatherClosed: {
    title: 'The park is closed for weather',
    help: 'Nothing was charged. Games reopen when the park reopens.',
  },
}
const FALLBACK_COPY = { title: 'A park rule stopped that', help: 'Nothing was charged. Change the details and try again.' }

export default function TriggerNotice({ notice, onDismiss, onGo }) {
  if (!notice) return null

  if (notice.variant === 'fired') {
    return (
      <section className="pt-trg pt-trg-fired" role="status" aria-label="Confirmation">
        <div className="pt-trg-head">
          <span className="pt-trg-bolt" aria-hidden="true">✓</span>
          <div>
            <h2 className="pt-trg-title">{notice.title ?? 'All set'}</h2>
            {notice.message && <p className="pt-trg-msg">{notice.message}</p>}
          </div>
          <button type="button" className="pt-trg-x" aria-label="Dismiss" onClick={onDismiss}>×</button>
        </div>
        {notice.fired?.some((t) => t.result) && (
          <ul className="pt-trg-list">
            {notice.fired.filter((t) => t.result).map((t) => (
              <li key={t.name}>
                <p>{t.result}</p>
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
    <section className="pt-trg pt-trg-blocked" role="alert" aria-label="This could not be completed">
      <div className="pt-trg-head">
        <span className="pt-trg-bolt" aria-hidden="true">!</span>
        <div>
          <h2 className="pt-trg-title">{copy.title}</h2>
          <p className="pt-trg-msg">{notice.message}</p>
          <p className="pt-trg-help">{copy.help}</p>
        </div>
        <button type="button" className="pt-trg-x" aria-label="Dismiss" onClick={onDismiss}>×</button>
      </div>
      {copy.action && (
        <div className="pt-trg-actions">
          <button type="button" className="pt-btn pt-btn-sm" onClick={() => { onGo?.(copy.action.tab); onDismiss?.() }}>{copy.action.label}</button>
        </div>
      )}
    </section>
  )
}
