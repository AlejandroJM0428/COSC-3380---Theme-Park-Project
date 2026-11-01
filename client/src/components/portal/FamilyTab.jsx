import { useCallback, useEffect, useRef, useState } from 'react'
import { addDependent, getFamily } from '../../api/index.js'
import DependentCard from './DependentCard.jsx'
import { dobWindow } from './familyDates.js'

const EMPTY_FORM = { firstName: '', dob: '', heightCm: '', consent: false }

// My Family: children under 18 the signed-in customer can buy tickets for. A dependent is stored by the
// park with a first name, date of birth and height only, and the parent's consent. They have no login.
//   messages: { clear, fail(err, fallback), ok(text), notice(obj) } from the portal page. This tab loads its
//             own data (GET /api/family) because it is separate from the dashboard.
export default function FamilyTab({ messages }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' })
  const [form, setForm] = useState(EMPTY_FORM)
  const [adding, setAdding] = useState(false)
  const addLock = useRef(false)

  // Messages show at the top of the page, so bring the person back up to read them.
  const up = () => window.scrollTo({ top: 0, behavior: 'smooth' })
  const say = {
    clear: messages.clear,
    fail: (err, fallback) => { messages.fail(err, fallback); up() },
    ok: (text) => { messages.ok(text); up() },
    notice: (n) => { messages.notice(n); up() },
  }

  const reload = useCallback(async () => {
    try {
      const data = await getFamily()
      setState({ loading: false, data, error: '' })
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message || 'Could not load your family.' }))
    }
  }, [])

  useEffect(() => {
    let alive = true
    getFamily()
      .then((data) => { if (alive) setState({ loading: false, data, error: '' }) })
      .catch((err) => { if (alive) setState((s) => ({ ...s, loading: false, error: err.message || 'Could not load your family.' })) })
    return () => { alive = false }
  }, [])

  const dependents = state.data?.dependents ?? []
  const limit = state.data?.limit ?? 6
  const full = dependents.length >= limit
  const dobRange = dobWindow()

  async function handleAdd(event) {
    event.preventDefault()
    if (addLock.current) return
    addLock.current = true
    messages.clear()
    setAdding(true)
    try {
      await addDependent({ firstName: form.firstName, dob: form.dob, heightCm: Number(form.heightCm), consent: form.consent })
      say.ok(`${form.firstName.trim()} was added. You can buy their ticket now.`)
      setForm(EMPTY_FORM)
      await reload()
    } catch (err) {
      say.fail(err, 'Could not add the dependent.')
    } finally {
      setAdding(false)
      addLock.current = false
    }
  }

  return (
    <div className="pt-split">
      <form className="pt-card pt-form" onSubmit={handleAdd}>
        <h2>Add a child</h2>
        <p className="pt-sub">For children under 18. They get a discounted day pass, and children under 3 are free. You will see the exact price before you confirm a ticket.</p>

        <label htmlFor="pt-dep-first">First name</label>
        <input id="pt-dep-first" type="text" maxLength={50} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} disabled={full || adding} required />

        <label htmlFor="pt-dep-dob">Date of birth</label>
        <input id="pt-dep-dob" type="date" min={dobRange.min} max={dobRange.max} value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} disabled={full || adding} required />

        <label htmlFor="pt-dep-height">Height (cm)</label>
        <input id="pt-dep-height" type="number" min={30} max={260} step={1} value={form.heightCm} onChange={(e) => setForm({ ...form, heightCm: e.target.value })} disabled={full || adding} required />
        <p className="pt-fine">Height decides which rides they can board.</p>

        <label className="pt-check pt-consent" htmlFor="pt-dep-consent">
          <input id="pt-dep-consent" type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} disabled={full || adding} required />
          <span>
            I am this child's parent or legal guardian
            <small>I agree the park may keep their first name, date of birth and height so I can buy their tickets and so ride height checks work. The park also records the date and time of this consent. I can remove them at any time.</small>
          </span>
          <span />
        </label>

        {full
          ? <p className="pt-fine pt-fine-error" role="status">You have {dependents.length} of {limit} places in use. Remove a child to add another.</p>
          : <p className="pt-fine">{dependents.length} of {limit} places in use.</p>}
        <button type="submit" className="pt-btn" disabled={full || adding || state.loading || !form.consent}>{adding ? 'Adding…' : 'Add child'}</button>
      </form>

      <div>
        {state.error && <div className="pt-alert pt-alert-error" role="alert"><strong>Something needs attention</strong><span>{state.error}</span></div>}
        {state.loading ? <section className="pt-card"><p className="pt-empty">Loading your family…</p></section>
          : dependents.length === 0 ? <section className="pt-card"><p className="pt-empty">No children added yet. Add one on the left to buy their ticket.</p></section>
            : dependents.map((dep) => <DependentCard key={dep.customerId} dep={dep} onChanged={reload} messages={say} />)}
      </div>
    </div>
  )
}
