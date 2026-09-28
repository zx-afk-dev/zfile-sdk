# zfile-sdk

Node.js SDK for [ZFile](https://zfile.web.id).

## Install

```bash
npm install zfile-sdk
```

## Upload a file

```js
const ZFile = require('zfile-sdk');

(async () => {
  const zfile = new ZFile();
  const result = await zfile.upload('./photo.jpg');

  console.log(result.url);
})();
```

## Upload a Buffer

```js
const ZFile = require('zfile-sdk');

const result = await zfile.uploadBuffer(buffer, {
  filename: 'photo.jpg',
  mimeType: 'image/jpeg'
});
```

## Progress

```js
await zfile.upload('./large.zip', {
  onProgress({ uploaded, total, percent }) {
    console.log(percent + '%');
  }
});
```

## Expiry

```js
await zfile.upload('./file.txt', { expiry: 'never' });
```

## API flow

The SDK uses ZFile's existing API:

1. `POST /api/sdk/upload/init`
2. Direct `PUT` to the signed Storage URL returned by ZFile
3. `POST /api/sdk/upload/finalize`

The SDK sends ZFile's expected metadata fields: `filename`, `size`, `mimeType`, `contentHash`, and `expiry`.

The SDK uses a dedicated ZFile SDK endpoint so the Node client does not need Supabase credentials or Storage RLS policies.

The SDK does not contain a separate storage system, database, or service-role credentials.

Node.js 18+.
