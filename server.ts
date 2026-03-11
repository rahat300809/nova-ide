import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import fs from "fs";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// --- WebSocket Code Execution Sandbox ---
io.on("connection", (socket) => {
  let currentProcess: any = null;
  let tempDir: string | null = null;

  socket.on("execute", async (data) => {
    const { code, language, fileName } = data;
    
    // Cleanup any existing process on this socket
    if (currentProcess) {
       currentProcess.kill();
    }

    // Create a unique temporary directory for this execution
    const executionId = Math.random().toString(36).substring(2, 15);
    tempDir = path.join(__dirname, "temp", executionId);
    
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const safeFileName = fileName ? fileName.replace(/[^a-zA-Z0-9.\-_]/g, '') : `temp_code.${language}`;
    const filePath = path.join(tempDir, safeFileName);
    fs.writeFileSync(filePath, code);

    let command = "";
    let args: string[] = [];

    // Inject C:\mingw64\bin into PATH for Windows local testing
    const execEnv = { ...process.env };
    if (process.platform === "win32") {
      execEnv.PATH = `C:\\mingw64\\bin;${execEnv.PATH || ""}`;
    }

    // Pre-compilation step for C/C++
    if (language === "c" || language === "cpp" || language === "c++") {
      const outPath = path.join(tempDir, "output.exe");
      const compileCmd = language === "c" ? "gcc" : "g++";
      
      socket.emit("output", `Compiling ${safeFileName}...\r\n`);
      
      try {
        const compileProcess = spawn(compileCmd, [filePath, "-o", outPath], { env: execEnv });
        await new Promise((resolve, reject) => {
          compileProcess.on('close', (code) => {
            if (code === 0) resolve(true);
            else reject(new Error(`Compilation failed with exit code ${code}`));
          });
          compileProcess.stderr.on('data', (data) => socket.emit("output", `\x1b[31m${data.toString()}\x1b[0m`));
        });
        
        command = outPath;
        // On Linux/Render, use stdbuf to disable compiled bin buffering so interactive prompts show up immediately.
        if (process.platform === 'linux') {
          command = 'stdbuf';
          args = ['-i0', '-o0', '-e0', outPath];
        } else {
          command = outPath;
        }
      } catch (err: any) {
        socket.emit("output", `\x1b[31mCompilation Error: ${err.message}\x1b[0m\r\n`);
        socket.emit("execution_finished");
        return;
      }
    } else if (language === "python" || language === "py") {
      command = "python3";
      args = ["-u", filePath]; // -u prevents python from buffering stdout
    } else if (language === "javascript" || language === "js") {
      command = "node";
      args = [filePath];
    } else {
      socket.emit("output", `Unsupported language: ${language}\r\n`);
      socket.emit("execution_finished");
      return;
    }

    try {
      currentProcess = spawn(command, args, { cwd: tempDir, env: execEnv });

      currentProcess.stdout.on("data", (data: Buffer) => {
        // Convert \n to \r\n for xterm.js
        socket.emit("output", data.toString().replace(/\n/g, '\r\n'));
      });

      currentProcess.stderr.on("data", (data: Buffer) => {
        socket.emit("output", `\x1b[31m${data.toString().replace(/\n/g, '\r\n')}\x1b[0m`);
      });

      currentProcess.on("close", (code: number) => {
        socket.emit("output", `\r\n\x1b[33m[Process exited with code ${code}]\x1b[0m\r\n`);
        socket.emit("execution_finished");
        currentProcess = null;
        cleanup();
      });

      // 5 minute absolute hard timeout
      setTimeout(() => {
        if (currentProcess) {
          socket.emit("output", "\r\n\x1b[31m[Execution Timeout (5 minutes)]\x1b[0m\r\n");
          currentProcess.kill();
        }
      }, 5 * 60 * 1000);

    } catch (err: any) {
       socket.emit("output", `\x1b[31mFailed to start process: ${err.message}\x1b[0m\r\n`);
       socket.emit("execution_finished");
       cleanup();
    }
  });

  socket.on("input", (data: string) => {
    if (currentProcess && currentProcess.stdin) {
      currentProcess.stdin.write(data);
    }
  });

  socket.on("disconnect", () => {
    if (currentProcess) currentProcess.kill();
    cleanup();
  });

  function cleanup() {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.error("Cleanup error:", e);
      }
    }
  }
});

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
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, () => {
    console.log(`Nova IDE Sandbox & Server running on http://localhost:${PORT}`);
  });
}

startServer();
