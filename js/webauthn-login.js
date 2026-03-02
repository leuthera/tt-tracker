// ─── WebAuthn Login (IIFE — runs on login page) ─────────────────────────────
(function() {
  'use strict';

  if (!window.PublicKeyCredential) return;

  // Show passkey UI
  var divider = document.getElementById('passkey-divider');
  var btn = document.getElementById('passkey-btn');
  if (divider) divider.style.display = '';
  if (btn) btn.style.display = '';

  // ─── Base64url helpers ───────────────────────────────────────────────────
  function base64urlToBuffer(base64url) {
    var padding = '='.repeat((4 - base64url.length % 4) % 4);
    var base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function bufferToBase64url(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function showError(msg) {
    var card = document.querySelector('.card');
    var existing = card.querySelector('.error');
    if (existing) existing.remove();
    var div = document.createElement('div');
    div.className = 'error';
    div.textContent = msg;
    var form = card.querySelector('form');
    card.insertBefore(div, form);
  }

  if (btn) {
    btn.addEventListener('click', async function() {
      btn.disabled = true;
      try {
        // 1. Get authentication options
        var optRes = await fetch('/api/webauthn/login/options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!optRes.ok) {
          var optErr = await optRes.json().catch(function() { return {}; });
          throw new Error(optErr.error || 'Failed to get options');
        }
        var options = await optRes.json();

        // 2. Convert challenge from base64url
        options.challenge = base64urlToBuffer(options.challenge);
        if (options.allowCredentials) {
          options.allowCredentials = options.allowCredentials.map(function(c) {
            return { id: base64urlToBuffer(c.id), type: c.type, transports: c.transports };
          });
        }

        // 3. Call WebAuthn API
        var credential = await navigator.credentials.get({ publicKey: options });

        // 4. Encode response
        var response = {
          id: credential.id,
          rawId: bufferToBase64url(credential.rawId),
          type: credential.type,
          response: {
            authenticatorData: bufferToBase64url(credential.response.authenticatorData),
            clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
            signature: bufferToBase64url(credential.response.signature),
          },
          authenticatorAttachment: credential.authenticatorAttachment || undefined,
          clientExtensionResults: credential.getClientExtensionResults(),
        };
        if (credential.response.userHandle) {
          response.response.userHandle = bufferToBase64url(credential.response.userHandle);
        }

        // 5. Verify with server
        var verRes = await fetch('/api/webauthn/login/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ response: response }),
        });
        if (!verRes.ok) {
          var verErr = await verRes.json().catch(function() { return {}; });
          throw new Error(verErr.error || 'Verification failed');
        }

        // 6. Success — redirect to app
        location.href = '/';
      } catch (e) {
        if (e.name !== 'NotAllowedError') {
          showError(e.message || 'Passkey login failed');
        }
        btn.disabled = false;
      }
    });
  }
})();
