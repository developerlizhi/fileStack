const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const util = require('util');
const os = require('os');

const execPromise = util.promisify(exec);

// 递归计算文件夹大小
async function calculateFolderSize(folderPath) {
  try {
    let totalSize = 0;
    const files = fs.readdirSync(folderPath, { withFileTypes: true });
    
    for (const file of files) {
      const filePath = path.join(folderPath, file.name);
      
      if (file.isDirectory()) {
        // 递归计算子文件夹大小
        totalSize += await calculateFolderSize(filePath);
      } else {
        // 添加文件大小
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
      }
    }
    
    return totalSize;
  } catch (error) {
    console.error('计算文件夹大小失败:', error);
    return 0;
  }
}

// 检查系统是否安装了ffmpeg，带重试机制
async function checkFFmpeg(retries = 3, delay = 500) {
  // 根据用户要求，直接使用系统环境中的FFmpeg，不使用内置版本
  // 在打包环境中，可能需要特殊处理PATH环境变量
  const execOptions = {
    timeout: 5000,
    env: process.env
  };
  
  // 在macOS打包环境中，可能需要添加常见的FFmpeg安装路径
  if (app.isPackaged && process.platform === 'darwin') {
    const commonPaths = [
      '/usr/local/bin',
      '/usr/bin',
      '/opt/homebrew/bin',
      '/opt/local/bin'
    ];
    
    // 将这些路径添加到PATH环境变量中
    const currentPath = process.env.PATH || '';
    execOptions.env.PATH = commonPaths.join(':') + ':' + currentPath;
    console.log('扩展PATH环境变量:', execOptions.env.PATH);
  }
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`尝试检测FFmpeg (${attempt}/${retries})...`);
      const { stdout } = await execPromise('ffmpeg -version', execOptions);
      console.log('系统FFmpeg检测成功');
      
      // 提取版本号信息
      const versionLine = stdout.split('\n')[0];
      
      // 尝试从输出中提取实际版本号
      const versionMatch = versionLine.match(/ffmpeg version (\d+\.\d+(?:\.\d+)?)/i);
      if (versionMatch) {
        const versionNumber = versionMatch[1];
        return { 
          installed: true, 
          version: versionNumber,
          fullVersion: versionLine 
        };
      } else {
        // 如果无法提取版本号，返回安装状态但不提供版本号
        return { 
          installed: true, 
          version: null,
          fullVersion: versionLine 
        };
      }
    } catch (error) {
      console.log(`FFmpeg检测尝试 ${attempt}/${retries} 失败: ${error.message}`);
      
      // 如果还有重试机会，则等待后重试
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // 所有重试都失败，尝试使用ffprobe作为备选检测方法
        try {
          console.log('尝试使用ffprobe检测...');
          const { stdout } = await execPromise('ffprobe -version', execOptions);
          console.log('通过ffprobe检测FFmpeg成功');
          
          // 从ffprobe输出中提取版本号
          const versionLine = stdout.split('\n')[0];
          
          const versionMatch = versionLine.match(/ffprobe version (\d+\.\d+(?:\.\d+)?)/i);
          if (versionMatch) {
            const versionNumber = versionMatch[1];
            return { 
              installed: true, 
              version: versionNumber,
              fullVersion: versionLine 
            };
          } else {
            // 如果无法提取版本号，返回安装状态但不提供版本号
            return { 
              installed: true, 
              version: null,
              fullVersion: versionLine 
            };
          }
        } catch (ffprobeError) {
          console.log('FFmpeg和ffprobe检测都失败');
          console.log('ffprobe错误:', ffprobeError.message);
          return { installed: false, error: error.message };
        }
      }
    }
  }
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  mainWindow.loadFile('index.html');

  // 开发环境下打开开发者工具
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// 缓存FFmpeg状态，避免重复检测
let cachedFFmpegStatus = null;

