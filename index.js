'use strict';

const ZFile = require('./src/client');

module.exports = ZFile;
module.exports.ZFile = ZFile;
module.exports.ZFileError = require('./src/errors').ZFileError;
