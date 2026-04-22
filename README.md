🧬 NCBI 基因组下载助手 V3.0 Pro

(NCBI Genome Download Helper)

纯前端生成终端下载脚本，接入 NCBI 官方 API 实现智能检索、批量匹配与断点续传。

🌟 在线体验 Web 端 🌟

📖 项目简介

NCBI 基因组下载助手是一个专为生物信息学从业者设计的轻量级 Web 工具。它可以帮助用户免去繁琐的 FTP 路径寻找和命令行编写过程，只需通过点选和输入，即可一键生成适用于各种系统（Linux/macOS/Windows WSL）的自动化下载脚本。

通过接入 NCBI 官方 API，本工具实现了实时搜索、参考基因组自动高亮、依赖智能校验以及断点续传等高级功能。

✨ 核心特性

🚀 三大下载引擎支持：

NCBI Datasets (官方推荐)：支持高级的“脱水/复水”模式，彻底规避 HTTP/2 GOAWAY 大文件断流问题。

rsync：支持高速同步与断点续传。

wget：系统原生自带，支持自动重连。

🔍 智能 API 检索：输入物种名或组装编号实时检索，支持防抖(Debounce)与本地缓存，自动对 Reference Genome 进行 ⭐ 高亮标记。

📁 批量导入与解析：支持直接粘贴多个 Accession 编号，或上传 .txt / .csv 文件自动解析并过滤。

🛠️ 自动化后处理：提供下载后自动重命名为规范格式（编号_类型.gz）及自动解压（gunzip）功能。

🛡️ 强大的容错机制：生成的 Bash 脚本自带环境检测（Datasets/Wget检查）、磁盘空间预警（df -h）以及断点续传兜底逻辑。

🔒 隐私安全：100% 纯前端应用，所有的 API 请求直接从浏览器发出，不经过任何第三方后端服务器。

💻 本地部署与开发

本项目基于 React + Vite + Tailwind CSS 构建。

1. 克隆项目

git clone [https://github.com/jwy-hm/ncbi-helper.git](https://github.com/jwy-hm/ncbi-helper.git)
cd ncbi-helper


2. 安装依赖

请确保您的电脑已安装 Node.js，然后执行：

npm install


(注：项目使用了 lucide-react 作为图标库)

3. 启动开发服务器

npm run dev


打开终端提示的本地地址（如 http://localhost:5173）即可预览。

4. 构建生产环境代码

npm run build


构建后的静态文件将生成在 dist 目录中。

🧬 下载脚本运行指南 (针对生成后的 .sh 文件)

在 Web 端配置好并下载 download.sh 后：

🍎 macOS / 🐧 Linux 用户：
直接在终端中运行：

bash download.sh


🪟 Windows 用户：
请使用 WSL (Windows Subsystem for Linux) 或 Git Bash 运行此脚本。

关于断线重连：
如果网络波动导致脚本中断，只需重新运行一次该脚本，系统会自动跳过已下载完成的文件，继续下载剩余内容！

👨‍💻 作者与联系方式

本项目由 jwy_hm 开发与维护。

📧 邮箱: gmzhaoyubo@gmail.com

🐙 GitHub: jwy-hm

📄 个人简历: https://resume.safehome.eu.org/

如果您在使用过程中遇到任何问题，或者有任何功能建议，欢迎提交 Issue 或直接通过邮件联系我！如果这个项目对您有帮助，请不要吝啬您的 ⭐️ Star！

© 2026 jwy_hm. All rights reserved.