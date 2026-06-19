/**
 * ms-auth-ui.js — Amstro-branded login overlay for ms-auth
 * Requires ms-auth.js to be loaded first.
 *
 * Usage:
 *   MsAuthUI.init({ clientId, tenantId, scopes, redirectUri, appName })
 *
 * Optional callback:
 *   MsAuthUI.init(config, { onLogin: function(claims) { ... } })
 *
 * After login the library:
 *   - Populates #userInfo and wires #btnLogout if those elements exist in the page.
 *   - Otherwise injects a small fixed user chip in the top-right corner.
 */
var MsAuthUI = (function () {
  'use strict';

  var MS_ICON = '<svg width="18" height="18" viewBox="0 0 21 21" fill="none" style="flex-shrink:0">'
    + '<rect x="1" y="1" width="9" height="9" fill="#f25022"/>'
    + '<rect x="11" y="1" width="9" height="9" fill="#7fba00"/>'
    + '<rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>'
    + '<rect x="11" y="11" width="9" height="9" fill="#ffb900"/>'
    + '</svg>';

  var CSS = [
    // Overlay
    '#msauth-overlay{position:fixed;inset:0;background:radial-gradient(ellipse at 0% 0%,#2e4a1e 0%,#1B281B 40%,#0a1209 100%),radial-gradient(ellipse at 100% 100%,#243d18 0%,transparent 50%);background-blend-mode:screen;z-index:9999;display:flex;align-items:center;justify-content:center}',
    // Card — frosted glass effect to stand out against the gradient
    '#msauth-box{background:rgba(12,22,12,.72);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(191,232,112,.22);border-radius:16px;padding:44px 44px 40px;width:100%;max-width:360px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;color:#f0f5e8;box-sizing:border-box;box-shadow:0 8px 40px rgba(0,0,0,.5),0 1px 0 rgba(191,232,112,.08) inset}',
    // Decorative arcs — both circles travel together as one unified graphic element.
    // The wrapper centers its midpoint on each screen corner in turn (so only quadrant arcs are visible).
    // The two inner circles are offset from each other to recreate the intersecting-arc look from the brandbook.
    // Circles are 900px — only a small arc is visible when centered at each corner.
    // No fill, just stroke lines like the brandbook cover.
    '@keyframes msauth-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
    '#msauth-arcs,#msauth-arcs2{position:fixed;width:900px;height:900px;pointer-events:none;z-index:10000}',
    '#msauth-arcs{top:-450px;left:-450px}',
    '#msauth-arcs2{bottom:-450px;right:-450px}',
    '#msauth-spin{position:absolute;top:0;left:0;width:900px;height:900px;animation:msauth-spin 18s linear infinite}',
    '#msauth-spin2{position:absolute;top:0;left:0;width:900px;height:900px;animation:msauth-spin 24s linear infinite reverse}',
    '#msauth-arc,#msauth-arc3{position:absolute;top:0;left:0;width:900px;height:900px;border:1.5px solid rgba(191,232,112,.5);border-radius:50%}',
    '#msauth-arc2,#msauth-arc4{position:absolute;top:-100px;left:120px;width:900px;height:900px;border:1.5px solid rgba(191,232,112,.3);border-radius:50%}',
    // Background watermark — white logo, screen blend makes the PNG background disappear
    '#msauth-content{display:flex;flex-direction:column;align-items:center;gap:24px;width:100%;max-width:360px}',
    '#msauth-content img{width:180px;opacity:.9;user-select:none;-webkit-user-drag:none}',
    '#msauth-box h2{font-size:15px;font-weight:600;color:#fff;margin:0 0 5px}',
    '#msauth-box p{font-size:11px;color:rgba(240,245,232,.35);margin:0 0 28px}',
    // Microsoft button
    '#msauth-btn{width:100%;background:#fff;color:#1b1b1b;border:1.5px solid #e0e0e0;border-radius:7px;padding:11px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:background .2s;display:flex;align-items:center;justify-content:center;gap:10px;box-sizing:border-box}',
    '#msauth-btn:hover{background:#f0f0f0}',
    '#msauth-btn:disabled{opacity:.6;cursor:not-allowed}',
    // Error text
    '#msauth-err{font-size:11px;color:#f87171;margin-top:10px;min-height:16px}',
    // Fallback user chip (injected when #userInfo doesn't exist)
    '#msauth-chip{position:fixed;top:10px;right:16px;background:#1B281B;border:1px solid rgba(191,232,112,.22);border-radius:20px;padding:5px 12px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:11px;color:rgba(240,245,232,.7);display:flex;align-items:center;gap:8px;z-index:9998}',
    '#msauth-chip-logout{background:none;border:none;color:rgba(240,245,232,.4);font-size:11px;cursor:pointer;padding:0}',
    '#msauth-chip-logout:hover{color:#f87171}'
  ].join('');

  // ── Internal helpers ───────────────────────────────────────────────────────

  function _injectStyles() {
    if (document.getElementById('msauth-styles')) return;
    var s = document.createElement('style');
    s.id = 'msauth-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function _buildOverlay(appName) {
    var div = document.createElement('div');
    div.id = 'msauth-overlay';
    div.innerHTML =
      '<div id="msauth-arcs"><div id="msauth-spin"><div id="msauth-arc"></div><div id="msauth-arc2"></div></div></div>'
      + '<div id="msauth-arcs2"><div id="msauth-spin2"><div id="msauth-arc3"></div><div id="msauth-arc4"></div></div></div>'
      + '<div id="msauth-content">'
      + '<img src="Logo Amstro_Logo verde2.png" alt="AMSTRO">'
      + '<div id="msauth-box">'
      + '<h2>' + appName + '</h2>'
      + '<p>Accede con tu cuenta corporativa de Microsoft</p>'
      + '<button id="msauth-btn">' + MS_ICON + ' Iniciar sesión con Microsoft</button>'
      + '<div id="msauth-err"></div>'
      + '</div>'
      + '</div>';
    document.body.appendChild(div);
  }

  function _applyUserInfo(claims) {
    var name = claims.name || claims.preferred_username || claims.unique_name || '';

    // Populate existing project elements if present.
    var elInfo   = document.getElementById('userInfo');
    var elLogout = document.getElementById('btnLogout');
    if (elInfo)   { if (name) elInfo.textContent = name; elInfo.style.display = ''; }
    if (elLogout) {
      elLogout.onclick = function () { MsAuth.logout(); location.reload(); };
      elLogout.style.display = '';
    }

    // If the project has no user elements, inject a fixed chip in the corner.
    if (!elInfo && !document.getElementById('msauth-chip')) {
      var chip = document.createElement('div');
      chip.id = 'msauth-chip';
      chip.innerHTML =
        '<span>' + name + '</span>'
        + '<button id="msauth-chip-logout" onclick="MsAuth.logout();location.reload()">Salir</button>';
      document.body.appendChild(chip);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function init(config, options) {
    options = options || {};
    var appName = config.appName || document.title || 'AMSTROQACALL';

    _injectStyles();

    // Already authenticated — skip the overlay entirely.
    if (MsAuth.isAuthenticated()) {
      _applyUserInfo(MsAuth.getClaims());
      if (options.onLogin) options.onLogin(MsAuth.getClaims());
      return;
    }

    _buildOverlay(appName);

    document.getElementById('msauth-btn').addEventListener('click', async function () {
      var btn = document.getElementById('msauth-btn');
      var err = document.getElementById('msauth-err');
      btn.disabled = true;
      btn.innerHTML = MS_ICON + ' Conectando...';
      err.textContent = '';
      try {
        await MsAuth.getToken(config);
        document.getElementById('msauth-overlay').remove();
        var claims = MsAuth.getClaims();
        _applyUserInfo(claims);
        if (options.onLogin) options.onLogin(claims);
      } catch (e) {
        err.textContent = e.message || 'Error al iniciar sesión';
        btn.disabled = false;
        btn.innerHTML = MS_ICON + ' Iniciar sesión con Microsoft';
      }
    });
  }

  return { init: init };
})();
