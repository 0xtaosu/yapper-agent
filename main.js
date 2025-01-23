/**
 * Twitter Reply Bot
 * 一个自动回复 Twitter 推文的机器人系统
 * 
 * 功能特点:
 * - 支持多账号并行处理
 * - AI 驱动的智能回复
 * - Webhook 接口接收推文
 * - CSV 数据持久化
 * - 错误重试机制
 */

require('dotenv').config();
const fetch = require('node-fetch');
const express = require('express');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

/**
 * TwitterAccount 类
 * 处理单个 Twitter 账号的所有操作
 */
class TwitterAccount {
    /**
     * @param {Object} config - 账号配置
     * @param {Object} commonConfig - 通用配置
     * @param {string} csvPath - CSV 文件路径
     */
    constructor(config, commonConfig, csvPath) {
        this.config = config;
        this.commonConfig = commonConfig;
        this.csvPath = csvPath;
        this.processedTweets = new Set();  // 已处理推文的缓存
        this.logger = this.initLogger();

        // 初始化 DeepSeek API 客户端
        this.openai = new OpenAI({
            baseURL: 'https://api.deepseek.com/v1',
            apiKey: this.commonConfig.apiKeys.deepseek
        });

        this.logger.info('账号初始化完成');
    }

    /**
     * 初始化日志记录器
     */
    initLogger() {
        const logPrefix = `[${this.config.name}]`;
        return {
            info: (msg, ...args) => console.log(`ℹ️ ${logPrefix} ${msg}`, ...args),
            error: (msg, ...args) => console.error(`❌ ${logPrefix} ${msg}`, ...args),
            success: (msg, ...args) => console.log(`✅ ${logPrefix} ${msg}`, ...args),
            wait: (msg, ...args) => console.log(`⏳ ${logPrefix} ${msg}`, ...args)
        };
    }

    /**
     * 构建 AI 提示词
     * @param {string} tweetContent - 需要回复的推文内容
     * @returns {Array} - 包含 system 和 user 提示词的消息数组
     */
    buildPrompt(tweetContent) {
        return [
            {
                role: "system",
                content: this.config.prompt
            },
            {
                role: "user",
                content: `"${tweetContent}"`
            }
        ];
    }

    /**
     * 生成 AI 回复
     */
    async getDeepSeekResponse(tweetContent, retryCount = 0) {
        try {
            if (retryCount >= this.commonConfig.maxRetries) {
                throw new Error('超过最大重试次数');
            }

            this.logger.info('正在生成 AI 回复:', tweetContent);

            const completion = await this.openai.chat.completions.create({
                model: "deepseek-reasoner",
                messages: this.buildPrompt(tweetContent),
                max_tokens: 150,
                temperature: 1.3,
                stream: false
            });

            const aiResponse = completion.choices[0].message.content;
            this.logger.success('AI 回复生成成功:', aiResponse);
            return aiResponse;

        } catch (error) {
            return await this.handleApiError(error, retryCount, tweetContent);
        }
    }

    /**
     * 处理 API 错误
     */
    async handleApiError(error, retryCount, tweetContent) {
        this.logger.error(`API 错误 (尝试 ${retryCount + 1}/${this.commonConfig.maxRetries}):`, error.message);

        if (this.shouldRetry(error) && retryCount < this.commonConfig.maxRetries) {
            await this.delay(this.commonConfig.retryDelay);
            return this.getDeepSeekResponse(tweetContent, retryCount + 1);
        }

        throw error;
    }

    /**
     * 判断是否需要重试
     */
    shouldRetry(error) {
        return error.response?.status === 429 || error.code === 'ECONNRESET';
    }

