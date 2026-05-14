CREATE DATABASE IF NOT EXISTS student_health_monitoring;
USE student_health_monitoring;

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
-- USERS TABLE (EMAIL LOGIN - FINAL)
-- =========================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('student','nurse','admin') NOT NULL,
  student_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (student_id)
  REFERENCES students(id)
  ON DELETE CASCADE
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

  FOREIGN KEY (student_id)
  REFERENCES students(id)
  ON DELETE CASCADE
);

-- =========================
-- CLINIC VISITS
-- =========================
CREATE TABLE IF NOT EXISTS clinic_visits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  visit_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  reason VARCHAR(255) NOT NULL,
  symptoms TEXT NULL,
  treatment TEXT NULL,
  disposition VARCHAR(100) NULL,
  recorded_by VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (student_id)
  REFERENCES students(id)
  ON DELETE CASCADE
);

-- =========================
-- MEDICAL NOTES
-- =========================
CREATE TABLE IF NOT EXISTS medical_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  note TEXT NOT NULL,
  created_by VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (student_id)
  REFERENCES students(id)
  ON DELETE CASCADE
);

-- =========================
-- DEMO STUDENTS
-- =========================
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
VALUES
(
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
),
(
  2,
  'STU-002',
  'Aira',
  'Santos',
  '2011-03-22',
  'Female',
  'Grade 7',
  'Daisy',
  'Lorna Santos',
  '09170000002'
),
(
  3,
  'STU-003',
  'Miguel',
  'Reyes',
  '2010-08-11',
  'Male',
  'Grade 8',
  'Rose',
  'Carlo Reyes',
  '09170000003'
),
(
  4,
  'STU-004',
  'Jasmine',
  'Cruz',
  '2009-12-05',
  'Female',
  'Grade 9',
  'Orchid',
  'Elena Cruz',
  '09170000004'
),
(
  5,
  'STU-005',
  'Nathan',
  'Garcia',
  '2011-06-18',
  'Male',
  'Grade 7',
  'Daisy',
  'Ramon Garcia',
  '09170000005'
),
(
  6,
  'STU-006',
  'Bianca',
  'Mendoza',
  '2010-04-27',
  'Female',
  'Grade 8',
  'Lily',
  'Grace Mendoza',
  '09170000006'
),
(
  7,
  'STU-007',
  'Paolo',
  'Villanueva',
  '2009-09-14',
  'Male',
  'Grade 9',
  'Orchid',
  'Mark Villanueva',
  '09170000007'
),
(
  8,
  'STU-008',
  'Sofia',
  'Lim',
  '2012-01-30',
  'Female',
  'Grade 6',
  'Tulip',
  'Andrea Lim',
  '09170000008'
),
(
  9,
  'STU-009',
  'Daniel',
  'Torres',
  '2011-11-09',
  'Male',
  'Grade 7',
  'Sampaguita',
  'Jose Torres',
  '09170000009'
),
(
  10,
  'STU-010',
  'Mika',
  'Flores',
  '2010-07-03',
  'Female',
  'Grade 8',
  'Lily',
  'Catherine Flores',
  '09170000010'
),
(
  11,
  'STU-011',
  'Rafael',
  'Navarro',
  '2009-02-16',
  'Male',
  'Grade 9',
  'Orchid',
  'Teresa Navarro',
  '09170000011'
)
ON DUPLICATE KEY UPDATE
first_name = VALUES(first_name);

-- =========================
-- DEMO USERS (LOGIN ACCOUNTS)
-- =========================
INSERT INTO users (email, password, role, student_id)
VALUES
('student1@gmail.com', 'student123', 'student', 1),
('student2@gmail.com', 'student123', 'student', 2),
('student3@gmail.com', 'student123', 'student', 3),
('student4@gmail.com', 'student123', 'student', 4),
('student5@gmail.com', 'student123', 'student', 5),
('student6@gmail.com', 'student123', 'student', 6),
('student7@gmail.com', 'student123', 'student', 7),
('student8@gmail.com', 'student123', 'student', 8),
('student9@gmail.com', 'student123', 'student', 9),
('student10@gmail.com', 'student123', 'student', 10),
('student11@gmail.com', 'student123', 'student', 11),
('nurse@gmail.com', 'nurse123', 'nurse', NULL),
('admin@gmail.com', 'admin123', 'admin', NULL)
ON DUPLICATE KEY UPDATE
password = VALUES(password);

-- =========================
-- DEMO HEALTH RECORD (WITH BMI)
-- =========================
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
VALUES
(
  1,
  'O+',
  'None',
  'None',
  'None',
  150,
  45,
  20.00,
  'Normal',
  'Complete'
),
(
  2,
  'A+',
  'None',
  'None',
  'None',
  148,
  42,
  19.17,
  'Normal',
  'Complete'
),
(
  3,
  'B+',
  'Peanuts',
  'None',
  'Antihistamine as needed',
  154,
  50,
  21.08,
  'Normal',
  'Complete'
),
(
  4,
  'O-',
  'None',
  'Asthma',
  'Inhaler as needed',
  158,
  52,
  20.83,
  'Normal',
  'Complete'
),
(
  5,
  'AB+',
  'Shellfish',
  'None',
  'None',
  146,
  43,
  20.17,
  'Normal',
  'Complete'
),
(
  6,
  'A-',
  'None',
  'None',
  'None',
  151,
  46,
  20.17,
  'Normal',
  'Complete'
),
(
  7,
  'B-',
  'Dust',
  'Allergic rhinitis',
  'Cetirizine as needed',
  160,
  55,
  21.48,
  'Normal',
  'Complete'
),
(
  8,
  'O+',
  'None',
  'None',
  'None',
  143,
  39,
  19.07,
  'Normal',
  'Complete'
),
(
  9,
  'A+',
  'None',
  'None',
  'None',
  150,
  47,
  20.89,
  'Normal',
  'Complete'
),
(
  10,
  'AB-',
  'Milk',
  'None',
  'Lactase as needed',
  153,
  48,
  20.50,
  'Normal',
  'Complete'
),
(
  11,
  'B+',
  'None',
  'None',
  'None',
  162,
  57,
  21.72,
  'Normal',
  'Complete'
)
ON DUPLICATE KEY UPDATE
bmi = VALUES(bmi),
bmi_category = VALUES(bmi_category),
height_cm = VALUES(height_cm),
weight_kg = VALUES(weight_kg);

-- =========================
-- SAMPLE CLINIC VISIT
-- =========================
INSERT INTO clinic_visits (
  student_id,
  visit_date,
  reason,
  symptoms,
  treatment,
  disposition,
  recorded_by
)
VALUES (
  1,
  NOW(),
  'Routine checkup',
  'No symptoms',
  'Vitals checked',
  'Returned to class',
  'nurse'
);

-- =========================
-- SAMPLE NOTE
-- =========================
INSERT INTO medical_notes (
  student_id,
  note,
  created_by
)
VALUES (
  1,
  'Demo account ready for testing',
  'nurse'
);
