const ZFile = require('../');

const zfile = new ZFile();

zfile.upload('./example.jpg', {
  onProgress(progress) {
    process.stdout.write(\`\rUpload: ${progress.percent}%\`);
  }
}).then(result => {
  console.log('\nDone:', result.url);
}).catch(console.error);
