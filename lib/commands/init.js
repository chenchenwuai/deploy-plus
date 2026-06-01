const fs = require('fs')
const inquirer = require('inquirer')
const {
	checkDeployConfigExists,
	removeDeployConfigFile,
	rsaEncrypt,
	succeed,
	error,
	info,
	warning,
	underline
} = require('../utils')
const { defaultInfo, inquirerConfig, deployConfigPath, deployConfigFileName, packageInfo } = require('../config')

// 获取用户输入信息
const getUserInputInfo = () => {
	return inquirer.prompt(inquirerConfig)
}

// 创建JSON对象
const createJsonObj = (userInputInfo) => {
	const jsonObj = {
		deployPlusVersion: packageInfo.version,
		projectName: userInputInfo.projectName,
		privateKey: userInputInfo.privateKey,
		passphrase: userInputInfo.passphrase,
		cluster: []
	}
	const { deployEnvList } = userInputInfo

	const createObj = (env) => {
		let password = ''
		let passwordEncrypted = false
		const privateKeyPath = userInputInfo.privateKey || defaultInfo['privateKey']
		if (userInputInfo[`${env}Password`] && privateKeyPath) {
			try {
				password = rsaEncrypt(userInputInfo[`${env}Password`], privateKeyPath)
				passwordEncrypted = true
				info(`${env} 环境密码已自动加密`)
			} catch (e) {
				warning(`${env} 环境密码加密失败: ${e.message}，将保存明文密码`)
				password = userInputInfo[`${env}Password`]
			}
		} else if (userInputInfo[`${env}Password`]) {
			password = userInputInfo[`${env}Password`]
		}
		return {
			name: userInputInfo[`${env}Name`],
			script: userInputInfo[`${env}Script`],
			host: userInputInfo[`${env}Host`],
			port: userInputInfo[`${env}Port`],
			username: userInputInfo[`${env}Username`],
			password: password,
			passwordEncrypted,
			distPath: userInputInfo[`${env}DistPath`],
			webDir: userInputInfo[`${env}WebDir`],
			isBackupRemoteFile: userInputInfo[`${env}IsBackupRemoteFile`],
			isCompressBackup: userInputInfo[`${env}IsCompressBackup`] ?? true
		}
	}

	deployEnvList.forEach((item) => (jsonObj[item] = createObj(item)))

	return jsonObj
}

// 创建配置文件
const createConfigFile = (jsonObj) => {
	const str = `module.exports = ${JSON.stringify(jsonObj, null, 2)}`
	fs.writeFileSync(deployConfigPath, str)
}

module.exports = {
	description: '初始化项目',
	/**
	 * @param {boolean} force -f 强制重新生成配置文件
	 * @param {boolean} yes -y 配置文件全部选择默认值
	 * @param {string} [password] 默认密码
	 */
	apply: async (force, yes, password) => {
		let isExist = checkDeployConfigExists()

		if (force && isExist) {
			removeDeployConfigFile()
			info('已删除旧配置文件')
			isExist = false
		}

		if (isExist) {
			error(`${deployConfigFileName} 配置文件已存在`)
			process.exit(1)
		}

		if (yes) {
			const configInfo = JSON.parse(JSON.stringify(defaultInfo))
			if (password) {
				configInfo.dev.password = rsaEncrypt(password, configInfo.privateKey)
				configInfo.dev.passwordEncrypted = true
			}
			createConfigFile(configInfo)
		} else {
			const userInputInfo = await getUserInputInfo()
			createConfigFile(createJsonObj(userInputInfo))
		}

		succeed(`配置文件 ${underline(deployConfigFileName)} 生成成功`)
		warning('为了安全，请将此文件加入到 .gitignore 文件中')
		process.exit(0)
	}
}
