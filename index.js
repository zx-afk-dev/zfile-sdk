'use strict';

const ZFile = require('./src/client');
const { ZFileError } = require('./src/errors');

module.exports = ZFile;
module.exports.ZFile = ZFile;
module.exports.ZFileError = ZFileError;
