import { OAuth2Client } from 'google-auth-library';

let client: OAuth2Client | null = null;

function getClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
  if (!client) {
    client = new OAuth2Client(clientId);
  }
  return client;
}

export async function verifyGoogleIdToken(idToken: string): Promise<{
  sub: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('missing_google_client_id');
  }

  const ticket = await getClient().verifyIdToken({
    idToken,
    audience: clientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error('invalid_google_token');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || payload.email,
    picture: payload.picture,
    emailVerified: Boolean(payload.email_verified),
  };
}
