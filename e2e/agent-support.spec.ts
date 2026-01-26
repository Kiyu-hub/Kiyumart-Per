import { test, expect, type APIRequestContext } from '@playwright/test';

let authToken: string;
let agentId: string;

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  // Ensure test users exist
  await request.post('http://localhost:5000/api/seed/test-users');

  // Login once and reuse the token to avoid rate-limiter 429s
  // Use the test-only token endpoint to get a JWT without triggering the rate-limiter
  const tokenRes = await request.post('http://localhost:5000/api/test/token', {
    data: { email: 'agent@kiyumart.com' },
  });

  expect(tokenRes.ok()).toBeTruthy();
  const tokenBody = await tokenRes.json();
  authToken = tokenBody.token;
  agentId = tokenBody.user?.id;

  expect(authToken).toBeTruthy();
  expect(agentId).toBeTruthy();
});

test('agent support flow: create -> message -> assign -> resolve', async ({ request }: { request: APIRequestContext }) => {
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  // 1) Create conversation
  const subject = 'Playwright: Agent test convo';
  const message = 'Initial message from agent via Playwright';

  const createRes = await request.post('http://localhost:5000/api/support/conversations', {
    headers,
    data: { subject, message },
  });
  expect(createRes.ok()).toBeTruthy();
  const conversation = await createRes.json();
  expect(conversation).toHaveProperty('id');
  expect(conversation.status).toBe('open');
  expect(conversation.lastMessage).toBe(message);

  const convoId = conversation.id;

  // 2) Get messages - should include initial message
  const messagesRes = await request.get(`http://localhost:5000/api/support/conversations/${convoId}/messages`, { headers });
  expect(messagesRes.ok()).toBeTruthy();
  const messages = await messagesRes.json();
  expect(Array.isArray(messages)).toBeTruthy();
  expect(messages.length).toBeGreaterThanOrEqual(1);
  expect(messages[0].message).toBe(message);

  // 3) Post a follow-up message
  const followUp = 'A follow-up message from agent (Playwright)';
  const postMsgRes = await request.post(`http://localhost:5000/api/support/conversations/${convoId}/messages`, {
    headers,
    data: { message: followUp },
  });
  expect(postMsgRes.ok()).toBeTruthy();
  const newMsg = await postMsgRes.json();
  expect(newMsg.message).toBe(followUp);

  // 4) Assign the conversation to the agent
  const assignRes = await request.post(`http://localhost:5000/api/support/conversations/${convoId}/assign`, { headers });
  expect(assignRes.ok()).toBeTruthy();
  const assigned = await assignRes.json();
  expect(assigned.agentId).toBeTruthy();

  // If the login returned agentId earlier, ensure it matches the assigned agent
  if (agentId) {
    expect(assigned.agentId).toBe(agentId);
  }

  // 5) Resolve the conversation
  const resolveRes = await request.post(`http://localhost:5000/api/support/conversations/${convoId}/resolve`, { headers });
  expect(resolveRes.ok()).toBeTruthy();
  const resolved = await resolveRes.json();
  expect(resolved.status).toBe('resolved');
});
