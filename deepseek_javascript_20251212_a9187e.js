const { contextBridge, ipcRenderer } = require('electron');

// 安全地暴露API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 对话框API
  openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
  saveFileDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  
  // 文件系统API
  fileExists: (path) => ipcRenderer.invoke('fs:exists', path),
  getFileStats: (path) => ipcRenderer.invoke('fs:stat', path),
  readFile: (path, encoding) => ipcRenderer.invoke('fs:readFile', path, encoding),
  writeFile: (path, content, encoding) => ipcRenderer.invoke('fs:writeFile', path, content, encoding),
  
  // 系统API
  openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  
  // 数据库API
  dbQuery: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
  dbExecute: (sql, params) => ipcRenderer.invoke('db:run', sql, params),
  
  // 预览API
  generatePreview: (filePath, fileType) => ipcRenderer.invoke('preview:generate', filePath, fileType),
  
  // 自动保存API
  createBackup: () => ipcRenderer.invoke('autosave:backup'),
  restoreBackup: (backupId) => ipcRenderer.invoke('autosave:restore', backupId),
  
  // 事件监听
  on: (channel, func) => {
    const validChannels = [
      'create-project',
      'import-project',
      'export-project',
      'open-database-tools',
      'cache-cleaned',
      'open-settings'
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  
  // 发送事件
  send: (channel, data) => {
    const validChannels = ['project-created', 'import-complete', 'export-complete'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  }
});

// 为React开发者工具注入（仅开发环境）
if (process.env.NODE_ENV === 'development') {
  require('electron').webFrame.executeJavaScript(`
    const script = document.createElement('script');
    script.src = 'http://localhost:8097';
    document.head.appendChild(script);
  `);
}