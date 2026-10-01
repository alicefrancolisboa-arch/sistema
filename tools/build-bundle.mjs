import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const version=Number(process.argv[2]);if(!Number.isSafeInteger(version)||version<1)throw Error('Informe a versão inteira do painel.');
const html=fs.readFileSync('server/mobile.html','utf8'),minNative=2;fs.mkdirSync('outputs',{recursive:true});fs.writeFileSync('outputs/bundle-payload.txt',`${version}\n${minNative}\n${html}`);
execFileSync(process.argv[3],['tools/SignBundle.java','outputs/bundle-payload.txt','outputs/bundle-signature.txt'],{stdio:'pipe'});
const bundle=JSON.stringify({version,minNative,html,signature:fs.readFileSync('outputs/bundle-signature.txt','utf8')});
fs.writeFileSync('server/mobile-bundle.json',bundle);fs.mkdirSync('app/src/main/assets',{recursive:true});fs.writeFileSync('app/src/main/assets/mobile-bundle.json',bundle);console.log(`Painel v${version} assinado e empacotado.`);
