require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const path = require("path");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000;

/* =========================================================
   DATABASE CONFIG
========================================================= */

function databaseConfig() {
  const url = process.env.DATABASE_URL
    ? new URL(process.env.DATABASE_URL)
    : null;

  const sslEnabled =
    String(process.env.DB_SSL || "").toLowerCase() === "true";

  const sslCa = process.env.DB_SSL_CA;

  return {
    host: url?.hostname || process.env.DB_HOST || "localhost",

    port: Number(
      url?.port || process.env.DB_PORT || 3306
    ),

    user: url
      ? decodeURIComponent(url.username)
      : process.env.DB_USER || "root",

    password: url
      ? decodeURIComponent(url.password)
      : process.env.DB_PASSWORD ||
        process.env.DB_PASS ||
        "",

    database:
      (url?.pathname
        ? decodeURIComponent(
            url.pathname.replace(/^\//, "")
          )
        : "") ||
      process.env.DB_NAME ||
      "student_health_monitoring",

    ssl:
      sslEnabled ||
      sslCa ||
      url?.searchParams.get("ssl-mode")
        ? {
            rejectUnauthorized: false,
            ...(sslCa
              ? {
                  ca: sslCa.replace(/\\n/g, "\n"),
                }
              : {}),
          }
        : undefined,

    createDatabase:
      String(
        process.env.DB_CREATE_DATABASE || "false"
      ).toLowerCase() === "true",
  };
}

const dbConfig = databaseConfig();

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(cors());

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use(
  express.static(path.join(__dirname, "public"))
);

/* =========================================================
   MYSQL POOL
========================================================= */

const pool = mysql.createPool({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  ssl: dbConfig.ssl,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true,
});

/* =========================================================
   CONSTANTS
========================================================= */

const roles = {
  STUDENT: "student",
  NURSE: "nurse",
  ADMIN: "admin",
};

const sessionStore = new Map();

const sessionDurationMs =
  8 * 60 * 60 * 1000;

/* =========================================================
   DEMO USERS
========================================================= */

const demoAccounts = [
  {
    username: "student1",
    password: "student123",
    role: roles.STUDENT,
    displayName: "Student Account",
    studentId: "1",
  },

  {
    username: "nurse",
    password: "nurse123",
    role: roles.NURSE,
    displayName: "School Nurse",
  },

  {
    username: "admin",
    password:
      process.env.ADMIN_PASSWORD ||
      "admin123",
    role: roles.ADMIN,
    displayName: "System Administrator",
  },
];

/* =========================================================
   HELPERS
========================================================= */

function calculateBmi(heightCm, weightKg) {
  const height = Number(heightCm);
  const weight = Number(weightKg);

  if (
    !height ||
    !weight ||
    height <= 0 ||
    weight <= 0
  ) {
    return null;
  }

  const meters = height / 100;

  return Number(
    (weight / (meters * meters)).toFixed(2)
  );
}

function bmiCategory(bmi) {
  if (bmi === null) {
    return null;
  }

  if (bmi < 18.5) {
    return "Underweight";
  }

  if (bmi < 25) {
    return "Normal";
  }

  if (bmi < 30) {
    return "Overweight";
  }

  return "Obese";
}

function normalizeDateTime(value) {
  if (!value) {
    return new Date();
  }

  return String(value).replace("T", " ");
}

function publicUser(account) {
  return {
    id: account.username,
    role: account.role,
    name: account.displayName,
    studentId:
      account.studentId || null,
  };
}

/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

function authenticate(
  req,
  res,
  next
) {
  const authHeader =
    req.header("authorization") || "";

  const [scheme, token] =
    authHeader.split(" ");

  if (
    scheme !== "Bearer" ||
    !token
  ) {
    return res.status(401).json({
      message:
        "Please log in first.",
    });
  }

  const session =
    sessionStore.get(token);

  if (
    !session ||
    session.expiresAt < Date.now()
  ) {
    sessionStore.delete(token);

    return res.status(401).json({
      message:
        "Your login session expired.",
    });
  }

  req.token = token;
  req.user = session.user;

  next();
}

function allowRoles(...allowedRoles) {
  return (
    req,
    res,
    next
  ) => {
    if (
      !allowedRoles.includes(
        req.user.role
      )
    ) {
      return res.status(403).json({
        message:
          "Access denied.",
      });
    }

    next();
  };
}

/* =========================================================
   DATABASE HELPERS
========================================================= */

async function query(
  sql,
  params = {}
) {
  const [rows] =
    await pool.execute(
      sql,
      params
    );

  return rows;
}

async function command(
  sql,
  params = {}
) {
  const [result] =
    await pool.execute(
      sql,
      params
    );

  return result;
}

/* =========================================================
   DATABASE INITIALIZATION
========================================================= */

async function ensureDatabaseExists() {
  if (!dbConfig.createDatabase) {
    return;
  }

  const connection =
    await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      ssl: dbConfig.ssl,
    });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``
    );
  } finally {
    await connection.end();
  }
}

