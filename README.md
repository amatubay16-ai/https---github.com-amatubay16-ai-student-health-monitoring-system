<<<<<<< HEAD
# Student Health Monitoring System

A web-based application for managing student health records, clinic visits, medical findings, BMI monitoring, and school clinic administration.

## Features

### Student

- View own health record only
- View own clinic visit history
- View nurse findings, checkup notes, and diagnoses added to their account
- Open a records dashboard limited to their own account data
- Cannot create, edit, or delete records
- Cannot view another student's account

### School Nurse

- Register students
- Record clinic visits
- Add medical notes, checkup findings, and diagnoses
- View clinic history
- Open a records dashboard for student, health, clinic visit, and medical note records
- Cannot delete student accounts
- Cannot delete health records, clinic visits, or medical notes

### Admin

- Handles the entire system
- Create, read, update, and delete students
- Manage health records
- Delete health records, clinic visits, and medical notes
- Generate reports
- View all student records and clinic history
- Open a records dashboard for all students, health records, clinic visits, and medical notes

## Technology Used

| Technology | Purpose |
| --- | --- |
| Node.js | Backend runtime |
| Express.js | Web framework and API routing |
| MySQL | Database |
| phpMyAdmin | Database management |
| HTML | Frontend structure |
| CSS | Frontend styling |
| JavaScript | Frontend behavior |
| Render | Deployment target |

## Project Structure

```text
Student Health Monitoring System/
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── database.sql
├── package.json
├── package-lock.json
├── server.js
└── README.md
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

If PowerShell blocks `npm`, use:

```bash
npm.cmd install
```

### 2. Create the Database

Open phpMyAdmin, then import:

```text
database.sql
```

This creates the database:

```text
student_health_monitoring
```

And the required tables:

- `students`
- `health_records`
- `clinic_visits`
- `medical_notes`

The script also adds one demo student, a sample health record, a sample clinic visit, and a sample medical note so the app is usable immediately after import.

### 3. Configure Environment Variables

Create or update the `.env` file:

```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=student_health_monitoring
ADMIN_PASSWORD=admin123
```

Adjust `DB_USER` and `DB_PASSWORD` based on your local MySQL/phpMyAdmin setup. Change `ADMIN_PASSWORD` to set the admin login password.

### 4. Run the System

```bash
npm start
```

If PowerShell blocks `npm`, use:

```bash
npm.cmd start
```

Open the app in your browser:

```text
http://localhost:3000
```

## Development Mode

```bash
npm run dev
```

Or:

```bash
npm.cmd run dev
```

## Test / Syntax Check

```bash
npm test
```

Or:

```bash
npm.cmd test
```

## Role Testing

The system now starts with a login page. Use one of these demo accounts:

| Account | Username | Password |
| --- | --- | --- |
| Student | `student1` | `student123` |
| School Nurse | `nurse` | `nurse123` |
| Admin | `admin` | `admin123` |

The admin password can be changed with `ADMIN_PASSWORD` in `.env`.

After login, the server issues a temporary session token. Protected API routes require:

```http
Authorization: Bearer your-session-token
```

The frontend stores the token in the browser and sends it automatically until the user logs out or the session expires.

## Main API Routes

### Records Dashboard

```http
GET /records-dashboard
```

Students see only their own account records. Nurses and admins can view the full records dashboard.

### Student Account

```http
GET /students/:studentId/account
GET /students/:studentId/health-record
GET /students/:studentId/clinic-visits
GET /students/:studentId/medical-notes
```

Students can access these only when `:studentId` matches the student account attached to their login session.

### Nurse Routes

```http
POST /students
POST /clinic-visits
POST /students/:studentId/medical-notes
GET /students
GET /students/:studentId/clinic-visits
GET /students/:studentId/medical-notes
```

Nurses can add and view clinic-related records, but cannot delete accounts or records.

### Admin Routes

```http
GET /students
POST /students
PUT /students/:studentId
DELETE /students/:studentId

PUT /students/:studentId/health-record
DELETE /students/:studentId/health-record

PUT /clinic-visits/:visitId
DELETE /clinic-visits/:visitId

PUT /medical-notes/:noteId
DELETE /medical-notes/:noteId

GET /reports/summary
```

Admins have full CRUD access to the system.

## Important Permission Rules

- Student can only view their own record and history.
- Student cannot edit, add, or delete data.
- Nurse can input checkup findings and diagnoses.
- Nurse findings appear in the student account.
- Nurse cannot delete records or accounts.
- Admin can manage the whole system.
- Admin can enter height and weight to calculate BMI automatically.
- Admin can update or delete clinic visits and medical notes by their displayed IDs.

## Deployment Notes for Render

Use the following start command:

```bash
npm start
```

Set the environment variables in Render:

```env
PORT=3000
DB_HOST=your-database-host
DB_USER=your-database-user
DB_PASSWORD=your-database-password
DB_NAME=student_health_monitoring
ADMIN_PASSWORD=your-admin-password
```

For production deployment, use a hosted MySQL database that Render can access.
=======
# student-health-monitoring-system
>>>>>>> c9b37f5ba70246341299d3da0705af9b59151909
