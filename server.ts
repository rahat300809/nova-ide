import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import fs from "fs";
import { promisify } from "util";
import cors from "cors";

const execPromise = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(cors());

// --- Code Execution Sandbox API ---
app.post("/api/run", async (req: any, res: any) => {
  const { code, language, fileName } = req.body;
  
  // Create a unique temporary directory for this execution
  const executionId = Math.random().toString(36).substring(2, 15);
  const tempDir = path.join(__dirname, "temp", executionId);
  
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const safeFileName = fileName ? fileName.replace(/[^a-zA-Z0-9.\-_]/g, '') : `temp_code.${language}`;
  const filePath = path.join(tempDir, safeFileName);
  fs.writeFileSync(filePath, code);

  let command = "";
  
  try {
    if (language === "python" || language === "py") {
      command = `python3 -c "${code.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`; // execute carefully or just use python filePath
      command = `python3 ${filePath}`; 
    } else if (language === "c") {
      const outPath = path.join(tempDir, "output.exe");
      command = `gcc ${filePath} -o ${outPath} && ${outPath}`;
    } else if (language === "cpp" || language === "c++") {
      const outPath = path.join(tempDir, "output.exe");
      command = `g++ ${filePath} -o ${outPath} && ${outPath}`;
    } else if (language === "javascript" || language === "js") {
      command = `node ${filePath}`;
    } else {
      return res.status(400).json({ error: `Unsupported language: ${language}` });
    }

    // Limit execution time to 5 seconds to prevent infinite loops / abuse
    const { stdout, stderr } = await execPromise(command, { timeout: 5000, maxBuffer: 1024 * 1024 });
    res.json({ stdout, stderr });
  } catch (error: any) {
    if (error.killed && error.signal === 'SIGTERM') {
      res.json({ stdout: "", stderr: "Execution timed out (Limit: 5 seconds). Possible infinite loop." });
    } else {
      res.json({ stdout: error.stdout || "", stderr: error.stderr || error.message });
    }
  } finally {
    // Cleanup temporary execution directory
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      console.error("Cleanup error:", cleanupError);
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

  app.listen(PORT, () => {
    console.log(`Nova IDE Sandbox & Server running on http://localhost:${PORT}`);
  });
}

startServer();
