/** Ports of the servers the tests start (not the app's own, so a running app does not matter). */
export const WEB_PORT = 1431;
export const API_PORT = 24052;
export const API = `http://127.0.0.1:${API_PORT}/api/v1`;
export const WS = `ws://127.0.0.1:${API_PORT}/api/v1`;
