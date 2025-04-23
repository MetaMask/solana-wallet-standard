import type { MultichainApiClient } from '@metamask/multichain-api-client';
import {
  SOLANA_DEVNET_CHAIN,
  SOLANA_MAINNET_CHAIN,
  SOLANA_TESTNET_CHAIN,
  type SolanaChain,
} from '@solana/wallet-standard-chains';
import {
  SolanaSignAndSendTransaction,
  type SolanaSignAndSendTransactionFeature,
  type SolanaSignAndSendTransactionInput,
  type SolanaSignAndSendTransactionOutput,
  SolanaSignIn,
  type SolanaSignInFeature,
  type SolanaSignInInput,
  type SolanaSignInOutput,
  SolanaSignMessage,
  type SolanaSignMessageFeature,
  type SolanaSignMessageInput,
  type SolanaSignMessageOutput,
  SolanaSignTransaction,
  type SolanaSignTransactionFeature,
  type SolanaSignTransactionInput,
  type SolanaSignTransactionOutput,
} from '@solana/wallet-standard-features';
import type { IdentifierArray, Wallet } from '@wallet-standard/base';
import {
  StandardConnect,
  type StandardConnectFeature,
  type StandardConnectOutput,
  StandardDisconnect,
  type StandardDisconnectFeature,
  StandardEvents,
  type StandardEventsFeature,
  type StandardEventsListeners,
  type StandardEventsNames,
  type StandardEventsOnMethod,
} from '@wallet-standard/features';
import { ReadonlyWalletAccount } from '@wallet-standard/wallet';
import bs58 from 'bs58';
import { metamaskIcon } from './icon';
import { type CaipAccountId, type DeepWriteable, Scope } from './types';
import { scopes } from './types';
import { getAddressFromCaipAccountId, getScopeFromWalletStandardChain } from './utils';

export class MetamaskWalletAccount extends ReadonlyWalletAccount {
  constructor({ address, publicKey, chains }: { address: string; publicKey: Uint8Array; chains: IdentifierArray }) {
    const features: IdentifierArray = [
      SolanaSignAndSendTransaction,
      SolanaSignTransaction,
      SolanaSignMessage,
      SolanaSignIn,
    ];
    super({ address, publicKey, chains, features });
    if (new.target === MetamaskWalletAccount) {
      Object.freeze(this);
    }
  }
}

export class MetamaskWallet implements Wallet {
  readonly #listeners: { [E in StandardEventsNames]?: StandardEventsListeners[E][] } = {};
  readonly version = '1.0.0' as const;
  readonly name = 'MetaMask‎' as const;
  readonly icon = metamaskIcon;
  readonly chains: SolanaChain[] = [SOLANA_MAINNET_CHAIN, SOLANA_DEVNET_CHAIN, SOLANA_TESTNET_CHAIN];
  #scope: Scope | undefined;
  #selectedAddressOnPageLoadPromise: Promise<string | undefined> | undefined;
  #account: MetamaskWalletAccount | undefined;
  #removeAccountsChangedListener: (() => void) | undefined;

  client: MultichainApiClient;

