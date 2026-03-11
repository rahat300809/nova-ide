import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import axios from "axios";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(cors());

// Judge0 CE — free, no key needed for ce.judge0.com (public instance)
const JUDGE0_URL = "https://ce.judge0.com";

// Language IDs from Judge0
const LANGUAGE_MAP: Record<string, number> = {
  python:     71,  // Python 3.8.1
  py:         71,
  c:          50,  // C (GCC 9.2.0)
  cpp:        54,  // C++ (GCC 9.2.0)
  "c++":      54,
  javascript: 93,  // JavaScript (Node.js 18.15.0)
  js:         93,
};

// --- Judge0 Code Execution Endpoint ---
app.post("/api/execute", async (req: any, res: any) => {
  const { language, code, stdin } = req.body;

  if (!language || !code) {
    return res.status(400).json({ success: false, error: "language and code are required." });
  }

  const languageId = LANGUAGE_MAP[language.toLowerCase()];
  if (!languageId) {
    return res.status(400).json({ success: false, error: `Unsupported language: ${language}` });
  }

  try {
    // Step 1: Submit the code
    const submitRes = await axios.post(
      `${JUDGE0_URL}/submissions?base64_encoded=false&wait=false`,
      {
        language_id: languageId,
        source_code: code,
        stdin: stdin || "",
        cpu_time_limit: 5,
        wall_time_limit: 10,
      },
      { timeout: 15000 }
    );

    const token = submitRes.data.token;
    if (!token) {
      return res.status(500).json({ success: false, error: "Failed to submit code to execution service." });
    }

    // Step 2: Poll for result (max ~10 seconds)
    let result: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const pollRes = await axios.get(
        `${JUDGE0_URL}/submissions/${token}?base64_encoded=false`,
        { timeout: 10000 }
      );
      result = pollRes.data;
      // Status IDs 1 and 2 mean "In Queue" / "Processing"
      if (result.status?.id > 2) break;
    }

    if (!result) {
      return res.status(500).json({ success: false, error: "Execution timed out." });
    }

    const statusId = result.status?.id;
    const stdout = result.stdout || "";
    const stderr = result.stderr || "";
    const compileOutput = result.compile_output || "";

    // Status IDs: 3=Accepted, 4=WrongAnswer, 5=TLE, 6=CompileError, etc.
    if (statusId === 6) {
      // Compile Error
      return res.json({ success: false, output: "", error: compileOutput, type: "compile_error" });
    }

    if (statusId === 5) {
      return res.json({ success: false, output: stdout, error: "Time Limit Exceeded (5 seconds)", type: "tle" });
    }

    const isSuccess = statusId === 3;
    return res.json({
      success: isSuccess,
      output: stdout,
      error: stderr || (isSuccess ? "" : (result.status?.description || "Runtime Error")),
      type: isSuccess ? "success" : "runtime_error",
      exitCode: result.exit_code,
    });
  } catch (err: any) {
    console.error("Judge0 error:", err?.response?.data || err.message);
    return res.status(500).json({
      success: false,
      output: "",
      error: "Execution service unavailable. Please try again.",
      type: "server_error",
    });
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
    app.get("*", (req: any, res: any) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, () => {
    console.log(`Nova IDE running on http://localhost:${PORT}`);
  });
}

startServer();
