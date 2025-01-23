#!/bin/bash

# 确保日志目录存在
mkdir -p logs

# 获取当前时间戳
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# 启动机器人并将输出重定向到日志文件
nohup node main.js > logs/bot_${TIMESTAMP}.log 2>&1 &

# 获取进程 ID
PID=$!

# 将 PID 保存到文件中
echo $PID > .pid

# 输出启动信息
echo "Twitter Reply Bot 已在后台启动"
echo "PID: $PID"
echo "日志文件: logs/bot_${TIMESTAMP}.log"
echo "查看日志: tail -f logs/bot_${TIMESTAMP}.log"
