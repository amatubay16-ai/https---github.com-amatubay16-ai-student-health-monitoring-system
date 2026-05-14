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

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function requireRole(req, res, roles) {
  if (!roles.includes(req.user.role)) {
    res.status(403).json({ message: "You do not have permission to perform this action" });
    return false;
  }

  return true;
}

function toNull(value) {
  return value === undefined || value === "" ? null : value;
}

function studentPayload(body) {
  return {
    student_number: toNull(body.studentNumber),
    first_name: toNull(body.firstName),
    last_name: toNull(body.lastName),
    date_of_birth: toNull(body.dateOfBirth),
    sex: toNull(body.sex),
    grade_level: toNull(body.gradeLevel),
    section: toNull(body.section),
    guardian_name: toNull(body.guardianName),
    guardian_contact: toNull(body.guardianContact),
  };
}

function healthPayload(body) {
  const bmi = body.bmi || calculateBmi(body.heightCm, body.weightKg);

  return {
    blood_type: toNull(body.bloodType),
    allergies: toNull(body.allergies),
    chronic_conditions: toNull(body.chronicConditions),
    medications: toNull(body.medications),
    height_cm: toNull(body.heightCm),
    weight_kg: toNull(body.weightKg),
    bmi: toNull(bmi),
    immunization_status: toNull(body.immunizationStatus),
  };
}

function clinicVisitPayload(body) {
  return {
    student_id: toNull(body.studentId),
    visit_date: toNull(body.visitDate),
    reason: toNull(body.reason),
    symptoms: toNull(body.symptoms),
    treatment: toNull(body.treatment),
    disposition: toNull(body.disposition),
  };
}

function compactEntries(data) {
  return Object.entries(data).filter(([, value]) => value !== undefined);
}

async function ensureStudentLoginAccount(studentId, username) {
  const loginColumn = await getUsersLoginColumn();
  const existing = await query(`SELECT id FROM users WHERE student_id = ? LIMIT 1`, [studentId]);

  if (existing.length > 0 || !username) {
    return;
  }

  await command(
    `INSERT INTO users (${loginColumn}, password, role, student_id)
     VALUES (?, ?, 'student', ?)`,
    [username, username, studentId]
  );
}

let usersLoginColumn;

async function getUsersLoginColumn() {
  if (usersLoginColumn) return usersLoginColumn;

  const columns = await query("SHOW COLUMNS FROM users");
  const fields = columns.map((column) => column.Field);

  if (fields.includes("username")) {
    usersLoginColumn = "username";
  } else if (fields.includes("email")) {
    usersLoginColumn = "email";
  } else {
    throw new Error("Users table must have a username or email column");
  }

  return usersLoginColumn;
}

/* =========================
   AUTH LOGIN
========================= */

app.post("/auth/login", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const role = String(req.body.role || "").trim();

  if (!username || !password || !role) {
    return res.status(400).json({ message: "Username, password, and role are required" });
  }

  try {
    const loginColumn = await getUsersLoginColumn();
    const shortUsername = username.includes("@") ? username.split("@")[0] : username;
    const loginWhere =
      loginColumn === "email"
        ? "(email = ? OR SUBSTRING_INDEX(email, '@', 1) = ?)"
        : "(username = ? OR username = ?)";

    const users = await query(
      `SELECT id, ${loginColumn} AS username, role, student_id
       FROM users
       WHERE ${loginWhere}
         AND password = ?
         AND role = ?
       LIMIT 1`,
      [username, shortUsername, password, role]
    );

    const account = users[0];

    if (!account) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = {
      id: account.id,
      username: account.username,
      role: account.role,
      studentId: account.student_id,
    };

    const token = crypto.randomBytes(32).toString("hex");

    sessionStore.set(token, {
      user,
      expires: Date.now() + 8 * 60 * 60 * 1000,
    });

    res.json({
      token,
      user,
    });
  } catch (err) {
    console.error("Login failed:", err.message);
    res.status(500).json({ message: "Login is temporarily unavailable" });
  }
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
  res.json({ user: req.user });
});

app.post("/auth/logout", (req, res) => {
  sessionStore.delete(req.token);
  res.json({ message: "Logged out successfully" });
});

