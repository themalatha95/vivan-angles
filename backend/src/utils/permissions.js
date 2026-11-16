// ONE place that defines what each role may do. Enforced on the backend by middleware/can.js.
// Levels: 0 = no access, 1 = view, 2 = manage, 3 = full
const MATRIX = {
  owner:      { agents: 3, caretakers: 3, leads: 3, jobs: 3, attendance: 3, salary: 3, commission: 3, expenses: 3, payments: 3, users: 3, settings: 3, reports: 3 },
  manager:    { agents: 2, caretakers: 2, leads: 2, jobs: 2, attendance: 2, salary: 2, commission: 2, expenses: 1, payments: 1, users: 0, settings: 0, reports: 2 },
  telecaller: { agents: 1, caretakers: 1, leads: 2, jobs: 0, attendance: 0, salary: 0, commission: 0, expenses: 0, payments: 0, users: 0, settings: 0, reports: 1 },
  accountant: { agents: 1, caretakers: 1, leads: 1, jobs: 0, attendance: 1, salary: 2, commission: 2, expenses: 2, payments: 2, users: 0, settings: 0, reports: 2 },
  // Agent and caretaker access is also limited to their OWN records inside each route
  agent:      { agents: 0, caretakers: 2, leads: 2, jobs: 1, attendance: 0, salary: 0, commission: 1, expenses: 0, payments: 0, users: 0, settings: 0, reports: 0 },
  caretaker:  { agents: 0, caretakers: 0, leads: 0, jobs: 1, attendance: 0, salary: 0, commission: 0, expenses: 0, payments: 0, users: 0, settings: 0, reports: 0 },
};
module.exports = { MATRIX };
