'use strict';

const { ZFileError } = require('./errors');
const { upload } = require('./upload');

class ZFile {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || 'https://zfile.web.id').replace(/\/+$/, '');
    this.timeout = options.timeout ?? 30000;
    this.maxUploadBytes = options.maxUploadBytes ?? 50 * 1024 * 1024;
    this.headers = { ...(options.headers || {}) };
  }

  async request(endpoint, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout ?? this.timeout);

    try {
      const response = await fetch(new URL(endpoint, this.baseUrl), {
        method: options.method || 'GET',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...this.headers,
          ...(options.headers || {})
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal
      });

      const text = await response.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

      if (!response.ok) {
        throw new ZFileError(
          data.error || data.message || `ZFile API error (${response.status})`,
          { code: 'API_REQUEST_FAILED', status: response.status, details: data }
        );
      }

      return data;
    } catch (error) {
      if (error instanceof ZFileError) throw error;
      if (error.name === 'AbortError') {
        throw new ZFileError('Request ke ZFile timeout.', { code: 'TIMEOUT' });
      }
      throw new ZFileError(error.message || 'Request ke ZFile gagal.', {
        code: 'NETWORK_ERROR',
        details: error
      });
    } finally {
      clearTimeout(timer);
    }
  }

  upload(source, options = {}) {
    return upload(this, source, options);
  }

  uploadBuffer(buffer, options = {}) {
    return upload(this, buffer, options);
  }

  getUrl(idOrUrl) {
    if (!idOrUrl) {
      throw new ZFileError('File ID/URL wajib diisi.', { code: 'INVALID_FILE_ID' });
    }
    if (/^https?:\/\//i.test(idOrUrl)) return idOrUrl;
    return new URL(String(idOrUrl).replace(/^\//, ''), this.baseUrl + '/').toString();
  }
}

module.exports = ZFile;
