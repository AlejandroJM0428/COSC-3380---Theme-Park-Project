import LookupField from './LookupField.jsx'
import DateTimeField from './DateTimeField.jsx'

// The input fields of one record form, driven by entity.fields (see config/entities.js).
// Moved out of RecordManager so the report edit dialog can reuse it. No behavior change.
export default function FormFields({ entity, form, setForm, lookups, user }) {
  // An entity may add `onFieldChange(key, value, form, lookups)` to fill other fields when one changes (it returns the extra values, or null).
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value, ...(entity.onFieldChange?.(key, value, f, lookups) ?? {}) }))

  function renderField(field) {
    if (field.show && !field.show(form)) return null
    const value = form[field.key]
    const options = field.optionsFrom ? field.optionsFrom(form, lookups) : (field.options ?? [])
    const id = `f-${field.key}`

    if (field.type === 'multicheck') {
      return (
        <fieldset key={field.key} className={`rm-field rm-check-group ${field.wide ? 'rm-wide' : ''}`}>
          <legend>{field.label}</legend>
          {options.length === 0 && <span className="muted">None available.</span>}
          {options.map(([v, label]) => (
            <label key={v} className="rm-check">
              <input
                type="checkbox"
                checked={value.includes(v)}
                onChange={(e) => set(field.key, e.target.checked ? [...value, v] : value.filter((x) => x !== v))}
              />
              {label}
            </label>
          ))}
        </fieldset>
      )
    }

    let input
    if (field.type === 'lookup') {
      // Pick a guest, ticket or membership by what a person knows. The form keeps the ID, nobody sees or types it.
      return (
        <div key={field.key} className={`rm-field ${field.wide ?? true ? 'rm-wide' : ''}`}>
          <span id={`${id}-label`}>{field.label}</span>
          <LookupField
            id={id}
            kind={field.kind}
            value={value}
            required={field.required}
            forCustomer={field.forCustomerKey ? form[field.forCustomerKey] : undefined}
            needsLogin={field.needsLogin}
            onChange={(v) => set(field.key, v)}
          />
        </div>
      )
    }
    if (field.type === 'whenNow') {
      // "Now" (empty, the server stamps the time) or a picked date and time. Opens on Now, so nobody touches the calendar.
      const picked = (value ?? '') !== ''
      const stamp = () => {
        const d = new Date()
        const p = (n) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
      }
      return (
        <div key={field.key} className="rm-field rm-wide">
          <span id={`${id}-label`}>{field.label}</span>
          <div className="rm-when" role="group" aria-labelledby={`${id}-label`}>
            <button type="button" className={picked ? '' : 'rm-when-on'} aria-pressed={!picked} onClick={() => set(field.key, '')}>
              Now
            </button>
            <button type="button" className={picked ? 'rm-when-on' : ''} aria-pressed={picked} onClick={() => !picked && set(field.key, stamp())}>
              Pick a time
            </button>
            {picked && <DateTimeField id={id} value={value} onChange={(v) => set(field.key, v)} required />}
          </div>
        </div>
      )
    }
    if (field.type === 'select') {
      input = (
        <select id={id} value={value} required={field.required} onChange={(e) => set(field.key, e.target.value)}>
          {field.required && value === '' && <option value="">— choose —</option>}
          {options.map(([v, label]) => (
            <option key={v} value={v} disabled={Boolean(field.optionLock?.(v, user))}>
              {label}
            </option>
          ))}
        </select>
      )
    } else if (field.type === 'datetime') {
      // Date and time in two quick clicks (see DateTimeField), instead of the browser's clunky date-time box.
      return (
        <div key={field.key} className={`rm-field ${field.wide ? 'rm-wide' : ''}`}>
          <span id={`${id}-label`}>{field.label}</span>
          <DateTimeField id={id} value={value} onChange={(v) => set(field.key, v)} required={field.required} />
        </div>
      )
    } else {
      const type = field.type
      input = (
        <input
          id={id}
          type={type}
          value={value}
          required={field.required}
          maxLength={field.maxLength}
          min={field.min}
          step={field.step}
          onChange={(e) => set(field.key, e.target.value)}
        />
      )
    }
    return (
      <label key={field.key} htmlFor={id} className={`rm-field ${field.wide ? 'rm-wide' : ''}`}>
        {field.label}
        {input}
      </label>
    )
  }

  return <>{entity.fields.map(renderField)}</>
}
