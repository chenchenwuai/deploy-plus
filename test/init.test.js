const os = require('os')
const fs = require('fs')
const path = require('path')

const testConfigPath = path.join(os.tmpdir(), `deploy-plus-init-test-${process.pid}.config.js`)

const createDefaultInfo = () => ({
	projectName: 'deploy-plus-test',
	privateKey: '/tmp/test-key',
	passphrase: '',
	cluster: [],
	dev: {
		name: '开发环境',
		script: 'npm run build:dev',
		host: '',
		port: 22,
		username: 'root',
		password: '',
		passwordEncrypted: false,
		distPath: 'dist',
		webDir: '/var/www/html',
		isBackupRemoteFile: true,
		isCompressBackup: true
	}
})

const loadInitWithMocks = ({
	configExists = false,
	userInputInfo,
	rsaEncrypt = jest.fn((password) => `encrypted-${password}`)
} = {}) => {
	jest.resetModules()

	const utils = {
		checkDeployConfigExists: jest.fn(() => configExists),
		removeDeployConfigFile: jest.fn(),
		rsaEncrypt,
		succeed: jest.fn(),
		error: jest.fn(),
		info: jest.fn(),
		warning: jest.fn(),
		underline: jest.fn((message) => message)
	}
	const config = {
		defaultInfo: createDefaultInfo(),
		inquirerConfig: [{ name: 'projectName' }],
		deployConfigPath: testConfigPath,
		deployConfigFileName: '.deploy.config.js'
	}
	const inquirer = {
		prompt: jest.fn(() => Promise.resolve(userInputInfo))
	}

	jest.doMock('../lib/utils', () => utils)
	jest.doMock('../lib/config', () => config)
	jest.doMock('inquirer', () => inquirer)

	return {
		init: require('../lib/commands/init'),
		utils,
		inquirer
	}
}

const readGeneratedConfig = () => {
	const source = fs.readFileSync(testConfigPath, 'utf8')
	const moduleObj = { exports: {}}
	Function('module', source)(moduleObj)
	return moduleObj.exports
}

const mockProcessExit = () => jest.spyOn(process, 'exit').mockImplementation((code) => {
	throw new Error(`process.exit ${code}`)
})

