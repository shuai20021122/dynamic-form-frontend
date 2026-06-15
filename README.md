# dynamic-form-frontend

Vue 3 + Vite 前端仓库，用于逐步替代原 Flask `templates + static` 页面。

## 当前已迁移页面

- 登录页 `Login.vue`
- Dashboard `Dashboard.vue`
- 用户管理 `Users.vue`
- 团队管理 `Teams.vue`
- 表单列表 `Forms.vue`
- 表单设计 `FormDesigner.vue`
- 表单填写 `FormFill.vue`
- 历史表单 `FormHistory.vue`
- 文档中心 `Documents.vue`
- 双语简表编辑 `BilingualEditor.vue`

## API 模块

- `src/api/request.js`
- `src/api/auth.js`
- `src/api/users.js`
- `src/api/teams.js`
- `src/api/forms.js`
- `src/api/entries.js`
- `src/api/documents.js`
- `src/api/export.js`

所有请求都只使用 `/api/...`，不写死完整后端地址。

## 开发启动

```bash
npm install
npm run dev
```

默认前端地址：

- `http://127.0.0.1:5173`

Vite 通过代理把 `/api` 转发到：

- `http://127.0.0.1:5000`

## 构建

```bash
npm run build
```

## 当前已知接口缺口 / 注意事项

1. 没有“全局文档列表”接口
   - 当前 `Documents.vue` 通过 `?entryId=` 查询单条报名记录的文档
   - 如果后续需要真正的“文档中心”，后端需要补全局文档查询 API

2. 没有单独的“启用用户”接口
   - 当前前端通过 `PUT /api/users/:id` 设置 `is_active=true` 作为启用方案

3. `POST /api/documents/{id}/translate`
   - 当前接口存在，但不适合作为主流程
   - 前端优先使用 `translate-preview` 和 `generate-bilingual`

4. 权限控制仍以后端为准
   - 前端不会在本地重写完整权限系统
   - 若某角色调用接口返回 `403`，页面直接展示后端错误信息
