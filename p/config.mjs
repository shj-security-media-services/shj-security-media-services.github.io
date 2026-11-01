/* SPA80 config v1. Static values only. No secrets live in this file. */
export const API_ENDPOINT = 'https://ahmedzenary.app.n8n.cloud/webhook/tasweer-admin';
// Decision / assignment / save controls stay hidden until the backend supports writes.
export const WRITE_ENABLED = false;
// sessionStorage key for the panel token (never localStorage, never a URL query).
export const TOKEN_KEY = 'spa80.s';
// localStorage key for the light/dark preference only.
export const THEME_KEY = 'spa80.theme';
// IndexedDB name used ONLY by ?mock=1 synthetic data.
export const MOCK_DB_NAME = 'SPA80-Mock-Cache-v1';
