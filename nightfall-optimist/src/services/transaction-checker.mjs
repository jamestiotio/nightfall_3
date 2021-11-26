/**
Module to check that a transaction is valid before it goes into a Block.
Here are the things that could be wrong with a transaction:
- the proof doesn't verify
- the transaction hash doesn't match with the preimage
- the transaction type is inconsistent with the fields populated
- the public inputs hash is correct
*/
import config from 'config';
import axios from 'axios';
import gen from 'general-number';
import logger from 'common-files/utils/logger.mjs';
import {
  Transaction,
  VerificationKey,
  Proof,
  TransactionError,
  PublicInputs,
} from '../classes/index.mjs';
import { waitForContract } from '../event-handlers/subscribe.mjs';
import { getBlockByBlockNumberL2 } from './database.mjs';

const { ZOKRATES_WORKER_HOST, PROVING_SCHEME, BACKEND, CURVE, ZERO, CHALLENGES_CONTRACT_NAME } =
  config;
const { generalise } = gen;

// first, let's check the hash. That's nice and easy:
// NB as we actually now comput the hash on receipt of the transaction this
// _should_ never fail.  Consider removal in the future.
async function checkTransactionHash(transaction) {
  if (!Transaction.checkHash(transaction)) {
    logger.debug(
      `The transaction with the hash that didn't match was ${JSON.stringify(transaction, null, 2)}`,
    );
    throw new TransactionError('The transaction hash did not match the transaction data', 0);
  }
}
// next that the fields provided are consistent with the transaction type
async function checkTransactionType(transaction) {
  switch (Number(transaction.transactionType)) {
    // Assuming nullifiers and commitments can't be valid ZEROs.
    // But points can such as compressedSecrets, Proofs
    case 0: // deposit
      if (
        transaction.publicInputHash === ZERO ||
        (Number(transaction.tokenType) !== 0 &&
          transaction.tokenId === ZERO &&
          Number(transaction.value) === 0) ||
        transaction.ercAddress === ZERO ||
        transaction.recipientAddress !== ZERO ||
        transaction.commitments[0] === ZERO ||
        transaction.commitments[1] !== ZERO ||
        transaction.commitments.length !== 2 ||
        transaction.nullifiers.some(n => n !== ZERO) ||
        transaction.compressedSecrets.some(cs => cs !== ZERO) ||
        transaction.compressedSecrets.length !== 8 ||
        transaction.proof.every(p => p === ZERO) ||
        // This extra check is unique to deposits
        Number(transaction.historicRootBlockNumberL2[0]) !== 0 ||
        Number(transaction.historicRootBlockNumberL2[1]) !== 0
      )
        throw new TransactionError(
          'The data provided was inconsistent with a transaction type of DEPOSIT',
          1,
        );
      break;
    case 1: // single token transaction
      if (
        transaction.publicInputHash === ZERO ||
        transaction.tokenId !== ZERO ||
        Number(transaction.value) !== 0 ||
        transaction.ercAddress === ZERO ||
        transaction.recipientAddress !== ZERO ||
        transaction.commitments[0] === ZERO ||
        transaction.commitments[1] !== ZERO ||
        transaction.commitments.length !== 2 ||
        transaction.nullifiers[0] === ZERO ||
        transaction.nullifiers[1] !== ZERO ||
        transaction.nullifiers.length !== 2 ||
        transaction.compressedSecrets.every(cs => cs === ZERO) ||
        transaction.compressedSecrets.length !== 8 ||
        transaction.proof.every(p => p === ZERO)
      )
        throw new TransactionError(
          'The data provided was inconsistent with a transaction type of SINGLE_TRANSFER',
          1,
        );
      break;
    case 2: // double token transaction
      if (
        transaction.publicInputHash === ZERO ||
        transaction.tokenId !== ZERO ||
        Number(transaction.value) !== 0 ||
        transaction.ercAddress === ZERO ||
        transaction.recipientAddress !== ZERO ||
        transaction.commitments.some(c => c === ZERO) ||
        transaction.commitments.length !== 2 ||
        transaction.nullifiers.some(n => n === ZERO) ||
        transaction.nullifiers.length !== 2 ||
        transaction.compressedSecrets.every(cs => cs === ZERO) ||
        transaction.compressedSecrets.length !== 8 ||
        transaction.proof.every(p => p === ZERO)
      )
        throw new TransactionError(
          'The data provided was inconsistent with a transaction type of DOUBLE_TRANSFER',
          1,
        );
      break;
    case 3: // withdraw transaction
      if (
        transaction.publicInputHash === ZERO ||
        (Number(transaction.tokenType) !== 0 &&
          transaction.tokenId === ZERO &&
          Number(transaction.value) === 0) ||
        transaction.ercAddress === ZERO ||
        transaction.recipientAddress === ZERO ||
        transaction.commitments.some(c => c !== ZERO) ||
        transaction.nullifiers[0] === ZERO ||
        transaction.nullifiers[1] !== ZERO ||
        transaction.nullifiers.length !== 2 ||
        transaction.compressedSecrets.some(cs => cs !== ZERO) ||
        transaction.proof.every(p => p === ZERO)
      )
        throw new TransactionError(
          'The data provided was inconsistent with a transaction type of WITHDRAW',
          1,
        );
      break;
    default:
      throw new TransactionError('Unknown transaction type', 2);
  }
}

