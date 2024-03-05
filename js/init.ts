const anchor = require('@project-serum/anchor');
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");

const fs = require('fs');
const path = require('path');
const os = require("os");

const idlPath = path.resolve(__dirname, '../target/idl/spl_staking.json');
console.log(idlPath);
const idl = JSON.parse(fs.readFileSync(idlPath));
const programID = new anchor.web3.PublicKey(idl.metadata.address);

const walletKeyData = JSON.parse(fs.readFileSync('id.json'));
const walletKeypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(walletKeyData));
const wallet = new anchor.Wallet(walletKeypair);

const connection = new anchor.web3.Connection(process.env.ANCHOR_PROVIDER_URL);

function getProvider() {
  const provider = new anchor.Provider(
      connection, wallet, { preflightCommitment: "processed" },
  );
  return provider;
};
const provider = getProvider();
let program = new anchor.Program(idl, programID, provider);
let stakingMintObject;
let stakingTokenPubkey;
let stakingMintPubkey = new anchor.web3.PublicKey('AKxR1NLTtPnsVcWwPSEGat1TC9da3Z2vX7sY4G7ZLj1r');
let mintRewards = new anchor.web3.PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
let poolKeypair, rewardsMintObject;

const initializeMints = async () => {
  console.log("Program ID: ", programID.toString());
  console.log("Wallet: ", provider.wallet.publicKey.toString());

  stakingMintObject = new Token(provider.connection, stakingMintPubkey, TOKEN_PROGRAM_ID, provider.wallet.payer);
  rewardsMintObject = new Token(provider.connection, mintRewards, TOKEN_PROGRAM_ID, provider.wallet.payer);
  
  const poolRawData = fs.readFileSync('json/pool.json');
  poolKeypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(poolRawData)));

  let tokenAccounts = await provider.connection.getParsedTokenAccountsByOwner(provider.wallet.publicKey, {mint: stakingMintPubkey});

  let stakingTokenAccountInfo = await stakingMintObject.getOrCreateAssociatedAccountInfo(provider.wallet.publicKey);
  stakingTokenPubkey = stakingTokenAccountInfo.address;
}

const initializePool = async () => {
    await initializeMints();
    
  const [
        _poolSigner,
        _nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [poolKeypair.publicKey.toBuffer()],
        programID
    );
    let poolSigner = _poolSigner;
    let poolNonce = _nonce;

    let stakingTokenPoolVault = await stakingMintObject.createAccount(poolSigner);
    let mintRewardsVault = await rewardsMintObject.createAccount(poolSigner);

    const [
        _vaultPubkey,
        _vaultNonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [provider.wallet.publicKey.toBuffer(), poolKeypair.publicKey.toBuffer()],
        programID
    );
    let vaultPubkey = _vaultPubkey;
    let vaultNonce = _vaultNonce;

    await program.rpc.initialize(
        poolNonce,
        {
            accounts: {
                authority: provider.wallet.publicKey,
                stakingMint: stakingMintObject.publicKey,
                stakingVault: stakingTokenPoolVault,
                rewardAMint: rewardsMintObject.publicKey,
                rewardAVault: mintRewardsVault,
                poolSigner: poolSigner,
                pool: poolKeypair.publicKey,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
            signers: [poolKeypair],
            instructions: [
                await program.account.pool.createInstruction(poolKeypair, ),
            ],
        }
    );
    console.log("Successfully initialized!");
}

initializePool();
