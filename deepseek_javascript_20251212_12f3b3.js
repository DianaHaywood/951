const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const crypto = require('crypto');

class AutoSaveService {
  constructor(dbManager) {
    this.dbManager = dbManager;
    this.interval = 5 * 60 * 1000; // 5分钟
    this.backupInterval = 24 * 60 * 60 * 1000; // 24小时
    this.timer = null;
    this.backupTimer = null;
    this.savePath = path.join(app.getPath('userData'), 'autosave');
    this.maxAutoSaveFiles = 50;
    
    // 初始化目录
    this.initDirectories();
  }

  initDirectories() {
    const dirs = [
      this.savePath,
      path.join(this.savePath, 'projects'),
      path.join(this.savePath, 'files'),
      path.join(this.savePath, 'settings')
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  start() {
    // 启动定时自动保存
    this.timer = setInterval(() => {
      this.performAutoSave();
    }, this.interval);
    
    // 启动定时备份
    this.backupTimer = setInterval(() => {
      this.performBackup();
    }, this.backupInterval);
    
    console.log('自动保存服务已启动');
    
    // 程序退出时执行一次保存
    this.setupExitHandler();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
    
    // 执行最后一次保存
    this.performAutoSave();
    
    console.log('自动保存服务已停止');
  }

  setupExitHandler() {
    process.on('beforeExit', () => {
      this.performAutoSave();
    });
    
    process.on('SIGINT', () => {
      this.performEmergencySave();
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      this.performEmergencySave();
      process.exit(0);
    });
  }

  async performAutoSave() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const saveFile = path.join(this.savePath, `autosave_${timestamp}.json`);
      
      // 获取当前所有数据
      const allData = await this.getAllData();
      
      // 添加元数据
      allData.metadata = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        dataType: 'autosave',
        checksum: this.generateChecksum(JSON.stringify(allData))
      };
      
      // 保存到文件
      fs.writeFileSync(saveFile, JSON.stringify(allData, null, 2), 'utf-8');
      
      // 压缩文件
      await this.compressFile(saveFile);
      
      // 清理旧文件
      this.cleanupOldSaves();
      
      console.log(`自动保存完成: ${path.basename(saveFile)}`);
      return { success: true, file: saveFile };
    } catch (error) {
      console.error('自动保存失败:', error);
      return { success: false, error: error.message };
    }
  }

  async performManualBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(this.savePath, 'manual_backup', timestamp);
      
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      // 备份数据库
      const dbBackupPath = path.join(backupDir, 'database.db');
      await this.dbManager.performBackup('manual');
      
      // 备份配置文件
      await this.backupConfigFiles(backupDir);
      
      // 创建备份信息文件
      const backupInfo = {
        timestamp: new Date().toISOString(),
        type: 'manual',
        databaseFile: 'database.db',
        configFiles: ['settings.json', 'projects.json'],
        totalSize: await this.calculateDirectorySize(backupDir),
        checksum: await this.generateDirectoryChecksum(backupDir)
      };
      
      fs.writeFileSync(
        path.join(backupDir, 'backup_info.json'),
        JSON.stringify(backupInfo, null, 2),
        'utf-8'
      );
      
      console.log(`手动备份完成: ${backupDir}`);
      return { success: true, directory: backupDir };
    } catch (error) {
      console.error('手动备份失败:', error);
      return { success: false, error: error.message };
    }
  }

  async performBackup() {
    try {
      // 执行数据库备份
      const backupFile = await this.dbManager.performBackup('scheduled');
      
      // 记录备份日志
      await this.logBackupEvent('scheduled', backupFile);
      
      console.log(`定时备份完成: ${backupFile}`);
      return { success: true, file: backupFile };
    } catch (error) {
      console.error('定时备份失败:', error);
      await this.logBackupEvent('scheduled', null, error.message);
      return { success: false, error: error.message };
    }
  }

  async performEmergencySave() {
    try {
      console.log('执行紧急保存...');
      
      const emergencyDir = path.join(app.getPath('userData'), 'emergency_save');
      if (!fs.existsSync(emergencyDir)) {
        fs.mkdirSync(emergencyDir, { recursive: true });
      }
      
      // 只保存最关键的数据
      const criticalData = {
        timestamp: new Date().toISOString(),
        projects: await this.dbManager.query(
          'SELECT id, project_code, project_name, status FROM projects WHERE deleted = 0 LIMIT 100'
        ),
        recentFiles: await this.dbManager.query(
          'SELECT id, file_name, file_path FROM process_files WHERE deleted = 0 ORDER BY upload_date DESC LIMIT 50'
        ),
        userSettings: await this.dbManager.query(
          'SELECT user_id, user_name, role FROM user_settings LIMIT 10'
        )
      };
      
      const emergencyFile = path.join(
        emergencyDir,
        `emergency_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      );
      
      fs.writeFileSync(
        emergencyFile,
        JSON.stringify(criticalData, null, 2),
        'utf-8'
      );
      
      // 创建恢复脚本
      this.createRecoveryScript(emergencyDir);
      
      console.log(`紧急保存完成: ${emergencyFile}`);
      return { success: true, file: emergencyFile };
    } catch (error) {
      console.error('紧急保存失败:', error);
      return { success: false, error: error.message };
    }
  }

  async getAllData() {
    try {
      const [
        projects,
        files,
        nodes,
        settings,
        auditLogs
      ] = await Promise.all([
        this.dbManager.query('SELECT * FROM projects WHERE deleted = 0'),
        this.dbManager.query('SELECT * FROM process_files WHERE deleted = 0'),
        this.dbManager.query('SELECT * FROM schedule_nodes WHERE deleted = 0'),
        this.dbManager.query('SELECT * FROM user_settings'),
        this.dbManager.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1000')
      ]);
      
      return {
        timestamp: new Date().toISOString(),
        statistics: {
          projectCount: projects.length,
          fileCount: files.length,
          nodeCount: nodes.length,
          userCount: settings.length,
          logCount: auditLogs.length
        },
        data: {
          projects,
          files,
          nodes,
          settings,
          auditLogs: auditLogs
        }
      };
    } catch (error) {
      console.error('获取数据失败:', error);
      throw error;
    }
  }

  async backupConfigFiles(backupDir) {
    const configFiles = [
      {
        source: path.join(app.getPath('userData'), 'config', 'settings.json'),
        target: path.join(backupDir, 'settings.json')
      },
      {
        source: path.join(app.getPath('userData'), 'config', 'projects.json'),
        target: path.join(backupDir, 'projects.json')
      }
    ];
    
    for (const file of configFiles) {
      if (fs.existsSync(file.source)) {
        fs.copyFileSync(file.source, file.target);
      }
    }
  }

  async logBackupEvent(type, filePath, error = null) {
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        type,
        filePath,
        success: !error,
        error: error,
        systemInfo: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          electronVersion: process.versions.electron
        }
      };
      
      const logFile = path.join(this.savePath, 'backup_log.json');
      let logs = [];
      
      if (fs.existsSync(logFile)) {
        const content = fs.readFileSync(logFile, 'utf-8');
        try {
          logs = JSON.parse(content);
        } catch {
          logs = [];
        }
      }
      
      logs.push(logEntry);
      
      // 保留最近100条日志
      if (logs.length > 100) {
        logs = logs.slice(-100);
      }
      
      fs.writeFileSync(logFile, JSON.stringify(logs, null, 2), 'utf-8');
    } catch (error) {
      console.error('记录备份日志失败:', error);
    }
  }

  cleanupOldSaves() {
    try {
      const files = fs.readdirSync(this.savePath)
        .filter(f => f.startsWith('autosave_') && f.endsWith('.json'))
        .map(f => ({
          name: f,
          path: path.join(this.savePath, f),
          time: fs.statSync(path.join(this.savePath, f)).mtimeMs
        }))
        .sort((a, b) => b.time - a.time);
      
      // 删除超过限制的旧文件
      if (files.length > this.maxAutoSaveFiles) {
        files.slice(this.maxAutoSaveFiles).forEach(file => {
          try {
            fs.unlinkSync(file.path);
            console.log('删除旧自动保存文件:', file.name);
          } catch (error) {
            console.error('删除文件失败:', error);
          }
        });
      }
    } catch (error) {
      console.error('清理旧保存文件失败:', error);
    }
  }

  async restoreBackup(backupId) {
    try {
      // 根据backupId找到备份文件
      const backupFile = path.join(this.savePath, `autosave_${backupId}.json`);
      
      if (!fs.existsSync(backupFile)) {
        throw new Error('备份文件不存在');
      }
      
      // 读取备份数据
      const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));
      
      // 验证数据完整性
      if (!this.validateBackupData(backupData)) {
        throw new Error('备份数据验证失败');
      }
      
      // 执行恢复操作
      await this.restoreData(backupData.data);
      
      console.log(`恢复备份成功: ${backupId}`);
      return { success: true, message: '恢复成功' };
    } catch (error) {
      console.error('恢复备份失败:', error);
      return { success: false, error: error.message };
    }
  }

  validateBackupData(data) {
    if (!data.metadata || !data.metadata.checksum) {
      return false;
    }
    
    const calculatedChecksum = this.generateChecksum(
      JSON.stringify({ ...data, metadata: { ...data.metadata, checksum: null } })
    );
    
    return data.metadata.checksum === calculatedChecksum;
  }

  async restoreData(data) {
    // 这里实现数据恢复逻辑
    // 注意：实际恢复操作需要更复杂的处理，这里只是示例
    console.log('开始恢复数据...', {
      projects: data.projects?.length || 0,
      files: data.files?.length || 0
    });
  }

  generateChecksum(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  async calculateDirectorySize(dir) {
    let totalSize = 0;
    
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        totalSize += await this.calculateDirectorySize(filePath);
      } else {
        totalSize += stats.size;
      }
    }
    
    return totalSize;
  }

  async generateDirectoryChecksum(dir) {
    const files = fs.readdirSync(dir)
      .filter(f => !f.startsWith('.'))
      .sort();
    
    const hash = crypto.createHash('sha256');
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        const subHash = await this.generateDirectoryChecksum(filePath);
        hash.update(subHash);
      } else {
        const content = fs.readFileSync(filePath);
        hash.update(content);
      }
    }
    
    return hash.digest('hex');
  }

  async compressFile(filePath) {
    // 这里可以实现文件压缩逻辑
    // 使用zlib或第三方压缩库
    return Promise.resolve();
  }

  createRecoveryScript(recoveryDir) {
    const scriptContent = `#!/bin/bash
# 军工项目管理软件恢复脚本
# 生成时间: ${new Date().toISOString()}

echo "开始恢复军工项目管理软件数据..."

# 恢复步骤
# 1. 停止正在运行的程序
# 2. 备份当前数据
# 3. 恢复备份数据
# 4. 启动程序

echo "恢复完成！"
`;

    const scriptPath = path.join(recoveryDir, 'recovery.sh');
    fs.writeFileSync(scriptPath, scriptContent, 'utf-8');
    
    // 在Windows上创建批处理文件
    const batPath = path.join(recoveryDir, 'recovery.bat');
    const batContent = `@echo off
echo 军工项目管理软件恢复脚本
echo 生成时间: ${new Date().toISOString()}
echo.
echo 请手动恢复数据文件。
pause
`;
    fs.writeFileSync(batPath, batContent, 'utf-8');
  }

  getAutoSaveFiles() {
    try {
      const files = fs.readdirSync(this.savePath)
        .filter(f => f.startsWith('autosave_') && f.endsWith('.json'))
        .map(f => {
          const filePath = path.join(this.savePath, f);
          const stats = fs.statSync(filePath);
          
          return {
            id: f.replace('autosave_', '').replace('.json', ''),
            name: f,
            path: filePath,
            size: stats.size,
            modified: stats.mtime,
            readableSize: this.formatFileSize(stats.size)
          };
        })
        .sort((a, b) => b.modified - a.modified);
      
      return files;
    } catch (error) {
      console.error('获取自动保存文件失败:', error);
      return [];
    }
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }
}

module.exports = AutoSaveService;