(function () {
  "use strict";

  // ---------- Static config ----------

  const TASKS = [
    { key: "kassa", label: "Kassa" },
    { key: "friet", label: "Friet" },
    { key: "snack", label: "Snack" },
    { key: "bakplaat", label: "Bakplaat" },
    { key: "fietsbezorgen", label: "Fietsbezorgen" },
    { key: "autobezorgen", label: "Autobezorgen" },
    { key: "vliegende_keep", label: "Vliegende keep" },
  ];

  // Open dinsdag t/m zondag; maandag gesloten.
  const DAYS = [
    { key: "dinsdag", label: "Dinsdag", jsDay: 2 },
    { key: "woensdag", label: "Woensdag", jsDay: 3 },
    { key: "donderdag", label: "Donderdag", jsDay: 4 },
    { key: "vrijdag", label: "Vrijdag", jsDay: 5 },
    { key: "zaterdag", label: "Zaterdag", jsDay: 6 },
    { key: "zondag", label: "Zondag", jsDay: 0 },
  ];

  const DEFAULT_REQUIREMENTS = {
    dinsdag: { kassa: 1, snack: 1, friet: 1, bakplaat: 1, vliegende_keep: 1, fietsbezorgen: 2 },
    woensdag: { kassa: 1, snack: 1, friet: 1, bakplaat: 1, vliegende_keep: 1, fietsbezorgen: 2 },
    donderdag: { kassa: 2, bakplaat: 2, friet: 1, snack: 1, fietsbezorgen: 2 },
    vrijdag: { kassa: 2, friet: 1, snack: 1, bakplaat: 2, fietsbezorgen: 3, autobezorgen: 1 },
    zaterdag: { kassa: 2, bakplaat: 2, snack: 1, friet: 1, fietsbezorgen: 3 },
    zondag: { kassa: 2, bakplaat: 2, friet: 1, snack: 1, fietsbezorgen: 3, autobezorgen: 1 },
  };

  const STORAGE_KEYS = {
    employees: "friettent_employees",
    requirements: "friettent_requirements",
    schedulePrefix: "friettent_schedule_",
  };

  function taskLabel(key) {
    const t = TASKS.find((t) => t.key === key);
    return t ? t.label : key;
  }
  function dayLabel(key) {
    const d = DAYS.find((d) => d.key === key);
    return d ? d.label : key;
  }

  // ---------- Storage helpers ----------

  function loadEmployees() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.employees);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  function saveEmployees(list) {
    localStorage.setItem(STORAGE_KEYS.employees, JSON.stringify(list));
  }
  function loadRequirements() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.requirements);
      return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_REQUIREMENTS));
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULT_REQUIREMENTS));
    }
  }
  function saveRequirements(reqs) {
    localStorage.setItem(STORAGE_KEYS.requirements, JSON.stringify(reqs));
  }
  function loadSchedule(weekValue) {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.schedulePrefix + weekValue);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function saveSchedule(weekValue, data) {
    localStorage.setItem(STORAGE_KEYS.schedulePrefix + weekValue, JSON.stringify(data));
  }

  // ---------- App state ----------

  let employees = loadEmployees();
  let requirements = loadRequirements();
  let editingEmployeeId = null;
  let employeeFormVerlof = [];
  let currentWeekValue = null;
  let currentWeekDates = null;
  let currentScheduleData = null; // { schedule, requirementsSnapshot }

  function uid() {
    return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------- Tabs ----------

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  // ---------- Employee form: build checkboxes ----------

  function buildCheckboxGrid(container, items, namePrefix) {
    container.innerHTML = "";
    items.forEach((item) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = item.key;
      input.name = namePrefix;
      label.appendChild(input);
      label.appendChild(document.createTextNode(item.label));
      container.appendChild(label);
    });
  }

  buildCheckboxGrid(document.getElementById("employee-taken"), TASKS, "taken");
  buildCheckboxGrid(document.getElementById("employee-dagen"), DAYS, "dagen");

  function getCheckedValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((el) => el.value);
  }
  function setCheckedValues(name, values) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
      el.checked = values.includes(el.value);
    });
  }

  // ---------- Verlof list in the form ----------

  function renderVerlofList() {
    const ul = document.getElementById("employee-verlof-list");
    ul.innerHTML = "";
    employeeFormVerlof
      .slice()
      .sort()
      .forEach((dateIso) => {
        const li = document.createElement("li");
        li.textContent = dateIso + " ";
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.textContent = "✕";
        removeBtn.addEventListener("click", () => {
          employeeFormVerlof = employeeFormVerlof.filter((d) => d !== dateIso);
          renderVerlofList();
        });
        li.appendChild(removeBtn);
        ul.appendChild(li);
      });
  }

  document.getElementById("add-verlof-btn").addEventListener("click", () => {
    const input = document.getElementById("employee-verlof-datum");
    if (!input.value) return;
    if (!employeeFormVerlof.includes(input.value)) {
      employeeFormVerlof.push(input.value);
      renderVerlofList();
    }
    input.value = "";
  });

  // ---------- Employee form submit / reset ----------

  function resetEmployeeForm() {
    editingEmployeeId = null;
    employeeFormVerlof = [];
    document.getElementById("employee-form").reset();
    setCheckedValues("taken", []);
    setCheckedValues("dagen", []);
    renderVerlofList();
    document.getElementById("employee-form-title").textContent = "Nieuwe medewerker";
    document.getElementById("employee-cancel-btn").hidden = true;
  }

  document.getElementById("employee-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const naam = document.getElementById("employee-naam").value.trim();
    if (!naam) return;
    const taken = getCheckedValues("taken");
    const vasteDagen = getCheckedValues("dagen");

    if (editingEmployeeId) {
      const emp = employees.find((e) => e.id === editingEmployeeId);
      emp.naam = naam;
      emp.taken = taken;
      emp.vasteDagen = vasteDagen;
      emp.verlof = employeeFormVerlof.slice();
    } else {
      employees.push({
        id: uid(),
        naam,
        taken,
        vasteDagen,
        verlof: employeeFormVerlof.slice(),
      });
    }
    saveEmployees(employees);
    renderEmployeeTable();
    resetEmployeeForm();
  });

  document.getElementById("employee-cancel-btn").addEventListener("click", resetEmployeeForm);

  function startEditEmployee(id) {
    const emp = employees.find((e) => e.id === id);
    if (!emp) return;
    editingEmployeeId = id;
    employeeFormVerlof = emp.verlof.slice();
    document.getElementById("employee-naam").value = emp.naam;
    setCheckedValues("taken", emp.taken);
    setCheckedValues("dagen", emp.vasteDagen);
    renderVerlofList();
    document.getElementById("employee-form-title").textContent = "Medewerker bewerken: " + emp.naam;
    document.getElementById("employee-cancel-btn").hidden = false;
    document.getElementById("employee-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function deleteEmployee(id) {
    const emp = employees.find((e) => e.id === id);
    if (!emp) return;
    if (!confirm(`Weet je zeker dat je "${emp.naam}" wilt verwijderen?`)) return;
    employees = employees.filter((e) => e.id !== id);
    saveEmployees(employees);
    renderEmployeeTable();
    if (editingEmployeeId === id) resetEmployeeForm();
  }

  // ---------- Employee table ----------

  function renderEmployeeTable() {
    const tbody = document.getElementById("employee-tbody");
    tbody.innerHTML = "";
    document.getElementById("employee-empty-msg").hidden = employees.length > 0;

    employees
      .slice()
      .sort((a, b) => a.naam.localeCompare(b.naam))
      .forEach((emp) => {
        const tr = document.createElement("tr");

        const tdNaam = document.createElement("td");
        tdNaam.textContent = emp.naam;
        tr.appendChild(tdNaam);

        const tdTaken = document.createElement("td");
        tdTaken.innerHTML = emp.taken.map((t) => `<span class="tag">${taskLabel(t)}</span>`).join("") || "—";
        tr.appendChild(tdTaken);

        const tdDagen = document.createElement("td");
        tdDagen.innerHTML = emp.vasteDagen.map((d) => `<span class="tag">${dayLabel(d)}</span>`).join("") || "—";
        tr.appendChild(tdDagen);

        const tdVerlof = document.createElement("td");
        tdVerlof.innerHTML = emp.verlof.slice().sort().map((v) => `<span class="tag">${v}</span>`).join("") || "—";
        tr.appendChild(tdVerlof);

        const tdActions = document.createElement("td");
        tdActions.className = "row-actions";
        const editBtn = document.createElement("button");
        editBtn.textContent = "Bewerken";
        editBtn.addEventListener("click", () => startEditEmployee(emp.id));
        const delBtn = document.createElement("button");
        delBtn.textContent = "Verwijderen";
        delBtn.className = "delete";
        delBtn.addEventListener("click", () => deleteEmployee(emp.id));
        tdActions.appendChild(editBtn);
        tdActions.appendChild(delBtn);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
      });
  }

  // ---------- Export / import ----------

  document.getElementById("export-btn").addEventListener("click", () => {
    const data = { employees, requirements };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "friettent-rooster-data.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("import-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (Array.isArray(data.employees)) {
          employees = data.employees;
          saveEmployees(employees);
        }
        if (data.requirements) {
          requirements = data.requirements;
          saveRequirements(requirements);
        }
        renderEmployeeTable();
        renderRequirementsTable();
        resetEmployeeForm();
        alert("Import gelukt.");
      } catch (err) {
        alert("Kon bestand niet lezen: " + err.message);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  // ---------- Bezetting (requirements) tab ----------

  function renderRequirementsTable() {
    const table = document.getElementById("requirements-table");
    const thead = table.querySelector("thead tr");
    thead.innerHTML = "<th>Taak</th>" + DAYS.map((d) => `<th>${d.label}</th>`).join("");

    const tbody = document.createElement("tbody");
    TASKS.forEach((task) => {
      const tr = document.createElement("tr");
      const tdLabel = document.createElement("td");
      tdLabel.textContent = task.label;
      tr.appendChild(tdLabel);
      DAYS.forEach((day) => {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.id = `req-${day.key}-${task.key}`;
        input.value = (requirements[day.key] && requirements[day.key][task.key]) || 0;
        td.appendChild(input);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.querySelector("tbody")?.remove();
    table.appendChild(tbody);
  }

  document.getElementById("save-requirements-btn").addEventListener("click", () => {
    const newReqs = {};
    DAYS.forEach((day) => {
      newReqs[day.key] = {};
      TASKS.forEach((task) => {
        const val = parseInt(document.getElementById(`req-${day.key}-${task.key}`).value, 10) || 0;
        if (val > 0) newReqs[day.key][task.key] = val;
      });
    });
    requirements = newReqs;
    saveRequirements(requirements);
    const msg = document.getElementById("requirements-saved-msg");
    msg.hidden = false;
    setTimeout(() => (msg.hidden = true), 2000);
  });

  document.getElementById("reset-requirements-btn").addEventListener("click", () => {
    if (!confirm("Bezetting terugzetten naar standaardwaarden?")) return;
    requirements = JSON.parse(JSON.stringify(DEFAULT_REQUIREMENTS));
    saveRequirements(requirements);
    renderRequirementsTable();
  });

  // ---------- Week helpers ----------

  function isoWeekStringFor(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }

  function computeWeekDates(weekValue) {
    const [yearStr, weekStr] = weekValue.split("-W");
    const year = parseInt(yearStr, 10);
    const week = parseInt(weekStr, 10);
    const simple = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = simple.getUTCDay() || 7;
    const monday = new Date(simple);
    monday.setUTCDate(simple.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
    return DAYS.map((d) => {
      const offset = d.jsDay === 0 ? 6 : d.jsDay - 1;
      const dt = new Date(monday);
      dt.setUTCDate(monday.getUTCDate() + offset);
      return Object.assign({}, d, { dateIso: dt.toISOString().slice(0, 10) });
    });
  }

  const weekPicker = document.getElementById("week-picker");
  weekPicker.value = isoWeekStringFor(new Date());

  // ---------- Schedule generation ----------

  function generateSchedule(weekDates, reqs) {
    const shiftCount = {};
    employees.forEach((e) => (shiftCount[e.id] = 0));
    const schedule = {};
    const warnings = [];

    weekDates.forEach((day) => {
      const dayReqs = reqs[day.key] || {};
      const assignedToday = new Set();
      schedule[day.key] = {};

      const taskEntries = Object.entries(dayReqs).filter(([, count]) => count > 0);

      const availablePool = (task) =>
        employees.filter(
          (e) =>
            e.taken.includes(task) &&
            e.vasteDagen.includes(day.key) &&
            !e.verlof.includes(day.dateIso)
        );

      // Meest schaarse taak (minste kandidaten t.o.v. behoefte) eerst toewijzen.
      taskEntries.sort((a, b) => {
        const scarcityA = availablePool(a[0]).length - a[1];
        const scarcityB = availablePool(b[0]).length - b[1];
        return scarcityA - scarcityB;
      });

      taskEntries.forEach(([task, count]) => {
        const candidates = availablePool(task)
          .filter((e) => !assignedToday.has(e.id))
          .sort((a, b) => shiftCount[a.id] - shiftCount[b.id] || a.naam.localeCompare(b.naam));
        const chosen = candidates.slice(0, count);
        chosen.forEach((e) => {
          assignedToday.add(e.id);
          shiftCount[e.id]++;
        });
        const ids = chosen.map((e) => e.id);
        while (ids.length < count) ids.push(null);
        schedule[day.key][task] = ids;
        if (chosen.length < count) {
          warnings.push(
            `${day.label} ${day.dateIso}: ${count - chosen.length} tekort voor ${taskLabel(task)}`
          );
        }
      });
    });

    return { schedule, warnings };
  }

  // ---------- Schedule rendering ----------

  function employeesForTask(task) {
    return employees.filter((e) => e.taken.includes(task)).sort((a, b) => a.naam.localeCompare(b.naam));
  }

  function renderScheduleTable() {
    const table = document.getElementById("schedule-table");
    const emptyMsg = document.getElementById("schedule-empty-msg");

    if (!currentScheduleData || !currentWeekDates) {
      table.innerHTML = "";
      emptyMsg.hidden = false;
      return;
    }
    emptyMsg.hidden = true;

    const { schedule, requirementsSnapshot } = currentScheduleData;
    const relevantTasks = TASKS.filter((task) =>
      currentWeekDates.some((day) => (requirementsSnapshot[day.key] || {})[task.key] > 0)
    );

    let html = "<thead><tr><th>Taak</th>";
    currentWeekDates.forEach((day) => {
      html += `<th>${day.label}<br><small>${day.dateIso}</small></th>`;
    });
    html += "</tr></thead><tbody>";

    relevantTasks.forEach((task) => {
      html += `<tr><td>${task.label}</td>`;
      currentWeekDates.forEach((day) => {
        const required = (requirementsSnapshot[day.key] || {})[task.key] || 0;
        if (required === 0) {
          html += "<td>—</td>";
          return;
        }
        const ids = schedule[day.key][task.key] || [];
        const hasEmpty = ids.some((id) => !id);
        html += `<td data-day="${day.key}" data-task="${task.key}" class="${hasEmpty ? "understaffed" : ""}">`;
        for (let i = 0; i < required; i++) {
          const currentId = ids[i] || "";
          html += `<select data-day="${day.key}" data-task="${task.key}" data-idx="${i}">`;
          html += `<option value="" class="slot-empty-option">— leeg —</option>`;
          employeesForTask(task.key).forEach((emp) => {
            const selected = emp.id === currentId ? "selected" : "";
            html += `<option value="${emp.id}" ${selected}>${emp.naam}</option>`;
          });
          html += `</select>`;
        }
        html += "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody>";
    table.innerHTML = html;

    table.querySelectorAll("select").forEach((select) => {
      applySelectWarningClass(select, day => day);
      select.addEventListener("change", onScheduleSelectChange);
    });
  }

  function applySelectWarningClass(select) {
    const day = select.dataset.day;
    const empId = select.value;
    select.classList.remove("not-fixed-day", "on-verlof");
    if (!empId) return;
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const dayInfo = currentWeekDates.find((d) => d.key === day);
    if (!emp.vasteDagen.includes(day)) select.classList.add("not-fixed-day");
    if (dayInfo && emp.verlof.includes(dayInfo.dateIso)) select.classList.add("on-verlof");
  }

  function onScheduleSelectChange(e) {
    const select = e.target;
    const { day, task, idx } = select.dataset;
    const ids = currentScheduleData.schedule[day][task];
    ids[Number(idx)] = select.value || null;
    saveSchedule(currentWeekValue, currentScheduleData);
    applySelectWarningClass(select);
    updateUnderstaffedHighlight();
    renderWarnings(computeWarningsFromCurrent());
  }

  function updateUnderstaffedHighlight() {
    document.querySelectorAll("#schedule-table td[data-day]").forEach((td) => {
      const day = td.dataset.day;
      const task = td.dataset.task;
      const ids = currentScheduleData.schedule[day][task] || [];
      td.classList.toggle("understaffed", ids.some((id) => !id));
    });
  }

  function computeWarningsFromCurrent() {
    const warnings = [];
    if (!currentScheduleData) return warnings;
    const { schedule, requirementsSnapshot } = currentScheduleData;
    currentWeekDates.forEach((day) => {
      const dayReqs = requirementsSnapshot[day.key] || {};
      Object.entries(dayReqs).forEach(([task, count]) => {
        if (count <= 0) return;
        const ids = schedule[day.key][task] || [];
        const filled = ids.filter((id) => id).length;
        if (filled < count) {
          warnings.push(`${day.label} ${day.dateIso}: ${count - filled} tekort voor ${taskLabel(task)}`);
        }
      });
    });
    return warnings;
  }

  function renderWarnings(warnings) {
    const box = document.getElementById("warnings-box");
    if (!warnings.length) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.innerHTML =
      "<strong>Let op, niet volledig bezet:</strong><ul>" +
      warnings.map((w) => `<li>${w}</li>`).join("") +
      "</ul>";
  }

  document.getElementById("generate-btn").addEventListener("click", () => {
    const weekValue = weekPicker.value || isoWeekStringFor(new Date());
    currentWeekValue = weekValue;
    currentWeekDates = computeWeekDates(weekValue);
    const requirementsSnapshot = JSON.parse(JSON.stringify(requirements));
    const { schedule, warnings } = generateSchedule(currentWeekDates, requirementsSnapshot);
    currentScheduleData = { schedule, requirementsSnapshot };
    saveSchedule(currentWeekValue, currentScheduleData);
    renderScheduleTable();
    renderWarnings(warnings);
  });

  // Load a previously saved schedule for the currently selected week, if any.
  function tryLoadExistingSchedule() {
    const weekValue = weekPicker.value || isoWeekStringFor(new Date());
    const saved = loadSchedule(weekValue);
    if (saved) {
      currentWeekValue = weekValue;
      currentWeekDates = computeWeekDates(weekValue);
      currentScheduleData = saved;
      renderScheduleTable();
      renderWarnings(computeWarningsFromCurrent());
    }
  }

  weekPicker.addEventListener("change", tryLoadExistingSchedule);

  // ---------- Init ----------

  renderEmployeeTable();
  renderRequirementsTable();
  renderVerlofList();
  tryLoadExistingSchedule();
})();
