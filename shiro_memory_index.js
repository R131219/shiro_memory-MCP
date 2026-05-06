// == shiro_memory_index.js ==
// ShiroMemory 前端入口类
// v2: 适配统一错误格式、缓存控制参数、连接状态管理

class ShiroMemory {
  constructor(config = {}) {
    this.server = config.server || null;
    this.adapterName = config.adapterName || 'filesystem';
    this.cacheEnabled = config.cacheEnabled !== false;
    this._connected = false;
    this._eventListeners = {};
    this._pendingQueue = [];     // 未连接时的操作队列
  }

  // ===== 事件系统 =====

  on(event, callback) {
    if (!this._eventListeners[event]) {
      this._eventListeners[event] = [];
    }
    this._eventListeners[event].push(callback);
    return this;
  }

  off(event, callback) {
    if (!this._eventListeners[event]) return this;
    this._eventListeners[event] = this._eventListeners[event].filter(cb => cb !== callback);
    return this;
  }

  _emit(event, data) {
    const listeners = this._eventListeners[event];
    if (listeners) {
      listeners.forEach(cb => {
        try { cb(data); } catch (e) { console.warn(`事件监听器异常: ${e.message}`); }
      });
    }
  }

  // ===== 连接管理 =====

  async connect() {
    if (this._connected) return;

    try {
      // 这里在实际使用时会建立与 MCP Server 的连接
      // 比如 WebSocket、Worker 通信等
      this._connected = true;

      // 处理等待队列
      while (this._pendingQueue.length > 0) {
        const { method, args, resolve } = this._pendingQueue.shift();
        try {
          const result = await this[method](...args);
          resolve(result);
        } catch (err) {
          resolve({ success: false, error: err.message });
        }
      }

      this._emit('connected', { adapter: this.adapterName });
      return { success: true };
    } catch (err) {
      this._connected = false;
      this._emit('error', { message: `连接失败: ${err.message}` });
      return { success: false, error: err.message };
    }
  }

  async disconnect() {
    this._connected = false;
    this._emit('disconnected', {});
    return { success: true };
  }

  isConnected() {
    return this._connected;
  }

  // ===== 核心操作方法 =====

  // 读取记忆
  async read(memoryId) {
    if (!this.server && !this._connected) {
      return this._enqueue('read', [memoryId]);
    }

    try {
      if (this.server && typeof this.server.processRead === 'function') {
        const result = await this.server.processRead(memoryId);
        this._emit('synced', { action: 'read', memoryId, success: result.success });
        return result;
      }
      return { success: false, error: '未连接服务端' };
    } catch (err) {
      this._emit('error', { action: 'read', memoryId, message: err.message });
      return { success: false, error: err.message };
    }
  }

  // 写入记忆
  async write(memoryId, content) {
    if (!this.server && !this._connected) {
      return this._enqueue('write', [memoryId, content]);
    }

    try {
      if (this.server && typeof this.server.processWrite === 'function') {
        const result = await this.server.processWrite(memoryId, content);
        this._emit('synced', { action: 'write', memoryId, success: result.success });
        return result;
      }
      return { success: false, error: '未连接服务端' };
    } catch (err) {
      this._emit('error', { action: 'write', memoryId, message: err.message });
      return { success: false, error: err.message };
    }
  }

  // 搜索记忆（关键词）
  async search(keyword) {
    if (!this.server && !this._connected) {
      return this._enqueue('search', [keyword]);
    }

    try {
      if (this.server && typeof this.server.processSearch === 'function') {
        const result = await this.server.processSearch(keyword);
        this._emit('synced', { action: 'search', keyword, success: result.success });
        return result;
      }
      return { success: false, error: '未连接服务端' };
    } catch (err) {
      this._emit('error', { action: 'search', keyword, message: err.message });
      return { success: false, error: err.message };
    }
  }

  // 删除记忆
  async delete(memoryId) {
    if (!this.server && !this._connected) {
      return this._enqueue('delete', [memoryId]);
    }

    try {
      if (this.server && typeof this.server.processDelete === 'function') {
        const result = await this.server.processDelete(memoryId);
        this._emit('synced', { action: 'delete', memoryId, success: result.success });
        return result;
      }
      return { success: false, error: '未连接服务端' };
    } catch (err) {
      this._emit('error', { action: 'delete', memoryId, message: err.message });
      return { success: false, error: err.message };
    }
  }

  // 列出所有记忆
  async list() {
    if (!this.server && !this._connected) {
      return this._enqueue('list', []);
    }

    try {
      if (this.server && typeof this.server.processList === 'function') {
        const result = await this.server.processList();
        this._emit('synced', { action: 'list', success: result.success });
        return result;
      }
      return { success: false, error: '未连接服务端' };
    } catch (err) {
      this._emit('error', { action: 'list', message: err.message });
      return { success: false, error: err.message };
    }
  }

  // 获取服务端状态
  async getStatus() {
    if (this.server && typeof this.server.getStatus === 'function') {
      return { success: true, data: this.server.getStatus() };
    }
    return { success: false, error: '服务端不支持 getStatus' };
  }

  // ===== 内部方法 =====

  _enqueue(method, args) {
    return new Promise((resolve) => {
      this._pendingQueue.push({ method, args, resolve });
    });
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ShiroMemory };
}

// 浏览器环境也挂载到全局
if (typeof window !== 'undefined') {
  window.ShiroMemory = ShiroMemory;
}