const { ipcRenderer } = require('electron');

// DOM元素
const ffmpegStatusElement = document.getElementById('ffmpeg-status');
const selectFolderBtn = document.getElementById('select-folder-btn');
const selectedPathElement = document.getElementById('selected-path');
const fileListElement = document.getElementById('file-list');
const deleteSelectedBtn = document.getElementById('delete-selected-btn');
const formatFilenameBtn = document.getElementById('format-filename-btn');
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const selectionCountElement = document.getElementById('selection-count');
const selectionSizeElement = document.getElementById('selection-size');

// 当前选中的文件夹路径
let currentFolderPath = null;

// 选中的文件管理
let selectedFiles = new Set();

// 存储文件信息的映射，用于计算选中文件的总大小
let fileInfoMap = new Map();

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 格式化文件名：文件名大写，扩展名小写
function formatFilename(filename) {
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1) {
    // 没有扩展名的情况，只转换文件名为大写
    return filename.toUpperCase();
  }
  
  const nameWithoutExt = filename.substring(0, lastDotIndex);
  const extension = filename.substring(lastDotIndex + 1);
  
  // 将文件名转为大写，扩展名转为小写
  const formattedName = nameWithoutExt.toUpperCase();
  const formattedExt = extension.toLowerCase();
  
  return `${formattedName}.${formattedExt}`;
}

// 格式化选中文件的文件名
async function formatSelectedFilenames() {
  if (selectedFiles.size === 0) {
    alert('请先选择要格式化的文件');
    return;
  }
  
  try {
    const filesToFormat = Array.from(selectedFiles);
    const formatResults = [];
    
    for (const filePath of filesToFormat) {
      const fileInfo = fileInfoMap.get(filePath);
      if (fileInfo && !fileInfo.isDirectory) {
        const newName = formatFilename(fileInfo.name);
        if (newName !== fileInfo.name) {
          // 构建新的完整路径
          const lastSlashIndex = filePath.lastIndexOf('/');
          const dir = filePath.substring(0, lastSlashIndex);
          const newPath = dir + '/' + newName;
          
          formatResults.push({
            oldPath: filePath,
            newPath: newPath,
            newName: newName,
            oldName: fileInfo.name
          });
        }
      }
    }
    
    if (formatResults.length === 0) {
      alert('选中的文件名已经是正确格式，无需格式化');
      return;
    }
    
    // 显示确认对话框
    const fileList = formatResults.map(item => `${item.oldName} → ${item.newName}`).join('\n');
    const confirmed = await showCustomConfirm(
      '确认格式化文件名',
      `将要格式化 ${formatResults.length} 个文件的文件名：\n\n${fileList}\n\n此操作不可撤销，确定要继续吗？`
    );
    
    if (!confirmed) return;
    
    // 调用主进程进行文件重命名
    let successCount = 0;
    let errorCount = 0;
    
    for (const item of formatResults) {
      try {
        await ipcRenderer.invoke('rename-file', {
          oldPath: item.oldPath,
          newPath: item.newPath
        });
        successCount++;
      } catch (error) {
        console.error(`重命名失败: ${item.oldName}`, error);
        errorCount++;
      }
    }
    
    // 重新加载文件夹内容
    if (currentFolderPath) {
      loadFolderContent(currentFolderPath);
    }
    
    // 显示结果
    if (errorCount === 0) {
      alert(`成功格式化了 ${successCount} 个文件的文件名`);
    } else {
      alert(`格式化完成：成功 ${successCount} 个，失败 ${errorCount} 个`);
    }
    
  } catch (error) {
    console.error('格式化文件名失败:', error);
    alert('格式化文件名失败: ' + error.message);
  }
}

