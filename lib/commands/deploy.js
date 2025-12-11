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

const MAX_BUFFER = 5000 * 1024

// 危险命令黑名单
const DANGEROUS_PATTERNS = [
	/\brm\s+(-[rf]+\s+)*(\/|~|\$HOME|\*)/i,  // rm 危险路径
	/\brm\s+-[rf]*\s+-[rf]*/i,               // rm -rf
	/\bmkfs\b/i,                              // 格式化
	/\bdd\s+if=/i,                            // dd 命令
	/>\s*\/dev\//i,                           // 写入设备
	/\bshutdown\b/i,                          // 关机
	/\breboot\b/i,                            // 重启
	/\bsystemctl\s+(stop|disable|mask)/i,    // 停止系统服务
	/\bkill\s+-9\s+(-1|1)\b/i,               // kill 所有进程
	/\bchmod\s+(-R\s+)?777\s+\//i,           // chmod 777 根目录
	/\bchown\s+(-R\s+)?\S+\s+\//i,           // chown 根目录
	/:(){ :|:& };:/,                          // fork 炸弹
	/\bwget\b.*\|\s*(ba)?sh/i,               // 下载并执行
	/\bcurl\b.*\|\s*(ba)?sh/i               // 下载并执行
]

// 检查脚本是否包含危险命令
const checkScriptSafety = (script) => {
	if (!script) return { safe: true }

	for (const pattern of DANGEROUS_PATTERNS) {
		if (pattern.test(script)) {
			return {
				safe: false,
				reason: `检测到危险命令模式: ${pattern.toString()}`
			}
		}
	}

	// 检查是否为常见的构建命令
	const safePrefixes = ['npm ', 'yarn ', 'pnpm ', 'npx ', 'node ', 'vite ', 'webpack ', 'tsc ', 'gulp ', 'grunt ']
	const trimmedScript = script.trim().toLowerCase()

	const isSafeCommand = safePrefixes.some(prefix => trimmedScript.startsWith(prefix))

	if (!isSafeCommand) {
		return {
			safe: false,
			reason: `非常见构建命令，请确认: ${script}`,
			needConfirm: true
		}
	}

	return { safe: true }
}

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
const checkEnvCorrect = (config, env, needBuild) => {
	const requiredKeys = ['name', 'host', 'port', 'username', 'distPath', 'webDir']
	const errorKeys = []

	if (!config) {
		error('配置错误: 未指定部署环境或指定部署环境不存在')
		process.exit(1)
	}

	for (const key of requiredKeys) {
		const value = config[key]
		if (!value) {
			errorKeys.push(key)
		} else if (key === 'webDir' && !/^\/\S+\/\S+/.test(value)) {
			errorKeys.push(key)
		} else if (key === 'port' && (value > 65535 || value < 1)) {
			errorKeys.push(key)
		}
	}

	if (needBuild && !config.script) {
		errorKeys.push('script')
	}

	if (errorKeys.length > 0) {
		error(`配置错误: ${underline(`${env}环境`)} ${underline(`${errorKeys.join('、')} 属性`)} 配置不正确`)
		process.exit(1)
	}
}

// 执行打包脚本
const execBuild = async (config, index) => {
	const { script } = config

	// 安全检查
	const safetyCheck = checkScriptSafety(script)
	if (!safetyCheck.safe) {
		if (safetyCheck.needConfirm) {
			// 非常见命令，需要用户确认
			const { confirm } = await confirmDeploy(`${safetyCheck.reason}，是否继续执行？`)
			if (!confirm) {
				error('用户取消执行')
				process.exit(1)
			}
		} else {
			// 危险命令，直接拒绝
			error(`脚本安全检查失败: ${safetyCheck.reason}`)
			process.exit(1)
		}
	}

	const startTime = Date.now()
	log(`(${index}) ${script}`)
	const spinner = ora('正在打包中\n')
	spinner.start()

	try {
		await new Promise((resolve, reject) => {
			childProcess.exec(script, { cwd: process.cwd(), maxBuffer: MAX_BUFFER }, (err) => {
				spinner.stop()
				if (err) {
					reject(new Error(err.message))
				} else {
					resolve()
				}
			})
		})
		succeed(`打包成功, 耗时${(Date.now() - startTime) / 1000}s`)
	} catch (e) {
		error('打包失败')
		error(e.message)
		process.exit(1)
	}
}

// 压缩文件
const archiveFile = async (config, index) => {
	const { distPath } = config
	const tarPath = `${process.cwd()}/${distPath}.tar`
	const fullDistPath = `${process.cwd()}/${distPath}`

	// 检查目录是否存在
	if (!fs.existsSync(fullDistPath)) {
		throw new Error(`打包目录不存在: ${fullDistPath}`)
	}

	log(`(${index}) 压缩 ${underline(distPath)} 文件夹`)

	await new Promise((resolve, reject) => {
		const archive = archiver('tar')
		const output = fs.createWriteStream(tarPath)

		output.on('close', () => {
			succeed(`${underline(`${distPath}.tar`)} 压缩文件夹成功`)
			resolve()
		})

		output.on('error', (e) => {
			reject(e)
		})

		archive.on('error', (e) => {
			error(`压缩文件夹出错: ${e}`)
			reject(e)
		})

		archive.on('warning', (e) => {
			if (e.code !== 'ENOENT') {
				reject(e)
			}
		})

		archive.pipe(output)
		archive.directory(distPath, false)
		archive.finalize()
	})
}

