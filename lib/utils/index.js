const fs = require('fs')
const ora = require('ora')
const chalk = require('chalk')
const NodeRSA = require('node-rsa')
const { deployConfigPath } = require('../config')

module.exports = {
	// 检查部署配置文件是否存在
	checkDeployConfigExists: () => {
		return fs.existsSync(deployConfigPath)
	},
	removeDeployConfigFile: () => {
		return fs.unlinkSync(deployConfigPath)
	},
	// rsa加密
	rsaEncrypt(data, keyFile){
		const keyBuf = fs.readFileSync(keyFile)
		const key = new NodeRSA(keyBuf)
		return key.encrypt(data, 'base64')
	},
	// rsa解密
	rsaDecrypt(data, keyFile){
		const keyBuf = fs.readFileSync(keyFile)
		const key = new NodeRSA(keyBuf)
		return key.decrypt(data, 'utf8')
	},
	// 日志信息
	log: (message) => {
		console.log(message)
	},
	// 成功信息
	succeed: (...message) => {
		ora().succeed(chalk.greenBright.bold(message))
	},
	// 提示信息
	info: (...message) => {
		ora().info(chalk.blueBright.bold(message))
	},
	// 提示信息
	warning: (...message) => {
		ora().warn(chalk.yellow.bold(message))
	},
	// 错误信息
	error: (...message) => {
		ora().fail(chalk.redBright.bold(message))
	},
	// 下划线重点信息
	underline: (message) => {
		return chalk.underline.blueBright.bold(message)
	}
}
