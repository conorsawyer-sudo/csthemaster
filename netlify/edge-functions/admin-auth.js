// Password gate for int-tcg.com/admin. Runs before the admin page loads.
// Logins live in the Netlify environment variable ADMIN_LOGINS, e.g.
//   conor:a-long-password,adam:another-long-password
// If ADMIN_LOGINS is not set, nobody can open /admin.
export default async (request, context) => {
  const raw = Netlify.env.get('ADMIN_LOGINS') || '';
  const logins = raw.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const i = s.indexOf(':');
    return i > 0 ? [s.slice(0, i).trim().toLowerCase(), s.slice(i + 1)] : null;
  }).filter(Boolean);

  const header = request.headers.get('authorization') || '';
  if (logins.length && header.startsWith('Basic ')) {
    let user = '', pass = '';
    try {
      const decoded = atob(header.slice(6));
      const i = decoded.indexOf(':');
      user = decoded.slice(0, i).trim().toLowerCase();
      pass = decoded.slice(i + 1);
    } catch (e) {}
    if (logins.some(([u, p]) => u === user && same(p, pass))) {
      const res = await context.next();
      res.headers.set('Cache-Control', 'no-store');
      res.headers.set('X-Robots-Tag', 'noindex');
      return res;
    }
  }
  return new Response(logins.length ? 'Login required.' : 'Admin logins are not set up yet.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="International TCG admin", charset="UTF-8"', 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
};

function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const config = { path: ['/admin', '/admin/*'] };
