const fs = require('fs')
const ora = require('ora')
const chalk = require('chalk')
const NodeRSA = require('node-rsa')
const { deployConfigPath } = require('../config')

module.exports = {
	// 检查部署配置文件是否存在
	checkDeployConfigExists() {
		return fs.existsSync(deployConfigPath)
	},

	// 删除部署配置文件
	removeDeployConfigFile() {
		if (fs.existsSync(deployConfigPath)) {
			fs.unlinkSync(deployConfigPath)
		}
	},

	// RSA 加密
	rsaEncrypt(data, keyFile) {
		if (!data || !keyFile) {
			throw new Error('加密参数不完整')
		}
		if (!fs.existsSync(keyFile)) {
			throw new Error(`私钥文件不存在: ${keyFile}`)
		}
		const keyBuf = fs.readFileSync(keyFile)
		const key = new NodeRSA(keyBuf)
		return key.encrypt(data, 'base64')
	},

	// RSA 解密
	rsaDecrypt(data, keyFile) {
		if (!data || !keyFile) {
			throw new Error('解密参数不完整')
		}
		if (!fs.existsSync(keyFile)) {
			throw new Error(`私钥文件不存在: ${keyFile}`)
		}
		const keyBuf = fs.readFileSync(keyFile)
		const key = new NodeRSA(keyBuf)
		return key.decrypt(data, 'utf8')
	},

	// 日志输出
	log: (message) => console.log(message),

	succeed: (...messages) => ora().succeed(chalk.greenBright.bold(messages.join(' '))),

	info: (...messages) => ora().info(chalk.blueBright.bold(messages.join(' '))),

	warning: (...messages) => ora().warn(chalk.yellow.bold(messages.join(' '))),

	error: (...messages) => ora().fail(chalk.redBright.bold(messages.join(' '))),

	underline: (message) => chalk.underline.blueBright.bold(message),

	// 检查路径是否可安全删除（防止误删根目录或重要系统目录）
	isSafeToRemove(dirPath) {
		// 检查路径安全性：
		// 1. 必须是绝对路径
		// 2. 至少3层目录深度（如 /var/www/backup）
		// 3. 不能包含路径穿越
		// 4. 不能是系统关键目录
		const dangerousPaths = ['/', '/bin', '/boot', '/dev', '/etc', '/home', '/lib', '/opt', '/root', '/sbin', '/srv', '/sys', '/tmp', '/usr', '/var']
		const normalizedPath = dirPath.replace(/\/+$/, '') // 移除末尾斜杠

		const pathParts = normalizedPath.split('/').filter(Boolean)
		const isDeepEnough = pathParts.length >= 3
		const hasNoTraversal = !dirPath.includes('..')
		const isNotDangerous = !dangerousPaths.includes(normalizedPath)
		const isAbsolute = dirPath.startsWith('/')

		return isAbsolute && isDeepEnough && hasNoTraversal && isNotDangerous
	},

	// 检查脚本是否包含危险命令
	checkScriptSafety(script) {
		if (!script) return { safe: true }

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
			/:()\{ :|:& \};:/,                          // fork 炸弹
			/\bwget\b.*\|\s*(ba)?sh/i,               // 下载并执行
			/\bcurl\b.*\|\s*(ba)?sh/i               // 下载并执行
		]

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
}
