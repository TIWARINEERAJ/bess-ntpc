
-- BOI master + per-station status
CREATE TABLE public.boi_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sl_no INT NOT NULL,
  name TEXT NOT NULL,
  drawings_count INT,
  scheduled_po_date DATE,
  inspection_category TEXT,
  sort_order INT NOT NULL DEFAULT 0
);
ALTER TABLE public.boi_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read boi master" ON public.boi_master FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write boi master" ON public.boi_master FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.station_boi_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL,
  boi_id UUID NOT NULL,
  actual_po_date DATE,
  sub_vendor_category TEXT,
  sub_vendor_details TEXT,
  delivery_date DATE,
  site_receipt_date DATE,
  mobilization_status TEXT,
  remarks TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(station_id, boi_id)
);
ALTER TABLE public.station_boi_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read boi status" ON public.station_boi_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write boi status" ON public.station_boi_status FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'editor'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'editor'));

-- Weekly review planner
CREATE TABLE public.weekly_review_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start_date DATE NOT NULL,
  day_of_week INT NOT NULL,
  slot INT NOT NULL,
  station_id UUID NOT NULL,
  agenda_notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(week_start_date, day_of_week, slot)
);
ALTER TABLE public.weekly_review_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read plan" ON public.weekly_review_plan FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write plan" ON public.weekly_review_plan FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'editor'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'editor'));

-- Delay register
CREATE TABLE public.delay_register (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL,
  task_id UUID,
  title TEXT NOT NULL,
  reason_category TEXT,
  root_cause TEXT,
  responsibility TEXT,
  corrective_action TEXT,
  recovery_plan TEXT,
  recovery_date DATE,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
ALTER TABLE public.delay_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read delay" ON public.delay_register FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write delay" ON public.delay_register FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'editor'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'editor'));

-- Audit log
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_email TEXT,
  station_id UUID,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read audit" ON public.audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "system insert audit" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- Notification dismissals
CREATE TABLE public.notification_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  notification_key TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, notification_key)
);
ALTER TABLE public.notification_dismissals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own dismissals" ON public.notification_dismissals FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Compliance master + per-station status
CREATE TABLE public.compliance_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  authority TEXT,
  sort_order INT NOT NULL DEFAULT 0
);
ALTER TABLE public.compliance_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read compliance master" ON public.compliance_master FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write compliance master" ON public.compliance_master FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.station_compliance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL,
  compliance_id UUID NOT NULL,
  application_date DATE,
  approval_date DATE,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'not_applied',
  document_ref TEXT,
  owner TEXT,
  remarks TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(station_id, compliance_id)
);
ALTER TABLE public.station_compliance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read station compliance" ON public.station_compliance FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor write station compliance" ON public.station_compliance FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'editor'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'editor'));

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT;
  v_station UUID;
