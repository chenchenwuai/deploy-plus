# deploy-plus

前端一键自动化部署脚手架服务，支持开发、测试、生产多环境配置。配置好后一键即可自动完成部署。

### github

[https://github.com/chenchenwuai/deploy-plus](https://github.com/chenchenwuai/deploy-plus)

## 1 安装

全局安装 deploy-plus

```shell
npm install deploy-plus -g
```

本地安装 deploy-plus

```shell
npm install deploy-plus --save-dev
```

查看版本，表示安装成功

```javascript
deploy-plus -v
```

注：本地安装的需要在调用前加 `npx`

```shell
npx deploy-plus -v
```

## 2 使用（以下代码都以全局安装为例）

### 2.1 查看帮助

```shell
deploy-plus -h
```

### 2.2 `init` 初始化配置文件（在项目目录下）

```shell
deploy-plus init -fy
# 或者使用简写
deploy-plus i -fy
```

> 执行 `deploy-plus i -h` 获取使用帮助

参数
+ `-f` `--force` 强制重新生成配置文件
+ `-y` `--yes` 全部设置为默认值, 如果后面跟字符串会被当作默认密码,例如: `deploy-plus i -y my-password`

根据提示填写内容，会在项目根目录下生成 `deploy.config.js` 文件，初始化可根据选择的需要部署的环境生成 `dev` (开发环境)、`test` (测试环境)、`prod` (生产环境) 三个配置，再有其他配置可参考模板自行配置。

如果生成文件时没有输入密码，或者没有默认密码，而后面又想设置密码时，请参考 `2.3节` 生成密码的加密字符串

### 2.3 `encrypt` 加解密密码操作

+ 加密原始密码
```shell
# 加密原始密码
deploy-plus encrypt 123456
# 或者使用简写
deploy-plus e 123456
```

加密成功后，控制台会打印出结果，请将结果填写到配置的`password`字段

+ 解密
```shell
# 解密
deploy-plus e decrypt xxxxx
# 或者使用简写
deploy-plus e -d xxxxx
```
`xxxxx` 为加密密码生成的字符串
> 执行 `deploy-plus e -h` 获取使用帮助

### 2.4 `deploy` 部署文件到服务器
```shell
deploy-plus deploy
# 或者使用简写
deploy-plus d
deploy-plus d -by -m prod
```
> 执行 `deploy-plus d -h` 获取使用帮助

参数
+ `-m` `--mode <mode>` 设置部署模式,不设置此参数，则默认 dev，例如：`deploy-plus d -m prod`
+ `-c` `--cluster` 部署集群,设置此参数后会忽略 -m 参数
+ `-b` `--build` 设置此参数，会执行打包命令(需保证已填写打包命令配置)
+ `-y` `--yes` 跳过是否确定部署提示

### 2.5 配置字段解析

> 如需手动配置，只需要在项目根目录下手动创建 `.deploy.config.js` 文件，复制以下代码按情况修改即可。

```javascript
// 配置字段解析
module.exports = {
  projectName: 'myProject', // 项目名称
  privateKey: '/Users/username/.ssh/id_rsa', // id_rsa文件路径
  passphrase: '',
  cluster: ['dev','test'], // 集群部署配置，要同时部署多台配置此属性如: ['dev', 'test', 'prod']
  dev: {
    // 环境对象
    name: '开发环境', // 环境名称
    script: 'npm run build', // 打包命令
    host: '192.168.0.1', // 服务器地址
    port: 22, // 服务器端口号
    username: 'root', // 服务器登录用户名
    password: '', // 服务器登录密码
    distPath: 'dist', // 本地打包生成目录
    webDir: '/usr/local/nginx/html', // 服务器部署路径（不可为空或'/'或'/aaa',至少两级目录）
    isBackupRemoteFile: true	// 是否备份远程文件（默认true）
  },
  test: {
    name: '测试环境',
    script: 'npm run build:test',
    host: '192.168.0.1',
    port: 22, 
    username: 'root',
    password: '',
    distPath: 'dist',
    webDir: '/usr/local/nginx/html',
    isBackupRemoteFile: true
  },
  prod: {
    name: '生产环境',
    script: 'npm run build:prod',
    host: '192.168.0.1',
    port: 22,
    username: 'root',
    password: '',
    distPath: 'dist',
    webDir: '/usr/local/nginx/html',
    isBackupRemoteFile: true	
  }
}
```

### 2.6 本地安装扩展

如果使用本地安装命令的话，可以在项目根目录下的 `package.json` 文件中 `scripts` 脚本中添加如下代码

```json
"scripts": {
  "deploy": "deploy-plus d",
  "deploy:dev": "deploy-plus d -b",
  "deploy:test": "deploy-plus d -b -m test",
  "deploy:prod": "deploy-plus d -b -m prod"
}
```

然后使用下面代码也可以完成部署操作

```shell
npm run deploy:dev
```

最后如果大家觉得还不错挺好用的话，麻烦给个 Star 😜😜😜。

