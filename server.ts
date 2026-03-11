import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { spawn } from "child_process";
import pty from "node-pty";
import fs from "fs";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_WIN = os.platform() === "win32";
const MINGW = "C:\\mingw64\\bin";
const IS_PROD = process.env.NODE_ENV === "production";

// ── Express app ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

const mainHttpServer = createServer(app);

function getEnv() {
  if (IS_WIN) return { ...process.env, PATH: `${MINGW};${process.env.PATH}` } as Record<string, string>;
  return { ...process.env } as Record<string, string>;
}

function compile(cmd: string, args: string[]): Promise<{ error?: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env: getEnv() });
    let stderr = "";
    p.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    p.on("exit", (code) => {
      if (code !== 0) resolve({ error: stderr || "Compilation failed." });
      else resolve({});
    });
    p.on("error", (err) => resolve({ error: err.message }));
  });
}

// ── Socket.IO setup ──────────────────────────────────────────────────────────
function setupSocketIO(httpServer: ReturnType<typeof createServer>) {
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    let proc: pty.IPty | null = null;
    let tempDir: string | null = null;

    const cleanup = () => {
      if (proc) { try { proc.kill(); } catch (_) {} proc = null; }
      if (tempDir) { try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {} tempDir = null; }
    };

    socket.on("execute", async ({ code, language }: any) => {
      cleanup();
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-"));
      const lang = (language || "").toLowerCase();

      try {
        let runCmd: string;
        let runArgs: string[];

        if (lang === "python" || lang === "py") {
          const src = path.join(tempDir, "main.py");
          fs.writeFileSync(src, code);
          runCmd = IS_WIN ? "python" : "python3";
          runArgs = ["-u", src];

        } else if (lang === "javascript" || lang === "js") {
          const src = path.join(tempDir, "main.js");
          fs.writeFileSync(src, code);
          runCmd = "node";
          runArgs = [src];

        } else if (lang === "c") {
          const src = path.join(tempDir, "main.c");
          const out = path.join(tempDir, IS_WIN ? "prog.exe" : "prog");
          fs.writeFileSync(src, code);
          socket.emit("output", "\x1b[90mCompiling…\x1b[0m\r\n");
          const cc = IS_WIN ? path.join(MINGW, "gcc") : "gcc";
          const r = await compile(cc, [src, "-o", out, "-lm"]);
          if (r.error) {
            socket.emit("output", "\x1b[31m" + r.error.replace(/\n/g, "\r\n") + "\x1b[0m\r\n");
            socket.emit("execution_finished", { exitCode: 1 });
            return;
          }
          runCmd = out; runArgs = [];

        } else if (lang === "cpp" || lang === "c++") {
          const src = path.join(tempDir, "main.cpp");
          const out = path.join(tempDir, IS_WIN ? "prog.exe" : "prog");
          fs.writeFileSync(src, code);
          socket.emit("output", "\x1b[90mCompiling…\x1b[0m\r\n");
          const cxx = IS_WIN ? path.join(MINGW, "g++") : "g++";
          const r = await compile(cxx, [src, "-o", out, "-lm"]);
          if (r.error) {
            socket.emit("output", "\x1b[31m" + r.error.replace(/\n/g, "\r\n") + "\x1b[0m\r\n");
            socket.emit("execution_finished", { exitCode: 1 });
            return;
          }
          runCmd = out; runArgs = [];

        } else {
          socket.emit("output", `\x1b[31mUnsupported: ${language}\x1b[0m\r\n`);
          socket.emit("execution_finished", { exitCode: 1 });
          return;
        }

        // Spawn via node-pty so the process gets a real PTY.
        // On Windows: spawn the exe directly (no cmd.exe wrapper to avoid quoting issues).
        // On Linux: use /bin/sh -c so PATH is resolved correctly.
        let ptyFile: string;
        let ptyArgs: string[];

        if (IS_WIN) {
          ptyFile = runCmd;
          ptyArgs = runArgs;
        } else {
          ptyFile = "/bin/sh";
          const fullCmd = [runCmd, ...runArgs.map(a => `"${a}"`)].join(" ");
          ptyArgs = ["-c", fullCmd];
        }

        proc = pty.spawn(ptyFile, ptyArgs, {
          name: "xterm-256color",
          cols: 220,
          rows: 50,
          cwd: tempDir,
          env: getEnv(),
        });

        proc.onData((data: string) => {
          socket.emit("output", data);
        });

        proc.onExit(({ exitCode }: { exitCode: number }) => {
          socket.emit("output", `\r\n\x1b[90m──────────────────────────────\r\nProcess exited with code ${exitCode ?? 0}\x1b[0m\r\n`);
          socket.emit("execution_finished", { exitCode });
          proc = null;
          cleanup();
        });

        // 5-minute safety kill
        setTimeout(() => {
          if (proc) {
            socket.emit("output", "\r\n\x1b[31mTimeout: killed after 5 min.\x1b[0m\r\n");
            socket.emit("execution_finished", { exitCode: -1 });
            cleanup();
          }
        }, 300_000);

      } catch (e: any) {
        socket.emit("output", `\x1b[31mError: ${e.message}\x1b[0m\r\n`);
        socket.emit("execution_finished", { exitCode: 1 });
        cleanup();
      }
    });

    // Forward keystrokes to PTY stdin
    socket.on("stdin", (data: string) => {
      if (proc) proc.write(data);
    });

    // Resize PTY columns/rows when terminal resizes
    socket.on("resize", ({ cols, rows }: { cols: number; rows: number }) => {
      if (proc) proc.resize(cols, rows);
    });

    socket.on("kill", () => { if (proc) proc.kill("SIGINT"); });
    socket.on("disconnect", cleanup);
  });
}

// ── Start server(s) ──────────────────────────────────────────────────────────
async function startServer() {
  const MAIN_PORT = process.env.PORT || 3000;
  const IO_PORT = 3001; // Only used in dev

  if (!IS_PROD) {
    // DEV: Socket.IO on its own port to avoid Vite middleware interference
    const ioHttpServer = createServer();
    setupSocketIO(ioHttpServer);
    ioHttpServer.listen(IO_PORT, () => {
      console.log(`Socket.IO server on http://localhost:${IO_PORT}`);
    });

    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // PROD: everything on the same port (Render/cloud)
    setupSocketIO(mainHttpServer);

    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (_req: any, res: any) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  mainHttpServer.listen(MAIN_PORT, () => {
    console.log(`Nova IDE running on http://localhost:${MAIN_PORT}`);
  });
}

startServer();
