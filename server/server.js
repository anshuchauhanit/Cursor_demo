// server.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { execSync } from "child_process";


dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(bodyParser.json({ limit: "5mb" }));
app.use(cors());

// Ensure the 'static' folder exists
const staticPath = path.join(process.cwd(), "static");
if (!fs.existsSync(staticPath)) fs.mkdirSync(staticPath);

// Serve static AI-generated files safely
app.use("/static", express.static(staticPath));

// Serve React frontend build safely
//const reactBuildPath = path.join(process.cwd(), "client", "dist");
const reactBuildPath = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "client", "dist");
if (fs.existsSync(reactBuildPath)) {
  app.use(express.static(reactBuildPath));
} else {
  console.warn("React build folder not found. Run 'npm run build' in client/");
}

// Initialize Gemini client
//const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
let genAI;
try {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} catch (err) {
  console.error("Error initializing Gemini client:", err);
}
//console.log("Using Gemini key (first 8 chars):", genAI.slice(0, 8));
console.log("Using Gemini key (first 8 chars):", process.env.GEMINI_API_KEY?.slice(0, 8));


async function testGemini() {
  try {
    const testModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await testModel.generateContent("ping");
    console.log("✅ Gemini works:", result.response.text());
  } catch (err) {
    console.error("❌ Gemini test failed:", err.message, err.response?.data);
  }
}
//testGemini();

async function getAIResponse(prompt, model = "gemini-2.5-flash") {
  console.log("👉 Sending request to Gemini...");
  const modelClient = genAI.getGenerativeModel({ model });

  try {
    const result = await modelClient.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `
Create 4 different possible implementations for this UI request: ${prompt}.
For each option, return FULL HTML code with CSS and JS inside <html>...</html>.
Separate options with <<<OPTION>>> marker.
Return only code, no explanations.
              `,
            },
          ],
        },
      ],
    });

    console.log("✅ Gemini responded successfully");
    return result.response.text().trim();
  } catch (err) {
    console.error("❌ Gemini API request failed");

    // If it's an API response error
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Status Text:", err.response.statusText);
      try {
        const errData = await err.response.json();
        console.error("Error details:", errData);
      } catch (parseErr) {
        console.error("Could not parse error JSON:", parseErr);
      }
    } else if (err.message) {
      console.error("Message:", err.message);
    } else {
      console.error("Error object:", err);
    }

    throw new Error("Gemini API request failed. Check logs for details.");
  }
}


// API: Generate UI options
app.post("/generate", async (req, res) => {
  try {
    const { prompt } = req.body;
    console.log(prompt);
    if (!prompt) return res.status(400).json({ error: "Prompt required" });

    const result = await getAIResponse(prompt);
    const rawOptions = result.split("<<<OPTION>>>");
    const options = rawOptions.map(opt => opt.trim()).filter(Boolean).slice(0, 4);

    const generatedFiles = [];
    options.forEach((opt, i) => {
	console.log(opt);console.log("\n **** \n");
      let cleaned = opt.startsWith("```") ? opt.replace(/```(html)?/gi, "").trim() : opt;
      const filename = `generated${i + 1}.html`;
      fs.writeFileSync(path.join(staticPath, filename), cleaned, "utf-8");
      generatedFiles.push(`/static/${filename}`);
    });

    res.json({ files: generatedFiles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI generation failed" });
  }
});

app.post("/confirm", async (req, res) => {
  try {
    const { file, screenName } = req.body;
    if (!file || !screenName) {
      return res.status(400).json({ error: "File and screenName required" });
    }

    // 1. Ensure file exists
    const filePath = path.join(staticPath, path.basename(file));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    // 2. Create screen folder
    const screenDir = path.join(process.cwd(), "client", "src", screenName);
    if (!fs.existsSync(screenDir)) fs.mkdirSync(screenDir, { recursive: true });

    // 3. Save HTML
    const code = fs.readFileSync(filePath, "utf-8");
    fs.writeFileSync(path.join(screenDir, "index.html"), code, "utf-8");

    // 4. Git push
    const repoUrl = `https://${process.env.GITHUB_PAT}@github.com/${process.env.GITHUB_USERNAME}/${process.env.GITHUB_REPO}.git`;

    try {
      execSync(`git add client/src/${screenName}`);
      execSync(`git commit -m "Add new screen: ${screenName}" || echo "No changes to commit"`);
      execSync(`git push ${repoUrl} HEAD:main`);
    } catch (gitErr) {
      console.error("❌ Git operation failed:", gitErr.message);
      return res.status(500).json({ error: "Git push failed" });
    }

    res.json({ success: true, screenName });
  } catch (err) {
    console.error("❌ Confirm option failed:", err);
    res.status(500).json({ error: "Failed to confirm option" });
  }
});



// API: Select one generated file
app.post("/select", (req, res) => {
  try {
    const { file } = req.body;
    if (!file) return res.status(400).json({ error: "File required" });

    const filePath = path.join(staticPath, path.basename(file));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });

    const code = fs.readFileSync(filePath, "utf-8");
    fs.writeFileSync(path.join(staticPath, "generated.html"), code, "utf-8");

    res.json({ code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Selection failed" });
  }
});

// Catch-all: Serve React frontend for any other route
app.get("*", (req, res) => {
  const indexPath = path.join(reactBuildPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("React build not found. Run 'npm run build' in client/");
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