describe('init - 配置初始化测试', () => {
	afterEach(() => {
		jest.restoreAllMocks()
		jest.resetModules()
		if (fs.existsSync(testConfigPath)) {
			fs.unlinkSync(testConfigPath)
		}
	})

	describe('config/index.js - 配置模块', () => {
		let config

		beforeAll(() => {
			config = require('../lib/config')
		})

		test('应该导出 packageInfo', () => {
			expect(config.packageInfo).toBeDefined()
			expect(config.packageInfo.name).toBe('deploy-plus')
			expect(config.packageInfo.version).toBeDefined()
		})

		test('应该导出 deployConfigFileName', () => {
			expect(config.deployConfigFileName).toBe('.deploy.config.js')
		})

		test('应该导出 deployConfigPath', () => {
			expect(config.deployConfigPath).toContain('.deploy.config.js')
		})

		test('应该导出 defaultInfo 默认配置', () => {
			const { defaultInfo } = config
			expect(defaultInfo).toBeDefined()
			expect(defaultInfo.privateKey).toContain('.ssh/id_rsa')
			expect(defaultInfo.dev).toBeDefined()
			expect(defaultInfo.dev.port).toBe(22)
			expect(defaultInfo.dev.username).toBe('root')
			expect(defaultInfo.dev.distPath).toBe('dist')
		})

		test('应该导出 inquirerConfig 交互配置', () => {
			expect(config.inquirerConfig).toBeDefined()
			expect(Array.isArray(config.inquirerConfig)).toBe(true)
			expect(config.inquirerConfig.length).toBeGreaterThan(0)
		})
	})

	describe('defaultInfo 默认值验证', () => {
		let defaultInfo

		beforeAll(() => {
			defaultInfo = require('../lib/config').defaultInfo
		})

		test('dev 环境应该有完整配置', () => {
			const { dev } = defaultInfo
			expect(dev.name).toBe('开发环境')
			expect(dev.script).toBe('npm run build:dev')
			expect(dev.port).toBe(22)
			expect(dev.username).toBe('root')
			expect(dev.distPath).toBe('dist')
			expect(dev.webDir).toBe('/var/www/html')
			expect(dev.isBackupRemoteFile).toBe(true)
			expect(dev.isCompressBackup).toBe(true)
		})

		test('privateKey 应该指向用户 home 目录', () => {
			expect(defaultInfo.privateKey).toBe(`${os.homedir()}/.ssh/id_rsa`)
		})

		test('cluster 应该为空数组', () => {
			expect(defaultInfo.cluster).toEqual([])
		})
	})

	describe('init.apply - 初始化命令', () => {
		test('yes 模式应该生成默认配置并加密默认密码', async () => {
			const mockExit = mockProcessExit()
			const { init, utils } = loadInitWithMocks()

			await expect(init.apply(false, true, 'secret')).rejects.toThrow('process.exit 0')

			const generatedConfig = readGeneratedConfig()
			expect(generatedConfig.dev.password).toBe('encrypted-secret')
			expect(generatedConfig.dev.passwordEncrypted).toBe(true)
			expect(utils.rsaEncrypt).toHaveBeenCalledWith('secret', '/tmp/test-key')
			expect(utils.succeed).toHaveBeenCalled()
			expect(utils.warning).toHaveBeenCalledWith('为了安全，请将此文件加入到 .gitignore 文件中')
			mockExit.mockRestore()
		})

		test('force 模式应该先删除已存在配置再重新生成', async () => {
			mockProcessExit()
			const { init, utils } = loadInitWithMocks({ configExists: true })

			await expect(init.apply(true, true)).rejects.toThrow('process.exit 0')

			expect(utils.removeDeployConfigFile).toHaveBeenCalledTimes(1)
			expect(utils.info).toHaveBeenCalledWith('已删除旧配置文件')
			expect(fs.existsSync(testConfigPath)).toBe(true)
		})

		test('配置已存在且未 force 时应该退出', async () => {
			mockProcessExit()
			const { init, utils } = loadInitWithMocks({ configExists: true })

			await expect(init.apply(false, true)).rejects.toThrow('process.exit 1')

			expect(utils.error).toHaveBeenCalledWith('.deploy.config.js 配置文件已存在')
			expect(fs.existsSync(testConfigPath)).toBe(false)
		})

		test('交互模式应该使用用户输入生成多环境配置', async () => {
			mockProcessExit()
			const userInputInfo = {
				projectName: 'interactive-project',
				privateKey: '/tmp/user-key',
				passphrase: 'phrase',
				deployEnvList: ['dev', 'prod'],
				devName: '开发环境',
				devScript: 'npm run build:dev',
				devHost: '127.0.0.1',
				devPort: 22,
				devUsername: 'root',
				devPassword: 'dev-password',
				devDistPath: 'dist',
				devWebDir: '/var/www/dev',
				devIsBackupRemoteFile: true,
				devIsCompressBackup: undefined,
				prodName: '生产环境',
				prodScript: 'npm run build',
				prodHost: '192.168.1.1',
				prodPort: 22,
				prodUsername: 'deploy',
				prodPassword: '',
				prodDistPath: 'build',
				prodWebDir: '/var/www/prod',
				prodIsBackupRemoteFile: false,
				prodIsCompressBackup: false
			}
			const { init, utils, inquirer } = loadInitWithMocks({ userInputInfo })

			await expect(init.apply(false, false)).rejects.toThrow('process.exit 0')

			const generatedConfig = readGeneratedConfig()
			expect(inquirer.prompt).toHaveBeenCalled()
			expect(generatedConfig.projectName).toBe('interactive-project')
			expect(generatedConfig.dev.password).toBe('encrypted-dev-password')
			expect(generatedConfig.dev.passwordEncrypted).toBe(true)
			expect(generatedConfig.dev.isCompressBackup).toBe(true)
			expect(generatedConfig.prod.password).toBe('')
			expect(generatedConfig.prod.passwordEncrypted).toBe(false)
			expect(generatedConfig.test).toBeUndefined()
			expect(utils.info).toHaveBeenCalledWith('dev 环境密码已自动加密')
		})

		test('交互模式密码加密失败时应该保存明文密码', async () => {
			mockProcessExit()
			const rsaEncrypt = jest.fn(() => {
				throw new Error('bad key')
			})
			const userInputInfo = {
				projectName: 'plain-project',
				privateKey: '/tmp/bad-key',
				passphrase: '',
				deployEnvList: ['dev'],
				devName: '开发环境',
				devScript: 'npm run build',
				devHost: '127.0.0.1',
				devPort: 22,
				devUsername: 'root',
				devPassword: 'plain-password',
				devDistPath: 'dist',
				devWebDir: '/var/www/dev',
				devIsBackupRemoteFile: true,
				devIsCompressBackup: true
			}
			const { init, utils } = loadInitWithMocks({ userInputInfo, rsaEncrypt })

			await expect(init.apply(false, false)).rejects.toThrow('process.exit 0')

			const generatedConfig = readGeneratedConfig()
			expect(generatedConfig.dev.password).toBe('plain-password')
			expect(generatedConfig.dev.passwordEncrypted).toBe(false)
			expect(utils.warning).toHaveBeenCalledWith('dev 环境密码加密失败: bad key，将保存明文密码')
		})
	})
})