async function ensureDatabaseSchema() {
  await command(`
    CREATE TABLE IF NOT EXISTS students (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_number VARCHAR(50) NOT NULL UNIQUE,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      date_of_birth DATE NULL,
      sex VARCHAR(20) NULL,
      grade_level VARCHAR(50) NULL,
      section VARCHAR(50) NULL,
      guardian_name VARCHAR(150) NULL,
      guardian_contact VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await command(`
    CREATE TABLE IF NOT EXISTS health_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT NOT NULL UNIQUE,
      blood_type VARCHAR(10),
      allergies TEXT,
      chronic_conditions TEXT,
      medications TEXT,
      height_cm DECIMAL(5,2),
      weight_kg DECIMAL(5,2),
      bmi DECIMAL(5,2),
      bmi_category VARCHAR(50),
      immunization_status TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ON UPDATE CURRENT_TIMESTAMP,

      FOREIGN KEY (student_id)
      REFERENCES students(id)
      ON DELETE CASCADE
    )
  `);

  await command(`
    CREATE TABLE IF NOT EXISTS clinic_visits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT NOT NULL,
      visit_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reason VARCHAR(255) NOT NULL,
      symptoms TEXT,
      treatment TEXT,
      disposition VARCHAR(100),
      recorded_by VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (student_id)
      REFERENCES students(id)
      ON DELETE CASCADE
    )
  `);

  await command(`
    CREATE TABLE IF NOT EXISTS medical_notes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT NOT NULL,
      note TEXT NOT NULL,
      created_by VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (student_id)
      REFERENCES students(id)
      ON DELETE CASCADE
    )
  `);
}

/* =========================================================
   SEED DEMO DATA
========================================================= */

async function seedDemoData() {
  await command(`
    INSERT INTO students (
      id,
      student_number,
      first_name,
      last_name,
      date_of_birth,
      sex,
      grade_level,
      section,
      guardian_name,
      guardian_contact
    )
    VALUES (
      1,
      'STU-001',
      'Demo',
      'Student',
      '2010-01-15',
      'Female',
      'Grade 8',
      'Rose',
      'Maria Student',
      '09170000001'
    )
    ON DUPLICATE KEY UPDATE
      first_name = VALUES(first_name)
  `);

  await command(`
    INSERT INTO health_records (
      student_id,
      blood_type,
      allergies,
      chronic_conditions,
      medications,
      height_cm,
      weight_kg,
      bmi,
      bmi_category,
      immunization_status
    )
    VALUES (
      1,
      'O+',
      'None',
      'None',
      'None',
      150,
      45,
      20,
      'Normal',
      'Complete'
    )
    ON DUPLICATE KEY UPDATE
      bmi = VALUES(bmi)
  `);
}

/* =========================================================
   PUBLIC ROUTES
========================================================= */

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message:
      "Student Health Monitoring System API is running",
  });
});

app.get(
  "/health",
  async (_req, res) => {
    try {
      const [result] =
        await pool.query(
          "SELECT NOW() AS currentTime"
        );

      res.json({
        success: true,
        database: "connected",
        time:
          result[0].currentTime,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/* =========================================================
   LOGIN
========================================================= */

app.post(
  "/auth/login",
  (req, res) => {
    const {
      role,
      username,
      password,
    } = req.body;

    const account =
      demoAccounts.find(
        (item) =>
          item.role === role &&
          item.username ===
            username &&
          item.password ===
            password
      );

    if (!account) {
      return res.status(401).json({
        message:
          "Invalid credentials.",
      });
    }

    const token =
      crypto
        .randomBytes(32)
        .toString("hex");

    const user =
      publicUser(account);

    sessionStore.set(token, {
      user,
      expiresAt:
        Date.now() +
        sessionDurationMs,
    });

    res.json({
      token,
      user,
      expiresInSeconds:
        sessionDurationMs /
        1000,
    });
  }
);

/* =========================================================
   PROTECTED ROUTES
========================================================= */

app.use(authenticate);

/* =========================================================
   CURRENT USER
========================================================= */

app.get("/auth/me", (req, res) => {
  res.json({
    user: req.user,
  });
});

app.post(
  "/auth/logout",
  (req, res) => {
    sessionStore.delete(
      req.token
    );

    res.json({
      message:
        "Logged out successfully.",
    });
  }
);

/* =========================================================
   STUDENTS
========================================================= */

app.get(
  "/students",
  allowRoles(
    roles.NURSE,
    roles.ADMIN
  ),
  async (_req, res, next) => {
    try {
      const students =
        await query(`
          SELECT *
          FROM students
          ORDER BY last_name, first_name
        `);

      res.json(students);
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/students",
  allowRoles(
    roles.NURSE,
    roles.ADMIN
  ),
  async (req, res, next) => {
    try {
      const bmi =
        calculateBmi(
          req.body.heightCm,
          req.body.weightKg
        );

      const category =
        bmiCategory(bmi);

      const result =
        await command(
          `
        INSERT INTO students (
          student_number,
          first_name,
          last_name,
          date_of_birth,
          sex,
          grade_level,
          section,
          guardian_name,
          guardian_contact
        )
        VALUES (
          :studentNumber,
          :firstName,
          :lastName,
          :dateOfBirth,
          :sex,
          :gradeLevel,
          :section,
          :guardianName,
          :guardianContact
        )
      `,
          {
            studentNumber:
              req.body
                .studentNumber,
            firstName:
              req.body.firstName,
            lastName:
              req.body.lastName,
            dateOfBirth:
              req.body
                .dateOfBirth ||
              null,
            sex:
              req.body.sex ||
              null,
            gradeLevel:
              req.body
                .gradeLevel ||
              null,
            section:
              req.body
                .section ||
              null,
            guardianName:
              req.body
                .guardianName ||
              null,
            guardianContact:
              req.body
                .guardianContact ||
              null,
          }
        );

      await command(
        `
        INSERT INTO health_records (
          student_id,
          height_cm,
          weight_kg,
          bmi,
          bmi_category
        )
        VALUES (
          :studentId,
          :heightCm,
          :weightKg,
          :bmi,
          :bmiCategory
        )
      `,
        {
          studentId:
            result.insertId,
          heightCm:
            req.body.heightCm,
          weightKg:
            req.body.weightKg,
          bmi,
          bmiCategory:
            category,
        }
      );

      res.status(201).json({
        success: true,
        message:
          "Student registered successfully.",
        studentId:
          result.insertId,
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   REPORTS
========================================================= */

app.get(
  "/reports/summary",
  allowRoles(roles.ADMIN),
  async (_req, res, next) => {
    try {
      const [summary] =
        await query(`
          SELECT
            (SELECT COUNT(*) FROM students) AS totalStudents,
            (SELECT COUNT(*) FROM clinic_visits) AS totalClinicVisits,
            (SELECT COUNT(*) FROM health_records) AS totalHealthRecords
        `);

      res.json(summary);
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (
    error,
    _req,
    res,
    _next
  ) => {
    console.error(error);

    if (
      error.code ===
      "ER_DUP_ENTRY"
    ) {
      return res
        .status(409)
        .json({
          message:
            "Duplicate entry found.",
        });
    }

    if (
      error.code ===
      "ECONNREFUSED"
    ) {
      return res
        .status(500)
        .json({
          message:
            "Cannot connect to MySQL.",
        });
    }

    res.status(500).json({
      message:
        "Internal server error.",
    });
  }
);

/* =========================================================
   SERVER START
========================================================= */

let server;

ensureDatabaseExists()
  .then(
    ensureDatabaseSchema
  )
  .then(seedDemoData)
  .then(() => {
    server = app.listen(
      port,
      "0.0.0.0",
      () => {
        console.log(
          `🚀 Server running on port ${port}`
        );
      }
    );

    server.on(
      "error",
      (error) => {
        if (
          error.code ===
          "EADDRINUSE"
        ) {
          console.error(
            `Port ${port} is already in use.`
          );

          process.exit(1);
        }

        console.error(error);

        process.exit(1);
      }
    );
  })
  .catch((error) => {
    console.error(
      "Database setup failed:",
      error.message
    );

    process.exit(1);
  });

/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

process.on(
  "SIGINT",
  async () => {
    console.log(
      "Shutting down server..."
    );

    try {
      await pool.end();

      console.log(
        "Database pool closed."
      );
    } catch (error) {
      console.error(error);
    }

    process.exit(0);
  }
);