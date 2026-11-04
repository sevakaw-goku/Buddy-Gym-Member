import { auth } from '../firebase';
export async function invitationRequest(
  action: string,
  input: object = {},
  authenticated = true,
) {
  const token = authenticated ? await auth?.currentUser?.getIdToken() : null;
  if (authenticated && !token) throw new Error('Bitte zuerst anmelden.');
  const response = await fetch('/api/invitations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ...input, action }),
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  });
  let data: Record<string, unknown>;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      'Der Einladungsserver ist nicht erreichbar. Bitte die Vercel-Testversion und Serverkonfiguration prüfen.',
    );
  }
  if (!response.ok)
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : 'Die Einladung konnte nicht verarbeitet werden.',
    );
  return data;
}
