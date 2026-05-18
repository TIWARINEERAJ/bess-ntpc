
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'editor', 'viewer');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated_user()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() IS NOT NULL $$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Stations
CREATE TABLE public.stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  lot TEXT NOT NULL,
  capacity_mwh NUMERIC NOT NULL,
  capacity_mw NUMERIC,
  poi TEXT,
  agency TEXT,
  agency_contacts JSONB DEFAULT '[]'::jsonb,
  ntpc_eic TEXT,
  eic_contact TEXT,
  eic_email TEXT,
  pm_coordinator TEXT,
  engg_taskforce TEXT,
  project_start_date DATE DEFAULT '2026-03-30',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read stations" ON public.stations FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write stations" ON public.stations FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- L2 tasks (shared template)
CREATE TABLE public.l2_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wbs_code TEXT NOT NULL UNIQUE,
  parent_wbs TEXT,
  name TEXT NOT NULL,
  is_section BOOLEAN NOT NULL DEFAULT false,
  duration_days INT NOT NULL DEFAULT 0,
  baseline_start DATE,
  baseline_finish DATE,
  predecessors TEXT,
  sort_order INT NOT NULL DEFAULT 0
);
ALTER TABLE public.l2_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read tasks" ON public.l2_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write tasks" ON public.l2_tasks FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Station task status
CREATE TABLE public.station_task_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.l2_tasks(id) ON DELETE CASCADE,
  actual_start DATE,
  actual_finish DATE,
  percent_complete INT NOT NULL DEFAULT 0 CHECK (percent_complete BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'not_started',
  remarks TEXT,
  owner TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (station_id, task_id)
);
ALTER TABLE public.station_task_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read status" ON public.station_task_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write status" ON public.station_task_status FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'editor')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'editor'));

CREATE INDEX idx_status_station ON public.station_task_status(station_id);
CREATE INDEX idx_status_task ON public.station_task_status(task_id);

-- Issues
CREATE TABLE public.issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  owner TEXT,
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'open',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read issues" ON public.issues FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write issues" ON public.issues FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'editor')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'editor'));

-- Auto-grant first user admin role on signup; everyone else gets viewer
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count INT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'editor');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
