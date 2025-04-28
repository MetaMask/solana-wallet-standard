import { beforeEach } from 'node:test';
import { registerWallet } from '@wallet-standard/wallet';
import { describe, expect, it, vi } from 'vitest';
import { createMockClient } from '../tests/mocks';
import { getWalletStandard, registerSolanaWalletStandard } from './index';
import { MetamaskWallet } from './wallet';

vi.mock('@wallet-standard/wallet', () => ({
  registerWallet: vi.fn(),
}));

vi.mock('./wallet', () => ({
  MetamaskWallet: vi.fn(),
}));

describe('index.ts', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
  });

  describe('getWalletStandard', () => {
    it('should return an instance of MetamaskWallet', () => {
      const mockOptions = { client: mockClient, walletName: 'MetaMask Test' };
      const wallet = getWalletStandard(mockOptions);

      expect(MetamaskWallet).toHaveBeenCalledWith(mockOptions);
      expect(wallet).toBeInstanceOf(MetamaskWallet);
    });
  });

  describe('registerSolanaWalletStandard', () => {
    it('should register the wallet using registerWallet', async () => {
      const mockOptions = { client: mockClient, walletName: 'MetaMask Test' };

      await registerSolanaWalletStandard(mockOptions);

      expect(MetamaskWallet).toHaveBeenCalledWith(mockOptions);
      expect(registerWallet).toHaveBeenCalledWith(expect.any(MetamaskWallet));
    });
  });
});
