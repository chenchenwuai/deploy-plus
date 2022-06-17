const fs = require('fs')
const os = require('os')
const NodeRSA = require('node-rsa');


const data = fs.readFileSync(`${os.homedir()}/.ssh/id_rsa`)
console.log(data)

const key = new NodeRSA(data);
const text = 'Hello RSA!';
const encrypted = key.encrypt(text, 'base64');
console.log('encrypted: ', encrypted);
const decrypted = key.decrypt(encrypted, 'utf8');
console.log('decrypted: ', decrypted);
