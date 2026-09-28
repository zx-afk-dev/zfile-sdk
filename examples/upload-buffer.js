const ZFile = require('../');

(async () => {
  const zfile = new ZFile();
  const result = await zfile.uploadBuffer(Buffer.from('Hello ZFile'), {
    filename: 'hello.txt',
    mimeType: 'text/plain'
  });

  console.log(result.url);
})().catch(console.error);
