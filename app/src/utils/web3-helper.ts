import { Connection, TransactionSignature } from '@solana/web3.js';

export const confirmTransaction = async (
  connection: Connection,
  signature: TransactionSignature
) => {
  const latestBlockHash = await connection.getLatestBlockhash('finalized');

  await connection.confirmTransaction({
    blockhash: latestBlockHash.blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    signature: signature
  });
};
