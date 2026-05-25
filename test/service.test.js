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

	describe('发布配置', () => {
		test('npm 包应该只发布运行必需文件', () => {
			const packageInfo = require('../package.json')

			expect(packageInfo.files).toEqual([
				'bin',
				'lib',
				'README.md',
				'CHANGELOG.md',
				'LICENSE'
			])
		})
	})

	describe('run - commander 参数映射', () => {
		const loadServiceWithCommandMocks = () => {
			jest.resetModules()

			const deployApply = jest.fn()
			const initApply = jest.fn()
			const encryptApply = jest.fn()

			jest.doMock('../lib/commands/deploy', () => ({
				description: '部署项目',
				apply: deployApply
			}))
			jest.doMock('../lib/commands/init', () => ({
				description: '初始化项目',
				apply: initApply
			}))
			jest.doMock('../lib/commands/encrypt', () => ({
				description: '加解密',
				apply: encryptApply
			}))

			return {
				Service: require('../lib/service'),
				deployApply,
				initApply,
				encryptApply
			}
		}

		afterEach(() => {
			jest.restoreAllMocks()
			jest.resetModules()
		})

		test('deploy 命令应该映射 mode/cluster/build/yes 参数', () => {
			const { Service, deployApply } = loadServiceWithCommandMocks()
			const service = new Service()

			service.run(['deploy', '-m', 'prod', '-c', '-b', '-y'])

			expect(deployApply).toHaveBeenCalledWith('prod', true, true, true)
		})

		test('init 命令应该把 -y 后的字符串作为默认密码', () => {
			const { Service, initApply } = loadServiceWithCommandMocks()
			const service = new Service()

			service.run(['init', '-f', '-y', 'secret'])

			expect(initApply).toHaveBeenCalledWith(true, true, 'secret')
		})

		test('encrypt 命令应该映射 decrypt 和参数数组', () => {
			const { Service, encryptApply } = loadServiceWithCommandMocks()
			const service = new Service()

			service.run(['encrypt', '-d', 'cipher'])

			expect(encryptApply).toHaveBeenCalledWith(['cipher'], true)
		})
	})
})
