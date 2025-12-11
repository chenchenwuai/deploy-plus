const fs = require('fs')
const path = require('path')
const os = require('os')

// Mock config 模块
jest.mock('../lib/config', () => ({
	deployConfigPath: '/tmp/test-deploy-config.js'
}))

const utils = require('../lib/utils')

describe('utils - 工具函数测试', () => {
	describe('checkDeployConfigExists', () => {
		const testConfigPath = '/tmp/test-deploy-config.js'

		afterEach(() => {
			if (fs.existsSync(testConfigPath)) {
				fs.unlinkSync(testConfigPath)
			}
		})

		test('配置文件存在时返回 true', () => {
			fs.writeFileSync(testConfigPath, 'module.exports = {}')
			expect(utils.checkDeployConfigExists()).toBe(true)
		})

		test('配置文件不存在时返回 false', () => {
			expect(utils.checkDeployConfigExists()).toBe(false)
		})
	})

	describe('removeDeployConfigFile', () => {
		const testConfigPath = '/tmp/test-deploy-config.js'

		test('删除存在的配置文件', () => {
			fs.writeFileSync(testConfigPath, 'module.exports = {}')
			expect(fs.existsSync(testConfigPath)).toBe(true)

			utils.removeDeployConfigFile()
			expect(fs.existsSync(testConfigPath)).toBe(false)
		})

		test('删除不存在的文件不报错', () => {
			expect(() => utils.removeDeployConfigFile()).not.toThrow()
		})
	})

	describe('rsaEncrypt / rsaDecrypt', () => {
		const testKeyPath = path.join(os.tmpdir(), 'test-rsa-key')
		const testData = 'test-password-123'

		beforeAll(() => {
			// 生成测试用 RSA 密钥
			const NodeRSA = require('node-rsa')
			const key = new NodeRSA({ b: 1024 })
			fs.writeFileSync(testKeyPath, key.exportKey('private'))
		})

		afterAll(() => {
			if (fs.existsSync(testKeyPath)) {
				fs.unlinkSync(testKeyPath)
			}
		})

		test('加密后可以正确解密', () => {
			const encrypted = utils.rsaEncrypt(testData, testKeyPath)
			expect(encrypted).toBeTruthy()
			expect(encrypted).not.toBe(testData)

			const decrypted = utils.rsaDecrypt(encrypted, testKeyPath)
			expect(decrypted).toBe(testData)
		})

		test('加密参数不完整时抛出错误', () => {
			expect(() => utils.rsaEncrypt('', testKeyPath)).toThrow('加密参数不完整')
			expect(() => utils.rsaEncrypt(testData, '')).toThrow('加密参数不完整')
			expect(() => utils.rsaEncrypt(null, testKeyPath)).toThrow('加密参数不完整')
		})

		test('解密参数不完整时抛出错误', () => {
			expect(() => utils.rsaDecrypt('', testKeyPath)).toThrow('解密参数不完整')
			expect(() => utils.rsaDecrypt(testData, '')).toThrow('解密参数不完整')
		})

		test('密钥文件不存在时抛出错误', () => {
			expect(() => utils.rsaEncrypt(testData, '/nonexistent/key'))
				.toThrow('私钥文件不存在')
			expect(() => utils.rsaDecrypt('encrypted', '/nonexistent/key'))
				.toThrow('私钥文件不存在')
		})
	})

	describe('日志函数', () => {
		let consoleSpy

		beforeEach(() => {
			consoleSpy = jest.spyOn(console, 'log').mockImplementation()
		})

		afterEach(() => {
			consoleSpy.mockRestore()
		})

		test('log 输出消息', () => {
			utils.log('test message')
			expect(consoleSpy).toHaveBeenCalledWith('test message')
		})
	})

	describe('underline', () => {
		test('返回带下划线样式的字符串', () => {
			const result = utils.underline('test')
			expect(result).toBeTruthy()
			expect(typeof result).toBe('string')
		})
	})
})
