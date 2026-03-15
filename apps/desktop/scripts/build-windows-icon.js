#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const toIco = require('to-ico');

const assetsDir = path.join(__dirname, '..', 'assets');
const pngPath = path.join(assetsDir, 'icon-256.png');
const icoPath = path.join(assetsDir, 'icon.ico');

if (!fs.existsSync(pngPath)) {
  console.error('Missing', pngPath);
  process.exit(1);
}

const input = fs.readFileSync(pngPath);
toIco(input).then((buf) => {
  fs.writeFileSync(icoPath, buf);
  console.log('Wrote', icoPath);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
