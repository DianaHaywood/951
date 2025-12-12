import React, { useState, useEffect } from 'react';
import { 
  Layout, Menu, Card, Row, Col, Table, Button, Modal, 
  Progress, Tag, Upload, Form, Input, Select, DatePicker,
  Space, message, Statistic, Timeline, Tree, Avatar,
  Badge, Dropdown, Tabs, List, Descriptions, Tooltip
} from 'antd';
import {
  FolderOutlined,
  FileOutlined,
  DashboardOutlined,
  ScheduleOutlined,
  SecurityScanOutlined,
  UploadOutlined,
  EyeOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
  FilterOutlined,
  SettingOutlined,
  UserOutlined,
  TeamOutlined,
  HistoryOutlined,
  StarOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  LockOutlined
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;
const { TabPane } = Tabs;
const { Option } = Select;
const { TextArea } = Input;

const Dashboard = () => {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [scheduleNodes, setScheduleNodes] = useState([]);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filteredFiles, setFilteredFiles] = useState([]);
  const [activeTab, setActiveTab] = useState('files');
  const [projectModalVisible, setProjectModalVisible] = useState(false);
  const [fileModalVisible, setFileModalVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState({
    name: '管理员',
    role: 'admin',
    department: '研发部'
  });

  // 初始化加载数据
  useEffect(() => {
    loadInitialData();
    setupAutoRefresh();
  }, []);

  useEffect(() => {
    filterFiles();
  }, [files, searchText]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // 加载项目
      const projectsResult = await window.electronAPI.dbQuery(
        'SELECT * FROM projects WHERE deleted = 0 ORDER BY created_at DESC'
      );
      setProjects(projectsResult.data || []);

      if (projectsResult.data && projectsResult.data.length > 0) {
        const firstProject = projectsResult.data[0];
        setSelectedProject(firstProject);
        await loadProjectDetails(firstProject.id);
      }

      // 加载用户设置
      const userResult = await window.electronAPI.dbQuery(
        'SELECT * FROM user_settings WHERE user_id = ?',
        ['admin']
      );
      if (userResult.data && userResult.data.length > 0) {
        setCurrentUser(userResult.data[0]);
      }

      message.success('数据加载完成');
    } catch (error) {
      message.error('数据加载失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadProjectDetails = async (projectId) => {
    try {
      // 加载文件
      const filesResult = await window.electronAPI.dbQuery(
        `SELECT * FROM process_files 
         WHERE project_id = ? AND deleted = 0 
         ORDER BY upload_date DESC`,
        [projectId]
      );
      setFiles(filesResult.data || []);

      // 加载进度节点
      const nodesResult = await window.electronAPI.dbQuery(
        `SELECT * FROM schedule_nodes 
         WHERE project_id = ? AND deleted = 0 
         ORDER BY planned_start_date`,
        [projectId]
      );
      setScheduleNodes(nodesResult.data || []);
    } catch (error) {
      console.error('加载项目详情失败:', error);
    }
  };

  const setupAutoRefresh = () => {
    // 每5分钟自动刷新数据
    const interval = setInterval(() => {
      if (selectedProject) {
        loadProjectDetails(selectedProject.id);
      }
    }, 300000);

    return () => clearInterval(interval);
  };

  const filterFiles = () => {
    if (!searchText.trim()) {
      setFilteredFiles(files);
      return;
    }

    const filtered = files.filter(file =>
      file.file_name.toLowerCase().includes(searchText.toLowerCase()) ||
      file.description?.toLowerCase().includes(searchText.toLowerCase()) ||
      file.tags?.toLowerCase().includes(searchText.toLowerCase())
    );
    setFilteredFiles(filtered);
  };

  const handleFileUpload = async () => {
    try {
      const result = await window.electronAPI.openFileDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: '所有文件', extensions: ['*'] },
          { name: '文档', extensions: ['pdf', 'doc', 'docx', 'txt'] },
          { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp'] },
          { name: '表格', extensions: ['xls', 'xlsx', 'csv'] }
        ]
      });

      if (result.canceled) return;

      const uploadPromises = result.filePaths.map(async (filePath) => {
        const statsResult = await window.electronAPI.getFileStats(filePath);
        if (!statsResult.success) throw new Error('获取文件信息失败');

        const fileName = filePath.split('/').pop().split('\\').pop();
        const fileType = fileName.split('.').pop().toLowerCase();

        return {
          project_id: selectedProject.id,
          file_name: fileName,
          original_name: fileName,
          file_path: filePath,
          file_type: fileType,
          file_size: statsResult.stats.size,
          upload_user: currentUser.user_name,
          security_level: selectedProject.security_level || '内部',
          classification: '一般',
          tags: '',
          description: ''
        };
      });

      const fileData = await Promise.all(uploadPromises);

      // 批量插入数据库
      for (const file of fileData) {
        await window.electronAPI.dbExecute(
          `INSERT INTO process_files 
           (project_id, file_name, original_name, file_path, file_type, 
            file_size, upload_user, security_level, classification) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            file.project_id,
            file.file_name,
            file.original_name,
            file.file_path,
            file.file_type,
            file.file_size,
            file.upload_user,
            file.security_level,
            file.classification
          ]
        );
      }

      // 刷新文件列表
      await loadProjectDetails(selectedProject.id);

      message.success(`成功上传 ${fileData.length} 个文件`);
    } catch (error) {
      message.error('上传失败: ' + error.message);
    }
  };

  const handlePreview = async (file) => {
    try {
      const previewResult = await window.electronAPI.generatePreview(
        file.file_path,
        file.file_type
      );

      if (!previewResult.success) {
        throw new Error(previewResult.error);
      }

      setPreviewFile({
        ...file,
        preview: previewResult.preview
      });
      setPreviewVisible(true);
    } catch (error) {
      message.error('预览失败: ' + error.message);
    }
  };

  const handleOpenFile = async (file) => {
    try {
      const result = await window.electronAPI.openPath(file.file_path);
      if (!result.success) {
        throw new Error(result.error);
      }

      // 记录文件访问
      await window.electronAPI.dbExecute(
        `INSERT INTO file_access_logs 
         (file_id, user_id, user_name, access_type, action) 
         VALUES (?, ?, ?, ?, ?)`,
        [file.id, currentUser.user_id, currentUser.user_name, 'open', '打开文件']
      );
    } catch (error) {
      message.error('打开文件失败: ' + error.message);
    }
  };

  const handleDeleteFile = (file) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除文件 "${file.file_name}" 的记录吗？\n原始文件不会被删除。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await window.electronAPI.dbExecute(
            'UPDATE process_files SET deleted = 1 WHERE id = ?',
            [file.id]
          );

          // 刷新文件列表
          await loadProjectDetails(selectedProject.id);

          message.success('文件记录已删除');
        } catch (error) {
          message.error('删除失败: ' + error.message);
        }
      }
    });
  };

  const handleCreateProject = () => {
    setProjectModalVisible(true);
  };

  const handleCreateFile = () => {
    setFileModalVisible(true);
  };

  const getSecurityLevelColor = (level) => {
    const colors = {
      '公开': 'green',
      '内部': 'blue',
      '秘密': 'orange',
      '机密': 'red',
      '绝密': 'purple'
    };
    return colors[level] || 'default';
  };

  const getStatusColor = (status) => {
    const colors = {
      '未开始': 'default',
      '进行中': 'processing',
      '已完成': 'success',
      '延期': 'warning',
      '暂停': 'error'
    };
    return colors[status] || 'default';
  };

  const columns = [
    {
      title: '文件名称',
      dataIndex: 'file_name',
      key: 'file_name',
      width: 250,
      render: (text, record) => (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <FileOutlined style={{ marginRight: 8, color: '#1890ff' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '500' }}>{text}</div>
            <div style={{ fontSize: '12px', color: '#999' }}>
              {record.file_type.toUpperCase()} • {formatFileSize(record.file_size)}
            </div>
          </div>
          {record.security_level === '机密' && (
            <LockOutlined style={{ color: '#ff4d4f', marginLeft: 8 }} />
          )}
        </div>
      ),
    },
    {
      title: '安全等级',
      dataIndex: 'security_level',
      key: 'security_level',
      width: 100,
      render: (level) => (
        <Tag color={getSecurityLevelColor(level)}>
          {level}
        </Tag>
      ),
    },
    {
      title: '分类',
      dataIndex: 'classification',
      key: 'classification',
      width: 100,
    },
    {
      title: '上传时间',
      dataIndex: 'upload_date',
      key: 'upload_date',
      width: 150,
      render: (date) => formatDate(date),
    },
    {
      title: '上传用户',
      dataIndex: 'upload_user',
      key: 'upload_user',
      width: 120,
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="预览">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => handlePreview(record)}
            />
          </Tooltip>
          <Tooltip title="打开">
            <Button
              type="text"
              icon={<DownloadOutlined />}
              onClick={() => handleOpenFile(record)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEditFile(record)}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteFile(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const scheduleColumns = [
    {
      title: '节点名称',
      dataIndex: 'node_name',
      key: 'node_name',
      width: 200,
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: '500' }}>{text}</div>
          {record.node_code && (
            <div style={{ fontSize: '12px', color: '#666' }}>
              {record.node_code}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => (
        <Tag color={getStatusColor(status)}>
          {status}
        </Tag>
      ),
    },
    {
      title: '完成率',
      dataIndex: 'completion_rate',
      key: 'completion_rate',
      width: 150,
      render: (rate) => (
        <div>
          <Progress percent={rate} size="small" />
          <div style={{ fontSize: '12px', color: '#666', marginTop: 2 }}>
            {rate}%
          </div>
        </div>
      ),
    },
    {
      title: '计划时间',
      dataIndex: 'planned_start_date',
      key: 'planned_start_date',
      width: 150,
      render: (start, record) => (
        <div>
          {formatDate(start)} ~ {formatDate(record.planned_end_date)}
        </div>
      ),
    },
    {
      title: '负责人',
      dataIndex: 'responsible_person',
      key: 'responsible_person',
      width: 120,
    },
  ];

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN');
  };

  const calculateProjectProgress = () => {
    if (!scheduleNodes.length) return 0;
    
    const completed = scheduleNodes.filter(node => 
      node.status === '已完成'
    ).length;
    
    return Math.round((completed / scheduleNodes.length) * 100);
  };

  const getProjectStats = () => {
    const fileStats = {
      total: files.length,
      images: files.filter(f => ['jpg', 'png', 'gif'].includes(f.file_type)).length,
      documents: files.filter(f => ['pdf', 'doc', 'docx'].includes(f.file_type)).length,
      others: files.filter(f => !['jpg', 'png', 'gif', 'pdf', 'doc', 'docx'].includes(f.file_type)).length
    };

    const scheduleStats = {
      total: scheduleNodes.length,
      completed: scheduleNodes.filter(n => n.status === '已完成').length,
      inProgress: scheduleNodes.filter(n => n.status === '进行中').length,
      delayed: scheduleNodes.filter(n => n.status === '延期').length
    };

    return { fileStats, scheduleStats };
  };

  const { fileStats, scheduleStats } = getProjectStats();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 侧边栏 */}
      <Sider width={280} theme="light" collapsedWidth={0}>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1890ff' }}>
            军工项目管理
          </div>
          <Tag color="red" style={{ marginTop: 8 }}>
            <SecurityScanOutlined /> 涉密系统
          </Tag>
        </div>

        <div style={{ padding: '0 16px', marginBottom: 16 }}>
          <Input
            placeholder="搜索项目..."
            prefix={<SearchOutlined />}
            size="middle"
          />
        </div>

        <Menu
          mode="inline"
          selectedKeys={selectedProject ? [selectedProject.id.toString()] : []}
          style={{ borderRight: 0 }}
        >
          <Menu.Item key="dashboard" icon={<DashboardOutlined />}>
            仪表板
          </Menu.Item>
          
          <Menu.SubMenu key="projects" icon={<FolderOutlined />} title="项目管理">
            <Menu.Item key="new-project" icon={<PlusOutlined />}>
              新建项目
            </Menu.Item>
            <Menu.Divider />
            {projects.map(project => (
              <Menu.Item 
                key={project.id}
                onClick={() => {
                  setSelectedProject(project);
                  loadProjectDetails(project.id);
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <FolderOutlined style={{ marginRight: 8 }} />
                  <span style={{ flex: 1 }}>{project.project_name}</span>
                  <Tag size="small" color={getSecurityLevelColor(project.security_level)}>
                    {project.security_level}
                  </Tag>
                </div>
              </Menu.Item>
            ))}
          </Menu.SubMenu>

          <Menu.Item key="schedule" icon={<ScheduleOutlined />}>
            进度计划
          </Menu.Item>
          
          <Menu.Item key="reports" icon={<FileOutlined />}>
            统计报告
          </Menu.Item>
          
          <Menu.Item key="settings" icon={<SettingOutlined />}>
            系统设置
          </Menu.Item>
        </Menu>

        <div style={{ padding: '16px', marginTop: 'auto', borderTop: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Avatar 
              icon={<UserOutlined />} 
              style={{ backgroundColor: '#1890ff', marginRight: 8 }}
            />
            <div>
              <div style={{ fontWeight: '500' }}>{currentUser.user_name}</div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                {currentUser.department} • {currentUser.role}
              </div>
            </div>
          </div>
        </div>
      </Sider>

      <Layout>
        {/* 头部 */}
        <Header style={{ 
          background: '#fff', 
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
        }}>
          <div>
            <h2 style={{ margin: 0 }}>
              {selectedProject ? selectedProject.project_name : '军工项目管理'}
            </h2>
            {selectedProject && (
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>
                <Tag color="blue">{selectedProject.project_code}</Tag>
                <Tag color={getSecurityLevelColor(selectedProject.security_level)}>
                  {selectedProject.security_level}
                </Tag>
                <Tag color={getStatusColor(selectedProject.status)}>
                  {selectedProject.status}
                </Tag>
              </div>
            )}
          </div>

          <Space>
            <Button
              icon={<CloudUploadOutlined />}
              onClick={handleFileUpload}
              type="primary"
            >
              上传文件
            </Button>
            <Button
              icon={<PlusOutlined />}
              onClick={handleCreateProject}
            >
              新建项目
            </Button>
            <Button
              icon={<SettingOutlined />}
              onClick={() => setActiveTab('settings')}
            >
              设置
            </Button>
          </Space>
        </Header>

        {/* 内容区域 */}
        <Content style={{ margin: '24px 16px', overflow: 'initial' }}>
          {selectedProject ? (
            <>
              {/* 项目概览 */}
              <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="项目进度"
                      value={calculateProjectProgress()}
                      suffix="%"
                      valueStyle={{ color: '#1890ff' }}
                    />
                    <Progress 
                      percent={calculateProjectProgress()} 
                      size="small" 
                      style={{ marginTop: 8 }}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="文件总数"
                      value={fileStats.total}
                      prefix={<FileOutlined />}
                      valueStyle={{ color: '#52c41a' }}
                    />
                    <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
                      图片: {fileStats.images} | 文档: {fileStats.documents}
                    </div>
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="节点总数"
                      value={scheduleStats.total}
                      prefix={<ScheduleOutlined />}
                      valueStyle={{ color: '#fa8c16' }}
                    />
                    <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
                      完成: {scheduleStats.completed} | 进行中: {scheduleStats.inProgress}
                    </div>
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="延期节点"
                      value={scheduleStats.delayed}
                      prefix={<WarningOutlined />}
                      valueStyle={{ color: '#f5222d' }}
                    />
                    <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
                      需要立即关注
                    </div>
                  </Card>
                </Col>
              </Row>

              {/* 选项卡 */}
              <Tabs 
                activeKey={activeTab} 
                onChange={setActiveTab}
                type="card"
              >
                <TabPane tab="过程文件" key="files">
                  <Card
                    title="过程文件管理"
                    extra={
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <Input
                          placeholder="搜索文件..."
                          prefix={<SearchOutlined />}
                          value={searchText}
                          onChange={e => setSearchText(e.target.value)}
                          style={{ width: 200, marginRight: 8 }}
                        />
                        <Button icon={<FilterOutlined />}>筛选</Button>
                      </div>
                    }
                  >
                    <Table
                      columns={columns}
                      dataSource={filteredFiles}
                      rowKey="id"
                      loading={loading}
                      pagination={{ pageSize: 10 }}
                      expandable={{
                        expandedRowRender: record => (
                          <div style={{ margin: 0 }}>
                            <Descriptions size="small" column={2}>
                              <Descriptions.Item label="文件路径">
                                {record.file_path}
                              </Descriptions.Item>
                              <Descriptions.Item label="文件哈希">
                                {record.file_hash || '未计算'}
                              </Descriptions.Item>
                              <Descriptions.Item label="描述">
                                {record.description || '无'}
                              </Descriptions.Item>
                              <Descriptions.Item label="标签">
                                {record.tags || '无'}
                              </Descriptions.Item>
                            </Descriptions>
                          </div>
                        ),
                        rowExpandable: record => true,
                      }}
                    />
                  </Card>
                </TabPane>

                <TabPane tab="进度计划" key="schedule">
                  <Card title="项目进度计划">
                    <Table
                      columns={scheduleColumns}
                      dataSource={scheduleNodes}
                      rowKey="id"
                      loading={loading}
                      pagination={{ pageSize: 10 }}
                    />
                  </Card>
                </TabPane>

                <TabPane tab="项目信息" key="info">
                  <Card title="项目详情">
                    {selectedProject && (
                      <Descriptions bordered column={2}>
                        <Descriptions.Item label="项目代号">
                          {selectedProject.project_code}
                        </Descriptions.Item>
                        <Descriptions.Item label="项目类型">
                          {selectedProject.project_type}
                        </Descriptions.Item>
                        <Descriptions.Item label="安全等级">
                          <Tag color={getSecurityLevelColor(selectedProject.security_level)}>
                            {selectedProject.security_level}
                          </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="密级">
                          {selectedProject.classification}
                        </Descriptions.Item>
                        <Descriptions.Item label="开始时间">
                          {formatDate(selectedProject.start_date)}
                        </Descriptions.Item>
                        <Descriptions.Item label="结束时间">
                          {formatDate(selectedProject.end_date)}
                        </Descriptions.Item>
                        <Descriptions.Item label="项目状态">
                          <Tag color={getStatusColor(selectedProject.status)}>
                            {selectedProject.status}
                          </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="项目负责人">
                          {selectedProject.manager}
                        </Descriptions.Item>
                        <Descriptions.Item label="预算" span={2}>
                          {selectedProject.budget ? `¥${selectedProject.budget.toLocaleString()}` : '未设置'}
                        </Descriptions.Item>
                        <Descriptions.Item label="项目描述" span={2}>
                          {selectedProject.description || '无'}
                        </Descriptions.Item>
                      </Descriptions>
                    )}
                  </Card>
                </TabPane>

                <TabPane tab="统计分析" key="stats">
                  <Row gutter={[16, 16]}>
                    <Col span={12}>
                      <Card title="文件类型分布">
                        {/* 这里可以添加图表 */}
                      </Card>
                    </Col>
                    <Col span={12}>
                      <Card title="进度趋势">
                        {/* 这里可以添加图表 */}
                      </Card>
                    </Col>
                  </Row>
                </TabPane>
              </Tabs>
            </>
          ) : (
            <Card style={{ textAlign: 'center', padding: '40px' }}>
              <DashboardOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: 16 }} />
              <h3>欢迎使用军工项目管理软件</h3>
              <p style={{ color: '#666', marginBottom: 24 }}>
                请选择一个项目或创建新项目开始使用
              </p>
              <Button type="primary" size="large" onClick={handleCreateProject}>
                创建第一个项目
              </Button>
            </Card>
          )}
        </Content>
      </Layout>

      {/* 文件预览模态框 */}
      <Modal
        title="文件预览"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={[
          <Button key="open" type="primary" onClick={() => handleOpenFile(previewFile)}>
            打开文件
          </Button>,
          <Button key="close" onClick={() => setPreviewVisible(false)}>
            关闭
          </Button>
        ]}
        width="80%"
        style={{ top: 20 }}
        bodyStyle={{ padding: 0 }}
      >
        {previewFile && (
          <div style={{ height: '70vh', overflow: 'auto' }}>
            {previewFile.preview?.type === 'image' ? (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <img
                  src={previewFile.preview.data}
                  alt={previewFile.file_name}
                  style={{ maxWidth: '100%', maxHeight: '60vh' }}
                />
              </div>
            ) : previewFile.preview?.type === 'text' ? (
              <pre style={{ 
                background: '#f5f5f5',
                padding: 24,
                margin: 0,
                borderRadius: 0,
                whiteSpace: 'pre-wrap',
                fontSize: '14px',
                lineHeight: '1.6'
              }}>
                {previewFile.preview.data}
              </pre>
            ) : previewFile.preview?.type === 'error' ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <WarningOutlined style={{ fontSize: '48px', color: '#faad14', marginBottom: 16 }} />
                <h3>{previewFile.preview.message}</h3>
                <p style={{ color: '#666' }}>
                  {previewFile.preview.error}
                </p>
                <Button
                  type="primary"
                  onClick={() => handleOpenFile(previewFile)}
                  style={{ marginTop: 16 }}
                >
                  使用默认程序打开
                </Button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <FileOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: 16 }} />
                <h3>此文件类型不支持在线预览</h3>
                <p style={{ color: '#666' }}>
                  文件类型: .{previewFile.file_type}
                </p>
                <Button
                  type="primary"
                  onClick={() => handleOpenFile(previewFile)}
                  style={{ marginTop: 16 }}
                >
                  使用默认程序打开
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 新建项目模态框 */}
      <Modal
        title="新建项目"
        open={projectModalVisible}
        onCancel={() => setProjectModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="项目代号" required>
                <Input placeholder="例如：XM2023001" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="项目名称" required>
                <Input placeholder="请输入项目名称" />
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="项目类型">
                <Select placeholder="请选择项目类型">
                  <Option value="科研">科研项目</Option>
                  <Option value="生产">生产项目</Option>
                  <Option value="试验">试验项目</Option>
                  <Option value="维修">维修项目</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="安全等级" required>
                <Select defaultValue="秘密">
                  <Option value="公开">公开</Option>
                  <Option value="内部">内部</Option>
                  <Option value="秘密">秘密</Option>
                  <Option value="机密">机密</Option>
                  <Option value="绝密">绝密</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="开始日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="结束日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item label="项目描述">
            <TextArea rows={4} placeholder="请输入项目描述..." />
          </Form.Item>
          
          <Form.Item>
            <Button type="primary" block>
              创建项目
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
};

export default Dashboard;