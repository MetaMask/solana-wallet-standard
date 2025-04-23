import { SOLANA_MAINNET_CHAIN } from '@solana/wallet-standard-chains';
import bs58 from 'bs58';
import { vi } from 'vitest';
import { Scope } from '../src/types';

export const mockAddress = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
export const mockPublicKey = bs58.decode(mockAddress);
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
export const mockGetSession = (mockClient: ReturnType<typeof createMockClient>, address?: string) => {
  mockClient.getSession.mockResolvedValue({
    sessionScopes: address
      ? {
          [mockScope]: {
            accounts: [`${mockScope}:${mockAddress}`],
          },
        }
      : {},
  });
};

export const mockCreateSession = (mockClient: ReturnType<typeof createMockClient>, address?: string) => {
  mockClient.createSession.mockResolvedValue({
    sessionScopes: address
      ? {
          [mockScope]: {
            accounts: [`${mockScope}:${mockAddress}`],
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
