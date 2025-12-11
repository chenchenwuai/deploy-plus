const fs = require('fs')
const program = require('commander')
const { packageInfo } = require('./config')

// 命令配置表
const COMMAND_OPTIONS = {
	deploy: {
		options: [
			['-m, --mode <mode>', '设置部署模式,不设置此参数，则默认 dev'],
			['-c, --cluster', '部署集群,设置此参数后会忽略 -m 参数'],
			['-b, --build', '执行打包命令'],
			['-y, --yes', '不提示是否确定部署']
		],
		action: (command, options) => {
			command.apply(options.mode, options.cluster, options.build, options.yes)
		}
	},
	init: {
		options: [
			['-f, --force', '强制初始化'],
			['-y, --yes [password]', '全部设置为默认值, 后面跟字符串会被当作默认密码']
		],
		action: (command, options) => {
			// options.yes 为 true 或密码字符串
			const password = typeof options.yes === 'string' ? options.yes : undefined
			command.apply(options.force, !!options.yes, password)
		}
	},
	encrypt: {
		options: [
			['-d, --decrypt', '解密']
		],
		action: (command, options, args) => {
			command.apply(args, !!options.decrypt)
		}
	}
}

module.exports = class Service {
	constructor() {
		this.setupDefaultCommands()
		this.registerCommands()
	}

	setupDefaultCommands() {
		program.version(packageInfo.version, '-v, --version', '输出当前版本号')
		program.helpOption('-h, --help', '获取帮助')
		program.addHelpCommand(false)
	}

	registerCommands() {
		const commandsPath = `${__dirname}/commands`

		fs.readdirSync(commandsPath)
			.filter(file => file.endsWith('.js'))
			.forEach(file => {
				const command = require(`${commandsPath}/${file}`)
				const commandName = file.replace('.js', '')
				const alias = commandName.charAt(0)
				const config = COMMAND_OPTIONS[commandName]

				if (!config) return

				const cmd = program
					.command(commandName)
					.description(command.description)
					.alias(alias)

				// 注册选项
				config.options.forEach(opt => cmd.option(...opt))

				// 注册动作，支持额外参数
				cmd.arguments('[args...]')
				cmd.action((args, options) => {
					config.action(command, options, args)
				})
			})
	}

	run(rawArgv = []) {
		program.parse(rawArgv, { from: 'user' })
	}
}
