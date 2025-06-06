import type { SessionData } from '@metamask/multichain-api-client';
import { SOLANA_DEVNET_CHAIN, SOLANA_MAINNET_CHAIN, SOLANA_TESTNET_CHAIN } from '@solana/wallet-standard-chains';
import { type CaipAccountId, type CaipChainIdStruct, Scope, scopes } from './types';

export const CAIP_ACCOUNT_ID_REGEX =
  /^(?<chainId>(?<namespace>[-a-z0-9]{3,8}):(?<reference>[-_a-zA-Z0-9]{1,32})):(?<accountAddress>[-.%a-zA-Z0-9]{1,128})$/u;

/**
 * Validates and parses a CAIP-10 account ID.
 *
 * @param caipAccountId - The CAIP-10 account ID to validate and parse.
 * @returns The CAIP-10 address.
 */
export function getAddressFromCaipAccountId(caipAccountId: CaipAccountId) {
  const match = CAIP_ACCOUNT_ID_REGEX.exec(caipAccountId);

  if (!match?.groups?.accountAddress) {
    throw new Error('Invalid CAIP account ID.');
  }

  return match.groups.accountAddress!;
}

export function getScopeFromWalletStandardChain(chainId: CaipChainIdStruct | undefined): Scope {
  switch (chainId) {
    case SOLANA_MAINNET_CHAIN:
    case undefined:
      return Scope.MAINNET;
    case SOLANA_TESTNET_CHAIN:
      return Scope.TESTNET;
    case SOLANA_DEVNET_CHAIN:
      return Scope.DEVNET;
    default: {
      if (scopes.includes(chainId as Scope)) {
        return chainId as Scope;
      }
      throw new Error(`Unsupported chainId: ${chainId}`);
    }
  }
}

/**
 * Get the non-Solana session scopes from a session.
 *
 * @param session - The existing session.
 * @returns The non-Solana session scopes.
 */
export function getNonSolanaSessionScopes(session: SessionData | undefined) {
  const nonSolanaSessionScopes: Record<string, any> = {};
  for (const [scope, scopeData] of Object.entries(session?.sessionScopes ?? {})) {
    if (!scope.startsWith('solana:')) {
      nonSolanaSessionScopes[scope] = scopeData;
    }
  }
  return nonSolanaSessionScopes;
}

export function isAccountChangedEvent(event: any) {
  return event.params?.notification?.method === 'metamask_accountsChanged';
}
