import type { APIRequestContext } from '@playwright/test';

export async function getTestToken(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post('http://127.0.0.1:5000/api/test/token', { data: { email } });
  if (!res.ok()) throw new Error(`Failed to get test token for ${email}`);
  const body = await res.json();
  if (!body?.token) throw new Error(`Token response missing for ${email}`);
  return body.token as string;
}
