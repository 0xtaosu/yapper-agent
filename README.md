# TAO CT Agent

一个专注于加密货币领域的 Twitter AI 互动机器人，基于 Node.js 开发，使用 DeepSeek API 生成智能、幽默的回复内容。

## 功能特点

- 通过 Webhook 接收实时推文更新
- 使用 DeepSeek API 生成加密货币领域的专业回复
- 支持加密货币俚语和专业术语
- 智能匹配中英文回复
- 自动记录处理状态到 CSV 文件
- 防重复回复机制
- 完善的错误处理和日志记录

## AI 回复特色

- 风趣幽默的语言风格
- 专业的加密货币领域知识
- 灵活运用加密货币俚语（HODL、FOMO、rekt 等）
- 将复杂概念简单化
- 引发用户互动的表达方式
- 中英文双语支持

## 前置要求

- Node.js (v14.0.0 或更高版本)
- Twitter 账号
- DeepSeek API 密钥
- 可访问的服务器（用于接收 Webhook）

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

3. 配置环境变量：
   - 复制 `.env.example` 到 `.env`
   - 填写必要的配置信息：
     - `DEEPSEEK_API_KEY`: DeepSeek API 密钥
     - `APIDANCE_API_KEY`: APIance API 密钥
     - `TWITTER_AUTH_TOKEN`: Twitter 认证令牌
     - `PORT`: Webhook 服务器端口（默认 5000）

## 使用方法

1. 确保所有配置都已正确设置
2. 运行机器人：

```bash
node main.js
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

所有推文处理记录都保存在 `./data/twitter_replies.csv` 文件中，包含以下字段：
- timestamp: 处理时间
- tweet_id: 推文 ID
- tweet_content: 推文内容
- ai_response: AI 生成的回复
- is_replied: 是否成功回复

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

## 注意事项

- 确保服务器能够接收外部 Webhook 请求
- 推荐使用 PM2 等工具保持程序运行
- 定期检查 CSV 文件确保数据正常记录
- 注意 API 使用限制和成本
- 遵守 Twitter 的使用规范

## 错误处理

- 所有错误都会记录到控制台
- 处理失败的推文也会记录到 CSV 文件
- 程序会自动跳过已处理的推文

## 贡献

欢迎提交 Issues 和 Pull Requests 来改进这个项目。

## 许可证

[MIT License](LICENSE)

## 致谢

- [DeepSeek API](https://www.deepseek.com/)
