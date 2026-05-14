const loginScreen = document.querySelector("#loginScreen");
const loginForm = document.querySelector("#loginForm");
const loginStatus = document.querySelector("#loginStatus");
const studentIdInput = document.querySelector("#studentIdInput");
const statusMessage = document.querySelector("#statusMessage");
const roleDescription = document.querySelector("#roleDescription");
const accountName = document.querySelector("#accountName");
const accountRole = document.querySelector("#accountRole");
const passwordLabelText = document.querySelector("#passwordLabelText");
const clinicVisitForm = document.querySelector("#clinicVisitForm");
const healthRecordForm = document.querySelector("#healthRecordForm");
const adminClinicVisitForm = document.querySelector("#adminClinicVisitForm");
const adminMedicalNoteForm = document.querySelector("#adminMedicalNoteForm");
const bmiResult = document.querySelector("#bmiResult");
const adminStudentAccountDetails = document.querySelector("#adminStudentAccountDetails");

let session = JSON.parse(localStorage.getItem("healthMonitorSession") || "null");

const descriptions = {
  student: "Students can view their own health record, clinic visit history, and nurse findings only.",
  nurse: "Nurses can register students, view student accounts, and add checkup findings or diagnoses.",
  admin: "Admins handle the entire system with create, read, update, delete, and report access.",
};

const roleViews = {
  student: ["recordsDashboardView", "studentView"],
  nurse: ["recordsDashboardView", "studentView", "nurseView"],
  admin: ["recordsDashboardView", "studentView", "nurseView", "adminView"],
};

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.token || ""}`,
  };
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.style.borderLeftColor = isError ? "#b91c1c" : "#ec4899";
  statusMessage.style.background = isError ? "#fef2f2" : "#fdf2f8";
  statusMessage.style.color = isError ? "#991b1b" : "#9d174d";
}

function setLoginStatus(message, isError = false) {
  loginStatus.textContent = message;
  loginStatus.style.color = isError ? "#991b1b" : "#be185d";
}

async function runButtonAction(button, busyText, action) {
  const originalText = button?.textContent;

  if (button) {
    button.disabled = true;
    button.textContent = busyText;
  }

  try {
    await action();
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function bmiCategory(bmi) {
  if (bmi < 18.5) {
    return "Underweight";
  }

  if (bmi < 25) {
    return "Healthy range";
  }

  if (bmi < 30) {
    return "Overweight";
  }

  return "Obese";
}

function calculateBmi() {
  const heightInput = healthRecordForm.elements.heightCm;
  const weightInput = healthRecordForm.elements.weightKg;
  const bmiInput = healthRecordForm.elements.bmi;
  const height = Number(heightInput.value);
  const weight = Number(weightInput.value);

  if (!height || !weight || height <= 0 || weight <= 0) {
    bmiInput.value = "";
    bmiResult.textContent = "Enter height and weight to calculate BMI.";
    return null;
  }

  const heightMeters = height / 100;
  const bmi = Number((weight / (heightMeters * heightMeters)).toFixed(2));
  bmiInput.value = bmi;
  bmiResult.textContent = `BMI: ${bmi} (${bmiCategory(bmi)})`;
  return bmi;
}

function resetHealthRecordForm() {
  if (!healthRecordForm) {
    return;
  }

  healthRecordForm.reset();
  bmiResult.textContent = "Enter height and weight to calculate BMI.";
}

function localDateTimeValue(date = new Date()) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function setVisitDateTimeDefault(form) {
  if (form?.elements?.visitDate && !form.elements.visitDate.value) {
    form.elements.visitDate.value = localDateTimeValue();
  }
}

async function refreshAfterEntry(form, readyMessage, refreshStudentId = form?.elements?.studentId?.value) {
  if (form === healthRecordForm) {
    resetHealthRecordForm();
  } else if (form && typeof form.reset === "function") {
    form.reset();
    setVisitDateTimeDefault(form);
  }

  await Promise.all([loadRecordsDashboard(), loadStudents()]);

  if (refreshStudentId) {
    studentIdInput.value = refreshStudentId;
    await loadAccount();

    if (session?.user?.role === "admin") {
      await loadAdminStudentAccount(refreshStudentId);
    }
  }

  if (readyMessage) {
    setStatus(readyMessage);
  }
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleDateString();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...headers(),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    clearSession();
  }

  if (!response.ok) {
    throw new Error(data.message || "Request failed.");
  }

  return data;
}

function formData(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  Object.keys(data).forEach((key) => {
    if (data[key] === "") {
      delete data[key];
    }
  });
  return data;
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("is-visible"));
  document.querySelector(`#${viewId}`).classList.add("is-visible");
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === viewId);
  });

  if (viewId === "recordsDashboardView" && session?.token) {
    loadRecordsDashboard();
  }

  if (viewId === "adminView" && session?.token) {
    loadStudents();
  }
}

