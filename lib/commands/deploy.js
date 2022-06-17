const fs = require('fs')
const ora = require('ora')
const inquirer = require('inquirer')
const archiver = require('archiver')
const { NodeSSH } = require('node-ssh')
const childProcess = require('child_process')
const { deployConfigPath } = require('../config')
const {
  checkDeployConfigExists,
  rsaDecrypt,
  log,
  info,
  succeed,
  error,
  underline
} = require('../utils')

const ssh = new NodeSSH()
const maxBuffer = 5000 * 1024

// 任务列表
let taskList

// 是否确认部署
const confirmDeploy = (message) => {
  return inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message
    }
  ])
}

// 检查环境是否正确
const checkEnvCorrect = (config, env, ignoreActions) => {
  const keys = [
    'name',
    'host',
    'port',
    'username',
    'distPath',
    'webDir'
  ]

  if (config) {
    let errorKeys = []
    keys.forEach((key) => {
      if (!config[key]) {
        errorKeys.push(key)
      }else if(key === 'webDir' && !/^\/\S+\/\S+/.test(config[key])){
        errorKeys.push(key)
      }else if(key === 'port' && (config[key] > 65536 || config[key] < 20)){
        errorKeys.push(key)
      }
    })
    if (ignoreActions.indexOf('build') !== -1 && !config['script']) {
      errorKeys.push('script')
    }
    if(errorKeys.length > 0){
      error(
        `配置错误: ${underline(`${env}环境`)} ${underline(
          `${errorKeys.join('、')} 属性`
        )} 配置不正确`
      )
      process.exit(1)
    }
    
  } else {
    error('配置错误: 未指定部署环境或指定部署环境不存在')
    process.exit(1)
  }
}

// 执行打包脚本
const execBuild = async (config, index) => {
  try {
    const time = new Date().getTime()

    const { script } = config
    log(`(${index}) ${script}`)
    const spinner = ora('正在打包中\n')

    spinner.start()

    await new Promise((resolve, reject) => {
      childProcess.exec(
        script,
        { cwd: process.cwd(), maxBuffer: maxBuffer },
        (e) => {
          spinner.stop()
          if (e === null) {
            succeed(`打包成功, 耗时${(new Date().getTime() - time) / 1000}s`)
            resolve()
          } else {
            reject(e.message)
          }
        }
      )
    })
  } catch (e) {
    error('打包失败')
    error(e)
    process.exit(1)
  }
}

// 打包文件
const archiveFile = async (config, index) => {
  await new Promise((resolve, reject) => {
    log(`(${index}) 压缩 ${underline(config.distPath)} 文件夹`)
    const archive = archiver('tar').on('error', (e) => {
      error(e)
    })

    const output = fs
      .createWriteStream(`${process.cwd()}/${config.distPath}.tar`)
      .on('close', (e) => {
        if (e) {
          error(`压缩文件夹出错: ${e}`)
          reject(e)
          process.exit(1)
        } else {
          succeed(`${underline(`${config.distPath}.tar`)} 压缩文件夹成功`)
          resolve()
        }
      })

    archive.pipe(output)
    archive.directory(config.distPath, false)
    archive.finalize()
  })
}

// 连接ssh
const connectSSH = async (config, index) => {
  try {
    log(`(${index}) ssh连接 ${underline(`${config.host}:${config.port}`)}`)

    const { privateKey, password } = config
    if (!privateKey && !password) {
      const answers = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          message: '请输入服务器密码'
        }
      ])

      config.password = answers.password
      delete config.privateKey
    }else if(privateKey && password){
      try {
        config.password = rsaDecrypt(password,privateKey)
      } catch (e) {
        error(`ssh连接失败,解密密码失败: ${e.message}`)
        process.exit(1)
      }
    }

    await ssh.connect(config)
    succeed('ssh连接成功')
  } catch (e) {
    error(e)
    error('ssh连接失败')
    process.exit(1)
  }
}

// 上传本地文件
const uploadLocalFile = async (config, index) => {
  try {
    const localFileName = `${config.distPath}.tar`
    const remoteFileName = `${config.webDir}/../${config.distPath}.tar`
    const localPath = `${process.cwd()}/${localFileName}`

    log(`(${index}) 上传压缩文件至目录 ${underline(remoteFileName)}`)

    const spinner = ora('正在上传中\n')

    spinner.start()

    await ssh.putFile(localPath, remoteFileName, null, {
      concurrency: 1
    })

    spinner.stop()
    succeed('上传成功')
  } catch (e) {
    error(`上传失败: ${e}`)
    process.exit(1)
  }
}

