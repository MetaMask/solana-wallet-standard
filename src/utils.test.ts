import type { SessionData } from '@metamask/multichain-api-client';
import { describe, expect, it } from 'vitest';
import { getAddressFromCaipAccountId, isSessionChangedEvent } from './utils';

describe('getAddressFromCaipAccountId', () => {
  it('should return the account address for a valid CAIP-10 account ID', () => {
    const caipAccountId = 'eip155:1:0x1234567890abcdef1234567890abcdef12345678';
    const result = getAddressFromCaipAccountId(caipAccountId);
    expect(result).toBe('0x1234567890abcdef1234567890abcdef12345678');
  });

  it('should throw an error if the account address is missing', () => {
    const missingAddressCaipAccountId = 'eip155:1:';
    expect(() => getAddressFromCaipAccountId(missingAddressCaipAccountId)).toThrow('Invalid CAIP account ID.');
  });

  it('should throw an error if the chain ID is malformed', () => {
    const malformedChainIdCaipAccountId = 'eip155::0x1234567890abcdef1234567890abcdef12345678';
    expect(() => getAddressFromCaipAccountId(malformedChainIdCaipAccountId)).toThrow('Invalid CAIP account ID.');
  });
});

describe('isSessionChangedEvent', () => {
  const emptySession = { sessionScopes: {} } satisfies SessionData;

  it('returns true for wallet_sessionChanged notifications', () => {
    const event = { method: 'wallet_sessionChanged', params: emptySession };
    expect(isSessionChangedEvent(event)).toBe(true);
    if (isSessionChangedEvent(event)) {
      expect(event.params.sessionScopes).toEqual({});
    }
  });

  it('returns false for other notification shapes', () => {
    expect(
      isSessionChangedEvent({
        params: { notification: { method: 'metamask_accountsChanged', params: [] } },
      }),
    ).toBe(false);
    expect(isSessionChangedEvent({ method: 'other', params: emptySession })).toBe(false);
    expect(isSessionChangedEvent({})).toBe(false);
  });
});
