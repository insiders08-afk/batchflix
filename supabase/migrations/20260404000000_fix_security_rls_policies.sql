-- ============================================================
-- SECURITY & DATA INTEGRITY FIX: RLS policies, Storage, and Unique Constraints
-- ============================================================

-- 1. super_admin_applications: PII & Spam Protection
-- SELECT restricted to app_owner only. INSERT restricted to own authenticated email.
DROP POLICY IF EXISTS "Admins can look up city partner contact" ON public.super_admin_applications;
DROP POLICY IF EXISTS "App owner can read super admin applications" ON public.super_admin_applications;
CREATE POLICY "App owner can read super admin applications"
  ON public.super_admin_applications FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'app_owner'::app_role));

DROP POLICY IF EXISTS "Anyone can submit a super admin application" ON public.super_admin_applications;
DROP POLICY IF EXISTS "Authenticated users can submit application" ON public.super_admin_applications;
CREATE POLICY "Authenticated users can submit application"
  ON public.super_admin_applications FOR INSERT TO authenticated
  WITH CHECK (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

ALTER TABLE public.super_admin_applications DROP CONSTRAINT IF EXISTS super_admin_applications_email_key;
ALTER TABLE public.super_admin_applications ADD CONSTRAINT super_admin_applications_email_key UNIQUE (email);


-- 2. profiles: Ensuring user_id mapping integrity
DROP POLICY IF EXISTS "Anyone can insert profile during signup" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_key;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


-- 3. pending_requests: Fixing the role change bug
-- Problem: Subquery bug (id = id) rendered Guards meaningless.
-- Fix: Using proper alias scoping for immutability check.
DROP POLICY IF EXISTS "Users can update own pending request" ON public.pending_requests;
CREATE POLICY "Users can update own pending request"
  ON public.pending_requests FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending'::user_status)
  WITH CHECK (
    user_id = auth.uid() AND status = 'pending'::user_status
    AND role = (SELECT p.role FROM public.pending_requests p WHERE p.id = pending_requests.id)
    AND institute_code = (SELECT p.institute_code FROM public.pending_requests p WHERE p.id = pending_requests.id)
  );

-- Enforce one active pending request for same role/institute
DROP INDEX IF EXISTS pending_requests_pending_once_idx;
CREATE UNIQUE INDEX pending_requests_pending_once_idx 
  ON public.pending_requests (user_id, role, institute_code) 
  WHERE status = 'pending'::user_status;


-- 4. institutes: Global uniqueness
ALTER TABLE public.institutes DROP CONSTRAINT IF EXISTS institutes_institute_code_key;
ALTER TABLE public.institutes ADD CONSTRAINT institutes_institute_code_key UNIQUE (institute_code);


-- 5. Storage Buckets: Privacy & Scoping
-- All buckets set to PRIVATE.
UPDATE storage.buckets SET public = false WHERE id IN ('applicant-photos', 'homework-files', 'chat-files');

-- applicant-photos: only app_owner or applicant
DROP POLICY IF EXISTS "App owner and applicant can read photos" ON storage.objects;
CREATE POLICY "App owner and applicant can read photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'applicant-photos' 
    AND (
      has_role(auth.uid(), 'app_owner'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.super_admin_applications 
        WHERE facial_image_url LIKE '%' || name 
        AND email = (SELECT email FROM auth.users WHERE id = auth.uid())
      )
    )
  );

-- homework-files: only institute members
DROP POLICY IF EXISTS "Institute members can read homework files" ON storage.objects;
CREATE POLICY "Institute members can read homework files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'homework-files'
    AND EXISTS (
      SELECT 1 FROM public.homeworks h
      WHERE h.file_url LIKE '%' || name
      AND h.institute_code = get_my_institute_code()
    )
  );

-- chat-files: only batch members
DROP POLICY IF EXISTS "Batch members can read chat files" ON storage.objects;
CREATE POLICY "Batch members can read chat files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-files'
    AND EXISTS (
      SELECT 1 FROM public.batch_messages m
      WHERE m.file_url LIKE '%' || name
      AND m.institute_code = get_my_institute_code()
    )
  );
