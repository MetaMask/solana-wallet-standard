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
import type { DeepWriteable } from './types';

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
  readonly scope = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
  #account: MetamaskWalletAccount | undefined;

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

  constructor({ client }: { client: MultichainApiClient }) {
    this.client = client;
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
    if (!this.accounts.length) {
      // Setup accountsChanged listener. Returns promise that resolves when first accountsChanged event is received
      const firstEventPromise = new Promise<void>((resolve) => {
        const handleFirstEvent = (data: any) => {
        if (data?.params?.notification?.method === 'metamask_accountsChanged') {
          this.#handleAccountsChangedEvent(data);
            resolve();
        }
        };
        this.client.onNotification(handleFirstEvent);
      });

      const existingSession = await this.client.getSession();

      const session: SessionData | undefined = existingSession?.sessionScopes[this.scope]?.accounts?.length
        ? existingSession
        : await this.client.createSession({
            optionalScopes: {
              [this.scope]: {
                methods: [],
                notifications: [],
              },
            },
            sessionProperties: {
              solana_accountChanged_notifications: true,
            },
          });

      const accounts = session?.sessionScopes[this.scope]?.accounts;

      // Fallback if first event doesn't arrive within a reasonable amount of time
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.warn('No accountsChanged event received, using first account from session');
          if (accounts?.[0]) {
            this.#account = this.#getAccountFromAddress(accounts[0].slice(this.scope.length + 1));
            resolve();
          } else {
            reject(new Error('No accounts available to use from session'));
      }
        }, 2000);

        firstEventPromise.then(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    return { accounts: this.accounts };
  };

  #signIn = async (...inputs: SolanaSignInInput[]): Promise<SolanaSignInOutput[]> => {
    if (!this.#account) {
      await this.#connect();

      if (!this.#account) {
        throw new Error('No account found');
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

  #disconnect = async () => {
    this.#account = undefined;
    this.#emit('change', { accounts: this.accounts });
    await this.client.revokeSession();
  };

  #signAndSendTransaction = async (
    ...inputs: SolanaSignAndSendTransactionInput[]
  ): Promise<SolanaSignAndSendTransactionOutput[]> => {
    if (!this.#account) {
      throw new Error('No account found');
    }
    const results: SolanaSignAndSendTransactionOutput[] = [];

    for (const { transaction: transactionBuffer, account } of inputs) {
      const transaction = Buffer.from(transactionBuffer).toString('base64');

      const signAndSendTransactionRes = await this.client.invokeMethod({
        scope: this.scope,
        request: {
          method: 'signAndSendTransaction',
          params: {
            account: { address: account.address },
            transaction,
            scope: this.scope,
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

  #handleAccountsChangedEvent(data: any) {
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
}
