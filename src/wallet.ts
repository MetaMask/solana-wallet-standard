import type { MultichainApiClient, SessionData } from '@metamask/multichain-api-client';
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
import { type CaipAccountId, type DeepWriteable, Scope, type WalletOptions } from './types';
import { getAddressFromCaipAccountId, getScopeFromWalletStandardChain, isSessionChangedEvent } from './utils';

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
  readonly name;
  readonly icon = metamaskIcon;
  readonly chains: SolanaChain[] = [SOLANA_MAINNET_CHAIN, SOLANA_DEVNET_CHAIN, SOLANA_TESTNET_CHAIN];
  protected scope: Scope | undefined;
  #account: MetamaskWalletAccount | undefined;
  #removeSessionChangedListener: (() => void) | undefined;

  client: MultichainApiClient;

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

  constructor({ client, walletName }: WalletOptions) {
    this.client = client;
    this.name = `${walletName ?? 'MetaMask'}` as const;

    // TODO: talk with Baptiste and Edouard about this
    this.#tryRestoringSession();
    this.#removeSessionChangedListener = this.client.onNotification(this.#handleSessionChangedEvent.bind(this));
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
    await this.#tryRestoringSession();

    // Otherwise create a session on Mainnet by default
    if (!this.accounts.length) {
      await this.#createSession(Scope.MAINNET);
    }

    // In case user didn't select any Solana scope/account, return
    if (!this.accounts.length) {
      return { accounts: [] };
    }

    this.#removeSessionChangedListener?.();
    this.#removeSessionChangedListener = this.client.onNotification(this.#handleSessionChangedEvent.bind(this));

    return { accounts: this.accounts };
  };

  #signIn = async (...inputs: SolanaSignInInput[]): Promise<SolanaSignInOutput[]> => {
    if (!this.#account || !this.scope) {
      await this.#connect();

      if (!this.#account || !this.scope) {
        throw new Error('Not connected');
      }
    }

    const results: SolanaSignInOutput[] = [];

    for (const input of inputs) {
      const signInRes = await this.client.invokeMethod({
        scope: this.scope,
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

  #disconnect = async (options: { revokeSession?: boolean } = {}) => {
    const wasConnected = Boolean(this.#account);
    const { revokeSession = true } = options;
    this.#account = undefined;
    this.scope = undefined;
    this.#removeSessionChangedListener?.();
    this.#removeSessionChangedListener = undefined;
    if (wasConnected) {
      this.#emit('change', { accounts: this.accounts });
    }
    if (revokeSession) {
      await this.client.revokeSession({ scopes: [Scope.MAINNET, Scope.DEVNET, Scope.TESTNET] });
    }
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
    if (sessionAccounts?.includes(`${scope}:${account.address}`)) {
      this.scope = scope;
    } else {
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
    if (!this.scope) {
      throw new Error('Not connected');
    }

    const results: SolanaSignTransactionOutput[] = [];

    for (const { transaction: transactionBuffer, account } of inputs) {
      const transaction = Buffer.from(transactionBuffer).toString('base64');

      const signTransactionRes = await this.client.invokeMethod({
        scope: this.scope,
        request: {
          method: 'signTransaction',
          params: {
            account: { address: account.address },
            transaction,
            scope: this.scope,
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
    if (!this.scope) {
      throw new Error('Not connected');
    }

    const results: SolanaSignMessageOutput[] = [];

    for (const { message: messageBuffer, account } of inputs) {
      const message = Buffer.from(messageBuffer).toString('base64');

      const signMessageRes = await this.client.invokeMethod({
        scope: this.scope,
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

  /**
   * Handles the wallet_sessionChanged event.
   * Updates internal state to connected (with correct change event) when the session has Solana scopes,
   * or to disconnected when it does not.
   * @param data - The event data
   */
  async #handleSessionChangedEvent(data: any) {
    if (!isSessionChangedEvent(data)) {
      return;
    }

    const sessionScopes = Object.keys(data.params.sessionScopes);
    const solanaScopes = [Scope.MAINNET, Scope.DEVNET, Scope.TESTNET];
    const hasSolanaScope = sessionScopes.some((scope) => solanaScopes.includes(scope as Scope));

    if (hasSolanaScope) {
      this.updateSession(data.params);
    } else {
      // An empty accountsChanged event means that the Solana scope was revoked outside of Wallet Standard.
      // We don't revoke the session in this case to avoid side effects on EVM scopes
      await this.#disconnect({ revokeSession: false });
    }
  }

  /**
   * Updates the session and the account to connect to.
   * This method handles the logic for selecting the appropriate Solana network scope (mainnet/devnet/testnet)
   * and account to connect to based on the following priority: mainnet > devnet > testnet. It assumes the same
   * set of accounts is available for all Solana scopes and will take the first account found from the scopes above.
   *
   * @param session - The session data containing available scopes and accounts
   */
  protected updateSession(session: SessionData | undefined) {
    // Get session scopes
    const sessionScopes = new Set(Object.keys(session?.sessionScopes ?? {}));

    // Find the first available scope in priority order: mainnet > devnet > testnet.
    const scopePriorityOrder = [Scope.MAINNET, Scope.DEVNET, Scope.TESTNET];
    const scope = scopePriorityOrder.find((scope) => sessionScopes.has(scope));

    // If no scope is available, don't disconnect so that we can create/update a new session
    if (!scope) {
      this.#account = undefined;
      return;
    }
    const selectedAccountId = session?.sessionScopes[scope]?.accounts?.[0];

    // In case the Solana scope is available but without any accounts
    // Could happen if the user already created a session using ethereum injected provider for example or the SDK
    // Don't disconnect so that we can create/update a new session
    if (!selectedAccountId) {
      this.#account = undefined;
      return;
    }

    const addressToConnect = getAddressFromCaipAccountId(selectedAccountId);

    // Update the account and scope
    const previousAccount = this.#account;
    this.#account = this.#getAccountFromAddress(addressToConnect);
    this.scope = scope;
    if (this.#account !== previousAccount) {
      this.#emit('change', { accounts: this.accounts });
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

  #tryRestoringSession = async (): Promise<void> => {
    try {
      const existingSession = await this.client.getSession();

      if (!existingSession) {
        return;
      }

      this.updateSession(existingSession);
    } catch (error) {
      console.warn('Error restoring session', error);
    }
  };

  #createSession = async (scope: Scope, addresses?: string[]): Promise<void> => {
    const session = await this.client.createSession({
      optionalScopes: {
        [scope]: {
          ...(addresses ? { accounts: addresses.map((address) => `${scope}:${address}` as CaipAccountId) } : {}),
          methods: [],
          notifications: [],
        },
      },
      sessionProperties: {
        // Previously this was needed to enable metamask_accountsChanged events for Solana.
        // This isn't needed for that purpose since we now use wallet_sessionChanged events.
        // However this is still needed to help the wallet identify our injected solana provider
        // until we migrate to a more accurate property name.
        solana_accountChanged_notifications: true,
      },
    });

    this.updateSession(session);
  };
}
