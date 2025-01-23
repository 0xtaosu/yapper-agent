# TAO CT Agent

一个专注于加密货币领域的 Twitter AI 互动机器人，基于 Node.js 开发，使用 DeepSeek API 生成智能、幽默的回复内容。

## 功能特点

- 多账号并行处理推文回复
- 基于 DeepSeek API 的智能回复生成
- Webhook 接口实时接收推文
- CSV 数据持久化存储
- 完善的错误重试机制
- 智能推文过滤（少于66字符自动跳过）
- 防重复回复机制（缓存最近1000条）
- 中英文自动匹配回复

## AI 回复特色

- 风趣幽默的语言风格
- 专业的加密货币领域知识
- 灵活运用加密货币俚语（HODL、FOMO、rekt 等）
- 将复杂概念简单化
- 引发用户互动的表达方式
- 中英文双语支持

## 前置要求

- Node.js (v14.0.0 或更高版本)
- 可访问的服务器（用于接收 Webhook）
- DeepSeek API 密钥
- APIance API 密钥

## 安装

1. 克隆仓库：

```bash
git clone https://github.com/0xtaosu/tao-ct-agent.git
cd tao-ct-agent
```

2. 安装依赖：

```bash
npm install
```

3. 配置账号信息：
   在 `config/accounts.json` 中配置：
   - 账号名称和认证令牌
   - AI 提示词设置
   - 回复延迟范围
   - API 密钥

## 启动服务

```bash
chmod +x start.sh
./start.sh
```

## 工作原理

1. 启动 Webhook 服务器监听推文推送
2. 当收到新推文时：
   - 解析推文数据（ID、内容、时间戳等）
   - 检查是否已经处理过该推文
   - 使用 DeepSeek API 生成专业、有趣的回复内容
   - 发送回复到 Twitter
   - 将处理结果保存到 CSV 文件

## 数据存储

所有推文处理记录保存在 `data/twitter_replies.csv` 文件中，包含以下字段：
- timestamp: 处理时间
- accountName: 处理账号
- tweetId: 推文ID
- tweetContent: 推文内容
- aiResponse: AI回复内容
- isReplied: 是否成功回复

## 项目结构
```
.
├── main.js          # 主程序
├── data/            # 数据存储目录
│   └── twitter_replies.csv
├── .env             # 环境变量配置
├── .env.example     # 环境变量示例
├── README.md
└── package.json
```

## 错误处理

- API 调用失败自动重试（最多3次）
- 推文长度过滤（<66字符自动跳过）
- 重复推文检测（缓存最近1000条）
- 详细的错误日志记录

## 日志记录

- 运行日志位于 `logs/` 目录
- 使用时间戳命名的日志文件
- 包含详细的处理状态和错误信息

## 注意事项

- 定期检查 CSV 文件确保数据正常记录
- 监控 API 使用限制和成本
- 确保服务器能够接收外部 Webhook 请求
- 推荐使用 PM2 等工具保持程序运行

## 许可证

[MIT License](LICENSE)

## 致谢

- [DeepSeek API](https://www.deepseek.com/)
- [APIance](https://apidance.pro/)
