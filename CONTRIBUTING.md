# Contributing to HybridBox

感谢您对 HybridBox 的兴趣！

## 提交 Issue

- 请描述清楚问题的复现步骤
- 附上终端输出和日志（`%USERPROFILE%\.hybridbox\logs\` 下的日志文件）
- 如果是微信连接问题，请说明是否成功扫码登录、终端是否有 `getUpdates` 输出

## 提交 Pull Request

1. Fork 本仓库
2. 创建新分支：`git checkout -b feature/your-feature-name`
3. 修改代码，确保 `npm test` 通过
4. 提交 PR，说明修改内容和原因

## 开发规范

- 使用 TypeScript，严格模式已开启
- 代码风格：保持一致即可，暂无强制 formatter
- 自测脚本：`npm test`（必须全部通过）