// 创建右键菜单
function createContextMenu(file, x, y) {
  // 移除已存在的菜单
  const existingMenu = document.querySelector('.context-menu');
  if (existingMenu) {
    existingMenu.remove();
  }
  
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  
  // 根据文件类型创建菜单项
  if (file.isVideo) {
    // 裁切菜单项
    const trimItem = document.createElement('div');
    trimItem.className = 'context-menu-item';
    trimItem.innerHTML = '<span class="context-menu-icon">✂️</span>裁切视频';
    trimItem.addEventListener('click', () => {
      trimVideo(file.path, file.name, file.duration);
      menu.remove();
    });
    menu.appendChild(trimItem);
  }
  

  
  document.body.appendChild(menu);
  
  // 点击其他地方关闭菜单
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  
  // 延迟添加事件监听器，避免立即触发
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
  }, 0);
  
  // 确保菜单不会超出屏幕边界
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = (x - rect.width) + 'px';
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = (y - rect.height) + 'px';
  }
}
async function playVideo(videoPath) {
  try {
    console.log('播放视频:', videoPath);
    await ipcRenderer.invoke('play-video', videoPath);
  } catch (error) {
    console.error('播放视频失败:', error);
    alert('播放视频失败: ' + error.message);
  }
}

// 自定义中文确认对话框
function showCustomConfirm(title, message) {
  return new Promise((resolve) => {
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'custom-confirm-overlay';
    
    // 创建对话框
    const dialog = document.createElement('div');
    dialog.className = 'custom-confirm-dialog';
    
    // 创建标题
    const titleElement = document.createElement('div');
    titleElement.className = 'custom-confirm-title';
    titleElement.textContent = title;
    
    // 创建消息
    const messageElement = document.createElement('div');
    messageElement.className = 'custom-confirm-message';
    messageElement.textContent = message;
    
    // 创建按钮容器
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'custom-confirm-buttons';
    
    // 创建取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'custom-confirm-btn cancel';
    cancelBtn.textContent = '取消';
    
    // 创建确认按钮
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'custom-confirm-btn confirm';
    confirmBtn.textContent = '确认删除';
    
    // 添加事件监听器
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(false);
    });
    
    confirmBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(true);
    });
    
    // 点击遮罩层关闭对话框
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve(false);
      }
    });
    
    // 组装对话框
    buttonsContainer.appendChild(cancelBtn);
    buttonsContainer.appendChild(confirmBtn);
    
    dialog.appendChild(titleElement);
    dialog.appendChild(messageElement);
    dialog.appendChild(buttonsContainer);
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // 聚焦到确认按钮
    confirmBtn.focus();
  });
}

