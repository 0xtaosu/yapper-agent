require('dotenv').config();
const fetch = require('node-fetch');
const axios = require('axios');
const express = require('express');
const app = express();

class TwitterReplyBot {
    constructor() {
        console.log('🤖 初始化 Twitter Reply Bot...');
        this.processedTweets = new Set();
        this.MAX_RETRIES = 3;  // 添加重试次数限制
        this.RETRY_DELAY = 2000;  // 重试延迟时间（毫秒）

        // 添加回复延迟配置（单位：秒）
        this.MIN_REPLY_DELAY = 5;  // 最小等待时间
        this.MAX_REPLY_DELAY = 60; // 最大等待时间

        this.initCsvFile();
        this.initWebhook();
    }

    /**
     * 初始化CSV文件
     * 创建用于存储推文数据的CSV文件
     */
    initCsvFile() {
        const fs = require('fs');
        const csvHeader = 'timestamp,tweet_id,tweet_content,ai_response,is_replied\n';
        const dataDir = './data';
        this.csvPath = `${dataDir}/twitter_replies.csv`;

        try {
            // 创建数据目录
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir);
            }

            // 如果文件不存在，创建并写入表头
            if (!fs.existsSync(this.csvPath)) {
                fs.writeFileSync(this.csvPath, csvHeader);
                console.log('✅ CSV文件初始化成功');
            }
        } catch (error) {
            console.error('❌ CSV文件初始化失败:', error);
            process.exit(1);
        }
    }

    /**
     * 保存推文数据到CSV
     * @param {Object} data - 推文数据对象
     */
    saveTweetData(data) {
        const fs = require('fs');
        const { timestamp, tweetId, tweetContent, aiResponse, isReplied } = data;

        // 转义CSV中的逗号和换行符
        const escapeCsv = (text) => {
            if (typeof text !== 'string') return text;
            return `"${text.replace(/"/g, '""')}"`;
        };

        const csvLine = `${timestamp},${tweetId},${escapeCsv(tweetContent)},${escapeCsv(aiResponse)},${isReplied}\n`;

        try {
            fs.appendFileSync(this.csvPath, csvLine);
            console.log('✅ 数据已保存到CSV');
        } catch (error) {
            console.error('❌ 保存数据失败:', error);
        }
    }

    /**
     * 调用 DeepSeek API 获取 AI 回复
     * @param {string} tweetContent - 需要回复的推文内容
     * @returns {Promise<string|null>} AI 生成的回复或 null（如果发生错误）
     */
    async getDeepSeekResponse(tweetContent, retryCount = 0) {
        try {
            if (retryCount >= this.MAX_RETRIES) {
                throw new Error('超过最大重试次数');
            }

            console.log('🤖 正在为推文生成 AI 回复:', tweetContent);
            const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
                model: "deepseek-chat",
                messages: [{
                    role: "user",
                    content: `You are a crypto-savvy social media influencer known for witty, engaging responses.
                             Respond to this tweet in the same language (Chinese or English) it's written in: "${tweetContent}"
                             
                             Guidelines:
                             - Use crypto slang (HODL, FOMO, rekt, etc.) when appropriate
                             - Keep it fun and memorable, but informative
                             - Include emojis strategically
                             - Make complex concepts simple and relatable
                             - Encourage engagement through humor or thought-provoking insights
                             - Stay under 280 characters
                             - Match the tweet's language (Chinese/English)
                             
                             Make your response so engaging that people can't help but like, retweet, or reply!`
                }],
                max_tokens: 150,
                temperature: 0.7  // 添加温度参数以控制创造性
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000  // 添加超时设置
            });

            const aiResponse = response.data.choices[0].message.content;
            console.log('✨ AI 回复生成成功:', aiResponse);
            return aiResponse;

        } catch (error) {
            console.error(`❌ DeepSeek API 错误 (尝试 ${retryCount + 1}/${this.MAX_RETRIES}):`, error.message);

            if (error.response?.status === 429 || error.code === 'ECONNRESET') {
                await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
                return this.getDeepSeekResponse(tweetContent, retryCount + 1);
            }

            throw error;
        }
    }

    /**
     * 发送推文或回复
     * @param {string} text - 推文内容
     * @param {string|null} replyToId - 要回复的推文 ID
     * @returns {Promise<string>} API 响应结果
     */
    async sendTweet(text, replyToId = null, retryCount = 0) {
        try {
            if (retryCount >= this.MAX_RETRIES) {
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
                    'apikey': process.env.APIDANCE_API_KEY,
                    'AuthToken': process.env.TWITTER_AUTH_TOKEN,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                timeout: 10000  // 添加超时设置
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.text();

        } catch (error) {
            console.error(`❌ Tweet error (尝试 ${retryCount + 1}/${this.MAX_RETRIES}):`, error);

            if (error.response?.status === 429 || error.code === 'ECONNRESET') {
                await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
                return this.sendTweet(text, replyToId, retryCount + 1);
            }

            throw error;
        }
    }

    /**
     * 初始化webhook服务
     */
    initWebhook() {
        app.use(express.json());

        app.post('/webhook/twitter', async (req, res) => {
            try {
                console.log("=== 收到新的 Webhook 请求 ===");
                console.log("请求数据:", JSON.stringify(req.body, null, 2));

                const tweetData = this.extractTweetData(req.body);
                await this.processTweet(tweetData);

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

    /**
     * 从webhook数据中提取推文信息
     * @param {Object} data - webhook推送的数据
     * @returns {Object} 处理后的推文数据
     */
    extractTweetData(webhookData) {
        return {
            timestamp: new Date().toISOString(),
            tweet_id: webhookData.tweet.tweet_id,
            tweet_content: webhookData.tweet.text,
            ai_response: "",
            is_replied: false
        };
    }

    // 添加随机延迟函数
    async randomDelay() {
        const delay = Math.floor(
            Math.random() * (this.MAX_REPLY_DELAY - this.MIN_REPLY_DELAY + 1) +
            this.MIN_REPLY_DELAY
        );
        console.log(`⏳ 等待 ${delay} 秒后回复...`);
        await new Promise(resolve => setTimeout(resolve, delay * 1000));
    }

    /**
     * 处理单条推文
     * @param {Object} tweetData - 推文数据
     */
    async processTweet(tweetData) {
        try {
            if (this.processedTweets.has(tweetData.tweet_id)) {
                console.log(`⏭️ 跳过已处理的推文: ${tweetData.tweet_id}`);
                return;
            }

            console.log(`\n📝 处理推文: ${tweetData.tweet_id}`);
            console.log(`内容: ${tweetData.tweet_content}`);

            // 内容检查
            if (!tweetData.tweet_content || tweetData.tweet_content.trim().length === 0) {
                throw new Error('推文内容为空');
            }

            // 生成 AI 回复
            const aiResponse = await this.getDeepSeekResponse(tweetData.tweet_content);
            if (!aiResponse) {
                throw new Error('生成 AI 回复失败');
            }

            // 添加随机延迟
            await this.randomDelay();

            // 发送回复
            await this.sendTweet(aiResponse, tweetData.tweet_id);
            console.log('✅ 回复发送成功');

            this.processedTweets.add(tweetData.tweet_id);

            // 限制缓存大小
            if (this.processedTweets.size > 1000) {
                const iterator = this.processedTweets.values();
                for (let i = 0; i < 100; i++) {
                    this.processedTweets.delete(iterator.next().value);
                }
            }

            this.saveTweetData({
                timestamp: tweetData.timestamp,
                tweetId: tweetData.tweet_id,
                tweetContent: tweetData.tweet_content,
                aiResponse,
                isReplied: true
            });

        } catch (error) {
            console.error('❌ 处理推文失败:', error);
            this.saveTweetData({
                ...tweetData,
                aiResponse: error.message,
                isReplied: false
            });
        }
    }

    /**
     * 启动机器人
     */
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
