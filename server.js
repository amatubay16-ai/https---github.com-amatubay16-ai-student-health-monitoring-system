require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

/* =========================
   DATABASE CONFIG
========================= */

function databaseConfig() {
  const url = process.env.DATABASE_URL
    ? new URL(process.env.DATABASE_URL)
    : null;

  return {
    host: url?.hostname || process.env.DB_HOST || "localhost",
    port: Number(url?.port || process.env.DB_PORT || 3306),
    user: url ? decodeURIComponent(url.username) : process.env.DB_USER || "root",
    password: url ? decodeURIComponent(url.password) : process.env.DB_PASSWORD || "",
    database:
      (url?.pathname
        ? decodeURIComponent(url.pathname.replace("/", ""))
        : process.env.DB_NAME) || "student_health_monitoring",
  };
}

const dbConfig = databaseConfig();

/* =========================
   MIDDLEWARE
========================= */

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   MYSQL POOL
========================= */

const pool = mysql.createPool({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  waitForConnections: true,
  connectionLimit: 10,
});

/* =========================
   SESSION STORE
========================= */

const sessionStore = new Map();

/* =========================
   HELPERS
========================= */

function calculateBmi(h, w) {
  const height = Number(h);
  const weight = Number(w);
  if (!height || !weight) return null;
  return Number((weight / ((height / 100) ** 2)).toFixed(2));
}

function bmiCategory(bmi) {
  if (bmi === null) return null;
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function command(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

/* =========================
   AUTH ACCOUNTS (MATCH DB)
========================= */

const demoAccounts = [
  { username: "student1@gmail.com", password: "student123", role: "student", studentId: 1 },
  { username: "nurse@gmail.com", password: "nurse123", role: "nurse" },
  { username: "admin@gmail.com", password: "admin123", role: "admin" },
];

/* =========================
   AUTH LOGIN
========================= */

app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;

  const user = demoAccounts.find(
    (u) => u.username === username && u.password === password
  );

  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = crypto.randomBytes(32).toString("hex");

  sessionStore.set(token, {
    user,
    expires: Date.now() + 8 * 60 * 60 * 1000,
  });

  res.json({
    token,
    user,
  });
});

/* =========================
   AUTH MIDDLEWARE
========================= */

function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  const session = sessionStore.get(token);

  if (!session || session.expires < Date.now()) {
    return res.status(401).json({ message: "Session expired" });
  }

  req.user = session.user;
  req.token = token;
  next();
}

app.use(auth);

/* =========================
   AUTH ME + LOGOUT
========================= */

app.get("/auth/me", (req, res) => {
  res.json(req.user);
});

app.post("/auth/logout", (req, res) => {
  sessionStore.delete(req.token);
  res.json({ message: "Logged out successfully" });
});

/* =========================
   STUDENTS API
========================= */

app.get("/students", async (req, res) => {
  const data = await query("SELECT * FROM students");
  res.json(data);
});

app.get("/students/:id", async (req, res) => {
  const data = await query("SELECT * FROM students WHERE id=?", [req.params.id]);
  res.json(data[0] || {});
});

app.post("/students", async (req, res) => {
  const { studentNumber, firstName, lastName, heightCm, weightKg } = req.body;

  const result = await command(
    `INSERT INTO students (student_number, first_name, last_name)
     VALUES (?,?,?)`,
    [studentNumber, firstName, lastName]
  );

  const bmi = calculateBmi(heightCm, weightKg);
  const category = bmiCategory(bmi);

  await command(
    `INSERT INTO health_records 
    (student_id, height_cm, weight_kg, bmi, bmi_category)
    VALUES (?,?,?,?,?)`,
    [result.insertId, heightCm, weightKg, bmi, category]
  );

  res.json({
    message: "Student created successfully",
    studentId: result.insertId,
    bmi,
    category,
  });
});

/* =========================
   HEALTH CHECK
========================= */

app.get("/health", async (req, res) => {
  const [r] = await pool.query("SELECT NOW() AS time");
  res.json({ status: "ok", time: r[0].time });
});

/* =========================
   START SERVER
========================= */

(async () => {
  try {
    console.log("Connecting to database...");
    console.log("DB:", dbConfig.database);

    app.listen(port, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${port}`);
    });
  } catch (err) {
    console.error("DB Setup Failed:", err.message);
    process.exit(1);
  }
})();