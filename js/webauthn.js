// ─── WebAuthn Passkey Management (ES module) ────────────────────────────────

import { apiFetch } from './state.js';

function isWebAuthnAvailable() {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}

function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuffer(base64url) {
  const padding = '='.repeat((4 - base64url.length % 4) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function registerPasskey(name) {
  // 1. Get registration options
  const options = await apiFetch('/api/webauthn/register/options', { method: 'POST' });

  // 2. Build PublicKeyCredentialCreationOptions from JSON response
  const publicKey = {
    challenge: base64urlToBuffer(options.challenge),
    rp: options.rp,
    user: { ...options.user, id: base64urlToBuffer(options.user.id) },
    pubKeyCredParams: options.pubKeyCredParams,
    timeout: options.timeout,
    attestation: options.attestation,
    authenticatorSelection: options.authenticatorSelection,
    extensions: options.extensions,
  };
  if (options.excludeCredentials) {
    publicKey.excludeCredentials = options.excludeCredentials.map(c => ({
      id: base64urlToBuffer(c.id),
      type: c.type,
      transports: c.transports,
    }));
  }

  // 3. Call WebAuthn API
  const credential = await navigator.credentials.create({ publicKey });

  // 4. Encode response
  const response = {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: bufferToBase64url(credential.response.attestationObject),
      clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
      transports: credential.response.getTransports ? credential.response.getTransports() : [],
    },
    authenticatorAttachment: credential.authenticatorAttachment || undefined,
    clientExtensionResults: credential.getClientExtensionResults(),
  };

  // 5. Verify with server
  await apiFetch('/api/webauthn/register/verify', {
    method: 'POST',
    body: JSON.stringify({ response, name }),
  });
}

async function listPasskeys() {
  return apiFetch('/api/webauthn/credentials');
}

async function deletePasskey(id) {
  return apiFetch(`/api/webauthn/credentials/${id}`, { method: 'DELETE' });
}

export { isWebAuthnAvailable, registerPasskey, listPasskeys, deletePasskey };
