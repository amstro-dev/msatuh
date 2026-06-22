/**
 * ms-auth.js — Azure AD PKCE authentication for single-page apps
 * No dependencies. Load via <script> tag.
 *
 * API:
 *   MsAuth.getToken(config)      → Promise<string>  — returns a valid access token (popup flow)
 *   MsAuth.logout()              → void             — clears cached token
 *   MsAuth.isAuthenticated()     → boolean          — true if a non-expired token is cached
 *   MsAuth.getClaims()           → object           — decoded JWT payload of the cached token
 *
 * config shape:
 *   { clientId, tenantId, scopes, redirectUri }
 *   scopes defaults to ['https://graph.microsoft.com/Sites.Read.All']
 *   redirectUri defaults to current page URL
 */
var MsAuth = (function () {
  'use strict';

  var KEY_TOKEN   = 'ms_auth_token';
  var KEY_EXP     = 'ms_auth_exp';
  var KEY_CODE    = 'ms_auth_code';    // localStorage relay between popup and opener
  var KEY_PKCE    = 'ms_auth_pkce';
  var KEY_PENDING = 'ms_auth_pending'; // code from a redirect-based (non-popup) flow

  // If this page is the OAuth popup, relay the code and close immediately.
  (function () {
    var code = new URLSearchParams(window.location.search).get('code');
    if (!code) return;
    localStorage.setItem(KEY_CODE, code);
    if (window.opener) {
      try { window.opener.postMessage({ type: KEY_CODE, code: code }, window.location.origin); } catch (e) {}
    }
    window.history.replaceState({}, '', window.location.pathname);
    window.close();
  })();

  // ── Public API ─────────────────────────────────────────────────────────────

  async function getToken(cfg) {
    var clientId    = cfg.clientId;
    var tenantId    = cfg.tenantId;
    var scopes      = cfg.scopes || ['https://graph.microsoft.com/Sites.Read.All'];
    var redirectUri = cfg.redirectUri || (window.location.origin + window.location.pathname);

    if (!clientId || !tenantId) throw new Error('MsAuth: clientId y tenantId son obligatorios');

    // Return cached token if still valid.
    var cached = sessionStorage.getItem(KEY_TOKEN);
    var exp    = parseInt(sessionStorage.getItem(KEY_EXP) || '0');
    if (cached && Date.now() < exp) return cached;

    // Exchange a pending code from a redirect-based flow (popup-blocked fallback).
    var pending = sessionStorage.getItem(KEY_PENDING);
    if (pending) {
      sessionStorage.removeItem(KEY_PENDING);
      return _exchangeCode(pending, sessionStorage.getItem(KEY_PKCE), clientId, tenantId, redirectUri);
    }

    // Generate PKCE verifier + challenge and open the Microsoft login popup.
    var arr      = crypto.getRandomValues(new Uint8Array(32));
    var verifier = btoa(String.fromCharCode.apply(null, arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    var buf      = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    var challenge = btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    var authUrl = 'https://login.microsoftonline.com/' + tenantId + '/oauth2/v2.0/authorize'
      + '?client_id='              + clientId
      + '&response_type=code'
      + '&redirect_uri='           + encodeURIComponent(redirectUri)
      + '&scope='                  + encodeURIComponent(scopes.join(' ') + ' offline_access')
      + '&code_challenge='         + challenge
      + '&code_challenge_method=S256'
      + '&prompt=select_account';

    localStorage.removeItem(KEY_CODE);
    return new Promise(function (resolve, reject) {
      var popup = window.open(authUrl, 'ms_auth_popup', 'width=520,height=640,left=200,top=100');
      if (!popup) {
        reject(new Error('Popup bloqueado — permite popups para esta página e inténtalo de nuevo'));
        return;
      }
      var done = false;

      function handleCode(code) {
        if (done) return; done = true;
        clearInterval(timer);
        window.removeEventListener('message', onMsg);
        window.removeEventListener('storage', onStorage);
        _exchangeCode(code, verifier, clientId, tenantId, redirectUri).then(resolve).catch(reject);
      }

      function onMsg(ev) {
        if (ev.origin !== window.location.origin) return;
        if (!ev.data || ev.data.type !== KEY_CODE) return;
        handleCode(ev.data.code);
      }
      function onStorage(ev) {
        if (ev.key !== KEY_CODE || !ev.newValue) return;
        localStorage.removeItem(KEY_CODE);
        handleCode(ev.newValue);
      }

      window.addEventListener('message', onMsg);
      window.addEventListener('storage', onStorage);
      // SSO may complete before listeners attach — check immediately.
      var earlyCode = localStorage.getItem(KEY_CODE);
      if (earlyCode) { localStorage.removeItem(KEY_CODE); handleCode(earlyCode); }

      var timer = setInterval(function () {
        var closed = false;
        try { closed = popup.closed; } catch (e) { closed = true; }
        if (!closed) return;
        clearInterval(timer);
        // Give the storage event time to arrive before rejecting.
        setTimeout(function () {
          if (!done) {
            window.removeEventListener('message', onMsg);
            window.removeEventListener('storage', onStorage);
            reject(new Error('Login cancelado'));
          }
        }, 8000);
      }, 500);
    });
  }

  function logout() {
    sessionStorage.removeItem(KEY_TOKEN);
    sessionStorage.removeItem(KEY_EXP);
  }

  function isAuthenticated() {
    var cached = sessionStorage.getItem(KEY_TOKEN);
    var exp    = parseInt(sessionStorage.getItem(KEY_EXP) || '0');
    return !!(cached && Date.now() < exp);
  }

  function getClaims() {
    var token = sessionStorage.getItem(KEY_TOKEN);
    if (!token) return {};
    try {
      var base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var bytes = Uint8Array.from(atob(base64), function (c) { return c.charCodeAt(0); });
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) { return {}; }
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  async function _exchangeCode(code, verifier, clientId, tenantId, redirectUri) {
    var body = new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     clientId,
      code:          code,
      redirect_uri:  redirectUri,
      code_verifier: verifier
    });
    var d = await fetch(
      'https://login.microsoftonline.com/' + tenantId + '/oauth2/v2.0/token',
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() }
    ).then(function (r) { return r.ok ? r.json() : r.text().then(function (t) { throw new Error(t); }); });

    sessionStorage.setItem(KEY_TOKEN, d.access_token);
    sessionStorage.setItem(KEY_EXP,   Date.now() + (d.expires_in - 60) * 1000);
    return d.access_token;
  }

  return { getToken: getToken, logout: logout, isAuthenticated: isAuthenticated, getClaims: getClaims };
})();
