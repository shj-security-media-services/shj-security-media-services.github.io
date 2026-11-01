/* SPA80 token handling v1.
   The token arrives once as location.hash "#s=<token>", is kept in sessionStorage
   (memory fallback if storage is blocked) and is removed from the URL at once. */
import {TOKEN_KEY} from './config.mjs';

export const validToken = t => typeof t === 'string' && t.length >= 8 && t.length <= 2048 && /^[\x21-\x7e]+$/.test(t);

// "#s=abc" or "#s=abc&..." -> "abc"; anything else -> null.
export function parseHashToken(hash) {
  if (typeof hash !== 'string') return null;
  const m = /^#s=([^&]*)/.exec(hash);
  if (!m) return null;
  let value;
  try { value = decodeURIComponent(m[1]); } catch { return null; }
  return validToken(value) ? value : null;
}

export function createTokenStore({storage = null, key = TOKEN_KEY} = {}) {
  let memory = null;
  return {
    get() {
      if (memory) return memory;
      try { const v = storage?.getItem(key); if (validToken(v)) memory = v; } catch {}
      return memory;
    },
    set(token) {
      if (!validToken(token)) return false;
      memory = token;
      try { storage?.setItem(key, token); } catch {}
      return true;
    },
    clear() {
      memory = null;
      try { storage?.removeItem(key); } catch {}
    }
  };
}

// Strips any "#s=" from the address bar; stores a valid token. Returns the token or null.
export function captureTokenFromLocation({location, history, store, route = '#/home'}) {
  const hash = location?.hash || '';
  if (!hash.startsWith('#s=')) return null;
  const token = parseHashToken(hash);
  if (token) store.set(token);
  const clean = location.pathname + location.search + route;
  try { history.replaceState(history.state ?? null, '', clean); }
  catch { try { location.replace(clean); } catch {} }
  return token;
}

export function safeSessionStorage(win) {
  try { const s = win.sessionStorage; s.getItem('_'); return s; } catch { return null; }
}
