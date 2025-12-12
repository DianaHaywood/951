const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { app } = require('electron');
const crypto = require('crypto');

class FilePreviewManager {
  constructor() {
    this.previewCache = new Map();
    this.previewDir = path.join(app.getPath('userData'), 'preview_cache');
    this.thumbnailDir = path.join(app.getPath('userData'), 'thumbnails');
    this.maxCacheSize = 100 * 1024 * 1024; // 100MB
    this.supportedFormats = {
      image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'],
      document: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'md'],
      spreadsheet: ['xls', 'xlsx', 'csv'],
      presentation: ['ppt', 'pptx'],
      archive: ['zip', 'rar', '7z', 'tar', 'gz'],
      code: ['js', 'html', 'css', 'json', 'xml', 'py', 'java', 'cpp', 'c']
    };
    
    // 初始化目录
    this.initDirectories();
    
    // 定期清理缓存
    this.setupCacheCleanup();
  }

  initDirectories() {
    const dirs = [this.previewDir, this.thumbnailDir];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  setupCacheCleanup() {
    // 每小时清理一次过期缓存
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 3600000);
    
    // 每天清理一次无效缓存文件
    setInterval(() => {
      this.cleanupOrphanedFiles();
    }, 24 * 3600000);
  }

  async generatePreview(filePath, fileType, options = {}) {
    const fileKey = this.getFileKey(filePath);
    const cacheKey = `${fileKey}_${JSON.stringify(options)}`;
    
    // 检查内存缓存
    if (this.previewCache.has(cacheKey)) {
      const cached = this.previewCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 3600000) { // 1小时有效期
        return cached.data;
      }
    }
    
    // 检查磁盘缓存
    const diskCache = await this.checkDiskCache(fileKey, options);
    if (diskCache) {
      this.previewCache.set(cacheKey, {
        data: diskCache,
        timestamp: Date.now()
      });
      return diskCache;
    }
    
    try {
      // 根据文件类型生成预览
      const previewData = await this.generatePreviewByType(filePath, fileType, options);
      
      // 缓存结果
      this.previewCache.set(cacheKey, {
        data: previewData,
        timestamp: Date.now()
      });
      
      // 保存到磁盘缓存
      await this.saveToDiskCache(fileKey, previewData, options);
      
      return previewData;
    } catch (error) {
      console.error('预览生成失败:', error);
      return this.generateErrorPreview(fileType, error.message);
    }
  }

  async generatePreviewByType(filePath, fileType, options) {
    const extension = fileType.toLowerCase();
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      throw new Error('文件不存在');
    }
    
    // 检查文件大小限制
    const stats = fs.statSync(filePath);
    if (stats.size > 100 * 1024 * 1024) { // 100MB限制
      throw new Error('文件太大，无法预览');
    }
    
    // 根据文件类型调用相应的预览生成器
    if (this.supportedFormats.image.includes(extension)) {
      return this.generateImagePreview(filePath, options);
    } else if (extension === 'pdf') {
      return this.generatePDFPreview(filePath, options);
    } else if (this.supportedFormats.document.includes(extension)) {
      return this.generateDocumentPreview(filePath, extension, options);
    } else if (this.supportedFormats.text.includes(extension)) {
      return this.generateTextPreview(filePath, options);
    } else {
      return this.generateGenericPreview(filePath, extension, options);
    }
  }

  async generateImagePreview(filePath, options) {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        
        const mimeType = this.getMimeType(filePath);
        const base64Data = data.toString('base64');
        
        // 生成缩略图
        const thumbnail = this.createThumbnail(data, mimeType, options.thumbnailSize || 200);
        
        const previewData = {
          type: 'image',
          mimeType,
          data: `data:${mimeType};base64,${base64Data}`,
          thumbnail: thumbnail ? `data:image/jpeg;base64,${thumbnail}` : null,
          width: options.width,
          height: options.height,
          fileSize: data.length,
          hasTransparency: this.hasTransparency(data, mimeType)
        };
        
        resolve(previewData);
      });
    });
  }

  async generatePDFPreview(filePath, options) {
    return new Promise((resolve, reject) => {
      // 使用第三方库生成PDF预览
      // 这里简化处理，实际应用中需要集成pdf-preview-generator
      try {
        const previewData = {
          type: 'pdf',
          mimeType: 'application/pdf',
          pageCount: 0,
          thumbnail: this.generatePDFThumbnail(filePath, options),
          fileSize: fs.statSync(filePath).size,
          metadata: this.extractPDFMetadata(filePath)
        };
        
        resolve(previewData);
      } catch (error) {
        reject(error);
      }
    });
  }

  async generateDocumentPreview(filePath, extension, options) {
    // 对于文档文件，提取文本内容作为预览
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf-8', (err, data) => {
        if (err) {
          // 如果是二进制文件，尝试读取部分内容
          fs.readFile(filePath, (err2, buffer) => {
            if (err2) {
              reject(err2);
            } else {
              const hexPreview = buffer.slice(0, 1000).toString('hex');
              resolve({
                type: 'binary',
                mimeType: this.getMimeType(filePath),
                preview: '二进制文件，无法直接预览',
                hexPreview: hexPreview,
                fileSize: buffer.length
              });
            }
          });
        } else {
          // 限制预览文本长度
          const maxLength = options.maxLength || 50000;
          const previewText = data.length > maxLength 
            ? data.substring(0, maxLength) + '...' 
            : data;
          
          resolve({
            type: 'text',
            mimeType: this.getMimeType(filePath),
            data: previewText,
            lines: previewText.split('\n').length,
            fileSize: data.length,
            encoding: 'utf-8'
          });
        }
      });
    });
  }

  async generateTextPreview(filePath, options) {
    return this.generateDocumentPreview(filePath, 'txt', options);
  }

  async generateGenericPreview(filePath, extension, options) {
    const stats = fs.statSync(filePath);
    const mimeType = this.getMimeType(filePath);
    
    return {
      type: 'generic',
      mimeType,
      extension,
      fileSize: stats.size,
      lastModified: stats.mtime,
      icon: this.getFileIcon(extension),
      message: `此文件类型 (.${extension}) 不支持在线预览`,
      suggestions: [
        '请使用相关专业软件打开',
        '或联系系统管理员添加对该格式的支持'
      ]
    };
  }

  generateErrorPreview(fileType, errorMessage) {
    return {
      type: 'error',
      fileType,
      error: errorMessage,
      timestamp: new Date().toISOString(),
      icon: 'error',
      message: '预览生成失败',
      suggestions: [
        '检查文件是否完整',
        '确认文件格式是否正确',
        '尝试使用其他软件打开'
      ]
    };
  }

  getFileKey(filePath) {
    const stats = fs.statSync(filePath);
    const fileInfo = `${filePath}_${stats.size}_${stats.mtimeMs}`;
    return crypto.createHash('md5').update(fileInfo).digest('hex');
  }

  async checkDiskCache(fileKey, options) {
    const cacheFile = path.join(this.previewDir, `${fileKey}.json`);
    
    if (fs.existsSync(cacheFile)) {
      try {
        const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        
        // 检查缓存是否过期（24小时）
        if (Date.now() - cacheData.timestamp < 24 * 3600000) {
          return cacheData.preview;
        }
      } catch (error) {
        console.error('读取缓存失败:', error);
      }
    }
    
    return null;
  }

  async saveToDiskCache(fileKey, previewData, options) {
    try {
      const cacheFile = path.join(this.previewDir, `${fileKey}.json`);
      const cacheData = {
        preview: previewData,
        timestamp: Date.now(),
        options: options
      };
      
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf-8');
    } catch (error) {
      console.error('保存缓存失败:', error);
    }
  }

  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.tiff': 'image/tiff',
      '.webp': 'image/webp',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.zip': 'application/zip',
      '.rar': 'application/vnd.rar',
      '.7z': 'application/x-7z-compressed',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }

  createThumbnail(imageData, mimeType, size = 200) {
    // 实际应用中需要使用图像处理库如sharp或jimp
    // 这里返回null作为占位符
    return null;
  }

  generatePDFThumbnail(filePath, options) {
    // 使用第三方库生成PDF缩略图
    return null;
  }

  extractPDFMetadata(filePath) {
    // 提取PDF元数据
    return {};
  }

  hasTransparency(imageData, mimeType) {
    // 检查图像是否有透明通道
    return false;
  }

  getFileIcon(extension) {
    const iconMap = {
      'pdf': 'file-pdf',
      'doc': 'file-word',
      'docx': 'file-word',
      'xls': 'file-excel',
      'xlsx': 'file-excel',
      'ppt': 'file-powerpoint',
      'pptx': 'file-powerpoint',
      'zip': 'file-zip',
      'rar': 'file-zip',
      'jpg': 'file-image',
      'png': 'file-image',
      'gif': 'file-image',
      'txt': 'file-text',
      'js': 'file-code',
      'html': 'file-code',
      'css': 'file-code',
      'json': 'file-code'
    };
    
    return iconMap[extension] || 'file';
  }

  cleanupExpiredCache() {
    const now = Date.now();
    for (const [key, value] of this.previewCache.entries()) {
      if (now - value.timestamp > 3600000) { // 1小时过期
        this.previewCache.delete(key);
      }
    }
  }

  async cleanupOrphanedFiles() {
    try {
      const files = fs.readdirSync(this.previewDir);
      let totalSize = 0;
      
      for (const file of files) {
        const filePath = path.join(this.previewDir, file);
        const stats = fs.statSync(filePath);
        
        // 删除超过7天的缓存文件
        if (now - stats.mtimeMs > 7 * 24 * 3600000) {
          fs.unlinkSync(filePath);
          continue;
        }
        
        totalSize += stats.size;
      }
      
      // 如果缓存超过最大限制，删除最旧的文件
      if (totalSize > this.maxCacheSize) {
        this.cleanupBySize();
      }
    } catch (error) {
      console.error('清理缓存文件失败:', error);
    }
  }

  cleanupBySize() {
    const files = fs.readdirSync(this.previewDir)
      .map(f => {
        const filePath = path.join(this.previewDir, f);
        const stats = fs.statSync(filePath);
        return {
          name: f,
          path: filePath,
          size: stats.size,
          mtime: stats.mtimeMs
        };
      })
      .sort((a, b) => a.mtime - b.mtime); // 按修改时间排序，旧的在前
    
    let currentSize = files.reduce((sum, file) => sum + file.size, 0);
    
    for (const file of files) {
      if (currentSize <= this.maxCacheSize * 0.8) { // 清理到80%
        break;
      }
      
      try {
        fs.unlinkSync(file.path);
        currentSize -= file.size;
        console.log('清理缓存文件:', file.name);
      } catch (error) {
        console.error('删除文件失败:', error);
      }
    }
  }

  cleanupAllCache() {
    try {
      // 清空内存缓存
      this.previewCache.clear();
      
      // 删除磁盘缓存文件
      const files = fs.readdirSync(this.previewDir);
      for (const file of files) {
        const filePath = path.join(this.previewDir, file);
        fs.unlinkSync(filePath);
      }
      
      // 删除缩略图文件
      const thumbnails = fs.readdirSync(this.thumbnailDir);
      for (const thumb of thumbnails) {
        const thumbPath = path.join(this.thumbnailDir, thumb);
        fs.unlinkSync(thumbPath);
      }
      
      console.log('所有缓存已清理');
      return { success: true, message: '缓存清理完成' };
    } catch (error) {
      console.error('清理缓存失败:', error);
      return { success: false, error: error.message };
    }
  }

  getCacheInfo() {
    const memoryCacheSize = this.previewCache.size;
    
    let diskCacheSize = 0;
    let diskCacheCount = 0;
    
    try {
      const files = fs.readdirSync(this.previewDir);
      diskCacheCount = files.length;
      
      for (const file of files) {
        const filePath = path.join(this.previewDir, file);
        const stats = fs.statSync(filePath);
        diskCacheSize += stats.size;
      }
    } catch (error) {
      console.error('获取缓存信息失败:', error);
    }
    
    return {
      memoryCache: {
        entries: memoryCacheSize,
        maxAge: '1小时'
      },
      diskCache: {
        entries: diskCacheCount,
        size: this.formatFileSize(diskCacheSize),
        maxAge: '24小时',
        location: this.previewDir
      },
      supportedFormats: this.supportedFormats
    };
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }
}

module.exports = FilePreviewManager;