CREATE DATABASE IF NOT EXISTS student_health_monitoring;
USE student_health_monitoring;

-- =========================
-- USERS / ACCOUNTS TABLE (NEW)
-- =========================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('student', 'nurse', 'admin') NOT NULL,
  student_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_users_student
    FOREIGN KEY (student_id)
    REFERENCES students(id)
    ON DELETE CASCADE
);

-- =========================
-- STUDENTS TABLE
-- =========================
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =========================
-- HEALTH RECORDS
-- =========================
CREATE TABLE IF NOT EXISTS health_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL UNIQUE,
  blood_type VARCHAR(10) NULL,
  allergies TEXT NULL,
  chronic_conditions TEXT NULL,
  medications TEXT NULL,
  height_cm DECIMAL(5,2) NULL,
  weight_kg DECIMAL(5,2) NULL,
  bmi DECIMAL(5,2) NULL,
  bmi_category VARCHAR(50) NULL,
  immunization_status TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- =========================
-- CLINIC VISITS
-- =========================
CREATE TABLE IF NOT EXISTS clinic_visits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  visit_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason VARCHAR(255) NOT NULL,
  symptoms TEXT NULL,
  treatment TEXT NULL,
  disposition VARCHAR(100) NULL,
  recorded_by VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- =========================
-- MEDICAL NOTES
-- =========================
CREATE TABLE IF NOT EXISTS medical_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  note TEXT NOT NULL,
  created_by VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- =========================
-- DEMO STUDENT
-- =========================
INSERT INTO students
  (id, student_number, first_name, last_name, date_of_birth, sex, grade_level, section, guardian_name, guardian_contact)
VALUES
  (1, 'STU-001', 'Demo', 'Student', '2010-01-15', 'Female', 'Grade 8', 'Rose', 'Maria Student', '09170000001')
ON DUPLICATE KEY UPDATE
  student_number = VALUES(student_number);

-- =========================
-- DEMO USER ACCOUNTS (NEW)
-- =========================

INSERT INTO users (username, password, role, student_id)
VALUES
('student1', 'student123', 'student', 1),
('nurse', 'nurse123', 'nurse', NULL),
('admin', 'admin123', 'admin', NULL)
ON DUPLICATE KEY UPDATE
password = VALUES(password);

-- =========================
-- DEMO HEALTH RECORD
-- =========================
INSERT INTO health_records
  (student_id, blood_type, allergies, chronic_conditions, medications, height_cm, weight_kg, bmi, bmi_category, immunization_status)
VALUES
  (1, 'O+', 'None recorded', 'None recorded', 'None recorded', 150.00, 45.00, 20.00, 'Normal', 'Complete')
ON DUPLICATE KEY UPDATE
  bmi = VALUES(bmi),
  bmi_category = VALUES(bmi_category);

-- =========================
-- CLINIC VISIT SAMPLE
-- =========================
INSERT INTO clinic_visits
  (student_id, visit_date, reason, symptoms, treatment, disposition, recorded_by)
SELECT
  1, NOW(), 'Routine checkup', 'No urgent symptoms', 'Vitals checked and BMI reviewed', 'Returned to class', 'nurse'
WHERE NOT EXISTS (
  SELECT 1 FROM clinic_visits WHERE student_id = 1 AND reason = 'Routine checkup'
);

-- =========================
-- MEDICAL NOTE SAMPLE
-- =========================
INSERT INTO medical_notes
  (student_id, note, created_by)
SELECT
  1, 'Demo student account is ready for testing.', 'nurse'
WHERE NOT EXISTS (
  SELECT 1 FROM medical_notes WHERE student_id = 1 AND note = 'Demo student account is ready for testing.'
);