  #getInitialSelectedAddress = async (): Promise<string | undefined> => {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(undefined);
      }, 2000);

      const handleAccountChange = (data: any) => {
        if (data?.params?.notification?.method === 'metamask_accountsChanged') {
          const address = data?.params?.notification?.params?.[0];
          if (address) {
            clearTimeout(timeout);
            removeNotification?.();
            resolve(address);
          }
        }
      };

      const removeNotification = this.client.onNotification(handleAccountChange);
    });
  };

  get accounts() {
    return this.#account ? [this.#account] : [];
  }

  get features(): StandardConnectFeature &
    SolanaSignInFeature &
    StandardDisconnectFeature &
    StandardEventsFeature &
    SolanaSignAndSendTransactionFeature &
    SolanaSignTransactionFeature &
    SolanaSignMessageFeature {
    return {
      [StandardConnect]: {
        version: this.version,
        connect: this.#connect,
      },
      [SolanaSignIn]: {
        version: this.version,
        signIn: this.#signIn,
      },
      [StandardDisconnect]: {
        version: this.version,
        disconnect: this.#disconnect,
      },
      [StandardEvents]: {
        version: this.version,
        on: this.#on,
      },
      [SolanaSignAndSendTransaction]: {
        version: this.version,
        supportedTransactionVersions: ['legacy', 0],
        signAndSendTransaction: this.#signAndSendTransaction,
      },
      [SolanaSignTransaction]: {
        version: this.version,
        supportedTransactionVersions: ['legacy', 0],
        signTransaction: this.#signTransaction,
      },
      [SolanaSignMessage]: {
        version: this.version,
        signMessage: this.#signMessage,
      },
    };
  }

  constructor({ client }: { client: MultichainApiClient }) {
    this.client = client;
    this.#selectedAddressOnPageLoadPromise = this.#getInitialSelectedAddress();
  }

  #on: StandardEventsOnMethod = (event, listener) => {
    if (this.#listeners[event]) {
      this.#listeners[event]?.push(listener);
    } else {
      this.#listeners[event] = [listener];
    }
    return () => this.#off(event, listener);
  };

  #emit<E extends StandardEventsNames>(event: E, ...args: Parameters<StandardEventsListeners[E]>): void {
    for (const listener of this.#listeners[event] ?? []) {
      listener.apply(null, args);
    }
  }

  #off<E extends StandardEventsNames>(event: E, listener: StandardEventsListeners[E]): void {
    this.#listeners[event] = this.#listeners[event]?.filter((existingListener) => listener !== existingListener);
  }

  #connect = async (): Promise<StandardConnectOutput> => {
    if (this.accounts.length) {
      // Already connected
      return { accounts: this.accounts };
    }

    // Try restoring session
    const restored = await this.#tryRestoringSession();

    // Otherwise create a session on Mainnet by default
    if (!restored) {
      await this.#createSession(Scope.MAINNET);
    }

    this.#removeAccountsChangedListener = this.client.onNotification(this.#handleAccountsChangedEvent.bind(this));
    return { accounts: this.accounts };
  };

  #signIn = async (...inputs: SolanaSignInInput[]): Promise<SolanaSignInOutput[]> => {
    if (!this.#account || !this.#scope) {
      await this.#connect();

      if (!this.#account || !this.#scope) {
        throw new Error('Not connected');
      }
    }

    const results: SolanaSignInOutput[] = [];

    for (const input of inputs) {
      const signInRes = await this.client.invokeMethod({
        scope: this.#scope,
        request: {
          method: 'signIn',
          params: {
            ...input,
            domain: input.domain || window.location.host,
            address: input.address || this.#account.address,
          } as DeepWriteable<SolanaSignInInput>,
        },
      });

      results.push({
        account: this.#account,
        signedMessage: Buffer.from(signInRes.signedMessage, 'base64'),
        signature: bs58.decode(signInRes.signature),
      });
    }

    return results;
  };

  #disconnect = async () => {
    this.#account = undefined;
    this.#removeAccountsChangedListener?.();
    this.#removeAccountsChangedListener = undefined;
    this.#emit('change', { accounts: this.accounts });
    await this.client.revokeSession();
  };

  #signAndSendTransaction = async (
    ...inputs: SolanaSignAndSendTransactionInput[]
  ): Promise<SolanaSignAndSendTransactionOutput[]> => {
    const account = this.#account;
    if (!account) {
      throw new Error('Not connected');
    }

    this.#validateSendTransactionInput(inputs);

    const scope = getScopeFromWalletStandardChain(inputs[0]?.chain);
    const session = await this.client.getSession();
    const sessionAccounts = session?.sessionScopes[scope]?.accounts;

    // Update session if account isn't permissioned for this scope
    if (!sessionAccounts?.includes(`${scope}:${account.address}`)) {
      // Create the session with only the devnet scope, to protect users from accidentally signing transactions on mainnet
      await this.#createSession(scope, [account.address]);
    }

    const results: SolanaSignAndSendTransactionOutput[] = [];

    for (const { transaction: transactionBuffer, account } of inputs) {
      const transaction = Buffer.from(transactionBuffer).toString('base64');

      const signAndSendTransactionRes = await this.client.invokeMethod({
        scope,
        request: {
          method: 'signAndSendTransaction',
          params: {
            account: { address: account.address },
            transaction,
            scope,
          },
        },
      });

      results.push({
        signature: bs58.decode(signAndSendTransactionRes.signature),
      });
    }

    return results;
  };

  #signTransaction = async (...inputs: SolanaSignTransactionInput[]): Promise<SolanaSignTransactionOutput[]> => {
    if (!this.#scope) {
      throw new Error('Not connected');
    }

    const results: SolanaSignTransactionOutput[] = [];

    for (const { transaction: transactionBuffer, account } of inputs) {
      const transaction = Buffer.from(transactionBuffer).toString('base64');

      const signTransactionRes = await this.client.invokeMethod({
        scope: this.#scope,
        request: {
          method: 'signTransaction',
          params: {
            account: { address: account.address },
            transaction,
            scope: this.#scope,
          },
        },
      });

      results.push({
        signedTransaction: Uint8Array.from(Buffer.from(signTransactionRes.signedTransaction, 'base64')),
      });
    }

    return results;
  };

  #signMessage = async (...inputs: SolanaSignMessageInput[]): Promise<SolanaSignMessageOutput[]> => {
    if (!this.#scope) {
      throw new Error('Not connected');
    }

    const results: SolanaSignMessageOutput[] = [];

    for (const { message: messageBuffer, account } of inputs) {
      const message = Buffer.from(messageBuffer).toString('base64');

      const signMessageRes = await this.client.invokeMethod({
        scope: this.#scope,
        request: {
          method: 'signMessage',
          params: {
            message,
            account: { address: account.address },
          },
        },
      });

      results.push({
        signedMessage: Buffer.from(signMessageRes.signedMessage, 'base64'),
        signature: bs58.decode(signMessageRes.signature),
        signatureType: signMessageRes.signatureType as 'ed25519',
      });
    }

    return results;
  };

  #handleAccountsChangedEvent(data: any) {
    if (data?.params?.notification?.method !== 'metamask_accountsChanged') {
      return;
    }
    const address = data?.params?.notification?.params?.[0];

    if (address) {
      this.#account = this.#getAccountFromAddress(address);
      this.#emit('change', { accounts: this.accounts });
    } else {
      this.#disconnect();
    }
  }

  #getAccountFromAddress(address: string) {
    return new MetamaskWalletAccount({
      address,
      publicKey: new Uint8Array(bs58.decode(address)),
      chains: this.chains,
    });
  }

  #validateSendTransactionInput = (inputs: SolanaSignAndSendTransactionInput[]) => {
    const accountAddress = this.#account?.address;
    const firstChain = inputs[0]?.chain;

    for (const {
      account: { address: transactionAddress },
      chain,
    } of inputs) {
      // Verify all transactions are on the same and connected account
      if (transactionAddress !== accountAddress) {
        throw new Error('Invalid transaction addresses');
      }
      // Verify all transactions are on the same chain
      if (chain !== firstChain) {
        throw new Error('All transactions must be on the same chain');
      }
    }
  };

  #tryRestoringSession = async (): Promise<boolean> => {
    try {
      const existingSession = await this.client.getSession();

      // Get solana scopes
      const sessionScopes = Object.keys(existingSession?.sessionScopes ?? {});
      const solanaSessionScopes = sessionScopes.filter((scope) => scopes.includes(scope as Scope));

      // Find the first available scope in priority order: testnet > devnet > mainnet to protect users from accidentally
      // signing transactions on mainnet. When the page is reloaded, we don't know which scope was used last
      const scopePriorityOrder = [Scope.TESTNET, Scope.DEVNET, Scope.MAINNET];
      this.#scope = scopePriorityOrder.find((scope) => solanaSessionScopes.includes(scope));

      if (!this.#scope) {
        return false;
      }

      // Get the account from accountChanged from page load, or default to the first account in the session
      const account =
        (await this.#selectedAddressOnPageLoadPromise) ??
        getAddressFromCaipAccountId(existingSession?.sessionScopes[this.#scope]?.accounts?.[0]!);

      if (!account) {
        return false;
      }

      this.#account = this.#getAccountFromAddress(account);
      this.#emit('change', { accounts: this.accounts });
      return true;
    } catch (error) {
      console.warn('Error restoring session', error);
      return false;
    }
  };

  #createSession = async (scope: Scope, addresses?: string[]): Promise<void> => {
    let resolvePromise: (value?: void | PromiseLike<void>) => void;
    const waitForAccountChangedPromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    // If there are multiple accounts, wait for the first accountChanged event to know which one to use
    const handleAccountChange = (data: any) => {
      const address = data?.params?.notification?.params?.[0];
      if (address) {
        this.#account = this.#getAccountFromAddress(address);
        removeNotification();
        resolvePromise?.();
      }
    };

    const removeNotification = this.client.onNotification(handleAccountChange);

    const res = await this.client.createSession({
      optionalScopes: {
        [scope]: {
          accounts: addresses?.map((address) => `${scope}:${address}` as CaipAccountId),
          methods: [],
          notifications: [],
        },
      },
      sessionProperties: {
        solana_accountChanged_notifications: true,
      },
    });

    const sessionAccounts = res?.sessionScopes?.[scope]?.accounts;
    if (!sessionAccounts?.length) {
      throw new Error(`Requested scope ${scope} is not available`);
    }

    // If there is only one account, use it
    if (sessionAccounts.length === 1 && sessionAccounts[0]) {
      this.#account = this.#getAccountFromAddress(getAddressFromCaipAccountId(sessionAccounts[0]));
      this.#scope = scope;
      this.#emit('change', { accounts: this.accounts });
      return;
    }

    // Wait for the accountChanged event to know which one to use
    // It can vary from 0 to 50ms depending on the case
    await waitForAccountChangedPromise;
  };
}
