#!/bin/bash
# 打包数据包脚本 - package.sh

echo "开始打包军工项目管理软件数据包..."

# 创建临时目录
TEMP_DIR="军工项目管理软件_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$TEMP_DIR"

# 复制所有文件
echo "复制文件..."
cp -r package.json main.js preload.js "$TEMP_DIR/"
cp -r src "$TEMP_DIR/"
cp -r resources "$TEMP_DIR/"
cp -r scripts "$TEMP_DIR/"
cp -r installer "$TEMP_DIR/"
cp LICENSE.txt README.md 安装说明.txt "$TEMP_DIR/"

# 复制核心模块
echo "复制核心模块..."
cp 数据库管理器.js "$TEMP_DIR/"
cp 自动保存服务.js "$TEMP_DIR/"
cp 文件预览管理器.js "$TEMP_DIR/"

# 创建必要的配置文件
echo "创建配置文件..."
cat > "$TEMP_DIR/config.json" << EOF
{
  "appName": "军工项目管理软件",
  "version": "1.0.0",
  "company": "国防科技工业局",
  "buildDate": "$(date +%Y-%m-%d)",
  "securityLevel": "涉密",
  "features": [
    "项目管理",
    "文件管理",
    "进度监控",
    "自动保存",
    "文件预览",
    "数据备份"
  ]
}
EOF

# 创建启动脚本
echo "创建启动脚本..."
cat > "$TEMP_DIR/启动软件.bat" << EOF
@echo off
chcp 65001 > nul
echo 正在启动军工项目管理软件...
echo.
echo 系统信息：
echo 日期: %date%
echo 时间: %time%
echo.
echo 注意：本软件为涉密系统，请严格遵守保密规定。
echo.
node main.js
pause
EOF

cat > "$TEMP_DIR/start.sh" << EOF
#!/bin/bash
echo "启动军工项目管理软件..."
echo ""
echo "系统信息："
echo "日期: \$(date)"
echo ""
echo "注意：本软件为涉密系统，请严格遵守保密规定。"
echo ""
npm start
EOF

chmod +x "$TEMP_DIR/start.sh"

# 创建安装说明
cat > "$TEMP_DIR/INSTALL.md" << EOF
# 军工项目管理软件安装指南

## 快速开始

1. 确保已安装Node.js (版本 >= 14)
2. 安装依赖: \`npm install\`
3. 启动开发模式: \`npm start\`
4. 构建安装包: \`npm run build\`

## 详细安装步骤

### Windows系统
1. 安装Node.js
2. 打开命令提示符，进入项目目录
3. 运行: \`npm install\`
4. 运行: \`npm start\` 启动软件

### 构建可执行文件
运行: \`npm run build\`
构建完成后，在dist目录下找到安装程序

## 系统要求
- Windows 7/8/10/11 (64位)
- 4GB RAM (推荐8GB)
- 500MB可用磁盘空间

## 技术支持
如有问题，请联系内部技术支持。
EOF

# 创建压缩包
echo "创建压缩包..."
7z a -t7z -m0=lzma -mx=9 -mfb=64 -md=32m -ms=on "${TEMP_DIR}.7z" "$TEMP_DIR/"

# 计算哈希值
echo "计算文件哈希..."
md5sum "${TEMP_DIR}.7z" > "${TEMP_DIR}.7z.md5"
sha256sum "${TEMP_DIR}.7z" > "${TEMP_DIR}.7z.sha256"

echo ""
echo "=========================================="
echo "打包完成！"
echo "数据包: ${TEMP_DIR}.7z"
echo "MD5: $(cat "${TEMP_DIR}.7z.md5")"
echo "SHA256: $(cat "${TEMP_DIR}.7z.sha256")"
echo "文件大小: $(du -h "${TEMP_DIR}.7z" | cut -f1)"
echo "=========================================="

# 清理临时目录
rm -rf "$TEMP_DIR"

echo ""
echo "请将以下文件交付给用户："
echo "1. ${TEMP_DIR}.7z"
echo "2. ${TEMP_DIR}.7z.md5"
echo "3. ${TEMP_DIR}.7z.sha256"
echo "4. 安装说明.txt"