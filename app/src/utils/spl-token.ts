import {
  Account,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddress,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
  TokenInvalidMintError,
  TokenInvalidOwnerError,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import {
  Connection,
  PublicKey,
  Transaction,
  Commitment,
  ConfirmOptions,
  ParsedAccountData
} from '@solana/web3.js';
import {
  SignerWalletAdapterProps,
  WalletAdapterProps
} from '@solana/wallet-adapter-base';
import { confirmTransaction } from './web3-helper';

export const MINT_ADDRESS = 'EBRsqBs3Bv27BoLQDSdVc2LGic29wgLJTtrf1XrcxvH8';

export async function getOrCreateAssociatedTokenAccount(
  connection: Connection,
  payer: PublicKey,
  mint: PublicKey,
  owner: PublicKey,
  sendTransaction: WalletAdapterProps['sendTransaction'],
  allowOwnerOffCurve = false,
  commitment?: Commitment,
  confirmOptions?: ConfirmOptions,
  programId = TOKEN_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID
): Promise<Account> {
  const associatedToken = await getAssociatedTokenAddress(
    mint,
    owner,
    allowOwnerOffCurve,
    programId,
    associatedTokenProgramId
  );
  console.log(`associatedToken: ${associatedToken.toString()}`);

  let account: Account;
  try {
    account = await getAccount(
      connection,
      associatedToken,
      commitment,
      programId
    );
  } catch (error: unknown) {
    if (
      error instanceof TokenAccountNotFoundError ||
      error instanceof TokenInvalidAccountOwnerError
    ) {
      try {
        const transaction = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            payer,
            associatedToken,
            owner,
            mint,
            programId,
            associatedTokenProgramId
          )
        );

        const signature = await sendTransaction(transaction, connection, {
          preflightCommitment: 'finalized'
        });

        confirmTransaction(connection, signature);
      } catch (error: unknown) {
        console.error(`Create ATA error ${JSON.stringify(error, null, 2)}`);
      }

      account = await getAccount(
        connection,
        associatedToken,
        commitment,
        programId
      );
    } else {
      throw error;
    }
  }

  if (!account.mint.equals(mint)) throw new TokenInvalidMintError();
  if (!account.owner.equals(owner)) throw new TokenInvalidOwnerError();

  return account;
}

export async function getNumberDecimals(
  connection: Connection,
  mintAddress = MINT_ADDRESS
): Promise<number> {
  const info = await connection.getParsedAccountInfo(
    new PublicKey(mintAddress)
  );
  const result = (info.value?.data as ParsedAccountData).parsed.info
    .decimals as number;
  return result;
}

export async function sendTokens(
  connection: Connection,
  amount: number,
  fromPubKey: PublicKey,
  toPubKey: PublicKey,
  sendTransaction: WalletAdapterProps['sendTransaction']
) {
  console.log(
    `Sending ${amount} ${MINT_ADDRESS} from ${fromPubKey.toString()} to ${toPubKey.toString()}.`
  );

  console.log(`Getting Source Token Account`);
  let sourceAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    fromPubKey,
    new PublicKey(MINT_ADDRESS),
    fromPubKey,
    sendTransaction
  );
  console.log(`Source Account: ${sourceAccount.address.toString()}`);

  console.log(`Getting Destination Token Account`);
  let destinationAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    fromPubKey,
    new PublicKey(MINT_ADDRESS),
    toPubKey,
    sendTransaction,
    true
  );
  console.log(
    `Destination Account: ${destinationAccount.address.toString()}`
  );

  console.log(`Fetching Number of Decimals for Mint: ${MINT_ADDRESS}`);
  const numberDecimals = await getNumberDecimals(connection);
  console.log(`    Number of Decimals: ${numberDecimals}`);

  console.log(`Creating and Sending Transaction`);
  const tx = new Transaction();
  tx.add(
    createTransferInstruction(
      sourceAccount.address,
      destinationAccount.address,
      fromPubKey,
      amount * Math.pow(10, numberDecimals)
    )
  );

  const signature = await sendTransaction(tx, connection, {
    preflightCommitment: 'finalized'
  });
  console.log(`Sending Transaction Signature: ${signature}`);
  confirmTransaction(connection, signature);

  console.log(
    'Transaction Success!',
    `\n    https://explorer.solana.com/tx/${signature}?cluster=devnet`
  );
}
