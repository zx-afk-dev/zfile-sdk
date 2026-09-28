'use strict';

class ZFileError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ZFileError';
    this.code = options.code || 'ZFILE_ERROR';
    this.status = options.status ?? null;
    this.details = options.details ?? null;
    this.response = options.response ?? null;
  }
}

module.exports = { ZFileError };
