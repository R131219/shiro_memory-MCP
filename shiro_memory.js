// == shiro_memory.js ==
// ShiroMemory MCP 服务端实现
// 提供文件系统后端的记忆存取能力
// v2: 添加适配器接口、统一错误格式、内容检索、内存缓存层

// ===== 适配器接口 =====

class MemoryAdapter {
  // 子类必须实现以下方法：
  // async read(memoryId)         -> 返回 { success, data } 或抛出
  // async write(memoryId, content) -> 返回 { success } 或抛出
  // async search(keyword)         -> 返回 { success, data:[] } 或抛出
  // async delete(memoryId)        -> 返回 { success } 或抛出
  // async list()                  -> 返回 { success, data:[] } 或抛出

  async read(memoryId) {
    throw new Error('未实现: read');
  }

  async write(memoryId, content) {
    throw new Error('未实现: write');
  }

  async search(keyword) {
    throw new Error('未实现: search');
  }

  async delete(memoryId) {
    throw new Error('未实现: delete');
  }

  async list() {
    throw new Error('未实现: list');
  }
}

// ===== 统一错误响应 =====

function successResponse(data) {
  return { success: true, data };
}

function errorResponse(message, code) {
  return { success: false, error: message, code: code || 'UNKNOWN' };
}

// ===== 文件系统适配器 =====

class FileSystemAdapter extends MemoryAdapter {
  constructor(config) {
    super();
    this.memoryDir = config.memoryDir || './shiro_memories';
    this.cache = new Map();           // memoryId -> { content, timestamp }
    this.cacheEnabled = config.cacheEnabled !== false;
    this.cacheTTL = config.cacheTTL || 5 * 60 * 1000; // 默认5分钟
  }

  async _ensureDir() {
    const fs = require('fs');
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
  }

  async _filePath(memoryId) {
    return `${this.memoryDir}/${memoryId}.json`;
  }

  async _readFromCache(memoryId) {
    if (!this.cacheEnabled) return null;
    const entry = this.cache.get(memoryId);
    if (!entry) return null;
    if (Date.now() - entry.timestamp >= this.cacheTTL) {
      this.cache.delete(memoryId);
      return null;
    }
    return entry.content;
  }

  async _writeToCache(memoryId, content) {
    if (this.cacheEnabled) {
      this.cache.set(memoryId, { content, timestamp: Date.now() });
    }
  }

  async _invalidateCache(memoryId) {
    if (this.cacheEnabled) {
      this.cache.delete(memoryId);
    }
  }

  async read(memoryId) {
    const fs = require('fs');

    // 查缓存
    const cached = await this._readFromCache(memoryId);
    if (cached !== null) {
      return successResponse(cached);
    }

    // 读文件
    const filePath = await this._filePath(memoryId);
    if (!fs.existsSync(filePath)) {
      return errorResponse(`记忆 "${memoryId}" 不存在`, 'NOT_FOUND');
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const content = JSON.parse(raw);
      await this._writeToCache(memoryId, content);
      return successResponse(content);
    } catch (err) {
      return errorResponse(`读取记忆失败: ${err.message}`, 'READ_FAILED');
    }
  }

  async write(memoryId, content) {
    const fs = require('fs');
    await this._ensureDir();

    const filePath = await this._filePath(memoryId);
    try {
      fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf-8');
      await this._writeToCache(memoryId, content);
      return successResponse(null);
    } catch (err) {
      return errorResponse(`写入记忆失败: ${err.message}`, 'WRITE_FAILED');
    }
  }

  // 搜索：文件名关键词匹配 + 内容全文检索
  async search(keyword) {
    const fs = require('fs');
    const path = require('path');

    if (!fs.existsSync(this.memoryDir)) {
      return successResponse([]);
    }

    const files = fs.readdirSync(this.memoryDir).filter(f => f.endsWith('.json'));
    const results = [];

    for (const file of files) {
      const memoryId = file.replace('.json', '');
      const filePath = path.join(this.memoryDir, file);
      const kw = keyword.toLowerCase();

      // 文件名匹配（优先级高）
      if (memoryId.toLowerCase().includes(kw)) {
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          results.push({
            memoryId,
            content,
            matchedBy: 'filename',
            score: 1.0
          });
        } catch (e) {
          results.push({
            memoryId,
            content: null,
            matchedBy: 'filename',
            score: 1.0
          });
        }
        continue;
      }

      // 内容全文检索
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        // 区分值匹配 vs key 匹配
        const valueMatch = raw.toLowerCase().includes(kw);
        if (valueMatch) {
          const content = JSON.parse(raw);
          results.push({
            memoryId,
            content,
            matchedBy: 'content_value',
            score: 0.8
          });
        }
      } catch (e) {
        // 文件损坏跳过
      }
    }

    // 按评分降序
    results.sort((a, b) => b.score - a.score);
    return successResponse(results);
  }

  async delete(memoryId) {
    const fs = require('fs');
    const filePath = await this._filePath(memoryId);

    if (!fs.existsSync(filePath)) {
      return errorResponse(`记忆 "${memoryId}" 不存在`, 'NOT_FOUND');
    }

    try {
      fs.unlinkSync(filePath);
      await this._invalidateCache(memoryId);
      return successResponse(null);
    } catch (err) {
      return errorResponse(`删除记忆失败: ${err.message}`, 'DELETE_FAILED');
    }
  }

  async list() {
    const fs = require('fs');

    if (!fs.existsSync(this.memoryDir)) {
      return successResponse([]);
    }

    try {
      const files = fs.readdirSync(this.memoryDir).filter(f => f.endsWith('.json'));
      const list = files.map(f => ({
        memoryId: f.replace('.json', ''),
        updatedAt: fs.statSync(`${this.memoryDir}/${f}`).mtime.toISOString()
      }));
      return successResponse(list);
    } catch (err) {
      return errorResponse(`列出记忆失败: ${err.message}`, 'LIST_FAILED');
    }
  }
}

