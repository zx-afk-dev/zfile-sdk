'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ZFileError } = require('./errors');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function guessMimeType(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
    '.json': 'application/json',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.txt': 'text/plain',
    '.zip': 'application/zip'
  };
  return map[ext] || 'application/octet-stream';
}

function normalizeSource(source, options = {}) {
  if (typeof source === 'string') {
    const filePath = path.resolve(source);
    if (!fs.existsSync(filePath)) {
      throw new ZFileError('File tidak ditemukan.', { code: 'FILE_NOT_FOUND' });
    }
    const buffer = fs.readFileSync(filePath);
    return {
      buffer,
      filename: options.filename || path.basename(filePath),
      mimeType: options.mimeType || guessMimeType(filePath)
    };
  }

  if (Buffer.isBuffer(source)) {
    return {
      buffer: source,
      filename: options.filename || 'file',
      mimeType: options.mimeType || guessMimeType(options.filename)
    };
  }

  if (source instanceof Uint8Array) {
    return {
      buffer: Buffer.from(source),
      filename: options.filename || 'file',
      mimeType: options.mimeType || guessMimeType(options.filename)
    };
  }

  throw new ZFileError('Source harus berupa path file, Buffer, atau Uint8Array.', {
    code: 'INVALID_SOURCE'
  });
}

async function upload(client, source, options = {}) {
  const input = normalizeSource(source, options);
  const { buffer, filename, mimeType } = input;

  const maxBytes = options.maxBytes ?? client.maxUploadBytes;
  if (buffer.length > maxBytes) {
    throw new ZFileError(`Ukuran file melebihi batas SDK (${maxBytes} bytes).`, {
      code: 'FILE_TOO_LARGE'
    });
  }

  const contentHash = sha256(buffer);

  const init = await client.request('/api/v1/upload/init', {
    method: 'POST',
    body: {
      name: filename,
      size: buffer.length,
      hash: contentHash,
      mimeType,
      expiry: options.expiry || 'never'
    },
    headers: options.headers
  });

  const signedUrl = init.signedUrl || init.uploadUrl || init.url;
  if (!signedUrl) {
    throw new ZFileError('ZFile API tidak mengembalikan signed upload URL.', {
      code: 'MISSING_SIGNED_URL',
      details: init
    });
  }

  const uploadResponse = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      ...(init.headers || {}),
      ...(options.uploadHeaders || {})
    },
    body: buffer
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text().catch(() => '');
    throw new ZFileError(`Upload ke storage gagal (${uploadResponse.status}).`, {
      code: 'STORAGE_UPLOAD_FAILED',
      status: uploadResponse.status,
      details: text
    });
  }

  const finalize = await client.request('/api/v1/upload/finalize', {
    method: 'POST',
    body: {
      ticket: init.ticket,
      token: init.token,
      path: init.path || init.storagePath,
      name: filename,
      size: buffer.length,
      hash: contentHash,
      mimeType,
      expiry: options.expiry || 'never'
    },
    headers: options.headers
  });

  return {
    ...finalize,
    url: finalize.url || finalize.publicUrl,
    publicUrl: finalize.publicUrl || finalize.url,
    id: finalize.id || finalize.fileId,
    filename: finalize.filename || filename,
    size: finalize.size ?? finalize.sizeBytes ?? buffer.length,
    mimeType: finalize.mimeType || mimeType,
    hash: finalize.hash || contentHash
  };
}

module.exports = {
  upload,
  normalizeSource,
  guessMimeType
};
