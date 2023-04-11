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

  const [rewardTokenMintPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("reward")],
    program.programId
  )

  const [vaultTokenAccountPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), rewardTokenMintPda.toBuffer()],
    program.programId
  )

  const playerTokenAccount = spl.getAssociatedTokenAddressSync(
    rewardTokenMintPda,
    wallet.publicKey
  )

  // test token metadata
  const metadata = {
    uri: "https://arweave.net/h19GMcMz7RLDY7kAHGWeWolHTmO83mLLMNPzEkF32BQ",
    name: "NAME",
    symbol: "SYMBOL",
  }

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
      .rpc()
    console.log("Your transaction signature", tx)
  })

  it("Mint Tokens", async () => {
    // Add your test here.
    const tx = await program.methods
      .mintTokens(new anchor.BN(1_000_000_000))
      .accounts({
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
      1_000_000_000
    )
  })

  it("Deposit Tokens", async () => {
    // Add your test here.
    const tx = await program.methods
      .depositTokens(new anchor.BN(1_000_000_000))
      .accounts({
        playerTokenAccount: playerTokenAccount,
        vaultTokenAccount: vaultTokenAccountPda,
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

    assert.strictEqual(
      Number(
        (await connection.getTokenAccountBalance(vaultTokenAccountPda)).value
          .amount
      ),
      1_000_000_000
    )
  })

  it("Withdraw Tokens", async () => {
    // Add your test here.
    const tx = await program.methods
      .withdrawTokens(new anchor.BN(1_000_000_000))
      .accounts({
        playerTokenAccount: playerTokenAccount,
        vaultTokenAccount: vaultTokenAccountPda,
        rewardTokenMint: rewardTokenMintPda,
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

    assert.strictEqual(
      Number(
        (await connection.getTokenAccountBalance(vaultTokenAccountPda)).value
          .amount
      ),
      0
    )
  })
})
