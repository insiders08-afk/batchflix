
-- Fix: Replace RLS policies on super_admin_applications that reference auth.users
-- (which causes "permission denied for table users" errors)
-- Instead, use auth.jwt() to get the email from the JWT token

-- Drop the problematic policies
DROP POLICY IF EXISTS "Applicant can view own application" ON public.super_admin_applications;
DROP POLICY IF EXISTS "Authenticated users can submit application" ON public.super_admin_applications;

-- Recreate using auth.jwt() instead of auth.users
CREATE POLICY "Applicant can view own application"
ON public.super_admin_applications
FOR SELECT
TO authenticated
USING (email = (auth.jwt() ->> 'email'));

CREATE POLICY "Authenticated users can submit application"
ON public.super_admin_applications
FOR INSERT
TO authenticated
WITH CHECK (email = (auth.jwt() ->> 'email'));