/* =========================
   STUDENTS API
========================= */

app.get("/students", asyncRoute(async (req, res) => {
  const data = await query("SELECT * FROM students");
  res.json(data);
}));

app.get("/students/:id", asyncRoute(async (req, res) => {
  const data = await query("SELECT * FROM students WHERE id=?", [req.params.id]);
  res.json(data[0] || {});
}));

app.get("/students/:id/account", asyncRoute(async (req, res) => {
  const studentId = Number(req.params.id);

  if (req.user.role === "student" && Number(req.user.studentId) !== studentId) {
    return res.status(403).json({ message: "Students can only view their own account" });
  }

  const [student] = await query("SELECT * FROM students WHERE id = ?", [studentId]);

  if (!student) {
    return res.status(404).json({ message: "Student not found" });
  }

  const [healthRecord] = await query("SELECT * FROM health_records WHERE student_id = ?", [studentId]);
  const clinicVisits = await query(
    "SELECT * FROM clinic_visits WHERE student_id = ? ORDER BY visit_date DESC, id DESC",
    [studentId]
  );
  const medicalNotes = await query(
    "SELECT * FROM medical_notes WHERE student_id = ? ORDER BY created_at DESC, id DESC",
    [studentId]
  );

  res.json({
    student,
    healthRecord: healthRecord || null,
    clinicVisits,
    medicalNotes,
  });
}));

app.post("/students", asyncRoute(async (req, res) => {
  if (!requireRole(req, res, ["nurse", "admin"])) return;

  const student = studentPayload(req.body);

  if (!student.student_number || !student.first_name || !student.last_name) {
    return res.status(400).json({ message: "Student number, first name, and last name are required" });
  }

  const result = await command(
    `INSERT INTO students
     (student_number, first_name, last_name, date_of_birth, sex, grade_level, section, guardian_name, guardian_contact)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      student.student_number,
      student.first_name,
      student.last_name,
      student.date_of_birth,
      student.sex,
      student.grade_level,
      student.section,
      student.guardian_name,
      student.guardian_contact,
    ]
  );

  const health = healthPayload(req.body);
  const hasHealthData = Object.values(health).some((value) => value !== null);

  if (hasHealthData) {
    await command(
      `INSERT INTO health_records
       (student_id, blood_type, allergies, chronic_conditions, medications, height_cm, weight_kg, bmi, immunization_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        result.insertId,
        health.blood_type,
        health.allergies,
        health.chronic_conditions,
        health.medications,
        health.height_cm,
        health.weight_kg,
        health.bmi,
        health.immunization_status,
      ]
    );
  }

  await ensureStudentLoginAccount(result.insertId, student.student_number);

  res.json({
    message: "Student created successfully",
    studentId: result.insertId,
    accountUsername: student.student_number,
  });
}));

app.put("/students/:id", asyncRoute(async (req, res) => {
  if (!requireRole(req, res, ["admin"])) return;

  const student = studentPayload(req.body);
  const entries = compactEntries(student);

  if (entries.length === 0) {
    return res.status(400).json({ message: "No student data provided" });
  }

  const result = await command(
    `UPDATE students
     SET ${entries.map(([key]) => `${key} = ?`).join(", ")}
     WHERE id = ?`,
    [...entries.map(([, value]) => value), req.params.id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ message: "Student not found" });
  }

  await ensureStudentLoginAccount(req.params.id, student.student_number);
  res.json({ message: "Student saved successfully" });
}));

app.delete("/students/:id", asyncRoute(async (req, res) => {
  if (!requireRole(req, res, ["admin"])) return;

  const studentId = req.params.id;
  await command("DELETE FROM medical_notes WHERE student_id = ?", [studentId]);
  await command("DELETE FROM clinic_visits WHERE student_id = ?", [studentId]);
  await command("DELETE FROM health_records WHERE student_id = ?", [studentId]);
  await command("DELETE FROM users WHERE student_id = ?", [studentId]);
  const result = await command("DELETE FROM students WHERE id = ?", [studentId]);

  res.json({ message: "Student deleted successfully", deleted: result.affectedRows });
}));

