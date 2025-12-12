const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

console.log('开始构建军工项目管理软件...');

// 清理旧的构建文件
console.log('清理旧的构建文件...');
try {
  fs.removeSync('dist');
  fs.removeSync('build');
  console.log('清理完成');
} catch (error) {
  console.warn('清理失败:', error.message);
}

// 创建必要的目录
console.log('创建目录结构...');
const dirs = [
  'dist',
  'build',
  'resources',
  'src/renderer/styles',
  'src/main',
  'src/database',
  'src/shared',
  'installer'
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.ensureDirSync(dir);
  }
});

// 复制资源文件
console.log('复制资源文件...');
const resources = [
  { src: 'resources/icon.ico', dest: 'build/icon.ico' },
  { src: 'LICENSE.txt', dest: 'build/LICENSE.txt' },
  { src: 'README.md', dest: 'build/README.md' }
];

resources.forEach(({ src, dest }) => {
  if (fs.existsSync(src)) {
    fs.copySync(src, dest);
    console.log(`复制 ${src} → ${dest}`);
  }
});

// 检查依赖
console.log('检查依赖...');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  console.log('项目名称:', packageJson.name);
  console.log('版本:', packageJson.version);
  
  // 安装依赖
  console.log('安装依赖...');
  execSync('npm install', { stdio: 'inherit' });
  
  // 重建原生模块
  console.log('重建原生模块...');
  execSync('npm rebuild', { stdio: 'inherit' });
  
} catch (error) {
  console.error('依赖检查失败:', error.message);
  process.exit(1);
}

// 编译React应用（如果有）
console.log('编译前端资源...');
try {
  // 这里可以添加前端构建命令
  // 例如：execSync('npm run build:react', { stdio: 'inherit' });
  console.log('前端资源编译跳过（当前为简单示例）');
} catch (error) {
  console.warn('前端编译失败:', error.message);
}

// 构建Electron应用
console.log('构建Electron应用...');
try {
  execSync('npm run package', { stdio: 'inherit' });
} catch (error) {
  console.error('构建失败:', error.message);
  process.exit(1);
}

// 创建安装包
console.log('创建安装包...');
try {
  // 使用electron-builder
  execSync('npm run installer', { stdio: 'inherit' });
} catch (error) {
  console.error('创建安装包失败:', error.message);
  process.exit(1);
}

console.log('\n====================================');
console.log('构建完成！');
console.log('安装包位置: dist/MilitaryProjectManagement_Setup.exe');
console.log('构建时间:', new Date().toLocaleString());
console.log('====================================\n');

// 生成构建报告
const buildReport = {
  project: '军工项目管理软件',
  version: packageJson.version,
  buildTime: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  nodeVersion: process.version,
  success: true
};

fs.writeJsonSync('build/build-report.json', buildReport, { spaces: 2 });
console.log('构建报告已生成: build/build-report.json');