import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { HelloWorld } from '../target/types/hello_world';

const CHAINLINK_PROGRAM_ID = 'HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny';
const CHAINLINK_FEED = '99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR';

describe('hello-world', () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.HelloWorld as Program<HelloWorld>;

  it('Is initialized!', async () => {
    const keypair = anchor.web3.Keypair.generate();
    // Add your test here.
    const tx = await program.methods
      .queryChainlink()
      .accounts({
        result: keypair.publicKey,
        user: provider.wallet.publicKey,
        chianlinkProgram: CHAINLINK_PROGRAM_ID,
        chainlinkFeed: CHAINLINK_FEED,
        systemProgram: anchor.web3.SystemProgram.programId
      })
      .signers([keypair])
      .rpc();

    console.log('Your transaction signature', tx);
    const result = await program.account.chianLinkResult.fetch(
      keypair.publicKey
    );
    console.log(`Result: ${result.answer.toNumber() / 100_000_000}`);
  });
});