function applySession() {
  if (!session?.token || !session?.user) {
    document.body.classList.remove("is-authenticated");
    return;
  }

  const user = session.user;
  const availableViews = roleViews[user.role] || [];
  const displayName = user.name || user.username || "Signed-in user";
  document.body.classList.add("is-authenticated");
  accountName.textContent = displayName;
  accountRole.textContent = user.role;
  roleDescription.textContent = descriptions[user.role];

  if (user.role === "student") {
    studentIdInput.value = user.studentId;
    studentIdInput.disabled = true;
  } else {
    studentIdInput.disabled = false;
  }

  document.querySelectorAll(".nav-button").forEach((button) => {
    button.hidden = !availableViews.includes(button.dataset.view);
  });

  showView("recordsDashboardView");
  setStatus(`Signed in as ${displayName}.`);
}

function saveSession(nextSession) {
  session = nextSession;
  localStorage.setItem("healthMonitorSession", JSON.stringify(session));
  applySession();
}

function clearSession() {
  session = null;
  localStorage.removeItem("healthMonitorSession");
  document.body.classList.remove("is-authenticated");
}

function renderDetails(target, details) {
  target.innerHTML = "";

  if (!details) {
    target.innerHTML = '<p class="empty-state">No health record found.</p>';
    return;
  }

  Object.entries(details).forEach(([key, value]) => {
    if (value === null || value === undefined || key.endsWith("_id")) {
      return;
    }

    const term = document.createElement("dt");
    const definition = document.createElement("dd");
    term.textContent = key.replaceAll("_", " ");
    definition.textContent = value || "None";
    target.append(term, definition);
  });
}

function renderVisits(visits) {
  const target = document.querySelector("#clinicHistoryList");
  target.innerHTML = "";

  if (!visits || visits.length === 0) {
    target.innerHTML = '<p class="empty-state">No clinic visits recorded yet.</p>';
    return;
  }

  visits.forEach((visit) => {
    const item = document.createElement("article");
    item.className = "record-item";
    item.innerHTML = `
      <strong>${visit.reason || "Clinic visit"}</strong>
      <p>Visit ID: ${visit.id}</p>
      <p>${visit.visit_date ? new Date(visit.visit_date).toLocaleString() : "No date"}</p>
      <p>Findings: ${visit.symptoms || "None recorded"}</p>
      <p>Diagnosis/Care: ${visit.treatment || "None recorded"}</p>
      <p>Disposition: ${visit.disposition || "None recorded"}</p>
    `;
    target.append(item);
  });
}

function renderNotes(notes) {
  const target = document.querySelector("#medicalNotesList");
  target.innerHTML = "";

  if (!notes || notes.length === 0) {
    target.innerHTML = '<p class="empty-state">No nurse findings or diagnoses recorded yet.</p>';
    return;
  }

  notes.forEach((note) => {
    const item = document.createElement("article");
    item.className = "record-item";
    item.innerHTML = `
      <strong>${note.created_at ? new Date(note.created_at).toLocaleString() : "Medical note"}</strong>
      <p>Note ID: ${note.id}</p>
      <p>${note.note}</p>
    `;
    target.append(item);
  });
}

function renderKeyValueList(rows) {
  return `
    <dl class="details-list">
      ${rows
        .map(
          ([label, value]) => `
            <dt>${label}</dt>
            <dd>${value || "None"}</dd>
          `
        )
        .join("")}
    </dl>
  `;
}

