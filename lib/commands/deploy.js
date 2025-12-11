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
	underline,
	isSafeToRemove,
	checkScriptSafety
} = require('../utils')

/** 打包命令最大输出缓冲区大小 (5MB) */
const MAX_BUFFER = 5000 * 1024

/**
 * 弹出确认提示框
 * @param {string} message - 提示信息
 * @returns {Promise<{confirm: boolean}>} 用户确认结果
 */
const confirmDeploy = (message) => {
	return inquirer.prompt([
		{
			type: 'confirm',
			name: 'confirm',
			message
		}
	])
}

/**
 * 检查部署环境配置是否完整有效
 * @param {Object} config - 环境配置对象
 * @param {string} env - 环境名称 (dev/prod等)
 * @param {boolean} needBuild - 是否需要执行打包命令
 */
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

/**
 * 执行本地打包命令
 * 流程: 安全检查 -> 执行命令 -> 输出结果
 * @param {Object} config - 环境配置，包含 script 字段
 * @param {number} index - 当前任务序号
 */
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

/**
 * 压缩本地 dist 目录为 tar 文件
 * @param {Object} config - 环境配置，包含 distPath 字段
 * @param {number} index - 当前任务序号
 */
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

/**
 * 建立 SSH 连接
 * 支持密码、私钥、加密密码三种认证方式
 * @param {Object} config - 环境配置，包含 host/port/username/password/privateKey
 * @param {number} index - 当前任务序号
 * @param {NodeSSH} ssh - SSH 实例
 */
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

/**
 * 上传本地压缩文件到远程服务器
 * 上传位置: webDir 的父目录
 * @param {Object} config - 环境配置，包含 distPath/webDir
 * @param {number} index - 当前任务序号
 * @param {NodeSSH} ssh - SSH 实例
 */
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

/**
 * 解压远程文件并处理备份
 * 流程: 备份旧目录 -> 解压新文件 -> 压缩/删除备份
 * @param {Object} config - 环境配置
 * @param {string} config.webDir - 远程部署目录
 * @param {string} config.distPath - 本地打包目录名
 * @param {boolean} [config.isBackupRemoteFile=true] - 是否备份旧文件
 * @param {boolean} [config.isCompressBackup=true] - 是否压缩备份文件
 * @param {number} index - 当前任务序号
 * @param {NodeSSH} ssh - SSH 实例
 */
const unzipRemoteFile = async (config, index, ssh) => {
	const { webDir, distPath, isBackupRemoteFile = true, isCompressBackup = true } = config
	const date = new Date()
	const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`
	const backupName = `${webDir}_backup_${dateStr}`
	const remoteTar = `${webDir}/../${distPath}.tar`

	try {
		// 备份并创建新目录
		await ssh.execCommand(`mv ${webDir} ${backupName} && mkdir ${webDir}`)

		log(`(${index}) 解压远程文件 ${underline(remoteTar)}`)
		await ssh.execCommand(`tar -xf ${remoteTar} -C ${webDir} && rm -rf ${remoteTar}`)

		// 压缩备份（使用相对路径避免解压时产生多层目录）
		if (isBackupRemoteFile && isCompressBackup) {
			const backupDir = backupName.substring(0, backupName.lastIndexOf('/'))
			const backupBaseName = backupName.substring(backupName.lastIndexOf('/') + 1)
			await ssh.execCommand(`tar -czf ${backupName}.tar.gz -C ${backupDir} ${backupBaseName}`)
			// 删除备份目录
			if (isSafeToRemove(backupName)) {
				await ssh.execCommand(`rm -rf ${backupName}`)
			} else {
				error(`安全检查未通过，跳过删除目录: ${backupName}`)
			}
		} else if (isBackupRemoteFile) {
			// 仅备份不压缩，保留备份目录
		} else {
			// 不备份，删除备份目录
			if (isSafeToRemove(backupName)) {
				await ssh.execCommand(`rm -rf ${backupName}`)
			} else {
				error(`安全检查未通过，跳过删除目录: ${backupName}`)
			}
		}

		succeed('解压成功')
	} catch (e) {
		error(`解压远程文件操作失败: ${e}`)
		process.exit(1)
	}
}

/**
 * 删除本地临时压缩文件
 * @param {Object} config - 环境配置，包含 distPath
 * @param {number} index - 当前任务序号
 */
const removeLocalFile = (config, index) => {
	const localPath = `${process.cwd()}/${config.distPath}.tar`
	log(`(${index}) 删除本地压缩文件 ${underline(localPath)}`)
	fs.unlinkSync(localPath)
	succeed('删除本地压缩文件成功')
}

/**
 * 断开 SSH 连接
 * @param {Object} config - 环境配置 (未使用，保持参数一致性)
 * @param {number} index - 当前任务序号
 * @param {NodeSSH} ssh - SSH 实例
 */
const disconnectSSH = (config, index, ssh) => {
	log(`(${index}) 断开 ssh`)
	ssh.dispose()
}

/**
 * 创建部署任务列表
 * 任务顺序: [打包] -> 压缩 -> SSH连接 -> 上传 -> 解压 -> 清理 -> 断开
 * @param {Object} config - 环境配置
 * @param {boolean} needBuild - 是否需要执行打包
 * @returns {Function[]} 任务函数数组
 */
const createTaskList = (config, needBuild) => {
	const tasks = []

	if (needBuild && config.script) {
		tasks.push(execBuild)
	}

	tasks.push(archiveFile, connectSSH, uploadLocalFile, unzipRemoteFile, removeLocalFile, disconnectSSH)
	return tasks
}

/**
 * 顺序执行任务列表
 * @param {Function[]} tasks - 任务函数数组
 * @param {Object} config - 环境配置
 * @param {NodeSSH} ssh - SSH 实例
 */
const executeTaskList = async (tasks, config, ssh) => {
	for (let i = 0; i < tasks.length; i++) {
		await tasks[i](config, i + 1, ssh)
	}
}

/**
 * 部署模块
 *
 * 部署流程:
 * 1. 检查配置文件是否存在
 * 2. 读取并验证环境配置
 * 3. 用户确认部署 (可通过 -y 跳过)
 * 4. 执行部署任务:
 *    4.1 [可选] 执行本地打包命令 (需 -b 参数)
 *    4.2 压缩本地 dist 目录为 tar 文件
 *    4.3 建立 SSH 连接
 *    4.4 上传压缩文件到服务器
 *    4.5 备份旧文件 -> 解压新文件 -> 处理备份
 *    4.6 删除本地临时压缩文件
 *    4.7 断开 SSH 连接
 * 5. 输出部署结果
 */
module.exports = {
	description: '部署项目',
	/** 导出内部函数供测试使用 */
	_internal: {
		checkScriptSafety,
		checkEnvCorrect,
		createTaskList,
		executeTaskList,
		archiveFile,
		removeLocalFile,
		disconnectSSH,
		execBuild,
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