app.put("/students/:id/health-record", asyncRoute(async (req, res) => {
  if (!requireRole(req, res, ["admin"])) return;

  const health = healthPayload(req.body);
  const existing = await query("SELECT id FROM health_records WHERE student_id = ? LIMIT 1", [req.params.id]);
  const values = [
    health.blood_type,
    health.allergies,
    health.chronic_conditions,
    health.medications,
    health.height_cm,
    health.weight_kg,
    health.bmi,
    health.immunization_status,
  ];

  if (existing[0]) {
    await command(
      `UPDATE health_records
       SET blood_type = ?, allergies = ?, chronic_conditions = ?, medications = ?,
           height_cm = ?, weight_kg = ?, bmi = ?, immunization_status = ?
       WHERE id = ?`,
      [...values, existing[0].id]
    );
  } else {
    await command(
      `INSERT INTO health_records
       (student_id, blood_type, allergies, chronic_conditions, medications, height_cm, weight_kg, bmi, immunization_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, ...values]
    );
  }

  res.json({ message: "Health record saved successfully" });
}));

app.delete("/students/:id/health-record", asyncRoute(async (req, res) => {
  if (!requireRole(req, res, ["admin"])) return;

  const result = await command("DELETE FROM health_records WHERE student_id = ?", [req.params.id]);
  res.json({ message: "Health record deleted successfully", deleted: result.affectedRows });
}));

app.post("/clinic-visits", asyncRoute(async (req, res) => {
  if (!requireRole(req, res, ["nurse", "admin"])) return;

  const visit = clinicVisitPayload(req.body);

  if (!visit.student_id || !visit.reason) {
    return res.status(400).json({ message: "Student ID and reason are required" });
  }

  const result = await command(
    `INSERT INTO clinic_visits
     (student_id, visit_date, reason, symptoms, treatment, disposition, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      visit.student_id,
      visit.visit_date || new Date(),
      visit.reason,
      visit.symptoms,
      visit.treatment,
      visit.disposition,
      req.user.username,
    ]
  );

  res.json({ message: "Clinic visit saved successfully", visitId: result.insertId });
}));

app.put("/clinic-visits/:id", asyncRoute(async (req, res) => {
  if (!requireRole(req, res, ["admin"])) return;

  const visit = clinicVisitPayload(req.body);
  delete visit.student_id;
  const entries = compactEntries(visit);

  if (entries.length === 0) {
    return res.status(400).json({ message: "No clinic visit data provided" });
  }

  const result = await command(
    `UPDATE clinic_visits
     SET ${entries.map(([key]) => `${key} = ?`).join(", ")}
     WHERE id = ?`,
    [...entries.map(([, value]) => value), req.params.id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ message: "Clinic visit not found" });
  }

  res.json({ message: "Clinic visit saved successfully" });
}));

app.delete("/clinic-visits/:id", asyncRoute(async (req, res) => {
  if (!requireRole(req, res, ["admin"])) return;

  const result = await command("DELETE FROM clinic_visits WHERE id = ?", [req.params.id]);
  res.json({ message: "Clinic visit deleted successfully", deleted: result.affectedRows });
}));

app.post("/students/:id/medical-notes", asyncRoute(async (req, res) => {
  if (!requireRole(req, res, ["nurse", "admin"])) return;

  if (!req.body.note) {
    return res.status(400).json({ message: "Medical note is required" });
  }

  const result = await command(
    `INSERT INTO medical_notes (student_id, note, created_by)
     VALUES (?, ?, ?)`,
    [req.params.id, req.body.note, req.user.username]
  );

  res.json({ message: "Medical note saved successfully", noteId: result.insertId });
}));

app.put("/medical-notes/:id", asyncRoute(async (req, res) => {
  if (!requireRole(req, res, ["admin"])) return;

  if (!req.body.note) {
    return res.status(400).json({ message: "Medical note is required" });
  }

  const result = await command("UPDATE medical_notes SET note = ? WHERE id = ?", [req.body.note, req.params.id]);

  if (result.affectedRows === 0) {
    return res.status(404).json({ message: "Medical note not found" });
  }

  res.json({ message: "Medical note saved successfully" });
}));

