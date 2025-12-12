const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const crypto = require('crypto');

class DatabaseManager {
  constructor() {
    this.db = null;
    this.dbPath = path.join(app.getPath('userData'), 'databases', 'project_management.db');
    this.backupPath = path.join(app.getPath('userData'), 'backups');
    this.encryptionKey = null;
    
    // 初始化目录
    this.initDirectories();
    
    // 初始化数据库
    this.initDatabase();
  }

  initDirectories() {
    const dirs = [
      path.dirname(this.dbPath),
      this.backupPath,
      path.join(app.getPath('userData'), 'previews'),
      path.join(app.getPath('userData'), 'logs')
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  initDatabase() {
    try {
      // 创建数据库连接
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('数据库连接失败:', err);
          this.createEmergencyDatabase();
        } else {
          console.log('数据库连接成功');
          this.createTables();
          this.initEncryption();
        }
      });
      
      // 数据库性能优化
      this.db.configure('busyTimeout', 3000);
      
      // 定期备份
      this.setupAutoBackup();
      
    } catch (error) {
      console.error('数据库初始化失败:', error);
      this.createEmergencyDatabase();
    }
  }

  createEmergencyDatabase() {
    const emergencyPath = path.join(app.getAppPath(), 'emergency.db');
    this.db = new sqlite3.Database(emergencyPath);
    this.createTables();
    console.log('紧急数据库已创建');
  }

  initEncryption() {
    // 从安全存储获取或生成加密密钥
    const keyPath = path.join(app.getPath('userData'), 'security', 'encryption.key');
    
    if (fs.existsSync(keyPath)) {
      this.encryptionKey = fs.readFileSync(keyPath);
    } else {
      this.encryptionKey = crypto.randomBytes(32);
      const securityDir = path.dirname(keyPath);
      if (!fs.existsSync(securityDir)) {
        fs.mkdirSync(securityDir, { recursive: true });
      }
      fs.writeFileSync(keyPath, this.encryptionKey);
    }
  }

  createTables() {
    const tables = [
      // 项目表
      `CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_code TEXT UNIQUE NOT NULL,
        project_name TEXT NOT NULL,
        project_type TEXT,
        department TEXT,
        security_level TEXT DEFAULT '秘密',
        classification TEXT DEFAULT '内部',
        start_date DATE,
        end_date DATE,
        status TEXT DEFAULT '进行中',
        budget REAL,
        manager TEXT,
        contact_person TEXT,
        contact_phone TEXT,
        description TEXT,
        tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted INTEGER DEFAULT 0
      )`,
      
      // 过程文件表
      `CREATE TABLE IF NOT EXISTS process_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        original_name TEXT,
        file_path TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size INTEGER,
        file_hash TEXT,
        upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        upload_user TEXT,
        version TEXT DEFAULT '1.0',
        security_level TEXT DEFAULT '内部',
        classification TEXT DEFAULT '一般',
        tags TEXT,
        description TEXT,
        preview_path TEXT,
        thumbnail_path TEXT,
        metadata TEXT,
        is_encrypted INTEGER DEFAULT 0,
        encryption_key BLOB,
        last_access_date DATETIME,
        access_count INTEGER DEFAULT 0,
        deleted INTEGER DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      
      // 进度节点表
      `CREATE TABLE IF NOT EXISTS schedule_nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        parent_id INTEGER,
        node_code TEXT,
        node_name TEXT NOT NULL,
        node_type TEXT NOT NULL,
        planned_start_date DATE,
        planned_end_date DATE,
        actual_start_date DATE,
        actual_end_date DATE,
        status TEXT DEFAULT '未开始',
        completion_rate INTEGER DEFAULT 0,
        priority TEXT DEFAULT '中',
        responsible_person TEXT,
        responsible_department TEXT,
        related_files TEXT,
        milestones TEXT,
        risks TEXT,
        notes TEXT,
        attachments TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted INTEGER DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES schedule_nodes(id) ON DELETE CASCADE
      )`,
      
      // 用户配置表
      `CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE NOT NULL,
        user_name TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        department TEXT,
        default_project_path TEXT,
        theme TEXT DEFAULT 'light',
        language TEXT DEFAULT 'zh-CN',
        notification_enabled INTEGER DEFAULT 1,
        auto_save_interval INTEGER DEFAULT 5,
        backup_interval INTEGER DEFAULT 24,
        max_backup_files INTEGER DEFAULT 30,
        file_preview_enabled INTEGER DEFAULT 1,
        encryption_enabled INTEGER DEFAULT 0,
        recent_projects TEXT,
        shortcuts TEXT,
        preferences TEXT,
        last_login DATETIME,
        login_count INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // 审计日志表
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        user_name TEXT,
        action_type TEXT NOT NULL,
        action_target TEXT,
        target_id INTEGER,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        success INTEGER DEFAULT 1,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // 文件访问日志
      `CREATE TABLE IF NOT EXISTS file_access_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL,
        user_id TEXT,
        user_name TEXT,
        access_type TEXT NOT NULL,
        access_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        duration INTEGER,
        action TEXT,
        notes TEXT,
        FOREIGN KEY (file_id) REFERENCES process_files(id) ON DELETE CASCADE
      )`,
      
      // 备份记录表
      `CREATE TABLE IF NOT EXISTS backup_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        backup_type TEXT NOT NULL,
        backup_path TEXT NOT NULL,
        backup_size INTEGER,
        database_version TEXT,
        project_count INTEGER,
        file_count INTEGER,
        start_time DATETIME,
        end_time DATETIME,
        success INTEGER DEFAULT 1,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];
    
    // 执行所有表创建语句
    tables.forEach(tableSQL => {
      this.db.run(tableSQL, (err) => {
        if (err) {
          console.error('创建表失败:', err.message, '\nSQL:', tableSQL);
        }
      });
    });
    
    // 创建索引
    this.createIndexes();
  }

  createIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_projects_code ON projects(project_code)',
      'CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)',
      'CREATE INDEX IF NOT EXISTS idx_files_project ON process_files(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_files_type ON process_files(file_type)',
      'CREATE INDEX IF NOT EXISTS idx_files_security ON process_files(security_level)',
      'CREATE INDEX IF NOT EXISTS idx_nodes_project ON schedule_nodes(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_nodes_status ON schedule_nodes(status)',
      'CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_file_access ON file_access_logs(file_id, access_time)'
    ];
    
    indexes.forEach(indexSQL => {
      this.db.run(indexSQL);
    });
  }

  setupAutoBackup() {
    // 每小时检查一次备份
    setInterval(() => {
      this.checkAndPerformBackup();
    }, 3600000);
  }

  async checkAndPerformBackup() {
    try {
      const now = new Date();
      const lastBackup = await this.getLastBackupTime();
      
      if (!lastBackup || (now - lastBackup) > 24 * 3600000) { // 24小时
        await this.performBackup('auto');
      }
    } catch (error) {
      console.error('自动备份检查失败:', error);
    }
  }

  async getLastBackupTime() {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT MAX(end_time) as last_backup FROM backup_records WHERE success = 1',
        (err, row) => {
          if (err) reject(err);
          else resolve(row ? new Date(row.last_backup) : null);
        }
      );
    });
  }

  async performBackup(type = 'manual') {
    return new Promise((resolve, reject) => {
      const startTime = new Date();
      const backupFileName = `backup_${type}_${startTime.toISOString().replace(/[:.]/g, '-')}.db`;
      const backupFilePath = path.join(this.backupPath, backupFileName);
      
      // 执行备份
      const backupDB = new sqlite3.Database(this.dbPath);
      const backup = backupDB.backup(backupFilePath);
      
      backup.step(-1, (err) => {
        if (err) {
          console.error('备份失败:', err);
          this.logBackupRecord({
            type,
            path: backupFilePath,
            start_time: startTime,
            end_time: new Date(),
            success: 0,
            error_message: err.message
          });
          reject(err);
        } else {
          backup.finish(() => {
            const endTime = new Date();
            const stats = fs.statSync(backupFilePath);
            
            // 记录备份信息
            this.logBackupRecord({
              type,
              path: backupFilePath,
              backup_size: stats.size,
              start_time: startTime,
              end_time: endTime,
              success: 1
            });
            
            // 清理旧备份
            this.cleanupOldBackups();
            
            console.log(`备份完成: ${backupFilePath}`);
            resolve(backupFilePath);
          });
        }
      });
    });
  }

  async logBackupRecord(record) {
    const stats = await this.getDatabaseStats();
    
    const sql = `
      INSERT INTO backup_records 
      (backup_type, backup_path, backup_size, database_version, 
       project_count, file_count, start_time, end_time, success, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    return this.run(sql, [
      record.type,
      record.path,
      record.backup_size,
      '1.0.0',
      stats.project_count,
      stats.file_count,
      record.start_time,
      record.end_time,
      record.success || 1,
      record.error_message || null
    ]);
  }

  async getDatabaseStats() {
    const results = await Promise.all([
      this.query('SELECT COUNT(*) as count FROM projects WHERE deleted = 0'),
      this.query('SELECT COUNT(*) as count FROM process_files WHERE deleted = 0'),
      this.query('SELECT COUNT(*) as count FROM schedule_nodes WHERE deleted = 0')
    ]);
    
    return {
      project_count: results[0][0].count,
      file_count: results[1][0].count,
      node_count: results[2][0].count
    };
  }

  cleanupOldBackups() {
    fs.readdir(this.backupPath, (err, files) => {
      if (err) return;
      
      const backupFiles = files
        .filter(f => f.startsWith('backup_') && f.endsWith('.db'))
        .map(f => ({
          name: f,
          path: path.join(this.backupPath, f),
          time: fs.statSync(path.join(this.backupPath, f)).mtimeMs
        }))
        .sort((a, b) => b.time - a.time);
      
      // 保留最近30个备份
      if (backupFiles.length > 30) {
        backupFiles.slice(30).forEach(file => {
          try {
            fs.unlinkSync(file.path);
            console.log('删除旧备份:', file.name);
          } catch (error) {
            console.error('删除备份失败:', error);
          }
        });
      }
    });
  }

  // 加密数据
  encryptData(data) {
    if (!this.encryptionKey) return data;
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      iv: iv.toString('hex'),
      data: encrypted,
      authTag: authTag.toString('hex')
    };
  }

  // 解密数据
  decryptData(encryptedData) {
    if (!this.encryptionKey || !encryptedData.iv) return encryptedData.data;
    
    try {
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const authTag = Buffer.from(encryptedData.authTag, 'hex');
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('解密失败:', error);
      return null;
    }
  }

  // 通用查询方法
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          console.error('查询失败:', err.message, '\nSQL:', sql, '\n参数:', params);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  // 通用执行方法
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          console.error('执行失败:', err.message, '\nSQL:', sql, '\n参数:', params);
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  // 事务执行
  async transaction(operations) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        try {
          operations.forEach(op => {
            this.db.run(op.sql, op.params);
          });
          
          this.db.run('COMMIT', (err) => {
            if (err) {
              this.db.run('ROLLBACK');
              reject(err);
            } else {
              resolve(true);
            }
          });
        } catch (error) {
          this.db.run('ROLLBACK');
          reject(error);
        }
      });
    });
  }

  // 关闭数据库
  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // 优化数据库
  optimize() {
    return new Promise((resolve, reject) => {
      this.db.run('VACUUM', (err) => {
        if (err) reject(err);
        else {
          this.db.run('ANALYZE', (err2) => {
            if (err2) reject(err2);
            else resolve();
          });
        }
      });
    });
  }
}

module.exports = DatabaseManager;