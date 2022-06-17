const { deployConfigPath, deployConfigFileName } = require('../config')
const {checkDeployConfigExists, rsaEncrypt, rsaDecrypt, succeed, error } = require('../utils')
module.exports = {
  description: `加解密, 在命令后面附上要加解密的字符串，例如 \n"deploy-plus encrypt password" \n"deploy-plus e -d xxxxxxxx"`,
  /**
   * 
   * @param {*} decrypt  -d 解密
   */
  apply: (args, decrypt) => {
    let isExist = checkDeployConfigExists()
    if (!isExist) {
      error(`${deployConfigFileName} 配置文件不存在`)
      process.exit(1)
    } else if(!args || !args[0]){
      error(`没有要${decrypt ? '解':'加'}密的信息`)
      process.exit(1)
    }else {
      const data = args[0]
      const config = require(deployConfigPath)
      const keyFile = config.privateKey
      if(decrypt){
        try {
          const res = rsaDecrypt(data,keyFile)
          succeed(`解密成功，结果如下`)
          console.log(res)
          process.exit(0)
        } catch (e) {
          error(`解密失败: ${e.message}`)
          process.exit(1)
        }
      }else{
        try {
          const res = rsaEncrypt(data,keyFile)
          succeed(`加密成功，结果如下`)
          console.log(res)
          process.exit(0)
        } catch (e) {
          error(`加密失败: ${e.message}`)
          process.exit(1)
        }
      }
    }
  }
}
