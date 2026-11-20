import { describe, expect, it } from 'vitest';
import { cloudinaryCredentials } from '@harvestslot/config';
import { cloudinarySignature } from '../src/storage.js';

describe('Cloudinary storage', () => {
  it('signs requests exactly as Cloudinary documents (sorted parameters + secret, SHA-1)', () => {
    // Example from Cloudinary's "Generating authentication signatures" documentation.
    const params = { timestamp: 1315060510, public_id: 'sample_image', eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop' };
    expect(cloudinarySignature(params, 'abcd')).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
    // Empty values are not signed.
    expect(cloudinarySignature({ ...params, format: '' }, 'abcd')).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('reads credentials from CLOUDINARY_URL or from the three separate values', () => {
    const none = { CLOUDINARY_URL: undefined, CLOUDINARY_CLOUD_NAME: undefined, CLOUDINARY_API_KEY: undefined, CLOUDINARY_API_SECRET: undefined };
    expect(cloudinaryCredentials({ ...none, CLOUDINARY_URL: 'cloudinary://123456:s3cr%2Bet@my-cloud' })).toEqual({ apiKey: '123456', apiSecret: 's3cr+et', cloudName: 'my-cloud' });
    expect(cloudinaryCredentials({ ...none, CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' })).toEqual({ cloudName: 'c', apiKey: 'k', apiSecret: 's' });
    expect(cloudinaryCredentials({ ...none, CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k' })).toBeNull();
    expect(cloudinaryCredentials({ ...none, CLOUDINARY_URL: 'https://not-a-cloudinary-url' })).toBeNull();
  });
});
