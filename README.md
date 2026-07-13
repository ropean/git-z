# digit

Git 历史可视化 CLI：分析本地仓库的提交历史，生成一个自包含的 HTML 报告（或 JSON），
包含提交活跃度、作者排行、文件变更热度等图表。

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

## 已知范围

本期未实现：增量分析缓存、`.digit.yaml` 配置文件、CI 定时报告、完整分支拓扑图谱
（`--branch`/`--all-branches` 已采集分支与标签列表，但图表层暂未渲染分支图）。
