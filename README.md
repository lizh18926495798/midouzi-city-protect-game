# 祢豆子塔防游戏 (Nezuko Tower Defense)

这是一个基于 React 和 Vite 构建的经典导弹防御风格塔防游戏。

## 在 VS Code 中运行

1. **打开项目**: 在 VS Code 中打开此文件夹。
2. **安装推荐扩展**: VS Code 会提示你安装推荐的扩展（如 Tailwind CSS, ESLint 等），建议安装以获得最佳开发体验。
3. **打开终端**: 使用 `Ctrl + ` ` (反引号) 打开集成终端。
4. **安装依赖**:
   ```bash
   npm install
   ```
5. **启动开发服务器**:
   ```bash
   npm run dev
   ```
6. **访问游戏**: 在浏览器中打开 `http://localhost:3000`。

## 部署到 Vercel

你可以通过以下步骤将此项目部署到 Vercel：

1. **上传到 GitHub**:
   - 在 GitHub 上创建一个新的仓库。
   - 将此代码推送到该仓库。

2. **连接到 Vercel**:
   - 登录 [Vercel](https://vercel.com)。
   - 点击 "Add New" -> "Project"。
   - 选择你的 GitHub 仓库并点击 "Import"。

3. **配置环境变量**:
   - 在 Vercel 的项目设置中，找到 "Environment Variables"。
   - 添加 `GEMINI_API_KEY`（如果你在游戏中使用了 Gemini 相关功能）。
   - 添加 `VITE_APP_URL`（如果需要）。

4. **部署**:
   - 点击 "Deploy"。Vercel 会自动识别 Vite 项目并进行构建部署。

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 游戏玩法

- 点击屏幕发射拦截导弹。
- 保护城市不被坠落的火箭摧毁。
- 达到 1000 分即可获胜！
