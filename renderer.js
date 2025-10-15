const { ipcRenderer } = require('electron');

// 专门用于文件名格式化的确认对话框
function showFormatConfirm(formatResults) {
  return new Promise((resolve) => {
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'custom-confirm-overlay';
    
    // 创建对话框
    const dialog = document.createElement('div');
    dialog.className = 'custom-confirm-dialog format-confirm-dialog';
    
    // 创建标题
    const titleElement = document.createElement('div');
    titleElement.className = 'custom-confirm-title';
    titleElement.textContent = '确认格式化文件名';
    
    // 创建描述
    const descElement = document.createElement('div');
    descElement.className = 'format-confirm-desc';
    descElement.textContent = `将要格式化 ${formatResults.length} 个文件的文件名，此操作不可撤销：`;
    
    // 创建表格容器
    const tableContainer = document.createElement('div');
    tableContainer.className = 'format-table-container';
    
    // 创建表格
    const table = document.createElement('table');
    table.className = 'format-table';
    
    // 创建表头
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    const oldNameHeader = document.createElement('th');
    oldNameHeader.textContent = '原文件名';
    
    const arrowHeader = document.createElement('th');
    arrowHeader.textContent = '';
    arrowHeader.style.width = '40px';
    
    const newNameHeader = document.createElement('th');
    newNameHeader.textContent = '新文件名';
    
    headerRow.appendChild(oldNameHeader);
    headerRow.appendChild(arrowHeader);
    headerRow.appendChild(newNameHeader);
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // 创建表体
    const tbody = document.createElement('tbody');
    
    formatResults.forEach(item => {
      const row = document.createElement('tr');
      
      const oldNameCell = document.createElement('td');
      oldNameCell.textContent = item.oldName;
      oldNameCell.className = 'old-name';
      
      const arrowCell = document.createElement('td');
      arrowCell.innerHTML = '→';
      arrowCell.className = 'arrow';
      
      const newNameCell = document.createElement('td');
      newNameCell.textContent = item.newName;
      newNameCell.className = 'new-name';
      
      row.appendChild(oldNameCell);
      row.appendChild(arrowCell);
      row.appendChild(newNameCell);
      tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    tableContainer.appendChild(table);
    
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
    confirmBtn.textContent = '确认格式化';
    
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
    dialog.appendChild(descElement);
    dialog.appendChild(tableContainer);
    dialog.appendChild(buttonsContainer);
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // 聚焦到确认按钮
    confirmBtn.focus();
  });
}

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

// 排序相关变量
let currentSortField = 'modifiedTime'; // 默认按修改时间排序
let currentSortOrder = 'desc'; // 默认降序（最新的在前）
let currentFiles = []; // 存储当前文件列表用于排序

// 格式化文件大小 - 使用十进制计算方式与macOS系统保持一致
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1000; // 使用1000而不是1024，与macOS系统一致
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 获取文件类型
function getFileType(fileName, isDirectory) {
  if (isDirectory) {
    return '文件夹';
  }
  
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return '文件';
  }
  
  const extension = fileName.substring(lastDotIndex + 1).toLowerCase();
  
  // 定义文件类型映射
  const typeMap = {
    // 视频文件
    'mp4': '视频',
    'avi': '视频',
    'mov': '视频',
    'mkv': '视频',
    'wmv': '视频',
    'flv': '视频',
    'webm': '视频',
    'm4v': '视频',
    '3gp': '视频',
    'mpg': '视频',
    'mpeg': '视频',
    
    // 音频文件
    'mp3': '音频',
    'wav': '音频',
    'flac': '音频',
    'aac': '音频',
    'ogg': '音频',
    'wma': '音频',
    'm4a': '音频',
    
    // 图片文件
    'jpg': '图片',
    'jpeg': '图片',
    'png': '图片',
    'gif': '图片',
    'bmp': '图片',
    'svg': '图片',
    'webp': '图片',
    'tiff': '图片',
    'ico': '图片',
    
    // 文档文件
    'pdf': '文档',
    'doc': '文档',
    'docx': '文档',
    'xls': '文档',
    'xlsx': '文档',
    'ppt': '文档',
    'pptx': '文档',
    'txt': '文档',
    'rtf': '文档',
    
    // 压缩文件
    'zip': '压缩包',
    'rar': '压缩包',
    '7z': '压缩包',
    'tar': '压缩包',
    'gz': '压缩包',
    'bz2': '压缩包',
    
    // 代码文件
    'js': '代码',
    'html': '代码',
    'css': '代码',
    'py': '代码',
    'java': '代码',
    'cpp': '代码',
    'c': '代码',
    'php': '代码',
    'rb': '代码',
    'go': '代码',
    'rs': '代码',
    'swift': '代码',
    'kt': '代码',
    'ts': '代码',
    'jsx': '代码',
    'vue': '代码',
    'json': '代码',
    'xml': '代码',
    'yaml': '代码',
    'yml': '代码',
    
    // 可执行文件
    'exe': '应用程序',
    'app': '应用程序',
    'dmg': '磁盘映像',
    'pkg': '安装包',
    'deb': '安装包',
    'rpm': '安装包',
    'msi': '安装包'
  };
  
  return typeMap[extension] || '文件';
}

// 格式化修改时间
function formatModifiedTime(date) {
  if (!date) return '--';
  
  const modifiedDate = new Date(date);
  
  // 格式化为 YYYY-MM-DD HH:mm:ss 格式
  const year = modifiedDate.getFullYear();
  const month = String(modifiedDate.getMonth() + 1).padStart(2, '0');
  const day = String(modifiedDate.getDate()).padStart(2, '0');
  const hours = String(modifiedDate.getHours()).padStart(2, '0');
  const minutes = String(modifiedDate.getMinutes()).padStart(2, '0');
  const seconds = String(modifiedDate.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 智能截断文件名，保留开头、结尾和扩展名
function truncateFileName(fileName, maxLength = 45) {
  if (fileName.length <= maxLength) {
    return fileName;
  }
  
  // 查找最后一个点的位置（扩展名分隔符）
  const lastDotIndex = fileName.lastIndexOf('.');
  
  if (lastDotIndex === -1) {
    // 没有扩展名的情况
    const keepStart = Math.floor(maxLength * 0.6); // 保留60%给开头
    const keepEnd = maxLength - keepStart - 3; // 剩余部分给结尾，减去省略号的长度
    
    if (keepEnd <= 0) {
      return fileName.substring(0, maxLength - 3) + '...';
    }
    
    return fileName.substring(0, keepStart) + '...' + fileName.substring(fileName.length - keepEnd);
  } else {
    // 有扩展名的情况
    const nameWithoutExt = fileName.substring(0, lastDotIndex);
    const extension = fileName.substring(lastDotIndex);
    
    // 如果扩展名太长，直接截断整个文件名
    if (extension.length > maxLength * 0.3) {
      return fileName.substring(0, maxLength - 3) + '...';
    }
    
    const availableLength = maxLength - extension.length - 3; // 减去扩展名和省略号的长度
    
    if (availableLength <= 0) {
      return fileName.substring(0, maxLength - 3) + '...';
    }
    
    const keepStart = Math.floor(availableLength * 0.7); // 保留70%给开头
    const keepEnd = availableLength - keepStart;
    
    if (keepEnd <= 0) {
      return nameWithoutExt.substring(0, keepStart) + '...' + extension;
    }
    
    return nameWithoutExt.substring(0, keepStart) + '...' + 
           nameWithoutExt.substring(nameWithoutExt.length - keepEnd) + extension;
  }
}

// 排序功能
function sortFiles(files, sortField, sortOrder) {
  return [...files].sort((a, b) => {
    // 文件夹始终在前面
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    
    let aValue, bValue;
    
    switch (sortField) {
      case 'name':
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
        break;
      case 'modifiedTime':
        aValue = new Date(a.modifiedTime || 0);
        bValue = new Date(b.modifiedTime || 0);
        break;
      case 'size':
        aValue = a.size || 0;
        bValue = b.size || 0;
        break;
      case 'type':
        aValue = getFileType(a.name, a.isDirectory).toLowerCase();
        bValue = getFileType(b.name, b.isDirectory).toLowerCase();
        break;
      case 'duration':
        // 解析时长字符串为秒数进行比较
        aValue = parseDurationToSeconds(a.duration);
        bValue = parseDurationToSeconds(b.duration);
        break;
      case 'resolution':
        // 解析分辨率为像素数进行比较
        aValue = parseResolutionToPixels(a.resolution);
        bValue = parseResolutionToPixels(b.resolution);
        break;
      case 'bitrate':
        // 解析码率字符串为数值进行比较
        aValue = parseBitrateToNumber(a.bitrate);
        bValue = parseBitrateToNumber(b.bitrate);
        break;
      case 'codec':
        aValue = (a.codec || '--').toLowerCase();
        bValue = (b.codec || '--').toLowerCase();
        break;
      default:
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
    }
    
    // 处理空值
    if (aValue === null || aValue === undefined) aValue = sortOrder === 'asc' ? -Infinity : Infinity;
    if (bValue === null || bValue === undefined) bValue = sortOrder === 'asc' ? -Infinity : Infinity;
    
    // 比较值
    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });
}

// 解析时长字符串为秒数
function parseDurationToSeconds(duration) {
  if (!duration || duration === '--') return 0;
  
  const parts = duration.split(':');
  if (parts.length === 3) {
    const hours = parseInt(parts[0]) || 0;
    const minutes = parseInt(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }
  return 0;
}

// 解析分辨率为像素数
function parseResolutionToPixels(resolution) {
  if (!resolution || resolution === '--') return 0;
  
  const match = resolution.match(/(\d+)x(\d+)/);
  if (match) {
    return parseInt(match[1]) * parseInt(match[2]);
  }
  return 0;
}

// 解析码率字符串为数值
function parseBitrateToNumber(bitrate) {
  if (!bitrate || bitrate === '--') return 0;
  
  const match = bitrate.match(/(\d+(?:\.\d+)?)\s*(kbps|Mbps|Gbps)?/i);
  if (match) {
    const value = parseFloat(match[1]);
    const unit = (match[2] || '').toLowerCase();
    
    switch (unit) {
      case 'gbps':
        return value * 1000000;
      case 'mbps':
        return value * 1000;
      case 'kbps':
      default:
        return value;
    }
  }
  return 0;
}

// 更新排序指示器
function updateSortIndicators(sortField, sortOrder) {
  // 清除所有排序指示器
  document.querySelectorAll('.sortable').forEach(header => {
    header.classList.remove('sort-asc', 'sort-desc');
  });
  
  // 设置当前排序字段的指示器
  if (sortField) {
    const header = document.querySelector(`[data-sort="${sortField}"]`);
    if (header) {
      header.classList.add(sortOrder === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  }
}

// 重新渲染文件列表
function renderFileList(files) {
  // 清空文件列表
  fileListElement.innerHTML = '';
  
  // 检查是否可以返回上级目录
  const path = require('path');
  const parentPath = path.dirname(currentFolderPath);
  const canGoUp = parentPath !== currentFolderPath;
  
  // 如果可以返回上级，添加返回上级目录的条目
  if (canGoUp) {
    const backItem = createBackItem(parentPath);
    fileListElement.appendChild(backItem);
  }
  
  // 如果没有文件，显示空文件夹提示
  if (files.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'empty-message';
    emptyMessage.textContent = '文件夹为空';
    fileListElement.appendChild(emptyMessage);
    updateSelectionUI(); // 更新选择状态
    return;
  }
  
  // 渲染文件项
  files.forEach(file => {
    const fileItem = createFileItem(file);
    fileListElement.appendChild(fileItem);
  });
  
  // 渲染完成后更新选择状态UI
  updateSelectionUI();
}

// 创建返回上级目录项
function createBackItem(parentPath) {
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
  const backModifiedTime = document.createElement('div');
  backModifiedTime.className = 'file-modified-time';
  backModifiedTime.textContent = '--';
  
  const backSize = document.createElement('div');
  backSize.className = 'file-size';
  backSize.textContent = '--';
  
  const backType = document.createElement('div');
  backType.className = 'file-type';
  backType.textContent = '--';
  
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
  backItem.appendChild(backModifiedTime);
  backItem.appendChild(backSize);
  backItem.appendChild(backType);
  backItem.appendChild(backDuration);
  backItem.appendChild(backResolution);
  backItem.appendChild(backBitrate);
  backItem.appendChild(backCodec);
  
  return backItem;
}

// 创建文件项
function createFileItem(file) {
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
  
  // 检查文件是否已被选中
  const isSelected = selectedFiles.has(file.path);
  if (isSelected) {
    fileItem.classList.add('selected');
  }
  
  // 复选框列
  const checkboxCol = document.createElement('div');
  checkboxCol.className = 'file-checkbox-col';
  
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'file-checkbox';
  checkbox.dataset.filePath = file.path;
  checkbox.checked = isSelected; // 恢复选中状态
  checkbox.addEventListener('change', (e) => {
    handleFileSelection(file.path, e.target.checked);
  });
  
  checkboxCol.appendChild(checkbox);
  
  // 文件名
  const fileName = document.createElement('div');
  fileName.className = 'file-name';
  
  const fileIcon = document.createElement('span');
  fileIcon.className = 'file-icon';
  
  // 如果是视频文件且有缩略图，显示缩略图；否则显示默认图标
  if (file.isVideo && file.thumbnailPath) {
    const thumbnailImg = document.createElement('img');
    thumbnailImg.className = 'video-thumbnail';
    thumbnailImg.src = `file://${file.thumbnailPath}`;
    thumbnailImg.alt = '视频预览';
    thumbnailImg.onerror = function() {
      // 如果缩略图加载失败，显示默认视频图标
      this.style.display = 'none';
      fileIcon.textContent = '🎬';
    };
    fileIcon.appendChild(thumbnailImg);
  } else {
    fileIcon.textContent = file.isDirectory ? '📁' : file.isVideo ? '🎬' : '📄';
  }
  
  const fileNameText = document.createElement('span');
  fileNameText.className = 'file-name-text';
  
  // 使用智能截断文件名
  const displayName = truncateFileName(file.name);
  fileNameText.textContent = displayName;
  
  // 存储原始文件名用于比较和tooltip
  fileNameText.dataset.originalName = file.name;
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
    // 检查文件名是否被截断（显示名称与原始名称不同）
    const originalName = this.dataset.originalName;
    const displayName = this.textContent;
    
    if (originalName !== displayName) {
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
    // 检查文件名是否被截断（显示名称与原始名称不同）
    const originalName = this.dataset.originalName;
    const displayName = this.textContent;
    
    // 点击时切换tooltip显示状态
    if (tooltip.style.display === 'block') {
      tooltip.style.display = 'none';
    } else if (originalName !== displayName) {
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
  
  // 文件种类
  const fileType = document.createElement('div');
  fileType.className = 'file-type';
  fileType.textContent = getFileType(file.name, file.isDirectory);
  
  // 修改时间
  const fileModifiedTime = document.createElement('div');
  fileModifiedTime.className = 'file-modified-time';
  fileModifiedTime.textContent = formatModifiedTime(file.modifiedTime);
  
  // 创建视频详情列
  const fileDuration = document.createElement('div');
  fileDuration.className = 'file-duration';
  
  const fileResolution = document.createElement('div');
  fileResolution.className = 'file-resolution';
  
  const fileBitrate = document.createElement('div');
  fileBitrate.className = 'file-bitrate';
  
  // 编码格式列
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
  fileItem.appendChild(fileModifiedTime);
  fileItem.appendChild(fileSize);
  fileItem.appendChild(fileType);
  fileItem.appendChild(fileDuration);
  fileItem.appendChild(fileResolution);
  fileItem.appendChild(fileBitrate);
  fileItem.appendChild(fileCodec);
  
  return fileItem;
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
    console.log('开始格式化文件，选中文件数量:', filesToFormat.length);
    console.log('选中的文件:', filesToFormat);
    
    const formatResults = [];
    
    for (const filePath of filesToFormat) {
      const fileInfo = fileInfoMap.get(filePath);
      console.log('处理文件:', filePath, '文件信息:', fileInfo);
      
      if (fileInfo && !fileInfo.isDirectory) {
        const newName = formatFilename(fileInfo.name);
        console.log('原文件名:', fileInfo.name, '新文件名:', newName);
        
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
          
          console.log('添加到格式化列表:', {
            oldPath: filePath,
            newPath: newPath,
            oldName: fileInfo.name,
            newName: newName
          });
        } else {
          console.log('文件名无需更改:', fileInfo.name);
        }
      } else {
        console.log('跳过文件（目录或无信息）:', filePath);
      }
    }
    
    console.log('需要格式化的文件数量:', formatResults.length);
    console.log('格式化列表:', formatResults);
    
    if (formatResults.length === 0) {
      alert('选中的文件名已经是正确格式，无需格式化');
      return;
    }
    
    // 显示确认对话框
    const confirmed = await showFormatConfirm(formatResults);
    
    if (!confirmed) {
      console.log('用户取消了格式化操作');
      return;
    }
    
    console.log('开始执行文件重命名，文件数量:', formatResults.length);
    
    // 调用主进程进行文件重命名
    let successCount = 0;
    let errorCount = 0;
    
    for (const item of formatResults) {
      try {
        console.log('正在重命名文件:', item.oldPath, '->', item.newPath);
        
        await ipcRenderer.invoke('rename-file', {
          oldPath: item.oldPath,
          newPath: item.newPath
        });
        
        successCount++;
        console.log('重命名成功:', item.oldName, '->', item.newName);
      } catch (error) {
        console.error(`重命名失败: ${item.oldName}`, error);
        errorCount++;
      }
    }
    
    console.log('重命名完成，成功:', successCount, '失败:', errorCount);
    
    // 重新加载文件夹内容
    if (currentFolderPath) {
      loadFolderContent(currentFolderPath);
    }
    
    // 只在有失败的情况下显示提示
    if (errorCount > 0) {
      if (successCount > 0) {
        alert(`格式化完成：成功 ${successCount} 个，失败 ${errorCount} 个`);
      } else {
        alert(`格式化失败：${errorCount} 个文件重命名失败`);
      }
    }
    // 成功时不显示任何提示对话框
    
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
function showCustomConfirm(title, message, confirmText = '确认') {
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
    confirmBtn.textContent = confirmText;
    
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

// 显示视频裁切进度对话框
function showTrimProgressDialog(fileName) {
  // 创建遮罩层
  const overlay = document.createElement('div');
  overlay.className = 'progress-overlay';
  overlay.id = 'trim-progress-overlay';
  
  // 创建对话框
  const dialog = document.createElement('div');
  dialog.className = 'progress-dialog';
  
  // 创建标题区域
  const header = document.createElement('div');
  header.className = 'progress-header';
  
  const title = document.createElement('h3');
  title.textContent = '✂️ 视频裁切中';
  
  const subtitle = document.createElement('div');
  subtitle.className = 'progress-subtitle';
  subtitle.textContent = '正在处理视频，请稍候...';
  
  header.appendChild(title);
  header.appendChild(subtitle);
  
  // 创建内容区域
  const content = document.createElement('div');
  content.className = 'progress-content';
  
  // 进度条容器
  const progressContainer = document.createElement('div');
  progressContainer.className = 'progress-bar-container';
  
  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  
  const progressFill = document.createElement('div');
  progressFill.className = 'progress-bar-fill';
  progressFill.id = 'trim-progress-fill';
  progressFill.style.width = '0%';
  
  progressBar.appendChild(progressFill);
  progressContainer.appendChild(progressBar);
  
  // 进度文本
  const progressText = document.createElement('div');
  progressText.className = 'progress-text';
  
  const percentage = document.createElement('span');
  percentage.id = 'trim-progress-percentage';
  percentage.textContent = '0%';
  
  const timeInfo = document.createElement('span');
  timeInfo.id = 'trim-progress-time';
  timeInfo.textContent = '0.0s / 0.0s';
  
  progressText.appendChild(percentage);
  progressText.appendChild(timeInfo);
  
  // 当前文件信息
  const currentFile = document.createElement('div');
  currentFile.className = 'current-file';
  currentFile.textContent = fileName;
  
  content.appendChild(progressContainer);
  content.appendChild(progressText);
  content.appendChild(currentFile);
  
  // 组装对话框
  dialog.appendChild(header);
  dialog.appendChild(content);
  
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  return overlay;
}

// 隐藏视频裁切进度对话框
function hideTrimProgressDialog() {
  const overlay = document.getElementById('trim-progress-overlay');
  if (overlay) {
    document.body.removeChild(overlay);
  }
}

// 更新视频裁切进度
function updateTrimProgress(data) {
  const progressFill = document.getElementById('trim-progress-fill');
  const percentage = document.getElementById('trim-progress-percentage');
  const timeInfo = document.getElementById('trim-progress-time');
  
  if (progressFill) {
    progressFill.style.width = `${data.progress}%`;
  }
  
  if (percentage) {
    percentage.textContent = `${data.progress}%`;
  }
  
  if (timeInfo && data.currentTime && data.totalTime) {
    timeInfo.textContent = `${data.currentTime}s / ${data.totalTime}s`;
  }
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
    
    // 显示进度对话框
    showTrimProgressDialog(fileName);
    
    try {
      // 调用主进程进行视频裁切
      await ipcRenderer.invoke('trim-video', {
        inputPath: videoPath,
        startTime: result.startTime,
        endTime: result.endTime
      });
    } catch (error) {
      // 隐藏进度对话框
      hideTrimProgressDialog();
      throw error;
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
      `您确定要删除文件 "${fileName}" 吗？\n\n此操作不可撤销，文件将被永久删除！`,
      '确认删除'
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
    
    // 存储当前文件列表
    currentFiles = files;
    
    // 应用排序
    let sortedFiles;
    if (currentSortField) {
      sortedFiles = sortFiles(files, currentSortField, currentSortOrder);
    } else {
      // 备用排序：文件夹在前，文件在后，按名称排序
      sortedFiles = [...files].sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    }
    
    // 渲染文件列表
    renderFileList(sortedFiles);
    
  } catch (error) {
    fileListElement.innerHTML = `<div class="empty-message error-message">错误: ${error.message}</div>`;
  }
}

// 视频处理进度相关函数
function showVideoProcessingDialog() {
  const dialog = document.getElementById('video-processing-dialog');
  if (dialog) {
    dialog.style.display = 'flex';
  }
}

function hideVideoProcessingDialog() {
  const dialog = document.getElementById('video-processing-dialog');
  if (dialog) {
    dialog.style.display = 'none';
  }
}

function updateVideoProcessingProgress(data) {
  const progressBar = document.getElementById('video-progress-bar');
  const progressText = document.getElementById('video-progress-text');
  const currentFileText = document.getElementById('video-current-file');
  
  if (progressBar) {
    progressBar.style.width = `${data.percentage}%`;
  }
  
  if (progressText) {
    progressText.textContent = `${data.percentage}% (${data.current}/${data.total})`;
  }
  
  if (currentFileText) {
    currentFileText.textContent = `正在处理: ${data.fileName}`;
  }
}

// 监听来自主进程的视频处理进度事件
ipcRenderer.on('folder-content-basic', (event, basicFiles) => {
  // 立即显示基本文件信息
  currentFiles = basicFiles;
  
  // 应用排序
  let sortedFiles;
  if (currentSortField) {
    sortedFiles = sortFiles(basicFiles, currentSortField, currentSortOrder);
  } else {
    sortedFiles = [...basicFiles].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  }
  
  renderFileList(sortedFiles);
});

ipcRenderer.on('video-processing-start', (event, data) => {
  showVideoProcessingDialog();
  updateVideoProcessingProgress({
    current: 0,
    total: data.total,
    percentage: 0,
    fileName: '准备中...'
  });
});

ipcRenderer.on('video-processing-progress', (event, data) => {
  updateVideoProcessingProgress(data);
});

ipcRenderer.on('video-info-update', (event, videoInfo) => {
  // 更新单个视频文件的信息
  const fileIndex = currentFiles.findIndex(file => file.path === videoInfo.path);
  if (fileIndex !== -1) {
    // 更新文件信息
    Object.assign(currentFiles[fileIndex], videoInfo);
    
    // 重新渲染文件列表以显示更新的视频信息
    let sortedFiles;
    if (currentSortField) {
      sortedFiles = sortFiles(currentFiles, currentSortField, currentSortOrder);
    } else {
      sortedFiles = [...currentFiles].sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    }
    
    renderFileList(sortedFiles);
  }
});

ipcRenderer.on('folder-size-update', (event, data) => {
  // 更新文件夹大小
  const fileIndex = currentFiles.findIndex(file => file.path === data.path);
  if (fileIndex !== -1) {
    currentFiles[fileIndex].size = data.size;
    
    // 重新渲染文件列表以显示更新的文件夹大小
    let sortedFiles;
    if (currentSortField) {
      sortedFiles = sortFiles(currentFiles, currentSortField, currentSortOrder);
    } else {
      sortedFiles = [...currentFiles].sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    }
    
    renderFileList(sortedFiles);
  }
});

ipcRenderer.on('video-processing-complete', (event) => {
  hideVideoProcessingDialog();
});

// 视频裁切进度事件监听器
ipcRenderer.on('video-trim-start', (event, data) => {
  console.log('视频裁切开始:', data);
});

ipcRenderer.on('video-trim-progress', (event, data) => {
  console.log('视频裁切进度:', data);
  updateTrimProgress(data);
});

ipcRenderer.on('video-trim-complete', (event, data) => {
  console.log('视频裁切完成:', data);
  hideTrimProgressDialog();
  
  // 显示成功消息
  alert('视频裁切成功！');
  
  // 重新加载文件夹内容
  if (currentFolderPath) {
    loadFolderContent(currentFolderPath);
  }
});

ipcRenderer.on('video-trim-error', (event, data) => {
  console.error('视频裁切错误:', data);
  hideTrimProgressDialog();
  
  // 显示错误消息
  alert('视频裁切失败: ' + data.error);
});

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
    `您确定要删除选中的 ${fileCount} 个文件吗？\n\n此操作不可撤销，文件将被永久删除！`,
    '确认删除'
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
  
  // 添加列头点击事件
  document.querySelectorAll('.sortable').forEach(header => {
    header.addEventListener('click', () => {
      const sortField = header.dataset.sort;
      
      // 如果点击的是当前排序字段，则切换排序方向
      if (currentSortField === sortField) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        // 如果点击的是新字段，则设置为升序
        currentSortField = sortField;
        currentSortOrder = 'asc';
      }
      
      // 更新排序指示器
      updateSortIndicators(currentSortField, currentSortOrder);
      
      // 重新排序并渲染文件列表
      if (currentFiles.length > 0) {
        const sortedFiles = sortFiles(currentFiles, currentSortField, currentSortOrder);
        renderFileList(sortedFiles);
      }
    });
  });
  
  // 设置默认排序指示器
  updateSortIndicators(currentSortField, currentSortOrder);
  
  // 初始化列宽调整功能
  initColumnResizing();
});

// 列宽调整功能
let isResizing = false;
let currentResizer = null;
let startX = 0;
let startWidth = 0;

// 默认列宽配置 - 与CSS中的flex值保持一致
const defaultColumnWidths = {
  'file-name': 3.0,
  'file-modified-time': 1.4,
  'file-size': 0.8,
  'file-type': 0.8,
  'file-duration': 0.8,
  'file-resolution': 1.0,
  'file-bitrate': 0.8,
  'file-codec': 1.0
};

// 从本地存储加载列宽设置
function loadColumnWidths() {
  try {
    const saved = localStorage.getItem('fileStack-column-widths');
    if (saved) {
      return { ...defaultColumnWidths, ...JSON.parse(saved) };
    }
  } catch (error) {
    console.error('加载列宽设置失败:', error);
  }
  return defaultColumnWidths;
}

// 保存列宽设置到本地存储
function saveColumnWidths(widths) {
  try {
    localStorage.setItem('fileStack-column-widths', JSON.stringify(widths));
  } catch (error) {
    console.error('保存列宽设置失败:', error);
  }
}

// 应用列宽设置
function applyColumnWidths(widths) {
  Object.entries(widths).forEach(([columnClass, width]) => {
    // 更新表头列宽
    const headerColumn = document.querySelector(`.file-table-header .${columnClass}`);
    if (headerColumn) {
      headerColumn.style.flex = width;
    }
    
    // 更新所有文件项的对应列宽
    const fileColumns = document.querySelectorAll(`.file-item .${columnClass}`);
    fileColumns.forEach(column => {
      column.style.flex = width;
    });
  });
}

// 初始化列宽调整功能
function initColumnResizing() {
  // 加载并应用保存的列宽设置
  const savedWidths = loadColumnWidths();
  applyColumnWidths(savedWidths);
  
  // 为每个列分隔线添加事件监听器
  const resizers = document.querySelectorAll('.column-resizer');
  
  resizers.forEach(resizer => {
    resizer.addEventListener('mousedown', startResize);
  });
  
  // 添加全局鼠标事件监听器
  document.addEventListener('mousemove', doResize);
  document.addEventListener('mouseup', stopResize);
}

// 开始调整列宽
function startResize(e) {
  e.preventDefault();
  
  isResizing = true;
  currentResizer = e.target;
  startX = e.clientX;
  
  // 获取当前列
  const column = currentResizer.parentElement;
  const computedStyle = window.getComputedStyle(column);
  startWidth = parseFloat(computedStyle.flex) || 1;
  
  // 添加调整状态的CSS类
  document.body.classList.add('resizing');
  currentResizer.classList.add('resizing');
  
  // 禁用文本选择
  document.body.style.userSelect = 'none';
}

// 执行列宽调整
function doResize(e) {
  if (!isResizing || !currentResizer) return;
  
  e.preventDefault();
  
  const deltaX = e.clientX - startX;
  const column = currentResizer.parentElement;
  const columnClass = getColumnClass(column);
  
  if (!columnClass) return;
  
  // 计算新的flex值（基于像素变化转换为flex比例）
  const containerWidth = document.querySelector('.file-table-header').offsetWidth;
  const flexChange = (deltaX / containerWidth) * 10; // 调整敏感度
  let newWidth = Math.max(0.3, startWidth + flexChange); // 最小宽度限制
  
  // 应用新宽度
  column.style.flex = newWidth;
  
  // 同时更新所有文件项的对应列
  const fileColumns = document.querySelectorAll(`.file-item .${columnClass}`);
  fileColumns.forEach(fileColumn => {
    fileColumn.style.flex = newWidth;
  });
}

// 停止调整列宽
function stopResize(e) {
  if (!isResizing) return;
  
  isResizing = false;
  
  // 移除调整状态的CSS类
  document.body.classList.remove('resizing');
  if (currentResizer) {
    currentResizer.classList.remove('resizing');
  }
  
  // 恢复文本选择
  document.body.style.userSelect = '';
  
  // 保存新的列宽设置
  if (currentResizer) {
    const column = currentResizer.parentElement;
    const columnClass = getColumnClass(column);
    
    if (columnClass) {
      const newWidth = parseFloat(column.style.flex) || parseFloat(window.getComputedStyle(column).flex) || 1;
      const currentWidths = loadColumnWidths();
      currentWidths[columnClass] = newWidth;
      saveColumnWidths(currentWidths);
    }
  }
  
  currentResizer = null;
}

// 获取列的CSS类名
function getColumnClass(columnElement) {
  const classList = Array.from(columnElement.classList);
  const columnClasses = ['file-name', 'file-modified-time', 'file-size', 'file-type', 'file-duration', 'file-resolution', 'file-bitrate', 'file-codec'];
  
  for (const className of columnClasses) {
    if (classList.includes(className)) {
      return className;
    }
  }
  
  return null;
}

// 重写renderFileList函数以确保新渲染的文件项也应用正确的列宽
const originalRenderFileList = renderFileList;
renderFileList = function(files) {
  // 调用原始的renderFileList函数
  originalRenderFileList.call(this, files);
  
  // 应用保存的列宽设置到新渲染的文件项
  const savedWidths = loadColumnWidths();
  applyColumnWidths(savedWidths);
};