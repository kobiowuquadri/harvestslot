import { describe, expect, it } from 'vitest';
import { BrevoMail } from '../src/messaging.js';

describe('Brevo email', () => {
  it('sends a text email through the transactional API with the API key header', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ messageId: '<abc@smtp-relay.mailin.fr>' }), { status: 201 });
    }) as unknown as typeof fetch;
    const mail = new BrevoMail('xkeysib-test', { email: 'sender@example.com', name: 'HarvestSlot' }, fake);
    const out = await mail.send({ to: 'farmer@example.com', subject: 'Your plan', text: 'Ready to harvest' });
    expect(out.messageId).toBe('<abc@smtp-relay.mailin.fr>');
    expect(seen!.url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((seen!.init.headers as Record<string, string>)['api-key']).toBe('xkeysib-test');
    expect(JSON.parse(String(seen!.init.body))).toEqual({
      sender: { email: 'sender@example.com', name: 'HarvestSlot' },
      to: [{ email: 'farmer@example.com' }],
      subject: 'Your plan',
      textContent: 'Ready to harvest',
    });
  });

  it('reports a refusal so the outbox retries', async () => {
    const fake = (async () => new Response(JSON.stringify({ message: 'Key not found' }), { status: 401 })) as unknown as typeof fetch;
    const mail = new BrevoMail('bad', { email: 'sender@example.com', name: 'HarvestSlot' }, fake);
    await expect(mail.send({ to: 'a@example.com', subject: 's', text: 't' })).rejects.toThrow(/Brevo rejected the email \(401\): Key not found/);
  });
});
