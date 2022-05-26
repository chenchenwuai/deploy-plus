const fs = require('fs')
const ora = require('ora')
const inquirer = require('inquirer')
const archiver = require('archiver')
const { NodeSSH } = require('node-ssh')
const childProcess = require('child_process')
const { deployConfigPath } = require('../config')
const {
  checkDeployConfigExists,
  log,
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
    keys.forEach((key) => {
      if (!config[key] || config[key] === '/') {
        error(
          `配置错误: ${underline(`${env}环境`)} ${underline(
            `${key}属性`
          )} 配置不正确`
        )
        process.exit(1)
      }
    })
    if (ignoreActions.indexOf('build') !== -1 && !config['script']) {
      log.error(
        `配置错误: ${underline(`${env}环境`)} ${underline(
          `script属性`
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
    log(`(${index}) 打包 ${underline(config.distPath)} 文件`)
    const archive = archiver('tar').on('error', (e) => {
      error(e)
    })

    const output = fs
      .createWriteStream(`${process.cwd()}/${config.distPath}.tar`)
      .on('close', (e) => {
        if (e) {
          error(`打包文件出错: ${e}`)
          reject(e)
          process.exit(1)
        } else {
          succeed(`${underline(`${config.distPath}.tar`)} 打包成功`)
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

    log(`(${index}) 上传打包文件至目录 ${underline(remoteFileName)}`)

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
    await ssh.execCommand(`mv ${webDir} ${webDir}_backup_${time} && mkdir ${webDir}`)

    // 解压远程文件
    log(`(${index}) 解压远程文件 ${underline(remoteFileName)}`)
    const remoteFileName = `${config.webDir}/../${config.distPath}.tar`
    await ssh.execCommand(
      `tar -xf ${remoteFileName} -C ${webDir} && rm -rf ${remoteFileName}`
    )

    succeed('解压成功')

    if(!isBackupRemoteFile){
      await ssh.execCommand(`rm -rf ${webDir}_backup_${time}`)
    }
  } catch (e) {
    error(e)
    process.exit(1)
  }
}

// 删除本地打包文件
const removeLocalFile = (config, index) => {
  const localPath = `${process.cwd()}/${config.distPath}`

  log(`(${index}) 删除本地打包目录 ${underline(localPath)}`)

  const remove = (path) => {
    if (fs.existsSync(path)) {
      fs.readdirSync(path).forEach((file) => {
        let currentPath = `${path}/${file}`
        if (fs.statSync(currentPath).isDirectory()) {
          remove(currentPath)
        } else {
          fs.unlinkSync(currentPath)
        }
      })
      fs.rmdirSync(path)
    }
  }

  remove(localPath)
  fs.unlinkSync(`${localPath}.tar`)
  succeed('删除本地打包目录成功')
}

// 断开ssh
const disconnectSSH = () => {
  console.log(`断开 ssh`)
  ssh.dispose()
}

// 创建任务列表
const createTaskList = (config, ignoreActions) => {
  taskList = []

  const { script, isBackupRemoteFile = true } = config

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
  apply: async (env='dev', build,yes) => {
    if (checkDeployConfigExists()) {
      const config = require(deployConfigPath)
      const cluster = config.cluster
      const projectName = config.projectName
      const currentTime = new Date().getTime()

      const ignoreActions = []
      if(!build){
        ignoreActions.push('build')
      }

      const createdEnvConfig = (env) => {
        return Object.assign(config[env], {
          privateKey: config.privateKey,
          passphrase: config.passphrase
        })
      }

      if (env) {
        const envConfig = createdEnvConfig(env)

        checkEnvCorrect(envConfig, env, ignoreActions)

        if(!yes){
          const answers = await confirmDeploy(
            `${underline(projectName)} 项目是否部署到 ${underline(
              envConfig.name
            )}?`
          )
          if (answers.confirm) {
            createTaskList(envConfig, ignoreActions)

            await executeTaskList(envConfig)

            succeed(
              `恭喜您，${underline(projectName)}项目已在${underline(
                envConfig.name
              )}部署成功 耗时${(new Date().getTime() - currentTime) / 1000}s\n`
            )
            process.exit(0)
          } else {
            process.exit(1)
          }
        }else{
          createTaskList(envConfig, ignoreActions)

          await executeTaskList(envConfig)

          succeed(
            `恭喜您，${underline(projectName)}项目已在${underline(
              envConfig.name
            )}部署成功 耗时${(new Date().getTime() - currentTime) / 1000}s\n`
          )
          process.exit(0)
        }
      } else if (cluster && cluster.length > 0) {
        const answers = await confirmDeploy(
          `${underline(projectName)} 项目是否部署到 ${underline('集群环境')}?`
        )

        if (answers.confirm) {
          for (const env of cluster) {
            const envConfig = createdEnvConfig(env)

            checkEnvCorrect(envConfig, env, ignoreActions)

            createTaskList(envConfig, ignoreActions)

            await executeTaskList(envConfig)

            succeed(
              `恭喜您，${underline(projectName)}项目已在${underline(
                envConfig.name
              )}部署成功`
            )
          }

          succeed(
            `恭喜您，${underline(projectName)}项目已在${underline(
              '集群环境'
            )}部署成功 耗时${(new Date().getTime() - currentTime) / 1000}s\n`
          )
        } else {
          process.exit(1)
        }
      } else {
        error(
          '请使用 deploy-plus -mode 指定部署环境或在配置文件中指定 cluster（集群）地址'
        )
        process.exit(1)
      }
    } else {
      error(
        'deploy.config.js 文件不存，请使用 deploy-plus init 命令创建'
      )
      process.exit(1)
    }
  }
}
