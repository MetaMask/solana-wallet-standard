import { registerWallet } from '@wallet-standard/wallet';
import type { WalletOptions } from './types';
import { MetamaskWallet } from './wallet';

export function getWalletStandard(options: WalletOptions) {
  return new MetamaskWallet(options);
}

export async function registerSolanaWalletStandard(options: WalletOptions) {
  const wallet = getWalletStandard(options);

  registerWallet(wallet);
}
