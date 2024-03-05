# anchor-spl-staking

## Installation

[https://project-serum.github.io/anchor/getting-started/installation.html](https://project-serum.github.io/anchor/getting-started/installation.html)

## Build and deploy

Open Anchor.toml file and update wallet path and `localnet` to `mainnet`

`anchor build`

`solana address -k target/deploy/spl_staking-keypair.json`

Copy the output result and update `declear_id` value in `programs/spl-staking/src/lib.rs`.

`anchor build`

Check wallet balance 4 sol over.

`anchor deploy`
