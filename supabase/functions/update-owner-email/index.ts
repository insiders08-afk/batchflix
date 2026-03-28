import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const userId = "c08aba74-7589-44d6-9212-9bc05581453e";
  const newEmail = "kjais1104@gmail.com";

  // Update auth.users email
  const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
    email: newEmail,
    email_confirm: true,
  });

  if (authError) return new Response(JSON.stringify({ error: authError.message }), { status: 500 });

  // Update profiles email
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ email: newEmail })
    .eq("user_id", userId);

  if (profileError) return new Response(JSON.stringify({ error: profileError.message }), { status: 500 });

  return new Response(JSON.stringify({ success: true, email: newEmail }));
});
