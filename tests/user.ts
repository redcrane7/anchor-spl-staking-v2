import * as anchor from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import * as utils from "./utils";

async function claimForUsers(users) {
    //some eye piercing way to claim for all users async, then print out all users balances
    //if you're reading this, all we're effectively doing here is calling "claim()" on a user.
    let r = await Promise.all(
      users.map(a => a.claim().then(b=>[a,b]))
    );
    console.log("--- users claimed ---")
    r.sort((a,b)=>a[0].id < b[0].id)
        .forEach(a=>{
            a[0].currentA = a[1][0];
            a[0].currentB = a[1][1];
            console.log(a[0].id, "amtA", a[0].currentA, "amtB", a[0].currentB);
        });
}

///user can be an admin or a staker. either way, call init - then can call other methods
class User {
    constructor(a) { this.id = a; }

    async init(initialLamports, stakingMint, initialStaking, mintA, initialA) {
        this.keypair = new anchor.web3.Keypair();
        this.pubkey = this.keypair.publicKey;

        let envProvider = anchor.Provider.env();
        envProvider.commitment = 'pending';
        await utils.sendLamports(envProvider, this.pubkey, initialLamports);

        this.provider = new anchor.Provider(envProvider.connection, new anchor.Wallet(this.keypair), envProvider.opts);
        const program = anchor.workspace.SplStaking as Program<SplStaking>;
        this.program = new anchor.Program(program.idl, program.programId, this.provider);

        this.stakingMintObject = new Token(this.provider.connection, stakingMint, TOKEN_PROGRAM_ID, this.provider.wallet.payer);
        this.mintAObject = new Token(this.provider.connection, mintA, TOKEN_PROGRAM_ID, this.provider.wallet.payer);

        this.poolPubkey = null;
        this.userPubkey = null;
        this.userNonce = null;
        this.lpPubkey = null;

        this.stakingPubkey = await this.stakingMintObject.createAssociatedTokenAccount(this.pubkey);
        if (initialStaking > 0) {
            await this.stakingMintObject.mintTo(this.stakingPubkey, envProvider.wallet.payer, [], initialStaking);
        }
        this.mintAPubkey = await this.mintAObject.createAssociatedTokenAccount(this.pubkey);
        if (initialA > 0) {
            await this.mintAObject.mintTo(this.mintAPubkey, envProvider.wallet.payer, [], initialA);
        }

        this.mintBPubkey = this.stakingPubkey;
    }

