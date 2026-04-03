
-- Add enrollment control columns to institutes
ALTER TABLE public.institutes 
  ADD COLUMN IF NOT EXISTS student_enrollment_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS teacher_enrollment_enabled boolean NOT NULL DEFAULT true;

-- Add enrollment_open column to batches
ALTER TABLE public.batches 
  ADD COLUMN IF NOT EXISTS enrollment_open boolean NOT NULL DEFAULT true;

-- Create a helper function to check institute enrollment flags
CREATE OR REPLACE FUNCTION public.check_institute_enrollment(
  _institute_code text,
  _role text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN _role = 'student' THEN COALESCE(student_enrollment_enabled, true)
    WHEN _role = 'teacher' THEN COALESCE(teacher_enrollment_enabled, true)
    ELSE true
  END
  FROM public.institutes
  WHERE institute_code = _institute_code
  LIMIT 1;
$$;

-- Create a helper function to check batch enrollment
CREATE OR REPLACE FUNCTION public.check_batch_enrollment_open(_batch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(enrollment_open, true)
  FROM public.batches
  WHERE id = _batch_id
  LIMIT 1;
$$;

-- Update batch_applications INSERT policy to also check batch enrollment_open
DROP POLICY IF EXISTS "Students can apply to batches" ON public.batch_applications;
CREATE POLICY "Students can apply to batches" ON public.batch_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid() 
    AND institute_code = get_my_institute_code()
    AND check_batch_enrollment_open(batch_id)
  );

-- Update pending_requests INSERT policy to check enrollment flags
DROP POLICY IF EXISTS "Users can insert own pending request" ON public.pending_requests;
CREATE POLICY "Users can insert own pending request" ON public.pending_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND check_institute_enrollment(institute_code, role::text)
  );
