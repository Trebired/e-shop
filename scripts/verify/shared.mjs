import net from "node:net";
import http from "node:http";
import { createStoreApplicationRuntime } from "@trebired/store";

function listen(handler) {
  return new Promise((resolve) => {
      const server = http.createServer(handler);
      server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

function openTestSql(databaseUrl) {
  return createStoreApplicationRuntime({ entities: {}, postgres: { databaseUrl } }).sql;
}

async function resetDatabase(sql) {
  await sql.admin(async(session) => {
      const tables = await session.many("select tablename from pg_tables where schemaname = 'public' and tablename like 'eshop_%'");
      if (tables.length) await session.exec(`drop table ${tables.map((row) => row.tablename).join(", ")} cascade`);
      const tracked = await session.one("select to_regclass('public.store_migrations')::text as name");
      if (tracked?.name) await session.exec("delete from store_migrations where starts_with(id, 'eshop:')");
  });
}

async function call(url, method, pathName, body, cookie = "") {
  const response = await fetch(`${url}${pathName}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
      method,
  });
  return { cookie: (response.headers.get("set-cookie") ?? "").split(";")[0] || cookie, json: await response.json(), status: response.status };
}

function smtpSink(messages) {
  return new Promise((resolve) => {
      const server = net.createServer((socket) => {
          let data = false;
          let buffer = "";
          socket.write("220 verify\r\n");
          socket.on("data", (chunk) => {
              buffer += chunk.toString("utf8");
              if (data) {
                if (!buffer.endsWith("\r\n.\r\n")) return;
                messages.push(buffer);
                buffer = "";
                data = false;
                return socket.write("250 queued\r\n");
              }
              const lines = buffer.split("\r\n");
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                const verb = line.slice(0, 4).toUpperCase();
                if (verb === "EHLO") socket.write("250-verify\r\n250 OK\r\n");
                else if (verb === "DATA") {
                  data = true;
                  socket.write("354 go\r\n");
                } else if (verb === "QUIT") socket.end("221 bye\r\n");
                else socket.write("250 OK\r\n");
              }
          });
      });
      server.listen(0, "127.0.0.1", () => resolve({ port: server.address().port, server }));
  });
}

export { call, listen, openTestSql, resetDatabase, smtpSink };
