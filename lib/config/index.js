const fs = require('fs')
const os = require('os')
const path = require('path')
const {devConfig,
  testConfig,
  prodConfig
} = require('./message')



module.exports = {
  packageInfo: require('../../package.json'),
  deployConfigFileName:'.deploy.config.js',
  deployConfigPath: `${path.join(process.cwd())}/.deploy.config.js`,
  defaultInfo:{
    "projectName":fs.existsSync(`${path.join(process.cwd())}/package.json`)
    ? require(`${process.cwd()}/package.json`).name
    : '',
    "privateKey":`${os.homedir()}/.ssh/id_rsa`,
    "passphrase":'',
    "cluster": [],
    "dev": {
      "name": "开发环境",
      "script": "npm run build:dev",
      "host": "",
      "port": 22,
      "username": "root",
      "password": "",
      "distPath": "dist",
      "webDir": "/var/www/html",
      "isBackupRemoteFile": true
    }
  },
  inquirerConfig: [
    {
      type: 'input',
      name: 'projectName',
      message: '请输入项目名称',
      default: fs.existsSync(`${path.join(process.cwd())}/package.json`)
        ? require(`${process.cwd()}/package.json`).name
        : ''
    },
    {
      type: 'input',
      name: 'privateKey',
      message: '请输入本地私钥地址',
      default: `${os.homedir()}/.ssh/id_rsa`
    },
    {
      type: 'password',
      name: 'passphrase',
      message: '请输入本地私钥密码',
      default: ''
    },
    {
      type: 'checkbox',
      name: 'deployEnvList',
      message: '请选择需要部署的环境',
      choices: [
        {
          name: 'dev',
          checked: true
        },
        {
          name: 'test'
        },
        {
          name: 'prod'
        }
      ]
    },
    ...devConfig,
    ...testConfig,
    ...prodConfig
  ]
}