app.delete("/medical-notes/:id", asyncRoute(async (req, res) => {
  if (!requireRole(req, res, ["admin"])) return;

  const result = await command("DELETE FROM medical_notes WHERE id = ?", [req.params.id]);
  res.json({ message: "Medical note deleted successfully", deleted: result.affectedRows });
}));

app.get("/records-dashboard", asyncRoute(async (_req, res) => {
  const [summary] = await query(`
    SELECT
      (SELECT COUNT(*) FROM students) AS totalStudents,
      (SELECT COUNT(*) FROM health_records) AS totalHealthRecords,
      (SELECT COUNT(*) FROM clinic_visits) AS totalClinicVisits,
      (SELECT COUNT(*) FROM medical_notes) AS totalMedicalNotes,
      (SELECT AVG(bmi) FROM health_records WHERE bmi IS NOT NULL) AS averageBmi
  `);

  const students = await query(`
    SELECT
      s.*,
      COUNT(DISTINCT hr.id) AS health_record_count,
      COUNT(DISTINCT cv.id) AS clinic_visit_count,
      COUNT(DISTINCT mn.id) AS medical_note_count
    FROM students s
    LEFT JOIN health_records hr ON hr.student_id = s.id
    LEFT JOIN clinic_visits cv ON cv.student_id = s.id
    LEFT JOIN medical_notes mn ON mn.student_id = s.id
    GROUP BY s.id
    ORDER BY s.updated_at DESC, s.id DESC
  `);

  const healthRecords = await query(`
    SELECT hr.*, s.first_name, s.last_name, s.student_number
    FROM health_records hr
    JOIN students s ON s.id = hr.student_id
    ORDER BY hr.updated_at DESC, hr.id DESC
    LIMIT 20
  `);

  const clinicVisits = await query(`
    SELECT cv.*, s.first_name, s.last_name, s.student_number
    FROM clinic_visits cv
    JOIN students s ON s.id = cv.student_id
    ORDER BY cv.visit_date DESC, cv.id DESC
    LIMIT 20
  `);

  const medicalNotes = await query(`
    SELECT mn.*, s.first_name, s.last_name, s.student_number
    FROM medical_notes mn
    JOIN students s ON s.id = mn.student_id
    ORDER BY mn.created_at DESC, mn.id DESC
    LIMIT 20
  `);

  res.json({ summary, students, healthRecords, clinicVisits, medicalNotes });
}));

app.get("/reports/summary", asyncRoute(async (_req, res) => {
  const [summary] = await query(`
    SELECT
      (SELECT COUNT(*) FROM students) AS totalStudents,
      (SELECT COUNT(*) FROM clinic_visits) AS totalClinicVisits,
      (SELECT COUNT(*) FROM health_records) AS totalHealthRecords,
      (SELECT AVG(bmi) FROM health_records WHERE bmi IS NOT NULL) AS averageBmi,
      (SELECT COUNT(*) FROM health_records WHERE bmi < 18.5) AS underweight,
      (SELECT COUNT(*) FROM health_records WHERE bmi >= 18.5 AND bmi < 25) AS healthyRange,
      (SELECT COUNT(*) FROM health_records WHERE bmi >= 25) AS aboveHealthyRange
  `);

  res.json({
    totalStudents: summary.totalStudents,
    totalClinicVisits: summary.totalClinicVisits,
    totalHealthRecords: summary.totalHealthRecords,
    bmi: {
      averageBmi: summary.averageBmi ? Number(summary.averageBmi).toFixed(2) : null,
      underweight: summary.underweight,
      healthyRange: summary.healthyRange,
      aboveHealthyRange: summary.aboveHealthyRange,
    },
  });
}));

/* =========================
   HEALTH CHECK
========================= */

app.get("/health", asyncRoute(async (req, res) => {
  const [r] = await pool.query("SELECT NOW() AS time");
  res.json({ status: "ok", time: r[0].time });
}));

app.use((err, _req, res, _next) => {
  console.error("Request failed:", err.message);
  res.status(500).json({ message: "Server error. Please try again." });
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
