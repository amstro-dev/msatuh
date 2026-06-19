# ms-auth

Librería JavaScript sin dependencias para autenticación con Azure AD (Microsoft Entra ID) en single-page apps mediante OAuth 2.0 PKCE.

## Uso rápido

```html
<!-- Cargar desde CDN -->
<script src="https://cdn.jsdelivr.net/gh/amstro-jpa/ms-auth@main/ms-auth.js"></script>
```

```js
// En tu proyecto: botón de login
async function doLogin() {
  try {
    var token = await MsAuth.getToken({
      clientId:    'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      tenantId:    'tuempresa.onmicrosoft.com',
      scopes:      ['https://graph.microsoft.com/Sites.Read.All'],
      redirectUri: window.location.origin + '/index.html'
    });
    // token listo — úsalo como Bearer en tus llamadas a Graph API
  } catch (e) {
    console.error(e.message);
  }
}

// Cerrar sesión
function doLogout() {
  MsAuth.logout();
  location.reload();
}

// Mostrar nombre del usuario
var claims = MsAuth.getClaims();
console.log(claims.name || claims.preferred_username);
```

## API

| Función | Descripción |
|---------|-------------|
| `MsAuth.getToken(config)` | Devuelve `Promise<string>` con el access token. Si hay uno cacheado y válido, lo devuelve sin popup. |
| `MsAuth.logout()` | Borra el token cacheado. |
| `MsAuth.isAuthenticated()` | `true` si hay un token válido en sesión. |
| `MsAuth.getClaims()` | Objeto con el payload del JWT cacheado (contiene `name`, `preferred_username`, etc.). |

### Parámetros de `getToken(config)`

| Campo | Obligatorio | Descripción |
|-------|-------------|-------------|
| `clientId` | ✓ | ID de aplicación registrada en Azure AD / Entra ID |
| `tenantId` | ✓ | Tenant (`tuempresa.onmicrosoft.com` o el GUID) |
| `scopes` | | Array de scopes. Por defecto: `['https://graph.microsoft.com/Sites.Read.All']` |
| `redirectUri` | | URI de redirección. Por defecto: URL de la página actual |

## Requisitos en Azure AD (Entra ID)

1. **Entra ID → Registros de aplicaciones → tu app → Autenticación**
2. Añadir una plataforma **Aplicación de página única (SPA)**
3. Registrar la URI de redirección de tu app (ej. `https://tu-app.azurestaticapps.net/index.html`)
4. Para desarrollo local añadir también `http://localhost:3000/index.html`

La app **no necesita secreto de cliente** — PKCE es el mecanismo de seguridad.

## Cómo funciona

Utiliza el flujo [Authorization Code + PKCE](https://learn.microsoft.com/azure/active-directory/develop/v2-oauth2-auth-code-flow):

1. Genera un `code_verifier` aleatorio y su `code_challenge` SHA-256
2. Abre un popup con la URL de autorización de Microsoft
3. El popup completa el login y vuelve a la misma página con `?code=...`
4. La librería detecta el código (via `postMessage` o `localStorage`) y lo intercambia por un `access_token`
5. El token se cachea en `sessionStorage` hasta que expira

## Desarrollo local

```bash
# Servir la app desde un servidor HTTP (no file://)
python -m http.server 3000
# o
npx serve .
```
