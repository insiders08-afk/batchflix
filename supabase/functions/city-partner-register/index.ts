import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { fullName, email, password, phone, position, city, facial_image_url } =
      await req.json();

    // Validate required fields
    if (!fullName || !email || !password || !phone || !position || !city) {
      return new Response(
        JSON.stringify({ error: "All fields are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Check if city already has a super_admin
    const { data: existingCity } = await supabase
      .from("user_roles")
      .select("id")
      .eq("role", "super_admin")
      .eq("city", city)
      .limit(1);

    if (existingCity && existingCity.length > 0) {
      return new Response(
        JSON.stringify({ error: "This city already has a City Partner assigned." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Create auth user (email auto-confirmed via admin API)
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

    if (authError) {
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user.id;

    // 3. Create profile (pending status)
    const { error: profError } = await supabase.from("profiles").insert({
      user_id: userId,
      full_name: fullName,
      email,
      phone,
      role: "super_admin",
      status: "pending",
    });

    if (profError) {
      // Rollback: delete the auth user
      await supabase.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: "Failed to create profile: " + profError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Create application record
    const { error: appError } = await supabase
      .from("super_admin_applications")
      .insert({
        full_name: fullName,
        email,
        phone,
        city,
        position,
        facial_image_url: facial_image_url || null,
        status: "pending",
      });

    if (appError) {
      // Rollback: delete profile and auth user
      await supabase.from("profiles").delete().eq("user_id", userId);
      await supabase.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: "Failed to create application: " + appError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
