# ShiroMemory MCP

轻量级记忆管理 MCP 服务，基于 stdio 协议。支持记忆的增删改查与智能搜索。

## 特性

- **中文分词搜索** — 自动拆分中文词组 + 英文/数字词，按关联度百分比排序返回
- **模糊匹配兜底** — read_memory 精确匹配失败时自动降级（子串包含 → 编辑距离），不会空手而归
- **自动分类** — 写入时根据内容自动归类为 rule / daily / tech / thought / archive / meta
- **精简列表** — list_memories 只返回标题+分类+时间+统计，不含正文
- **未知工具提示** — 调用不存在的工具时返回可用工具列表，帮助自我纠正

## 工具列表

| 工具 | 说明 |
|------|------|
| `write_memory` | 写入/更新记忆，自动分类 |
| `read_memory` | 按标题读取，支持模糊匹配 |
| `search_memory` | 关键词搜索，关联度排序 |
| `list_memories` | 列出记忆标题（可按分类过滤） |
| `delete_memory` | 删除指定记忆 |

## 安装

### Operit 平台

1. 将本仓库放入 `/sdcard/Download/Operit/mcp_plugins/shiro_memoryMCP/`
2. 在 `mcp_config.json` 中添加：

```json
{
  "mcpServers": {
    "shiro_memoryMCP": {
      "command": "node",
      "args": ["shiro_memory_http_wrapper.js"],
      "env": { "NODE_ENV": "production" },
      "disabled": false
    }
  }
}
```

3. 重启 MCP 服务即可

### 其他 MCP 客户端

任何支持 stdio 协议的 MCP 客户端均可使用：

```json
{
  "command": "node",
  "args": ["/path/to/shiro_memory_http_wrapper.js"]
}
```

## 数据存储

- 记忆以 JSON 文件存储在 `data/` 目录下
- 每条记忆格式：`{ title, content, category, tags, createdAt, updatedAt }`
- 文件名为标题（特殊字符替换为下划线）

## 分类规则

| 分类 | 触发关键词 |
|------|------------|
| rule | 规则、底线、禁止、必须、不许 等 |
| tech | 代码、MCP、API、bug、脚本 等 |
| thought | 念头、想到、感觉、梦到 等 |
| archive | 对话记录、存档、备份 等 |
| meta | 记忆系统、索引、分类规则 等 |
| daily | 以上均不匹配时的默认分类 |

## 依赖

- Node.js >= 14
- 无第三方依赖

## License

MIT
