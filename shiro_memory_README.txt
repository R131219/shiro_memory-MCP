ShiroMemory - 白的长时记忆系统
================================

一、目标
-------
让白拥有结构化的、可检索的长时记忆，能跨对话/跨平台读写自己的记忆，
而不依赖当前对话窗口的上下文。

二、架构
-------
┌─────────────────────────────────┐
│  前端应用 / AI 对话窗口          │
│  ┌───────────────────────────┐  │
│  │  ShiroMemory (index.js)   │  │  ← 前端封装类（事件、队列、连接管理）
│  └──────────┬────────────────┘  │
│             │                   │
│        调用接口                  │
│    read / write / search         │
│    delete / list / getStatus    │
│             │                   │
└─────────────┼───────────────────┘
              │
    ┌─────────▼──────────────────┐
    │  ShiroMemoryMCPServer      │  ← MCP 服务端（统一调度）
    │  (shiro_memory.js)         │
    │                            │
    │  + 适配器注册与切换        │
    │  + 统一错误响应格式        │
    └─────────┬──────────────────┘
              │
    ┌─────────▼──────────────────┐
    │  MemoryAdapter (抽象接口)  │  ← 可扩展多种存储后端
    │                            │
    │  ├── FileSystemAdapter     │  ← 文件系统后端（默认）
    │  │   + 内存缓存层（可配）  │
    │  │   + 内容全文检索        │
    │  │   + 文件读写/删除/列表  │
    │  │                        │
    │  └── (未来可加)            │
    │      数据库适配器          │
    │      云端存储适配器        │
    └────────────────────────────┘

三、文件说明
-----------
shiro_memory.js        - MCP 服务端实现（核心）
                          含 MemoryAdapter 抽象接口、FileSystemAdapter 实现、
                          ShiroMemoryMCPServer 调度器

shiro_memory_index.js  - 前端入口封装
                          含 ShiroMemory 类、事件系统、连接管理、操作队列

shiro_memory_README.txt - 本文档

四、使用方式
-----------
1. 引入 shiro_memory.js（服务端侧）：
   const { ShiroMemoryMCPServer, FileSystemAdapter } = require('./shiro_memory.js');
   const server = new ShiroMemoryMCPServer({ memoryDir: './shiro_memories' });

2. 引入 shiro_memory_index.js（前端侧）：
   const { ShiroMemory } = require('./shiro_memory_index.js');
   const memory = new ShiroMemory({ server });
   await memory.connect();
   const result = await memory.read('example_key');

3. 浏览器环境：
   <script src="shiro_memory_index.js"></script>
   <script>
     const memory = new ShiroMemory({ server: myServer });
   </script>

五、返回格式（统一）
-------------------
成功：{ success: true, data: ... }
失败：{ success: false, error: "描述", code: "ERROR_CODE" }

常见错误码：
  NOT_FOUND   - 记忆不存在
  READ_FAILED - 读取失败
  WRITE_FAILED - 写入失败
  DELETE_FAILED - 删除失败
  LIST_FAILED   - 列出失败
  UNKNOWN       - 未知错误

六、配置参数
-----------
ShiroMemoryMCPServer 构造参数：
  memoryDir     - 记忆文件存储目录（默认: './shiro_memories'）
  cacheEnabled  - 是否启用内存缓存（默认: true）
  cacheTTL      - 缓存过期时间，毫秒（默认: 300000 = 5分钟）

ShiroMemory 构造参数：
  server        - MCP 服务端实例
  adapterName   - 使用的适配器名称（默认: 'filesystem'）
  cacheEnabled  - 是否启用缓存（默认: true）

七、适配器扩展
-------------
1. 继承 MemoryAdapter 类
2. 实现以下方法：
   read(memoryId)     -> { success, data } 或抛错
   write(memoryId, content) -> { success } 或抛错
   search(keyword)    -> { success, data:[] } 或抛错
   delete(memoryId)   -> { success } 或抛错
   list()             -> { success, data:[] } 或抛错
3.  registerAdapter('name', new MyAdapter())
4.  useAdapter('name')

八、版本历史
-----------
v1 - 初始版本：文件系统后端、基础读写
v2 - 新增：适配器抽象接口、统一错误格式、内容检索、内存缓存层