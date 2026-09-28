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

async function resumableUpload(target, buffer, mimeType, options = {}) {
  if (!target.resumableUrl) {
    throw new ZFileError('ZFile API tidak memberikan resumable upload endpoint.', {
      code: 'MISSING_UPLOAD_ENDPOINT'
    });
  }

  const created = await fetch(target.resumableUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${target.anonKey}`,
      'x-signature': target.token,
      'x-upsert': 'false',
      'tus-resumable': '1.0.0',
      'upload-length': String(buffer.length),
      'upload-metadata': [
        `bucketName ${base64(target.bucket)}`,
        `objectName ${base64(target.path)}`,
        `contentType ${base64(mimeType)}`,
        `cacheControl ${base64('3600')}`
      ].join(',')
    }
  });

  if (!created.ok) {
    throw new ZFileError(
      `Storage upload initialization gagal (${created.status}).`,
      { code: 'STORAGE_INIT_FAILED', status: created.status,
        details: await created.text().catch(() => '') }
    );
  }

  let location = created.headers.get('location');
  if (!location) {
    throw new ZFileError('Storage tidak mengembalikan upload URL.', {
      code: 'MISSING_UPLOAD_LOCATION'
    });
  }

  location = new URL(location, target.resumableUrl).toString();

  const chunkSize = options.chunkSize || 6 * 1024 * 1024;
  let offset = 0;

  while (offset < buffer.length) {
    const chunk = buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length));

    const response = await fetch(location, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${target.anonKey}`,
        'x-signature': target.token,
        'content-type': 'application/offset+octet-stream',
        'tus-resumable': '1.0.0',
        'upload-offset': String(offset)
      },
      body: chunk
    });

    if (!response.ok) {
      throw new ZFileError(`Storage upload gagal (${response.status}).`, {
        code: 'STORAGE_UPLOAD_FAILED',
        status: response.status,
        details: await response.text().catch(() => '')
      });
    }

    const nextOffset = Number(response.headers.get('upload-offset'));
    offset = Number.isFinite(nextOffset) ? nextOffset : offset + chunk.length;

    if (typeof options.onProgress === 'function') {
      options.onProgress({
        uploaded: offset,
        total: buffer.length,
        percent: Math.round(offset / buffer.length * 100)
      });
    }
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

  const init = await client.request('/api/v1/upload/init', {
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

  await resumableUpload(init.upload, buffer, mimeType, options);

  const finalize = await client.request('/api/v1/upload/finalize', {
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
