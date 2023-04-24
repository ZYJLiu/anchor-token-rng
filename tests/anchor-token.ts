import * as anchor from "@project-serum/anchor"
import { Program } from "@project-serum/anchor"
import { AnchorToken } from "../target/types/anchor_token"
import * as spl from "@solana/spl-token"
import { assert } from "chai"
import { Metaplex } from "@metaplex-foundation/js"
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata"

describe("anchor-token", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env())

  const program = anchor.workspace.AnchorToken as Program<AnchorToken>
  const wallet = anchor.workspace.AnchorToken.provider.wallet
  const connection = program.provider.connection
  const metaplex = Metaplex.make(connection)

  const [rewardTokenMintPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("reward")],
    program.programId
  )

  const [playerPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("player"), wallet.publicKey.toBuffer()],
    program.programId
  )

  const playerTokenAccount = spl.getAssociatedTokenAddressSync(
    rewardTokenMintPDA,
    wallet.publicKey
  )

  // test token metadata
  const metadata = {
    uri: "https://raw.githubusercontent.com/solana-developers/program-examples/new-examples/tokens/tokens/.assets/spl-token.json",
    name: "Solana Gold",
    symbol: "GOLDSOL",
  }

  it("Initialize New Token Mint", async () => {
    const rewardTokenMintMetadataPDA = await metaplex
      .nfts()
      .pdas()
      .metadata({ mint: rewardTokenMintPDA })

    // Add your test here.
    const tx = await program.methods
      .createMint(metadata.uri, metadata.name, metadata.symbol)
      .accounts({
        rewardTokenMint: rewardTokenMintPDA,
        metadataAccount: rewardTokenMintMetadataPDA,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      })
      .rpc({ skipPreflight: true })
    console.log("Your transaction signature", tx)

    // const mint = await spl.getMint(connection, rewardTokenMintPda)
    // console.log("Mint", mint.decimals)
  })

  it("Init Player", async () => {
    // Add your test here.
    const tx = await program.methods
      .initPlayer()
      .accounts({
        playerData: playerPDA,
        player: wallet.publicKey,
      })
      .rpc()
    console.log("Your transaction signature", tx)

    const playerData = await program.account.playerData.fetch(playerPDA)
    assert(playerData.health === 100)
  })

  it("Kill Enemy to Mint 1 Token", async () => {
    // Add your test here.
    const tx = await program.methods
      .killEnemy()
      .accounts({
        playerData: playerPDA,
        playerTokenAccount: playerTokenAccount,
        rewardTokenMint: rewardTokenMintPDA,
      })
      .rpc()
    console.log("Your transaction signature", tx)
    assert.strictEqual(
      Number(
        (await connection.getTokenAccountBalance(playerTokenAccount)).value
          .amount
      ),
      1_000_000_000
    )

    const playerData = await program.account.playerData.fetch(playerPDA)
    console.log("Player Health: ", playerData.health)
  })

  it("Burn 1 Token to Heal", async () => {
    // Add your test here.
    const tx = await program.methods
      .heal()
      .accounts({
        playerData: playerPDA,
        playerTokenAccount: playerTokenAccount,
        rewardTokenMint: rewardTokenMintPDA,
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
