# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0]

### Added

- Support partial revokes via `wallet_revokeSession` ([#53](https://github.com/MetaMask/solana-wallet-standard/pull/53))

### Changed

- chore(deps-dev): bump @metamask/auto-changelog from 5.0.2 to 5.1.0 ([#52](https://github.com/MetaMask/solana-wallet-standard/pull/52))
- chore(deps-dev): bump vite in the npm_and_yarn group across 1 directory ([#51](https://github.com/MetaMask/solana-wallet-standard/pull/51))

## [0.5.1]

### Fixed

- fix: update #disconnect to not revoke session on Solana disconnect via account changed event ([#48](https://github.com/MetaMask/solana-wallet-standard/pull/48))

## [0.5.0]

### Changed

- feat: remove extra character in connector name ([#42](https://github.com/MetaMask/solana-wallet-standard/pull/42))
- fix: gracefully handle cases where no account is provided in the scope ([#39](https://github.com/MetaMask/solana-wallet-standard/pull/39))

## [0.4.1]

### Fixed

- fix: export missing options on `registerSolanaWalletStandard` helper ([#35](https://github.com/MetaMask/solana-wallet-standard/pull/35))

## [0.4.0]

### Changed

- feat: Inject MetaMask wallet name for prod and flask release ([#33](https://github.com/MetaMask/solana-wallet-standard/pull/33))

## [0.3.1]

### Fixed

- Update connector name to use a character compatible with `trim()` ([#31](https://github.com/MetaMask/solana-wallet-standard/pull/31))

## [0.3.0]

### Changed

- Refactor scope and account selection ([#23](https://github.com/MetaMask/solana-wallet-standard/pull/23))
- Update metamask logo ([#27](https://github.com/MetaMask/solana-wallet-standard/pull/27))

## [0.2.0]

### Changed

- Support testnets ([#9](https://github.com/MetaMask/solana-wallet-standard/pull/9))

## [0.1.1]

### Fixed

- Fix account selection on page load ([#15](https://github.com/MetaMask/solana-wallet-standard/pull/15))
- Update connector name ([#14](https://github.com/MetaMask/solana-wallet-standard/pull/14))

## [0.1.0]

### Changed

- Initial release

[Unreleased]: https://github.com/MetaMask/solana-wallet-standard/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/MetaMask/solana-wallet-standard/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/MetaMask/solana-wallet-standard/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/MetaMask/solana-wallet-standard/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/MetaMask/solana-wallet-standard/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/MetaMask/solana-wallet-standard/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/MetaMask/solana-wallet-standard/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/MetaMask/solana-wallet-standard/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/MetaMask/solana-wallet-standard/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/MetaMask/solana-wallet-standard/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/MetaMask/solana-wallet-standard/releases/tag/v0.1.0
