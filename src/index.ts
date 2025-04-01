import type { MultichainApiClient } from '@metamask/multichain-api-client';
import { registerWallet } from '@wallet-standard/wallet';
import { MetamaskWallet } from './wallet';

export function getWalletStandard({ client }: { client: MultichainApiClient }) {
  return new MetamaskWallet({ client });
}

export async function registerSolanaWalletStandard({ client }: { client: MultichainApiClient }) {
  const wallet = getWalletStandard({ client });

  registerWallet(wallet);
}
