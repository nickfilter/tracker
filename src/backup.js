// 备份数据序列化：JSON / CSV(ZIP 内多文件) / SQL(可重放 INSERT)
// 只做纯字符串处理，不依赖数据库。

// CSV 单元格转义：双引号翻倍；含逗号/引号/换行的值整体加引号
function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = (v instanceof Date) ? v.toISOString() : String(v);
  if (v === true) s = 'true';
  else if (v === false) s = 'false';
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// 二维数组 → CSV 文本（首行为表头），带 UTF-8 BOM 方便 Excel 直接打开不乱码
function toCsv(rows, columns) {
  const cols = columns || (rows[0] ? Object.keys(rows[0]) : []);
  const lines = [cols.map(csvCell).join(',')];
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(','));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

// SQL 字面量
function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return "'" + v.toISOString() + "'";
  const s = String(v);
  // 纯整数字符串按数字输出（BIGSERIAL / SMALLINT 等列更自然）；
  // 注意排除超长数字串，避免超出 JS 安全整数范围导致精度丢失
  if (/^-?\d{1,15}$/.test(s)) return s;
  // NUMERIC 等带小数点的数值串
  if (/^-?\d+\.\d{1,6}$/.test(s) && s.length <= 20) return s;
  return "'" + s.replace(/'/g, "''") + "'";
}
function sqlIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

/**
 * 生成可重放的 SQL 备份。
 * @param {object} payload exportAll() 的返回值
 * @param {object} opts { schema: 'public' }
 */
function toSql(payload, opts = {}) {
  const schema = opts.schema || 'public';
  const out = [];
  out.push('-- ClickDealer 联盟归因系统 · 数据备份');
  out.push('-- 导出时间: ' + payload.meta.exported_at);
  out.push('-- 密钥脱敏: ' + (payload.meta.secrets_masked ? '是（恢复后需重新配置后台密钥）' : '否'));
  out.push('-- 用法: psql "你的DATABASE_URL" -f backup.sql');
  out.push('-- 注意: 脚本会先清空同名表再插入，请勿在生产库直接执行！');
  out.push('');

  const tables = payload.data || {};
  for (const t of Object.keys(tables)) {
    const rows = tables[t] || [];
    out.push(`-- ---------- ${t}（${rows.length} 行） ----------`);
    out.push(`TRUNCATE TABLE ${schema}.${sqlIdent(t)} RESTART IDENTITY CASCADE;`);
    if (!rows.length) { out.push(''); continue; }

    const cols = Object.keys(rows[0]);
    const colList = cols.map(sqlIdent).join(', ');
    // 每行一条 INSERT，超过 500 行分批加注释便于定位
    for (let i = 0; i < rows.length; i++) {
      const vals = cols.map((c) => sqlLiteral(rows[i][c])).join(', ');
      out.push(`INSERT INTO ${schema}.${sqlIdent(t)} (${colList}) VALUES (${vals});`);
    }
    // 只有带自增 id 的表才需要推进序列（settings 主键是 key，无序列）
    if (cols.includes('id') && t !== 'settings') {
      out.push(`SELECT setval(pg_get_serial_sequence('${schema}."${t}"', 'id'), `
        + `COALESCE((SELECT MAX(id) FROM ${schema}."${t}"), 1));`);
    }
    out.push('');
  }
  out.push('-- 备份结束');
  out.push('');
  return out.join('\n');
}

module.exports = { toCsv, toSql, csvCell, sqlLiteral };
