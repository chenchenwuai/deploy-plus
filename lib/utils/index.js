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

	underline: (message) => chalk.underline.blueBright.bold(message)
}
