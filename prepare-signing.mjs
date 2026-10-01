import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
if(!fs.existsSync('signing.properties')){
 const password=randomBytes(36).toString('hex');
 execFileSync(process.argv[2],['-genkeypair','-keystore','tempo-de-crescer.jks','-alias','tempo-de-crescer','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Tempo de Crescer, O=Aplicativo Familiar, C=BR','-storepass:env','TEMPO_SIGN_PASS','-keypass:env','TEMPO_SIGN_PASS'],{env:{...process.env,TEMPO_SIGN_PASS:password},stdio:'pipe'});
 fs.writeFileSync('signing.properties','password='+password+'\n',{mode:0o600});
}
console.log('Assinatura local pronta.');
