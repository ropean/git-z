# digit

Git 历史可视化 CLI：分析本地仓库的提交历史，生成一个自包含的 HTML 报告（或 JSON）。
报告页面为英文界面，包含总览趋势、可筛选的提交记录（含真实 diff 详情抽屉）、贡献者、
文件热度、分支/合并图谱、文件耦合分析、代码存活率估算、commit 关键词云等板块。

## 构建

```bash
make build        # 等价于先 build-web 再 build-go
./digit --help
```

前端（`web/`）基于 Vite + React + ECharts，使用 `vite-plugin-singlefile` 打包成单个
`web/dist/index.html`，再由 Go 的 `go:embed` 内嵌进最终二进制。修改前端代码后需要
重新执行 `make build-web`（或 `make build`）才能让 `go build` 嵌入最新产物。

## 用法

```bash
digit .                                   # 分析当前目录仓库，生成 ./digit-report.html
digit /path/to/repo -o report.html
digit . --since 2026-01-01 --until 2026-07-01
digit . --author "Wei,someone@example.com"
digit . --exclude "node_modules/**,dist/**"
digit . --branch main
digit . --all-branches
digit . --max-commits 5000
digit . --open
digit . --format json --output data.json
```

参数详见 `digit --help`。

## 项目结构

```
cmd/            cobra 命令与参数绑定
internal/gitlog     调用系统 git 命令并流式解析 numstat 输出
internal/model       共享数据结构
internal/aggregate   include/exclude glob 过滤 + 作者/文件维度聚合
internal/render      HTML 模板注入 / JSON 输出
web/             前端源码（Vite + React + ECharts）
web/dist/        前端构建产物（已提交，供 go:embed 直接使用）
```

## 报告板块

- **Overview** — KPI 卡片 + 按周聚合的代码规模趋势图
- **Commits** — 按作者/文件路径/message 关键词筛选 + 分页表格，点击一行打开右侧详情抽屉
  （抽屉内可展开每个文件的真实 diff —— 需要生成报告时加 `--diff-content`，否则只显示增删行数）
- **Contributors** — 按提交数排行，点击可联动筛选 Commits
- **File Heat** — 按改动频率着色/放大的文件色块，点击联动筛选 Commits
- **Branch Graph** — 分支/合并提交图谱（依赖 `git log --source`；只有 `--all-branches` 时才有多分支意义）
- **Coupling** — 经常在同一次提交中一起修改的文件网络图 + 列表
- **Survival (estimated)** — 按月新增行数 vs. 估算存活比例，衰减模型估算，非真实 `git blame` 分析
- **Keywords** — 从 commit message 前缀（`feat:`/`fix:`/…）提取的词云

顶部还有时间范围快捷按钮、自定义日期、提交密度直方图 + 双滑块刷选，以及全局搜索框。

## 已知范围

本期未实现：增量分析缓存、`.digit.yaml` 配置文件、CI 定时报告。设计稿中的"仓库切换器/对比模式"
未实现——那是 mock 数据里做了两个假仓库用来演示对比，本工具是单仓库单报告模型，不适用。
