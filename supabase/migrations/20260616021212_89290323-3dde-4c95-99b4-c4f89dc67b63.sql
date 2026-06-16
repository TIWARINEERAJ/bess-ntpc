UPDATE public.station_drawings
SET category = 'Provenness/Sub-Vendor Approval'
WHERE category IN ('Sub Vendor approval', 'Sub Vendor Approval', 'Sub-vendor Approval', 'Sub-Vendor Approval', 'Provenness');

UPDATE public.station_drawings
SET category = 'Procedure/Manuals/Studies'
WHERE category = 'Procedure,Manuals,Studies';