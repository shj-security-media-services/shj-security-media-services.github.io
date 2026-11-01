/* SPA80 real API client v1.
   One POST per demanded screen to the fixed n8n webhook, as a CORS "simple request":
   form-urlencoded body, no custom headers, no cookies (credentials 'omit').
   The token travels only in the POST body (field s), never in the URL. */
import {API_ENDPOINT} from './config.mjs';
import {OPS, cleanParams} from './shapes.mjs';

export const MAX_RESPONSE_CHARS = 2_000_000;

export function encodeRequest(token, op, params = {}) {
  if (!OPS.includes(op)) throw new TypeError('BAD_OP');
  if (typeof token !== 'string' || token.length === 0) throw new TypeError('NO_TOKEN');
  const p = cleanParams(op, params);
  if (op === 'order' && !p.id) throw new TypeError('BAD_ID');
  const form = new URLSearchParams();
  form.set('a', 'api');
  form.set('s', token);
  form.set('op', op);
  form.set('p', JSON.stringify(p));
  return form.toString();
}

export function requestInit(body, signal) {
  const init = {
    method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store',
    redirect: 'error', referrerPolicy: 'no-referrer',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body
  };
  if (signal) init.signal = signal;
  return init;
}

// Maps an HTTP status + raw text to {status, body?}. The controller validates body shape.
export function parseResponse(status, raw) {
  if (status === 401 || status === 403) return {status};
  if (!(status >= 200 && status < 300)) return {status: status || 0};
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_RESPONSE_CHARS) return {status: 502};
  let body;
  try { body = JSON.parse(raw); } catch { return {status: 502}; }
  if (body && typeof body === 'object' && body.ok === false) {
    const code = Number(body.status ?? body.code);
    return {status: code === 401 || code === 403 ? code : 502};
  }
  return {status: 200, body};
}

export function createRealApi({getToken, fetchImpl = globalThis.fetch?.bind(globalThis), endpoint = API_ENDPOINT} = {}) {
  if (typeof getToken !== 'function') throw new TypeError('getToken required');
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.includes('?') || endpoint.includes('#')) throw new TypeError('BAD_ENDPOINT');
  return {
    async read(op, params = {}, {signal} = {}) {
      const token = getToken();
      if (!token) return {status: 401}; // no network call without a token
      const body = encodeRequest(token, op, params);
      const response = await fetchImpl(endpoint, requestInit(body, signal));
      const raw = response.status >= 200 && response.status < 300 ? await response.text() : '';
      return parseResponse(response.status, raw);
    }
  };
}
