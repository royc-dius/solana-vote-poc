use std::mem::size_of;

use anchor_lang::prelude::*;


declare_id!("5aJosFob1aG5y1ayYtHDX1dc369odM1n66zDe1YYMDYB");

#[program]
pub mod hello_world {
    use anchor_lang::solana_program::{
        entrypoint::ProgramResult,
    };

    use super::*;

    pub fn create_state(ctx: Context<CreateState>) -> ProgramResult {
        let state = &mut ctx.accounts.state;
        state.topic_count = 0;
        Ok(())
    }

    pub fn create_topic(
        ctx: Context<CreateTopic>,
        name: String,
        description: String,
    ) -> ProgramResult {
        let state = &mut ctx.accounts.state;
        let topic = &mut ctx.accounts.topic;
        topic.owner = ctx.accounts.user.key();
        topic.name = name;
        topic.description = description;
        topic.index = state.topic_count;
        state.topic_count += 1;
        Ok(())
    }

}

#[derive(Accounts)]
pub struct CreateState<'info> {
    #[account(init, payer=user, space=size_of::<StateAccount>() + 8, seeds=[b"state"], bump)]
    state: Account<'info, StateAccount>,

    #[account(mut)]
    user: Signer<'info>,

    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateTopic<'info> {
    #[account(mut, seeds=[b"state".as_ref()], bump)]
    state: Account<'info, StateAccount>,

    #[account(init, 
        payer=user, space=256, seeds=[b"topic".as_ref(), state.topic_count.to_be_bytes().as_ref()], bump)]
    topic: Account<'info, TopicAccount>,

    #[account(mut)]
    user: Signer<'info>,

    system_program: Program<'info, System>,
}

#[account]
pub struct StateAccount {
    pub topic_count: u64,
}

#[account]
pub struct TopicAccount {
    owner: Pubkey,
    name: String,
    description: String,
    index: u64
}