// 显示视频裁切对话框
function showTrimDialog(videoPath, fileName, duration) {
  return new Promise((resolve) => {
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'trim-dialog-overlay';
    
    // 创建对话框
    const dialog = document.createElement('div');
    dialog.className = 'trim-dialog';
    
    // 创建标题
    const title = document.createElement('div');
    title.className = 'trim-dialog-title';
    title.innerHTML = '<span class="trim-icon">✂️</span>视频裁切';
    
    // 创建内容区域
    const content = document.createElement('div');
    content.className = 'trim-dialog-content';
    
    // 文件名显示
    const fileInfo = document.createElement('div');
    fileInfo.style.marginBottom = '16px';
    fileInfo.style.fontSize = '14px';
    fileInfo.style.color = '#666';
    fileInfo.textContent = `文件: ${fileName}`;
    
    // 开始时间输入组
    const startGroup = document.createElement('div');
    startGroup.className = 'trim-input-group';
    
    const startLabel = document.createElement('label');
    startLabel.className = 'trim-input-label';
    startLabel.textContent = '开始时间 (HH:MM:SS)';
    
    const startInput = document.createElement('input');
    startInput.className = 'trim-time-input';
    startInput.type = 'text';
    startInput.value = '00:00:00';
    startInput.placeholder = '00:00:00';
    
    startGroup.appendChild(startLabel);
    startGroup.appendChild(startInput);
    
    // 结束时间输入组
    const endGroup = document.createElement('div');
    endGroup.className = 'trim-input-group';
    
    const endLabel = document.createElement('label');
    endLabel.className = 'trim-input-label';
    endLabel.textContent = '结束时间 (HH:MM:SS)';
    
    const endInput = document.createElement('input');
    endInput.className = 'trim-time-input';
    endInput.type = 'text';
    endInput.value = duration || '00:00:00';
    endInput.placeholder = '00:00:00';
    
    endGroup.appendChild(endLabel);
    endGroup.appendChild(endInput);
    
    // 组装内容
    content.appendChild(fileInfo);
    content.appendChild(startGroup);
    content.appendChild(endGroup);
    
    // 创建按钮容器
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'trim-dialog-buttons';
    
    // 左侧按钮组
    const leftButtons = document.createElement('div');
    leftButtons.className = 'trim-dialog-left-buttons';
    
    // 重置按钮
    const resetBtn = document.createElement('button');
    resetBtn.className = 'trim-dialog-btn reset';
    resetBtn.textContent = '重置';
    
    leftButtons.appendChild(resetBtn);
    
    // 右侧按钮组
    const rightButtons = document.createElement('div');
    rightButtons.className = 'trim-dialog-right-buttons';
    
    // 取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'trim-dialog-btn cancel';
    cancelBtn.textContent = '取消';
    
    // 确认按钮
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'trim-dialog-btn confirm';
    confirmBtn.textContent = '开始裁切';
    
    rightButtons.appendChild(cancelBtn);
    rightButtons.appendChild(confirmBtn);
    
    buttonsContainer.appendChild(leftButtons);
    buttonsContainer.appendChild(rightButtons);
    
    // 检查按钮状态的函数
    function checkButtonState() {
      const isDefault = startInput.value === '00:00:00' && endInput.value === (duration || '00:00:00');
      confirmBtn.disabled = isDefault;
    }
    
    // 初始检查
    checkButtonState();
    
    // 添加输入监听器
    startInput.addEventListener('input', checkButtonState);
    endInput.addEventListener('input', checkButtonState);
    
    // 重置按钮事件
    resetBtn.addEventListener('click', () => {
      startInput.value = '00:00:00';
      endInput.value = duration || '00:00:00';
      checkButtonState();
    });
    
    // 取消按钮事件
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(null);
    });
    
    // 确认按钮事件
    confirmBtn.addEventListener('click', () => {
      const result = {
        startTime: startInput.value,
        endTime: endInput.value
      };
      document.body.removeChild(overlay);
      resolve(result);
    });
    
    // 点击遮罩层关闭对话框
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve(null);
      }
    });
    
    // 组装对话框
    dialog.appendChild(title);
    dialog.appendChild(content);
    dialog.appendChild(buttonsContainer);
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // 聚焦到开始时间输入框
    startInput.focus();
  });
}

// 裁切视频文件
async function trimVideo(videoPath, fileName, duration) {
  try {
    console.log('打开视频裁切对话框:', videoPath);
    
    const result = await showTrimDialog(videoPath, fileName, duration);
    
    if (!result) {
      return; // 用户取消操作
    }
    
    console.log('开始裁切视频:', {
      path: videoPath,
      startTime: result.startTime,
      endTime: result.endTime
    });
    
    // 调用主进程进行视频裁切
    await ipcRenderer.invoke('trim-video', {
      inputPath: videoPath,
      startTime: result.startTime,
      endTime: result.endTime
    });
    
    // 裁切成功后重新加载文件夹内容
    if (currentFolderPath) {
      loadFolderContent(currentFolderPath);
    }
    
  } catch (error) {
    console.error('视频裁切失败:', error);
    alert('视频裁切失败: ' + error.message);
  }
}
async function deleteFile(filePath, fileName) {
  try {
    // 显示自定义中文确认对话框
    const confirmed = await showCustomConfirm(
      '确认删除文件',
      `您确定要删除文件 "${fileName}" 吗？\n\n此操作不可撤销，文件将被永久删除！`
    );
    
    if (!confirmed) {
      return; // 用户取消删除
    }
    
    console.log('删除文件:', filePath);
    await ipcRenderer.invoke('delete-file', filePath);
    
    // 删除成功后重新加载文件夹内容
    if (currentFolderPath) {
      loadFolderContent(currentFolderPath);
    }
    
    // 删除成功，不再显示提示框
  } catch (error) {
    console.error('删除文件失败:', error);
    alert('删除文件失败: ' + error.message);
  }
}

