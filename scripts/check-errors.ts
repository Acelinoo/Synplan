async function check() {
  const baseUrl = "http://127.0.0.1:3000";
  const cookie = "synplan_session_token=seed_dev_session_token_acelino_2026";
  const wsId = "cmu4xlv190007vte4n5vbsxzs";

  const res1 = await fetch(baseUrl + "/api/auth/session", {
    headers: { cookie },
  });
  console.log("SESSION STATUS:", res1.status);
  console.log("SESSION BODY:", (await res1.text()).substring(0, 300));

  const res2 = await fetch(
    `${baseUrl}/api/tasks?workspaceId=${wsId}&view=board`,
    {
      headers: { cookie, "x-synplan-workspace-id": wsId },
    }
  );
  console.log("TASKS STATUS:", res2.status);
  console.log("TASKS BODY:", (await res2.text()).substring(0, 300));
}

check().catch(console.error);
