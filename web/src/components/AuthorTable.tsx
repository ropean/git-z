import type { AuthorStat } from "../types";

function fmtDate(s: string) {
  return s.slice(0, 10);
}

export function AuthorTable({ authors }: { authors: AuthorStat[] }) {
  const rows = [...authors].sort((a, b) => b.commits - a.commits);
  if (rows.length === 0) {
    return <div className="empty">没有作者数据</div>;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>作者</th>
            <th>邮箱</th>
            <th>提交数</th>
            <th>新增行</th>
            <th>删除行</th>
            <th>首次提交</th>
            <th>最近提交</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.email}>
              <td>{a.name}</td>
              <td>{a.email}</td>
              <td>{a.commits}</td>
              <td>{a.insertions}</td>
              <td>{a.deletions}</td>
              <td>{fmtDate(a.firstCommit)}</td>
              <td>{fmtDate(a.lastCommit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
