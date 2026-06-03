import { supabase } from "../lib/supabase";

const APP_ID = "main";

export async function loadCloudState() {
  const { data, error } = await supabase
    .from("app_state")
    .select("data")
    .eq("id", APP_ID)
    .single();

  if (error) {
    throw error;
  }

  return data?.data || {};
}

export async function saveCloudState(state) {
  const { error } = await supabase
    .from("app_state")
    .upsert({
      id: APP_ID,
      data: state,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    throw error;
  }
}