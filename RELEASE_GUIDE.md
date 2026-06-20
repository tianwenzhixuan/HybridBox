# HybridBox 发布指南

本文档指导你如何将 HybridBox 发布到 GitHub，并建立持续集成。

---

## 一、准备工作

### 1. 注册 GitHub 账号

1. 访问 https://github.com
2. 点击右上角 **Sign up**
3. 输入邮箱、密码、用户名（这就是你的 GitHub ID，其他人会通过 `github.com/你的用户名` 访问你的主页）
4. 按提示完成验证（可能需要邮箱验证和真人测试）
5. 记住你的用户名，后面会用到

### 2. 创建新仓库

1. 登录 GitHub 后，点击右上角 **+** → **New repository**
2. 仓库名填写：`hybridbox`
3. 描述填写：`Remote-control Claude Code on Windows via WeChat`
4. 选择 **Public**（公开）或 **Private**（私有）
5. 勾选 **Add a README file**（可选，因为我们已经写好了）
6. 点击 **Create repository**

### 3. 配置本地 Git

打开 PowerShell：

```powershell
# 设置 Git 用户名和邮箱（只用设置一次）
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"

# 生成 SSH 密钥（只用设置一次，方便后续推送）
ssh-keygen -t ed25519 -C "你的邮箱"
# 按回车三次，默认保存位置

# 查看公钥内容，复制后贴到 GitHub
cat ~/.ssh/id_ed25519.pub
# 复制输出的内容
```

回到 GitHub：
1. 点击右上角头像 → **Settings**
2. 左侧选择 **SSH and GPG keys**
3. 点击 **New SSH key**
4. 标题随便写（如 `Windows PC`），把刚才复制的公钥贴进去
5. 点击 **Add SSH key**

### 4. 上传代码

```powershell
cd D:\Claude\proj\HybridBox

# 初始化 Git 仓库（如果还没做）
git init

# 添加所有文件
git add .

# 提交到本地
git commit -m "feat: initial release of HybridBox

- WeChat ClawBot integration via ilink API
- Claude Code stream-json output parsing
- Bidirectional file transfer
- Session management with resume support
- PM2 daemon mode
- Windows native support"

# 连接远程仓库（将 your-username 替换为你的 GitHub 用户名）
git remote add origin git@github.com:你的用户名/hybridbox.git

# 推送到 GitHub
git branch -M main
git push -u origin main
```

推送成功后，打开 `https://github.com/你的用户名/hybridbox` 即可看到代码。

---

## 二、GitHub Actions 自动测试

我们已经配置好了 `.github/workflows/ci.yml`，每次你推送代码到 GitHub 时，GitHub 会自动运行测试。

### 如何查看 CI 结果

1. 打开你的 GitHub 仓库页面
2. 点击顶部的 **Actions** 标签
3. 可以看到每次提交触发的测试运行记录
4. 绿色 ✓ 表示通过，红色 ✗ 表示失败

### CI 会做什么

- 在 Ubuntu 和 Windows 上分别运行
- 安装依赖 `npm ci`
- 编译 TypeScript `npm run build`
- 运行自测 `npm test`
- 检查编译产物是否存在

---

## 三、发布版本（Release）

当你想标记一个稳定版本时：

### 1. 打 Git 标签

```powershell
cd D:\Claude\proj\HybridBox

# 更新版本号（修改 package.json 中的 version 字段）
# 然后提交
git add package.json

git commit -m "chore: bump version to 0.1.0"

# 打标签
git tag -a v0.1.0 -m "HybridBox v0.1.0 - initial release"

# 推送标签到 GitHub
git push origin v0.1.0
```

### 2. 在 GitHub 上创建 Release

1. 打开仓库页面 → 右侧 **Releases** → **Create a new release**
2. 选择刚才推送的标签 `v0.1.0`
3. 标题写：`HybridBox v0.1.0`
4. 内容写更新说明（可以参考下面的模板）
5. 点击 **Publish release**

### Release 说明模板

```markdown
## What's New

- 首次发布！支持通过微信远程操控 Windows 上的 Claude Code
- 支持文字对话、文件双向传输
- 支持会话续接、工作目录切换
- 支持 PM2 后台常驻

## 安装

```powershell
git clone https://github.com/你的用户名/hybridbox.git
cd hybridbox
npm install
npm run build
npm run setup
npm start
```

## 系统要求

- Windows 10/11
- Node.js ≥ 18
- Claude Code CLI
```

---

## 四、后续维护

### 日常更新代码

```powershell
cd D:\Claude\proj\HybridBox

# 修改代码后
git add .
git commit -m "fix: 修复了 xxx 问题"
git push origin main
```

### 合并他人 PR

如果有人给你提交 Pull Request：
1. 在 GitHub 上点击 PR → **Files changed** 查看修改
2. 如果 CI 通过且代码没问题，点击 **Merge pull request**

---

## 五、常见问题

### Q: 推送时提示 "Permission denied"?

A: 说明 SSH 密钥配置有问题。检查：
1. 公钥是否已添加到 GitHub
2. 私钥文件是否存在 `~/.ssh/id_ed25519`
3. 可以尝试用 HTTPS 方式：`git remote set-url origin https://github.com/你的用户名/hybridbox.git`

### Q: 不想公开代码，可以私有吗？

A: 可以。创建仓库时选择 **Private** 即可。免费用户也有无限私有仓库。

### Q: 以后换电脑了代码还在吗？

A: 在。新电脑上执行：
```powershell
git clone git@github.com:你的用户名/hybridbox.git
# 或
git clone https://github.com/你的用户名/hybridbox.git
```

