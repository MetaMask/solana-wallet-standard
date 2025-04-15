import { SOLANA_MAINNET_CHAIN } from '@solana/wallet-standard-chains';
import {
  SolanaSignAndSendTransaction,
  SolanaSignIn,
  SolanaSignMessage,
  SolanaSignTransaction,
} from '@solana/wallet-standard-features';
import type { WalletAccount } from '@wallet-standard/base';
import { StandardConnect, StandardDisconnect, StandardEvents } from '@wallet-standard/features';
import bs58 from 'bs58';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mockAddress as address,
  mockChain as chain,
  createMockClient,
  mockCreateSession,
  mockGetSession,
  mockPublicKey as publicKey,
  mockScope as scope,
} from '../tests/mocks';
import { MetamaskWallet, MetamaskWalletAccount } from './wallet';

describe('MetamaskWallet', () => {
  let wallet: MetamaskWallet;
  let mockClient: ReturnType<typeof createMockClient>;
  let notificationHandler: ReturnType<typeof vi.fn>;

  // Emit account change event
  const emitAccountChange = (address: string) => {
    notificationHandler({
      params: {
        notification: {
          method: 'metamask_accountsChanged',
          params: [address],
        },
      },
    });
  };

  const setupNotificationHandler = () => {
    notificationHandler = vi.fn();
    mockClient.onNotification.mockImplementation((handler) => {
      notificationHandler.mockImplementation(handler);
    });
  };

  const connectAndSetAccount = async (_address = address) => {
    mockGetSession(mockClient);
    mockCreateSession(mockClient, _address);
    setupNotificationHandler();

    const connectPromise = wallet.features[StandardConnect].connect();

    // Emit account change event
    emitAccountChange(_address);

    return connectPromise;
  };

  // Helper to connect wallet and set account
  const reconnectAndSetAccount = async (_address = address) => {
    mockGetSession(mockClient, _address);
    setupNotificationHandler();

    const connectPromise = wallet.features[StandardConnect].connect();

    // Emit account change event
    emitAccountChange(_address);

    return connectPromise;
  };

  beforeEach(() => {
    mockClient = createMockClient();
    wallet = new MetamaskWallet({ client: mockClient });
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(wallet.version).toBe('1.0.0');
      expect(wallet.name).toBe('MetaMask‎');
      expect(wallet.icon).toBeDefined();
      expect(wallet.chains).toContain(SOLANA_MAINNET_CHAIN);
      expect(wallet.scope).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
      expect(wallet.accounts).toEqual([]);
    });

    it('should have all required features', () => {
      const features = wallet.features;
      expect(features[StandardConnect]).toBeDefined();
      expect(features[StandardDisconnect]).toBeDefined();
      expect(features[StandardEvents]).toBeDefined();
      expect(features[SolanaSignAndSendTransaction]).toBeDefined();
      expect(features[SolanaSignTransaction]).toBeDefined();
      expect(features[SolanaSignMessage]).toBeDefined();
      expect(features[SolanaSignIn]).toBeDefined();
    });
  });

  describe('connect', () => {
    it('should connect with existing session', async () => {
      const result = await reconnectAndSetAccount();

      expect(mockClient.getSession).toHaveBeenCalled();
      expect(mockClient.createSession).not.toHaveBeenCalled();
      expect(result.accounts.length).toBe(1);
      expect(result.accounts[0]?.address).toBe(address);
    });

    it('should create new session if no existing session', async () => {
      const result = await connectAndSetAccount();

      expect(mockClient.getSession).toHaveBeenCalled();
      expect(mockClient.createSession).toHaveBeenCalledWith({
        optionalScopes: {
          [scope]: {
            methods: [],
            notifications: [],
          },
        },
        sessionProperties: {
          solana_accountChanged_notifications: true,
        },
      });
      expect(result.accounts.length).toBe(1);
      expect(result.accounts[0]?.address).toBe(address);
    });

    it('should use fallback when no accountsChanged event is received', async () => {
      mockGetSession(mockClient, address);

      // Simulate no accountsChanged event (timeout will trigger)
      vi.useFakeTimers();
      const connectPromise = wallet.features[StandardConnect].connect();

      // Fast-forward timer
      await vi.runAllTimersAsync();

      vi.useRealTimers();

      const result = await connectPromise;

      expect(mockClient.getSession).toHaveBeenCalled();
      expect(result.accounts.length).toBe(1);
      expect(result.accounts[0]?.address).toBe(address);
    });
  });

  describe('events', () => {
    it('should register and trigger event listeners', async () => {
      const changeListener = vi.fn();

      wallet.features[StandardEvents].on('change', changeListener);

      await reconnectAndSetAccount();

      expect(changeListener).toHaveBeenCalledWith({ accounts: wallet.accounts });
    });
  });

  describe('disconnect', () => {
    it('should disconnect and clear account', async () => {
      await reconnectAndSetAccount();

      expect(wallet.accounts.length).toBe(1);

      // Setup change event listener
      const changeListener = vi.fn();
      wallet.features[StandardEvents].on('change', changeListener);

      await wallet.features[StandardDisconnect].disconnect();

      // Verify account is cleared
      expect(wallet.accounts).toEqual([]);
      expect(mockClient.revokeSession).toHaveBeenCalled();
      expect(changeListener).toHaveBeenCalledWith({ accounts: [] });
    });
  });

  describe('signAndSendTransaction', () => {
    it('should sign and send transaction', async () => {
      await reconnectAndSetAccount();

      const testSignature = 'testSignature';
      mockClient.invokeMethod.mockResolvedValue({
        signature: testSignature,
      });

      const transaction = new Uint8Array([1, 2, 3, 4]);
      const account = wallet.accounts[0];

      // Ensure account is defined
      if (!account) {
        throw new Error('Test setup failed: account should be defined');
      }

      const results = await wallet.features[SolanaSignAndSendTransaction].signAndSendTransaction({
        transaction,
        account,
        chain,
      });

      expect(mockClient.invokeMethod).toHaveBeenCalledWith({
        scope,
        request: {
          method: 'signAndSendTransaction',
          params: {
            account: { address: account.address },
            transaction: Buffer.from(transaction).toString('base64'),
            scope,
          },
        },
      });

      expect(results).toEqual([
        {
          signature: bs58.decode(testSignature),
        },
      ]);
    });

    it('should throw error if no account', async () => {
      // Disconnect to clear account
      await wallet.features[StandardDisconnect].disconnect();

      const transaction = new Uint8Array([1, 2, 3, 4]);
      const account = new MetamaskWalletAccount({
        address,
        publicKey,
        chains: wallet.chains,
      });

      await expect(
        wallet.features[SolanaSignAndSendTransaction].signAndSendTransaction({
          transaction,
          account,
          chain,
        }),
      ).rejects.toThrow('No account found');
    });
  });

  describe('signTransaction', () => {
    it('should sign transaction', async () => {
      await connectAndSetAccount();

      const signedTransaction = 'base64EncodedSignedTransaction';
      mockClient.invokeMethod.mockResolvedValue({
        signedTransaction,
      });

      const transaction = new Uint8Array([1, 2, 3, 4]);
      const account = wallet.accounts[0];

      // Ensure account is defined
      if (!account) {
        throw new Error('Test setup failed: account should be defined');
      }

      const results = await wallet.features[SolanaSignTransaction].signTransaction({
        transaction,
        account,
        chain,
      });

      expect(mockClient.invokeMethod).toHaveBeenCalledWith({
        scope,
        request: {
          method: 'signTransaction',
          params: {
            account: { address: account.address },
            transaction: Buffer.from(transaction).toString('base64'),
            scope,
          },
        },
      });

      expect(results).toEqual([
        {
          signedTransaction: Uint8Array.from(Buffer.from(signedTransaction, 'base64')),
        },
      ]);
    });
  });

  describe('signMessage', () => {
    it('should sign message', async () => {
      await connectAndSetAccount();
      const signedMessage = 'base64EncodedSignedMessage';
      const signature = 'signature';
      const signatureType = 'ed25519';

      mockClient.invokeMethod.mockResolvedValue({
        signedMessage,
        signature,
        signatureType,
      });

      const message = new Uint8Array([1, 2, 3, 4]);
      const account = wallet.accounts[0] as WalletAccount;

      const results = await wallet.features[SolanaSignMessage].signMessage({
        message,
        account,
      });

      expect(mockClient.invokeMethod).toHaveBeenCalledWith({
        scope,
        request: {
          method: 'signMessage',
          params: {
            message: Buffer.from(message).toString('base64'),
            account: { address: account.address },
          },
        },
      });

      expect(results).toEqual([
        {
          signedMessage: Buffer.from(signedMessage, 'base64'),
          signature: bs58.decode(signature),
          signatureType: 'ed25519',
        },
      ]);
    });
  });

  describe('signIn', () => {
    it('should connect first if no account is set', async () => {
      // Setup signIn response
      const signedMessage = 'base64EncodedSignedMessage';
      const signature = 'signature';
      mockClient.invokeMethod.mockResolvedValue({
        signedMessage,
        signature,
      });

      setupNotificationHandler();

      // Start signIn before connecting
      const signInPromise = wallet.features[SolanaSignIn].signIn({
        domain: 'test.com',
        statement: 'Sign in to test app',
      });

      // Simulate accountsChanged event to complete connection
      emitAccountChange(address);

      const results = await signInPromise;

      // Verify signIn was called
      expect(mockClient.invokeMethod).toHaveBeenCalledWith({
        scope,
        request: {
          method: 'signIn',
          params: {
            domain: 'test.com',
            statement: 'Sign in to test app',
            address,
          },
        },
      });

      expect(results).toEqual([
        {
          account: wallet.accounts[0],
          signedMessage: Buffer.from(signedMessage, 'base64'),
          signature: bs58.decode(signature),
        },
      ]);
    });

    it('should sign in with existing account', async () => {
      await connectAndSetAccount();

      const signedMessage = 'base64EncodedSignedMessage';
      const signature = 'signature';
      mockClient.invokeMethod.mockResolvedValue({
        signedMessage,
        signature,
      });

      const domain = 'test.com';
      const statement = 'Sign in to test app';

      const results = await wallet.features[SolanaSignIn].signIn({
        domain,
        statement,
      });

      expect(mockClient.invokeMethod).toHaveBeenCalledWith({
        scope,
        request: {
          method: 'signIn',
          params: {
            domain,
            statement,
            address,
          },
        },
      });

      expect(results).toEqual([
        {
          account: wallet.accounts[0],
          signedMessage: Buffer.from(signedMessage, 'base64'),
          signature: bs58.decode(signature),
        },
      ]);
    });

    it('should use window.location.host as default domain', async () => {
      await connectAndSetAccount();

      // Mock window.location.host
      const originalLocation = window.location;
      window.location = { ...originalLocation, host: 'example.com' };

      const signedMessage = 'base64EncodedSignedMessage';
      const signature = 'signature';
      mockClient.invokeMethod.mockResolvedValue({
        signedMessage,
        signature,
      });

      const statement = 'Sign in to test app';

      await wallet.features[SolanaSignIn].signIn({
        statement,
      });

      expect(mockClient.invokeMethod).toHaveBeenCalledWith({
        scope,
        request: {
          method: 'signIn',
          params: {
            domain: 'example.com',
            statement,
            address,
          },
        },
      });

      // Restore window.location
      window.location = originalLocation;
    });
  });

  describe('MetamaskWalletAccount', () => {
    it('should create account with correct properties', () => {
      const account = new MetamaskWalletAccount({
        address,
        publicKey,
        chains: wallet.chains,
      });

      expect(account.address).toBe(address);
      expect(account.publicKey).toEqual(publicKey);
      expect(account.chains).toEqual(wallet.chains);
      expect(account.features).toEqual(
        expect.arrayContaining([SolanaSignAndSendTransaction, SolanaSignTransaction, SolanaSignMessage, SolanaSignIn]),
      );
    });
  });

  describe('handleAccountsChangedEvent', () => {
    it('should disconnect when no address is provided', async () => {
      await connectAndSetAccount();

      // Setup account change listener
      const changeListener = vi.fn();
      wallet.features[StandardEvents].on('change', changeListener);

      // Simulate accountsChanged event with no address
      notificationHandler({
        params: {
          notification: {
            method: 'metamask_accountsChanged',
            params: [],
          },
        },
      });

      // Verify account was removed and disconnect was called
      expect(wallet.accounts).toEqual([]);
      expect(mockClient.revokeSession).toHaveBeenCalled();
      expect(changeListener).toHaveBeenCalledWith({ accounts: [] });
    });
  });
});