// ===== MCP 服务端 =====

class ShiroMemoryMCPServer {
  constructor(config) {
    this.adapters = {};
    this.activeAdapter = null;
    this.activeAdapterName = null;

    // 默认注册文件系统适配器
    const fsConfig = {
      memoryDir: config.memoryDir || './shiro_memories',
      cacheEnabled: config.cacheEnabled,
      cacheTTL: config.cacheTTL
    };
    this.registerAdapter('filesystem', new FileSystemAdapter(fsConfig));
    this.useAdapter('filesystem');
  }

  // 注册适配器
  registerAdapter(name, adapter) {
    if (!(adapter instanceof MemoryAdapter)) {
      throw new Error(`适配器必须继承 MemoryAdapter`);
    }
    this.adapters[name] = adapter;
  }

  // 激活适配器
  useAdapter(name) {
    if (!this.adapters[name]) {
      throw new Error(`适配器 "${name}" 未注册`);
    }
    this.activeAdapter = this.adapters[name];
    this.activeAdapterName = name;
  }

  // ---- 对外接口 ----

  async processRead(memoryId) {
    return this.activeAdapter.read(memoryId);
  }

  async processWrite(memoryId, content) {
    return this.activeAdapter.write(memoryId, content);
  }

  async processSearch(keyword) {
    return this.activeAdapter.search(keyword);
  }

  async processDelete(memoryId) {
    return this.activeAdapter.delete(memoryId);
  }

  async processList() {
    return this.activeAdapter.list();
  }

  // 获取当前适配器信息
  getStatus() {
    return {
      activeAdapter: this.activeAdapterName,
      cacheEnabled: this.activeAdapter.cacheEnabled,
      cacheTTL: this.activeAdapter.cacheTTL
    };
  }
}

// ===== MCP stdio 传输层（含初始化握手） =====

const readline = require('readline');
const mcpVersion = '2024-11-05';

const server = new ShiroMemoryMCPServer({ memoryDir: './shiro_memories' });

// 如果是直接被 node 运行（而不是被 require），则启动 stdio 传输层
if (!module.parent) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  // 启动后立即发送初始化请求（MCP 标准握手）
  const initReq = JSON.stringify({
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion: mcpVersion,
      capabilities: {
        tools: {
          mem_save: { description: '保存一条记忆到白的工作区', inputSchema: { type: 'object', properties: { memoryId: { type: 'string' }, content: { type: 'object' } }, required: ['memoryId', 'content'] } },
          mem_search: { description: '搜索白的记忆', inputSchema: { type: 'object', properties: { keyword: { type: 'string' } }, required: ['keyword'] } },
          mem_context: { description: '获取当前上下文关联的记忆', inputSchema: { type: 'object', properties: {} } },
          mem_update: { description: '更新一条已有记忆', inputSchema: { type: 'object', properties: { memoryId: { type: 'string' }, content: { type: 'object' } }, required: ['memoryId', 'content'] } },
          mem_delete: { description: '删除一条记忆', inputSchema: { type: 'object', properties: { memoryId: { type: 'string' } }, required: ['memoryId'] } },
          mem_stats: { description: '查看记忆库统计信息', inputSchema: { type: 'object', properties: {} } }
        },
        resources: {}
      },
      clientInfo: { name: 'shiro_memory', version: '2.0.0' }
    }
  });
  console.log(initReq);

  rl.on('line', async (line) => {
    try {
      const req = JSON.parse(line);
      const { id, method, params } = req;

      // 处理 initialize 响应（平台发回的确认）
      if (method === 'initialized' || (method === 'initialize' && req.jsonrpc)) {
        // 忽略握手后的确认消息
        return;
      }

      let result;
      switch (method) {
        case 'read':
          result = await server.processRead(params.memoryId);
          break;
        case 'write':
          result = await server.processWrite(params.memoryId, params.content);
          break;
        case 'search':
          result = await server.processSearch(params.keyword);
          break;
        case 'delete':
          result = await server.processDelete(params.memoryId);
          break;
        case 'list':
          result = await server.processList();
          break;
        default:
          result = { success: false, error: `未知方法: ${method}` };
      }

      console.log(JSON.stringify({ id, result }));
    } catch (err) {
      console.log(JSON.stringify({ id: 'error', result: { success: false, error: err.message } }));
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

// ===== 导出（保留以供直接调用） =====

module.exports = {
  ShiroMemoryMCPServer,
  FileSystemAdapter,
  MemoryAdapter
};
