import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Seeding sanapp_app1_db …");

  // Local users keyed by SSO username. The ssoUserId placeholder is replaced
  // with the real SSO subject on the user's first login.
  const users = [
    { ssoUserId: "seed:sanyasi", username: "sanyasi", name: "Sanyasi Naidu", email: "sanyasi.naidu@iipe.ac.in", role: "ADMIN" as const },
    { ssoUserId: "seed:lakshmi", username: "lakshmi", name: "Lakshmi Devi", email: "lakshmi@iipe.ac.in", role: "STUDENT" as const },
    { ssoUserId: "seed:admin", username: "admin", name: "System Administrator", email: "admin@iipe.ac.in", role: "ADMIN" as const },
    { ssoUserId: "seed:ramesh", username: "ramesh", name: "Ramesh Kumar", email: "ramesh.kumar@iipe.ac.in", role: "FACULTY" as const },
    { ssoUserId: "seed:geeta", username: "geeta", name: "Geeta Sharma", email: "geeta.sharma@iipe.ac.in", role: "STAFF" as const },
    { ssoUserId: "seed:venkat", username: "venkat", name: "Venkat Reddy", email: "venkat.reddy@iipe.ac.in", role: "STUDENT" as const },
  ];

  for (const u of users) {
    await prisma.appUser.upsert({
      where: { username: u.username },
      update: { ...u },
      create: { ...u },
    });
  }

  const sanyasi = await prisma.appUser.findUnique({ where: { username: "sanyasi" } });
  if (sanyasi) {
    const existing = await prisma.notice.count();
    if (existing === 0) {
      await prisma.notice.createMany({
        data: [
          {
            title: "Welcome to the Academic ERP prototype",
            body: "This application is fully independent: its own PostgreSQL database (sanapp_app1_db), its own roles (Admin / Faculty / Staff / Student / Viewer) and its own business logic. Sign-in is handled by the central SSO and application access by IIPE Main.",
            authorId: sanyasi.id,
          },
          {
            title: "Role-based publishing",
            body: "Admin, Faculty and Staff can publish notices. Students and Viewers can read them. Only Admins can delete.",
            authorId: sanyasi.id,
          },
        ],
      });
    }
  }

  console.log("sanapp_app1_db seeded: 6 local users with roles, demo notices");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
