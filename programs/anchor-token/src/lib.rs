use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{mint_to, transfer, Mint, MintTo, Token, TokenAccount, Transfer},
};

declare_id!("5iAVPXH9djWQbviQXbYvicsxums6Nf8zGiitGwGWu6QQ");

#[program]
pub mod anchor_token {
    use super::*;

    // Create new token mint with PDA as mint authority
    pub fn create_mint(_ctx: Context<CreateMint>) -> Result<()> {
        Ok(())
    }

    // Mint tokens to player token account
    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        let signer_seeds: &[&[&[u8]]] =
            &[&[b"reward", &[*ctx.bumps.get("reward_token_mint").unwrap()]]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.reward_token_mint.to_account_info(),
                to: ctx.accounts.player_token_account.to_account_info(),
                authority: ctx.accounts.reward_token_mint.to_account_info(),
            },
            signer_seeds,
        );

        mint_to(cpi_ctx, amount)?;
        Ok(())
    }

    // Deposit tokens from player token account to vault token account
    pub fn deposit_tokens(ctx: Context<DepositTokens>, amount: u64) -> Result<()> {
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.player_token_account.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.player.to_account_info(),
            },
        );

        transfer(cpi_ctx, amount)?;
        Ok(())
    }

    // Withdraw tokens from vault token account to player token account
    pub fn withdraw_tokens(ctx: Context<WithdrawTokens>, amount: u64) -> Result<()> {
        let reward_token_mint = ctx.accounts.reward_token_mint.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"vault",
            reward_token_mint.as_ref(),
            &[*ctx.bumps.get("vault_token_account").unwrap()],
        ]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.player_token_account.to_account_info(),
                authority: ctx.accounts.vault_token_account.to_account_info(),
            },
            signer_seeds,
        );

        transfer(cpi_ctx, amount)?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateMint<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    // The PDA is both the address of the mint account and the mint authority
    #[account(
        init,
        seeds = [b"reward"],
        bump,
        payer = signer,
        mint::decimals = 9,
        mint::authority = reward_token_mint,

    )]
    pub reward_token_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    // Initialize player token account if it doesn't exist
    #[account(
        init_if_needed,
        payer = player,
        associated_token::mint = reward_token_mint,
        associated_token::authority = player
    )]
    pub player_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"reward"],
        bump,
    )]
    pub reward_token_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositTokens<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    // Player token account
    #[account(
        mut,
        associated_token::mint = reward_token_mint,
        associated_token::authority = player
    )]
    pub player_token_account: Account<'info, TokenAccount>,

    // Initialize vault token account if it doesn't exist
    // The PDA is both the address of the token account and the token account authority
    #[account(
        init_if_needed,
        seeds = [b"vault", reward_token_mint.key().as_ref()],
        bump,
        payer = player,
        token::mint=reward_token_mint,
        token::authority=vault_token_account,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"reward"],
        bump,
    )]
    pub reward_token_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawTokens<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    // Initialize player token account if it doesn't exist
    #[account(
        init_if_needed,
        payer = player,
        associated_token::mint = reward_token_mint,
        associated_token::authority = player
    )]
    pub player_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"vault", reward_token_mint.key().as_ref()],
        bump,
        token::mint=reward_token_mint,
        token::authority=vault_token_account,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"reward"],
        bump,
    )]
    pub reward_token_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
