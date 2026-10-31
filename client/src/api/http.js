// The ONLY place that talks to the network. Every call goes to /api/..., which the
// Vite dev server forwards to the backend (see the proxy in vite.config.js).
// Sent on window when the server says "not logged in" (HTTP 401) for a page request, for example after the
// server restarted and forgot the session. AuthProvider listens and signs the user out, so the routes send them to login.
export const SESSION_EXPIRED = 'themepark:session-expired'

export async function http(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    })
  } catch {
    throw new Error('Could not reach the server. Is it running?')
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    // empty or non-JSON body; fall through
  }

  if (!res.ok) {
    // A wrong password at login is also a 401, so the /auth/ calls are left out.
    if (res.status === 401 && !path.startsWith('/auth/') && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SESSION_EXPIRED))
    }
    // Database triggers send messages like "Park is at capacity for that date".
    // The backend should return them as { "message": "..." } so they show up here.
    throw new Error(data?.message ?? `Request failed (${res.status})`)
  }
  return data
}
