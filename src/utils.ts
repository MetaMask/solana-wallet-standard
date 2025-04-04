import type { CaipAccountId } from './types';

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

  console.log(caipAccountId, match);

  if (!match?.groups?.accountAddress) {
    throw new Error('Invalid CAIP account ID.');
  }

  return match.groups.accountAddress!;
}
