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
const { defaultInfo, inquirerConfig, deployConfigPath, deployConfigFileName } = require('../config')

// 获取用户输入信息
const getUserInputInfo = () => {
	return inquirer.prompt(inquirerConfig)
}

// 创建JSON对象
const createJsonObj = (userInputInfo) => {
	const jsonObj = {
		projectName: userInputInfo.projectName,
		privateKey: userInputInfo.privateKey,
		passphrase: userInputInfo.passphrase,
		cluster: []
	}
	const { deployEnvList } = userInputInfo

	const createObj = (env) => {
		let password = ''
		if (userInputInfo[`${env}Password`]){
			password = rsaEncrypt(userInputInfo[`${env}Password`], defaultInfo['privateKey'])
		}
		return {
			name: userInputInfo[`${env}Name`],
			script: userInputInfo[`${env}Script`],
			host: userInputInfo[`${env}Host`],
			port: userInputInfo[`${env}Port`],
			username: userInputInfo[`${env}Username`],
			password: password,
			distPath: userInputInfo[`${env}DistPath`],
			webDir: userInputInfo[`${env}WebDir`],
			isBackupRemoteFile: userInputInfo[`${env}IsBackupRemoteFile`]
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
	description: `初始化项目`,
	/**
   *
   * @param {*} force  -f 强制重新生成配置文件
   * @param {*} yes -y 配置文件全部选择默认值
   */
	apply: (force, yes, args) => {
		let isExist = checkDeployConfigExists()
		if (force && isExist){
			removeDeployConfigFile()
			info('已删除旧配置文件')
			isExist = false
		}
		if (isExist) {
			error(`${deployConfigFileName} 配置文件已存在`)
			process.exit(1)
		} else {
			if (yes){
				const defaultPassword = args && args[0] || ''
				const info = JSON.parse(JSON.stringify(defaultInfo))
				if (defaultPassword){
					info.dev.password = rsaEncrypt(defaultPassword, info.privateKey)
				}
				createConfigFile(info)
				succeed(`配置文件 ${underline(deployConfigFileName)} 生成成功`)
				warning('为了安全，请将此文件加入到 .gitignore 文件中')
				process.exit(0)
			} else {
				getUserInputInfo().then((userInputInfo) => {
					createConfigFile(createJsonObj(userInputInfo))
					succeed(`配置文件 ${underline(deployConfigFileName)} 生成成功`)
					warning('为了安全，请将此文件加入到 .gitignore 文件中')
					process.exit(0)
				})
			}
		}
	}
}
