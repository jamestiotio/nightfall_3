import config from 'config';
import { waitForContract, web3 } from '../../../common-files/utils/contract.mjs';
import logger from '../../../common-files/utils/logger.mjs';
import { addMultiSigSignature, getTokenAddress } from './helpers.mjs';

const { RESTRICTIONS, SHIELD_CONTRACT_NAME } = config;
const pausables = ['State', 'Shield'];

/**
This function sets the restriction data that the Shield contract is currently using
*/
export async function setTokenRestrictions(
  tokenName,
  depositRestriction,
  withdrawRestriction,
  signingKey,
  executorAddress,
) {
  const shieldContractInstance = await waitForContract(SHIELD_CONTRACT_NAME);
  for (const token of RESTRICTIONS.tokens[process.env.ETH_NETWORK]) {
    if (token.name === tokenName) {
      const data = shieldContractInstance.methods
        .setRestriction(token.address, depositRestriction, withdrawRestriction)
        .encodeABI();
      return addMultiSigSignature(
        data,
        signingKey,
        shieldContractInstance.options.address,
        executorAddress,
      );
    }
  }
  return false;
}

export async function removeTokenRestrictions(tokenName, signingKey, executorAddress) {
  const shieldContractInstance = await waitForContract(SHIELD_CONTRACT_NAME);
  for (const token of RESTRICTIONS.tokens[process.env.ETH_NETWORK]) {
    if (token.name === tokenName) {
      const data = shieldContractInstance.methods.removeRestriction(token.address).encodeABI();
      return addMultiSigSignature(
        data,
        signingKey,
        shieldContractInstance.options.address,
        executorAddress,
      );
    }
  }
  return false;
}

export function pauseContracts(signingKey, executorAddress) {
  logger.info('All pausable contracts being paused');
  return Promise.all(
    pausables.map(async pausable => {
      const contractInstance = await waitForContract(pausable);
      const data = contractInstance.methods.pause().encodeABI();
      return addMultiSigSignature(
        data,
        signingKey,
        contractInstance.options.address,
        executorAddress,
      );
    }),
  );
}

export function unpauseContracts(signingKey, executorAddress) {
  logger.info('All pausable contracts being unpaused');
  return Promise.all(
    pausables.map(async pausable => {
      const contractInstance = await waitForContract(pausable);
      const data = contractInstance.methods.unpause().encodeABI();
      return (
        addMultiSigSignature(data, signingKey, contractInstance.options.address), executorAddress
      );
    }),
  );
}

export async function transferShieldBalance(tokenName, amount, signingKey, executorAddress) {
  const tokenAddress = getTokenAddress(tokenName);
  if (tokenAddress === 'unknown') throw new Error('Unknown token name');
  const shieldContractInstance = await waitForContract(SHIELD_CONTRACT_NAME);
  const data = shieldContractInstance.methods
    .transferShieldBalance(tokenAddress, amount)
    .encodeABI();
  return addMultiSigSignature(
    data,
    signingKey,
    shieldContractInstance.options.address,
    executorAddress,
  );
}

export function transferOwnership(newOwnerPrivateKey, signingKey, executorAddress) {
  const newOwner = web3.eth.accounts.privateKeyToAccount(newOwnerPrivateKey, true).address;
  return Promise.all(
    pausables.map(async pausable => {
      const contractInstance = await waitForContract(pausable);
      const data = contractInstance.methods.transferOwnership(newOwner).encodeABI();
      return addMultiSigSignature(
        data,
        signingKey,
        contractInstance.options.address,
        executorAddress,
      );
    }),
  );
}

export async function setBootProposer(newProposerPrivateKey, signingKey, executorAddress) {
  const newProposer = web3.eth.accounts.privateKeyToAccount(newProposerPrivateKey, true).address;
  const shieldContractInstance = await waitForContract(SHIELD_CONTRACT_NAME);
  const data = shieldContractInstance.methods.setBootProposer(newProposer).encodeABI();
  return addMultiSigSignature(
    data,
    signingKey,
    shieldContractInstance.options.address,
    executorAddress,
  );
}

export async function setBootChallenger(newChallengerPrivateKey, signingKey, executorAddress) {
  const newChallenger = web3.eth.accounts.privateKeyToAccount(
    newChallengerPrivateKey,
    true,
  ).address;
  console.log('BOOT CHALLENGER', newChallenger);
  const shieldContractInstance = await waitForContract(SHIELD_CONTRACT_NAME);
  const data = shieldContractInstance.methods.setBootChallenger(newChallenger).encodeABI();
  return addMultiSigSignature(
    data,
    signingKey,
    shieldContractInstance.options.address,
    executorAddress,
  );
}
