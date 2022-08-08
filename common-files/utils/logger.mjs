/* eslint import/no-extraneous-dependencies: "off" */

import config from 'config';
import pino from 'pino';

const LOGGER_TIME_STRING = 'yyyy-mm-dd HH:MM:ss.l';

export default pino({
  level: config.LOG_LEVEL || 'info',
  formatters: {
    // eslint-disable-next-line no-unused-vars
    level (label, number) {
      return { level: label };
    }
  },
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname,filename',
      translateTime: LOGGER_TIME_STRING,
    },
  },
});
