module.exports = {
	testEnvironment: 'node',
	testMatch: ['**/test/**/*.test.js'],
	collectCoverageFrom: [
		'lib/**/*.js',
		'!lib/config/message.js'
	],
	coverageDirectory: 'coverage',
	coverageReporters: ['text', 'lcov', 'html'],
	verbose: true
}
