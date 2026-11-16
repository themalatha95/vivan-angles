# Vivan Angels: Care, Connect, Earn  (v2: staff roles and permissions)

Folders: database/  backend/  frontend/

## Upgrade an existing v1 setup (what you already have running)
1. Stop both servers (Ctrl+C).
2. Extract this zip over your project (Extract All to D:\ and choose "Replace files"). Your backend\.env is not touched.
3. Run the migrations ONCE (from D:\vivan-angels):
     mysql -u root -p -e "source database/migration_v2.sql"
     mysql -u root -p -e "source database/migration_v3_caretaker_profiles.sql"
     mysql -u root -p -e "source database/migration_v4_functional_requirements.sql"
     mysql -u root -p -e "source database/migration_v5_customer_payment_date.sql"
     mysql -u root -p -e "source database/migration_v6_multi_agent_leads.sql"
4. Backend (D:\vivan-angels\backend):
     npm install
     npm run seed
     npm run seed:demo   # optional: complete lead/job/payment/salary test flow
     npm run seed:roles  # optional: add two telecallers, two agents and their customer flows
     npm run dev
5. Frontend (D:\vivan-angels\frontend), second terminal:
     npm install
     npm run dev
6. Open http://localhost:5173 . Log out and log in again if the old session is still open.
7. Test everything: in a third terminal, inside backend: npm run test:flow

## Fresh install
schema.sql, then migration_v2.sql, migration_v3_caretaker_profiles.sql, migration_v4_functional_requirements.sql and migration_v5_customer_payment_date.sql, then follow steps 4 to 7.

## Roles and demo logins (login ID or phone / password)
Owner       owner@vivanangels.com      9999900000 / admin123
Manager     manager01@vivanangels.com  9999900001 / staff1234
Telecaller  caller01@vivanangels.com   9999900002 / staff1234
Accountant  accounts01@vivanangels.com 9999900003 / staff1234
Agent       agent001@vivanangels.com   9876500001 / agent123
Caretaker   created when Owner/Manager approves a caretaker (temporary password shown once)

## Permissions (single source of truth: backend/src/utils/permissions.js)
Module        Owner  Manager  Telecaller  Accountant
Agents        Full   Manage   View        View
Caretakers    Full   Manage   View        View
Leads         Full   Manage   Manage*     View        (*only leads assigned to them)
Job alloc.    Full   Manage   No          No
Attendance    Full   Manage   No          View
Salary        Full   View     No          Manage
Commission    Full   View     No          Manage
Expenses      Full   View     No          Manage
Payments      Full   View     No          Manage
Reports       All    Ops      Calls       Finance
Users         Full   No       No          No
Audit log     Full   No       No          No
Agents see only their own leads, caretakers and commission. Caretakers see only their own jobs and salary.

## Rules enforced
- Permissions are checked on the backend for every request; the menu only hides what you cannot open.
- Every write request is saved to the audit log (who, what, when, IP, result). Logins go to login history.
- Financial and audit records cannot be deleted: there is no delete API, and database triggers block it too.
- Company margin is visible to the Owner only; salary is hidden from agents; commission hidden from telecallers.
- Owner account must use two-factor authentication (authenticator app). Any user may enable it.
- 5 wrong passwords lock an account for 15 minutes. Deactivated users are locked out immediately.
- Customer amount = caretaker salary + agent commission + company margin (four separate fields).
- A lead without an agent (created by a telecaller) produces no commission.

## Caretaker profile and document management

The v3/v4 migrations add VA-CT caretaker IDs, profile fields, a four-document verification checklist with expiry dates, job history, change requests, profile downloads, PDF document generation, multi-service caretakers, salary approvals and payment tracking. PAN Card, Address Proof and Medical Fitness Certificate are no longer shown in caretaker workflows. Experience / Training Certificate remains available as an optional document. Job allocation requires all four required documents to be approved.
