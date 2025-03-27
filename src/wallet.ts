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

type CaipAccountId = `${string}:${string}:${string}`;

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
  readonly name = 'MetaMask (Injected pkg)' as const;
  readonly icon = metamaskIcon;
  readonly chains: SolanaChain[] = [SOLANA_MAINNET_CHAIN, SOLANA_DEVNET_CHAIN, SOLANA_TESTNET_CHAIN];
  readonly scope = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
  #account: MetamaskWalletAccount | undefined;

  client: MultichainApiClient;

  get accounts() {
    return this.#account ? [this.#account] : [];
  }

  get features(): StandardConnectFeature &
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

  #connect = async () => {
    if (!this.accounts.length) {
      const existingSession = await this.client.getSession();
      // If there's no existing accounts for this session scope, create a new one
      const session: SessionData | undefined = existingSession?.sessionScopes[this.scope]?.accounts?.length
        ? existingSession
        : await this.client.createSession({
            optionalScopes: {
              [this.scope]: {
                methods: ['getGenesisHash', 'signMessage'],
                notifications: ['accountsChanged'],
                accounts: [`${this.scope}:6AwJL1LnMjwsB8GkJCPexEwznnhpiMV4DHv8QsRLtnNc`] as CaipAccountId[],
              },
            },
          });

      const accounts = session?.sessionScopes[this.scope]?.accounts;

      if (!accounts?.length) {
        throw new Error('No accounts found in MetaMask session');
      }

      const address = accounts[0]?.slice(this.scope.length + 1);
      if (!address) {
        throw new Error('No address found in MetaMask account');
      }

      const publicKey = new Uint8Array(Buffer.from(address, 'hex'));

      this.#account = new MetamaskWalletAccount({
        address,
        publicKey,
        chains: this.chains,
      });

      this.#emit('change', { accounts: this.accounts });
    }

    return { accounts: this.accounts };
  };

  #disconnect = async () => {
    this.#account = undefined;
    await this.client.revokeSession(); // TODO: remove only the solana scope from the session
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
}