    async initializePool(poolKeypair, rewardDuration) {
        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [poolKeypair.publicKey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;
        let poolNonce = _nonce;

        let stakingMintVault = await this.stakingMintObject.createAccount(poolSigner);
        let mintAVault = await this.mintAObject.createAccount(poolSigner);

        this.poolPubkey = poolKeypair.publicKey;
        this.admin = {
            poolKeypair,
            poolSigner,
            poolNonce,
            stakingMintVault,
            mintAVault
        };

        await this.program.rpc.initialize(
            poolNonce,
            {
                accounts: {
                    authority: this.provider.wallet.publicKey,
                    stakingMint: this.stakingMintObject.publicKey,
                    stakingVault: stakingMintVault,
                    rewardAMint: this.mintAObject.publicKey,
                    rewardAVault: mintAVault,
                    poolSigner: poolSigner,
                    pool: this.poolPubkey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
                signers: [poolKeypair],
                instructions: [
                    await this.program.account.pool.createInstruction(poolKeypair, ),
                ],
            }
        );

    }

    async createUserStakingAccount(poolPubkey) {
        this.poolPubkey = poolPubkey;

        const [
            _userPubkey, _userNonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.provider.wallet.publicKey.toBuffer(), poolPubkey.toBuffer()],
            this.program.programId
        );
        this.userPubkey = _userPubkey;
        this.userNonce = _userNonce;

        const balanceNeeded = await Token.getMinBalanceRentForExemptAccount(this.provider.connection);

        await this.program.rpc.createUser(this.userNonce, {
            accounts: {
                pool: poolPubkey,
                user: this.userPubkey,
                owner: this.provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });
    }

    async stakeTokens(amount) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.stake(
            new anchor.BN(amount),
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    stakingVault: poolObject.stakingVault,
                    // User.
                    user: this.userPubkey,
                    owner: this.provider.wallet.publicKey,
                    stakeFromAccount: this.stakingPubkey,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
    }

    async pausePool(authority) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.pause(
            {
                accounts: {
                    pool: this.poolPubkey,
                    authority: authority ?? this.provider.wallet.publicKey,
                    poolSigner: poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
    }

    async unpausePool(authority) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.unpause(
            {
                accounts: {
                    pool: this.poolPubkey,
                    authority: authority ?? this.provider.wallet.publicKey,
                    poolSigner: poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
    }

    async unstakeTokens(amount) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.unstake(
            new anchor.BN(amount),
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    stakingVault: poolObject.stakingVault,
                    // User.
                    user: this.userPubkey,
                    owner: this.provider.wallet.publicKey,
                    stakeFromAccount: this.stakingPubkey,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            });
    }

    async authorizeFunder(newFunder) {
        await this.program.rpc.authorizeFunder(
            newFunder,
            {
                accounts: {
                    pool: this.poolPubkey,
                    authority: this.provider.wallet.publicKey,
                },
            });
    }

    async deauthorizeFunder(oldFunder) {
        await this.program.rpc.deauthorizeFunder(
            oldFunder,
            {
                accounts: {
                    pool: this.poolPubkey,
                    authority: this.provider.wallet.publicKey,
                },
            });
    }

    async fund(amountA) {
        let pubkeyToUse = this.poolPubkey;
        let poolObject = await this.program.account.pool.fetch(pubkeyToUse);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [pubkeyToUse.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.fund(
            new anchor.BN(amountA),
            {
                accounts: {
                    // Stake instance.
                    pool: pubkeyToUse,
                    stakingVault: poolObject.stakingVault,
                    rewardAVault: poolObject.rewardAVault,
                    funder: this.provider.wallet.publicKey,
                    fromA: this.mintAPubkey,
                    // Program signers.
                    poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            });
    }

    async getUserPendingRewardsFunction() {
        return await User.getPendingRewardsFunction(this.program, this.poolPubkey);
    }
    
    static async getPendingRewardsFunction(rewardsPoolAnchorProgram, rewardsPoolPubkey) {
        const U64_MAX = new anchor.BN("18446744073709551615", 10);
        
        const [
            userPubkey, _userNonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [rewardsPoolAnchorProgram.provider.wallet.publicKey.toBuffer(), rewardsPoolPubkey.toBuffer()],
            rewardsPoolAnchorProgram.programId
        );
        let userObject = await rewardsPoolAnchorProgram.account.user.fetch(userPubkey);

        let rewardA = new anchor.BN(userObject.rewardA);
        let rewardB = new anchor.BN(userObject.rewardB);
        let rewardARate = new anchor.BN(userObject.rewardARate);
        let rewardBRate = new anchor.BN(userObject.rewardBRate);
        let lastUpdate = userObject.lastUpdateTime;

        console.log('rewardARate: ', rewardARate.toNumber())
        console.log('rewardBRate: ', rewardBRate.toNumber())
        console.log('balanceStaked: ', userObject.balanceStaked.toNumber())

        //a function that gives the total rewards emitted over the whole pool since last update
        let fnAllRewardsPerToken = () => {
            var elapsed = new anchor.BN(Math.floor(Date.now() / 1000) - lastUpdate);
            var currentAReward = rewardA.add(elapsed.mul(rewardARate).mul(U64_MAX));
            var currentBReward = rewardB.add(elapsed.mul(rewardBRate).mul(U64_MAX));
            return [currentAReward, currentBReward];
        };

        //a function that gives a user's total unclaimed rewards since last update
        let currentPending = () => {
            var rwds = fnAllRewardsPerToken();
            var a = rwds[0].div(U64_MAX).toNumber();
            var b = rwds[1].div(U64_MAX).toNumber();

            return [a, b];
            
        }

        return currentPending;
    }

    async claim() {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.claim({
            accounts: {
                // Stake instance.
                pool: this.poolPubkey,
                stakingVault: poolObject.stakingVault,
                rewardAVault: poolObject.rewardAVault,
                // User.
                user: this.userPubkey,
                owner: this.provider.wallet.publicKey,
                rewardAAccount: this.mintAPubkey,
                rewardBAccount: this.stakingPubkey,
                // Program signers.
                poolSigner,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
        });

        let amtA = await this.provider.connection.getTokenAccountBalance(this.mintAPubkey);
        let amtB = await this.provider.connection.getTokenAccountBalance(this.stakingPubkey);

        return [amtA.value.uiAmount, amtB.value.uiAmount];
    }

    async closeUser() {
        await this.program.rpc.closeUser(
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    user: this.userPubkey,
                    owner: this.provider.wallet.publicKey,
                },
            });
    }

    async closePool() {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [ configPubkey, ___nonce] = 
            await anchor.web3.PublicKey.findProgramAddress(
                [Buffer.from("config")], 
                this.program.programId
            );

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;
        let nonce = _nonce;

        await this.program.rpc.closePool(
            {
                accounts: {
                    // Stake instance.
                    authority: this.provider.wallet.publicKey,
                    refundee: this.provider.wallet.publicKey,
                    stakingRefundee: this.stakingPubkey,
                    rewardARefundee: this.mintAPubkey,
                    pool: this.poolPubkey,
                    stakingVault: poolObject.stakingVault,
                    rewardAVault: poolObject.rewardAVault,
                    poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            });
    }
}

module.exports = {
    claimForUsers,
    User
};