// 接收ffmpeg状态信息
ipcRenderer.on('ffmpeg-status', (event, status) => {
  const statusIndicator = ffmpegStatusElement.querySelector('.status-indicator');
  const statusText = ffmpegStatusElement.querySelector('.status-text');
  
  // 初始状态为检查中
  statusIndicator.classList.remove('installed', 'not-installed');
  statusIndicator.classList.add('checking');
  
  if (status.installed && status.version) {
    // 成功检测到FFmpeg并获取到版本号
    statusIndicator.classList.add('installed');
    statusIndicator.classList.remove('not-installed', 'checking');
    
    // 显示实际检测到的版本号
    const versionText = `ffmpeg ${status.version}`;
    statusText.textContent = versionText;
    
    selectFolderBtn.disabled = false;
  } else {
    // FFmpeg检测失败或无法获取版本号
    statusIndicator.classList.add('not-installed');
    statusIndicator.classList.remove('installed', 'checking');
    
    // 显示未安装提示
    statusText.textContent = 'ffmpeg 未安装';
    
    selectFolderBtn.disabled = true;
  }
});

// 选择文件夹按钮点击事件
selectFolderBtn.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('select-folder');
  
  if (!result.canceled && result.folderPath) {
    currentFolderPath = result.folderPath;
    selectedPathElement.textContent = currentFolderPath;
    loadFolderContent(currentFolderPath);
  }
});

// 文件路径双击事件 - 打开系统文件夹
selectedPathElement.addEventListener('dblclick', async () => {
  if (currentFolderPath) {
    try {
      await ipcRenderer.invoke('open-folder', currentFolderPath);
    } catch (error) {
      console.error('打开文件夹失败:', error);
      alert('打开文件夹失败: ' + error.message);
    }
  }
});

// 全局点击事件，用于关闭右键菜单
document.addEventListener('click', () => {
  const existingMenu = document.querySelector('.context-menu');
  if (existingMenu) {
    existingMenu.remove();
  }
});

// 防止右键菜单在点击时关闭
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.context-menu')) {
    e.stopPropagation();
  }
});

