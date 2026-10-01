import {pbkdf2Sync,timingSafeEqual} from 'node:crypto';
export function checkWebPin(pin,verifier=process.env.FAMILY_PIN_VERIFIER){try{if(typeof pin!=='string'||!/^\d{4,8}$/.test(pin))return false;const v=JSON.parse(verifier||'{}'),expected=Buffer.from(v.hash,'base64'),salt=Buffer.from(v.salt,'base64');if(expected.length!==32||salt.length<16)return false;return timingSafeEqual(expected,pbkdf2Sync(pin,salt,60000,32,'sha256'));}catch{return false;}}
export function cookieToken(req){const match=String(req.headers.cookie||'').match(/(?:^|;\s*)family_session=([A-Za-z0-9_-]+)/);return match?.[1]||'';}
export function originAllowed(req){const origin=req.headers.origin;return !origin||origin===`https://${req.headers.host}`||!process.env.RENDER&&origin===`http://${req.headers.host}`;}
