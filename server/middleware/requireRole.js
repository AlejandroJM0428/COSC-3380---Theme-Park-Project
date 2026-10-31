import { HttpError } from '../errors.js';
import { getSession } from '../session.js';

// requireRole('Admin', 'Manager')(handler): 401 if not logged in, 403 if the role is not listed.
export function requireRole(...roles) {
  return (handler) => async (ctx) => {
    const session = getSession(ctx.req);
    if (!session) throw new HttpError(401, 'Not logged in');
    if (!roles.includes(session.role)) throw new HttpError(403, 'Your role cannot do this');
    ctx.session = session;
    return handler(ctx);
  };
}
