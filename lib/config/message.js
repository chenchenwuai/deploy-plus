const createConfig = (mode='dev',modeName='开发环境')=>{
  return [
    {
      type: 'input',
      name: mode+'Name',
      message: '环境名称',
      default: modeName,
      when: (answers) => answers.deployEnvList.includes(mode)
    },
    {
      type: 'input',
      name: mode+'Script',
      message: '打包命令（默认不执行）',
      default: 'npm run build:' + mode,
      when: (answers) => answers.deployEnvList.includes(mode)
    },
    {
      type: 'input',
      name: mode+'Host',
      message: '服务器地址',
      when: (answers) => answers.deployEnvList.includes(mode)
    },
    {
      type: 'number',
      name: mode+'Port',
      message: '服务器端口号',
      default: 22,
      when: (answers) => answers.deployEnvList.includes(mode)
    },
    {
      type: 'input',
      name: mode+'Username',
      message: '用户名',
      default: 'root',
      when: (answers) => answers.deployEnvList.includes(mode)
    },
    {
      type: 'password',
      name: mode+'Password',
      message: '密码（选填）',
      when: (answers) => answers.deployEnvList.includes(mode)
    },
    {
      type: 'input',
      name: mode+'DistPath',
      message: '本地打包目录',
      default: 'dist',
      when: (answers) => answers.deployEnvList.includes(mode)
    },
    {
      type: 'input',
      name: mode+'WebDir',
      message: '部署路径',
      default: '/var/www/html',
      when: (answers) => answers.deployEnvList.includes(mode)
    },
    {
      type: 'confirm',
      name: mode+'IsBackupRemoteFile',
      message: '是否备份远程文件',
      default: true,
      when: (answers) => answers.deployEnvList.includes(mode)
    }
  ]
}
module.exports = {
   devConfig : createConfig('dev','开发环境'),
   testConfig : createConfig('test','测试环境'),
   prodConfig : createConfig('prod','生产环境')
}
