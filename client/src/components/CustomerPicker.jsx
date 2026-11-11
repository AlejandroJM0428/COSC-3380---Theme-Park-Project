import { useEffect, useId, useRef, useState } from 'react'
import { searchCustomers } from '../api'
import ErrorBanner from './ErrorBanner.jsx'
import { membershipStatus } from './CustomerLookup.jsx'
import './CustomerLookup.css'

// Guest drop-down for Sell Ticket. Click the box and the first 20 guests (by last name) drop down, no typing needed.
// Typing narrows the list: the server is asked after a short pause (250 ms), and an answer that arrives late
// for older text is ignored. Arrow keys, Enter and Esc work. onPick(customer) gets the same full row as CustomerLookup.
const PAUSE_MS = 250
const PAGE = 20

export default function CustomerPicker({ onPick }) {
  const listId = useId()
  const boxRef = useRef(null)
  const latest = useRef(0) // id of the newest request; older answers are dropped
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState(null) // null = not loaded yet
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [active, setActive] = useState(0)

  function load(query) {
    const id = ++latest.current
    setBusy(true)
    setError('')
    searchCustomers(query.trim(), '', false, true)
      .then((r) => {
        if (id !== latest.current) return
        setRows(r)
        setActive(0)
      })
      .catch((err) => id === latest.current && setError(err.message))
      .finally(() => id === latest.current && setBusy(false))
  }

  // Typing: wait for a pause, then ask the server. The first open loads the unfiltered list.
  useEffect(() => {
    if (!open) return undefined
    const t = setTimeout(() => load(text), rows === null ? 0 : PAUSE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, open])

  // A click anywhere outside closes the list.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => boxRef.current && !boxRef.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function pick(c) {
    setOpen(false)
    onPick(c)
  }

  function onKey(e) {
    if (e.key === 'Escape') return setOpen(false)
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault()
      return setOpen(true)
    }
    if (!rows?.length) return undefined
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(rows[active])
    }
    return undefined
  }

  return (
    <div className="panel customer-picker" ref={boxRef}>
      <h2>Find guest</h2>
      <label htmlFor="cp-input">Guest</label>
      <div className="cp-field">
        <input
          id="cp-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={text}
          maxLength={60}
          placeholder="Click to choose a guest, or type a name"
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
          onKeyDown={onKey}
        />
        <span className="cp-caret" aria-hidden="true" />
      </div>

      {open && (
        <ul className="cp-list" id={listId} role="listbox">
          {busy && !rows && <li className="cp-note">Loading guests…</li>}
          {rows?.length === 0 && !busy && <li className="cp-note">No active guests match. Check the spelling.</li>}
          {rows?.map((c, i) => (
            <li key={c.CustomerID} role="option" aria-selected={i === active} className={i === active ? 'is-active' : ''} onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}>
              <strong>{c.FullName}</strong> · DOB: {String(c.DOB).slice(0, 10)}
              <span className={`cl-member ${c.MembershipID ? 'is-member' : ''}`}>{membershipStatus(c)}</span>
            </li>
          ))}
          {rows?.length === PAGE && <li className="cp-note">Showing the first {PAGE}. Type more of the name to narrow the list.</li>}
          {busy && rows && <li className="cp-note">Updating…</li>}
        </ul>
      )}
      <ErrorBanner message={error} onClose={() => setError('')} />
    </div>
  )
}
