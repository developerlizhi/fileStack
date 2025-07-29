const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const util = require('util');

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
    const fileDetails = await Promise.all(files.map(async (file) => {
      const filePath = path.join(folderPath, file.name);
      const stats = fs.statSync(filePath);
      
      let details = {
        name: file.name,
        path: filePath,
        size: file.isDirectory() ? await calculateFolderSize(filePath) : stats.size,
        isDirectory: file.isDirectory(),
        isHidden: file.name.startsWith('.')
      };
      
      // 检查是否为视频文件
      const videoExtensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'];
      const ext = path.extname(file.name).toLowerCase();
      
      if (!file.isDirectory() && videoExtensions.includes(ext)) {
        try {
          // 根据用户要求，直接使用系统环境中的ffprobe
          // 在打包环境中，可能需要特殊处理PATH环境变量
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
            
            // 将这些路径添加到PATH环境变量中
            const currentPath = process.env.PATH || '';
            execOptions.env.PATH = commonPaths.join(':') + ':' + currentPath;
            console.log('视频信息获取 - 扩展PATH环境变量:', execOptions.env.PATH);
          }
          
          // 使用ffprobe命令获取视频信息，更可靠
          console.log('获取视频信息:', filePath);
          const { stdout } = await execPromise(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,bit_rate -show_entries format=duration,bit_rate -of json "${filePath}"`, execOptions);
          details.isVideo = true;
          
          try {
            // 解析JSON格式的输出
            const info = JSON.parse(stdout);
            
            // 获取时长（秒）
            if (info.format && info.format.duration) {
              const totalSeconds = parseFloat(info.format.duration);
              const hours = Math.floor(totalSeconds / 3600);
              const minutes = Math.floor((totalSeconds % 3600) / 60);
              const seconds = Math.floor(totalSeconds % 60);
              details.duration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            
            // 获取视频流信息
            if (info.streams && info.streams.length > 0) {
              // 查找视频流
              const videoStream = info.streams.find(stream => stream.codec_type === 'video' || (stream.width && stream.height)) || info.streams[0];
              
              if (videoStream) {
                // 分辨率
                if (videoStream.width && videoStream.height) {
                  details.resolution = `${videoStream.width}x${videoStream.height}`;
                }
                
                // 编码格式
                if (videoStream.codec_name) {
                  details.codec = videoStream.codec_name;
                }
                
                // 码率
                if (videoStream.bit_rate) {
                  details.bitrate = `${Math.round(parseInt(videoStream.bit_rate) / 1000)} kb/s`;
                } else if (info.format && info.format.bit_rate) {
                  details.bitrate = `${Math.round(parseInt(info.format.bit_rate) / 1000)} kb/s`;
                }
              }
            }
          } catch (parseError) {
            console.error('解析视频信息失败:', parseError);
            // 如果JSON解析失败，尝试使用ffmpeg命令和正则表达式解析
            const { stdout: ffmpegOutput } = await execPromise(`ffmpeg -i "${filePath}" 2>&1`);
            
            // 解析视频信息
            const durationMatch = ffmpegOutput.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/i);
            if (durationMatch) {
              const hours = parseInt(durationMatch[1]);
              const minutes = parseInt(durationMatch[2]);
              const seconds = parseInt(durationMatch[3]);
              details.duration = `${hours}:${minutes}:${seconds}`;
            }
            
            const resolutionMatch = ffmpegOutput.match(/(\d{2,4})x(\d{2,4})/i);
            if (resolutionMatch) {
              details.resolution = `${resolutionMatch[1]}x${resolutionMatch[2]}`;
            }
            
            const bitrateMatch = ffmpegOutput.match(/bitrate: (\d+) kb\/s/i);
            if (bitrateMatch) {
              details.bitrate = `${bitrateMatch[1]} kb/s`;
            }
            
            const codecMatch = ffmpegOutput.match(/Video: ([^,]+)/i);
            if (codecMatch) {
              details.codec = codecMatch[1].trim();
            }
          }
        } catch (error) {
          // 如果ffmpeg命令失败，仍然标记为视频但没有详细信息
          details.isVideo = true;
          details.ffmpegError = true;
        }
      }
      
      return details;
    }));
    
    return fileDetails;
  } catch (error) {
    return { error: error.message };
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
    
    const args = [
      '-i', inputPath,
      '-ss', startTime,
      '-to', endTime,
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
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
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log('FFmpeg输出:', data.toString());
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('视频裁切成功:', outputPath);
          resolve({ success: true, outputPath });
        } else {
          console.error('FFmpeg裁切失败，退出码:', code);
          console.error('错误输出:', stderr);
          reject(new Error(`视频裁切失败 (退出码: ${code})`));
        }
      });
      
      ffmpeg.on('error', (error) => {
        console.error('FFmpeg进程错误:', error);
        reject(new Error(`FFmpeg执行失败: ${error.message}`));
      });
      
      // 设置超时
      setTimeout(() => {
        ffmpeg.kill();
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
