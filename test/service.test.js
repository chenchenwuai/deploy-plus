describe('service - 命令服务测试', () => {
	describe('Service 类', () => {
		let Service

		beforeAll(() => {
			Service = require('../lib/service')
		})

		test('应该能正确实例化', () => {
			expect(() => new Service()).not.toThrow()
		})

		test('实例应该有 run 方法', () => {
			const service = new Service()
			expect(typeof service.run).toBe('function')
		})

		test('实例应该有 setupDefaultCommands 方法', () => {
			const service = new Service()
			expect(typeof service.setupDefaultCommands).toBe('function')
		})

		test('实例应该有 registerCommands 方法', () => {
			const service = new Service()
			expect(typeof service.registerCommands).toBe('function')
		})
	})

	describe('命令配置', () => {
		test('deploy 命令应该存在', () => {
			const deploy = require('../lib/commands/deploy')
			expect(deploy.description).toBe('部署项目')
			expect(typeof deploy.apply).toBe('function')
		})

		test('init 命令应该存在', () => {
			const init = require('../lib/commands/init')
			expect(init.description).toBe('初始化项目')
			expect(typeof init.apply).toBe('function')
		})

		test('encrypt 命令应该存在', () => {
			const encrypt = require('../lib/commands/encrypt')
			expect(encrypt.description).toContain('加解密')
			expect(typeof encrypt.apply).toBe('function')
		})
	})
})
