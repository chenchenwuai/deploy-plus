module.exports = {
	env: {
		browser: true,
		commonjs: true,
		es2021: true,
		node: true
	},
	extends: [
		'eslint:recommended'
	],
	parserOptions: {
		ecmaVersion: 'latest'
	},
	rules: {
		'semi': [2, 'never'],
		"arrow-spacing": 1,
		"block-spacing": [2, "always"],
		"brace-style": [2, "1tbs", {
			"allowSingleLine": true
		}],
		"comma-dangle": 1,
		"comma-spacing": 1,
		"curly": [1, "multi-line"],
		"eqeqeq": [1, "smart"],
		"indent": [2, "tab", {
			"SwitchCase": 1
		}],
		"key-spacing": 1,
		"keyword-spacing": 1,
		"no-multiple-empty-lines": [1, {
			"max": 1
		}],
		"no-trailing-spaces": 1,
		"operator-linebreak": 1,
		"space-in-parens": 1,
		"space-infix-ops": 1,
		"space-unary-ops": [1, {
			"words": true,
			"nonwords": false
		}],
		"spaced-comment": [1, "always", {
			"markers": ["global", "globals", "eslint", "eslint-disable", "*package", "!", ","]
		}],
		"prefer-const": 1,
		"object-curly-spacing": [1, "always", {
			"arraysInObjects": false,
			"objectsInObjects": false
		}],
		"no-mixed-spaces-and-tabs": 1,
		"array-bracket-spacing": 1
	}
}
