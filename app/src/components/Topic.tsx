import {
  AnchorProvider,
  BN,
  Idl,
  Program,
  ProgramAccount,
  utils,
  web3
} from '@project-serum/anchor';
import {
  AnchorWallet,
  useAnchorWallet,
  useConnection,
  useWallet
} from '@solana/wallet-adapter-react';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionSignature,
  Commitment,
  ConfirmOptions,
  ParsedAccountData,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { FC, useCallback, useEffect, useState } from 'react';
import { notify } from '../utils/notifications';
import idlJson from '../solana/idl/hello_world.json';
import { HelloWorld } from '../solana/types/hello_world';
import {
  IdlTypes,
  TypeDef
} from '@project-serum/anchor/dist/cjs/program/namespace/types';
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
  SignerWalletAdapterProps,
  WalletAdapterProps
} from '@solana/wallet-adapter-base';
import { MINT_ADDRESS, sendTokens } from 'utils/spl-token';
import { confirmTransaction } from 'utils/web3-helper';
import { useNetworkConfiguration } from 'contexts/NetworkConfigurationProvider';

type VotingProgram = HelloWorld;

type TopicAccount = ProgramAccount<
  TypeDef<VotingProgram['accounts'][1], IdlTypes<VotingProgram>>
>;

type DecoratedTopicAccount = TopicAccount & { voteBalance: number };

const createProgram = (
  connection: Connection,
  wallet: AnchorWallet
): Program<VotingProgram> => {
  const provider = new AnchorProvider(
    connection,
    wallet,
    AnchorProvider.defaultOptions()
  );
  const program = new Program<VotingProgram>(
    idlJson as unknown as VotingProgram,
    idlJson.metadata.address,
    provider
  );
  return program;
};

const fetchStateAccount = async (
  connection: Connection,
  wallet: AnchorWallet
) => {
  const program = createProgram(connection, wallet);
  const stateAddress = await getStateAddress(program);

  try {
    const stateAccount = await program.account.stateAccount.fetch(stateAddress);
    return stateAccount;
  } catch (error) {
    console.warn(`Caught error while fetching state account.`, error);
    const signature = await program.methods
      .createState()
      .accounts({
        state: stateAddress,
        user: wallet.publicKey,
        systemProgram: SystemProgram.programId
      })
      .rpc();

    confirmTransaction(connection, signature);

    const stateAccount = await program.account.stateAccount.fetch(stateAddress);
    console.log(
      `Created state account ${JSON.stringify(stateAccount, null, 2)}`
    );
    return stateAccount;
  }
};

const getStateAddress = async (program: Program<VotingProgram>) => {
  const [stateAddress] = await PublicKey.findProgramAddress(
    [utils.bytes.utf8.encode('state')],
    program.programId
  );
  return stateAddress;
};

const getTopicAddress = async (
  connection: Connection,
  program: Program<VotingProgram>,
  anchorWallet: AnchorWallet
) => {
  const stateAccount = await fetchStateAccount(connection, anchorWallet);
  const [topicAddress] = await web3.PublicKey.findProgramAddress(
    [
      utils.bytes.utf8.encode('topic'),
      stateAccount.topicCount.toArrayLike(Buffer, 'be', 8)
    ],
    program.programId
  );
  return topicAddress;
};