BEGIN
  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  EXCEPTION WHEN OTHERS THEN v_email := NULL; END;
  v_station := COALESCE(NEW.station_id, OLD.station_id);
  INSERT INTO public.audit_log(user_id, user_email, station_id, entity_type, entity_id, field, old_value, new_value, action)
  VALUES (
    auth.uid(), v_email, v_station, TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id), NULL,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD)::text END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW)::text END,
    TG_OP
  );
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER audit_task_status AFTER INSERT OR UPDATE OR DELETE ON public.station_task_status
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_issues AFTER INSERT OR UPDATE OR DELETE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_delay AFTER INSERT OR UPDATE OR DELETE ON public.delay_register
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_boi AFTER INSERT OR UPDATE OR DELETE ON public.station_boi_status
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_compliance AFTER INSERT OR UPDATE OR DELETE ON public.station_compliance
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- Seed BOI master (Simhadri 31-row sheet)
INSERT INTO public.boi_master (sl_no, name, drawings_count, scheduled_po_date, inspection_category, sort_order) VALUES
(1,'Power Transformer',5,'2026-05-03','I',1),
(2,'CRP Panel',NULL,'2026-05-14',NULL,2),
(3,'400 KV Circuit Breakers',NULL,'2026-05-03',NULL,3),
(4,'Battery, Container',39,'2026-06-20','I',4),
(5,'PCS',NULL,'2026-06-13',NULL,5),
(6,'Transformers (PCS duty and Auxiliary)',NULL,'2026-06-20',NULL,6),
(7,'EMS system',NULL,'2026-06-06',NULL,7),
(8,'HT Panel',NULL,'2026-05-19',NULL,8),
(9,'HT Cable',NULL,'2026-06-13',NULL,9),
(10,'DC Cables',NULL,'2026-06-04',NULL,10),
(11,'Control & Communication Cables',NULL,'2026-06-06',NULL,11),
(12,'SCADA and PPC system',NULL,'2026-06-27',NULL,12),
(13,'Earthing and Lighting system',NULL,'2026-06-09',NULL,13),
(14,'IDT',4,'2026-05-30','I',14),
(15,'AC CABLE',8,'2026-06-15','I',15),
(16,'NUMERICAL RELAY',2,'2026-06-20','I',16),
(17,'SAS',1,'2026-05-30','I',17),
(18,'MV SWITCHGEAR',3,'2026-05-30','I',18),
(19,'Switchyard',36,'2026-06-20','I',19),
(20,'UPS',1,'2026-06-28','I&III',20),
(21,'DC CABLE',3,'2026-06-04','I',21),
(22,'Misc Electrical Items',14,'2026-06-28','II',22),
(23,'LT SWITCHGEAR',1,'2026-05-30','I',23),
(24,'ENERGY METERING SYSTEM',3,'2026-06-28','II',24),
(25,'Fire Protection',16,'2026-06-20','II',25),
(26,'HVAC',1,'2026-06-20','II&III',26),
(27,'OFC CABLE',2,'2026-06-24','II&III',27),
(28,'CCTV',2,'2026-06-28','II',28),
(29,'SPBD',1,'2026-05-30','I',29),
(30,'LT BUSDUCT',1,'2026-05-30','I',30),
(31,'MISC-CIVIL',3,'2026-06-28','II&III',31);

-- Seed compliance master
INSERT INTO public.compliance_master (category, name, authority, sort_order) VALUES
('Statutory','MoEF EC Approval','MoEF&CC',1),
('Statutory','CEA Approval','CEA',2),
('Statutory','Consent to Establish (CTE)','State PCB',3),
('Statutory','Consent to Operate (CTO)','State PCB',4),
('Statutory','Forest Clearance','MoEF&CC',5),
('Statutory','Land NOC','State Govt',6),
('Statutory','Water Allocation NOC','State Irrigation',7),
('Statutory','Grid Connectivity Approval','CTUIL',8),
('Safety','HIRA Submission','NTPC Safety',9),
('Safety','JSA Approval','NTPC Safety',10),
('Safety','Permit-to-Work System','Site EIC',11),
('Safety','Safety Audit Compliance','External Auditor',12),
('Safety','PPE Compliance Report','Site Safety',13),
('Quality','Quality Assurance Plan (QAP)','NTPC CQA',14),
('Quality','Field Quality Plan (FQP)','NTPC CQA',15),
('Quality','Manufacturing Quality Plan (MQP)','NTPC CQA',16),
('Quality','Type Test Certificates','CPRI/ERDA',17),
('Insurance','CAR Policy','Insurer',18),
('Insurance','Workmen Compensation','Insurer',19),
('Insurance','Third Party Liability','Insurer',20),
('Local','Fire NOC','State Fire Dept',21),
('Local','Local PCB NOC','State PCB',22),
('Local','Labour License','Labour Dept',23),
('Local','Building Plan Approval','Local Authority',24),
('Local','Electrical Inspectorate Approval','CEIG',25);