// 加载文件夹内容
async function loadFolderContent(folderPath) {
  // 清空文件列表和选择状态
  fileListElement.innerHTML = '<div class="empty-message">加载中...</div>';
  selectedFiles.clear();
  fileInfoMap.clear();
  updateSelectionUI();
  
  try {
    const files = await ipcRenderer.invoke('get-folder-content', folderPath);
    
    if (files.error) {
      fileListElement.innerHTML = `<div class="empty-message error-message">错误: ${files.error}</div>`;
      return;
    }
    
    if (files.length === 0) {
      // 清空文件列表
      fileListElement.innerHTML = '';
      
      // 检查是否可以返回上级目录
      const path = require('path');
      const parentPath = path.dirname(folderPath);
      const canGoUp = parentPath !== folderPath; // 如果父路径和当前路径不同，说明可以返回上级
      
      // 如果可以返回上级，添加返回上级目录的条目
      if (canGoUp) {
        const backItem = document.createElement('div');
        backItem.className = 'file-item back-item parent-directory';
        
        // 空的复选框列（不可选择）
        const backCheckboxCol = document.createElement('div');
        backCheckboxCol.className = 'file-checkbox-col';
        
        // 文件名显示为返回上级
        const backFileName = document.createElement('div');
        backFileName.className = 'file-name';
        
        const backIcon = document.createElement('span');
        backIcon.className = 'file-icon';
        backIcon.textContent = '⬆️';
        
        const backNameText = document.createElement('span');
        backNameText.className = 'file-name-text directory-name';
        backNameText.textContent = '返回上级';
        backNameText.style.fontWeight = 'bold';
        backNameText.style.color = '#666';
        
        backFileName.appendChild(backIcon);
        backFileName.appendChild(backNameText);
        
        // 其他列显示为空或占位符
        const backSize = document.createElement('div');
        backSize.className = 'file-size';
        backSize.textContent = '--';
        
        const backDuration = document.createElement('div');
        backDuration.className = 'file-duration';
        backDuration.textContent = '--';
        
        const backResolution = document.createElement('div');
        backResolution.className = 'file-resolution';
        backResolution.textContent = '--';
        
        const backBitrate = document.createElement('div');
        backBitrate.className = 'file-bitrate';
        backBitrate.textContent = '--';
        
        const backCodec = document.createElement('div');
        backCodec.className = 'file-codec';
        backCodec.textContent = '--';
        
        // 添加双击事件 - 返回上级目录
        backItem.addEventListener('dblclick', (e) => {
          e.preventDefault();
          currentFolderPath = parentPath;
          selectedPathElement.textContent = parentPath;
          loadFolderContent(parentPath);
        });
        
        // 添加悬停效果
        backItem.addEventListener('mouseenter', () => {
          backItem.style.backgroundColor = '#f0f0f0';
        });
        
        backItem.addEventListener('mouseleave', () => {
          backItem.style.backgroundColor = '';
        });
        
        // 组装返回条目
        backItem.appendChild(backCheckboxCol);
        backItem.appendChild(backFileName);
        backItem.appendChild(backSize);
        backItem.appendChild(backDuration);
        backItem.appendChild(backResolution);
        backItem.appendChild(backBitrate);
        backItem.appendChild(backCodec);
        
        // 添加到文件列表
        fileListElement.appendChild(backItem);
      }
      
      // 添加空文件夹提示
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-message';
      emptyMessage.textContent = '文件夹为空';
      fileListElement.appendChild(emptyMessage);
      
      return;
    }
    
    // 清空文件列表
    fileListElement.innerHTML = '';
    
    // 检查是否可以返回上级目录
    const path = require('path');
    const parentPath = path.dirname(folderPath);
    const canGoUp = parentPath !== folderPath; // 如果父路径和当前路径不同，说明可以返回上级
    
    // 如果可以返回上级，添加返回上级目录的条目
    if (canGoUp) {
      const backItem = document.createElement('div');
      backItem.className = 'file-item back-item parent-directory';
      
      // 空的复选框列（不可选择）
      const backCheckboxCol = document.createElement('div');
      backCheckboxCol.className = 'file-checkbox-col';
      
      // 文件名显示为 ...
      const backFileName = document.createElement('div');
      backFileName.className = 'file-name';
      
      const backIcon = document.createElement('span');
      backIcon.className = 'file-icon';
      backIcon.textContent = '⬆️';
      
      const backNameText = document.createElement('span');
      backNameText.className = 'file-name-text directory-name';
      backNameText.textContent = '返回上级';
      backNameText.style.fontWeight = 'bold';
      backNameText.style.color = '#666';
      
      backFileName.appendChild(backIcon);
      backFileName.appendChild(backNameText);
      
      // 其他列显示为空或占位符
      const backSize = document.createElement('div');
      backSize.className = 'file-size';
      backSize.textContent = '--';
      
      const backDuration = document.createElement('div');
      backDuration.className = 'file-duration';
      backDuration.textContent = '--';
      
      const backResolution = document.createElement('div');
      backResolution.className = 'file-resolution';
      backResolution.textContent = '--';
      
      const backBitrate = document.createElement('div');
      backBitrate.className = 'file-bitrate';
      backBitrate.textContent = '--';
      
      const backCodec = document.createElement('div');
      backCodec.className = 'file-codec';
      backCodec.textContent = '--';
      
      // 添加双击事件 - 返回上级目录
      backItem.addEventListener('dblclick', (e) => {
        e.preventDefault();
        currentFolderPath = parentPath;
        selectedPathElement.textContent = parentPath;
        loadFolderContent(parentPath);
      });
      
      // 添加悬停效果
      backItem.addEventListener('mouseenter', () => {
        backItem.style.backgroundColor = '#f0f0f0';
      });
      
      backItem.addEventListener('mouseleave', () => {
        backItem.style.backgroundColor = '';
      });
      
      // 组装返回条目
      backItem.appendChild(backCheckboxCol);
      backItem.appendChild(backFileName);
      backItem.appendChild(backSize);
      backItem.appendChild(backDuration);
      backItem.appendChild(backResolution);
      backItem.appendChild(backBitrate);
      backItem.appendChild(backCodec);
      
      // 添加到文件列表的最前面
      fileListElement.appendChild(backItem);
    }
    
    // 按照文件夹在前，文件在后的顺序排序
    const sortedFiles = [...files].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    
    // 渲染文件列表
    sortedFiles.forEach(file => {
      // 存储文件信息到映射中
      fileInfoMap.set(file.path, {
        name: file.name,
        size: file.size || 0,
        isDirectory: file.isDirectory
      });
      
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      fileItem.dataset.filePath = file.path;
      if (file.isHidden) {
        fileItem.classList.add('hidden-file');
      }
      
      // 复选框列
      const checkboxCol = document.createElement('div');
      checkboxCol.className = 'file-checkbox-col';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'file-checkbox';
      checkbox.dataset.filePath = file.path;
      checkbox.addEventListener('change', (e) => {
        handleFileSelection(file.path, e.target.checked);
      });
      
      checkboxCol.appendChild(checkbox);
      
      // 文件名
      const fileName = document.createElement('div');
      fileName.className = 'file-name';
      
      const fileIcon = document.createElement('span');
      fileIcon.className = 'file-icon';
      fileIcon.textContent = file.isDirectory ? '📁' : file.isVideo ? '🎬' : '📄';
      
      const fileNameText = document.createElement('span');
      fileNameText.className = 'file-name-text';
      fileNameText.textContent = file.name;
      fileNameText.title = ''; // 移除默认的title提示
      if (file.isDirectory) {
        fileNameText.classList.add('directory-name');
      }
      
      // 创建tooltip元素用于显示完整文件名
      const tooltip = document.createElement('div');
      tooltip.className = 'file-name-tooltip';
      tooltip.textContent = file.name;
      
      // 添加鼠标事件
      fileNameText.addEventListener('mouseenter', function() {
        // 只有当文件名被截断时才显示tooltip
        if (this.scrollWidth > this.clientWidth) {
          // 获取文件名文本元素在页面中的绝对位置
          const textRect = this.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          
          // 计算提示框的位置
          const tooltipHeight = 30; // 估算提示框高度
          const spaceAbove = textRect.top;
          const spaceBelow = viewportHeight - textRect.bottom;
          
          // 设置水平位置
          tooltip.style.left = textRect.left + 'px';
          
          // 判断是否有足够空间在上方显示提示框
          if (spaceAbove >= tooltipHeight + 5) {
            // 在上方显示
            tooltip.style.top = (textRect.top - tooltipHeight - 5) + 'px';
            tooltip.style.bottom = 'auto';
          } else {
            // 在下方显示
            tooltip.style.top = (textRect.bottom + 5) + 'px';
            tooltip.style.bottom = 'auto';
          }
          
          tooltip.style.display = 'block';
        }
      });
      
      fileNameText.addEventListener('mouseleave', function() {
        tooltip.style.display = 'none';
      });
      
      fileNameText.addEventListener('click', function() {
        // 点击时切换tooltip显示状态
        if (tooltip.style.display === 'block') {
          tooltip.style.display = 'none';
        } else if (this.scrollWidth > this.clientWidth) {
          // 获取文件名文本元素在页面中的绝对位置
          const textRect = this.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          
          // 计算提示框的位置
          const tooltipHeight = 30; // 估算提示框高度
          const spaceAbove = textRect.top;
          const spaceBelow = viewportHeight - textRect.bottom;
          
          // 设置水平位置
          tooltip.style.left = textRect.left + 'px';
          
          // 判断是否有足够空间在上方显示提示框
          if (spaceAbove >= tooltipHeight + 5) {
            // 在上方显示
            tooltip.style.top = (textRect.top - tooltipHeight - 5) + 'px';
            tooltip.style.bottom = 'auto';
          } else {
            // 在下方显示
            tooltip.style.top = (textRect.bottom + 5) + 'px';
            tooltip.style.bottom = 'auto';
          }
          
          tooltip.style.display = 'block';
        }
      });
      
      fileName.appendChild(fileIcon);
      fileName.appendChild(fileNameText);
      fileName.appendChild(tooltip);
      
      // 文件大小
      const fileSize = document.createElement('div');
      fileSize.className = 'file-size';
      fileSize.textContent = formatFileSize(file.size);
      
      // 创建视频详情列
      const fileDuration = document.createElement('div');
      fileDuration.className = 'file-duration';
      
      const fileResolution = document.createElement('div');
      fileResolution.className = 'file-resolution';
      
      const fileBitrate = document.createElement('div');
      fileBitrate.className = 'file-bitrate';
      
      const fileCodec = document.createElement('div');
      fileCodec.className = 'file-codec';
      
      // 填充视频详情信息
      if (file.isVideo) {
        if (file.ffmpegError) {
          fileDuration.textContent = '--';
          fileResolution.textContent = '--';
          fileBitrate.textContent = '--';
          fileCodec.textContent = '--';
        } else {
          fileDuration.textContent = file.duration || '--';
          fileResolution.textContent = file.resolution || '--';
          fileBitrate.textContent = file.bitrate || '--';
          fileCodec.textContent = file.codec || '--';
        }
      } else {
        fileDuration.textContent = '--';
        fileResolution.textContent = '--';
        fileBitrate.textContent = '--';
        fileCodec.textContent = '--';
      }
      
      // 添加右键菜单事件
      fileItem.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        createContextMenu(file, e.clientX, e.clientY);
      });
      
      // 添加双击事件 - 如果是文件夹则进入该文件夹，如果是视频文件则播放
      fileItem.addEventListener('dblclick', (e) => {
        if (file.isDirectory) {
          e.preventDefault();
          loadFolderContent(file.path);
          // 更新当前文件夹路径显示
          currentFolderPath = file.path;
          selectedPathElement.textContent = file.path;
        } else if (file.isVideo) {
          e.preventDefault();
          playVideo(file.path);
        }
      });
      
      // 添加到文件项
      fileItem.appendChild(checkboxCol);
      fileItem.appendChild(fileName);
      fileItem.appendChild(fileSize);
      fileItem.appendChild(fileDuration);
      fileItem.appendChild(fileResolution);
      fileItem.appendChild(fileBitrate);
      fileItem.appendChild(fileCodec);
      
      // 添加到文件列表
      fileListElement.appendChild(fileItem);
    });
  } catch (error) {
    fileListElement.innerHTML = `<div class="empty-message error-message">错误: ${error.message}</div>`;
  }
}