// 解压远程文件
const unzipRemoteFile = async (config, index) => {
  try {
    const { webDir, isBackupRemoteFile = true } = config

    // 备份远程原文件夹
    const time = new Date().getTime()
    const backupFileName = `${webDir}_backup_${time}`
    await ssh.execCommand(`mv ${webDir} ${backupFileName} && mkdir ${webDir}`)

    // 解压远程文件
    const remoteFileName = `${config.webDir}/../${config.distPath}.tar`
    log(`(${index}) 解压远程文件 ${underline(remoteFileName)}`)
    
    await ssh.execCommand(
      `tar -xf ${remoteFileName} -C ${webDir} && rm -rf ${remoteFileName}`
    )

    

    if(isBackupRemoteFile){
      await ssh.execCommand(`tar -czf ${backupFileName}.tar ${backupFileName}`)
    }

    if(/^\/\S+\/\S+/.test(backupFileName) && backupFileName.indexOf('..') === -1){
      await ssh.execCommand(`rm -rf ${backupFileName}`)
    }

    succeed('解压成功')
  } catch (e) {
    error('解压远程文件操作失败'+e)
    process.exit(1)
  }
}

// 删除本地打包文件
const removeLocalFile = (config, index) => {
  const localPath = `${process.cwd()}/${config.distPath}.tar`

  log(`(${index}) 删除本地压缩文件 ${underline(localPath)}`)

  fs.unlinkSync(localPath)
  succeed('删除本地压缩文件成功')
}

// 断开ssh
const disconnectSSH = (config, index) => {
  log(`(${index}) 断开 ssh`)
  ssh.dispose()
}

// 创建任务列表
const createTaskList = (config, ignoreActions) => {
  taskList = []

  const { script } = config

  if (ignoreActions.indexOf('build') === -1) {
    script && taskList.push(execBuild)
  }

  taskList.push(archiveFile)
  taskList.push(connectSSH)

  taskList.push(uploadLocalFile)
  taskList.push(unzipRemoteFile)
  taskList.push(removeLocalFile)
  taskList.push(disconnectSSH)
}

// 执行任务列表
const executeTaskList = async (config) => {
  for (const [index, execute] of new Map(
    taskList.map((execute, index) => [index, execute])
  )) {
    await execute(config, index + 1)
  }
}

module.exports = {
  description: '部署项目',
  apply: async (env='dev', cluster, build, yes) => {
    if(!checkDeployConfigExists()){
      error(
        'deploy.config.js 文件不存，请使用 deploy-plus init 命令创建'
      )
      process.exit(1)
    }
    
    const createdEnvConfig = (env) => {
      return Object.assign(
        config[env],
        {
          privateKey: config.privateKey,
          passphrase: config.passphrase
        }
      )
    }

    async function deploy (env,confirm){

      info(`----- 部署环境 ${env} -----`)

      const currentTime = new Date().getTime()

      const envConfig = createdEnvConfig(env)

      const ignoreActions = []
      if(!build){
        ignoreActions.push('build')
      }

      checkEnvCorrect(envConfig, env, ignoreActions)

      if(confirm){
        const answers = await confirmDeploy(
          `${underline(projectName)} 项目是否部署到 ${underline(
            envConfig.name
          )}?`
        )
        if (!answers.confirm) {
          process.exit(1)
        }
      }
      createTaskList(envConfig, ignoreActions)

      await executeTaskList(envConfig)

      succeed(
        `恭喜您，${underline(projectName)}项目已在${underline(
          envConfig.name
        )}部署成功 耗时${(new Date().getTime() - currentTime) / 1000}s\n`
      )
    }

    const config = require(deployConfigPath)
    const projectName = config.projectName

    if(cluster){
      const envList = config.cluster
      for (const env of envList) {
        if(!config[env]){
          error(`${env} 环境配置不存在`)
        }else{
          await deploy(env, !yes)
        }
      }
    } else if(env){
      if(!config[env]){
        error(`${env} 环境配置不存在`)
        process.exit(1)
      }
      await deploy(env,!yes)

      process.exit(0)
    } else {
      error(
        '请使用 deploy-plus -mode 指定部署环境或在配置文件中指定 cluster(集群)地址'
      )
      process.exit(1)
    }
  }
}
