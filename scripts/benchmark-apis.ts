async function benchmark() {
  const baseUrl = "http://127.0.0.1:3000";
  const cookie = "synplan_session_token=seed_dev_session_token_acelino_2026";
  const wsId = "cmu4xlv190007vte4n5vbsxzs";

  const endpoints = [
    { name: "GET /api/auth/session", url: "/api/auth/session" },
    { name: "GET /api/dashboard/summary", url: `/api/dashboard/summary?workspaceId=${wsId}` },
    { name: "GET /api/projects", url: `/api/projects?workspaceId=${wsId}` },
    { name: "GET /api/tasks?view=board", url: `/api/tasks?workspaceId=${wsId}&view=board` },
    { name: "GET /api/activity", url: `/api/activity?workspaceId=${wsId}` },
    { name: "GET /api/team/members", url: `/api/team/members?workspaceId=${wsId}` },
    { name: "GET /api/notifications", url: "/api/notifications" },
  ];

  console.log("=== API Latency & Payload Benchmark ===");
  let totalTime = 0;
  for (const ep of endpoints) {
    const start = performance.now();
    const res = await fetch(baseUrl + ep.url, {
      headers: { cookie, "x-synplan-workspace-id": wsId },
    });
    const duration = performance.now() - start;
    totalTime += duration;
    const text = await res.text();
    const bytes = new TextEncoder().encode(text).length;
    console.log(
      ep.name.padEnd(32),
      `${duration.toFixed(1)}ms`.padStart(8),
      `(${bytes} bytes)`.padStart(14),
      `Status: ${res.status}`
    );
  }
  console.log("---------------------------------------");
  console.log(`Total Sequential Latency: ${totalTime.toFixed(1)}ms`);
}

benchmark().catch((e) => {
  console.error(e);
  process.exit(1);
});
