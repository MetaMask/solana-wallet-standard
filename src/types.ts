export type CaipChainIdStruct = `${string}:${string}`;
export type CaipAccountId = `${string}:${string}:${string}`;

export type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };

export enum Scopes {
  SOLANA = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  SOLANA_DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  SOLANA_TESTNET = 'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z',
}

export const scopes = Object.values(Scopes);
