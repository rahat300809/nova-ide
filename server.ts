import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const IS_WIN = os.platform() === "win32";
const MINGW = "C:\\mingw64\\bin";

function getEnv() {
  if (IS_WIN) {
    return { ...process.env, PATH: `${MINGW};${process.env.PATH}` };
  }
  return { ...process.env };
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

// ── Socket.IO: interactive code execution ────────────────────────────────────
io.on("connection", (socket) => {
  let proc: ReturnType<typeof spawn> | null = null;
  let tempDir: string | null = null;

  const cleanup = () => {
    if (proc) { try { proc.kill(); } catch (_) {} proc = null; }
    if (tempDir) { try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {} tempDir = null; }
  };

  socket.on("execute", async ({ code, language, fileName }: any) => {
    cleanup(); // kill any previous session

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
        const result = await compile(cc, [src, "-o", out, "-lm"]);
        if (result.error) {
          socket.emit("output", "\x1b[31m" + result.error.replace(/\n/g, "\r\n") + "\x1b[0m\r\n");
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
        const result = await compile(cxx, [src, "-o", out, "-lm"]);
        if (result.error) {
          socket.emit("output", "\x1b[31m" + result.error.replace(/\n/g, "\r\n") + "\x1b[0m\r\n");
          socket.emit("execution_finished", { exitCode: 1 });
          return;
        }
        runCmd = out; runArgs = [];

      } else {
        socket.emit("output", `\x1b[31mUnsupported language: ${language}\x1b[0m\r\n`);
        socket.emit("execution_finished", { exitCode: 1 });
        return;
      }

      proc = spawn(runCmd, runArgs, { env: getEnv(), cwd: tempDir });

      proc.stdout?.on("data", (d: Buffer) => {
        socket.emit("output", d.toString().replace(/\n/g, "\r\n"));
      });
      proc.stderr?.on("data", (d: Buffer) => {
        socket.emit("output", "\x1b[31m" + d.toString().replace(/\n/g, "\r\n") + "\x1b[0m");
      });
      proc.on("exit", (code) => {
        socket.emit("output", `\r\n\x1b[90m──────────────────────────────\r\nProcess exited with code ${code ?? 0}\x1b[0m\r\n`);
        socket.emit("execution_finished", { exitCode: code });
        proc = null;
        cleanup();
      });
      proc.on("error", (err) => {
        socket.emit("output", `\x1b[31mFailed to start: ${err.message}\x1b[0m\r\n`);
        socket.emit("execution_finished", { exitCode: 1 });
        proc = null;
        cleanup();
      });

      // 5-minute safety timeout
      setTimeout(() => {
        if (proc) {
          socket.emit("output", "\r\n\x1b[31mTimeout: process killed after 5 minutes.\x1b[0m\r\n");
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

  // Forward keystrokes from terminal directly to the process stdin
  socket.on("stdin", (data: string) => {
    if (proc?.stdin && !proc.stdin.destroyed) {
      proc.stdin.write(data);
    }
  });

  socket.on("kill", () => {
    if (proc) {
      proc.kill("SIGINT");
    }
  });

  socket.on("disconnect", cleanup);
});

// ── Express app ───────────────────────────────────────────────────────────────
async function startServer() {
  const PORT = process.env.PORT || 3000;

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (_req: any, res: any) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, () => {
    console.log(`Nova IDE running on http://localhost:${PORT}`);
  });
}

startServer();
