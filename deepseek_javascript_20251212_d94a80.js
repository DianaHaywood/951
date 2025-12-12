const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const DatabaseManager = require('./数据库管理器');
const AutoSaveService = require('./自动保存服务');
const FilePreviewManager = require('./文件预览管理器');

let mainWindow;
let dbManager;
let autoSaveService;

// 创建主窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    icon: path.join(__dirname, 'resources/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    titleBarStyle: 'hiddenInset',
    frame: true,
    backgroundColor: '#001529',
    show: false
  });

  // 加载应用
  mainWindow.loadFile(path.join(__dirname, 'src/renderer/index.html'));

  // 初始化服务
  initializeServices();

  // 窗口准备就绪后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // 开发模式下打开开发者工具
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
    }
  });

  // 创建应用菜单
  createApplicationMenu();
}

// 初始化服务
function initializeServices() {
  try {
    // 初始化数据库
    dbManager = new DatabaseManager();
    
    // 初始化自动保存服务
    autoSaveService = new AutoSaveService(dbManager);
    autoSaveService.start();
    
    console.log('所有服务初始化完成');
  } catch (error) {
    console.error('服务初始化失败:', error);
  }
}

// 创建应用菜单
function createApplicationMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建项目',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('create-project');
          }
        },
        {
          label: '导入项目',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: '项目文件', extensions: ['mproj', 'json'] }
              ]
            });
            
            if (!result.canceled) {
              mainWindow.webContents.send('import-project', result.filePaths[0]);
            }
          }
        },
        { type: 'separator' },
        {
          label: '导出项目',
          accelerator: 'CmdOrCtrl+E',
          click: async () => {
            const result = await dialog.showSaveDialog(mainWindow, {
              title: '导出项目',
              defaultPath: '项目备份.mproj',
              filters: [
                { name: '项目文件', extensions: ['mproj'] },
                { name: 'JSON文件', extensions: ['json'] }
              ]
            });
            
            if (!result.canceled) {
              mainWindow.webContents.send('export-project', result.filePath);
            }
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'CmdOrCtrl+Q',
          role: 'quit'
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: '开发者工具', accelerator: 'CmdOrCtrl+Shift+I', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '放大', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: '重置缩放', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' }
      ]
    },
    {
      label: '工具',
      submenu: [
        {
          label: '数据库维护',
          click: () => {
            mainWindow.webContents.send('open-database-tools');
          }
        },
        {
          label: '清理缓存',
          click: async () => {
            const { confirm } = await dialog.showMessageBox(mainWindow, {
              type: 'question',
              title: '清理确认',
              message: '确定要清理所有预览缓存吗？',
              buttons: ['确定', '取消'],
              defaultId: 1
            });
            
            if (confirm === 0) {
              FilePreviewManager.cleanupAllCache();
              mainWindow.webContents.send('cache-cleaned');
            }
          }
        },
        { type: 'separator' },
        {
          label: '系统设置',
          click: () => {
            mainWindow.webContents.send('open-settings');
          }
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '用户手册',
          click: () => {
            shell.openExternal('https://docs.example.com/military-project');
          }
        },
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于军工项目管理',
              message: '军工科研流程管理及进度监控系统\n版本 1.0.0\n\n版权所有 © 2023 国防科技工业局',
              buttons: ['确定']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// 应用准备就绪
app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (autoSaveService) {
      autoSaveService.stop();
    }
    app.quit();
  }
});

// IPC 通信处理
ipcMain.handle('dialog:openFile', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

ipcMain.handle('dialog:openDirectory', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('dialog:saveFile', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('shell:openPath', async (event, path) => {
  try {
    await shell.openPath(path);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('shell:openExternal', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:exists', (event, path) => {
  return fs.existsSync(path);
});

ipcMain.handle('fs:stat', async (event, path) => {
  try {
    const stats = fs.statSync(path);
    return {
      success: true,
      stats: {
        size: stats.size,
        mtime: stats.mtime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile()
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:readFile', async (event, path, encoding = 'utf-8') => {
  try {
    const content = fs.readFileSync(path, encoding);
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:writeFile', async (event, path, content, encoding = 'utf-8') => {
  try {
    fs.writeFileSync(path, content, encoding);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:query', async (event, sql, params = []) => {
  try {
    const result = await dbManager.query(sql, params);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:run', async (event, sql, params = []) => {
  try {
    const result = await dbManager.run(sql, params);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('preview:generate', async (event, filePath, fileType) => {
  try {
    const preview = await FilePreviewManager.generatePreview(filePath, fileType);
    return { success: true, preview };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('autosave:backup', async (event) => {
  try {
    await autoSaveService.performManualBackup();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('autosave:restore', async (event, backupId) => {
  try {
    const result = await autoSaveService.restoreBackup(backupId);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 处理应用崩溃
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  
  // 尝试自动保存当前状态
  if (autoSaveService) {
    autoSaveService.performEmergencySave();
  }
  
  dialog.showErrorBox('应用程序错误', 
    `程序遇到错误需要关闭:\n${error.message}\n\n错误已记录，请重启应用程序。`);
});

// 处理未处理的Promise拒绝
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
});