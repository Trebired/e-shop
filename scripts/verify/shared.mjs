import net from "node:net";
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

export { call, listen, resetDatabase, smtpSink };
