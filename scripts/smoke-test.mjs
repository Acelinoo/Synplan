import http from "http";

const routes = [
  "/",
  "/projects",
  "/tasks",
  "/team",
  "/calendar",
  "/reports",
  "/settings",
  "/api/workspaces",
  "/api/dashboard/summary",
  "/api/projects",
  "/api/tasks",
  "/api/team/members",
  "/api/calendar/events",
  "/api/analytics/reports",
  "/api/analytics/pulse",
];

const PORT = process.env.PORT || 3005;

async function checkRoute(route) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${PORT}${route}`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({ route, status: res.statusCode, length: data.length });
      });
    });

    req.on("error", (err) => {
      resolve({ route, status: "ERROR", error: err.message });
    });
  });
}

async function runSmokeTest() {
  console.log("=== RUNNING SYNPLAN ROUTE SMOKE TEST ===");
  const results = [];
  for (const route of routes) {
    const res = await checkRoute(route);
    results.push(res);
    const pass = res.status === 200 ? "PASS" : "FAIL";
    console.log(`[${pass}] ${route.padEnd(28)} -> Status: ${res.status} (Body: ${res.length || 0} bytes)`);
  }

  const failed = results.filter((r) => r.status !== 200);
  console.log("\n========================================");
  if (failed.length === 0) {
    console.log("ALL ROUTES RETURNED HTTP 200 OK! (100% HEALTHY)");
  } else {
    console.log(`FAILED ROUTES COUNT: ${failed.length}`);
  }
  console.log("========================================");
}

runSmokeTest();
