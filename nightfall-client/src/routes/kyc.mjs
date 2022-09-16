/**
 Routes to perform whitelist manager KYC work
 */

import express from 'express';
import logger from 'common-files/utils/logger.mjs';
import { addUserToWhitelist, removeUserFromWhitelist, isWhitelisted } from '../services/kyc.mjs';

const router = express.Router();

router.get('/check', async (req, res, next) => {
  logger.debug('kyc/check endpoint received GET');
  try {
    const { address } = req.query;
    logger.debug(`Details requested with address ${address}`);
    const whitelisted = await isWhitelisted(address);
    res.json({ isWhitelisted: whitelisted });
  } catch (err) {
    logger.error(err);
    next(err);
  }
});

/**
 Add a use to a KYC whitelist (only works if user is a whitelist manager, otherwise just wastes gas)
 */
router.post('/add', async (req, res, next) => {
  logger.debug('kyc/add endpoint received POST');
  const { address } = req.body;
  try {
    const response = await addUserToWhitelist(address);
    res.json(response);
  } catch (err) {
    logger.error(err);
    next(err);
  }
});

/**
 Add a use to a KYC whitelist (only works if user is a relevant (to the group) whitelist manager, otherwise just wastes gas)
 */
router.post('/remove', async (req, res, next) => {
  logger.debug('kyc/remove endpoint received POST');
  const { address } = req.body;
  try {
    const response = await removeUserFromWhitelist(address);
    res.json(response);
  } catch (err) {
    logger.error(err);
    next(err);
  }
});

export default router;
