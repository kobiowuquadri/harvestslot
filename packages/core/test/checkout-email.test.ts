import { describe, expect, it } from 'vitest';
import { checkoutEmail } from '../src/payments.js';

describe('checkout email for Paystack', () => {
  const id = '01a1f2e2-dcd2-77fc-8296-86695d6ca83a';
  it('keeps a real user’s own address', () => {
    expect(checkoutEmail({ id, email: 'ops@oluyole-mill.ng' })).toBe('ops@oluyole-mill.ng');
  });
  it('gives demo (.example) and phone-only users a well-formed placeholder Paystack accepts', () => {
    expect(checkoutEmail({ id, email: 'manager@ibadan-starch.demo.harvestslot.example' })).toBe('payer-86695d6ca83a@example.com');
    expect(checkoutEmail({ id, email: null })).toBe('payer-86695d6ca83a@example.com');
  });
});