export const Topic: FC = () => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const anchorWallet = useAnchorWallet();
  const [topics, setTopics] = useState<DecoratedTopicAccount[]>([]);
  const [topicName, setTopicName] = useState('');
  const [topicDescription, setTopicDescription] = useState('');
  const { networkConfiguration } = useNetworkConfiguration();

  useEffect(() => {
    if (publicKey) {
      getTopics();
    }
  }, [publicKey]);

  const transferSplToken = async (toAddress: PublicKey) => {
    await sendTokens(connection, 1, publicKey, toAddress, sendTransaction);
    getTopics();
  };

  const decorateTopics = async (
    topics: TopicAccount[]
  ): Promise<DecoratedTopicAccount[]> => {
    const decoratedTopics = await Promise.all(
      topics.map(async (topic): Promise<DecoratedTopicAccount> => {
        const topicAddress = topic.publicKey;
        const associatedTokenAddress = await getAssociatedTokenAddress(
          new PublicKey(MINT_ADDRESS),
          topicAddress,
          true
        );
        const account = await getAccount(connection, associatedTokenAddress);
        const voteBalance = Number(account.amount / BigInt(LAMPORTS_PER_SOL));
        console.log(`${topic.account.name} vote balance: ${voteBalance}`);
        return { ...topic, voteBalance };
      })
    );
    return decoratedTopics;
  };

  const getTopics = async () => {
    const program = createProgram(connection, anchorWallet);
    const topics = await program.account.topicAccount.all();
    const s = topics.sort((t1, t2) =>
      t1.account.index < t2.account.index
        ? -1
        : t1.account.index > t2.account.index
        ? 1
        : 0
    );
    setTopics(await decorateTopics(topics));
  };

  const createTopicHandler = async () => {
    const program = createProgram(connection, anchorWallet);
    const topicAddress = await getTopicAddress(
      connection,
      program,
      anchorWallet
    );
    console.log(`topicAddress: ${topicAddress}`);

    try {
      let signature = await program.methods
        .createTopic(topicName, topicDescription)
        .accounts({
          state: await getStateAddress(program),
          topic: topicAddress,
          user: anchorWallet.publicKey,
          systemProgram: web3.SystemProgram.programId
        })
        .rpc();
      console.log(`Create topic tx signature: ${signature}`);

      const associatedTokenAddress = await getAssociatedTokenAddress(
        new PublicKey(MINT_ADDRESS),
        topicAddress,
        true
      );
      console.log(`Topic associatedTokenAddress: ${associatedTokenAddress}`);

      const transaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          publicKey,
          associatedTokenAddress,
          topicAddress,
          new PublicKey(MINT_ADDRESS)
        )
      );

      signature = await sendTransaction(transaction, connection);
      console.log(`Create ATA tx signature: ${signature}`);

      confirmTransaction(connection, signature);

      await getTopics();
    } catch (error) {
      console.error(`Error creating topic: ${JSON.stringify(error, null, 2)}`);
    }
  };

  return (
    <>
      {publicKey && (
        <div>
          <div className="m-2">
            <input
              type="text"
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              placeholder="Topic Name"
              className="input input-bordered input-primary w-full max-w-xs"
            />
          </div>
          <div className="m-2">
            <input
              type="text"
              value={topicDescription}
              onChange={(e) => setTopicDescription(e.target.value)}
              placeholder="Topic Description"
              className="input input-bordered input-primary w-full max-w-xs"
            />
          </div>
        </div>
      )}
      <div>
        <button
          className="group w-60 m-2 btn animate-pulse disabled:animate-none bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ... "
          onClick={createTopicHandler}
          disabled={!publicKey}
        >
          <div className="hidden group-disabled:block ">
            Wallet not connected
          </div>
          <span className="block group-disabled:hidden">Create Topic</span>
        </button>
      </div>

      {topics.map((topic, index) => (
        <div key={index}>
          <div className="card w-100 bg-primary text-primary-content m-5">
            <div className="card-body text-left">
              <h2 className="card-title">{topic.account.name}</h2>
              <h3 className="card-title font-extralight">
                {topic.account.description}
              </h3>
              <div className="card-body">
                <p>
                  Address:{' '}
                  <a
                    href={`https://explorer.solana.com/address/${topic.publicKey.toString()}/tokens?cluster=${networkConfiguration}`}
                    target="_blank"
                  >
                    {topic.publicKey.toString()}
                  </a>
                </p>
                <p>Total Vote: {topic.voteBalance}</p>
              </div>
              <div className="card-actions justify-center">
                <button
                  className="group w-30 m-1 btn animate-pulse disabled:animate-none bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ... "
                  onClick={() => transferSplToken(topic.publicKey)}
                >
                  Vote
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
};
