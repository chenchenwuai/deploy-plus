const fs = require('fs')
const program = require('commander')
const { packageInfo } = require('./config')

module.exports = class Service {
  constructor() {
    setupDefaultCommands()

    registerCommands()
  }

  run(_id, _args = {}, rawArgv = []) {
    program.parse(rawArgv, { from: 'user' })
  }
}

// 设置默认命令
const setupDefaultCommands = () => {
  program.version(packageInfo.version, '-v, --version', '输出当前版本号')
  program.helpOption('-h, --help', '获取帮助')
  program.addHelpCommand(false)
}

// 注册命令
const registerCommands = () => {
  const commandsPath = `${__dirname}/commands`

  const idToPlugin = (id) => {
    const command = require(`${commandsPath}/${id}`)
    const commandName = id.split('.')[0]
    const alias = id.charAt(0)

    if (commandName === 'deploy') {
      program
        .command(commandName)
        .description(command.description)
        .alias(alias)
        .option('-m, --mode <mode>', '设置部署模式')
        .option('-n, --no-build', '不执行打包命令')
        .option('-y, --yes', '不提示是否确定部署')
        .action((options) => {
          command.apply(options.mode,options.build,options.yes)
        })
    } else {
      program
        .command(commandName)
        .description(command.description)
        .alias(alias)
        .action(() => {
          command.apply()
        })
    }
  }

  fs.readdirSync(`${commandsPath}`).forEach(idToPlugin)
}
