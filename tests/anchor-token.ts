import * as anchor from "@project-serum/anchor"
import { Program } from "@project-serum/anchor"
import { AnchorToken } from "../target/types/anchor_token"
import * as spl from "@solana/spl-token"
import { assert } from "chai"

describe("anchor-token", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env())

  const program = anchor.workspace.AnchorToken as Program<AnchorToken>
  const wallet = anchor.workspace.AnchorToken.provider.wallet
  const connection = program.provider.connection

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

  it("Initialize New Token Mint", async () => {
    // Add your test here.
    const tx = await program.methods
      .createMint()
      .accounts({ rewardTokenMint: rewardTokenMintPda })
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
