import http from "node:http";

function listen(handler) {
  return new Promise((resolve) => {
      const server = http.createServer(handler);
      server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function resetDatabase(pool) {
  const tables = await pool.query("select tablename from pg_tables where schemaname = 'public' and tablename like 'eshop_%'");
  if (tables.rows.length) await pool.query(`drop table ${tables.rows.map((row) => row.tablename).join(", ")} cascade`);
}

async function call(url, method, pathName, body, cookie = "") {
  const response = await fetch(`${url}${pathName}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
      method,
  });
  return { cookie: (response.headers.get("set-cookie") ?? "").split(";")[0] || cookie, json: await response.json(), status: response.status };
}

export { call, listen, resetDatabase };
