const fs = require('fs')
const path = require('path')
const os = require('os')

const testConfigPath = path.join(os.tmpdir(), `deploy-plus-encrypt-test-${process.pid}.config.js`)

const writeConfig = (privateKey = '/tmp/test-key') => {
	fs.writeFileSync(testConfigPath, `module.exports = ${JSON.stringify({ privateKey })}`)
	delete require.cache[testConfigPath]
}

const loadEncryptWithMocks = ({
	configExists = true,
	rsaEncrypt = jest.fn(() => 'encrypted-value'),
	rsaDecrypt = jest.fn(() => 'decrypted-value')
} = {}) => {
	jest.resetModules()

	const utils = {
		checkDeployConfigExists: jest.fn(() => configExists),
		rsaEncrypt,
		rsaDecrypt,
		succeed: jest.fn(),
		error: jest.fn()
	}
	const config = {
		deployConfigPath: testConfigPath,
		deployConfigFileName: '.deploy.config.js'
	}

	jest.doMock('../lib/utils', () => utils)
	jest.doMock('../lib/config', () => config)

	return {
		encrypt: require('../lib/commands/encrypt'),
		utils
	}
}

const mockProcessExit = () => jest.spyOn(process, 'exit').mockImplementation((code) => {
	throw new Error(`process.exit ${code}`)
})

describe('encrypt - 加解密命令测试', () => {
	let consoleSpy

	beforeEach(() => {
		consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
		writeConfig()
	})

	afterEach(() => {
		consoleSpy.mockRestore()
		jest.restoreAllMocks()
		jest.resetModules()
		if (fs.existsSync(testConfigPath)) {
			fs.unlinkSync(testConfigPath)
		}
	})

	test('配置文件不存在时应该退出', () => {
		mockProcessExit()
		const { encrypt, utils } = loadEncryptWithMocks({ configExists: false })

		expect(() => encrypt.apply(['secret'], false)).toThrow('process.exit 1')

		expect(utils.error).toHaveBeenCalledWith('.deploy.config.js 配置文件不存在')
	})

	test('未传入待处理内容时应该退出', () => {
		mockProcessExit()
		const { encrypt, utils } = loadEncryptWithMocks()

		expect(() => encrypt.apply([], false)).toThrow('process.exit 1')
		expect(() => encrypt.apply(null, true)).toThrow('process.exit 1')

		expect(utils.error).toHaveBeenCalledWith('没有要加密的信息')
		expect(utils.error).toHaveBeenCalledWith('没有要解密的信息')
	})

	test('加密成功时应该输出加密结果', () => {
		mockProcessExit()
		const { encrypt, utils } = loadEncryptWithMocks()

		expect(() => encrypt.apply(['secret'], false)).toThrow('process.exit 0')

		expect(utils.rsaEncrypt).toHaveBeenCalledWith('secret', '/tmp/test-key')
		expect(utils.succeed).toHaveBeenCalledWith('加密成功，结果如下')
		expect(consoleSpy).toHaveBeenCalledWith('encrypted-value')
	})

	test('解密成功时应该输出解密结果', () => {
		mockProcessExit()
		const { encrypt, utils } = loadEncryptWithMocks()

		expect(() => encrypt.apply(['encrypted'], true)).toThrow('process.exit 0')

		expect(utils.rsaDecrypt).toHaveBeenCalledWith('encrypted', '/tmp/test-key')
		expect(utils.succeed).toHaveBeenCalledWith('解密成功，结果如下')
		expect(consoleSpy).toHaveBeenCalledWith('decrypted-value')
	})

	test('加密失败时应该输出错误并退出', () => {
		mockProcessExit()
		const rsaEncrypt = jest.fn(() => {
			throw new Error('bad key')
		})
		const { encrypt, utils } = loadEncryptWithMocks({ rsaEncrypt })

		expect(() => encrypt.apply(['secret'], false)).toThrow('process.exit 1')

		expect(utils.error).toHaveBeenCalledWith('加密失败: bad key')
	})

	test('解密失败时应该输出错误并退出', () => {
		mockProcessExit()
		const rsaDecrypt = jest.fn(() => {
			throw new Error('bad cipher')
		})
		const { encrypt, utils } = loadEncryptWithMocks({ rsaDecrypt })

		expect(() => encrypt.apply(['encrypted'], true)).toThrow('process.exit 1')

		expect(utils.error).toHaveBeenCalledWith('解密失败: bad cipher')
	})
})
