import { auth } from './firebase';

// fetch wrapper that attaches the current user's Firebase ID token as a Bearer
// header when someone is signed in. Public endpoints (invite lookup/accept) are
// called while logged out, so no header is added and the server lets them through.
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      headers.set('Authorization', `Bearer ${token}`);
    } catch (error) {
      console.error('Failed to get ID token:', error);
    }
  }
  return fetch(input, { ...init, headers });
}
