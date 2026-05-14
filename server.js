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
   DEMO ACCOUNTS
========================= */

const demoAccounts = [
  { username: "student1", password: "student123", role: "student", studentId: 1 },
  { username: "nurse", password: "nurse123", role: "nurse" },
  { username: "admin", password: "admin123", role: "admin" },
];

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

/* =========================
   DB HELPERS
========================= */

async function query(sql, params) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function command(sql, params) {
  const [result] = await pool.execute(sql, params);
  return result;
}

/* =========================
   INIT DATABASE
========================= */

async function ensureDatabaseSchema() {
  await command(`
    CREATE TABLE IF NOT EXISTS students (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_number VARCHAR(50) UNIQUE,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      date_of_birth DATE,
      sex VARCHAR(20),
      grade_level VARCHAR(50),
      section VARCHAR(50),
      guardian_name VARCHAR(150),
      guardian_contact VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await command(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) UNIQUE,
      password VARCHAR(255),
      role VARCHAR(20),
      student_id INT NULL
    )
  `);

  await command(`
    CREATE TABLE IF NOT EXISTS health_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT UNIQUE,
      blood_type VARCHAR(10),
      allergies TEXT,
      chronic_conditions TEXT,
      medications TEXT,
      height_cm DECIMAL(5,2),
      weight_kg DECIMAL(5,2),
      bmi DECIMAL(5,2),
      bmi_category VARCHAR(50),
      immunization_status TEXT
    )
  `);

  await command(`
    CREATE TABLE IF NOT EXISTS clinic_visits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT,
      visit_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      reason VARCHAR(255),
      symptoms TEXT,
      treatment TEXT,
      disposition VARCHAR(100),
      recorded_by VARCHAR(100)
    )
  `);

  await command(`
    CREATE TABLE IF NOT EXISTS medical_notes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT,
      note TEXT,
      created_by VARCHAR(100)
    )
  `);
}

/* =========================
   SEED DATA
========================= */

async function seedDemoData() {
  await command(`
    INSERT INTO students (id, student_number, first_name, last_name, sex, grade_level, section)
    VALUES (1, 'STU-001', 'Demo', 'Student', 'Female', 'Grade 8', 'Rose')
    ON DUPLICATE KEY UPDATE first_name=VALUES(first_name)
  `);

  await command(`
    INSERT INTO users (username, password, role, student_id)
    VALUES
      ('student1','student123','student',1),
      ('nurse','nurse123','nurse',NULL),
      ('admin','admin123','admin',NULL)
    ON DUPLICATE KEY UPDATE password=VALUES(password)
  `);

  const bmi = calculateBmi(150, 45);
  const category = bmiCategory(bmi);

  await command(`
    INSERT INTO health_records
    (student_id, blood_type, allergies, chronic_conditions, medications, height_cm, weight_kg, bmi, bmi_category, immunization_status)
    VALUES
    (1,'O+','None','None','None',150,45,${bmi},'${category}','Complete')
    ON DUPLICATE KEY UPDATE bmi=VALUES(bmi), bmi_category=VALUES(bmi_category)
  `);
}

/* =========================
   AUTH
========================= */

app.post("/auth/login", (req, res) => {
  const { username, password, role } = req.body;

  const user = demoAccounts.find(
    (u) => u.username === username && u.password === password && u.role === role
  );

  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const token = crypto.randomBytes(32).toString("hex");

  sessionStore.set(token, {
    user,
    expires: Date.now() + 8 * 60 * 60 * 1000,
  });

  res.json({ token, user });
});

/* =========================
   AUTH MIDDLEWARE
========================= */

function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
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
   STUDENTS API
========================= */

app.get("/students", async (req, res) => {
  const data = await query("SELECT * FROM students");
  res.json(data);
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
    `INSERT INTO health_records (student_id, height_cm, weight_kg, bmi, bmi_category)
     VALUES (?,?,?,?,?)`,
    [result.insertId, heightCm, weightKg, bmi, category]
  );

  res.json({ message: "Student added", id: result.insertId });
});

/* =========================
   HEALTH CHECK
========================= */

app.get("/health", async (req, res) => {
  const [r] = await pool.query("SELECT NOW() AS time");
  res.json({ ok: true, time: r[0].time });
});

/* =========================
   START SERVER
========================= */

ensureDatabaseSchema()
  .then(seedDemoData)
  .then(() => {
    app.listen(port, () => {
      console.log("Server running on port", port);
    });
  })
  .catch((err) => {
    console.error("DB Setup Failed:", err.message);
    process.exit(1);
  });