    /**
     * 延迟执行
     */
    async delay(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 随机延迟
     */
    async randomDelay() {
        const delay = Math.floor(
            Math.random() * (this.config.maxDelay - this.config.minDelay + 1) +
            this.config.minDelay
        );
        this.logger.wait(`等待 ${delay} 秒后回复...`);
        await this.delay(delay * 1000);
    }

    /**
     * 验证推文有效性
     * @param {Object} tweetData - 推文数据
     * @returns {boolean} - 是否有效
     */
    isValidTweet(tweetData) {
        // 检查推文内容是否存在且不为空
        if (!tweetData.tweet_content || !tweetData.tweet_content.trim()) {
            this.logger.info('推文内容为空，跳过处理');
            return false;
        }

        // 检查推文长度是否满足最小要求
        const minLength = 20;
        if (tweetData.tweet_content.trim().length < minLength) {
            this.logger.info(`推文内容少于${minLength}个字符，跳过处理`);
            return false;
        }

        return true;
    }

    /**
     * 处理单条推文
     */
    async processTweet(tweetData) {
        try {
            // 检查是否已处理过
            if (this.processedTweets.has(tweetData.tweet_id)) {
                this.logger.info(`跳过已处理的推文: ${tweetData.tweet_id}`);
                return;
            }

            this.logger.info(`开始处理推文: ${tweetData.tweet_id}`);
            this.logger.info(`推文内容: ${tweetData.tweet_content}`);

            // 验证推文
            if (!this.isValidTweet(tweetData)) {
                return this.buildResponseData(tweetData, '推文内容无效', false);
            }

            // 生成回复
            const aiResponse = await this.getDeepSeekResponse(tweetData.tweet_content);
            if (!aiResponse) {
                throw new Error('生成 AI 回复失败');
            }

            // 随机延迟后发送
            await this.randomDelay();
            await this.sendTweet(aiResponse, tweetData.tweet_id);

            // 记录处理状态
            this.processedTweets.add(tweetData.tweet_id);
            this.cleanupProcessedTweets();

            return this.buildResponseData(tweetData, aiResponse, true);

        } catch (error) {
            this.logger.error('处理推文失败:', error);
            return this.buildResponseData(tweetData, error.message, false);
        }
    }

    /**
     * 清理已处理推文记录
     */
    cleanupProcessedTweets() {
        if (this.processedTweets.size > 1000) {
            const iterator = this.processedTweets.values();
            for (let i = 0; i < 100; i++) {
                this.processedTweets.delete(iterator.next().value);
            }
            this.logger.info('已清理部分历史记录');
        }
    }

    /**
     * 构建响应数据
     */
    buildResponseData(tweetData, aiResponse, isReplied) {
        return {
            timestamp: new Date().toISOString(),
            accountName: this.config.name,
            tweetId: tweetData.tweet_id,
            tweetContent: tweetData.tweet_content,
            aiResponse,
            isReplied
        };
    }

    /**
     * 发送推文到 Twitter
     * @param {string} text - 回复内容
     * @param {string} replyToId - 被回复推文的 ID
     * @param {number} retryCount - 当前重试次数
     * @returns {Promise<string>} - API 响应
     */
    async sendTweet(text, replyToId = null, retryCount = 0) {
        try {
            if (retryCount >= this.commonConfig.maxRetries) {
                throw new Error('超过最大重试次数');
            }

            this.logger.info('准备发送推文回复');
            const tweetEndpoint = 'https://api2.apidance.pro/graphql/CreateTweet';

            // 构建请求负载
            const payload = this._buildTweetPayload(text, replyToId);

            // 发送请求
            const response = await this._sendTweetRequest(tweetEndpoint, payload);

            this.logger.success('推文发送成功');
            return await response.text();

        } catch (error) {
            return await this._handleSendTweetError(error, text, replyToId, retryCount);
        }
    }

    /**
     * 构建推文请求负载
     * @private
     */
    _buildTweetPayload(text, replyToId) {
        const payload = {
            variables: {
                tweet_text: text,
                dark_request: false,
                semantic_annotation_ids: []
            }
        };

        if (replyToId) {
            payload.variables.reply = {
                in_reply_to_tweet_id: replyToId,
                exclude_reply_user_ids: []
            };
        }

        return payload;
    }

    /**
     * 发送推文请求
     * @private
     */
    async _sendTweetRequest(endpoint, payload) {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'apikey': this.commonConfig.apiKeys.apidance,
                'AuthToken': this.config.authToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            timeout: 10000
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response;
    }

    /**
     * 处理发送推文错误
     * @private
     */
    async _handleSendTweetError(error, text, replyToId, retryCount) {
        this.logger.error(`发送推文失败 (尝试 ${retryCount + 1}/${this.commonConfig.maxRetries}):`, error);

        if (this.shouldRetry(error)) {
            await this.delay(this.commonConfig.retryDelay);
            return this.sendTweet(text, replyToId, retryCount + 1);
        }

        throw error;
    }

    /**
     * 保存推文数据到 CSV
     */
    saveTweetData(data) {
        const escapeCsv = (text) => {
            if (typeof text !== 'string') return text;
            if (text.includes(',') || text.includes('\n') || text.includes('"')) {
                return `"${text.replace(/"/g, '""')}"`;
            }
            return text;
        };

        const csvLine = `${data.timestamp},${data.accountName},${data.tweetId},${escapeCsv(data.tweetContent)},${escapeCsv(data.aiResponse)},${data.isReplied}\n`;

        try {
            fs.appendFileSync(this.csvPath, csvLine);
            this.logger.success('数据已保存到CSV');
        } catch (error) {
            this.logger.error('保存数据失败:', error);
        }
    }
}

/**
 * TwitterReplyBot 类
 * 管理整个机器人系统
 */
class TwitterReplyBot {
    constructor() {
        console.log('🤖 初始化 Twitter Reply Bot...');
        this._init();
    }

