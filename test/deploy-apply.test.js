const fs = require('fs')
const path = require('path')
const os = require('os')

const testConfigPath = path.join(os.tmpdir(), `deploy-plus-apply-test-${process.pid}.config.js`)
const testCwd = path.join(os.tmpdir(), `deploy-plus-apply-cwd-${process.pid}`)
const originalCwd = process.cwd()

const baseEnvConfig = {
	name: '开发环境',
	host: '127.0.0.1',
	port: 22,
	username: 'root',
	password: 'password',
	passwordEncrypted: false,
	distPath: 'dist',
	webDir: '/var/www/app',
	isBackupRemoteFile: true,
	isCompressBackup: false
}

const writeConfigModule = (config) => {
	jest.doMock(testConfigPath, () => config, { virtual: true })
}

const mockProcessExit = () => jest.spyOn(process, 'exit').mockImplementation((code) => {
	throw new Error(`process.exit ${code}`)
})

const loadDeployApplyWithMocks = ({
	configExists = true,
	config = {
		projectName: 'deploy-plus-test',
		privateKey: '',
		passphrase: '',
		cluster: [],
		dev: baseEnvConfig
	},
	confirm = true,
	sshExecCommand = jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
	sshPutFile = jest.fn().mockResolvedValue()
} = {}) => {
	jest.resetModules()
	writeConfigModule(config)

	const utils = {
		checkDeployConfigExists: jest.fn(() => configExists),
		rsaDecrypt: jest.fn((value) => value),
		log: jest.fn(),
		info: jest.fn(),
		warning: jest.fn(),
		succeed: jest.fn(),
		error: jest.fn(),
		underline: jest.fn((message) => message),
		isSafeToRemove: jest.fn(() => true),
		checkScriptSafety: jest.fn(() => ({ safe: true }))
	}
	const sshInstance = {
		connect: jest.fn().mockResolvedValue(),
		putFile: sshPutFile,
		execCommand: sshExecCommand,
		dispose: jest.fn()
	}
	const NodeSSH = jest.fn(() => sshInstance)
	const inquirer = {
		prompt: jest.fn().mockResolvedValue({ confirm })
	}

	jest.doMock('../lib/config', () => ({
		deployConfigPath: testConfigPath,
		packageInfo: { version: '1.4.1' }
	}))
	jest.doMock('../lib/utils', () => utils)
	jest.doMock('node-ssh', () => ({ NodeSSH }))
	jest.doMock('inquirer', () => inquirer)

	return {
		deploy: require('../lib/commands/deploy'),
		utils,
		NodeSSH,
		sshInstance,
		inquirer
	}
}

describe('deploy.apply - CLI 入口流程', () => {
	beforeEach(() => {
		fs.rmSync(testCwd, { recursive: true, force: true })
		fs.mkdirSync(path.join(testCwd, 'dist'), { recursive: true })
		fs.writeFileSync(path.join(testCwd, 'dist', 'index.html'), '<html></html>')
		process.chdir(testCwd)
	})

	afterEach(() => {
		jest.restoreAllMocks()
		jest.resetModules()
		process.chdir(originalCwd)
		fs.rmSync(testCwd, { recursive: true, force: true })
	})

	test('配置文件不存在时应该退出', async () => {
		mockProcessExit()
		const { deploy, utils } = loadDeployApplyWithMocks({ configExists: false })

		await expect(deploy.apply()).rejects.toThrow('process.exit 1')

		expect(utils.error).toHaveBeenCalledWith('.deploy.config.js 文件不存在，请使用 deploy-plus init 命令创建')
	})

	test('指定环境不存在时应该退出', async () => {
		mockProcessExit()
		const { deploy, utils } = loadDeployApplyWithMocks()

		await expect(deploy.apply('prod', false, false, true)).rejects.toThrow('process.exit 1')

		expect(utils.error).toHaveBeenCalledWith('prod 环境配置不存在')
	})

	test('新版配置缺少 passwordEncrypted 时应该提示升级', async () => {
		mockProcessExit()
		const config = {
			projectName: 'deploy-plus-test',
			deployPlusVersion: '1.4.2',
			privateKey: '/Users/xxcc/.ssh/id_rsa',
			passphrase: '',
			cluster: [],
			dev: {
				...baseEnvConfig
			}
		}
		delete config.dev.passwordEncrypted
		const { deploy, utils, NodeSSH } = loadDeployApplyWithMocks({ config })

		await expect(deploy.apply('dev', false, false, true)).rejects.toThrow('process.exit 1')

		expect(utils.error).toHaveBeenCalledWith('配置版本 1.4.2 与当前 deploy-plus 1.4.1 不一致，请先升级 deploy-plus')
		expect(NodeSSH).not.toHaveBeenCalled()
	})

	test('用户取消确认时应该退出且不创建 SSH 连接', async () => {
		mockProcessExit()
		const { deploy, NodeSSH, inquirer } = loadDeployApplyWithMocks({ confirm: false })

		await expect(deploy.apply('dev', false, false, false)).rejects.toThrow('process.exit 1')

		expect(inquirer.prompt).toHaveBeenCalled()
		expect(NodeSSH).not.toHaveBeenCalled()
	})

	test('单环境部署成功时应该执行完整流程并退出 0', async () => {
		mockProcessExit()
		const { deploy, sshInstance, utils } = loadDeployApplyWithMocks()

		await expect(deploy.apply('dev', false, false, true)).rejects.toThrow('process.exit 0')

		expect(sshInstance.connect).toHaveBeenCalled()
		expect(sshInstance.putFile).toHaveBeenCalled()
		expect(sshInstance.execCommand).toHaveBeenCalled()
		expect(sshInstance.dispose).toHaveBeenCalled()
		expect(utils.succeed).toHaveBeenCalledWith(expect.stringContaining('部署成功'))
	})

	test('单环境部署失败时应该退出 1 并输出环境失败信息', async () => {
		mockProcessExit()
		const { deploy, utils } = loadDeployApplyWithMocks({
			sshPutFile: jest.fn().mockRejectedValue(new Error('upload failed'))
		})

		await expect(deploy.apply('dev', false, false, true)).rejects.toThrow('process.exit 1')

		expect(utils.error).toHaveBeenCalledWith('dev 环境部署失败: upload failed')
	})

	test('集群部署应该跳过缺失环境并部署存在环境', async () => {
		mockProcessExit()
		const config = {
			projectName: 'deploy-plus-test',
			privateKey: '',
			passphrase: '',
			cluster: ['missing', 'dev'],
			dev: baseEnvConfig
		}
		const { deploy, sshInstance, utils } = loadDeployApplyWithMocks({ config })

		await expect(deploy.apply('dev', true, false, true)).rejects.toThrow('process.exit 0')

		expect(utils.error).toHaveBeenCalledWith('missing 环境配置不存在')
		expect(sshInstance.connect).toHaveBeenCalledTimes(1)
	})
})