function renderStudentAccountDetails(account) {
  const { student, healthRecord, clinicVisits, medicalNotes } = account;

  adminStudentAccountDetails.innerHTML = `
    <section class="account-detail-section">
      <h4>${student.first_name} ${student.last_name}</h4>
      ${renderKeyValueList([
        ["Student ID", student.id],
        ["Student Number", student.student_number],
        ["Birth Date", formatDate(student.date_of_birth)],
        ["Sex", student.sex],
        ["Grade Level", student.grade_level],
        ["Section", student.section],
        ["Guardian", student.guardian_name],
        ["Guardian Contact", student.guardian_contact],
        ["Created", student.created_at ? new Date(student.created_at).toLocaleString() : ""],
        ["Updated", student.updated_at ? new Date(student.updated_at).toLocaleString() : ""],
      ])}
    </section>

    <section class="account-detail-section">
      <h4>Health Record</h4>
      ${
        healthRecord
          ? renderKeyValueList([
              ["Blood Type", healthRecord.blood_type],
              ["Height", healthRecord.height_cm ? `${healthRecord.height_cm} cm` : ""],
              ["Weight", healthRecord.weight_kg ? `${healthRecord.weight_kg} kg` : ""],
              ["BMI", healthRecord.bmi],
              ["Allergies", healthRecord.allergies],
              ["Chronic Conditions", healthRecord.chronic_conditions],
              ["Medications", healthRecord.medications],
              ["Immunization", healthRecord.immunization_status],
              ["Updated", healthRecord.updated_at ? new Date(healthRecord.updated_at).toLocaleString() : ""],
            ])
          : '<p class="empty-state">No health record found.</p>'
      }
    </section>

    <section class="account-detail-section">
      <h4>Clinic Visits</h4>
      ${
        clinicVisits.length
          ? clinicVisits
              .map(
                (visit) => `
                  <article class="record-item">
                    <strong>${visit.reason || "Clinic visit"}</strong>
                    <p>Visit ID: ${visit.id} | ${visit.visit_date ? new Date(visit.visit_date).toLocaleString() : "No date"}</p>
                    <p>Findings: ${visit.symptoms || "None recorded"}</p>
                    <p>Diagnosis/Care: ${visit.treatment || "None recorded"}</p>
                    <p>Disposition: ${visit.disposition || "None recorded"}</p>
                    <p>Recorded by: ${visit.recorded_by || "Unknown"}</p>
                  </article>
                `
              )
              .join("")
          : '<p class="empty-state">No clinic visits recorded yet.</p>'
      }
    </section>

    <section class="account-detail-section">
      <h4>Medical Notes</h4>
      ${
        medicalNotes.length
          ? medicalNotes
              .map(
                (note) => `
                  <article class="record-item">
                    <strong>Note ID: ${note.id}</strong>
                    <p>${note.note}</p>
                    <p>Created by: ${note.created_by || "Unknown"} | ${
                  note.created_at ? new Date(note.created_at).toLocaleString() : "No date"
                }</p>
                  </article>
                `
              )
              .join("")
          : '<p class="empty-state">No medical notes recorded yet.</p>'
      }
    </section>
  `;
}

function renderDashboardCards(summary) {
  const target = document.querySelector("#recordsSummary");
  const rows = [
    ["Students", summary.totalStudents || 0],
    ["Health records", summary.totalHealthRecords || 0],
    ["Clinic visits", summary.totalClinicVisits || 0],
    ["Medical notes", summary.totalMedicalNotes || 0],
    ["Average BMI", summary.averageBmi ? Number(summary.averageBmi).toFixed(2) : "No data"],
  ];

  target.innerHTML = "";
  rows.forEach(([label, value]) => {
    const card = document.createElement("article");
    card.className = "stat-card";
    card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    target.append(card);
  });
}

function renderDashboardList(targetSelector, rows, emptyMessage, renderRow) {
  const target = document.querySelector(targetSelector);
  target.innerHTML = "";

  if (!rows || rows.length === 0) {
    target.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
    return;
  }

  rows.forEach((row) => {
    const item = document.createElement("article");
    item.className = "record-item";
    item.innerHTML = renderRow(row);
    target.append(item);
  });
}

