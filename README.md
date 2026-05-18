# NTPC BESS Monitoring Portal

A world-class construction monitoring and project management platform for NTPC's Battery Energy Storage System (BESS) sites — starting with the Dadri L2 network. Tracks L2 site preparation, equipment ordering (BOI), clearances & compliances, safety, vendor issues, and delay analysis across all stations.

---

## Live App

**Published URL:** [https://bess-ntpc.lovable.app](https://bess-ntpc.lovable.app)

**Preview URL:** [https://id-preview--f346c879-78a6-41b1-bede-183a50dd5dd0.lovable.app](https://id-preview--f346c879-78a6-41b1-bede-183a50dd5dd0.lovable.app)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start v1 (React 19, Vite 7, SSR/SSG) |
| Styling | Tailwind CSS v4 with custom ops-control dark theme |
| UI Components | shadcn/ui |
| Backend / Auth | Lovable Cloud (managed PostgreSQL + auth) |
| Data Fetching | Supabase client + TanStack server functions |
| Charts | Custom SVG Gantt engine |
| Reports | `xlsx` + `jszip` for Excel / ZIP exports |

---

## User Roles & Access

| Role | Permissions |
|------|-------------|
| **Admin** (NTPC PMG) | Full CRUD, user management, audit trail, bulk exports, close delays |
| **Editor** (NTPC EIC / Coordinator / Vendor PM) | Update task status, BOI dates, raise issues, edit delay register, update compliances |
| **Viewer** (Top Management) | Read-only access to all dashboards, reports, and exports |

Authentication: email/password + Google OAuth. First user to sign up becomes Admin.

---

## Features

### 1. Home Dashboard (`/`)
- **Portfolio KPIs**: Total MWh under construction, overall weighted progress %, stations completed / in-progress / delayed.
- **Station Health Grid**: 15-station cards with real-time progress bars, delayed-task counters, and quick links.
- **Compliance Rollup**: "X of Y compliances cleared portfolio-wide" with expiry alerts.
- **Bulk MIS Export**: Multi-select stations + report types → single ZIP with per-station Excel files + a "Top Management Pack" consolidated workbook.
- **Today's Review Stations**: Strip pulled from the Weekly Planner.

### 2. Per-Station Detail (`/stations/:stationId`)
Six tabs for complete lifecycle tracking:

| Tab | Purpose |
|-----|---------|
| **L2 Gantt** | Full 127-task L2 schedule (WBS 1.1–1.20) with planned vs. actual timelines. Inline edit actual dates, % complete, owner, and remarks via a side drawer. |
| **BOI Status** | 31 equipment items (Power Transformer → MISC-CIVIL) tracking: scheduled PO date, actual PO date, sub-vendor category & details, inspection category, delivery / site receipt / mobilization status. |
| **Compliances** | Statutory, Safety, Quality, Insurance, and Local compliances. Tracks application date, approval/expiry, status, document ref, owner, and remarks. Auto-flags expiring within 30 days. |
| **Delay Register** | Auto-populated from slipped Gantt tasks. Root cause analysis: reason category, responsibility, corrective action, recovery plan, recovery date. Vendor can update; Admin can close. |
| **Issues** | Vendor / safety issue log with title, description, priority, target date, status, and assigned owner. |
| **Audit Trail** | Field-level edit history for task status, BOI, compliances, issues, and delays. Filterable by user, entity, and date range. |

### 3. Weekly Review Planner (`/weekly-planner`)
- Calendar grid (Monday–Sunday) for any selected week.
- Assign up to 3 stations per day (covers the "3 stations/day" review rule).
- Auto-pulls latest progress %, open exceptions, and top 3 delayed tasks for the daily agenda.
- **Generate Agenda** per day and **Export Weekly Plan** as Excel.

### 4. Notifications
- Bell icon in the app header with unread count.
- Alerts generated client-side for:
  - L2 tasks due within 7 days (not started)
  - BOI POs due within 7 days (no actual date)
  - Open issues with target date within 3 days
  - Delay register recovery dates within 3 days
  - Compliances expiring within 30 days
- Click any notification to deep-link to the relevant station/tab.

### 5. MIS & Reports
- **Weekly MIS**: Per-station L2 task detail + summary sheet.
- **Exception Report**: All delayed/blocked tasks across stations.
- **Station Export**: Full L2 schedule for a single station.
- **Bulk Export**: ZIP bundle of any combination of stations and report types.
- **Top Management Pack**: Consolidated executive workbook with summary, all station health, top 20 delays, and top 10 risks.

---

## Database Schema

### Core Tables
| Table | Description |
|-------|-------------|
| `stations` | 15 NTPC BESS stations (name, lot, capacity, agency, EIC) |
| `l2_tasks` | 127-task master template (WBS, baseline dates, durations, predecessors) |
| `station_task_status` | Per-station actual dates, % complete, status, owner, remarks |
| `user_roles` | Role assignments (admin / editor / viewer) per user |

### Phase 2 Tables
| Table | Description |
|-------|-------------|
| `boi_master` | 31 equipment items shared template |
| `station_boi_status` | Per-station BOI ordering & delivery tracking |
| `compliance_master` | ~25 compliance categories shared template |
| `station_compliance` | Per-station compliance application & expiry tracking |
| `delay_register` | Root-cause delay analysis with recovery plans |
| `issues` | Vendor / safety issue log |
| `weekly_review_plan` | Calendar assignments for weekly reviews |
| `audit_log` | Field-level change history (auto-written by triggers) |
| `notification_dismissals` | Per-user notification dismiss tracking |

---

## Project Structure

```
src/
├── components/           # Reusable UI components
│   ├── AppHeader.tsx       # Top nav + notification bell
│   ├── GanttChart.tsx      # Custom SVG Gantt engine
│   ├── StatusBadge.tsx     # Status chips
│   ├── BoiStatusTab.tsx    # BOI ordering tab
│   ├── ComplianceTab.tsx   # Compliances tab
│   ├── DelayRegisterTab.tsx # Delay analysis tab
│   ├── AuditTrailTab.tsx   # Audit trail tab
│   └── NotificationBell.tsx # Notification dropdown
├── lib/                  # Business logic & utilities
│   ├── auth-context.tsx    # Auth provider & role management
│   ├── gantt-utils.ts      # Progress calculations, status logic
│   ├── mis-export.ts       # Excel report generators
│   ├── bulk-export.ts      # ZIP bundle generator
│   └── notifications.ts    # Client-side notification engine
├── routes/               # TanStack file-based routes
│   ├── login.tsx           # Auth entry
│   ├── _authenticated.tsx  # Protected layout
│   ├── _authenticated.index.tsx         # Home dashboard
│   ├── _authenticated.stations.$stationId.tsx  # Station detail
│   └── _authenticated.weekly-planner.tsx # Weekly planner
├── integrations/supabase/ # Auto-generated Supabase clients
│   ├── client.ts           # Browser client
│   ├── client.server.ts  # Admin/service client
│   ├── auth-middleware.ts # Auth middleware for server fns
│   └── types.ts           # Generated DB types
└── styles.css              # Theme tokens (dark navy ops-control)
```

---

## Getting Started

1. **Install dependencies**
   ```bash
   bun install
   ```

2. **Run the dev server**
   ```bash
   bun run dev
   ```

3. **First-time setup**
   - Open `/login` and create the first account (auto-promoted to Admin).
   - Invite team members via the auth system.
   - Assign roles (editor / viewer) via the user_roles table.

4. **Data seeding**
   - L2 tasks, BOI master list, and compliance master list are pre-seeded via migrations.
   - Navigate to each station and enter actual dates to begin tracking.

---

## Environment Variables

The following are automatically configured by Lovable Cloud:

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public anon key (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin key (bypasses RLS) |

---

## Security

- **Row Level Security (RLS)** enabled on all data tables.
- **Audit triggers** auto-log every INSERT/UPDATE/DELETE on core tables.
- **Role-based access**: Admin > Editor > Viewer.
- Service role key (`client.server.ts`) is server-only and never exposed to the browser.

---

## License

Proprietary — NTPC Limited.
