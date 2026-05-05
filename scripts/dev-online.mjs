import { spawn } from "node:child_process";

function start(name, args) {
  const child = spawn(name, args, {
    stdio: "inherit",
    shell: true,
  });
  return child;
}

const server = start("npm", ["run", "dev:server"]);
const client = start("npm", ["run", "dev:client"]);

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [server, client]) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  process.exit(code);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}

server.on("exit", (code) => {
  shutdown(code ?? 0);
});

client.on("exit", (code) => {
  shutdown(code ?? 0);
});