// 选择管理功能
function handleFileSelection(filePath, isSelected) {
  if (isSelected) {
    selectedFiles.add(filePath);
  } else {
    selectedFiles.delete(filePath);
  }
  
  // 更新文件项的选中状态
  const fileItem = document.querySelector(`[data-file-path="${filePath}"]`);
  if (fileItem) {
    if (isSelected) {
      fileItem.classList.add('selected');
    } else {
      fileItem.classList.remove('selected');
    }
  }
  
  updateSelectionUI();
}

function updateSelectionUI() {
  const selectedCount = selectedFiles.size;
  const totalCheckboxes = document.querySelectorAll('.file-checkbox').length;
  
  // 更新删除按钮和格式化按钮状态
  deleteSelectedBtn.disabled = selectedCount === 0;
  formatFilenameBtn.disabled = selectedCount === 0;
  
  // 计算选中文件的总大小
  let totalSize = 0;
  let fileCount = 0;
  let dirCount = 0;
  
  selectedFiles.forEach(filePath => {
    const fileInfo = fileInfoMap.get(filePath);
    if (fileInfo) {
      if (fileInfo.isDirectory) {
        dirCount++;
        // 文件夹也有大小，需要包含在总计中
        totalSize += fileInfo.size || 0;
      } else {
        fileCount++;
        totalSize += fileInfo.size || 0;
      }
    }
  });
  
  // 更新选择计数和大小显示
  if (selectedCount === 0) {
    selectionCountElement.textContent = '未选择文件';
    selectionSizeElement.textContent = '';
  } else {
    // 构建选择信息文本
    let countText = '';
    if (fileCount > 0 && dirCount > 0) {
      countText = `已选择 ${fileCount} 个文件，${dirCount} 个文件夹`;
    } else if (fileCount > 0) {
      countText = `已选择 ${fileCount} 个文件`;
    } else if (dirCount > 0) {
      countText = `已选择 ${dirCount} 个文件夹`;
    }
    
    selectionCountElement.textContent = countText;
    
    // 显示总大小（包括文件和文件夹）
    if (totalSize > 0) {
      selectionSizeElement.textContent = `总大小: ${formatFileSize(totalSize)}`;
    } else {
      selectionSizeElement.textContent = '';
    }
  }
  
  // 更新全选复选框状态
  if (totalCheckboxes === 0) {
    selectAllCheckbox.indeterminate = false;
    selectAllCheckbox.checked = false;
  } else if (selectedCount === 0) {
    selectAllCheckbox.indeterminate = false;
    selectAllCheckbox.checked = false;
  } else if (selectedCount === totalCheckboxes) {
    selectAllCheckbox.indeterminate = false;
    selectAllCheckbox.checked = true;
  } else {
    selectAllCheckbox.indeterminate = true;
    selectAllCheckbox.checked = false;
  }
}

