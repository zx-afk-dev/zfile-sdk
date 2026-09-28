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
    const url = new URL(endpoint, this.baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout ?? this.timeout);

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...this.headers,
          ...(options.headers || {})
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal
      });

      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!response.ok) {
        throw new ZFileError(
          data?.message || data?.error || `ZFile API request gagal (${response.status}).`,
          {
            code: 'API_REQUEST_FAILED',
            status: response.status,
            details: data,
            response
          }
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

  async getFile(id) {
    if (!id) throw new ZFileError('File ID wajib diisi.', { code: 'INVALID_FILE_ID' });
    return this.request(`/api/v1/file/${encodeURIComponent(id)}`);
  }

  getUrl(idOrPath) {
    if (!idOrPath) throw new ZFileError('File ID/URL wajib diisi.', { code: 'INVALID_FILE_ID' });
    if (/^https?:\/\//i.test(idOrPath)) return idOrPath;
    return new URL(String(idOrPath).replace(/^\//, ''), this.baseUrl + '/').toString();
  }
}

module.exports = ZFile;