// 检测FFmpeg并发送状态到窗口
async function detectAndSendFFmpegStatus(window) {
  try {
    // 如果已有缓存结果，直接使用
    if (!cachedFFmpegStatus) {
      console.log('检测FFmpeg状态...');
      cachedFFmpegStatus = await checkFFmpeg();
      console.log('FFmpeg状态检测完成:', cachedFFmpegStatus.installed);
    } else {
      console.log('使用缓存的FFmpeg状态:', cachedFFmpegStatus.installed);
    }
    
    // 确保窗口存在且已加载完成
    if (window && window.webContents) {
      window.webContents.send('ffmpeg-status', cachedFFmpegStatus);
    }
  } catch (error) {
    console.error('FFmpeg检测过程中发生错误:', error);
    cachedFFmpegStatus = { installed: false, error: '检测过程中发生错误' };
    
    if (window && window.webContents) {
      window.webContents.send('ffmpeg-status', cachedFFmpegStatus);
    }
  }
}

app.whenReady().then(async () => {
  createWindow();
  
  // 页面加载完成后发送FFmpeg状态
  mainWindow.webContents.on('did-finish-load', () => {
    detectAndSendFFmpegStatus(mainWindow);
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      // 确保新窗口加载完成后发送FFmpeg状态
      mainWindow.webContents.on('did-finish-load', () => {
        detectAndSendFFmpegStatus(mainWindow);
      });
    }
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// 处理选择文件夹的请求
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (result.canceled) {
    return { canceled: true };
  }
  
  const folderPath = result.filePaths[0];
  return { folderPath };
});

// 获取文件夹内容
ipcMain.handle('get-folder-content', async (event, folderPath) => {
  try {
    const files = fs.readdirSync(folderPath, { withFileTypes: true });
    
    // 过滤掉 .DS_Store 文件
    const filteredFiles = files.filter(file => file.name !== '.DS_Store');
    
    // 首先快速返回基本文件信息
    const basicFileDetails = filteredFiles.map((file) => {
      const filePath = path.join(folderPath, file.name);
      const stats = fs.statSync(filePath);
      
      const videoExtensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'];
      const ext = path.extname(file.name).toLowerCase();
      const isVideo = !file.isDirectory() && videoExtensions.includes(ext);
      
      return {
        name: file.name,
        path: filePath,
        size: file.isDirectory() ? 0 : stats.size, // 文件夹大小稍后计算
        isDirectory: file.isDirectory(),
        isHidden: file.name.startsWith('.'),
        modifiedTime: stats.mtime,
        isVideo: isVideo,
        // 视频信息占位符
        duration: isVideo ? '--' : undefined,
        resolution: isVideo ? '--' : undefined,
        bitrate: isVideo ? '--' : undefined,
        codec: isVideo ? '--' : undefined,
        thumbnailPath: isVideo ? null : undefined
      };
    });
    
    // 立即返回基本信息，让界面先显示
    event.sender.send('folder-content-basic', basicFileDetails);
    
    // 异步处理文件夹大小和视频信息
    const videoFiles = basicFileDetails.filter(file => file.isVideo);
    const totalVideoFiles = videoFiles.length;
    
    if (totalVideoFiles > 0) {
      // 发送开始处理视频的通知
      event.sender.send('video-processing-start', { total: totalVideoFiles });
    }
    
    // 处理文件夹大小（异步）
    const folderSizePromises = basicFileDetails
      .filter(file => file.isDirectory)
      .map(async (file) => {
        try {
          const size = await calculateFolderSize(file.path);
          return { path: file.path, size };
        } catch (error) {
          return { path: file.path, size: 0 };
        }
      });
    
    // 处理视频信息和缩略图（逐个处理以显示进度）
    let processedVideoCount = 0;
    const videoInfoPromises = videoFiles.map(async (file, index) => {
      try {
        // 发送当前处理的视频文件信息
        event.sender.send('video-processing-progress', {
          current: processedVideoCount + 1,
          total: totalVideoFiles,
          fileName: file.name,
          percentage: Math.round(((processedVideoCount + 1) / totalVideoFiles) * 100)
        });
        
        const execOptions = {
          timeout: 10000,
          env: process.env
        };
        
        // 在macOS打包环境中，可能需要添加常见的FFmpeg安装路径
        if (app.isPackaged && process.platform === 'darwin') {
          const commonPaths = [
            '/usr/local/bin',
            '/usr/bin',
            '/opt/homebrew/bin',
            '/opt/local/bin'
          ];
          
          const currentPath = process.env.PATH || '';
          execOptions.env.PATH = commonPaths.join(':') + ':' + currentPath;
        }
        
        console.log('获取视频信息:', file.path);
        const { stdout } = await execPromise(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,bit_rate -show_entries format=duration,bit_rate -of json "${file.path}"`, execOptions);
        
        let videoInfo = {
          path: file.path,
          duration: '--',
          resolution: '--',
          bitrate: '--',
          codec: '--',
          thumbnailPath: null,
          ffmpegError: false
        };
        
        // 异步生成缩略图
        try {
          const thumbnailResult = await new Promise((resolve) => {
            // 使用之前定义的生成缩略图函数
            const crypto = require('crypto');
            const hash = crypto.createHash('md5').update(file.path).digest('hex');
            const thumbnailDir = path.join(require('os').tmpdir(), 'filestack-thumbnails');
            const thumbnailPath = path.join(thumbnailDir, `${hash}.jpg`);
            
            // 如果缩略图已存在，直接返回
            if (fs.existsSync(thumbnailPath)) {
              resolve({ success: true, thumbnailPath });
              return;
            }
            
            // 创建缩略图目录
            if (!fs.existsSync(thumbnailDir)) {
              fs.mkdirSync(thumbnailDir, { recursive: true });
            }
            
            const execOptions = {
              timeout: 15000,
              env: process.env
            };
            
            // 在macOS打包环境中，可能需要添加常见的FFmpeg安装路径
            if (app.isPackaged && process.platform === 'darwin') {
              const commonPaths = [
                '/usr/local/bin',
                '/usr/bin',
                '/opt/homebrew/bin',
                '/opt/local/bin'
              ];
              
              const currentPath = process.env.PATH || '';
              execOptions.env.PATH = commonPaths.join(':') + ':' + currentPath;
            }
            
            // 使用FFmpeg提取视频首帧
             const ffmpegCommand = `ffmpeg -i "${file.path}" -vframes 1 -vf "scale=240:180:force_original_aspect_ratio=decrease,pad=240:180:(ow-iw)/2:(oh-ih)/2" -y "${thumbnailPath}"`;
            
            execPromise(ffmpegCommand, execOptions)
              .then(() => {
                if (fs.existsSync(thumbnailPath)) {
                  resolve({ success: true, thumbnailPath });
                } else {
                  resolve({ success: false, error: '缩略图生成失败' });
                }
              })
              .catch((error) => {
                console.error('生成视频缩略图失败:', error);
                resolve({ success: false, error: error.message });
              });
          });
          
          if (thumbnailResult.success) {
            videoInfo.thumbnailPath = thumbnailResult.thumbnailPath;
          }
        } catch (thumbnailError) {
          console.error('缩略图生成过程出错:', thumbnailError);
        }
        
        try {
          // 解析JSON格式的输出
          const info = JSON.parse(stdout);
          
          // 获取时长（秒）
          if (info.format && info.format.duration) {
            const totalSeconds = parseFloat(info.format.duration);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = Math.floor(totalSeconds % 60);
            videoInfo.duration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          }
          
          // 获取视频流信息
          if (info.streams && info.streams.length > 0) {
            const videoStream = info.streams.find(stream => stream.codec_type === 'video' || (stream.width && stream.height)) || info.streams[0];
            
            if (videoStream) {
              // 分辨率
              if (videoStream.width && videoStream.height) {
                videoInfo.resolution = `${videoStream.width}x${videoStream.height}`;
              }
              
              // 编码格式
              if (videoStream.codec_name) {
                videoInfo.codec = videoStream.codec_name;
              }
              
              // 码率
              if (videoStream.bit_rate) {
                videoInfo.bitrate = `${Math.round(parseInt(videoStream.bit_rate) / 1000)} kb/s`;
              } else if (info.format && info.format.bit_rate) {
                videoInfo.bitrate = `${Math.round(parseInt(info.format.bit_rate) / 1000)} kb/s`;
              }
            }
          }
        } catch (parseError) {
          console.error('解析视频信息失败:', parseError);
          // 如果JSON解析失败，尝试使用ffmpeg命令和正则表达式解析
          try {
            const { stdout: ffmpegOutput } = await execPromise(`ffmpeg -i "${file.path}" 2>&1`);
            
            const durationMatch = ffmpegOutput.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/i);
            if (durationMatch) {
              const hours = parseInt(durationMatch[1]);
              const minutes = parseInt(durationMatch[2]);
              const seconds = parseInt(durationMatch[3]);
              videoInfo.duration = `${hours}:${minutes}:${seconds}`;
            }
            
            const resolutionMatch = ffmpegOutput.match(/(\d{2,4})x(\d{2,4})/i);
            if (resolutionMatch) {
              videoInfo.resolution = `${resolutionMatch[1]}x${resolutionMatch[2]}`;
            }
            
            const bitrateMatch = ffmpegOutput.match(/bitrate: (\d+) kb\/s/i);
            if (bitrateMatch) {
              videoInfo.bitrate = `${bitrateMatch[1]} kb/s`;
            }
            
            const codecMatch = ffmpegOutput.match(/Video: ([^,]+)/i);
            if (codecMatch) {
              videoInfo.codec = codecMatch[1].trim();
            }
          } catch (ffmpegError) {
            console.error('FFmpeg解析也失败:', ffmpegError);
          }
        }
        
        processedVideoCount++;
        
        // 发送单个视频信息更新
        event.sender.send('video-info-update', videoInfo);
        
        return videoInfo;
        
      } catch (error) {
        console.error('获取视频信息失败:', error);
        processedVideoCount++;
        
        const errorInfo = {
          path: file.path,
          duration: '--',
          resolution: '--',
          bitrate: '--',
          codec: '--',
          thumbnailPath: null,
          ffmpegError: true
        };
        
        // 发送错误的视频信息更新
        event.sender.send('video-info-update', errorInfo);
        
        return errorInfo;
      }
    });
    
    // 等待所有异步操作完成
    const [folderSizes, videoInfos] = await Promise.all([
      Promise.all(folderSizePromises),
      Promise.all(videoInfoPromises)
    ]);
    
    // 更新文件夹大小
    folderSizes.forEach(({ path: folderPath, size }) => {
      event.sender.send('folder-size-update', { path: folderPath, size });
    });
    
    // 发送处理完成通知
    if (totalVideoFiles > 0) {
      event.sender.send('video-processing-complete');
    }
    
    // 返回最终的完整文件信息
    const finalFileDetails = basicFileDetails.map(file => {
      if (file.isDirectory) {
        const folderSize = folderSizes.find(f => f.path === file.path);
        if (folderSize) {
          file.size = folderSize.size;
        }
      } else if (file.isVideo) {
        const videoInfo = videoInfos.find(v => v.path === file.path);
        if (videoInfo) {
          Object.assign(file, videoInfo);
        }
      }
      return file;
    });
    
    return finalFileDetails;
    
  } catch (error) {
    return { error: error.message };
  }
});

// 生成视频预览图
ipcMain.handle('generate-video-thumbnail', async (event, videoPath) => {
  try {
    // 创建缩略图目录
    const thumbnailDir = path.join(os.tmpdir(), 'filestack-thumbnails');
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
    }
    
    // 生成缩略图文件名（基于视频文件路径的hash）
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(videoPath).digest('hex');
    const thumbnailPath = path.join(thumbnailDir, `${hash}.jpg`);
    
    // 如果缩略图已存在，直接返回
    if (fs.existsSync(thumbnailPath)) {
      return { success: true, thumbnailPath };
    }
    
    const execOptions = {
      timeout: 15000,
      env: process.env
    };
    
    // 在macOS打包环境中，可能需要添加常见的FFmpeg安装路径
    if (app.isPackaged && process.platform === 'darwin') {
      const commonPaths = [
        '/usr/local/bin',
        '/usr/bin',
        '/opt/homebrew/bin',
        '/opt/local/bin'
      ];
      
      const currentPath = process.env.PATH || '';
      execOptions.env.PATH = commonPaths.join(':') + ':' + currentPath;
    }
    
    // 使用FFmpeg提取视频首帧
    const ffmpegCommand = `ffmpeg -i "${videoPath}" -vframes 1 -vf "scale=240:180:force_original_aspect_ratio=decrease,pad=240:180:(ow-iw)/2:(oh-ih)/2" -y "${thumbnailPath}"`;
    
    await execPromise(ffmpegCommand, execOptions);
    
    // 检查文件是否成功生成
    if (fs.existsSync(thumbnailPath)) {
      return { success: true, thumbnailPath };
    } else {
      return { success: false, error: '缩略图生成失败' };
    }
    
  } catch (error) {
    console.error('生成视频缩略图失败:', error);
    return { success: false, error: error.message };
  }
});

// 播放视频文件
ipcMain.handle('play-video', async (event, videoPath) => {
  try {
    // 检查文件是否存在
    if (!fs.existsSync(videoPath)) {
      throw new Error('视频文件不存在');
    }
    
    console.log('使用系统默认播放器播放视频:', videoPath);
    
    // 使用系统默认应用程序打开视频文件
    await shell.openPath(videoPath);
    
    return { success: true };
  } catch (error) {
    console.error('播放视频失败:', error);
    throw new Error(`播放视频失败: ${error.message}`);
  }
});

// 裁切视频文件
ipcMain.handle('trim-video', async (event, options) => {
  try {
    const { inputPath, startTime, endTime } = options;
    
    // 检查输入文件是否存在
    if (!fs.existsSync(inputPath)) {
      throw new Error('视频文件不存在');
    }
    
    // 生成输出文件路径
    const path = require('path');
    const dir = path.dirname(inputPath);
    const ext = path.extname(inputPath);
    const basename = path.basename(inputPath, ext);
    const outputPath = path.join(dir, `${basename}_裁剪${ext}`);
    
    console.log('开始裁切视频:', {
      input: inputPath,
      output: outputPath,
      startTime,
      endTime
    });
    
    // 发送开始事件
    event.sender.send('video-trim-start', {
      fileName: path.basename(inputPath),
      outputPath: outputPath
    });
    
    // 构建FFmpeg命令
    let ffmpegCommand = 'ffmpeg';
    
    // 在macOS打包环境中扩展PATH
    let env = { ...process.env };
    if (process.platform === 'darwin' && process.env.NODE_ENV !== 'development') {
      const additionalPaths = [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/usr/bin'
      ];
      env.PATH = additionalPaths.join(':') + ':' + (env.PATH || '');
    }
    
    // 添加进度输出参数
    const args = [
      '-i', inputPath,
      '-ss', startTime,
      '-to', endTime,
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      '-progress', 'pipe:1',
      outputPath
    ];
    
    console.log('FFmpeg命令:', ffmpegCommand, args.join(' '));
    
    // 执行FFmpeg命令
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(ffmpegCommand, args, {
        env: env,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stderr = '';
      let stdout = '';
      let totalDuration = 0;
      
      // 解析时间字符串为秒数
      function parseTimeToSeconds(timeStr) {
        const parts = timeStr.split(':');
        return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
      }
      
      // 计算总时长
      const startSeconds = parseTimeToSeconds(startTime);
      const endSeconds = parseTimeToSeconds(endTime);
      totalDuration = endSeconds - startSeconds;
      
      // 处理stdout进度信息
      ffmpeg.stdout.on('data', (data) => {
        stdout += data.toString();
        const lines = stdout.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('out_time_ms=')) {
            const timeMs = parseInt(line.split('=')[1]);
            const currentSeconds = timeMs / 1000000; // 微秒转秒
            const progress = Math.min(Math.max((currentSeconds / totalDuration) * 100, 0), 100);
            
            // 发送进度更新
            event.sender.send('video-trim-progress', {
              progress: Math.round(progress),
              currentTime: currentSeconds.toFixed(1),
              totalTime: totalDuration.toFixed(1)
            });
          }
        }
      });
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log('FFmpeg输出:', data.toString());
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('视频裁切成功:', outputPath);
          // 发送完成事件
          event.sender.send('video-trim-complete', {
            success: true,
            outputPath: outputPath
          });
          resolve({ success: true, outputPath });
        } else {
          console.error('FFmpeg裁切失败，退出码:', code);
          console.error('错误输出:', stderr);
          // 发送错误事件
          event.sender.send('video-trim-error', {
            error: `视频裁切失败 (退出码: ${code})`,
            stderr: stderr
          });
          reject(new Error(`视频裁切失败 (退出码: ${code})`));
        }
      });
      
      ffmpeg.on('error', (error) => {
        console.error('FFmpeg进程错误:', error);
        // 发送错误事件
        event.sender.send('video-trim-error', {
          error: `FFmpeg执行失败: ${error.message}`
        });
        reject(new Error(`FFmpeg执行失败: ${error.message}`));
      });
      
      // 设置超时
      setTimeout(() => {
        ffmpeg.kill();
        event.sender.send('video-trim-error', {
          error: '视频裁切超时'
        });
        reject(new Error('视频裁切超时'));
      }, 300000); // 5分钟超时
    });
    
  } catch (error) {
    console.error('视频裁切失败:', error);
    throw new Error(`视频裁切失败: ${error.message}`);
  }
});
ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      throw new Error('文件不存在');
    }
    
    // 获取文件信息
    const stats = fs.statSync(filePath);
    
    console.log('删除文件:', filePath);
    
    if (stats.isDirectory()) {
      // 如果是文件夹，递归删除
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      // 如果是文件，直接删除
      fs.unlinkSync(filePath);
    }
    
    return { success: true };
  } catch (error) {
    console.error('删除文件失败:', error);
    throw new Error(`删除文件失败: ${error.message}`);
  }
});

// 重命名文件
ipcMain.handle('rename-file', async (event, options) => {
  try {
    const { oldPath, newPath } = options;
    
    // 检查原文件是否存在
    if (!fs.existsSync(oldPath)) {
      throw new Error('原文件不存在');
    }
    
    console.log('重命名文件:', oldPath, '->', newPath);
    
    // 使用mv命令执行重命名
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      const mv = spawn('mv', [oldPath, newPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stderr = '';
      
      mv.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      mv.on('close', (code) => {
        if (code === 0) {
          console.log('文件重命名成功:', newPath);
          resolve({ success: true });
        } else {
          console.error('mv命令失败，退出码:', code);
          console.error('错误输出:', stderr);
          reject(new Error(`重命名失败 (退出码: ${code}): ${stderr}`));
        }
      });
      
      mv.on('error', (error) => {
        console.error('mv命令执行错误:', error);
        reject(new Error(`mv命令执行失败: ${error.message}`));
      });
      
      // 设置超时
      setTimeout(() => {
        mv.kill();
        reject(new Error('重命名操作超时'));
      }, 10000); // 10秒超时
    });
    
  } catch (error) {
    console.error('重命名文件失败:', error);
    throw new Error(`重命名文件失败: ${error.message}`);
  }
});

// 打开文件夹
ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    // 检查文件夹是否存在
    if (!fs.existsSync(folderPath)) {
      throw new Error('文件夹不存在');
    }
    
    // 检查是否为文件夹
    const stats = fs.statSync(folderPath);
    if (!stats.isDirectory()) {
      throw new Error('指定路径不是文件夹');
    }
    
    console.log('打开系统文件夹:', folderPath);
    
    // 使用系统默认文件管理器打开文件夹
    await shell.openPath(folderPath);
    
    return { success: true };
  } catch (error) {
    console.error('打开文件夹失败:', error);
    throw new Error(`打开文件夹失败: ${error.message}`);
  }
});

// 获取应用版本信息
ipcMain.handle('get-app-version', async () => {
  try {
    const packageJsonPath = path.join(__dirname, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return { version: packageJson.version };
  } catch (error) {
    console.error('获取版本信息失败:', error);
    return { version: '1.0.0' }; // 默认版本号
  }
});
