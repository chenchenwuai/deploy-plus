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

根据提示填写内容，会在项目根目录下生成 `.deploy.config.js` 文件，初始化可根据选择的需要部署的环境生成 `dev` (开发环境)、`test` (测试环境)、`prod` (生产环境) 三个配置，再有其他配置可参考模板自行配置。

> 提示：交互输入密码时会自动使用私钥加密，无需手动加密。

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
    passwordEncrypted: false, // password 是否为 deploy-plus 加密后的密文
    distPath: 'dist', // 本地打包生成目录
    webDir: '/usr/local/nginx/html', // 服务器部署路径（不可为空或'/'或'/aaa',至少三级目录）
    isBackupRemoteFile: true, // 是否备份远程文件（默认true）
    isCompressBackup: true // 是否压缩备份文件（默认true）
  },
  test: {
    name: '测试环境',
    script: 'npm run build:test',
    host: '192.168.0.1',
    port: 22, 
    username: 'root',
    password: '',
    passwordEncrypted: false,
    distPath: 'dist',
    webDir: '/usr/local/nginx/html',
    isBackupRemoteFile: true,
    isCompressBackup: true
  },
  prod: {
    name: '生产环境',
    script: 'npm run build:prod',
    host: '192.168.0.1',
    port: 22,
    username: 'root',
    password: '',
    passwordEncrypted: false,
    distPath: 'dist',
    webDir: '/usr/local/nginx/html',
    isBackupRemoteFile: true,
    isCompressBackup: true
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

## 3 使用示例

### 3.1 Vue/React 项目部署示例

假设你有一个 Vue 项目，需要部署到开发服务器和生产服务器。

**第一步：安装并初始化**

```shell
# 在项目根目录下
npm install deploy-plus --save-dev

# 初始化配置文件（使用默认密码 123456）
npx deploy-plus init -fy 123456
```

**第二步：修改配置文件 `.deploy.config.js`**

```javascript
module.exports = {
  projectName: 'my-vue-app',
  privateKey: '/Users/yourname/.ssh/id_rsa',
  passphrase: '',
  cluster: [],
  dev: {
    name: '开发环境',
    script: 'npm run build:dev',
    host: '192.168.1.100',
    port: 22,
    username: 'root',
    password: 'xxxxxx', // 使用 deploy-plus e 123456 生成的加密字符串
    passwordEncrypted: true,
    distPath: 'dist',
    webDir: '/var/www/my-vue-app',
    isBackupRemoteFile: true,
    isCompressBackup: true
  },
  prod: {
    name: '生产环境',
    script: 'npm run build:prod',
    host: '10.0.0.50',
    port: 22,
    username: 'deploy',
    password: 'xxxxxx',
    passwordEncrypted: true,
    distPath: 'dist',
    webDir: '/var/www/my-vue-app',
    isBackupRemoteFile: true,
    isCompressBackup: true
  }
}
```

**第三步：执行部署**

```shell
# 部署到开发环境（不执行打包，适合已打包的情况）
npx deploy-plus d

# 部署到开发环境（先打包再部署）
npx deploy-plus d -b

# 部署到生产环境（先打包再部署，跳过确认提示）
npx deploy-plus d -by -m prod
```

### 3.2 集群部署示例

同时部署到多台服务器：

```javascript
// .deploy.config.js
module.exports = {
  projectName: 'my-app',
  privateKey: '/Users/yourname/.ssh/id_rsa',
  cluster: ['dev', 'test'], // 指定要同时部署的环境
  dev: {
    name: '开发服务器1',
    host: '192.168.1.101',
    // ... 其他配置
  },
  test: {
    name: '开发服务器2', 
    host: '192.168.1.102',
    // ... 其他配置
  }
}
```

```shell
# 执行集群部署（会依次部署到 dev 和 test）
npx deploy-plus d -c -b
```

### 3.3 使用 SSH 密钥认证（免密码）

如果服务器已配置 SSH 密钥认证，可以不设置密码：

```javascript
module.exports = {
  projectName: 'my-app',
  privateKey: '/Users/yourname/.ssh/id_rsa', // 确保此私钥已添加到服务器
  passphrase: '', // 私钥密码，没有则留空
  dev: {
    name: '开发环境',
    host: '192.168.1.100',
    port: 22,
    username: 'root',
    password: '', // 留空，使用密钥认证
    passwordEncrypted: false,
    distPath: 'dist',
    webDir: '/var/www/html',
    isBackupRemoteFile: false, // 不备份远程文件
    isCompressBackup: false
  }
}
```

### 3.4 完整工作流示例

```shell
# 1. 初始化配置
deploy-plus init

# 2. 加密密码并填入配置
deploy-plus encrypt your-server-password

# 3. 部署前先测试配置（不打包，手动确认）
deploy-plus d -m dev

# 4. 正式部署（打包 + 部署 + 跳过确认）
deploy-plus d -by -m prod
```

## 4 常见问题

### Q: 部署失败提示 "ssh连接失败"
- 检查服务器地址、端口、用户名是否正确
- 检查密码是否正确加密
- 检查私钥文件路径是否存在

### Q: 部署失败提示 "webDir 配置不正确"
- `webDir` 必须是至少三级的绝对路径，如 `/var/www/html`
- 不能是 `/` 或 `/var` 这样的少于三级的目录（安全限制）

### Q: 如何查看加密后的密码对应的原始密码？
```shell
deploy-plus e -d 加密字符串
```

### Q: 备份文件太大怎么办？
- 设置 `isCompressBackup: true` 会将备份压缩为 `.tar.gz` 文件
- 设置 `isBackupRemoteFile: false` 可以关闭备份功能

### Q: 备份文件在哪里？
- 备份文件位于 `webDir` 的同级目录，命名格式为 `{webDir}_backup_{YYYYMMDD_HHmmss}.tar.gz`

最后如果大家觉得还不错挺好用的话，麻烦给个 Star 😜😜😜。