// 全选/取消全选功能
selectAllCheckbox.addEventListener('change', (e) => {
  const checkboxes = document.querySelectorAll('.file-checkbox');
  const shouldSelect = e.target.checked;
  
  checkboxes.forEach(checkbox => {
    checkbox.checked = shouldSelect;
    handleFileSelection(checkbox.dataset.filePath, shouldSelect);
  });
});

// 删除选中文件功能
deleteSelectedBtn.addEventListener('click', async () => {
  if (selectedFiles.size === 0) return;
  
  const fileCount = selectedFiles.size;
  const confirmed = await showCustomConfirm(
    '确认删除文件',
    `您确定要删除选中的 ${fileCount} 个文件吗？\n\n此操作不可撤销，文件将被永久删除！`
  );
  
  if (!confirmed) return;
  
  try {
    // 转换为数组以便批量删除
    const filesToDelete = Array.from(selectedFiles);
    
    // 逐个删除文件
    for (const filePath of filesToDelete) {
      await ipcRenderer.invoke('delete-file', filePath);
    }
    
    // 删除成功后重新加载文件夹内容
    if (currentFolderPath) {
      loadFolderContent(currentFolderPath);
    }
    
  } catch (error) {
    console.error('删除文件失败:', error);
    alert('删除文件失败: ' + error.message);
  }
});

// 格式化文件名功能
formatFilenameBtn.addEventListener('click', async () => {
  await formatSelectedFilenames();
});

// 页面初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 获取并显示版本信息
  try {
    const versionInfo = await ipcRenderer.invoke('get-app-version');
    const versionElement = document.getElementById('app-version');
    if (versionElement) {
      if (versionInfo && versionInfo.version) {
        versionElement.textContent = versionInfo.version;
      } else {
        versionElement.textContent = '1.0.0'; // 默认版本号
      }
    }
  } catch (error) {
    console.error('获取版本信息失败:', error);
    // 如果获取失败，显示默认版本号
    const versionElement = document.getElementById('app-version');
    if (versionElement) {
      versionElement.textContent = '1.0.0';
    }
  }
});