export type CaipAccountId = `${string}:${string}:${string}`;

export type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };
