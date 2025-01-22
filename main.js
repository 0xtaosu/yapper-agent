require('dotenv').config();
const fetch = require('node-fetch');
const axios = require('axios');
const express = require('express');
const fs = require('fs');
const path = require('path');

class TwitterAccount {
    constructor(config, commonConfig) {
        this.config = config;
        this.commonConfig = commonConfig;
        this.processedTweets = new Set();
        console.log(`🤖 初始化 Twitter 账号: ${config.name}`);
    }

    async getDeepSeekResponse(tweetContent, retryCount = 0) {
        try {
            if (retryCount >= this.commonConfig.maxRetries) {
                throw new Error('超过最大重试次数');
            }

            console.log(`🤖 [${this.config.name}] 正在为推文生成 AI 回复:`, tweetContent);
            const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
                model: "deepseek-chat",
                messages: [{
                    role: "user",
                    content: `${this.config.prompt}
                             
                             Tweet to respond to: "${tweetContent}"
                             
                             Guidelines:
                             - Stay under 280 characters
                             - Match the tweet's language (Chinese/English)
                             - Make it engaging and shareable`
                }],
                max_tokens: 150,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${this.commonConfig.apiKeys.deepseek}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            const aiResponse = response.data.choices[0].message.content;
            console.log(`✨ [${this.config.name}] AI 回复生成成功:`, aiResponse);
            return aiResponse;

        } catch (error) {
            console.error(`❌ [${this.config.name}] DeepSeek API 错误 (尝试 ${retryCount + 1}/${this.commonConfig.maxRetries}):`, error.message);

            if (error.response?.status === 429 || error.code === 'ECONNRESET') {
                await new Promise(resolve => setTimeout(resolve, this.commonConfig.retryDelay));
                return this.getDeepSeekResponse(tweetContent, retryCount + 1);
            }

            throw error;
        }
    }

    async sendTweet(text, replyToId = null, retryCount = 0) {
        try {
            if (retryCount >= this.commonConfig.maxRetries) {
                throw new Error('超过最大重试次数');
            }

            const tweetEndpoint = 'https://api2.apidance.pro/graphql/CreateTweet';
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

            const response = await fetch(tweetEndpoint, {
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

            return await response.text();

        } catch (error) {
            console.error(`❌ [${this.config.name}] Tweet error (尝试 ${retryCount + 1}/${this.commonConfig.maxRetries}):`, error);

            if (error.response?.status === 429 || error.code === 'ECONNRESET') {
                await new Promise(resolve => setTimeout(resolve, this.commonConfig.retryDelay));
                return this.sendTweet(text, replyToId, retryCount + 1);
            }

            throw error;
        }
    }

    async randomDelay() {
        const delay = Math.floor(
            Math.random() * (this.config.maxDelay - this.config.minDelay + 1) +
            this.config.minDelay
        );
        console.log(`⏳ [${this.config.name}] 等待 ${delay} 秒后回复...`);
        await new Promise(resolve => setTimeout(resolve, delay * 1000));
    }

    async processTweet(tweetData) {
        try {
            if (this.processedTweets.has(tweetData.tweet_id)) {
                console.log(`⏭️ [${this.config.name}] 跳过已处理的推文: ${tweetData.tweet_id}`);
                return;
            }

            console.log(`\n📝 [${this.config.name}] 处理推文: ${tweetData.tweet_id}`);
            console.log(`内容: ${tweetData.tweet_content}`);

            if (!tweetData.tweet_content || tweetData.tweet_content.trim().length === 0) {
                throw new Error('推文内容为空');
            }

            const aiResponse = await this.getDeepSeekResponse(tweetData.tweet_content);
            if (!aiResponse) {
                throw new Error('生成 AI 回复失败');
            }

            await this.randomDelay();

            await this.sendTweet(aiResponse, tweetData.tweet_id);
            console.log(`✅ [${this.config.name}] 回复发送成功`);

            this.processedTweets.add(tweetData.tweet_id);

            if (this.processedTweets.size > 1000) {
                const iterator = this.processedTweets.values();
                for (let i = 0; i < 100; i++) {
                    this.processedTweets.delete(iterator.next().value);
                }
            }

            return {
                timestamp: new Date().toISOString(),
                accountName: this.config.name,
                tweetId: tweetData.tweet_id,
                tweetContent: tweetData.tweet_content,
                aiResponse,
                isReplied: true
            };

        } catch (error) {
            console.error(`❌ [${this.config.name}] 处理推文失败:`, error);
            return {
                timestamp: new Date().toISOString(),
                accountName: this.config.name,
                tweetId: tweetData.tweet_id,
                tweetContent: tweetData.tweet_content,
                aiResponse: error.message,
                isReplied: false
            };
        }
    }
}

class TwitterReplyBot {
    constructor() {
        console.log('🤖 初始化 Twitter Reply Bot...');
        this.loadConfig();
        this.initAccounts();
        this.initCsvFile();
        this.initWebhook();
    }

    loadConfig() {
        const configPath = path.join(__dirname, 'config', 'accounts.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        this.config = config;
    }

    initAccounts() {
        this.accounts = this.config.accounts.map(accountConfig =>
            new TwitterAccount(accountConfig, this.config.common)
        );
    }

    initCsvFile() {
        const csvHeader = 'timestamp,account_name,tweet_id,tweet_content,ai_response,is_replied\n';
        const dataDir = './data';
        this.csvPath = `${dataDir}/twitter_replies.csv`;

        try {
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir);
            }

            if (!fs.existsSync(this.csvPath)) {
                fs.writeFileSync(this.csvPath, csvHeader);
                console.log('✅ CSV文件初始化成功');
            }
        } catch (error) {
            console.error('❌ CSV文件初始化失败:', error);
            process.exit(1);
        }
    }

    saveTweetData(data) {
        const escapeCsv = (text) => {
            if (typeof text !== 'string') return text;
            return `"${text.replace(/"/g, '""')}"`;
        };

        const csvLine = `${data.timestamp},${data.accountName},${data.tweetId},${escapeCsv(data.tweetContent)},${escapeCsv(data.aiResponse)},${data.isReplied}\n`;

        try {
            fs.appendFileSync(this.csvPath, csvLine);
            console.log(`✅ [${data.accountName}] 数据已保存到CSV`);
        } catch (error) {
            console.error(`❌ [${data.accountName}] 保存数据失败:`, error);
        }
    }

    initWebhook() {
        const app = express();
        app.use(express.json());

        app.post('/webhook/twitter', async (req, res) => {
            try {
                console.log("=== 收到新的 Webhook 请求 ===");
                console.log("请求数据:", JSON.stringify(req.body, null, 2));

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
                        this.saveTweetData(result);
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

// Start the bot
console.log('🤖 Twitter Reply Bot Starting...');
const bot = new TwitterReplyBot();
bot.start().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
});
