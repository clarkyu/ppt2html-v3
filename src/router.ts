export type Route =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'settings' }
  | { name: 'play'; id: string }
  | { name: 'edit'; id: string }
  | { name: 'share'; data: string }
  | { name: 'templates' }

/** decodeURIComponent that tolerates a truncated/mangled escape (a link cut
 * short by a chat client): the raw segment then simply misses in the library
 * and hits the not-found screen, instead of a URIError at module init that
 * left the whole app blank. */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '')
  const [seg, ...rest] = clean.split('/')
  if (seg === 'library') return { name: 'library' }
  if (seg === 'settings') return { name: 'settings' }
  if (seg === 'templates') return { name: 'templates' }
  if (seg === 'play' && rest[0]) return { name: 'play', id: safeDecode(rest[0]) }
  if (seg === 'edit' && rest[0]) return { name: 'edit', id: safeDecode(rest[0]) }
  // Shared deck: the payload is base64url (never contains '/'), so rest[0] is the whole blob.
  if (seg === 's' && rest[0]) return { name: 'share', data: rest[0] }
  return { name: 'home' }
}

export function navigate(to: string): void {
  if (location.hash === to) {
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    location.hash = to
  }
}
