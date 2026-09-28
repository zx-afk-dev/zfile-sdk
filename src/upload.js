'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ZFileError } = require('./errors');

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.pdf': 'application/pdf', '.json': 'application/json',
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.html': 'text/html', '.txt': 'text/plain', '.zip': 'application/zip'
};

function guessMimeType(filename) {
  return MIME[path.extname(filename || '').toLowerCase()] || 'application/octet-stream';
}

function normalizeSource(source, options = {}) {
  if (typeof source === 'string') {
    const filePath = path.resolve(source);
    if (!fs.existsSync(filePath)) {
      throw new ZFileError('File tidak ditemukan.', { code: 'FILE_NOT_FOUND' });
    }
    return {
      buffer: fs.readFileSync(filePath),
      filename: options.filename || path.basename(filePath),
      mimeType: options.mimeType || guessMimeType(filePath)
    };
  }

  if (Buffer.isBuffer(source) || source instanceof Uint8Array) {
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

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function base64(value) {
  return Buffer.from(String(value), 'utf8').toString('base64');
}

async function signedUpload(target, buffer, mimeType, options = {}) {
  if (!target.url) {
    throw new ZFileError('ZFile API tidak memberikan signed upload URL.', {
      code: 'MISSING_UPLOAD_URL'
    });
  }

  const response = await fetch(target.url, {
    method: 'PUT',
    headers: {
      'content-type': mimeType || 'application/octet-stream',
      'cache-control': 'max-age=3600',
      'x-upsert': 'false'
    },
    body: buffer
  });

  if (!response.ok) {
    throw new ZFileError(
      `Storage upload gagal (${response.status}).`,
      {
        code: 'STORAGE_UPLOAD_FAILED',
        status: response.status,
        details: await response.text().catch(() => '')
      }
    );
  }

  if (typeof options.onProgress === 'function') {
    options.onProgress({
      uploaded: buffer.length,
      total: buffer.length,
      percent: 100
    });
  }
}
async function upload(client, source, options = {}) {
  const input = normalizeSource(source, options);
  const { buffer, filename, mimeType } = input;

  if (!buffer.length) {
    throw new ZFileError('File kosong tidak dapat diupload.', { code: 'EMPTY_FILE' });
  }

  if (buffer.length > (options.maxBytes ?? client.maxUploadBytes)) {
    throw new ZFileError('Ukuran file melebihi batas upload ZFile.', {
      code: 'FILE_TOO_LARGE'
    });
  }

  const contentHash = sha256(buffer);
  const expiry = options.expiry || 'never';

  const init = await client.request('/api/sdk/upload/init', {
    method: 'POST',
    body: { filename, size: buffer.length, mimeType, contentHash, expiry }
  });

  if (init.deduped) return init;

  if (!init.upload || !init.ticket) {
    throw new ZFileError('Response init ZFile tidak lengkap.', {
      code: 'INVALID_INIT_RESPONSE',
      details: init
    });
  }

  await signedUpload(init.upload, buffer, mimeType, options);

  const finalize = await client.request('/api/sdk/upload/finalize', {
    method: 'POST',
    body: { ticket: init.ticket }
  });

  return {
    ...finalize,
    publicUrl: finalize.url,
    id: finalize.slug,
    filename,
    size: finalize.size_bytes,
    mimeType: finalize.mime_type,
    hash: contentHash
  };
}

module.exports = { upload, guessMimeType };
