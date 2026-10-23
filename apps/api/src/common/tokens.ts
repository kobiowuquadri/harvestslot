import type { Env } from '@harvestslot/config';
import type { Messaging, ObjectStorage, PaymentProvider, Policies } from '@harvestslot/core';

/** Injection tokens for framework-free dependencies. */
export const ENV = Symbol('ENV');
export const STORAGE = Symbol('STORAGE');
export const MESSAGING = Symbol('MESSAGING');
export const PAYMENTS = Symbol('PAYMENTS');

export type { Env, Messaging, ObjectStorage, PaymentProvider, Policies };