async function checkHistoricRoot(transaction) {
  // Deposit transaction have a historic root of 0
  // the validity is tested in checkTransactionType
  if (Number(transaction.transactionType) === 1 || Number(transaction.transactionType) === 3) {
    const historicRootFirst = await getBlockByBlockNumberL2(
      transaction.historicRootBlockNumberL2[0],
    );
    if (historicRootFirst === null)
      throw new TransactionError('The historic root in the transaction does not exist', 3);
  }
  if (Number(transaction.transactionType) === 2) {
    const [historicRootFirst, historicRootSecond] = await Promise.all(
      transaction.historicRootBlockNumberL2.map(h => getBlockByBlockNumberL2(h)),
    );
    if (historicRootFirst === null || historicRootSecond === null)
      throw new TransactionError('The historic root in the transaction does not exist', 3);
  }
}

async function verifyProof(transaction) {
  // we'll need the verification key.  That's actually stored in the b/c
  const challengeInstance = await waitForContract(CHALLENGES_CONTRACT_NAME);
  const vkArray = await challengeInstance.methods
    .getVerificationKey(transaction.transactionType)
    .call();
  // to verify a proof, we make use of a zokrates-worker, which has an offchain
  // verifier capability
  let inputs;
  const historicRootFirst = (await getBlockByBlockNumberL2(
    transaction.historicRootBlockNumberL2[0],
  )) ?? { root: ZERO };
  const historicRootSecond = (await getBlockByBlockNumberL2(
    transaction.historicRootBlockNumberL2[1],
  )) ?? { root: ZERO };

  switch (Number(transaction.transactionType)) {
    case 0: // deposit transaction
      inputs = new PublicInputs([
        transaction.ercAddress,
        transaction.tokenId,
        transaction.value,
        transaction.commitments[0], // not truncating here as we already ensured hash < group order
      ]).publicInputs;
      break;
    case 1: // single transfer transaction
      inputs = new PublicInputs([
        transaction.ercAddress,
        transaction.commitments[0], // not truncating here as we already ensured hash < group order
        generalise(transaction.nullifiers[0]).hex(32, 31),
        historicRootFirst.root,
        ...transaction.compressedSecrets.map(compressedSecret =>
          generalise(compressedSecret).hex(32, 31),
        ),
      ]).publicInputs;
      break;
    case 2: // double transfer transaction
      inputs = new PublicInputs([
        transaction.ercAddress, // this is correct; ercAddress appears twice
        transaction.ercAddress, // in a double-transfer public input hash
        transaction.commitments, // not truncating here as we already ensured hash < group order
        transaction.nullifiers.map(nullifier => generalise(nullifier).hex(32, 31)),
        historicRootFirst.root,
        historicRootSecond.root,
        ...transaction.compressedSecrets.map(compressedSecret =>
          generalise(compressedSecret).hex(32, 31),
        ),
      ]).publicInputs;
      break;
    case 3: // withdraw transaction
      inputs = new PublicInputs([
        transaction.ercAddress,
        transaction.tokenId,
        transaction.value,
        generalise(transaction.nullifiers[0]).hex(32, 31),
        transaction.recipientAddress,
        historicRootFirst.root,
      ]).publicInputs;
      break;
    default:
      throw new TransactionError('Unknown transaction type', 2);
  }
  const res = await axios.post(`http://${ZOKRATES_WORKER_HOST}/verify`, {
    vk: new VerificationKey(vkArray),
    proof: new Proof(transaction.proof),
    provingScheme: PROVING_SCHEME,
    backend: BACKEND,
    curve: CURVE,
    inputs: inputs.all.hex(32),
  });
  const { verifies } = res.data;
  if (!verifies) throw new TransactionError('The proof did not verify', 5);
}

async function checkTransaction(transaction) {
  return Promise.all([
    checkTransactionHash(transaction),
    checkTransactionType(transaction),
    checkHistoricRoot(transaction),
    verifyProof(transaction),
  ]);
}

export default checkTransaction;
