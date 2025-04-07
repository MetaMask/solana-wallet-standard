import { SOLANA_DEVNET_CHAIN, SOLANA_MAINNET_CHAIN, SOLANA_TESTNET_CHAIN } from '@solana/wallet-standard-chains';
import { type CaipAccountId, type CaipChainIdStruct, Scopes, scopes } from './types';

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
  if (!match?.groups) {
    throw new Error('Invalid CAIP account ID.');
  }

  return match.groups.accountAddress!;
}

export function getScopeFromWalletStandardChain(chainId: CaipChainIdStruct | undefined): Scopes {
  switch (chainId) {
    case SOLANA_MAINNET_CHAIN:
    case undefined:
      return Scopes.SOLANA;
    case SOLANA_TESTNET_CHAIN:
      return Scopes.SOLANA_TESTNET;
    case SOLANA_DEVNET_CHAIN:
      return Scopes.SOLANA_DEVNET;
    default: {
      if (scopes.includes(chainId as Scopes)) {
        return chainId as Scopes;
      }
      throw new Error(`Unsupported chainId: ${chainId}`);
    }
  }
}

export const defaultScope = Scopes.SOLANA;
