const SUPABASE_URL = "https://zeidlliiqtpsenlkhkzv.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function testRest() {
  console.log("Testing Supabase REST endpoint...");
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    console.log("REST status:", res.status);
    const data = await res.text();
    console.log("REST response preview:", data.slice(0, 200));
  } catch (err) {
    console.error("REST test failed:", err);
  }
}

testRest();
