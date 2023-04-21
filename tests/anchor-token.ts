import * as anchor from "@coral-xyz/anchor"
import { AnchorProvider } from "@coral-xyz/anchor"
import { Program } from "@coral-xyz/anchor"
import { AnchorToken } from "../target/types/anchor_token"
import * as spl from "@solana/spl-token"
import { assert } from "chai"
import { Metaplex } from "@metaplex-foundation/js"
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata"

import * as sbv2 from "@switchboard-xyz/solana.js"
import { NodeOracle } from "@switchboard-xyz/oracle"

describe("anchor-token", () => {
  const provider = AnchorProvider.env()
  anchor.setProvider(provider)

  const program = anchor.workspace.AnchorToken as Program<AnchorToken>
  const wallet = anchor.workspace.AnchorToken.provider.wallet
  const connection = program.provider.connection
  const metaplex = Metaplex.make(connection)

  const [rewardTokenMintPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("reward")],
    program.programId
  )

  const [playerPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("player"), wallet.publicKey.toBuffer()],
    program.programId
  )

  const playerTokenAccount = spl.getAssociatedTokenAddressSync(
    rewardTokenMintPda,
    wallet.publicKey
  )

  // test token metadata
  const metadata = {
    uri: "https://raw.githubusercontent.com/solana-developers/program-examples/new-examples/tokens/tokens/.assets/spl-token.json",
    name: "Solana Gold",
    symbol: "GOLDSOL",
  }

  // Keypair used to create new VRF account during setup
  const vrfSecret = anchor.web3.Keypair.generate()
  console.log(`VRF Account: ${vrfSecret.publicKey}`)

  // PDA for VrfClientState Account, VRF Account is authority of this account
  const [vrfClientKey] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("CLIENTSEED"), vrfSecret.publicKey.toBytes()],
    program.programId
  )
  console.log(`VRF Client: ${vrfClientKey}`)

  const vrfIxCoder = new anchor.BorshInstructionCoder(program.idl)

  // Callback to consume randomness (the instruction that the oracle CPI's back into our program)
  const vrfClientCallback: sbv2.Callback = {
    programId: program.programId,
    accounts: [
      // ensure all accounts in consumeRandomness are populated
      { pubkey: vrfClientKey, isSigner: false, isWritable: true },
      { pubkey: vrfSecret.publicKey, isSigner: false, isWritable: false },
      { pubkey: playerPDA, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: false, isWritable: false },
      {
        pubkey: playerTokenAccount,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: rewardTokenMintPda,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: spl.TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ],
    // ixData: Buffer.from(""),
    ixData: vrfIxCoder.encode("consumeRandomness", ""), // pass any params for instruction here
  }

  let oracle: NodeOracle
  let vrfAccount: sbv2.VrfAccount

  // use this for localnet
  let switchboard: sbv2.SwitchboardTestContext

  // // use this for devnet
  // let switchboard: {
  //   program: sbv2.SwitchboardProgram
  //   queue: sbv2.QueueAccount
  // }

  before(async () => {
    // // use this for devnet
    // const switchboardProgram = await sbv2.SwitchboardProgram.fromProvider(
    //   provider
    // )

    // const [queueAccount, queue] = await sbv2.QueueAccount.load(
    //   switchboardProgram,
    //   "uPeRMdfPmrPqgRWSrjAnAkH78RqAhe5kXoW6vBYRqFX"
    // )
    // switchboard = { program: switchboardProgram, queue: queueAccount }

    // use this for localnet
    switchboard = await sbv2.SwitchboardTestContext.loadFromProvider(provider, {
      // You can provide a keypair to so the PDA schemes dont change between test runs
      name: "Test Queue",
      keypair: sbv2.SwitchboardTestContextV2.loadKeypair(
        "~/.keypairs/queue.json"
      ),
      queueSize: 10,
      reward: 0,
      minStake: 0,
      oracleTimeout: 900,
      unpermissionedFeeds: true,
      unpermissionedVrf: true,
      enableBufferRelayers: true,
      oracle: {
        name: "Test Oracle",
        enable: true,
        stakingWalletKeypair: sbv2.SwitchboardTestContextV2.loadKeypair(
          "~/.keypairs/oracleWallet.json"
        ),
      },
    })

    oracle = await NodeOracle.fromReleaseChannel({
      chain: "solana",
      releaseChannel: "testnet",
      network: "devnet", // disables production capabilities like monitoring and alerts
      rpcUrl: switchboard.program.connection.rpcEndpoint,
      oracleKey: switchboard.oracle.publicKey.toBase58(),
      secretPath: switchboard.walletPath,
      silent: true, // set to true to suppress oracle logs in the console
      envVariables: {
        VERBOSE: "1",
        DEBUG: "1",
        DISABLE_NONCE_QUEUE: "1",
        DISABLE_METRICS: "1",
      },
    })

    await oracle.startAndAwait()
  })

  after(async () => {
    oracle?.stop()
  })

  it("Initialize New Token Mint", async () => {
    const rewardTokenMintMetadataPDA = await metaplex
      .nfts()
      .pdas()
      .metadata({ mint: rewardTokenMintPda })

    // Add your test here.
    const tx = await program.methods
      .createMint(metadata.uri, metadata.name, metadata.symbol)
      .accounts({
        rewardTokenMint: rewardTokenMintPda,
        metadataAccount: rewardTokenMintMetadataPDA,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      })
      .rpc({ skipPreflight: true })
    console.log("Your transaction signature", tx)

    // const mint = await spl.getMint(connection, rewardTokenMintPda)
    // console.log("Mint", mint.decimals)
  })

  it("Init Player", async () => {
    const queue = await switchboard.queue.loadData()

    // Create Switchboard VRF and Permission account
    ;[vrfAccount] = await switchboard.queue.createVrf({
      callback: vrfClientCallback,
      authority: vrfClientKey, // vrf authority
      vrfKeypair: vrfSecret,
      enable: !queue.unpermissionedVrfEnabled, // only set permissions if required
    })

    const tx = await program.methods
      .initPlayer()
      .accounts({
        playerData: playerPDA,
        player: wallet.publicKey,
        state: vrfClientKey,
        vrf: vrfAccount.publicKey,
      })
      .rpc()
    console.log("Your transaction signature", tx)

    const playerData = await program.account.playerData.fetch(playerPDA)
    assert(playerData.health === 100)
  })

  it("request_randomness", async () => {
    const queue = await switchboard.queue.loadData()
    const vrf = await vrfAccount.loadData()

    // derive the existing VRF permission account using the seeds
    const [permissionAccount, permissionBump] = sbv2.PermissionAccount.fromSeed(
      switchboard.program,
      queue.authority,
      switchboard.queue.publicKey,
      vrfAccount.publicKey
    )

    // 0.002 wSOL fee for requesting randomness
    const [payerTokenWallet] =
      await switchboard.program.mint.getOrCreateWrappedUser(
        switchboard.program.walletPubkey,
        { fundUpTo: 0.002 }
      )

    // Request randomness
    const tx = await program.methods
      .requestRandomness(permissionBump, switchboard.program.programState.bump)
      .accounts({
        state: vrfClientKey,
        vrf: vrfAccount.publicKey,
        oracleQueue: switchboard.queue.publicKey,
        queueAuthority: queue.authority,
        dataBuffer: queue.dataBuffer,
        permission: permissionAccount.publicKey,
        escrow: vrf.escrow,
        programState: switchboard.program.programState.publicKey,
        switchboardProgram: switchboard.program.programId,
        payerWallet: payerTokenWallet,
        payerAuthority: wallet.publicKey,
        recentBlockhashes: anchor.web3.SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,

        playerTokenAccount: playerTokenAccount,
        rewardTokenMint: rewardTokenMintPda,
      })
      .rpc()

    console.log("Your transaction signature", tx)

    const result = await vrfAccount.nextResult(
      new anchor.BN(vrf.counter.toNumber() + 1),
      45_000
    )
    if (!result.success) {
      throw new Error(`Failed to get VRF Result: ${result.status}`)
    }

    const vrfClientState = await program.account.vrfClientState.fetch(
      vrfClientKey
    )
    console.log(`VrfClient Result: ${vrfClientState.result.toString(10)}`)

    const playerData = await program.account.playerData.fetch(playerPDA)
    console.log(`Player Health: ${playerData.health}`)

    assert(playerData.health === 100 - vrfClientState.result.toNumber())
    assert.strictEqual(
      Number(
        (await connection.getTokenAccountBalance(playerTokenAccount)).value
          .amount
      ),
      1_000_000_000
    )

    const callbackTxnMeta = await vrfAccount.getCallbackTransactions()
    console.log(
      JSON.stringify(
        callbackTxnMeta.map((tx) => tx.meta.logMessages),
        undefined,
        2
      )
    )

    assert(
      !vrfClientState.result.eq(new anchor.BN(0)),
      "Vrf Client holds no result"
    )
  })

  // it("Kill Enemy to Mint 1 Token", async () => {
  //   // Add your test here.
  //   const tx = await program.methods
  //     .killEnemy()
  //     .accounts({
  //       playerData: playerPDA,
  //       playerTokenAccount: playerTokenAccount,
  //       rewardTokenMint: rewardTokenMintPda,
  //     })
  //     .rpc()
  //   console.log("Your transaction signature", tx)
  //   assert.strictEqual(
  //     Number(
  //       (await connection.getTokenAccountBalance(playerTokenAccount)).value
  //         .amount
  //     ),
  //     1_000_000_000
  //   )

  //   const playerData = await program.account.playerData.fetch(playerPDA)
  //   assert(playerData.health === 90)
  // })

  it("Burn 1 Token to Heal", async () => {
    // Add your test here.
    const tx = await program.methods
      .heal()
      .accounts({
        playerData: playerPDA,
        playerTokenAccount: playerTokenAccount,
        rewardTokenMint: rewardTokenMintPda,
      })
      .rpc()
    console.log("Your transaction signature", tx)
    assert.strictEqual(
      Number(
        (await connection.getTokenAccountBalance(playerTokenAccount)).value
          .amount
      ),
      0
    )

    const playerData = await program.account.playerData.fetch(playerPDA)
    assert(playerData.health === 100)
  })
})