    /**
     * 初始化所有组件
     * @private
     */
    _init() {
        this.loadConfig();
        this.initCsvFile();
        this.initAccounts();
        this.initWebhook();
    }

    loadConfig() {
        try {
            const configPath = path.join(__dirname, 'config', 'accounts.json');
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            this.config = config;
        } catch (error) {
            console.error('❌ 加载配置文件失败:', error);
            process.exit(1);
        }
    }

    initCsvFile() {
        const dataDir = path.join(__dirname, 'data');
        this.csvPath = path.join(dataDir, 'twitter_replies.csv');

        try {
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir);
            }

            if (!fs.existsSync(this.csvPath)) {
                const header = 'timestamp,accountName,tweetId,tweetContent,aiResponse,isReplied\n';
                fs.writeFileSync(this.csvPath, header);
            }
            console.log('✅ CSV文件初始化成功');
        } catch (error) {
            console.error('❌ CSV文件初始化失败:', error);
            process.exit(1);
        }
    }

    initAccounts() {
        this.accounts = this.config.accounts.map(accountConfig =>
            new TwitterAccount(accountConfig, this.config.common, this.csvPath)
        );
    }

    initWebhook() {
        const app = express();
        app.use(express.json());

        app.post('/webhook/twitter', async (req, res) => {
            try {
                console.log("=== 收到新的 Webhook 请求 ===");

                if (!req.body?.tweet?.text) {
                    throw new Error('无效的推文数据');
                }

                const tweetData = {
                    tweet_id: req.body.tweet.tweet_id,
                    tweet_content: req.body.tweet.text
                };

                // 并行处理所有账号的回复
                const results = await Promise.all(
                    this.accounts.map(account => account.processTweet(tweetData))
                );

                // 保存所有账号的处理结果
                results.forEach(result => {
                    if (result) {
                        // 使用账号实例的 saveTweetData 方法
                        const account = this.accounts.find(acc => acc.config.name === result.accountName);
                        if (account) {
                            account.saveTweetData(result);
                        }
                    }
                });

                res.json({
                    status: "success",
                    message: "Data processed and saved",
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.error('❌ Webhook处理错误:', error);
                res.status(500).json({
                    status: "error",
                    message: error.message
                });
            }
        });

        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => {
            console.log(`🚀 Webhook服务器运行在端口 ${PORT}`);
        });
    }

    async start() {
        try {
            console.log('\n🚀 机器人启动中...');
            console.log('📡 等待 Webhook 推送数据...');
        } catch (error) {
            console.error('❌ 致命错误:', error.message);
            process.exit(1);
        }
    }
}

// 启动机器人
console.log('🤖 Twitter Reply Bot Starting...');
const bot = new TwitterReplyBot();
bot.start().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
});