async function loadRecordsDashboard() {
  try {
    const dashboard = await api("/records-dashboard");
    renderDashboardCards(dashboard.summary);
    renderDashboardList(
      "#dashboardStudentsList",
      dashboard.students,
      "No student records found.",
      (student) => `
        <strong>${student.first_name} ${student.last_name}</strong>
        <p>Student ID: ${student.id} | Student No: ${student.student_number}</p>
        <p>Birth Date: ${formatDate(student.date_of_birth) || "None"} | Sex: ${student.sex || "None"}</p>
        <p>Grade: ${student.grade_level || "None"} | Section: ${student.section || "None"}</p>
        <p>Guardian: ${student.guardian_name || "None"} | Contact: ${student.guardian_contact || "None"}</p>
        <p>Health Records: ${student.health_record_count || 0} | Clinic Visits: ${
          student.clinic_visit_count || 0
        } | Medical Notes: ${student.medical_note_count || 0}</p>
      `
    );
    renderDashboardList(
      "#dashboardHealthList",
      dashboard.healthRecords,
      "No health records found.",
      (record) => `
        <strong>${record.first_name} ${record.last_name}</strong>
        <p>Student ID: ${record.student_id} | Health Record ID: ${record.id}</p>
        <p>Height: ${record.height_cm || "None"} cm | Weight: ${record.weight_kg || "None"} kg | BMI: ${
          record.bmi || "None"
        }</p>
        <p>Blood Type: ${record.blood_type || "None"} | Immunization: ${record.immunization_status || "None"}</p>
      `
    );
    renderDashboardList(
      "#dashboardVisitsList",
      dashboard.clinicVisits,
      "No clinic visits found.",
      (visit) => `
        <strong>${visit.reason || "Clinic visit"}</strong>
        <p>Visit ID: ${visit.id} | Student: ${visit.first_name} ${visit.last_name} (${visit.student_number})</p>
        <p>${visit.visit_date ? new Date(visit.visit_date).toLocaleString() : "No date"}</p>
        <p>Care: ${visit.treatment || "None"} | Disposition: ${visit.disposition || "None"}</p>
      `
    );
    renderDashboardList(
      "#dashboardNotesList",
      dashboard.medicalNotes,
      "No medical notes found.",
      (note) => `
        <strong>Note ID: ${note.id}</strong>
        <p>Student: ${note.first_name} ${note.last_name} (${note.student_number})</p>
        <p>${note.note}</p>
        <p>Created by: ${note.created_by || "Unknown"} | ${
          note.created_at ? new Date(note.created_at).toLocaleString() : "No date"
        }</p>
      `
    );
    setStatus("Records dashboard loaded.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function loadAccount() {
  try {
    const studentId = studentIdInput.value;
    const account = await api(`/students/${studentId}/account`);
    renderDetails(document.querySelector("#healthRecordDetails"), account.healthRecord);
    renderVisits(account.clinicVisits);
    renderNotes(account.medicalNotes);
    setStatus(`Loaded account for ${account.student.first_name} ${account.student.last_name}.`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function loadStudents() {
  try {
    const dashboard = await api("/records-dashboard");
    const students = dashboard.students || [];
    const body = document.querySelector("#studentsTableBody");
    body.innerHTML = "";

    if (students.length === 0) {
      body.innerHTML = '<tr><td colspan="11">No students found.</td></tr>';
      return;
    }

    students.forEach((student) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${student.id}</td>
        <td>${student.student_number}</td>
        <td>${student.first_name} ${student.last_name}</td>
        <td>${formatDate(student.date_of_birth) || ""}</td>
        <td>${student.sex || ""}</td>
        <td>${student.grade_level || ""}</td>
        <td>${student.section || ""}</td>
        <td>${student.guardian_name || ""}</td>
        <td>${student.guardian_contact || ""}</td>
        <td>Health: ${student.health_record_count || 0}<br>Visits: ${student.clinic_visit_count || 0}<br>Notes: ${
          student.medical_note_count || 0
        }</td>
        <td><button class="table-action-button" data-student-account-id="${student.id}" type="button">View Account</button></td>
      `;
      body.append(row);
    });
    renderDashboardCards(dashboard.summary);
    setStatus("Student account details loaded.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function loadAdminStudentAccount(studentId) {
  try {
    const account = await api(`/students/${studentId}/account`);
    renderStudentAccountDetails(account);
    setStatus(`Loaded all data for ${account.student.first_name} ${account.student.last_name}.`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function loadReports() {
  try {
    const report = await api("/reports/summary");
    const target = document.querySelector("#reportDetails");
    target.innerHTML = "";
    const rows = {
      "Total students": report.totalStudents,
      "Clinic visits": report.totalClinicVisits,
      "Health records": report.totalHealthRecords,
      "Average BMI": report.bmi?.averageBmi || "No BMI data",
      Underweight: report.bmi?.underweight || 0,
      "Healthy BMI range": report.bmi?.healthyRange || 0,
      "Above healthy range": report.bmi?.aboveHealthyRange || 0,
    };

    Object.entries(rows).forEach(([key, value]) => {
      const term = document.createElement("dt");
      const definition = document.createElement("dd");
      term.textContent = key;
      definition.textContent = value;
      target.append(term, definition);
    });
    setStatus("Report generated.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitter = event.submitter;
  setLoginStatus("Signing in...");

  await runButtonAction(submitter, "Logging in...", async () => {
    const result = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData(form)),
    });
    const data = await result.json().catch(() => ({}));

    if (!result.ok) {
      throw new Error(data.message || "Login failed.");
    }

    saveSession({ token: data.token, user: data.user });
    form.reset();
    passwordLabelText.textContent = "Password";
    setLoginStatus("");
  }).catch((error) => setLoginStatus(error.message, true));
});

loginForm.elements.role.addEventListener("change", () => {
  passwordLabelText.textContent = loginForm.elements.role.value === "admin" ? "Admin Password" : "Password";
});

document.querySelector("#logoutButton").addEventListener("click", async () => {
  await runButtonAction(document.querySelector("#logoutButton"), "Logging out...", async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (_error) {
      // A failed logout request should still remove the local session.
    } finally {
      clearSession();
    }
  });
});

document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

document.querySelector("#loadRecordsDashboardButton").addEventListener("click", (event) => {
  runButtonAction(event.currentTarget, "Refreshing...", loadRecordsDashboard).catch((error) =>
    setStatus(error.message, true)
  );
});
document.querySelector("#loadAccountButton").addEventListener("click", (event) => {
  runButtonAction(event.currentTarget, "Loading...", loadAccount).catch((error) => setStatus(error.message, true));
});
document.querySelector("#loadStudentsButton").addEventListener("click", (event) => {
  runButtonAction(event.currentTarget, "Loading...", loadStudents).catch((error) => setStatus(error.message, true));
});
document.querySelector("#loadReportsButton").addEventListener("click", (event) => {
  runButtonAction(event.currentTarget, "Generating...", loadReports).catch((error) => setStatus(error.message, true));
});

document.querySelector("#studentsTableBody").addEventListener("click", (event) => {
  const button = event.target.closest("[data-student-account-id]");

  if (!button) {
    return;
  }

  runButtonAction(button, "Loading...", () => loadAdminStudentAccount(button.dataset.studentAccountId)).catch((error) =>
    setStatus(error.message, true)
  );
});

document.querySelector("#registerStudentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitter = event.submitter;

  await runButtonAction(submitter, "Registering...", async () => {
    const result = await api("/students", {
      method: "POST",
      body: JSON.stringify(formData(form)),
    });
    const accountText = result.accountUsername
      ? ` Student login: ${result.accountUsername} / ${result.accountUsername}.`
      : "";
    await refreshAfterEntry(
      form,
      `${result.message}.${accountText} Page refreshed and ready for another student.`,
      result.studentId
    );
  }).catch((error) => setStatus(error.message, true));
});

clinicVisitForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitter = event.submitter;

  setVisitDateTimeDefault(form);

  await runButtonAction(submitter, "Saving...", async () => {
    const result = await api("/clinic-visits", {
      method: "POST",
      body: JSON.stringify(formData(form)),
    });
    await refreshAfterEntry(form, `${result.message} Page refreshed and ready for another visit.`, result.studentId);
  }).catch((error) => setStatus(error.message, true));
});

document.querySelector("#medicalNoteForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitter = event.submitter;
  const data = formData(form);

  await runButtonAction(submitter, "Adding...", async () => {
    const result = await api(`/students/${data.studentId}/medical-notes`, {
      method: "POST",
      body: JSON.stringify({ note: data.note }),
    });
    await refreshAfterEntry(form, result.message, data.studentId);
  }).catch((error) => setStatus(error.message, true));
});

document.querySelector("#adminStudentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitter = event.submitter;
  const data = formData(form);
  const studentId = data.studentId;
  delete data.studentId;

  await runButtonAction(submitter, "Saving...", async () => {
    const result = await api(studentId ? `/students/${studentId}` : "/students", {
      method: studentId ? "PUT" : "POST",
      body: JSON.stringify(data),
    });
    const accountText = result.accountUsername
      ? ` Student login: ${result.accountUsername} / ${result.accountUsername}.`
      : "";
    await refreshAfterEntry(
      form,
      `${result.message || "Student saved."}.${accountText} Page refreshed and ready for another student.`,
      studentId || result.studentId
    );
  }).catch((error) => setStatus(error.message, true));
});

document.querySelector("#deleteStudentButton").addEventListener("click", async (event) => {
  const studentId = document.querySelector("#adminStudentForm [name='studentId']").value;
  if (!studentId) {
    setStatus("Enter a student ID to delete.", true);
    return;
  }

  await runButtonAction(event.currentTarget, "Deleting...", async () => {
    const result = await api(`/students/${studentId}`, { method: "DELETE" });
    setStatus(`Deleted student records: ${result.deleted}.`);
    document.querySelector("#adminStudentForm")?.reset();
    await loadStudents();
    await loadRecordsDashboard();
  }).catch((error) => setStatus(error.message, true));
});

healthRecordForm.elements.heightCm.addEventListener("input", calculateBmi);
healthRecordForm.elements.weightKg.addEventListener("input", calculateBmi);

healthRecordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitter = event.submitter;
  calculateBmi();
  const data = formData(form);
  const studentId = data.studentId;
  delete data.studentId;

  await runButtonAction(submitter, "Saving...", async () => {
    const result = await api(`/students/${studentId}/health-record`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    await refreshAfterEntry(form, result.message, studentId);
  }).catch((error) => setStatus(error.message, true));
});

document.querySelector("#deleteHealthRecordButton").addEventListener("click", async (event) => {
  const studentId = document.querySelector("#healthRecordForm [name='studentId']").value;
  if (!studentId) {
    setStatus("Enter a student ID to delete a health record.", true);
    return;
  }

  await runButtonAction(event.currentTarget, "Deleting...", async () => {
    const result = await api(`/students/${studentId}/health-record`, { method: "DELETE" });
    setStatus(`Deleted health records: ${result.deleted}.`);
    resetHealthRecordForm();
    await loadRecordsDashboard();
  }).catch((error) => setStatus(error.message, true));
});

adminClinicVisitForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitter = event.submitter;

  setVisitDateTimeDefault(form);

  const data = formData(form);
  const visitId = data.visitId;
  delete data.visitId;

  await runButtonAction(submitter, "Saving...", async () => {
    if (!visitId && !data.studentId) {
      throw new Error("Enter a student ID to add a new clinic visit.");
    }

    const result = await api(visitId ? `/clinic-visits/${visitId}` : "/clinic-visits", {
      method: visitId ? "PUT" : "POST",
      body: JSON.stringify(data),
    });
    await refreshAfterEntry(
      form,
      `${result.message} Page refreshed and ready for another visit.`,
      result.studentId || data.studentId
    );
  }).catch((error) => setStatus(error.message, true));
});

document.querySelector("#deleteClinicVisitButton").addEventListener("click", async (event) => {
  const visitId = adminClinicVisitForm.elements.visitId.value;
  if (!visitId) {
    setStatus("Enter a visit ID to delete.", true);
    return;
  }

  await runButtonAction(event.currentTarget, "Deleting...", async () => {
    const result = await api(`/clinic-visits/${visitId}`, { method: "DELETE" });
    await refreshAfterEntry(adminClinicVisitForm, result.message, result.studentId);
  }).catch((error) => setStatus(error.message, true));
});

adminMedicalNoteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitter = event.submitter;
  const data = formData(form);
  const noteId = data.noteId;
  const studentId = data.studentId;
  delete data.noteId;
  delete data.studentId;

  await runButtonAction(submitter, "Saving...", async () => {
    if (!noteId && !studentId) {
      throw new Error("Enter a student ID to add a new medical note.");
    }

    const result = await api(noteId ? `/medical-notes/${noteId}` : `/students/${studentId}/medical-notes`, {
      method: noteId ? "PUT" : "POST",
      body: JSON.stringify(data),
    });
    await refreshAfterEntry(form, result.message, result.studentId || studentId);
  }).catch((error) => setStatus(error.message, true));
});

document.querySelector("#deleteMedicalNoteButton").addEventListener("click", async (event) => {
  const noteId = adminMedicalNoteForm.elements.noteId.value;
  if (!noteId) {
    setStatus("Enter a note ID to delete.", true);
    return;
  }

  await runButtonAction(event.currentTarget, "Deleting...", async () => {
    const result = await api(`/medical-notes/${noteId}`, { method: "DELETE" });
    await refreshAfterEntry(adminMedicalNoteForm, result.message, result.studentId);
  }).catch((error) => setStatus(error.message, true));
});

async function restoreSession() {
  if (!session?.token) {
    clearSession();
    return;
  }

  try {
    const result = await api("/auth/me");
    session.user = result.user || result;
    localStorage.setItem("healthMonitorSession", JSON.stringify(session));
    applySession();
  } catch (_error) {
    clearSession();
    setLoginStatus("Please log in to continue.", true);
  }
}

setVisitDateTimeDefault(clinicVisitForm);
setVisitDateTimeDefault(adminClinicVisitForm);
restoreSession();
