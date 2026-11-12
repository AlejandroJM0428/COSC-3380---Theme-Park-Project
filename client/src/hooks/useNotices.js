import { useSyncExternalStore } from 'react'
import { listNotifications } from '../api/index.js'

// Active park notices (sold out, weather, maintenance, new or retired rides, promos). Empty until the first answer.
// ONE shared store for the whole app: the banner, the portal notice list and the pop-up all read the same list,
// and there is one fetch loop no matter how many of them are on screen. The loop starts with the first reader
// and stops with the last one.
// Refreshes every 10 seconds so a new notice shows within about 10 s of the database trigger posting it.
// The timer stops while the tab is hidden, and the list is fetched again the moment the tab comes back or gets focus.
// A failed refresh keeps the last good list instead of blanking the banner.
const POLL_MS = 10 * 1000

let items = []
let timer = null
const listeners = new Set()

function load() {
  listNotifications()
    .then((data) => {
      const next = Array.isArray(data) ? data : []
      // Keep the same array when nothing changed, so readers do not re-render every 10 seconds.
      if (JSON.stringify(next) !== JSON.stringify(items)) {
        items = next
        listeners.forEach((fn) => fn())
      }
    })
    .catch(() => {})
}

function startTimer() {
  if (timer == null) timer = setInterval(load, POLL_MS)
}

function stopTimer() {
  if (timer != null) {
    clearInterval(timer)
    timer = null
  }
}

function onVisibility() {
  if (document.visibilityState === 'visible') {
    load()
    startTimer()
  } else {
    stopTimer()
  }
}

function start() {
  load()
  if (document.visibilityState === 'visible') startTimer()
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', load)
}

function stop() {
  stopTimer()
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('focus', load)
}

function subscribe(listener) {
  listeners.add(listener)
  if (listeners.size === 1) start()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stop()
  }
}

const getSnapshot = () => items

export default function useNotices() {
  return useSyncExternalStore(subscribe, getSnapshot)
}
