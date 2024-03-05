import * as assert from "assert";
import * as anchor from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { Program } from '@project-serum/anchor';
import { SplStaking } from '../target/types/spl_staking';
import * as utils from "./utils";
import { User, claimForUsers } from "./user";
import * as fs from 'fs';

describe('spl-staking', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.SplStaking as Program<SplStaking>;
  const provider = anchor.Provider.env();

  let stakingMint, mintA, users, funders;
  let poolKeypair = anchor.web3.Keypair.generate();

  it('initialized mint!', async () => {
    console.log("Program ID: ", program.programId.toString());
    console.log("Wallet: ", provider.wallet.publicKey.toString());

    stakingMint = await utils.createMint(provider, 9);
    mintA = await utils.createMint(provider, 9);
  });


  it("Initialize users", async () => {
    users = [1, 2, 3, 4, 5].map(a => new User(a));
    await Promise.all(
      users.map(a => a.init(anchor.web3.LAMPORTS_PER_SOL, stakingMint.publicKey, 5_000_000_000, mintA.publicKey, 0))
    );
  })

  it("Initialize funders", async () => {
    funders = [0].map(a => new User(a));
    await funders[0].init(anchor.web3.LAMPORTS_PER_SOL, stakingMint.publicKey, 0, mintA.publicKey, 100_000_000_000);
  });

  it("Creates a pool", async () => {
    await funders[0].initializePool(poolKeypair);
  });

  it('User does some single staking', async () => {

    //we test all this in greater detail later, but this is a flow for single reward staking
    let pool = funders[0].poolPubkey;
    let user = users[0];
    await user.createUserStakingAccount(pool);
    await user.stakeTokens(100_000);
    
    await funders[0].fund(1_000_000_000);
    var expected = await user.getUserPendingRewardsFunction();
    var e = expected()
    console.log("Expected", e[0], e[1]);
    await wait(1);
    e = expected()
    console.log("Expected", e[0], e[1]);
    await wait(1);
    e = expected()
    console.log("Expected", e[0], e[1]);
    await wait(1);
    e = expected()
    console.log("Expected", e[0], e[1]);
    await wait(1);
    e = expected()
    console.log("Expected", e[0], e[1]);
    await wait(1);
    e = expected()
    console.log("Expected", e[0], e[1]);

    await claimForUsers([user]);
    await user.unstakeTokens(100_000);
    await user.closeUser();
    await funders[0].pausePool();
    await funders[0].closePool();
  });
  
});

async function wait(seconds) {
  while(seconds > 0) {
    console.log("countdown " + seconds--);
    await new Promise(a=>setTimeout(a, 1000));
  }
  console.log("wait over");
}