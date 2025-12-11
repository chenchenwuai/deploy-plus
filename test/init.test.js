const os = require('os')

describe('init - 配置初始化测试', () => {
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
		})

		test('privateKey 应该指向用户 home 目录', () => {
			expect(defaultInfo.privateKey).toBe(`${os.homedir()}/.ssh/id_rsa`)
		})

		test('cluster 应该为空数组', () => {
			expect(defaultInfo.cluster).toEqual([])
		})
	})
})
