'use strict';

const { Firestore } = require('@google-cloud/firestore');
const { createApiHandler } = require('../dist/api/handler');
const { loadConfigFromEnv } = require('../dist/config');
const { consoleLogger } = require('../dist/observability/logger');
const { FirestoreUploadRepository } = require('../dist/persistence/FirestoreUploadRepository');

const firestore = new Firestore();

exports.api = createApiHandler({
  repository: new FirestoreUploadRepository({ firestore }),
  config: loadConfigFromEnv(process.env),
  logger: consoleLogger,
});
