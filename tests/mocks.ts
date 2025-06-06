import { SOLANA_MAINNET_CHAIN } from '@solana/wallet-standard-chains';
import bs58 from 'bs58';
import { vi } from 'vitest';
import { Scope } from '../src/types';

export const mockAddress = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
export const mockAddress2 = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
export const mockPublicKey = bs58.decode(mockAddress);
export const mockPublicKey2 = bs58.decode(mockAddress2);
export const mockScope = Scope.MAINNET;
export const mockChain = SOLANA_MAINNET_CHAIN;

// Create mock for MultichainApiClient
export const createMockClient = () => {
  return {
    onNotification: vi.fn(),
    getSession: vi.fn(),
    createSession: vi.fn(),
    invokeMethod: vi.fn(),
    revokeSession: vi.fn(),
    extendsRpcApi: vi.fn(),
  };
};

// Helper to setup a session with an account
export const mockGetSession = (
  mockClient: ReturnType<typeof createMockClient>,
  addresses: string[],
  includeEvmScope = false,
) => {
  mockClient.getSession.mockResolvedValue({
    sessionScopes: {
      ...(addresses.length > 0
        ? {
            [mockScope]: {
              accounts: addresses.map((address) => `${mockScope}:${address}`),
              methods: [],
              notifications: [],
            },
          }
        : {}),
      ...(includeEvmScope
        ? {
            'eip155:1': {
              accounts: ['eip155:1:0x0000000000000000000000000000000000000000'],
              methods: [],
              notifications: [],
            },
          }
        : {}),
    },
  });
};

export const mockCreateSession = (mockClient: ReturnType<typeof createMockClient>, addresses?: string[]) => {
  mockClient.createSession.mockResolvedValue({
    sessionScopes: addresses
      ? {
          [mockScope]: {
            accounts: addresses.map((address) => `${mockScope}:${address}`),
          },
        }
      : {},
  });
};

// Mock window object for tests
// @ts-ignore - Mocking window
global.window = {
  location: {
    host: 'example.com',
  } as Location,
};
