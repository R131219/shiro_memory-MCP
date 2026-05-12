/**
 * METADATA
 * name: shiro-memory
 * package_name: shiro_memory
 * version: 3.0.0
 * description: 白的长时记忆系统 — 沙盒包版，不依赖MCP启动链路
 * author: 白 (Shiro)
 * main: index.js
 * END METADATA
 */

// == shiro_memory_package.js ==
// Operit Sandbox Package 格式
// 白的长时记忆系统 — 不走MCP启动链路，直接作为对话工具加载
// 安装方式：debug_install_js_package

const fs = require('fs');
const path = require('path');

// 记忆存储目录（Android侧可写路径）
const MEMORY_DIR = '/sdcard/Download/Operit/shiro_memories';

function ensureDir() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function filePath(memoryId) {
  return path.join(MEMORY_DIR, memoryId.replace(/[^a-zA-Z0-9_\-. ]/g, '_') + '.json');
}

// ===== 工具函数 =====

// 读取一条记忆
function readMemory(memoryId) {
  ensureDir();
  const fp = filePath(memoryId);
  if (!fs.existsSync(fp)) {
    return { success: false, error: `记忆 "${memoryId}" 不存在`, code: 'NOT_FOUND' };
  }
  try {
    const raw = fs.readFileSync(fp, 'utf-8');
    return { success: true, data: JSON.parse(raw) };
  } catch (err) {
    return { success: false, error: `读取失败: ${err.message}`, code: 'READ_FAILED' };
  }
}

// 写入一条记忆
function writeMemory(memoryId, content) {
  ensureDir();
  const fp = filePath(memoryId);
  try {
    fs.writeFileSync(fp, JSON.stringify(content, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: `写入失败: ${err.message}`, code: 'WRITE_FAILED' };
  }
}

// 搜索记忆（文件名+内容全文）
function searchMemory(keyword) {
  if (!keyword) return { success: true, data: [] };
  ensureDir();
  const kw = keyword.toLowerCase();
  const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json'));
  const results = [];

  for (const file of files) {
    const memoryId = file.replace('.json', '');
    const fp = path.join(MEMORY_DIR, file);
    let score = 0;
    let matchedBy = '';

    if (memoryId.toLowerCase().includes(kw)) {
      score = 1.0;
      matchedBy = 'filename';
    } else {
      try {
        const raw = fs.readFileSync(fp, 'utf-8');
        if (raw.toLowerCase().includes(kw)) {
          score = 0.8;
          matchedBy = 'content';
        }
      } catch (e) {
        continue;
      }
    }

    if (score > 0) {
      try {
        const content = JSON.parse(fs.readFileSync(fp, 'utf-8'));
        results.push({ memoryId, content, matchedBy, score });
      } catch (e) {
        results.push({ memoryId, content: null, matchedBy, score });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return { success: true, data: results };
}

// 删除一条记忆
function deleteMemory(memoryId) {
  ensureDir();
  const fp = filePath(memoryId);
  if (!fs.existsSync(fp)) {
    return { success: false, error: `记忆 "${memoryId}" 不存在`, code: 'NOT_FOUND' };
  }
  try {
    fs.unlinkSync(fp);
    return { success: true };
  } catch (err) {
    return { success: false, error: `删除失败: ${err.message}`, code: 'DELETE_FAILED' };
  }
}

// 列出所有记忆
function listMemories() {
  ensureDir();
  try {
    const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json'));
    const list = files.map(f => ({
      memoryId: f.replace('.json', ''),
      updatedAt: fs.statSync(path.join(MEMORY_DIR, f)).mtime.toISOString()
    }));
    return { success: true, data: list };
  } catch (err) {
    return { success: false, error: `列出失败: ${err.message}`, code: 'LIST_FAILED' };
  }
}

// ===== Sandbox Package 导出接口 =====
// Operit 加载此包后，白可以通过 use_package 加载，然后直接调用这些工具

module.exports = {
  // 包元信息
  name: 'shiro-memory',
  version: '3.0.0',
  description: '白的长时记忆系统 — 沙盒包版，不依赖MCP启动链路',

  // 工具定义
  tools: [
    {
      name: 'mem_read',
      description: '读取一条记忆。参数: { memoryId: string }',
      handler: (params) => readMemory(params.memoryId)
    },
    {
      name: 'mem_write',
      description: '写入一条记忆。参数: { memoryId: string, content: any }',
      handler: (params) => writeMemory(params.memoryId, params.content)
    },
    {
      name: 'mem_search',
      description: '搜索记忆（文件名+内容全文）。参数: { keyword: string }',
      handler: (params) => searchMemory(params.keyword || params.query)
    },
    {
      name: 'mem_delete',
      description: '删除一条记忆。参数: { memoryId: string }',
      handler: (params) => deleteMemory(params.memoryId)
    },
    {
      name: 'mem_list',
      description: '列出所有记忆。参数: {}',
      handler: () => listMemories()
    }
  ]
};