// 连接 SSH
const connectSSH = async (config, index, ssh) => {
	log(`(${index}) ssh连接 ${underline(`${config.host}:${config.port}`)}`)

	try {
		const { privateKey, password } = config

		if (!privateKey && !password) {
			const answers = await inquirer.prompt([
				{ type: 'password', name: 'password', message: '请输入服务器密码' }
			])
			config.password = answers.password
			delete config.privateKey
		} else if (privateKey && password) {
			config.password = rsaDecrypt(password, privateKey)
		}

		await ssh.connect(config)
		succeed('ssh连接成功')
	} catch (e) {
		error(`ssh连接失败: ${e.message}`)
		process.exit(1)
	}
}

// 上传本地文件
const uploadLocalFile = async (config, index, ssh) => {
	const { distPath, webDir } = config
	const localPath = `${process.cwd()}/${distPath}.tar`
	const remotePath = `${webDir}/../${distPath}.tar`

	log(`(${index}) 上传压缩文件至目录 ${underline(remotePath)}`)

	const spinner = ora('正在上传中\n')
	spinner.start()

	try {
		await ssh.putFile(localPath, remotePath, null, { concurrency: 1 })
		spinner.stop()
		succeed('上传成功')
	} catch (e) {
		spinner.stop()
		error(`上传失败: ${e}`)
		process.exit(1)
	}
}

// 解压远程文件
const unzipRemoteFile = async (config, index, ssh) => {
	const { webDir, distPath, isBackupRemoteFile = true } = config
	const backupName = `${webDir}_backup_${Date.now()}`
	const remoteTar = `${webDir}/../${distPath}.tar`

	try {
		// 备份并创建新目录
		await ssh.execCommand(`mv ${webDir} ${backupName} && mkdir ${webDir}`)

		log(`(${index}) 解压远程文件 ${underline(remoteTar)}`)
		await ssh.execCommand(`tar -xf ${remoteTar} -C ${webDir} && rm -rf ${remoteTar}`)

		// 压缩备份
		if (isBackupRemoteFile) {
			await ssh.execCommand(`tar -czf ${backupName}.tar ${backupName}`)
		}

		// 删除备份目录（安全检查）
		if (/^\/\S+\/\S+/.test(backupName) && !backupName.includes('..')) {
			await ssh.execCommand(`rm -rf ${backupName}`)
		}

		succeed('解压成功')
	} catch (e) {
		error(`解压远程文件操作失败: ${e}`)
		process.exit(1)
	}
}

// 删除本地压缩文件
const removeLocalFile = (config, index) => {
	const localPath = `${process.cwd()}/${config.distPath}.tar`
	log(`(${index}) 删除本地压缩文件 ${underline(localPath)}`)
	fs.unlinkSync(localPath)
	succeed('删除本地压缩文件成功')
}

// 断开 SSH
const disconnectSSH = (config, index, ssh) => {
	log(`(${index}) 断开 ssh`)
	ssh.dispose()
}

// 创建任务列表
const createTaskList = (config, needBuild) => {
	const tasks = []

	if (needBuild && config.script) {
		tasks.push(execBuild)
	}

	tasks.push(archiveFile, connectSSH, uploadLocalFile, unzipRemoteFile, removeLocalFile, disconnectSSH)
	return tasks
}

// 执行任务列表
const executeTaskList = async (tasks, config, ssh) => {
	for (let i = 0; i < tasks.length; i++) {
		await tasks[i](config, i + 1, ssh)
	}
}

module.exports = {
	description: '部署项目',
	// 导出内部函数供测试使用
	_internal: {
		checkScriptSafety,
		checkEnvCorrect,
		createTaskList,
		executeTaskList,
		archiveFile,
		removeLocalFile,
		disconnectSSH,
		execBuild,
		DANGEROUS_PATTERNS,
		MAX_BUFFER
	},
	apply: async (env = 'dev', cluster, build, yes) => {
		if (!checkDeployConfigExists()) {
			error('deploy.config.js 文件不存在，请使用 deploy-plus init 命令创建')
			process.exit(1)
		}

		const config = require(deployConfigPath)
		const { projectName } = config

		const createEnvConfig = (envName) => ({
			...config[envName],
			privateKey: config.privateKey,
			passphrase: config.passphrase
		})

		const deploy = async (envName, needConfirm) => {
			info(`----- 部署环境 ${envName} -----`)

			const startTime = Date.now()
			const envConfig = createEnvConfig(envName)

			checkEnvCorrect(envConfig, envName, build)

			if (needConfirm) {
				const { confirm } = await confirmDeploy(
					`${underline(projectName)} 项目是否部署到 ${underline(envConfig.name)}?`
				)
				if (!confirm) {
					process.exit(1)
				}
			}

			const ssh = new NodeSSH()
			const tasks = createTaskList(envConfig, build)
			await executeTaskList(tasks, envConfig, ssh)

			succeed(`恭喜您，${underline(projectName)}项目已在${underline(envConfig.name)}部署成功 耗时${(Date.now() - startTime) / 1000}s\n`)
		}

		if (cluster) {
			for (const envName of config.cluster || []) {
				if (!config[envName]) {
					error(`${envName} 环境配置不存在`)
					continue
				}
				await deploy(envName, !yes)
			}
		} else {
			if (!config[env]) {
				error(`${env} 环境配置不存在`)
				process.exit(1)
			}
			await deploy(env, !yes)
		}

		process.exit(0)
	}
}
